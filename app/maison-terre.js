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
const SPOT = { x: -444.2, z: 227.3 };              // vide « Bibliotheque » dans Blender, converti dans le repère du jeu (x = x, z = -y)
const YAW = 0.0122;                               // rotation du vide (-0,7° dans Blender, convertie en rotation autour de Y)
const FOOT = { w: 28.5, d: 20.5 };                // emprise du sol de la maison (dalle, en m)
const WATER_Y = -12;                              // niveau du fleuve : la maison ne doit pas être posée dans l'eau

const state = { solid: 0, loaded: false, root: null, position: new THREE.Vector3(), requested: false };

/* Hauteur du sol sous l'emprise de la maison : on échantillonne une grille sur la dalle (orientée comme la maison)
   et on prend la médiane. Ainsi la maison ne s'enfonce pas dans la terre d'un côté ni ne flotte de l'autre. */
function footprintGround(cx, cz) {
  const meshes = [];
  M.scene.traverse((o) => { if (o.isMesh && o.visible && !/^Fleuve|Glow|Points|Halo|Maison|Livre|Arbre|Plante/i.test(o.name)) meshes.push(o); });
  const ray = new THREE.Raycaster();
  const cs = Math.cos(YAW), sn = Math.sin(YAW);
  const pts = [];                                   // [lx, lz, y] dans le repère de la maison
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 6; j++) {
    const lx = (i / 6 - 0.5) * FOOT.w, lz = (j / 6 - 0.5) * FOOT.d;
    const x = cx + lx * cs + lz * sn, z = cz - lx * sn + lz * cs;
    ray.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) pts.push([lx, lz, hit.point.y]);
  }
  if (!pts.length) return { y: 0, tilt: null, spread: 0, min: 0 };
  // plan moyen y = a + bx·lx + bz·lz (moindres carrés) : la maison épouse la pente au lieu de s'enfoncer d'un côté
  let n = pts.length, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sy = 0, sxy = 0, szy = 0;
  for (const [x, z, y] of pts) { sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; sy += y; sxy += x * y; szy += z * y; }
  const A = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], B = [sy, sxy, szy];
  const sol = solve3(A, B) || [sy / n, 0, 0];
  const [a0, bx, bz] = sol;
  const ys = pts.map((p) => p[2]).sort((u, v) => u - v);
  return { y: a0, bx, bz, tilt: Math.hypot(bx, bz) * 180 / Math.PI, spread: ys[ys.length - 1] - ys[0], min: ys[0] };
}

function solve3(A, B) {                             // système 3×3 par élimination de Gauss
  const M3 = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M3[r][c]) > Math.abs(M3[piv][c])) piv = r;
    [M3[c], M3[piv]] = [M3[piv], M3[c]];
    if (Math.abs(M3[c][c]) < 1e-9) return null;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M3[r][c] / M3[c][c]; for (let k = c; k < 4; k++) M3[r][k] -= f * M3[c][k]; }
  }
  return [0, 1, 2].map((i) => M3[i][3] / M3[i][i]);
}

/* Collisions : murs, intérieur (mezzanine, escalier), dalle, mobilier et étagères sont des obstacles pour le joueur à pied.
   Les torons, tapis, livres, plantes et arbres n'en sont pas. Le sanctuaire construit sa liste une seule fois : on ajoute ici
   les maillages de la maison dès que cette liste existe (SanctuaryMode.vehicle.addCollider, avec calcul du BVH). */
const SOLID = /^(Maison_Terre|Interieur_Terre|Escalier_Marches|Dalle|Mobilier|Etageres)/;
function registerColliders(root) {
  const todo = [];
  root.traverse((o) => { if (!o.isMesh) return; for (let p = o; p; p = p.parent) if (SOLID.test(p.name || '')) { todo.push(o); return; } });
  let tries = 0;
  const go = () => {
    const sm = window.SanctuaryMode && window.SanctuaryMode.vehicle;
    if (!sm || !sm.colliders() || !sm.colliders()._done) { if (tries++ < 200) setTimeout(go, 500); return; }
    for (const o of todo) {
      if (o.geometry && !o.geometry.boundsTree && o.geometry.computeBoundsTree) o.geometry.computeBoundsTree();
      sm.addCollider(o);
    }
    state.solid = todo.length;
    console.log('[MAISON-TERRE]', todo.length, 'maillages solides ajoutés aux collisions');
  };
  go();
}

function build(gltf) {
  const root = gltf.scene;
  const g = footprintGround(SPOT.x, SPOT.z);
  root.position.set(SPOT.x, g.y, SPOT.z);
  // inclinaison selon la pente : la normale du plan (-bx, 1, -bz) devient l'axe vertical de la maison, puis lacet
  const up = new THREE.Vector3(-g.bx, 1, -g.bz).normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), YAW);
  root.quaternion.copy(tilt.multiply(yaw));
  if (g.min < WATER_Y) console.warn("[MAISON-TERRE] une partie de l'emprise est sous l'eau");
  console.log('[MAISON-TERRE] sol', g.y.toFixed(2), 'm · pente', (g.tilt || 0).toFixed(2), '° · dénivelé sous la maison', g.spread.toFixed(2), 'm');
  root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.maison = true; } });
  M.scene.add(root);
  state.root = root; state.position.copy(root.position); state.loaded = true;
  root.updateMatrixWorld(true);
  registerColliders(root);
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
