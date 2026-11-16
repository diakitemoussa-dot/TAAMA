/* ==========================================================
   MAISON DE TERRE — bibliothèque en terre inspirée de la mosquée de Djenné
   ----------------------------------------------------------
   Modèle : assets/models/maison-terre.glb (source : blender/maison-terre-bibliotheque.blend).
   Placée au bord du fleuve, à la position choisie dans Blender (vide « Bibliotheque »), à la place de la base NÉANTIS
   qui est masquée (voir neantis-base.js : la logique de la base reste en mémoire).
   API : window.MaisonTerre { loaded, root, position }.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const M = window.MosqueScene;
const URL = 'assets/models/maison-terre.glb?v=2';
const DRACO = 'assets/vendor/three/examples/jsm/libs/draco/';
const SPOT = { x: -640, z: -405 };               // position placée dans Blender (vide « Bibliotheque ») convertie dans le repère du jeu ; y = sol

const state = { loaded: false, root: null, position: new THREE.Vector3(), requested: false };

function groundY(x, z) {                          // hauteur du sol sous le point (rayon depuis le haut)
  const meshes = [];
  M.scene.traverse((o) => { if (o.isMesh && o.visible && !/^Fleuve|Glow|Points|Halo/i.test(o.name)) meshes.push(o); });
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : 0;
}

function build(gltf) {
  const root = gltf.scene;
  root.position.set(SPOT.x, groundY(SPOT.x, SPOT.z), SPOT.z);
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  M.scene.add(root);
  state.root = root; state.position.copy(root.position); state.loaded = true;
  console.log('[MAISON-TERRE] placée au bord du fleuve', root.position.toArray().map((v) => Math.round(v)).join(', '));
}

let acc = 0;
M?.addFrameHook((dt) => {
  if (state.requested) return;
  acc += dt;
  if (acc < 0.5 || !M.loaded || !M.newCity) return;
  state.requested = true;
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load(URL, build, undefined, (e) => console.warn('[MAISON-TERRE] indisponible :', e));
});

window.MaisonTerre = { get loaded() { return state.loaded; }, get root() { return state.root; }, get position() { return state.position; } };
