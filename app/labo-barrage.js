/* ==========================================================
   NOUVELLE MAISON DE TAPAMA (laboratoire) + BARRAGE DU SEUIL DE DJENNÉ
   ----------------------------------------------------------
   • assets/models/maison-tapama.glb (blender/djenne-placement-maison.blend) : maison de terre et de bambou, intérieurs aménagés sur 3 niveaux,
     jardin, bassins. Déjà dans le repère du jeu (aucune transformation) : posée là où l'a placée l'utilisateur dans Blender.
     Le cercle jaune du labo est dans la maison (app/labo-position.js).
   • assets/models/barrage-djenne.glb (blender/gen_barrage.py) : chaussée surélevée sur piles qui traverse le Bani : le pick-up passe sans toucher l'eau.
   • COLLISIONS : CHAQUE maillage des deux modèles est ajouté aux colliders (joueur, voiture), y compris les meubles, rambardes et poteaux.
   • EAU DES BASSINS : même matière que le fleuve (vaguelettes animées, couleur du Bani, reflet du ciel) via River.makePondMaterial().
   • AMPOULES : matériau « Lampe » + halos + quelques vraies lumières qui s'allument à la tombée de la nuit (hauteur du soleil, comme city-lights.js).
   API : window.LaboBarrage { loaded, house, dam, nightLevel, lamps }.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { detectQuality } from './device-quality.js?v=6';

const M = window.MosqueScene;
const BASE = 'assets/models/';
const DRACO = 'assets/vendor/three/examples/jsm/libs/draco/';
const URL_HOUSE = BASE + 'maison-tapama.glb?v=8', URL_DAM = BASE + 'barrage-djenne.glb?v=3', URL_INFO = BASE + 'maison-tapama.json?v=5';
const POOL = { low: 0, mid: 2, high: 3 };                           // vraies lumières selon la qualité
const state = { house: null, dam: null, lamps: [], level: -1, ready: 0 };

/* ---------- 0 = plein jour … 1 = nuit noire (même règle que les lampadaires de la ville) ---------- */
function nightLevel() {
  let e = window.DayCycle && typeof window.DayCycle.sunElevation === 'number' ? window.DayCycle.sunElevation : null;
  if (e === null) { const h = window.DayCycle ? window.DayCycle.now() : 12; return (h >= 18.4 || h < 5.6) ? 1 : 0; }
  const t = Math.min(1, Math.max(0, (5 - e) / 9));
  return t * t * (3 - 2 * t);
}

/* ---------- collisions : tous les maillages, quelques-uns par image (le calcul des arbres BVH ne fige pas le jeu) ---------- */
function registerColliders(meshes, label) {
  let tries = 0, i = 0;
  const go = () => {
    const sm = window.SanctuaryMode && window.SanctuaryMode.vehicle;
    if (!sm || !sm.colliders() || !sm.colliders()._done) { if (tries++ < 400) setTimeout(go, 500); return; }
    const chunk = () => {
      for (let k = 0; k < 3 && i < meshes.length; k++, i++) {
        const o = meshes[i]; o.userData.solidHouse = true;
        if (o.geometry && !o.geometry.boundsTree && o.geometry.computeBoundsTree) o.geometry.computeBoundsTree();
        sm.addCollider(o);
      }
      if (i < meshes.length) setTimeout(chunk, 16); else console.log('[' + label + ']', meshes.length, 'maillages solides ajoutés aux collisions');
    };
    chunk();
  };
  go();
}

/* ---------- halo des ampoules ---------- */
function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,190,1)'); grad.addColorStop(0.18, 'rgba(255,200,120,0.55)'); grad.addColorStop(0.5, 'rgba(255,160,70,0.14)'); grad.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

/* ---------- la maison ---------- */
function setupHouse(gltf, info) {
  const root = gltf.scene; root.name = 'MaisonTapama';
  const meshes = [], lampMats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o); o.userData.labo = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const water = /Eau/i.test(o.name);
    if (water && window.River && window.River.makePondMaterial) {                          // eau des bassins = eau du fleuve
      o.material = window.River.makePondMaterial(); o.renderOrder = 1; o.castShadow = false; o.receiveShadow = false; return;
    }
    for (const m of mats) {
      if (m.name === 'Lampe') { m.emissiveIntensity = 0; m.color = new THREE.Color(0x4a443a); lampMats.add(m); }      // ampoules éteintes le jour
      if (m.name === 'Verre') { m.depthWrite = false; m.roughness = 0.1; }
    }
    o.castShadow = !/Herbe|Verre|Panneau|Lampe|Allee|Rampe/i.test(o.name); o.receiveShadow = true;
  });
  M.scene.add(root); root.updateMatrixWorld(true);
  state.house = root; state.lampMats = [...lampMats];
  registerColliders(meshes, 'MAISON-TAPAMA');
  // ampoules : halos (un seul Points) + vraies lumières (pool)
  const lamps = (info.lampes || []).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  state.lamps = lamps;
  const pos = new Float32Array(lamps.length * 3); lamps.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  state.glowMat = new THREE.PointsMaterial({ map: glowTexture(), size: 1.9, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
  state.glow = new THREE.Points(geo, state.glowMat); state.glow.frustumCulled = false; state.glow.raycast = () => {}; state.glow.visible = false; M.scene.add(state.glow);
  state.pool = [];
  const k = POOL[detectQuality()] ?? 3;
  for (let i = 0; i < k; i++) { const L = new THREE.PointLight(0xffb866, 0, 16, 2); L.castShadow = false; M.scene.add(L); state.pool.push(L); }
  console.log('[MAISON-TAPAMA] posée ·', meshes.length, 'maillages ·', lamps.length, 'ampoules');
}

/* ---------- le barrage ---------- */
function setupDam(gltf) {
  const root = gltf.scene; root.name = 'BarrageDjenne'; const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes.push(o); o.userData.labo = true;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m.name === 'Barrage_Bois' && !o.geometry.attributes.color) m.color = new THREE.Color(0x6d4a28);   // poteaux : pas de couleurs de sommets
    o.castShadow = true; o.receiveShadow = true;
  });
  M.scene.add(root); root.updateMatrixWorld(true);
  state.dam = root;
  registerColliders(meshes, 'BARRAGE');
  console.log('[BARRAGE] posé ·', meshes.length, 'maillages');
}

/* ---------- chargement (quand la ville v2 est prête) ---------- */
let acc = 0, requested = false;
const assignLights = () => {
  const cam = M.camera.position; if (!state.pool.length || !state.lamps.length) return;
  const d = state.lamps.map((p, i) => [p.distanceToSquared(cam), i]).sort((a, b) => a[0] - b[0]);
  state.pool.forEach((L, j) => { const p = state.lamps[d[j][1]]; L.position.set(p.x, p.y - 0.15, p.z); });
};
let poolT = 0;
M?.addFrameHook((dt) => {
  if (!requested) {
    acc += dt;
    if (acc < 0.5 || !M.loaded || !M.newCity) return;
    requested = true;
    const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    Promise.all([fetch(URL_INFO).then((r) => r.json()).catch(() => ({ lampes: [] })), loader.loadAsync(URL_HOUSE).catch((e) => { console.warn('[MAISON-TAPAMA] modèle indisponible :', e); return null; }),
      loader.loadAsync(URL_DAM).catch((e) => { console.warn('[BARRAGE] modèle indisponible :', e); return null; })]).then(([info, house, dam]) => {
      if (house) setupHouse(house, info);
      if (dam) setupDam(dam);
      state.ready = (house ? 1 : 0) + (dam ? 2 : 0);
    });
    return;
  }
  if (!state.house || !state.glowMat) return;
  const f = nightLevel();
  if (Math.abs(f - state.level) > 0.004) {                      // les ampoules s'allument à la tombée de la nuit
    state.level = f;
    for (const m of state.lampMats) { m.emissiveIntensity = 3.2 * f; m.color.setRGB(0.29 + 0.71 * f, 0.27 + 0.4 * f, 0.23 + 0.15 * f); }
    state.glowMat.opacity = 0.9 * f; state.glow.visible = f > 0.01;
    for (const L of state.pool) L.intensity = 24 * f;
  }
  if (f > 0.01 && state.pool.length) { poolT += dt; if (poolT > 0.3) { poolT = 0; assignLights(); } }
});

window.LaboBarrage = {
  get loaded() { return state.ready === 3; }, get house() { return state.house; }, get dam() { return state.dam; },
  get nightLevel() { return state.level; }, get lamps() { return state.lamps.length; },
};
