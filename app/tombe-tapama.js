/* ==========================================================
   TOMBE DE DJENÉPO — enclos de banco + second dispositif caché à côté
   ----------------------------------------------------------
   Position GPS de la tombe (lien Google Maps) : 13,9034375 N ; -4,5589219 E, convertie dans le repère du jeu avec la même conversion
   que la carte (city-map.js gameToReal : x = nord, z = est, K = 0,84, mosquée à (-12 ; -5,2)) : x ≈ -310,5 ; z ≈ -476,4.
   • modèle : assets/models/tombe-djenepo.glb (blender/tombe-djenepo.blend) : petite cour aux créneaux arrondis, porte de bois cloutée ;
   • posé par calage sur le terrain (app/ground-fit.js) ; murs et créneaux sont des obstacles pour le joueur à pied ;
   • le DISPOSITIF 2 est posé à côté de l'enclos, à moitié enfoui, avec la même lueur que le dispositif 1 ;
   • « E / △ Récupérer » à moins de 3,5 m : taama.tombe = '1', Tapama envoie le joueur à Barey So.
   API : window.TombeTapama { loaded, position, device }.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { t } from './i18n.js?v=1';
import { fitGround, applyFit, groundAt } from './ground-fit.js?v=1';

const M = window.MosqueScene;
const URL = 'assets/models/tombe-djenepo.glb?v=2';
const DRACO = 'assets/vendor/three/examples/jsm/libs/draco/';
const SPOT = { x: -310.5, z: -476.4 };
const YAW = 0;                                       // la porte regarde vers +Z (est)
const FOOT = { w: 5.2, d: 4.0 };                     // emprise de l'enclos (m)
const DEVICE_LOCAL = new THREE.Vector3(3.9, 0, 0.9);  // à côté du mur de droite, vers l'avant (repère de l'enclos)
const REACH = 3.5;

const state = { loaded: false, root: null, position: new THREE.Vector3(SPOT.x, 0, SPOT.z), device: new THREE.Vector3(), group: null, glowMat: null, ring: null, holder: null, t: 0 };

/* ---------- dispositif 2 : même objet que le dispositif 1 (prisme hexagonal gravé, lueur cyan), à moitié enfoui ---------- */
function makeTextures() {
  const N = 256, base = document.createElement('canvas'), glow = document.createElement('canvas');
  base.width = base.height = glow.width = glow.height = N;
  const b = base.getContext('2d'), g = glow.getContext('2d');
  const grd = b.createLinearGradient(0, 0, 0, N); grd.addColorStop(0, '#6f8582'); grd.addColorStop(0.5, '#8a7a60'); grd.addColorStop(1, '#566a66');
  b.fillStyle = grd; b.fillRect(0, 0, N, N);
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  [34, 96, 160, 222].forEach((y, k) => {
    for (let x = 0; x <= N; x += 32) {
      const p = new Path2D();
      if (k % 2 === 0) { p.moveTo(x - 16, y + 12); p.lineTo(x, y - 12); p.lineTo(x + 16, y + 12); }
      else { p.moveTo(x, y - 12); p.lineTo(x + 12, y); p.lineTo(x, y + 12); p.lineTo(x - 12, y); p.closePath(); }
      b.strokeStyle = 'rgba(15,18,18,.85)'; b.lineWidth = 4; b.lineJoin = 'round'; b.stroke(p);
      g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineJoin = 'round'; g.stroke(p);
    }
  });
  const tb = new THREE.CanvasTexture(base); tb.colorSpace = THREE.SRGBColorSpace; tb.wrapS = tb.wrapT = THREE.RepeatWrapping;
  const tg = new THREE.CanvasTexture(glow); tg.colorSpace = THREE.SRGBColorSpace; tg.wrapS = tg.wrapT = THREE.RepeatWrapping;
  return { base: tb, glow: tg };
}
function buildDevice(root) {
  const world = root.localToWorld(DEVICE_LOCAL.clone());
  const y = groundAt(M, world.x, world.z);
  const tex = makeTextures();
  const g = new THREE.Group(); g.name = 'Dispositif2';
  const prof = [[0.0, -0.30], [0.17, -0.25], [0.27, -0.12], [0.27, 0.12], [0.17, 0.25], [0.0, 0.30]].map(([r, h]) => new THREE.Vector2(r, h));
  state.glowMat = new THREE.MeshStandardMaterial({ map: tex.base, emissiveMap: tex.glow, emissive: new THREE.Color(0x66e8ff), emissiveIntensity: 1.6, metalness: 0.45, roughness: 0.5, flatShading: true });
  const core = new THREE.Mesh(new THREE.LatheGeometry(prof, 6), state.glowMat);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.035, 6, 6); ringGeo.rotateX(Math.PI / 2);
  state.ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x8a6d3a, metalness: 0.9, roughness: 0.35, emissive: new THREE.Color(0xffc060), emissiveIntensity: 0.5, flatShading: true }));
  const holder = new THREE.Group(); holder.add(core, state.ring); holder.position.set(0, 0.28, 0); holder.rotation.set(0.32, 0.6, 0.18);
  g.add(holder); state.holder = holder;
  const sand = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb38e5c, roughness: 1, flatShading: true }));
  sand.scale.set(1.25, 0.34, 1.0); g.add(sand);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 1, flatShading: true });
  [[-0.42, 0.12, 0.18, 0.2], [0.38, 0.10, -0.3, 0.17], [-0.1, 0.1, -0.44, 0.15], [0.28, 0.2, 0.28, 0.14]].forEach(([x, yy, z, s], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), stoneMat); m.position.set(x, yy, z); m.rotation.set(i, i * 1.7, i * 0.6); m.scale.y = 0.7; g.add(m);
  });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.raycast = () => {}; } });
  g.position.set(world.x, y, world.z);
  g.scale.setScalar(1.5);                                   // un peu plus grand que le dispositif 1 : il doit se repérer à côté de l'enclos
  M.scene.add(g);
  state.group = g; state.device.set(world.x, y, world.z);
}

/* ---------- collisions : murs et créneaux de l'enclos ---------- */
function registerColliders(root) {
  const todo = [];
  root.traverse((o) => { if (o.isMesh && /^TD_(Murs|Creneaux)/.test(o.name || o.parent?.name || '')) { o.userData.solidHouse = true; todo.push(o); } });
  let tries = 0;
  const go = () => {
    const sm = window.SanctuaryMode && window.SanctuaryMode.vehicle;
    if (!sm || !sm.colliders() || !sm.colliders()._done) { if (tries++ < 200) setTimeout(go, 500); return; }
    for (const o of todo) { if (o.geometry && !o.geometry.boundsTree && o.geometry.computeBoundsTree) o.geometry.computeBoundsTree(); sm.addCollider(o); }
    console.log('[TOMBE]', todo.length, 'maillages solides ajoutés aux collisions');
  };
  go();
}

function build(gltf) {
  const root = gltf.scene;
  const fit = fitGround(M, SPOT.x, SPOT.z, FOOT.w, FOOT.d, YAW);
  root.position.set(SPOT.x, fit.y, SPOT.z);
  applyFit(root, fit, YAW);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.tombe = true; } });
  M.scene.add(root); root.updateMatrixWorld(true);
  state.root = root; state.position.set(SPOT.x, fit.y, SPOT.z);
  registerColliders(root);
  let taken = false; try { taken = localStorage.getItem('taama.tombe') === '1'; } catch (_) {}
  buildDevice(root);
  if (taken && state.group) state.group.visible = false;
  state.loaded = true;
  console.log('[TOMBE] enclos posé à', SPOT.x, fit.y.toFixed(2), SPOT.z, '· pente', fit.tilt.toFixed(2), '° · dénivelé', fit.spread.toFixed(2), 'm');
}

/* ---------- ramassage ---------- */
let promptEl = null, lock = 0;
function ensurePrompt() {
  if (promptEl) return promptEl;
  promptEl = document.createElement('div');
  promptEl.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;background:rgba(20,14,24,.82);border:1px solid #f9d58b;color:#f9d58b;font:700 16px system-ui,"Segoe UI",sans-serif;z-index:60;pointer-events:none;display:none';
  promptEl.innerHTML = '<kbd style="border:1px solid #f9d58b;border-radius:8px;padding:2px 9px;margin-right:8px">E</kbd>' + t('Récupérer le dispositif');
  document.body.appendChild(promptEl);
  return promptEl;
}
function playerNear() {
  const p = window.SanctuaryMode?.playerPosition?.(); if (!p || !state.group) return false;
  return Math.hypot(p.x - state.device.x, p.z - state.device.z) < REACH;
}
function take() {
  if (lock > 0) return; lock = 0.8;
  try { localStorage.setItem('taama.tombe', '1'); } catch (_) {}
  if (promptEl) promptEl.style.display = 'none';
  if (state.group) state.group.visible = false;
  window.GamepadKit?.rumble?.(220, 0.6);
  window.GamepadKit?.toast?.(t('Dispositif 2 récupéré. Va à Barey So avec Tapama.'));
  try { window.GameUI?.completeSequence?.(8); } catch (_) {}
  // Tapama envoie le joueur à Barey So ; à la fin de la bulle, la carte s'ouvre avec l'itinéraire
  const call = { text: 'Bien joué, {nom} ! Tu as le dispositif 2, mais il est verrouillé. Va à Barey So, la bibliothèque, récolter des informations sur lui. Ensuite on le déverrouille ensemble dans mon labo.', mood: 'souriante', duration: 9 };
  const go = () => setTimeout(() => { try { localStorage.setItem('taama.acte', '3:biblio'); window.CityMap?.openTo?.('bibliotheque'); } catch (_) {} }, 2000);   // 2 s après la disparition de la bulle
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go); else { window.Tapama?.radio?.(call); setTimeout(go, 10000); }
  window.dispatchEvent(new CustomEvent('tombe:dispositif', { detail: { position: state.device.toArray() } }));
}
let tickT = 0;
M?.addFrameHook((dt) => {
  if (!requested || !state.loaded) return;
  if (lock > 0) lock -= dt;
  let done = false; try { done = localStorage.getItem('taama.tombe') === '1'; } catch (_) {}
  if (!done && state.group) {                                    // le dispositif flotte un peu et sa lueur pulse
    state.t += dt;
    state.holder.position.y = 0.28 + Math.sin(state.t * 1.6) * 0.05; state.holder.rotation.y += dt * 0.5;
    state.glowMat.emissiveIntensity = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin(state.t * 2.2));
  }
  if (done) { if (promptEl) promptEl.style.display = 'none'; return; }
  tickT += dt; if (tickT < 0.1) return; tickT = 0;
  const near = playerNear();
  ensurePrompt().style.display = near ? 'block' : 'none';
  if (near && window.GamepadKit?.justPressed?.('Y')) take();
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.repeat || !promptEl || promptEl.style.display !== 'block') return;
  e.preventDefault(); e.stopImmediatePropagation(); take();
}, true);

let acc = 0, requested = false;
M?.addFrameHook((dt) => {
  if (requested) return;
  acc += dt;
  if (acc < 0.5 || !M.loaded || !M.newCity) return;
  requested = true;
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load(URL, build, undefined, (e) => console.warn('[TOMBE] modèle indisponible :', e));
});

window.TombeTapama = { get loaded() { return state.loaded; }, get position() { return state.position; }, get device() { return state.device; } };
