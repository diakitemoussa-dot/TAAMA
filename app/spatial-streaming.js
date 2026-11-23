/* ==========================================================
   STREAMING SPATIAL DES TUILES DE LA MAQUETTE
   ----------------------------------------------------------
   Principe (voir docs/superpowers/specs/2026-10-24-streaming-spatial.md) :
     1. `assets/models/tiles/index.json` décrit chaque tuile (fichier, centre,
        boîte englobante, taille, priorité).
     2. Au démarrage on ne charge que les tuiles `always` (le cœur : mosquée,
        ciel, nuages) → premier affichage rapide.
     3. Ensuite, à chaque frame, on compare la position de la caméra aux tuiles :
        - dans le rayon de chargement ET (dans le frustum OU très proche) → chargée ;
        - au-delà du rayon de déchargement → libérée (géométries + matériaux).
     4. Le frustum culling du rendu reste celui de Three.js (par objet) : les
        tuiles non chargées ne coûtent ni réseau ni GPU.

   Le module est volontairement générique : il suffit de lui donner un index.json
   du même format pour streamer n'importe quelle autre zone (village, site…).
   ========================================================== */
import * as THREE from 'three';

const TEXTURE_SLOTS = [
  'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap',
  'emissiveMap', 'alphaMap', 'bumpMap', 'displacementMap', 'lightMap', 'specularMap',
];

export class TileStreamer {
  /**
   * @param {object} opts
   * @param {THREE.Scene} opts.scene
   * @param {THREE.PerspectiveCamera} opts.camera
   * @param {import('three/addons/loaders/GLTFLoader.js').GLTFLoader} opts.loader
   * @param {string} [opts.indexUrl]
   * @param {number} [opts.loadRadius]    rayon de chargement (m)
   * @param {number} [opts.unloadRadius]  rayon de libération (m)
   * @param {number} [opts.nearRadius]    en dessous, on charge même hors champ (m)
   * @param {number} [opts.maxConcurrent] requêtes simultanées
   * @param {THREE.WebGLRenderer} [opts.renderer] pour le HUD
   * @param {boolean} [opts.hud]
   * @param {(s:object)=>void} [opts.onProgress]
   */
  constructor(opts) {
    this.scene = opts.scene;
    this.camera = opts.camera;
    this.loader = opts.loader;
    this.indexUrl = opts.indexUrl || 'assets/models/tiles/index.json';
    this.loadRadius = opts.loadRadius ?? 260;
    this.unloadRadius = opts.unloadRadius ?? 320;
    this.nearRadius = opts.nearRadius ?? 120;
    this.maxConcurrent = opts.maxConcurrent ?? 6;
    this.interval = opts.interval ?? 0.2;
    this.bytesPerSec = opts.bytesPerSec ?? 0;      // budget d'octets par seconde (0 = illimité)
    this._credit = 0; this._lastCredit = 0;
    this.onProgress = opts.onProgress || null;
    this.renderer = opts.renderer || null;
    this.hud = !!opts.hud;
    this.alwaysOnly = !!opts.alwaysOnly;

    this.group = new THREE.Group();
    this.group.name = 'MosqueTiles';
    this.scene.add(this.group);

    this.tiles = [];
    this.index = null;
    this.animations = [];
    this.bytesTotal = 0;
    this.bytesLoaded = 0;
    this.trisLoaded = 0;
    this.loading = 0;
    this.requests = 0;
    this._texCache = new Map();
    this._timer = 0;
    this._frustum = new THREE.Frustum();
    this._mat = new THREE.Matrix4();
    this._hudEl = null;
    this._hudT = 0;
    this._lastEmit = '';
  }

  /** Charge l'index puis les tuiles `always`. Résout quand le cœur est prêt. */
  async init() {
    const res = await fetch(this.indexUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`index.json introuvable (${res.status})`);
    this.index = await res.json();

    const base = this.indexUrl.replace(/[^/]+$/, '');
    this.baseUrl = base;

    // alwaysOnly : ne garde que le cœur (mosquée, ciel, nuages) — la ville autour vient d'un autre modèle.
    const allTiles = this.index.tiles || [];
    this.tiles = (this.alwaysOnly ? allTiles.filter((t) => t.always) : allTiles).map((t) => ({
      ...t,
      url: base + t.file,
      centerVec: new THREE.Vector3().fromArray(t.center),
      box: new THREE.Box3(new THREE.Vector3().fromArray(t.box.min), new THREE.Vector3().fromArray(t.box.max)),
      state: 'idle',
      root: null,
      dist: Infinity,
    }));
    this.bytesTotal = this.tiles.reduce((s, t) => s + (t.bytes || 0), 0);

    const always = this.tiles.filter((t) => t.always);
    this.preloadBytes = always.reduce((s, t) => s + (t.bytes || 0), 0);
    for (const t of always) {
      await this._loadTile(t, true);
      this.animations.push(...(t.animations || []));
    }

    this._emit(true);
    if (this.hud) this._buildHud();
    return { root: this.group, animations: this.animations, index: this.index };
  }

  /** À appeler chaque frame. */
  update(dt) {
    if (!this.tiles.length) { return; }
    this._timer += dt;
    if (this._timer < this.interval) { this._updateHud(dt); return; }
    this._timer = 0;
    this._refresh();
    this._updateHud(dt);
  }

  /** Réglages dynamiques (réseau qui change) : rayons, requêtes simultanées, octets/s. */
  setBudget(o = {}) {
    if (o.loadRadius != null) this.loadRadius = o.loadRadius;
    if (o.unloadRadius != null) this.unloadRadius = o.unloadRadius;
    if (o.nearRadius != null) this.nearRadius = o.nearRadius;
    if (o.maxConcurrent != null) this.maxConcurrent = o.maxConcurrent;
    if (o.bytesPerSec != null) this.bytesPerSec = o.bytesPerSec;
    this._credit = 0; this._lastCredit = performance.now();
  }

  /** Force une évaluation immédiate (après un saut de caméra par exemple). */
  refresh() {
    this._refresh();
  }

  /* ------------------------------------------------------------ */

  _refresh() {
    const cam = this.camera.position;
    this._mat.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._mat);

    const pending = [];
    for (const t of this.tiles) {
      if (t.always) continue;
      // distance à la boîte (0 si la caméra est dedans)
      const d = Math.max(0, cam.distanceTo(t.centerVec) - (t.radius || 0));
      t.dist = d;

      if (t.state === 'loaded') {
        if (d > this.unloadRadius) this._unload(t);
        continue;
      }
      if (t.state === 'loading') continue;
      if (d > this.loadRadius) continue;

      // On ne télécharge pas ce qui est derrière la caméra, sauf tout près.
      const inView = this._frustum.intersectsBox(t.box);
      if (!inView && d > this.nearRadius) continue;
      pending.push(t);
    }

    pending.sort((a, b) => a.dist - b.dist);
    // budget d'octets : un « crédit » qui se recharge à bytesPerSec ; une tuile ne démarre que si le crédit est positif
    const now = performance.now();
    if (this.bytesPerSec > 0) this._credit = Math.min(this._credit + this.bytesPerSec * Math.min(2, (now - (this._lastCredit || now)) / 1000), this.bytesPerSec * 3);
    this._lastCredit = now;
    for (const t of pending) {
      if (this.loading >= this.maxConcurrent) break;
      if (this.bytesPerSec > 0) { if (this._credit <= 0) break; this._credit -= t.bytes || 0; }
      this._loadTile(t);
    }
    if (pending.length) this._emit();
  }

  _loadTile(t, immediate = false) {
    if (t.state === 'loading' || t.state === 'loaded') return Promise.resolve(t);
    t.state = 'loading';
    this.loading++;
    this.requests++;

    return new Promise((resolve) => {
      this.loader.load(
        t.url,
        (gltf) => {
          const root = gltf.scene;
          root.name = t.id;
          root.userData.tileId = t.id;
          this._prepare(root);
          this.group.add(root);
          t.root = root;
          t.state = 'loaded';
          t.animations = gltf.animations || [];
          this.bytesLoaded += t.bytes || 0;
          this.trisLoaded += t.tris || 0;
          this.loading--;
          this._emit();
          if (immediate) resolve(t);
          else {
            window.dispatchEvent(new CustomEvent('mosque:tiles-changed', {
              detail: { id: t.id, loaded: this._count('loaded'), total: this.tiles.length, bytes: this.bytesLoaded },
            }));
            resolve(t);
          }
        },
        undefined,
        (err) => {
          console.warn(`[Streaming] échec du chargement de ${t.id}`, err);
          t.state = 'error';
          this.loading--;
          resolve(t);
        },
      );
    });
  }

  _prepare(root) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = true;
      this._shareTextures(o);
    });
  }

  /** Une même texture (nom glTF) n'est téléchargée/uploadée qu'une fois. */
  _shareTextures(mesh) {
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      for (const slot of TEXTURE_SLOTS) {
        const tex = mat[slot];
        if (!tex || !tex.isTexture) continue;
        const key = tex.name || tex.image?.src || '';
        if (!key) continue;
        const cached = this._texCache.get(key);
        if (cached && cached !== tex) {
          mat[slot] = cached;
          tex.dispose();
        } else if (!cached) {
          this._texCache.set(key, tex);
        }
      }
    }
  }

  _unload(t) {
    if (t.root) {
      this.group.remove(t.root);
      t.root.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry?.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) m?.dispose();
      });
      t.root = null;
    }
    t.state = 'idle';
    this.bytesLoaded -= t.bytes || 0;
    this.trisLoaded -= t.tris || 0;
    this._emit();
  }

  _count(state) {
    let n = 0;
    for (const t of this.tiles) if (t.state === state) n++;
    return n;
  }

  stats() {
    return {
      total: this.tiles.length,
      loaded: this._count('loaded'),
      loading: this.loading,
      errors: this._count('error'),
      bytes: this.bytesLoaded,
      bytesTotal: this.bytesTotal,
      preloadBytes: this.preloadBytes || 0,
      tris: this.trisLoaded,
      requests: this.requests,
      radius: this.loadRadius,
    };
  }

  _emit(force = false) {
    const s = this.stats();
    const key = `${s.loaded}/${s.total}/${s.loading}`;
    if (!force && key === this._lastEmit) return;
    this._lastEmit = key;
    if (this.onProgress) this.onProgress(s);
  }

  /* ------------------------- HUD de debug (?streaming=1) ------------------------- */
  _buildHud() {
    if (this._hudEl || !document.body) return;
    const el = document.createElement('div');
    el.id = 'streamingHud';
    el.style.cssText = [
      'position:fixed', 'left:12px', 'bottom:12px', 'z-index:99999',
      'font:11px/1.5 ui-monospace,Consolas,monospace', 'color:#ffe9c7',
      'background:rgba(20,10,6,.82)', 'border:1px solid rgba(255,200,120,.35)',
      'border-radius:8px', 'padding:8px 10px', 'pointer-events:none',
      'white-space:pre', 'backdrop-filter:blur(4px)',
    ].join(';');
    document.body.appendChild(el);
    this._hudEl = el;
  }

  _updateHud(dt) {
    if (!this._hudEl) return;
    this._hudT += dt;
    if (this._hudT < 0.25) return;
    this._hudT = 0;
    const s = this.stats();
    const info = this.renderer?.info?.render;
    const mo = (n) => (n / 1048576).toFixed(2);
    this._hudEl.textContent =
      `tuiles  ${String(s.loaded).padStart(2)}/${s.total}` +
      (s.loading ? `  (+${s.loading})` : '') +
      `\nréseau  ${mo(s.bytes)} / ${mo(s.bytesTotal)} Mo` +
      `\nrayon   ${s.radius} m` +
      (info ? `\ntris    ${info.triangles.toLocaleString('fr-FR')}  ·  draw ${info.calls}` : '');
  }
}

/** Nombre de tuiles du manifeste (utilitaire pour les tests). */
export const tileCount = (index) => (index?.tiles || []).length;
