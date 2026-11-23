/* ==========================================================
   LIVRE 3D — le livre sort de l'étagère, vient devant la caméra et s'ouvre comme un vrai livre
   ----------------------------------------------------------
   Modèle : assets/models/livre-ouverture.glb (blender/maison-terre-bibliotheque.blend, objets LA_*) : ~170 triangles, aucune texture.
   Pivots à l'axe de la reliure : LA_Pivot_Couverture et LA_Pivot_Page_01..12, qu'on fait tourner autour de Y.
   L'animation est calculée ici (courbes d'accélération), pas enregistrée : elle reste fluide, s'adapte à l'écran et peut se refermer à tout moment.
   Coût : un petit canvas transparent avec son propre rendu, créé à l'ouverture et détruit à la fermeture (aucun coût le reste du temps).
   API : Book3D.open(ndcX, ndcY) → { opened: Promise, close() → Promise, dispose() }.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const URL = 'assets/models/livre-ouverture.glb?v=2';
const DIST = 0.8;                                   // distance caméra → livre (m du modèle)
const T_FLY = 0.9, T_COVER = 1.0, T_PAGES = 0.7, T_CLOSE = 0.75;
const OPEN_COVER = -Math.PI;                            // rotation de la couverture ouverte (rad autour de Y)
const FLIP_LEAVES = 4;                              // feuilles qui se tournent à l'ouverture (elles se rangent à gauche)
const W = 0.215, HH = 0.1475;                       // largeur d'une page, demi-hauteur du livre (m)
const NL = 12, TL = 0.0023, YB = NL * TL / 2 + 0.0003;   // nombre de feuilles, épaisseur d'une feuille, niveau de la couverture arrière (axe de profondeur du modèle)
const BOOK_SCALE = 1.3;                             // taille du livre ouvert à l'écran

const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);          // cubique entrée/sortie
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const reduced = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

let gltfP = null;
const load = () => gltfP || (gltfP = new Promise((res, rej) => new GLTFLoader().load(URL, res, undefined, rej)));

export const Book3D = {
  /** Lance l'animation. (ndcX, ndcY) : position écran (-1..1) de l'étagère d'où le livre sort. */
  open(ndcX = 0, ndcY = 0) {
    let alive = true, raf = 0, renderer = null, canvas = null;
    let resolveOpen; const opened = new Promise((r) => { resolveOpen = r; });
    const st = { phase: 'load', t: 0, cover: null, leaves: [], root: null };
    const ctl = {
      opened,
      close() {
        if (!alive) return Promise.resolve();
        if (!renderer) { ctl.dispose(); return Promise.resolve(); }                  // le modèle n'est pas encore chargé : rien à refermer
        return new Promise((resolve) => { st.onClosed = resolve; st.phase = reduced() ? 'gone' : 'close'; st.t = 0; if (st.phase === 'gone') finish(); });
      },
      dispose() { alive = false; cancelAnimationFrame(raf); if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); } if (canvas) canvas.remove(); },
    };
    const finish = () => { const cb = st.onClosed; ctl.dispose(); cb && cb(); };

    load().then((gltf) => {
      if (!alive) return;
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:8990;pointer-events:none';
      document.body.appendChild(canvas);
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 10);
      camera.position.set(0, 0, DIST);
      scene.add(new THREE.HemisphereLight(0xfff3dc, 0x4a3a2c, 1.5));
      const key = new THREE.DirectionalLight(0xfff0d0, 2.2); key.position.set(0.5, 0.8, 1.2); scene.add(key);
      const size = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
      size(); window.addEventListener('resize', size);
      const prevDispose = ctl.dispose; ctl.dispose = () => { window.removeEventListener('resize', size); prevDispose(); };

      const root = gltf.scene.clone(true); scene.add(root);
      st.root = root;
      st.cover = root.getObjectByName('LA_Pivot_Couverture');
      for (let i = 1; i <= 12; i++) { const p = root.getObjectByName('LA_Pivot_Page_' + String(i).padStart(2, '0')); if (p) st.leaves.push(p); }
      st.z0 = { cover: st.cover ? st.cover.position.z : 0, leaves: st.leaves.map((l) => l.position.z) };
      // point de départ : l'étagère (écran → plan du livre)
      const half = Math.tan(THREE.MathUtils.degToRad(17.5)) * DIST;
      const from = new THREE.Vector3(ndcX * half * camera.aspect, ndcY * half, 0);
      const toClosed = new THREE.Vector3(-W / 2 * BOOK_SCALE, 0, 0);
      const apply = () => {
        const { phase, t } = st;
        let fly = 0, cov = 0, pg = 0;
        if (phase === 'fly') fly = ease(t / T_FLY);
        else if (phase === 'cover') { fly = 1; cov = ease(t / T_COVER); }
        else if (phase === 'pages') { fly = 1; cov = 1; pg = t / T_PAGES; }
        else if (phase === 'open') { fly = 1; cov = 1; pg = 1; }
        else if (phase === 'close') {                                   // marche arrière : feuilles, couverture, retour à l'étagère
          const k = t / T_CLOSE; pg = 1 - seg(k, 0, 0.3); cov = 1 - ease(seg(k, 0.15, 0.65)); fly = 1 - ease(seg(k, 0.55, 1));
        }
        const spread = ease(cov);                                       // le livre se centre quand il est ouvert
        root.position.lerpVectors(from, toClosed.clone().multiplyScalar(1 - spread), fly);
        root.position.z = Math.sin(Math.PI * Math.min(fly, 1)) * 0.12;   // petit arc vers la caméra pendant le vol
        const sc = THREE.MathUtils.lerp(0.22, BOOK_SCALE, easeOut(fly)); root.scale.setScalar(sc);
        root.rotation.set(THREE.MathUtils.lerp(0.5, 0.06, fly) * (1 - spread), THREE.MathUtils.lerp(1.1, -0.28, easeOut(fly)) * (1 - spread), THREE.MathUtils.lerp(0.4, 0, fly));
        if (st.cover) {
          st.cover.rotation.y = OPEN_COVER * cov;
          st.cover.position.z = THREE.MathUtils.lerp(st.z0.cover, -YB, ease(seg(cov, 0.5, 1)));          // une fois ouverte, la couverture se pose à plat, derrière les pages (niveau de la couverture arrière)
        }
        st.leaves.forEach((lf, i) => {                                   // les premières feuilles se tournent à gauche, en cascade
          if (i >= FLIP_LEAVES) { lf.rotation.y = 0; return; }
          const a = ease(seg(pg, i * 0.18, 0.46 + i * 0.18));
          lf.rotation.y = -Math.PI * a;                                                                // à plat : la page de gauche est exactement dans le prolongement de la couverture
          lf.position.z = THREE.MathUtils.lerp(st.z0.leaves[i], -(YB - i * TL - 0.0002), a);              // la pile de gauche se range au-dessus de la couverture
        });
      };
      // pages écrites : deux plans transparents collés sur les vraies pages (face avant d'une feuille à droite, dos de la feuille tournée à gauche).
      // Le texte est dessiné sur un canvas 2D (CanvasTexture) : aucune interface HTML, aucun modèle de plus.
      const PW = W - 0.022, PH = 2 * (HH - 0.014), CW = 768, CH = Math.round(CW * PH / PW);
      const mkPage = (leaf, back) => {
        const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), mat);
        m.position.set(0.006 + PW / 2, 0, back ? -0.0027 : 0.0004); if (back) m.rotation.y = Math.PI; m.visible = false;
        leaf.add(m); return { cv, tex, mesh: m };
      };
      const pages = { left: mkPage(st.leaves[FLIP_LEAVES - 1], true), right: mkPage(st.leaves[FLIP_LEAVES], false) };
      ctl.pages = pages; ctl.refresh = () => { pages.left.tex.needsUpdate = true; pages.right.tex.needsUpdate = true; };
      const ray = new THREE.Raycaster(), _n = new THREE.Vector2();
      ctl.pick = (cx, cy) => {                                                            // (px écran) → { page, x, y } en pixels du canvas de la page, ou null
        if (st.phase !== 'open') return null;
        _n.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(_n, camera); root.updateMatrixWorld(true);
        const h = ray.intersectObjects([pages.left.mesh, pages.right.mesh], false)[0]; if (!h || !h.uv) return null;
        const pg = h.object === pages.left.mesh ? pages.left : pages.right;
        return { page: pg === pages.left ? 'left' : 'right', x: h.uv.x * CW, y: (1 - h.uv.y) * CH };
      };
      let last = performance.now();
      const tick = (now) => {
        if (!alive) return;
        const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt;
        const adv = (dur, next) => { if (st.t >= dur) { st.t = 0; st.phase = next; return true; } return false; };
        if (st.phase === 'fly') adv(T_FLY, 'cover');
        else if (st.phase === 'cover') adv(T_COVER, 'pages');
        else if (st.phase === 'pages') { if (adv(T_PAGES, 'open')) resolveOpen(); }
        else if (st.phase === 'close' && st.t >= T_CLOSE) { finish(); return; }
        const showText = st.phase === 'open'; if (pages.left.mesh.visible !== showText) { pages.left.mesh.visible = showText; pages.right.mesh.visible = showText; }
        apply(); renderer.render(scene, camera);
        raf = requestAnimationFrame(tick);
      };
      if (reduced()) { st.phase = 'open'; pages.left.mesh.visible = pages.right.mesh.visible = true; apply(); renderer.render(scene, camera); resolveOpen(); }
      else { st.phase = 'fly'; st.t = 0; }
      raf = requestAnimationFrame(tick);
    }).catch((e) => { console.warn('[LIVRE-3D] indisponible :', e && e.message); resolveOpen(); });
    return ctl;
  },
};
