/* ==========================================================
   TOMBE DE TAPAMA DJENEPO — lieu du dispositif 2
   ----------------------------------------------------------
   Position GPS (lien Google Maps) : 13,9034375 N ; -4,5589219 E.
   Convertie dans le repère du jeu à partir de l'origine du modèle de la ville (13,9056 ; -4,5553, voir
   destinations-map.js GEO.djenne) et de l'échelle 1,19 : x ≈ -466, z ≈ 287 (x = est, z = sud : à confirmer en jeu).
   Ce module pose un repère doré visible sur le sol. API : window.TombeTapama { loaded, position }.
   ========================================================== */
import * as THREE from 'three';

const M = window.MosqueScene;
const SPOT = { x: -465.7, z: 286.5 };
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

let acc = 0, requested = false;
M?.addFrameHook((dt) => {
  if (requested) return;
  acc += dt;
  if (acc < 0.5 || !M.loaded || !M.newCity) return;
  requested = true; build();
});

window.TombeTapama = { get loaded() { return state.loaded; }, get position() { return state.position; } };
