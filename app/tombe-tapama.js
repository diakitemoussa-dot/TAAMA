/* ==========================================================
   TOMBE DE TAPAMA DJENEPO — lieu du dispositif 2
   ----------------------------------------------------------
   Position GPS (lien Google Maps) : 13,9034375 N ; -4,5589219 E.
   Convertie dans le repère du jeu avec la même conversion que la carte (city-map.js gameToReal : x = nord, z = est,
   K = 0,84, mosquée à (-12 ; -5,2)) : x ≈ -310,5 ; z ≈ -476,4.
   Ce module pose un repère doré visible sur le sol. API : window.TombeTapama { loaded, position }.
   ========================================================== */
import * as THREE from 'three';
import { t } from './i18n.js?v=1';

const M = window.MosqueScene;
const SPOT = { x: -310.5, z: -476.4 };
const state = { loaded: false, position: new THREE.Vector3(SPOT.x, 0, SPOT.z) };

function groundAt(x, z) {
  const meshes = [];
  M.scene.traverse((o) => { if (o.isMesh && o.visible && !/^Fleuve|Glow|Points|Halo|Maison|Livre|Arbre|Plante/i.test(o.name)) meshes.push(o); });
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : 0;
}

function build() {
  const y = groundAt(SPOT.x, SPOT.z);
  state.position.set(SPOT.x, y, SPOT.z);
  // repère : pilier doré lumineux + anneau au sol
  const mat = new THREE.MeshStandardMaterial({ color: 0xf9d58b, emissive: 0xf9d58b, emissiveIntensity: 0.6, roughness: 0.4 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 12), mat);
  pillar.position.set(SPOT.x, y + 7, SPOT.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(4.2, 5.2, 40), new THREE.MeshBasicMaterial({ color: 0xf9d58b, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(SPOT.x, y + 0.1, SPOT.z);
  pillar.name = 'Repere_Tombe_Tapama'; ring.name = 'Repere_Tombe_Tapama_Anneau';
  M.scene.add(pillar, ring);
  state.loaded = true;
  console.log('[TOMBE-TAPAMA] repère posé', SPOT.x.toFixed(1), y.toFixed(2), SPOT.z.toFixed(1));
}

/* Ramassage du dispositif 2 sur la tombe : invite « E / △ Récupérer » à moins de 6 m, puis taama.tombe = '1' */
const REACH = 6;
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
  const p = window.SanctuaryMode?.playerPosition?.(); if (!p) return false;
  return Math.hypot(p.x - SPOT.x, p.z - SPOT.z) < REACH;
}
function take() {
  if (lock > 0) return; lock = 0.8;
  try { localStorage.setItem('taama.tombe', '1'); } catch (_) {}
  if (promptEl) promptEl.style.display = 'none';
  window.GamepadKit?.toast?.(t('Dispositif 2 récupéré. Va à Barey So avec Tapama.'));
  try { window.GameUI?.completeSequence?.(8); } catch (_) {}
  // Tapama envoie le joueur à Barey So ; à la fin de la bulle, la carte s'ouvre avec l'itinéraire
  const call = { text: 'Bien joué, {nom} ! Tu as le dispositif 2, mais il est verrouillé. Va à Barey So, la bibliothèque, récolter des informations sur lui. Ensuite on le déverrouille ensemble dans mon labo.', mood: 'souriante', duration: 9 };
  const go = () => { try { localStorage.setItem('taama.acte', '3:biblio'); window.CityMap?.openTo?.('bibliotheque'); } catch (_) {} };
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go); else { window.Tapama?.radio?.(call); setTimeout(go, 10000); }
  window.dispatchEvent(new CustomEvent('tombe:dispositif', { detail: { position: [SPOT.x, state.position.y, SPOT.z] } }));
}
let tickT = 0;
M?.addFrameHook((dt) => {
  if (!requested || !state.loaded) return;
  if (lock > 0) lock -= dt;
  let done = false; try { done = localStorage.getItem('taama.tombe') === '1'; } catch (_) {}
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
  requested = true; build();
});

window.TombeTapama = { get loaded() { return state.loaded; }, get position() { return state.position; } };
