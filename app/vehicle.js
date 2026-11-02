/* ==========================================================
   PICK-UP DE DJENNÉ — véhicule du joueur (sanctuaire, à pied)
   ----------------------------------------------------------
   Modèle : assets/models/voiture-djenne.glb (Blender : Documents/Djenne3D/vehicule/voiture_build.py)
     nœuds : Carrosserie, Porte_G / Porte_D (charnière avant), Direction_AvG/AvD (braquage) > Roue_AvG/AvD, Roue_ArG/ArD, Volant,
             ancres Siege_Conducteur, Sortie_G, Phare_G/D, Feu_G/D.
   Comportement :
     • garée près de la mosquée ; à moins de ~3,2 m de la portière : « ▲ / F · Monter » (▲ = Y sur la manette) ;
     • montée : le personnage marche jusqu'à la portière, la portière s'ouvre, il saute dans l'habitacle, la portière se referme,
       la caméra passe derrière — descente : même séquence à l'envers ;
     • conduite tout-terrain : RT/↑/W accélère, LT/↓/S freine puis recule, stick gauche/←→/A D braque, A/Espace frein à main,
       ▲/F descend ; suspension (4 rayons au sol), tangage/roulis, poussière, phares la nuit, moteur ;
     • collisions : mêmes colliders que le sanctuaire (Sol_*, Bat_*, Neantis_*, portes comprises).
   Le contrôleur remplace tickFPS du sanctuaire tant qu'il est actif (window.SanctuaryMode.vehicle).
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const M = window.MosqueScene;
const URL_GLB = 'assets/models/voiture-djenne.glb?v=3';
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';

// stationnement : à l'extérieur de la mosquée (point d'apparition extérieur du sanctuaire + décalage), orientée vers l'est/le large
const PARK = { x: -21.5, z: 47.0, yaw: Math.PI * 0.5 };
const WHEEL_R = 0.50, WHEEL_BASE = 3.0, TRACK = 1.6, AX_F = 1.55, AX_R = 1.45;   // mètres (= unités du jeu)
const MAX_FWD = 34, MAX_REV = 9, ACCEL = 23, BRAKE = 28, DRAG = 0.30, ROLL_DRAG = 1.1;
const CLIMB_POWER = 6.5;             // surcroît de couple en montée (par radian de pente) : le pick-up grimpe les pentes sans caler
const LOW_TORQUE = 1.1;              // couple supplémentaire à basse vitesse (démarrage en côte)
const MAX_STEER = 0.52, STEER_RATE = 3.2;
const BOARD_R = 3.4;                           // portée de la portière
const DOOR_OPEN = 1.15;                        // rad
const ST = { PARKED: 'parked', WALK_IN: 'walk_in', OPEN_IN: 'open_in', VANISH_IN: 'vanish_in', APPEAR_IN: 'appear_in', DRIVE: 'drive',
             OPEN_OUT: 'open_out', VANISH_OUT: 'vanish_out', APPEAR_OUT: 'appear_out' };
const ANIM_URL = 'assets/models/personnage-voiture-anim.glb?v=2';     // clips Blender : car_sit_center / left / right (assis, mains sur le volant)
const STAND = new THREE.Vector3(1.42, 0.0, -0.52);                       // où le personnage se tient devant la portière (repère voiture, y haut ; clip car_enter)
const STAND_YAW = THREE.MathUtils.degToRad(-52);                         // il regarde la poignée
const SEAT_FLOOR = new THREE.Vector3(0.44, 1.0, 0.58);             // sol de l'habitacle du personnage assis : bassin posé sur l'assise (assise à 1,215 m, volant à 1,545 m depuis la caisse relevée de 0,345 m)
const SEATED_SCALE = 0.94;                  // origine du personnage assis (sol de l'habitacle)
const car = { revMats: [], shadow: null, revGlow: null, revLight: null, cones: null, road: null, tailGlow: null, headGlow: null, colliders: null, colAdded: false, ind: null, indGlow: null, dome: null, dash: null, loaded: false, group: null, doorL: null, doorR: null, steer: [], wheels: {}, volant: null, anchors: {}, headMats: [], tailMats: [],
              lights: [], dust: null };
const S = { orbYaw: 0, orbPit: 0, orbIdle: 99, orbDrag: null, lightsMan: null, lbT: 0, camMode: 0, camT: 0, clips: null, clipsLoading: false, acts: null, clipTime: 0, st: ST.PARKED, t: 0, yaw: PARK.yaw, speed: 0, steer: 0, doorAmt: 0, pitch: 0, roll: 0, spin: 0, camYaw: 0, camInit: false,
            from: new THREE.Vector3(), prompt: null, held: {}, down: {}, engine: null, nightLevel: 0 };
const pos = new THREE.Vector3(PARK.x, 0, PARK.z);          // contact au sol (centre de caisse)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const rc = new THREE.Raycaster();
const DOWN = new THREE.Vector3(0, -1, 0);

function SM() { return window.SanctuaryMode && window.SanctuaryMode.vehicle; }
function nightLevel() { return window.CityLights && window.CityLights.level >= 0 ? window.CityLights.level : 0; }

/* ---------- sol / collisions ---------- */
let _groundMeshes = null, _groundTry = 0;
function sceneGround(x, z) {
  if (!_groundMeshes) {
    if (performance.now() - _groundTry < 700) return null;
    _groundTry = performance.now();
    const list = []; M.scene.traverse((o) => { if (o.isMesh && /^Sol_/.test(o.name)) list.push(o); });
    if (!list.length) return null;
    _groundMeshes = list;
  }
  rc.set(_v.set(x, 80, z), DOWN); rc.near = 0; rc.far = 200;
  const h = rc.intersectObjects(_groundMeshes, false);
  return h.length ? h[0].point.y : null;
}
let _envCols = null, _envLen = -1;
function envColliders() {          // colliders du monde SANS la voiture (ses propres rayons ne doivent pas la heurter)
  const all = SM() && SM().colliders(); if (!all) return null;
  if (_envLen !== all.length) { _envCols = all.filter((o) => !/^Voiture_Collider/.test(o.name)); _envLen = all.length; }
  return _envCols;
}
function groundAt(x, y, z) {
  const cols = envColliders();
  if (!cols || !cols.length || !cols.some((o) => /^Sol_/.test(o.name))) return sceneGround(x, z);
  rc.set(_v.set(x, y + 3.0, z), DOWN); rc.near = 0; rc.far = 12;
  const h = rc.intersectObjects(cols, false);
  return h.length ? h[0].point.y : null;
}
const _nm = new THREE.Matrix3(), _n3 = new THREE.Vector3();
function blockedAhead(dirX, dirZ, dist, height) {
  const cols = envColliders(); if (!cols || !cols.length) return false;
  const hw = 0.85;
  for (const off of [-hw, 0, hw]) {
    const ox = pos.x + Math.cos(S.yaw) * off + Math.sin(S.yaw) * 0, oz = pos.z - Math.sin(S.yaw) * off;
    rc.set(_v.set(ox - dirX * 0.1, pos.y + height, oz - dirZ * 0.1), _w.set(dirX, 0, dirZ).normalize());
    rc.near = 0; rc.far = dist + 2.6;
    const hits = rc.intersectObjects(cols, false);
    for (const h of hits) {
      if (h.distance >= dist + 2.6) break;
      // le terrain (Sol_*) en pente franchissable (< ~57°) n'arrête pas la voiture : elle monte dessus
      if (h.face && /^Sol_/.test(h.object.name)) { _nm.getNormalMatrix(h.object.matrixWorld); _n3.copy(h.face.normal).applyMatrix3(_nm).normalize(); if (_n3.y > 0.55) continue; }
      return true;
    }
  }
  return false;
}

/* ---------- chargement ---------- */
function load() {
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load(URL_GLB, (gltf) => {
    const g = new THREE.Group(); g.name = 'VoitureDjenne';
    const root = gltf.scene; root.name = 'Voiture'; g.add(root);
    root.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.raycast = () => {}; }       // pas de collision : la voiture n'est pas un obstacle pour le joueur
      if (o.isMesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (/V_Verre/.test(m.name)) {                         // vitres transparentes : on voit le conducteur à travers
            m.transparent = true; m.opacity = 0.22; m.depthWrite = false; m.side = THREE.DoubleSide;
            if (m.color) m.color.setHex(0x3a5f70);
            if ('metalness' in m) { m.metalness = 0.1; m.roughness = 0.05; }
            m.needsUpdate = true;
          }
          if (/V_Phare/.test(m.name)) car.headMats.push(m);      // remplacé plus bas : la lentille blanche arrière est séparée
          if (/V_FeuRouge/.test(m.name)) car.tailMats.push(m);
        }
      }
    });
    // la matière V_Phare est partagée par les phares (avant) et les lentilles blanches de recul (arrière) : on sépare les deux
    car.headMats = []; car.revMats = [];
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry.index) return;
      const arr0 = Array.isArray(o.material); const mats0 = arr0 ? o.material : [o.material];
      const gi = mats0.findIndex((m) => /V_Phare/.test(m.name)); if (gi < 0) return;
      const geo = o.geometry, idx = geo.index, pos = geo.attributes.position;
      const start = arr0 ? (geo.groups.find((q) => q.materialIndex === gi) || {}).start : 0;
      const count = arr0 ? (geo.groups.find((q) => q.materialIndex === gi) || {}).count : idx.count;
      if (start === undefined) return;
      const tris = []; for (let i = start; i < start + count; i += 3) {
        const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
        tris.push({ v: [a, b, c], rear: (pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3 < 0 });
      }
      const front = tris.filter((q) => !q.rear), rear = tris.filter((q) => q.rear);
      const arr = idx.array; let w = start;
      for (const q of front) for (const v of q.v) arr[w++] = v;
      const rStart = w; for (const q of rear) for (const v of q.v) arr[w++] = v;
      idx.needsUpdate = true;
      const rm = mats0[gi].clone(); rm.name = 'V_Recul';
      const nm = arr0 ? o.material : [o.material];
      nm.push(rm); o.material = nm;
      if (arr0) { geo.groups.find((q) => q.materialIndex === gi).count = front.length * 3; }
      else { geo.clearGroups(); geo.addGroup(0, front.length * 3, 0); }
      geo.addGroup(rStart, rear.length * 3, nm.length - 1);
      car.headMats.push(nm[gi]); car.revMats.push(rm);
    });
    const by = (n) => root.getObjectByName(n);
    car.doorL = by('Porte_G'); car.doorR = by('Porte_D'); car.volant = by('Volant');
    car.steer = [by('Direction_AvG'), by('Direction_AvD')].filter(Boolean);
    car.wheels = { AvG: by('Roue_AvG'), AvD: by('Roue_AvD'), ArG: by('Roue_ArG'), ArD: by('Roue_ArD') };
    // roues réduites (rayon 0,58 -> 0,50 m) : on les rétrécit autour de leur axe et on descend l'axe pour que les pneus touchent toujours le sol
    { const k = 0.50 / 0.58, dy = 0.58 - 0.50;
      for (const w of Object.values(car.wheels)) if (w) w.scale.multiplyScalar(k);
      for (const n of [...car.steer, car.wheels.ArG, car.wheels.ArD]) if (n) n.position.y -= dy; }
    for (const n of ['Siege_Conducteur', 'Sortie_G', 'Sortie_D', 'Phare_G', 'Phare_D', 'Feu_G', 'Feu_D', 'Porte_G_Charniere', 'Poussiere_ArG', 'Poussiere_ArD']) {
      const o = by(n); if (o) car.anchors[n] = o;
    }
    M.scene.add(g); car.group = g; car.loaded = true;
    // ombre portée : tache sombre douce sous la voiture (la lumière du jour ne projette pas d'ombre sur le terrain ici)
    { const sc = document.createElement('canvas'); sc.width = 64; sc.height = 128; const sx = sc.getContext('2d');
      const gr = sx.createRadialGradient(32, 64, 6, 32, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.78)'); gr.addColorStop(0.55, 'rgba(0,0,0,.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      sx.save(); sx.translate(32, 64); sx.scale(0.52, 1); sx.translate(-32, -64); sx.fillStyle = gr; sx.fillRect(-40, 0, 144, 128); sx.restore();
      const tex = new THREE.CanvasTexture(sc);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 6.6), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.renderOrder = 2; m.raycast = () => {}; m.frustumCulled = false; m.name = 'Voiture_Ombre'; g.add(m); car.shadow = m; }
    // colliders : deux boîtes invisibles (caisse + habitacle) ; le personnage, le drone et les tirs ne traversent plus la voiture
    car.colliders = [];
    for (const [name, size, c] of [['Voiture_Collider_Caisse', [1.95, 0.85, 5.45], [0, 1.125, 0.0]], ['Voiture_Collider_Cabine', [1.9, 0.80, 1.85], [0, 1.845, 0.05]]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      m.name = name; m.position.set(...c); m.material.visible = false; m.castShadow = false; m.receiveShadow = false;
      g.add(m); car.colliders.push(m);
    }
    // clignotants : avant (sur ceux du modèle) et arrière ; chaque côté clignote indépendamment (au braquage, ou feux de détresse)
    car.ind = { L: [], R: [] };
    const indGeo = new THREE.BoxGeometry(0.17, 0.08, 0.05);
    for (const [side, sx] of [['L', 1], ['R', -1]]) {
      for (const [zz, yy, xx] of [[2.64, 1.065, 0.70], [-2.745, 0.985, 0.80]]) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x4a2a05 });
        const m = new THREE.Mesh(indGeo, mat); m.position.set(sx * xx, yy, zz); m.raycast = () => {};
        g.add(m); car.ind[side].push(m);
      }
    }
    const gl = document.createElement('canvas'); gl.width = gl.height = 32; const gx = gl.getContext('2d');
    const gg = gx.createRadialGradient(16, 16, 0, 16, 16, 16); gg.addColorStop(0, 'rgba(255,170,40,1)'); gg.addColorStop(1, 'rgba(255,140,0,0)');
    gx.fillStyle = gg; gx.fillRect(0, 0, 32, 32);
    const gtex = new THREE.CanvasTexture(gl);
    car.indGlow = { L: [], R: [] };
    for (const side of ['L', 'R']) for (const m of car.ind[side]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gtex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sp.scale.setScalar(0.9); sp.position.copy(m.position); sp.position.z += Math.sign(m.position.z) * 0.08; g.add(sp); car.indGlow[side].push(sp);
    }
    // halos des phares (visibles aussi de jour)
    const hl = document.createElement('canvas'); hl.width = hl.height = 64; const hx = hl.getContext('2d');
    const hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32); hg.addColorStop(0, 'rgba(255,250,225,1)'); hg.addColorStop(0.3, 'rgba(255,235,180,.55)'); hg.addColorStop(1, 'rgba(255,220,150,0)');
    hx.fillStyle = hg; hx.fillRect(0, 0, 64, 64);
    const htex = new THREE.CanvasTexture(hl); car.headGlow = [];
    for (const n of ['Phare_G', 'Phare_D']) {
      const a = car.anchors[n]; if (!a) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: htex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sp.scale.setScalar(1.7); sp.position.set(0, 0, 0.1); a.add(sp); car.headGlow.push(sp);
    }
    // phares : réglage repris de Bamako Drive (2 projecteurs, pas de cône visible) ; halos des phares plus bas
    const tl = document.createElement('canvas'); tl.width = tl.height = 32; const tx = tl.getContext('2d');
    const tg = tx.createRadialGradient(16, 16, 0, 16, 16, 16); tg.addColorStop(0, 'rgba(255,60,40,1)'); tg.addColorStop(1, 'rgba(255,30,10,0)');
    tx.fillStyle = tg; tx.fillRect(0, 0, 32, 32);
    const rl = document.createElement('canvas'); rl.width = rl.height = 32; const rx2 = rl.getContext('2d');
    const rg = rx2.createRadialGradient(16, 16, 0, 16, 16, 16); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.35, 'rgba(235,240,255,.6)'); rg.addColorStop(1, 'rgba(220,230,255,0)');
    rx2.fillStyle = rg; rx2.fillRect(0, 0, 32, 32);
    const rtex = new THREE.CanvasTexture(rl); car.revGlow = [];
    for (const n of ['Feu_G', 'Feu_D']) {
      const a = car.anchors[n]; if (!a) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: rtex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sp.scale.setScalar(0.8); sp.position.set(0, -0.25, -0.2); a.add(sp); car.revGlow.push(sp);
    }
    // (pas de PointLight de recul ni de tableau de bord : chaque lumière ponctuelle coûte à CHAQUE pixel de la scène ; les matériaux émissifs suffisent)
    const ttex = new THREE.CanvasTexture(tl); car.tailGlow = [];
    for (const n of ['Feu_G', 'Feu_D']) {
      const a = car.anchors[n]; if (!a) continue;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ttex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sp.scale.setScalar(1.0); sp.position.set(0, 0, -0.15); a.add(sp); car.tailGlow.push(sp);
    }
    // éclairage intérieur : plafonnier chaud + lueur verte du tableau de bord
    const REAL_HEADLIGHTS = !window.Quality || window.Quality.preset.headlights !== false;   // palier économique : cônes émissifs seulement (une lumière de moins = shaders plus légers)
    car.dome = new THREE.PointLight(0xffe0a8, 0, 5.5, 1.6); car.dome.position.set(0, 2.07, 0.1); car.dome.visible = REAL_HEADLIGHTS; g.add(car.dome);
    // phares : deux vraies lumières (nombre constant)
    for (const n of ['Phare_G', 'Phare_D']) {
      const L = new THREE.SpotLight(0xfff0d0, 0, 95, 0.52, 0.55, 1.2); L.castShadow = false; L.visible = REAL_HEADLIGHTS;
      const tgt = new THREE.Object3D(); M.scene.add(L); M.scene.add(tgt); L.target = tgt;
      // (spot et cible en coordonnées monde : pas enfants de la voiture)
      car.lights.push({ L, tgt, anchor: car.anchors[n] });
    }
    // poussière : petit nuage de points
    const N = 72, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const cx = c.getContext('2d');
    const gr = cx.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(190,150,100,.55)'); gr.addColorStop(1, 'rgba(190,150,100,0)');
    cx.fillStyle = gr; cx.fillRect(0, 0, 32, 32);
    const mat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 2.2, transparent: true, depthWrite: false, opacity: 0.8, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.raycast = () => {}; M.scene.add(pts);
    car.dust = { pts, N, life: new Float32Array(N).fill(0), vel: Array.from({ length: N }, () => new THREE.Vector3()), i: 0, acc: 0 };
    place(PARK.x, PARK.z, PARK.yaw, true); loadClips();
    console.log('[Voiture] pick-up chargé');
  }, undefined, (e) => console.warn('[Voiture] indisponible :', e));
}

/* sol sous (x, z) : le rayon ne porte que 12 m, on l'essaie donc depuis plusieurs hauteurs (indice, hauteur actuelle, paliers du terrain) */
function findGround(x, z, hint) {
  const ref = S.parkHint != null && S.parkAt && Math.hypot(x - S.parkAt.x, z - S.parkAt.z) < 3 ? S.parkHint : null;          // hauteur connue du lieu : un « sol » trop éloigné de cette hauteur (toit, plan bas) est refusé
  for (const y of [hint, pos.y, 5, 0, 12, 25, 45]) {
    if (y == null || !isFinite(y)) continue;
    const g = groundAt(x, y, z);
    if (g !== null && (ref === null || Math.abs(g - ref) <= 2.5)) return g;
  }
  return null;
}
/* place libre autour d'un point (cx, cz) : sol trouvé à la bonne hauteur sous les 5 points de l'emprise, aucun mur entre le point et la voiture ;
   renvoie { x, z, yaw } ou null (sol pas chargé : l'appelant se rabat sur un emplacement fixe) */
function freeSpotNear(cx, cz, yRef) {
  const cols = envColliders(); if (!cols || !cols.length) return null;
  const solid = cols.filter((o) => !/^Sol_/.test(o.name));
  const wall = (ax, az, bx, bz, h) => {                       // un obstacle (hors terrain) sur le segment A→B à hauteur h ?
    const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz); if (L < 0.01) return false;
    rc.set(_v.set(ax, yRef + h, az), _w.set(dx / L, 0, dz / L)); rc.near = 0; rc.far = L;
    return rc.intersectObjects(solid, false).length > 0;
  };
  const g0 = findGroundNear(cx, cz, yRef); if (g0 === null) return null;
  for (const r of [5.5, 7, 4.5, 8.5]) {
    for (let k = 0; k < 12; k++) {
      const a = Math.PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);     // d'abord à l'ouest, puis de part et d'autre
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r, yaw = a + Math.PI / 2;
      const ax = Math.sin(yaw), az = Math.cos(yaw), lx = az, lz = -ax;                // avant / côté de la voiture
      const pts = [[0, 0], [2.2, 0], [-2.2, 0], [0, 1.1], [0, -1.1]].map(([f, s2]) => [x + ax * f + lx * s2, z + az * f + lz * s2]);
      let ok = true;
      for (const [px, pz] of pts) {
        const g = findGroundNear(px, pz, yRef);
        if (g === null || Math.abs(g - g0) > 0.7 || wall(cx, cz, px, pz, 0.8) || wall(cx, cz, px, pz, 1.6)) { ok = false; break; }
      }
      if (ok) return { x, z, yaw };
    }
  }
  return null;
}
function findGroundNear(x, z, yRef) {
  for (const y of [yRef, yRef + 2, yRef - 2]) { const g = groundAt(x, y, z); if (g !== null && Math.abs(g - yRef) <= 3) return g; }
  return null;
}
function place(x, z, yaw, snapGround, yHint) {
  pos.x = x; pos.z = z; S.yaw = yaw; S.parkHint = yHint != null ? yHint : null; S.parkAt = { x, z };
  S.pitch = 0; S.roll = 0; dustClear();
  const gy = findGround(x, z, yHint);
  if (gy !== null) { pos.y = gy; S.pendingGround = false; }
  else { if (yHint != null) pos.y = yHint; S.pendingGround = true; }     // sol pas encore chargé (tuiles) : on recolle dès qu'il apparaît
  applyTransform();
}

function applyTransform() {
  if (!car.group) return;
  car.group.position.copy(pos);
  _e.set(S.pitch, S.yaw, S.roll, 'YXZ'); car.group.quaternion.setFromEuler(_e);
  // portes
  if (car.doorL) car.doorL.rotation.y = -DOOR_OPEN * S.doorAmt;
  for (const w of car.steer) w.rotation.y = S.steer;
  for (const k in car.wheels) if (car.wheels[k]) car.wheels[k].rotation.x = S.spin;
  if (car.volant) car.volant.rotation.z = -S.steer * 2.4;
  car.group.updateMatrixWorld(true);
}

/* ---------- entrées ---------- */
const KEYS = new Set(['KeyL', 'KeyH', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight']);
window.addEventListener('keydown', (e) => {
  if (window.__storyFreeze) return;                          // labo / dossier ouverts : la voiture ne capte plus le clavier
  if (e.code === 'KeyF' && !e.repeat) { S.down.F = true; }
  if (e.code === 'KeyV' && !e.repeat) { S.down.V = true; }
  if (e.code === 'KeyL' && !e.repeat && S.st !== ST.PARKED) toggleLights();
  if (e.code === 'KeyH' && !e.repeat && S.st !== ST.PARKED) { S.hazard = !S.hazard; }
  if (S.st !== ST.PARKED && KEYS.has(e.code)) { S.held[e.code] = true; e.stopImmediatePropagation(); e.preventDefault(); }
}, true);
window.addEventListener('keyup', (e) => { if (KEYS.has(e.code)) S.held[e.code] = false; }, true);

function inputs() {
  const GP = window.GamepadKit, connected = GP && GP.connected && GP.connected();
  const k = S.held; let thr = 0, brake = 0, str = 0, hand = !!(k.Space);
  if (k.KeyW || k.KeyZ || k.ArrowUp) thr = 1; if (k.KeyS || k.ArrowDown) brake = 1;
  if (k.KeyA || k.KeyQ || k.ArrowLeft) str += 1; if (k.KeyD || k.ArrowRight) str -= 1;
  const jy = SM() && SM().joy;                                     // joystick tactile du sanctuaire : haut = gaz, bas = frein/recul, côtés = volant
  if (jy && (Math.abs(jy.x) > 0.08 || Math.abs(jy.y) > 0.08)) { if (jy.y < -0.08) thr = Math.max(thr, -jy.y); if (jy.y > 0.08) brake = Math.max(brake, jy.y); str = -jy.x; }
  if (connected) {
    const raw = GP.raw, st = GP.state();
    thr = Math.max(thr, raw ? raw.trigger(7) : 0); brake = Math.max(brake, raw ? raw.trigger(6) : 0);
    if (Math.abs(st.lx) > 0.12) str = -st.lx;
    if (GP.down('A')) hand = true;
  }
  return { thr, brake, str, hand };
}
function wantsToggle() {
  const GP = window.GamepadKit;
  const f = S.down.F; S.down.F = false;
  return f || !!(GP && GP.connected && GP.connected() && GP.justPressed('Y'));
}

/* ---------- invite « Monter » ---------- */
function prompt(show, text) {
  if (!S.prompt) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;background:rgba(40,30,22,.82);' +
      'border:1px solid rgba(249,213,139,.85);color:#fbeed1;font:700 16px "Open Sans",system-ui,sans-serif;white-space:nowrap;max-width:96vw;z-index:60;pointer-events:none;display:none;' +
      'box-shadow:0 0 24px rgba(249,213,139,.35)';
    document.body.appendChild(d); S.prompt = d;
  }
  if (show) S.prompt.innerHTML = text; S.prompt.style.display = show ? 'block' : 'none';
}
const KBD = 'border:1px solid #f9d58b;border-radius:8px;padding:2px 10px;margin-right:8px';
function beamsWanted() { return S.lightsMan !== null ? S.lightsMan : nightLevel() > 0.3; }
function toggleLights() {
  S.lightsMan = !beamsWanted();
  window.GamepadKit?.toast?.(S.lightsMan ? '💡 Phares allumés' : 'Phares éteints');
}
function drivingHint() {
  const pad = window.GamepadKit && window.GamepadKit.connected && window.GamepadKit.connected();
  return `<kbd style="${KBD}">${pad ? 'R3' : 'V'}</kbd>Vue habitacle / extérieure<span style="opacity:.6;margin:0 10px">·</span><kbd style="${KBD}">${pad ? 'LB→RB' : 'L'}</kbd>Phares<span style="opacity:.6;margin:0 10px">·</span><kbd style="${KBD}">H</kbd>Détresse<span style="opacity:.6;margin:0 10px">·</span><kbd style="${KBD}">${pad ? '▲' : 'F'}</kbd>Descendre`;
}
function promptText(driving) {
  const pad = window.GamepadKit && window.GamepadKit.connected && window.GamepadKit.connected();
  const k = pad ? '▲' : 'F';
  return `<kbd style="${KBD}">${k}</kbd>${driving ? 'Descendre' : 'Monter dans la voiture'}`;
}

/* ---------- moteur (synthèse) ---------- */
function engineStart() {
  if (S.engine) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 380; g.gain.value = 0;
    o.connect(f); o2.connect(f); f.connect(g); g.connect(ctx.destination); o.start(); o2.start();
    window.GameAudio?.ctx?.(ctx, 'effects');
    S.engine = { ctx, o, o2, f, g };
  } catch (_) { S.engine = null; }
}
function engineUpdate(on) {
  const e = S.engine; if (!e) return;
  const t = e.ctx.currentTime, sp = Math.abs(S.speed) / MAX_FWD;
  const fr = 52 + sp * 95;
  e.o.frequency.setTargetAtTime(fr, t, 0.08); e.o2.frequency.setTargetAtTime(fr * 0.5, t, 0.08);
  e.f.frequency.setTargetAtTime(300 + sp * 700, t, 0.1);
  e.g.gain.setTargetAtTime(on ? 0.035 + sp * 0.03 : 0, t, 0.25);
}

/* ---------- clips du personnage (Blender) ---------- */
function loadClips() {
  if (S.clips || S.clipsLoading) return;
  S.clipsLoading = true;
  new GLTFLoader().load(ANIM_URL, (g) => { S.clips = {}; for (const c of g.animations) S.clips[c.name] = c; S.clipsLoading = false; },
    undefined, (e) => { S.clipsLoading = false; console.warn('[Voiture] animations indisponibles :', e); });
}
function setupActs() {
  const api = SM(), mixer = api.mixer();
  if (!mixer || !S.clips || !S.clips.car_sit_center) return false;
  api.resetActions();
  S.acts = {};
  for (const n of ['car_sit_center', 'car_sit_left', 'car_sit_right']) {
    const a = mixer.clipAction(S.clips[n], api.model());
    a.enabled = true; a.setLoop(THREE.LoopRepeat, Infinity); a.setEffectiveWeight(0); a.stop(); S.acts[n] = a;
  }
  return true;
}
function playSitBlend(wC, wL, wR, fade = 0) {
  for (const [n, w] of [['car_sit_center', wC], ['car_sit_left', wL], ['car_sit_right', wR]]) {
    const a = S.acts[n]; if (!a) continue;
    if (!a.isRunning() && w > 0) { a.reset(); a.play(); }
    a.setEffectiveWeight(w);
  }
}
function placeRootAt(localPos, yawWorld, followCar) {
  const api = SM(), root = api.root(); if (!root) return;
  _w.copy(localPos); car.group.localToWorld(_w);
  root.position.copy(_w);
  if (followCar) root.quaternion.copy(car.group.quaternion); else root.rotation.set(0, yawWorld, 0);
  root.scale.setScalar(followCar ? SEATED_SCALE : 1);
  api.pos.set(_w.x, _w.y + api.eyeHeight, _w.z);          // position « œil » vue par le reste du jeu (IA des sentinelles…)
  api.setYaw(yawWorld);
}

/* ---------- fondu du personnage (disparition / réapparition) ---------- */
let _fadeMats = null;
function fadeSet(alpha) {
  const model = SM().model(); if (!model) return;
  if (!_fadeMats) {
    _fadeMats = new Map();
    model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
        if (m && !_fadeMats.has(m)) _fadeMats.set(m, { t: m.transparent, o: m.opacity, d: m.depthWrite });
      }
    });
  }
  for (const [m, base] of _fadeMats) {
    if (alpha >= 0.999) { m.transparent = base.t; m.opacity = base.o; m.depthWrite = base.d; }
    else { m.transparent = true; m.opacity = base.o * Math.max(0, alpha); m.depthWrite = alpha > 0.6; }
  }
  const root = SM().root(); if (root) root.visible = alpha > 0.01;
}
function fadeEnd() { fadeSet(1); _fadeMats = null; }
function gadgetShow(on) { const g = SM().model()?.getObjectByName('Gadget_Nexus'); if (g) g.visible = on; }

/* ---------- séquences monter / descendre ---------- */
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function localToWorld(name, out) { const a = car.anchors[name]; return a ? a.getWorldPosition(out) : out.copy(pos); }
function doorStand(out) { out.copy(STAND); car.group.localToWorld(out); return out; }
const DUR = { walk: 0.4, open: 0.25, vanish: 0.22, appear: 0.28, close: 0.25 };      // montée / descente rapides

function startEnter() {
  if (!S.clips) { loadClips(); return; }
  const api = SM(); S.from.copy(api.pos); S.t = 0; S.st = ST.WALK_IN; window.__vehicleBusy = true; prompt(false);
  api.play('walk'); engineStart(); S.camMode = 0; S.camT = 0;
}
function startExit() {
  S.t = 0; S.st = ST.OPEN_OUT; window.__vehicleBusy = true; prompt(false); S.speed = 0; S.camMode = 0;
}

function tickSequence(dt) {
  const api = SM();
  const mixer = api.mixer();
  S.t += dt;
  const standW = new THREE.Vector3().copy(STAND); car.group.localToWorld(standW);
  const yawStand = S.yaw + STAND_YAW;
  const seated = () => { placeRootAt(SEAT_FLOOR, S.yaw, true); playSitBlend(1, 0, 0); };
  switch (S.st) {
    case ST.WALK_IN: {                                   // marche jusqu'à la portière
      const k = ease(clamp01(S.t / DUR.walk));
      _v.lerpVectors(S.from, new THREE.Vector3(standW.x, standW.y + api.eyeHeight, standW.z), k);
      const cur = api.getYaw(); const dy = Math.atan2(Math.sin(yawStand - cur), Math.cos(yawStand - cur));
      api.pos.copy(_v); api.setYaw(cur + dy * Math.min(1, dt * 8)); api.sync();
      if (S.t >= DUR.walk) { S.t = 0; S.st = ST.OPEN_IN; api.play('idle'); }
      break;
    }
    case ST.OPEN_IN: {                                   // la portière s'ouvre
      S.doorAmt = ease(clamp01(S.t / DUR.open));
      if (S.t >= DUR.open) { S.t = 0; S.st = ST.VANISH_IN; }
      break;
    }
    case ST.VANISH_IN: {                                 // le personnage s'efface…
      fadeSet(1 - ease(clamp01(S.t / DUR.vanish)));
      if (S.t >= DUR.vanish) {
        if (!setupActs()) { fadeEnd(); S.st = ST.PARKED; S.doorAmt = 0; window.__vehicleBusy = false; return; }
        S.t = 0; S.st = ST.APPEAR_IN; seated(); fadeSet(0); gadgetShow(false);            // …et réapparaît assis au volant
      }
      break;
    }
    case ST.APPEAR_IN: {
      seated();
      fadeSet(ease(clamp01(S.t / DUR.appear)));
      S.doorAmt = 1 - ease(clamp01((S.t - 0.15) / DUR.close));         // la portière se referme
      if (S.t >= DUR.appear + 0.15) { fadeEnd(); S.doorAmt = 0; S.st = ST.DRIVE; S.camInit = false; }
      break;
    }
    case ST.OPEN_OUT: {
      seated();
      S.doorAmt = ease(clamp01(S.t / DUR.open));
      if (S.t >= DUR.open) { S.t = 0; S.st = ST.VANISH_OUT; }
      break;
    }
    case ST.VANISH_OUT: {
      seated();
      fadeSet(1 - ease(clamp01(S.t / DUR.vanish)));
      if (S.t >= DUR.vanish) {
        S.t = 0; S.st = ST.APPEAR_OUT; S.acts = null; api.resetActions();
        placeRootAt(STAND, yawStand, false); api.play('idle'); fadeSet(0); gadgetShow(true);   // réapparaît devant la portière
      }
      break;
    }
    case ST.APPEAR_OUT: {
      placeRootAt(STAND, yawStand, false);
      fadeSet(ease(clamp01(S.t / DUR.appear)));
      S.doorAmt = 1 - ease(clamp01((S.t - 0.2) / DUR.close));
      if (S.t >= DUR.appear + 0.2) {
        fadeEnd(); S.st = ST.PARKED; S.doorAmt = 0; window.__vehicleBusy = false;
        api.setCameraYaw(S.yaw + Math.PI / 2); api.snapCamera(); api.setHeadFade(0);
        M.camera.near = 0.1; M.camera.updateProjectionMatrix();
      }
      break;
    }
  }
  if (mixer) mixer.update(dt);
  chaseCamera(dt, S.st === ST.DRIVE ? 1 : 0.55);
}

/* ---------- orbite autour de la voiture : stick droit (manette), glisser (souris / doigt) ; revient derrière la voiture au repos ---------- */
const ORB_PIT_MIN = -0.25, ORB_PIT_MAX = 0.95;
function orbitAdd(dyaw, dpit) {
  S.orbYaw += dyaw; S.orbPit = Math.max(ORB_PIT_MIN, Math.min(ORB_PIT_MAX, S.orbPit + dpit)); S.orbIdle = 0;
  if (S.orbYaw > Math.PI) S.orbYaw -= Math.PI * 2; if (S.orbYaw < -Math.PI) S.orbYaw += Math.PI * 2;
}
function overUi(el) { return !!(el && el.closest && el.closest('button, a, input, #snStick, .sn-btn, [id^="sn"], .gu-stage, #guRoot, .cm, .sn-scan-result')); }
window.addEventListener('pointerdown', (e) => {
  if (S.st !== ST.DRIVE || overUi(e.target)) return;
  S.orbDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
}, true);
window.addEventListener('pointermove', (e) => {
  const d = S.orbDrag; if (!d || d.id !== e.pointerId) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y; d.x = e.clientX; d.y = e.clientY;
  orbitAdd(-dx * 0.006, dy * 0.005);
}, true);
const endDrag = (e) => { if (S.orbDrag && S.orbDrag.id === e.pointerId) S.orbDrag = null; };
window.addEventListener('pointerup', endDrag, true); window.addEventListener('pointercancel', endDrag, true);
window.addEventListener('wheel', (e) => { if (S.st === ST.DRIVE && !overUi(e.target)) S.orbDist = Math.max(0.65, Math.min(1.6, (S.orbDist || 1) + e.deltaY * 0.0008)); }, { passive: true });
function orbitTick(dt) {
  const GP = window.GamepadKit;
  if (GP && GP.connected && GP.connected()) {
    const st = GP.state();
    if (Math.abs(st.rx) > 0.12 || Math.abs(st.ry) > 0.12) orbitAdd(-st.rx * 2.6 * dt, st.ry * 1.6 * dt);
  }
  S.orbIdle += dt;
  if (S.orbIdle > 2.2 && !S.orbDrag) {                              // rendu doucement derrière la voiture
    const k = 1 - Math.exp(-1.8 * dt);
    S.orbYaw -= S.orbYaw * k; S.orbPit -= S.orbPit * k;
  }
}

/* ---------- caméra : poursuite extérieure <-> habitacle (transition fluide par-dessus le toit) ---------- */
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3(), _cp1 = new THREE.Vector3(), _ct1 = new THREE.Vector3(), _cc = new THREE.Vector3();
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
let _camFovExt = 0;
function chaseCamera(dt, strength) {
  const cam = M.camera; if (!cam) return;
  if (!_camFovExt) _camFovExt = cam.fov;
  const dist = 8.2, h = 3.4;
  const targetYaw = S.yaw;
  if (!S.camInit) { S.camYaw = targetYaw; S.camInit = true; }
  const dy = Math.atan2(Math.sin(targetYaw - S.camYaw), Math.cos(targetYaw - S.camYaw));
  S.camYaw += dy * (1 - Math.exp(-3.2 * dt * strength));
  // vue extérieure (orbite : lacet + hauteur autour de la voiture)
  if (S.st === ST.DRIVE) orbitTick(dt); else { S.orbYaw = S.orbPit = 0; }
  const el = Math.atan2(h - 1.6, dist) + S.orbPit, rr = dist * (S.orbDist || 1), cyaw = S.camYaw + S.orbYaw;
  const boost = Math.min(1.2, Math.abs(S.speed) * 0.04) * (1 - Math.abs(S.orbYaw) / Math.PI);
  const place = (e) => _cp.set(pos.x - Math.sin(cyaw) * rr * Math.cos(e), pos.y + 1.6 + Math.sin(e) * rr + boost, pos.z - Math.cos(cyaw) * rr * Math.cos(e));
  place(el);
  const cols = envColliders();
  _ct.set(pos.x, pos.y + 1.6, pos.z);
  if (cols && cols.length) {
    // Un mur / une barrière entre la voiture et la caméra : la caméra DESCEND (elle passe sous la barrière, par l'ouverture) au lieu de monter
    // par-dessus ; si aucune hauteur n'est dégagée, elle se rapproche de la voiture, à l'altitude la plus basse.
    let clear = false;
    for (const e of [el, el * 0.6, el * 0.3, 0, -0.1]) {
      place(e);
      const d = _w.copy(_cp).sub(_ct); const len = d.length(); d.normalize();
      rc.set(_ct, d); rc.near = 0.2; rc.far = len;
      const hit = rc.intersectObjects(cols, false);
      if (!hit.length) { clear = true; break; }
      if (e === -0.1) _cp.copy(_ct).addScaledVector(d, Math.max(1.8, hit[0].distance - 0.5));
    }
    S.camLow = !clear;
  }
  const gy = groundAt(_cp.x, _cp.y, _cp.z); if (gy !== null && _cp.y < gy + 0.8) _cp.y = gy + 0.8;
  _ct.set(pos.x + Math.sin(S.yaw) * 2.2 * Math.cos(S.orbYaw), pos.y + 1.1, pos.z + Math.cos(S.yaw) * 2.2 * Math.cos(S.orbYaw));

  // transition 0 (extérieur) -> 1 (habitacle)
  const want = S.st === ST.DRIVE ? S.camMode : 0;
  S.camT += Math.sign(want - S.camT) * Math.min(Math.abs(want - S.camT), dt / 0.95);
  const u = ease(S.camT);
  if (u > 0.001) {
    // habitacle : yeux du conducteur, regard dans l'axe de la voiture, légèrement attiré vers l'intérieur du virage
    const head = SM().model()?.getObjectByName('mixamorigHead');
    if (head) head.getWorldPosition(_cp1); else { _cp1.set(0.44, 1.5, 0.1); car.group.localToWorld(_cp1); }
    _cp1.addScaledVector(_v.set(Math.sin(S.yaw), 0, Math.cos(S.yaw)), 0.12); _cp1.y += 0.14;
    const look = S.yaw + S.steer * 0.45 + Math.max(-2.2, Math.min(2.2, S.orbYaw));
    _ct1.set(_cp1.x + Math.sin(look) * 12, _cp1.y - 0.18 + Math.tan(-S.pitch * 0.6) * 12 * 0.2, _cp1.z + Math.cos(look) * 12);
    // trajectoire : arc par-dessus le toit
    _cc.addVectors(_cp, _cp1).multiplyScalar(0.5); _cc.y = Math.max(_cp.y, _cp1.y) + 2.4 * Math.sin(Math.PI * u);
    const a = 1 - u;
    _cp.multiplyScalar(a * a).addScaledVector(_cc, 2 * a * u).addScaledVector(_cp1, u * u);
    _ct.lerp(_ct1, u);
  }
  if (S.camT < 1 && S.camT > 0) cam.position.copy(_cp); else cam.position.lerp(_cp, u > 0.999 ? 1 : 1 - Math.exp(-9 * dt));
  _m4.lookAt(cam.position, _ct, _up); _qa.setFromRotationMatrix(_m4);
  if (u > 0.999) cam.quaternion.copy(_qa); else cam.quaternion.slerp(_qa, 1 - Math.exp(-10 * dt));
  const fov = _camFovExt + (74 - _camFovExt) * u;
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = fov; cam.near = u > 0.5 ? 0.05 : 0.1; cam.updateProjectionMatrix(); }
  SM().setHeadFade(clamp01((u - 0.55) / 0.35));        // la tête disparaît quand la caméra entre dans l'habitacle
}

/* ---------- conduite ---------- */
function drive(dt) {
  const inp = inputs();
  if (wantsToggle()) { startExit(); return; }
  const GPk = window.GamepadKit;
  if (S.down.V || (GPk && GPk.connected && GPk.connected() && GPk.justPressed('R3'))) { S.camMode = S.camMode ? 0 : 1; }
  S.down.V = false;
  if (GPk && GPk.connected && GPk.connected()) {                  // phares : L1 puis R1 (dans la seconde)
    if (GPk.justPressed('LB')) S.lbT = 1.0;
    else if (S.lbT > 0 && GPk.justPressed('RB')) { toggleLights(); S.lbT = 0; }
    S.lbT = Math.max(0, S.lbT - dt);
  }
  S.braking = (inp.brake > 0.05 && S.speed > 0.3) || (inp.hand && Math.abs(S.speed) > 0.3);
  const fwdX = Math.sin(S.yaw), fwdZ = Math.cos(S.yaw);
  // vitesse
  const climb = Math.max(0, S.slope || 0);                                      // pente montante (rad) mesurée à l'image précédente
  const torque = 1 + LOW_TORQUE * Math.max(0, 1 - Math.abs(S.speed) / 9) + CLIMB_POWER * climb;
  if (inp.thr > 0.02) S.speed += ACCEL * torque * inp.thr * dt * (S.speed < 0 ? 2 : 1 - Math.max(0, S.speed) / (MAX_FWD * (1.15 + 0.5 * climb)));
  if (climb > 0.05 && inp.thr < 0.02 && inp.brake < 0.02 && !inp.hand && S.speed > 0) S.speed -= Math.min(S.speed, 9.8 * Math.sin(climb) * 0.35 * dt);   // en côte sans gaz : la voiture ralentit un peu
  if (inp.brake > 0.02) S.speed -= (S.speed > 0.4 ? BRAKE : ACCEL * 0.7) * inp.brake * dt;
  if (inp.hand) S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), BRAKE * 0.9 * dt);
  if (inp.thr < 0.02 && inp.brake < 0.02) S.speed -= Math.sign(S.speed) * Math.min(Math.abs(S.speed), (DRAG * Math.abs(S.speed) + ROLL_DRAG) * dt);
  S.speed = Math.max(-MAX_REV, Math.min(MAX_FWD, S.speed));
  // braquage progressif, plus faible à haute vitesse
  const lim = MAX_STEER * (1 - 0.55 * Math.min(1, Math.abs(S.speed) / MAX_FWD));
  S.steer += (inp.str * lim - S.steer) * (1 - Math.exp(-STEER_RATE * dt));
  const yawRate = (S.speed / WHEEL_BASE) * Math.tan(S.steer) * (inp.hand ? 1.5 : 1);
  S.yaw += yawRate * dt;
  // déplacement + collisions
  const step = S.speed * dt;
  if (Math.abs(step) > 1e-4) {
    const dx = fwdX * Math.sign(step), dz = fwdZ * Math.sign(step);
    if (blockedAhead(dx, dz, Math.abs(step), 0.75)) { S.speed *= -0.25; if (Math.abs(step) / dt > 6 && performance.now() - (S.rumbleT || 0) > 900) { S.rumbleT = performance.now(); window.GamepadKit?.rumble?.(120, 0.5); } }
    else { pos.x += fwdX * step; pos.z += fwdZ * step; }
  }
  // suspension : 4 rayons au sol
  const cs = Math.cos(S.yaw), sn = Math.sin(S.yaw);
  const corner = (lx, lz) => groundAt(pos.x + cs * lx + sn * lz, pos.y + 1.0, pos.z - sn * lx + cs * lz);
  const hFL = corner(TRACK / 2, AX_F), hFR = corner(-TRACK / 2, AX_F), hRL = corner(TRACK / 2, -AX_R), hRR = corner(-TRACK / 2, -AX_R);
  const hs = [hFL, hFR, hRL, hRR].filter((h) => h !== null);
  if (hs.length === 4) {
    const avg = (hFL + hFR + hRL + hRR) / 4;
    const front = (hFL + hFR) / 2, rear = (hRL + hRR) / 2, left = (hFL + hRL) / 2, right = (hFR + hRR) / 2;
    const tp = Math.atan2(front - rear, WHEEL_BASE);                                                   // nez vers le haut = +
    const tr = Math.atan2(left - right, TRACK);
    // en three (YXZ) un tangage positif en X incline le nez vers le bas : on inverse
    S.slope = (S.slope || 0) + (tp - (S.slope || 0)) * (1 - Math.exp(-6 * dt));                    // pente lissée (>0 = montée)
    S.pitch += (-tp - S.pitch) * (1 - Math.exp(-9 * dt));
    S.roll += (tr - S.roll) * (1 - Math.exp(-9 * dt));
    pos.y += (avg - pos.y) * (1 - Math.exp(-14 * dt));
  } else if (hs.length) { pos.y += (hs[0] - pos.y) * (1 - Math.exp(-8 * dt)); }
  // ne sort pas du monde (limite large autour de la ville)
  if (pos.y < -20) place(PARK.x, PARK.z, PARK.yaw, true);
  S.spin += (S.speed * dt) / WHEEL_R;
  applyTransform();
  // le personnage assis suit la voiture ; les mains suivent le volant (mélange des clips centre/gauche/droite selon le braquage)
  placeRootAt(SEAT_FLOOR, S.yaw, true);
  const sl = Math.max(-1, Math.min(1, S.steer / MAX_STEER));
  const wL = Math.max(0, sl), wR = Math.max(0, -sl);
  playSitBlend(1 - wL - wR, wL, wR);
  const mixer = SM().mixer(); if (mixer) mixer.update(dt);
  chaseCamera(dt, 1);
  prompt(true, drivingHint());
  dustTick(dt, !onPlatform() && Math.abs(S.speed) > 1.5 ? Math.min(1, (Math.abs(S.speed) - 1.5) / 7) : 0);
  engineUpdate(true);
}

/* ---------- poussière ---------- */
function onPlatform() {            // sur la dalle de la base NÉANTIS : pas de poussière
  const nb = window.NeantisBase; if (!nb || !nb.loaded) return false;
  const c = nb.center; return Math.hypot(pos.x - c.x, pos.z - c.z) < 108;
}
const _dp = new THREE.Vector3();
function dustClear() {
  const d = car.dust; if (!d) return;
  const arr = d.pts.geometry.attributes.position.array;
  for (let i = 0; i < d.N; i++) { d.life[i] = 0; arr[i * 3 + 1] = -9999; }
  d.pts.geometry.attributes.position.needsUpdate = true;
}
function dustTick(dt, amount) {
  const d = car.dust; if (!d) return;
  const arr = d.pts.geometry.attributes.position.array;
  // émission régulière derrière les roues arrière (cadence indépendante du framerate) : le nuage suit la voiture et s'étire dans son sillage
  if (amount > 0.02) {
    d.acc += dt * (14 + 46 * amount);
    const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);
    while (d.acc >= 1) {
      d.acc -= 1;
      const a = car.anchors[(d.i & 1) ? 'Poussiere_ArG' : 'Poussiere_ArD']; if (!a) continue; a.getWorldPosition(_dp);
      const i = d.i; d.i = (d.i + 1) % d.N; d.life[i] = 1;
      arr[i * 3] = _dp.x + (Math.random() - 0.5) * 0.3; arr[i * 3 + 1] = _dp.y + 0.1; arr[i * 3 + 2] = _dp.z + (Math.random() - 0.5) * 0.3;
      d.vel[i].set((Math.random() - 0.5) * 0.9 - fx * S.speed * 0.12, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.9 - fz * S.speed * 0.12);
    }
  } else d.acc = 0;
  for (let i = 0; i < d.N; i++) {
    if (d.life[i] <= 0) { arr[i * 3 + 1] = -9999; continue; }
    d.life[i] -= dt * 0.8;
    arr[i * 3] += d.vel[i].x * dt; arr[i * 3 + 1] += d.vel[i].y * dt; arr[i * 3 + 2] += d.vel[i].z * dt;
    d.vel[i].multiplyScalar(1 - dt * 1.4);
  }
  d.pts.geometry.attributes.position.needsUpdate = true;
  d.pts.material.opacity = 0.7;
}

/* ---------- boucle ---------- */
let _blinkT = 0;
function lightsUpdate(dt = 0.016) {
  const n = nightLevel();
  const driving = S.st === ST.DRIVE || S.st === ST.APPEAR_IN || S.st === ST.OPEN_OUT || S.st === ST.VANISH_OUT;
  const beams = driving && beamsWanted();
  const k = beams ? 1 : 0;
  for (const m of car.headMats) m.emissiveIntensity = 0.4 + (beams ? 2.8 : 2.2 * n);
  const braking = S.st === ST.DRIVE && !!S.braking;
  const reversing = S.st === ST.DRIVE && S.speed < -0.25;
  for (const m of car.revMats) m.emissiveIntensity = 0.1 + (reversing ? 1.6 : 0);
  if (car.revGlow) for (const sp of car.revGlow) sp.material.opacity += ((reversing ? 0.4 : 0) - sp.material.opacity) * Math.min(1, dt * 18);
  if (car.revLight) car.revLight.intensity = reversing ? 3 : 0;
  for (const m of car.tailMats) m.emissiveIntensity = 0.2 + (beams ? 0.6 : 0.5 * n) + (braking ? 1.8 : 0);
  if (car.tailGlow) for (const sp of car.tailGlow) sp.material.opacity += ((braking ? 0.45 : (beams ? 0.1 : 0)) - sp.material.opacity) * Math.min(1, dt * 18);
  if (car.headGlow) for (const sp of car.headGlow) sp.material.opacity += ((beams ? 0.95 : 0) - sp.material.opacity) * Math.min(1, dt * 12);
  for (const l of car.lights) {
    if (!l.anchor) continue;
    l.anchor.getWorldPosition(l.L.position);
    // cible à 28 m devant, légèrement croisée (comme Bamako Drive)
    const side = l.anchor.name === 'Phare_G' ? -1 : 1, fx = Math.sin(S.yaw), fz = Math.cos(S.yaw), rx = fz, rz = -fx;
    l.tgt.position.set(car.group.position.x + fx * 28 + rx * side * 0.8, car.group.position.y - 0.2, car.group.position.z + fz * 28 + rz * side * 0.8);
    l.L.intensity = 620 * Math.max(n, 0.25) * k;
  }
  // clignotants : 2,6 Hz ; côté du braquage (seuil), ou feux de détresse
  _blinkT += dt;
  const phase = Math.floor(_blinkT * 2.6) % 2 === 0;
  const left = driving && (S.hazard || (S.steer > 0.12 && S.st === ST.DRIVE));
  const right = driving && (S.hazard || (S.steer < -0.12 && S.st === ST.DRIVE));
  if (car.ind) {
    for (const [side, on] of [['L', left], ['R', right]]) {
      const lit = on && phase;
      car.ind[side].forEach((m) => m.material.color.setHex(lit ? 0xffb020 : 0x4a2a05));
      car.indGlow[side].forEach((sp) => { sp.material.opacity = lit ? 0.95 : 0; });
    }
  }
  // éclairage intérieur : plafonnier la nuit ou phares allumés, lueur du tableau de bord dès qu'on conduit
  if (car.dome) car.dome.intensity = driving ? (beams ? 7 : 1.2 + 4 * n) : 0;
  if (car.dash) car.dash.intensity = driving ? 0.8 + 1.4 * n : 0;
}

const controller = {
  active() { return car.loaded && S.st !== ST.PARKED; },
  tick(dt) {
    if (!window.SanctuaryMode.isActive()) { reset(); return; }
    if (S.st === ST.PARKED && car.loaded && ((S._gt = (S._gt || 0) + dt) > 0.5)) {   // garée : on recolle au sol (tuiles chargées après coup, terrain corrigé)
      S._gt = 0; const g = findGround(pos.x, pos.z, S.parkHint != null && S.parkAt && Math.hypot(pos.x - S.parkAt.x, pos.z - S.parkAt.z) < 3 ? S.parkHint : pos.y);
      if (g !== null && Math.abs(g - pos.y) > 0.12) { pos.y = g; S.pendingGround = false; applyTransform(); }
    }
    if (S.st === ST.DRIVE) drive(dt); else tickSequence(dt);
  },
};
function reset() {
  S.lightsMan = null; S.hazard = false;
  if (_fadeMats) fadeEnd();
  try { if (SM()) gadgetShow(true); } catch (_) {}
  if (S.acts && SM()) { try { SM().resetActions(); } catch (_) {} S.acts = null; }
  S.camMode = 0; S.camT = 0;
  S.st = ST.PARKED; S.doorAmt = 0; S.speed = 0; S.held = {}; S.down = {}; window.__vehicleBusy = false; engineUpdate(false); dustClear();   // touches relâchées + poussière effacée : rien ne reste figé après une sortie brutale (labo)
  const r = SM() && SM().root(); if (r) r.visible = true;
}

let acc = 0, ctlSet = false;
/* La voiture n'existe pas pour un nouveau joueur : elle est révélée (et utilisable) une fois le premier dispositif récupéré — Tapama l'annonce alors */
function carUnlocked() { try { return localStorage.getItem('taama.dispositif1') === '1'; } catch (_) { return false; } }
let _errOnce = false;
M?.addFrameHook((dt) => { try { frame(dt); } catch (e) { if (!_errOnce) { _errOnce = true; console.error('[Voiture] erreur :', e && (e.stack || e)); } } });
function frame(dt) {
  if (!car.group) { acc += dt; if (acc > 0.8 && M.loaded && M.newCity) { acc = -999; load(); } return; }
  const sm = window.SanctuaryMode;
  if (!ctlSet && sm && sm.vehicle) { sm.vehicle.setController(controller); ctlSet = true; }
  const unlocked = carUnlocked();
  if (sm && sm.vehicle && car.colliders) {                               // collisions seulement tant que la voiture est là
    if (unlocked && !car.colAdded) car.colAdded = car.colliders.every((m) => sm.vehicle.addCollider(m));
    else if (!unlocked && car.colAdded) { car.colliders.forEach((m) => sm.vehicle.removeCollider(m)); car.colAdded = false; }
  }
  if (!unlocked) {
    car.group.visible = false; prompt(false); window.__vehicleBusy = false;
    if (S.st !== ST.PARKED) reset();
    return;
  }
  const act = sm && sm.isActive && sm.isActive();
  car.group.visible = true;
  if (!act) {
    if (S.st !== ST.PARKED) reset();
    prompt(false); window.__vehicleBusy = false;
    const gy0 = groundAt(pos.x, pos.y + 2, pos.z); if (gy0 !== null && Math.abs(gy0 - pos.y) > 0.02) pos.y = gy0;
    lightsUpdate(dt); applyTransform(); return;
  }
  if (S.st === ST.PARKED) {
    // sol sous la voiture (les colliders ne sont prêts qu'une fois le sanctuaire ouvert)
    const gy = groundAt(pos.x, pos.y + 2, pos.z); if (gy !== null) pos.y = Math.abs(gy - pos.y) > 0.6 ? gy : pos.y + (gy - pos.y) * Math.min(1, dt * 6);
    applyTransform();
    const api = sm.vehicle, st = doorStand(_v);
    const pp = api.pos;
    const near = Math.hypot(pp.x - st.x, pp.z - st.z) < BOARD_R && Math.abs((pp.y - api.eyeHeight) - pos.y) < 2.2;
    const free = !document.querySelector('.sn-scan-result.visible');
    window.__vehicleBusy = near && free;                              // ▲ ne doit pas déclencher l'ancien raccourci « sanctuaire »
    prompt(near && free, promptText(false));
    if (near && free && wantsToggle()) startEnter();
    S.down.F = false;
    engineUpdate(false);
  } else if (S.st !== ST.DRIVE) { prompt(false); }
  lightsUpdate(dt);
}

window.Vehicle = {
  get loaded() { return car.loaded; },
  get state() { return S.st; },
  get position() { return pos; },
  get speed() { return S.speed; },
  get yaw() { return S.yaw; },
  park(x, z, yaw, yHint) { place(x, z, yaw, true, yHint); },
  parkNear(cx, cz, yRef, fb) { const f = freeSpotNear(cx, cz, yRef) || fb; if (f) place(f.x, f.z, f.yaw, true, yRef); return !!f; },     // gare la voiture sur une place libre près de (cx, cz) ; fb = emplacement de secours
  enter() { if (car.loaded && S.st === ST.PARKED) startEnter(); },
  exit() { if (S.st === ST.DRIVE) startExit(); },
  pause(on) { if (on) { S.speed = 0; engineUpdate(false); dustClear(); S.held = {}; } },   // monde gelé (labo, dossier) : moteur coupé, touches relâchées ; la conduite reprend ensuite telle quelle
  release() { if (S.st !== ST.PARKED) reset(); },     // sort aussitôt du véhicule (scène de labo, S4) : la voiture reste où elle est
  get ground() { return pos.y; },
  group: () => car.group,
  audit() {
    const out = { spots: [], rev: car.revMats.length, head: car.headMats.length, tail: car.tailMats.length };
    for (const l of car.lights) { const w = l.L.getWorldPosition(new THREE.Vector3()), tg = l.tgt.getWorldPosition(new THREE.Vector3()), an = l.anchor.getWorldPosition(new THREE.Vector3());
      out.spots.push({ ecartLampe: +w.distanceTo(an).toFixed(2), versLaCible: [+(tg.x - w.x).toFixed(1), +(tg.y - w.y).toFixed(1), +(tg.z - w.z).toFixed(1)], devant: +((tg.x - w.x) * Math.sin(S.yaw) + (tg.z - w.z) * Math.cos(S.yaw)).toFixed(1), intensite: +l.L.intensity.toFixed(0) }); }
    out.emi = { head: car.headMats.map((m) => +m.emissiveIntensity.toFixed(2)), rev: car.revMats.map((m) => +m.emissiveIntensity.toFixed(2)), tail: car.tailMats.map((m) => +m.emissiveIntensity.toFixed(2)) };
    return out;
  },
  debug() {
    const api = SM(); if (!api) return null; const st = doorStand(new THREE.Vector3()), pp = api.pos;
    return { stand: st.toArray().map((v) => +v.toFixed(1)), player: pp.toArray().map((v) => +v.toFixed(1)), car: pos.toArray().map((v) => +v.toFixed(1)),
             dist: +Math.hypot(pp.x - st.x, pp.z - st.z).toFixed(2), dy: +((pp.y - api.eyeHeight) - pos.y).toFixed(2), scan: !!document.querySelector('.sn-scan-result.visible'),
             active: !!(window.SanctuaryMode && window.SanctuaryMode.isActive()), smState: api.state(),
             head: (() => { const h = api.model() && api.model().getObjectByName('mixamorigHead'); return h ? h.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null; })(),
             hips: (() => { const h = api.model() && api.model().getObjectByName('mixamorigHips'); return h ? h.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null; })(),
             hand: (() => { const h = api.model() && api.model().getObjectByName('mixamorigLeftHand'); return h ? h.getWorldPosition(new THREE.Vector3()).toArray().map((v) => +v.toFixed(2)) : null; })(),
             meshes: (() => { const m = api.model(); const out = {}; if (!m) return out; m.updateMatrixWorld(true); m.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); const b = o.boundingBox.clone().applyMatrix4(o.matrixWorld); out[o.name] = [+(b.min.y - pos.y).toFixed(2), +(b.max.y - pos.y).toFixed(2)]; } }); return out; })(),
             root: api.root() ? api.root().position.toArray().map((v) => +v.toFixed(2)) : null, rootScale: api.root() ? api.root().scale.x : null, camMode: S.camMode, camT: +S.camT.toFixed(2), pitch: +S.pitch.toFixed(3), roll: +S.roll.toFixed(3), carY: +pos.y.toFixed(2), grp: car.group ? car.group.position.y : null,
             weights: S.acts ? Object.fromEntries(Object.entries(S.acts).map(([k, v]) => [k, +v.getEffectiveWeight().toFixed(2)])) : null, st: S.st };
  },
};
