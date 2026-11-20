/* ==========================================================
   MODE JEU — Pilotage de drone (vol libre dans la maquette)
   Dépend de window.MosqueScene exposé par mosque-viewer.js.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Accélération des collisions : raycast via BVH (O(log n)) au lieu de la force brute
// (la mosquée fait ~1,7 M triangles -> sans BVH, ~170 ms/frame près d'elle = saccade).
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/* Son scanner */
const _scannerSound = new Audio('assets/audio/scanner_sound.mp3');
_scannerSound.preload = 'auto';
_scannerSound.volume  = 0.85;
const _playScanner = () => { _scannerSound.currentTime = 0; _scannerSound.play().catch(() => {}); };

/* Son marche — joué quand le joystick est actif */
const _walkSoundGame = new Audio('assets/audio/walking_sound_for_inside.mp3');
_walkSoundGame.preload = 'auto';
_walkSoundGame.loop    = false;
_walkSoundGame.volume  = 0.7;

/* Déverrouillage iOS : play+pause synchrone sur premier geste */
document.addEventListener('audioUnlock', () => {
  [_scannerSound, _walkSoundGame].forEach(a => {
    a.play().catch(() => {}); a.pause(); a.currentTime = 0;
  });
}, { once: true });
_walkSoundGame.addEventListener('timeupdate', () => {
  if (_walkSoundGame.currentTime >= 29) {
    _walkSoundGame.currentTime = 0;
    _walkSoundGame.play().catch(() => {});
  }
});
let _walkGamePlaying = false;
const _startWalkGame = () => { if (!_walkGamePlaying) { _walkGamePlaying = true; _walkSoundGame.play().catch(() => {}); } };
const _stopWalkGame  = () => { if (_walkGamePlaying)  { _walkGamePlaying = false; _walkSoundGame.pause(); _walkSoundGame.currentTime = 0; } };

/* Son drone part — joué 30s après le début du jeu */
const _dronePart = new Audio('assets/audio/sound_for_drone_part.mp3');
_dronePart.preload = 'auto';
let _dronePartTimer = null;

_dronePart.addEventListener('timeupdate', () => {
  if (_dronePart.currentTime >= 90) {
    const vol = Math.max(0, 0.9 - (_dronePart.currentTime - 90) / 10);
    _dronePart.volume = vol;
  }
});

const _playDronePart = () => {
  if (typeof soundOn !== 'undefined' && !soundOn) return;
  _dronePart.currentTime = 0;
  _dronePart.volume = 0.9;
  _dronePart.play().catch(() => {});
};

const hud          = document.getElementById('droneHud');
const rotateEl     = document.getElementById('droneRotate');
const btnQuit      = document.getElementById('dgQuit');
const takeoffHint  = document.getElementById('dgTakeoffHint');

const elHeading = document.getElementById('dgHeading');
const elFan     = document.getElementById('dgFan');
const elAngle   = document.getElementById('dgAngle');
const elSpeed   = document.getElementById('dgSpeed');
const elAlt     = document.getElementById('dgAlt');
const elBatt    = document.getElementById('dgBatt');
const elSignal  = document.getElementById('dgSignal');

let battery = 100;
let hudAccum = 0;
const _prevPos = new THREE.Vector3();

const btnPhoto      = document.getElementById('dgPhoto');
const btnGallery    = document.getElementById('dgGallery');
const galleryPanel  = document.getElementById('dgGalleryPanel');
const photos = [];   // dataURL des captures de la session

const btnVideo = document.getElementById('dgVideo');
let recorder = null, chunks = [];

let night = false;
let dayBg = null, dayFog = null;

const btnList = document.getElementById('dgList');
const poiPanel = document.getElementById('dgPoi');

// Retourne les POIs avec positions adaptées petit/grand écran
function getPois(){
  const small = window.innerWidth < 900;
  return [
    { nom:'Grande Mosquée',  abs:false, dy:20,  dz:55  },
    { nom:'Façade',          abs:true,  pos: new THREE.Vector3(-10.957, 18.129, 103.98) },
    { nom:'Minarets',        abs:true,
      pos: small
        ? new THREE.Vector3(-60.028, 12.889, 47.671)
        : new THREE.Vector3(-54.34,  13.536, 44.068),
      yaw: small
        ? Math.atan2(0.887, -0.443) + Math.PI   // dir petit écran inversée
        : Math.atan2(0.768, -0.641) + Math.PI   // dir grand écran inversée
    },
    { nom:'Cour extérieure', abs:true,  pos: small
        ? new THREE.Vector3(79.788, 49.261, -98.889)
        : new THREE.Vector3(45.611, 39.035, -65.006) },
    { nom:'Vue d\'ensemble', abs:false, dy:80,  dz:160 },
  ];
}

let active = false;
let M = null;                 // référence vers window.MosqueScene

/* ---------- Scan radar — Oeufs d'autruche ---------- */
let oeufsMesh     = null;
let oeufCenter    = new THREE.Vector3();
let oeufSearched  = false;   // traverse une seule fois
let scanState     = 'idle';     // 'idle' | 'scanning' | 'cooldown'
let scanElapsed   = 0;          // temps écoulé dans la zone (animation continue)
let scanCooldownT = 0;
let panelShown    = false;      // panel déjà affiché dans ce passage ?
const SCAN_DIST     = 28;       // zone d'entrée : scanner + laser apparaissent
const SCAN_COOLDOWN = 6;
const SCAN_R        = 18;       // rayon du radar 3D (agrandi)

let scanGroup    = null;
let sweepPivot   = null;
let sweepArmMat  = null;
let outerRingMat = null;
let pulseRings   = [];
let laserLine    = null, laserMat = null;
let _lidarAngles = null, _lidarLens = null, _lidarElev = null;
const _LIDAR_N   = 80;

// --- Panel HTML ---
const scanPanel = document.createElement('div');
scanPanel.id = 'dgScanPanel';
scanPanel.innerHTML = `
  <div class="dg-scan-hud" id="dgScanHud">
    <div class="dg-scan-radar">
      <div class="dg-scan-sweep"></div>
      <div class="dg-scan-dot"></div>
    </div>
    <div class="dg-scan-info">
      <div class="dg-scan-label">ANALYSE EN COURS</div>
      <div class="dg-scan-bar"><div class="dg-scan-progress" id="dgScanProgress"></div></div>
    </div>
  </div>
  <div class="dg-scan-result" id="dgScanResult">
    <div class="dg-scan-result-header">◈ ANALYSE COMPLÈTE</div>
    <p class="mq-info-title" style="font-size:.9rem;margin:.4em auto .5em;letter-spacing:1px;">ŒUFS D'AUTRUCHE</p>
    <ul class="mq-info-list">
      <li>Coiffent la <strong>pointe de chaque tour</strong> de la façade de la prière</li>
      <li>On leur associe souvent une idée de <strong>pureté et de fécondité</strong></li>
      <li>Refaits avec le bâtiment lors du <strong>grand crépissage</strong> chaque année</li>
    </ul>
    <button class="dg-scan-close">FERMER ✕</button>
  </div>
`;
document.body.appendChild(scanPanel);
/* Affiche le panel résultat après la fin du son scanner */
function _showScanPanel(){
  if (panelShown || scanState !== 'scanning') return;
  panelShown = true;
  const result = document.getElementById('dgScanResult');
  result.classList.remove('visible');          // reset animation si rejouée
  void result.offsetWidth;
  result.classList.add('visible');
}

scanPanel.querySelector('.dg-scan-close').addEventListener('click', () => {
  document.getElementById('dgScanResult').classList.remove('visible');
  if (laserMat) laserMat.opacity = 0;
  if (scanGroup) scanGroup.visible = false;
  document.getElementById('dgScanHud')?.classList.remove('visible');
  _scannerSound.removeEventListener('ended', _showScanPanel);
  scanState = 'cooldown';
  scanCooldownT = SCAN_COOLDOWN;
});

function initScan(){
  scanGroup = new THREE.Group();

  // Anneau extérieur — violet
  outerRingMat = new THREE.MeshBasicMaterial({ color:0x55415d, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false });
  const outerRing = new THREE.Mesh(new THREE.RingGeometry(SCAN_R*0.92, SCAN_R, 64), outerRingMat);
  outerRing.rotation.x = -Math.PI/2;
  scanGroup.add(outerRing);

  // Anneau intérieur (2ème cercle) — or
  const innerMat = new THREE.MeshBasicMaterial({ color:0xf9d58b, transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false });
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(SCAN_R*0.44, SCAN_R*0.46, 48), innerMat);
  innerRing.rotation.x = -Math.PI/2;
  pulseRings.push({ mesh:innerRing, mat:innerMat, phase:0, isInner:true });
  scanGroup.add(innerRing);

  // Bras de balayage — or
  sweepPivot  = new THREE.Object3D();
  sweepArmMat = new THREE.LineBasicMaterial({ color:0xf9d58b, transparent:true, opacity:0, depthWrite:false });
  const armPts = [new THREE.Vector3(0,0,0), new THREE.Vector3(SCAN_R*0.95,0,0)];
  const arm = new THREE.Line(new THREE.BufferGeometry().setFromPoints(armPts), sweepArmMat);
  sweepPivot.add(arm);
  scanGroup.add(sweepPivot);

  // Anneaux pulsants (3 staggerés) — alternance violet/or
  const pulseColors = [0xf9d58b, 0x55415d, 0xf9d58b];
  for(let i=0; i<3; i++){
    const mat = new THREE.MeshBasicMaterial({ color:pulseColors[i], transparent:true, opacity:0, side:THREE.DoubleSide, depthWrite:false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.5, 48), mat);
    mesh.rotation.x = -Math.PI/2;
    pulseRings.push({ mesh, mat, phase:i/3, isInner:false });
    scanGroup.add(mesh);
  }

  // Éventail LiDAR — 80 rayons en cône depuis le drone (style terrain scanner)
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(_LIDAR_N * 6), 3));
  laserMat = new THREE.LineBasicMaterial({ color:0xffffff, transparent:true, opacity:0, depthWrite:false });
  laserLine = new THREE.LineSegments(lGeo, laserMat);
  laserLine.frustumCulled = false;
  // Pré-calcul des angles et longueurs (déterministe, pas de random par frame)
  _lidarAngles = new Float32Array(_LIDAR_N);
  _lidarLens   = new Float32Array(_LIDAR_N);
  _lidarElev   = new Float32Array(_LIDAR_N);
  for (let i = 0; i < _LIDAR_N; i++){
    _lidarAngles[i] = (i / _LIDAR_N) * Math.PI * 2;
    // Deux couches : intérieure (dense, courte) + extérieure (large, longue)
    if (i < 40){
      _lidarLens[i]  = 18 + (i % 5) * 2;      // 18..26 u — cône intérieur
      _lidarElev[i]  = 0.20 + (i % 4) * 0.08; // 0.20..0.44 rad
    } else {
      _lidarLens[i]  = 28 + (i % 7) * 3;      // 28..46 u — cône extérieur
      _lidarElev[i]  = 0.52 + (i % 5) * 0.10; // 0.52..0.92 rad
    }
  }

  M.scene.add(scanGroup);
  M.scene.add(laserLine);
}

function tickScan(dt){
  if(!oeufsMesh && !oeufSearched && M?.scene){
    oeufSearched = true;
    M.scene.traverse((o) => {
      if(!oeufsMesh && o.isMesh && /Oeufs_Autruche/i.test(o.name)){
        oeufsMesh = o;
        new THREE.Box3().setFromObject(o).getCenter(oeufCenter);
      }
    });
  }
  if(!oeufsMesh || !scanGroup) return;

  const distToOeufs = rig.position.distanceTo(oeufCenter);

  if(scanState === 'idle'){
    if(distToOeufs < SCAN_DIST){
      scanState   = 'scanning';
      scanElapsed = 0;
      panelShown  = false;
      scanGroup.position.copy(oeufCenter);
      scanGroup.visible = true;
      _playScanner();
      document.getElementById('dgScanHud').classList.add('visible');
      // Panel affiché uniquement à la fin du son scanner
      _scannerSound.addEventListener('ended', _showScanPanel, { once: true });
    }
  } else if(scanState === 'scanning'){
    scanElapsed += dt;

    // Bras tournant continu (1 tour/1.6s)
    sweepPivot.rotation.y = scanElapsed * (Math.PI * 2 / 1.6);
    sweepArmMat.opacity   = Math.min(scanElapsed * 4, 0.9);
    outerRingMat.opacity  = Math.min(scanElapsed * 3, 0.65);

    // Anneaux pulsants
    pulseRings.forEach(({ mesh, mat, phase, isInner }) => {
      if(isInner){ mat.opacity = Math.min(scanElapsed*3, 0.55); return; }
      const t = ((scanElapsed * 0.5) + phase) % 1;
      mesh.scale.setScalar(t * SCAN_R / 0.5);
      mat.opacity = t < 0.7 ? (1 - t / 0.7) * 0.65 : 0;
    });

    // Éventail LiDAR — cône rotatif depuis le drone vers le bas
    const lp  = laserLine.geometry.attributes.position;
    const bx  = rig.position.x, by = rig.position.y, bz = rig.position.z;
    const spin = scanElapsed * 1.8;
    for (let i = 0; i < _LIDAR_N; i++){
      const ang  = _lidarAngles[i] + spin;
      const elev = _lidarElev[i];
      const len  = _lidarLens[i];
      lp.setXYZ(i * 2,     bx, by, bz);
      lp.setXYZ(i * 2 + 1,
        bx + Math.sin(ang) * Math.sin(elev) * len,
        by - Math.cos(elev) * len,
        bz + Math.cos(ang) * Math.sin(elev) * len
      );
    }
    lp.needsUpdate = true;
    laserMat.opacity = 0.50 + Math.sin(scanElapsed * 2.5) * 0.18;

    // Drone sort de la zone → éteint le scanner et annule l'affichage du panel
    if(distToOeufs >= SCAN_DIST){
      scanState = 'cooldown';
      scanCooldownT = SCAN_COOLDOWN;
      scanGroup.visible = false;
      laserMat.opacity  = 0;
      document.getElementById('dgScanHud').classList.remove('visible');
      _scannerSound.removeEventListener('ended', _showScanPanel);
      _scannerSound.pause();
      _scannerSound.currentTime = 0;
    }
  } else {
    scanCooldownT -= dt;
    if(scanCooldownT <= 0) scanState = 'idle';
  }
}

const rig = new THREE.Object3D();        // position + orientation (yaw) du drone
let rigAdded = false;

const DRONE_URL = 'assets/models/drone.glb';
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';
let droneModel = null, droneMixer = null;
const actions = {};       // nom de clip -> AnimationAction
let currentClip = '';
let modelLoading = false, modelLoaded = false;

// Entrées normalisées -1..1 (gauche: lx=yaw, ly=altitude ; droite: rx=strafe, ry=avance)
const input = { lx:0, ly:0, rx:0, ry:0 };

// Vitesses (amorties) en unités/s
const vel = { fwd:0, side:0, up:0, yaw:0 };

// Réglages de vol (unités de la scène ; la maquette fait ~plusieurs centaines d'u.)
const SPEED   = 60;     // vitesse linéaire max
const UPSPEED = 40;     // vitesse verticale max
const YAWRATE = 0.7;    // rad/s de rotation max (ralenti : évite la toupie)
const DAMP    = 4;      // amortissement (plus grand = plus réactif)

const _fwd  = new THREE.Vector3();
const _side = new THREE.Vector3();
const _camPos = new THREE.Vector3();
let camYaw = 0;         // cap lissé de la caméra : elle tourne AVEC le drone (pas de "rodéo")
let landed = false;     // drone posé au sol et immobile -> hélices arrêtées
let propSpeed = 1;      // vitesse de l'animation (hélices), lissée : 1 en vol, 0 posé

/* --- Caméra orbitale (quand drone posé) --- */
let orbitMode      = false;   // true : l'utilisateur peut faire pivoter la cam librement
let orbitReturning = false;   // true : retour fluide vers la position chase après décollage
let orbitAzim      = 0;       // angle horizontal courant (rad)
let orbitElev      = 0;       // angle vertical courant (rad)
const ORBIT_HDIST  = 7;       // distance horizontale caméra–drone (= chase cam)
const ORBIT_VOFF   = 3;       // offset vertical repos (= chase cam)
const ORBIT_ELEV_MIN = -0.15; // limite basse (légèrement sous l'horizon)
const ORBIT_ELEV_MAX =  1.20; // limite haute (presque zénith)
let _orbitDragId   = null;    // pointerId du doigt actif
let _orbitDragX    = 0;
let _orbitDragY    = 0;
let _orbitInited   = false;   // listeners ajoutés une seule fois

/* ---------- Orientation paysage ---------- */
function isLandscape(){
  return window.matchMedia('(orientation: landscape)').matches;
}

async function goLandscape(){
  // Plein écran IMMERSIF : cache la barre de navigation du navigateur.
  // navigationUI:'hide' = indice explicite ; préfixes pour anciens Safari/Chrome.
  const el = document.documentElement;
  try {
    if (el.requestFullscreen)            await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();   // Safari / vieux Chrome
    else if (el.msRequestFullscreen)     await el.msRequestFullscreen();
  } catch(_) {
    try { if (el.requestFullscreen) await el.requestFullscreen(); } catch(__){}   // repli sans options
  }
  // Lock paysage (Android/Chrome ; absent sur iOS -> exception ignorée)
  try { await screen.orientation.lock('landscape'); } catch(_){}
  syncOrientationUi();
}

function syncOrientationUi(){
  if (!active) return;
  if (isLandscape()){
    rotateEl.classList.remove('is-on');
    rotateEl.setAttribute('aria-hidden','true');
    hud.classList.add('is-on');
    hud.setAttribute('aria-hidden','false');
  } else {
    // iOS / portrait : on masque le HUD et on demande de tourner le téléphone
    hud.classList.remove('is-on');
    rotateEl.classList.add('is-on');
    rotateEl.setAttribute('aria-hidden','false');
  }
}
window.addEventListener('orientationchange', syncOrientationUi);
window.addEventListener('resize', syncOrientationUi);

// iOS/iPadOS Safari ne peut pas cacher ses barres (pas de plein écran web). Sur ces
// appareils seulement, on marque le HUD pour qu'il tienne dans la zone VISIBLE
// (100svh) -> les joysticks/barre d'outils du bas remontent et ne sont plus coupés.
(function markBarDevices(){
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
                     window.matchMedia('(display-mode: standalone)').matches ||
                     window.matchMedia('(display-mode: fullscreen)').matches;
  if (isIOS && !standalone) hud.classList.add('dg-bar');
})();

/* ---------- Drag orbital (caméra libre quand posé) ----------
   Écoute les gestes sur le canvas WebGL.
   Les joysticks capturent leurs propres pointeurs (setPointerCapture) →
   un doigt sur un joystick ne déclenche PAS ces listeners. */
function _initOrbitDrag(){
  if (_orbitInited) return;
  _orbitInited = true;
  const canvas = M.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    if (!orbitMode) return;
    if (_orbitDragId !== null) return;   // un seul doigt à la fois
    _orbitDragId = e.pointerId;
    _orbitDragX  = e.clientX;
    _orbitDragY  = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!orbitMode || e.pointerId !== _orbitDragId) return;
    const dx = e.clientX - _orbitDragX;
    const dy = e.clientY - _orbitDragY;
    _orbitDragX = e.clientX;
    _orbitDragY = e.clientY;
    orbitAzim -= dx * 0.006;                        // glisse horizontal → tourne autour du drone
    orbitElev  = Math.max(ORBIT_ELEV_MIN,
                   Math.min(ORBIT_ELEV_MAX,
                     orbitElev + dy * 0.004));       // glisse vertical → monte/descend le regard
  });

  const _relOrbit = (e) => { if (e.pointerId === _orbitDragId) _orbitDragId = null; };
  canvas.addEventListener('pointerup',     _relOrbit);
  canvas.addEventListener('pointercancel', _relOrbit);
}

/* ---------- Chargement du modèle ---------- */
function loadDrone(){
  if (modelLoading || modelLoaded) return;
  modelLoading = true;
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  loader.load(DRONE_URL, (gltf)=>{
    droneModel = gltf.scene;


    // Normaliser la taille à ~12 unités (échelle de la maquette)
    const box = new THREE.Box3().setFromObject(droneModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    droneModel.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    droneModel.scale.setScalar(DRONE_SIZE / maxDim);
    droneModel.rotation.y = Math.PI / 2;   // aligne le nez du drone sur le sens du vol (sinon il vole de profil)
    droneModel.traverse((o) => {
      if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; }
    });
    rig.add(droneModel);

    droneMixer = new THREE.AnimationMixer(droneModel);
    gltf.animations.forEach((clip)=>{
      const a = droneMixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      actions[clip.name] = a;
    });
    if (actions['Idle_Hover']){ actions['Idle_Hover'].play(); currentClip = 'Idle_Hover'; }
    modelLoaded = true; modelLoading = false;
  }, undefined, (err)=>{ console.error('Erreur chargement drone.glb :', err); modelLoading = false; });
}

/* ---------- Entrée / sortie ---------- */
function enter(){
  if (active) return;
  M = window.MosqueScene;
  if (!M) return;
  active = true;

  if (!rigAdded){ M.scene.add(rig); rigAdded = true; }
  rig.visible = true;                 // réaffiche le drone en entrant en mode jeu
  loadDrone();

  // Position de départ : coordonnées Blender converties en Three.js (Y-up)
  //   Blender (X=-12.206, Y=-77.37, Z=2.6166)
  //   → Three.js (X=-12.206, Y=2.6166, Z=77.37)
  rig.position.set(-12.206, 2.6166, 77.37);
  rig.rotation.set(0, 0, 0);  // drone face à la mosquée (front local = -Z = vers Z=0)
  camYaw = 0;                 // caméra derrière le drone (+Z), mosquée devant
  vel.fwd = vel.side = vel.up = vel.yaw = 0;
  battery = 100;
  _prevPos.copy(rig.position);

  // Activer directement la caméra orbitale (drone posé au sol dès le départ)
  // orbitElev légèrement négatif : caméra plus basse → regarde légèrement vers le haut
  // → mosquée visible en haut du cadre, drone en bas (vue comme dans Blender)
  orbitMode      = true;
  orbitReturning = false;
  orbitAzim      = 0;       // caméra derrière le drone (+Z)
  orbitElev      = -0.15;   // caméra légèrement sous le niveau du drone → regard vers le haut

  // Masquer l'UI normale, couper les OrbitControls
  document.querySelector('.mq-ui')?.classList.add('dg-hidden');
  M.controls.enabled = false;

  goLandscape();
  syncOrientationUi();
  sndStart();
  _initOrbitDrag();

  if (!scanGroup) initScan();
  if (typeof window.stopModelWind === 'function') window.stopModelWind();
  _dronePartTimer = setTimeout(_playDronePart, 30000);

  // Affiche le message "décolle" — disparaîtra au premier envol
  takeoffHint.classList.add('is-on');

  M.setGameUpdate(update);
}

function exit(){
  if (!active) return;
  active = false;
  if (_dronePartTimer) { clearTimeout(_dronePartTimer); _dronePartTimer = null; }
  _dronePart.pause(); _dronePart.currentTime = 0;
  _stopWalkGame();
  if (recorder){ try { recorder.stop(); } catch(_){} }
  sndStop();
  orbitMode = false; orbitReturning = false; _orbitDragId = null;

  M.setGameUpdate(null);
  scanState = 'idle'; scanElapsed = 0;
  if (laserMat) laserMat.opacity = 0;
  if (scanGroup) scanGroup.visible = false;
  document.getElementById('dgScanHud')?.classList.remove('visible');
  document.getElementById('dgScanResult')?.classList.remove('visible');
  rig.visible = false;                // masque le drone hors du mode jeu (vue d'ensemble)
  hud.classList.remove('is-on');
  hud.setAttribute('aria-hidden','true');
  rotateEl.classList.remove('is-on');
  takeoffHint.classList.remove('is-on');

  try { screen.orientation.unlock(); } catch(_){}
  try {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch(_){}

  document.querySelector('.mq-ui')?.classList.remove('dg-hidden');
  M.controls.enabled = true;

  // Retour à la vue d'ensemble (restaure le clamp anti-sol + resynchronise la cible OrbitControls,
  // sinon la caméra peut sauter à la 1re frame et on pourrait passer sous le sol)
  M.controls.maxPolarAngle = Math.PI * 0.495;
  M.camera.position.set(M.viewOverview.x, M.viewOverview.y, M.viewOverview.z);
  M.controls.target.copy(M.viewTarget);
  M.controls.update();
  if (typeof window.playModelWind  === 'function') window.playModelWind();
}

/* ---------- Choix de l'animation selon le vol ---------- */
function pickClip(){
  const ax = Math.abs(input.lx), ay = Math.abs(input.ly);
  const arx = Math.abs(input.rx), ary = Math.abs(input.ry);
  const max = Math.max(ax, ay, arx, ary);
  if (max < 0.15) return 'Idle_Hover';
  // Le modèle est tourné de π/2 : les clips de déplacement apparaissent pivotés de 90°.
  // On choisit donc le clip dont l'inclinaison VISIBLE correspond au sens réel du déplacement.
  if (ary === max) return input.ry < 0 ? 'Move_Left'      : 'Move_Right';      // haut→avance / bas→recule
  if (arx === max) return input.rx < 0 ? 'Move_Forward'   : 'Move_Backward';   // gauche→gauche / droite→droite
  if (ay  === max) return input.ly < 0 ? 'Ascend_Up'      : 'Descend_Down';
  // Lacet : on N'UTILISE PAS les clips Yaw_Rotate* (ils font tourner le corps de 360°
  // en boucle = effet "rodéo"). La vraie rotation est portée par le rig + la caméra qui
  // suit ; le drone reste en vol stationnaire stable pendant qu'il pivote.
  return 'Idle_Hover';
}

function setClip(name){
  if (name === currentClip || !actions[name]) return;
  const next = actions[name];
  const prev = actions[currentClip];
  next.reset().play();
  if (prev) prev.crossFadeTo(next, 0.25, false);
  else next.fadeIn(0.25);
  currentClip = name;
}

/* ---------- Collisions (raycasting) ---------- */
const raycaster = new THREE.Raycaster();
let colliders = null;                 // meshes solides (construits une fois)
const DRONE_SIZE    = 1.3;            // taille du drone (minuscule face à la mosquée ~20m ; caméra rapprochée)
const CLEARANCE     = 0.8;            // garde au sol (les patins effleurent la surface)
const DRONE_RADIUS  = DRONE_SIZE / 2; // demi-largeur approx du drone (anti-mur)
const _down       = new THREE.Vector3(0, -1, 0);
const _rayOrigin  = new THREE.Vector3();
const _move       = new THREE.Vector3();
const _moveDir    = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _tang       = new THREE.Vector3();
const _perp       = new THREE.Vector3();
const _o          = new THREE.Vector3();
const _nMat       = new THREE.Matrix3();

// Liste des obstacles : tous les meshes SAUF nuages, ciel/dôme et le drone lui-même.
function buildColliders(){
  colliders = [];
  M.scene.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name || '';
    if (/Cloud/i.test(n)) return;          // nuages : pas d'obstacle
    if (/Sky|Sphere/i.test(n)) return;     // ciel / dôme : pas d'obstacle
    for (let p = o; p; p = p.parent){ if (p === rig) return; }   // exclut le drone
    if (o.geometry && !o.geometry.boundsTree) o.geometry.computeBoundsTree();   // BVH (raycast rapide)
    colliders.push(o);
  });
}

// Altitude minimale autorisée = surface sous le drone + garde au sol. -Infinity si rien.
function groundUnder(){
  _rayOrigin.copy(rig.position); _rayOrigin.y += 30;
  raycaster.set(_rayOrigin, _down);
  raycaster.far = 1000;
  const hits = raycaster.intersectObjects(colliders, false);
  return hits.length ? hits[0].point.y + CLEARANCE : -Infinity;
}

// Distance libre devant `dir` sur toute la largeur du drone : 3 rayons (gauche/centre/droite)
// décalés perpendiculairement, on renvoie la distance la PLUS COURTE. Empêche de se faufiler
// entre des piliers ou par un trou plus étroit que le drone. Infinity si rien.
function clearDist(dir, maxLen){
  _perp.set(-dir.z, 0, dir.x);                  // perpendiculaire horizontale
  if (_perp.lengthSq() > 1e-9) _perp.normalize();
  let min = Infinity;
  for (let i = -1; i <= 1; i++){
    _o.copy(rig.position).addScaledVector(_perp, i * DRONE_RADIUS);
    raycaster.set(_o, dir);
    raycaster.far = maxLen;
    const h = raycaster.intersectObjects(colliders, false);
    if (h.length && h[0].distance < min) min = h[0].distance;
  }
  return min;
}

// Déplacement horizontal anti-traversée : avance jusqu'au mur (sur toute la largeur), puis
// glisse le long si la voie tangente est libre. Modifie rig.position.
// Retourne true si une collision de mur a été détectée ce frame.
function moveHorizontal(dt){
  _move.set(0, 0, 0);
  _move.addScaledVector(_fwd,  -vel.fwd  * dt);
  _move.addScaledVector(_side,  vel.side * dt);
  _move.y = 0;
  const d = _move.length();
  if (d < 1e-4) return false;
  _moveDir.copy(_move).multiplyScalar(1 / d);

  const fwdDist = clearDist(_moveDir, d + DRONE_RADIUS);
  const allowed = (fwdDist === Infinity) ? d : Math.min(d, Math.max(0, fwdDist - DRONE_RADIUS));
  rig.position.addScaledVector(_moveDir, allowed);        // avance jusqu'au mur
  const remain = d - allowed;
  if (fwdDist === Infinity || remain < 1e-3) return false; // voie libre

  // Normale du mur (rayon central) pour calculer la tangente de glissement
  _rayOrigin.copy(rig.position);
  raycaster.set(_rayOrigin, _moveDir);
  raycaster.far = DRONE_RADIUS + remain + 1;
  const hits = raycaster.intersectObjects(colliders, false);
  if (!hits.length || !hits[0].face) return true;          // collision confirmée même sans face
  _nMat.getNormalMatrix(hits[0].object.matrixWorld);
  _wallNormal.copy(hits[0].face.normal).applyMatrix3(_nMat); _wallNormal.y = 0;
  if (_wallNormal.lengthSq() < 1e-6) return true;
  _wallNormal.normalize();
  _tang.copy(_moveDir).addScaledVector(_wallNormal, -_moveDir.dot(_wallNormal)); _tang.y = 0;
  const tl = _tang.length();
  if (tl < 1e-4) return true;                              // frontal = collision pure
  _tang.multiplyScalar(1 / tl);

  // Glisse seulement si la tangente est dégagée (sur la largeur du drone)
  const tangDist = clearDist(_tang, remain + DRONE_RADIUS);
  const slide = (tangDist === Infinity) ? remain : Math.max(0, tangDist - DRONE_RADIUS);
  rig.position.addScaledVector(_tang, Math.min(remain, slide));
  return true;   // mur touché même si on glisse dessus
}

/* --- Vibration haptique à la collision ---
   Vibration API : navigator.vibrate([80, 40, 40]) = deux impulsions courtes.
   Throttlé à 300 ms min entre deux vibrations pour ne pas saturer le moteur. */
let _hapticCooldown = 0;
function triggerHaptic(){
  if (_hapticCooldown > 0) return;
  if (!navigator.vibrate) return;
  navigator.vibrate([70, 35, 40]);   // choc + rebond
  _hapticCooldown = 0.30;            // 300 ms avant la prochaine
}

/* ---------- Boucle de vol ---------- */
function update(dt){
  dt = Math.min(dt, 0.05);   // borne pour éviter les sauts
  if (dt <= 0) return;       // frame nulle : évite une vitesse NaN (division par dt plus bas)
  if (droneMixer){
    const target = landed ? 0 : 1;                       // hélices à l'arrêt quand le drone est posé
    propSpeed += (target - propSpeed) * Math.min(1, 6 * dt);
    if (target === 0 && propSpeed < 0.03) propSpeed = 0;  // arrêt complet
    droneMixer.timeScale = propSpeed;
    droneMixer.update(dt);
    setClip(pickClip());
  }

  // Cibles depuis les entrées
  const tYaw  = -input.lx * YAWRATE;
  const tUp   = -input.ly * UPSPEED;     // ly<0 (haut) -> monter
  const tFwd  = -input.ry * SPEED;       // ry<0 (haut) -> avancer
  const tSide =  input.rx * SPEED;

  // Amortissement vers les cibles
  const k = Math.min(1, DAMP * dt);
  vel.yaw  += (tYaw  - vel.yaw ) * k;
  vel.up   += (tUp   - vel.up  ) * k;
  vel.fwd  += (tFwd  - vel.fwd ) * k;
  vel.side += (tSide - vel.side) * k;

  // Appliquer rotation (yaw)
  rig.rotation.y += vel.yaw * dt;

  // Directions monde
  _fwd.set(Math.sin(rig.rotation.y), 0, Math.cos(rig.rotation.y));   // avant = +Z local tourné
  _side.set(_fwd.z, 0, -_fwd.x);                                     // perpendiculaire

  if (!colliders) buildColliders();

  _hapticCooldown -= dt;                     // décrémenter toujours, pas seulement en collision
  const _wallHit = moveHorizontal(dt);      // déplacement horizontal anti-traversée (+ glissement)
  if (_wallHit) triggerHaptic();            // vibration haptique si le drone touche un mur
  rig.position.y += vel.up * dt;            // déplacement vertical

  // Barrière invisible : bloque le drone avant les collines (inner = 0.70R)
  const maxR = (M.domeRadius || 600) * 0.62;
  const dx = rig.position.x - M.viewTarget.x;
  const dz = rig.position.z - M.viewTarget.z;
  const r = Math.hypot(dx, dz);
  if (r > maxR){ rig.position.x = M.viewTarget.x + dx/r*maxR; rig.position.z = M.viewTarget.z + dz/r*maxR; }

  // Plafond
  const ceil = M.viewTarget.y + 400;
  if (rig.position.y > ceil) rig.position.y = ceil;

  // Atterrissage : ne pas descendre sous la surface (sol ou toit) + garde au sol
  const minY = groundUnder();
  const grounded = (minY > -Infinity) && (rig.position.y <= minY + 0.15);   // touche la surface
  if (minY > -Infinity){
    if (rig.position.y < minY){ rig.position.y = minY; if (vel.up < 0) vel.up = 0; }
  } else {
    const floor = M.viewTarget.y - 50;      // secours si rien dessous (hors maquette)
    if (rig.position.y < floor){ rig.position.y = floor; if (vel.up < 0) vel.up = 0; }
  }

  // "Posé" = au sol, sans commande et quasi immobile -> on coupe les hélices
  const noInput = (Math.abs(input.lx) + Math.abs(input.ly) + Math.abs(input.rx) + Math.abs(input.ry)) < 0.1;
  const slow    = (Math.abs(vel.fwd) + Math.abs(vel.side) + Math.abs(vel.up)) < 2;
  landed = grounded && noInput && slow;

  // camYaw se met toujours à jour (sert de cible pour le retour orbital)
  let dyaw = rig.rotation.y - camYaw;
  dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
  camYaw += dyaw * Math.min(1, 8 * dt);

  const _lookOffY = hud.classList.contains('dg-bar') ? -1.5 : 1.2;

  // --- Transitions atterrissage / décollage ---
  if (landed && !orbitMode && !orbitReturning){
    // Drone vient de se poser → activer la caméra orbitale
    orbitMode = true;
    orbitAzim = camYaw;   // part de la position chase actuelle
    orbitElev = -0.15;    // élévation basse → mosquée visible
  } else if (!landed && orbitMode){
    // Décollage → retour fluide vers la chase cam + cache l'indice
    orbitMode      = false;
    orbitReturning = true;
    takeoffHint.classList.remove('is-on');
  }

  if (orbitMode || orbitReturning){
    if (orbitReturning){
      // Lerp l'azimuth vers camYaw — élévation reste basse (mosquée toujours visible)
      let da = camYaw - orbitAzim;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      orbitAzim += da * Math.min(1, 5 * dt);
      const tElev = -0.15;   // même élévation que la vue initiale
      orbitElev  += (tElev - orbitElev) * Math.min(1, 5 * dt);
      if (Math.abs(da) < 0.02 && Math.abs(orbitElev - tElev) < 0.02) orbitReturning = false;
    }
    // Position caméra en coordonnées sphériques autour du drone
    _camPos.set(
      rig.position.x + Math.sin(orbitAzim) * ORBIT_HDIST,
      rig.position.y + ORBIT_VOFF + Math.tan(orbitElev) * ORBIT_HDIST,
      rig.position.z + Math.cos(orbitAzim) * ORBIT_HDIST
    );
  } else {
    // Chase cam (vol) — même élévation basse pour garder la mosquée visible
    _camPos.set(
      rig.position.x + Math.sin(camYaw) * ORBIT_HDIST,
      rig.position.y + ORBIT_VOFF + Math.tan(-0.15) * ORBIT_HDIST,
      rig.position.z + Math.cos(camYaw) * ORBIT_HDIST
    );
  }
  M.camera.position.copy(_camPos);
  M.camera.lookAt(rig.position.x, rig.position.y + _lookOffY, rig.position.z);

  // --- Son du drone ---
  const dist = rig.position.distanceTo(_prevPos);
  _prevPos.copy(rig.position);
  const _currentSpeed = dist / dt;   // unités/s instantanée
  sndUpdate(_currentSpeed, input.lx, landed, dt);

  // --- HUD vivant ---
  // Vitesse = distance parcourue / dt, convertie en "MPH" décoratif
  const speedMph = Math.round(_currentSpeed * 0.18);

  hudAccum += dt;
  if (hudAccum > 0.1){          // rafraîchir le DOM ~10x/s (perf)
    hudAccum = 0;
    const headingDeg = ((THREE.MathUtils.radToDeg(rig.rotation.y) % 360) + 360) % 360;
    elHeading.textContent = Math.round(headingDeg) + '°';
    elFan.style.transform = `rotate(${headingDeg}deg)`;
    elAngle.textContent = (Math.abs(vel.fwd) * 0.25).toFixed(1) + '°';
    elSpeed.textContent = speedMph + ' MPH';
    elAlt.textContent   = 'H : ' + Math.round(rig.position.y - (M.viewTarget.y)) + 'M';

    battery = Math.max(0, battery - 0.01);
    elBatt.textContent = Math.round(battery) + '%';
    const bars = 1 + Math.round(Math.random()*3);
    elSignal.textContent = '▮'.repeat(bars) + '▯'.repeat(4-bars);
  }

  tickScan(dt);

  M.renderer.render(M.scene, M.camera);
}

btnQuit?.addEventListener('click', exit);

/* ---------- Joysticks (tactile + souris) ---------- */
function makeStick(el, onMove){
  const knob = el.querySelector('.dg-stick-knob');
  let id = null;
  const R = 48;   // rayon de déplacement du knob (px)

  const setVec = (clientX, clientY)=>{
    const rect = el.getBoundingClientRect();
    let x = clientX - (rect.left + rect.width/2);
    let y = clientY - (rect.top  + rect.height/2);
    const d = Math.hypot(x,y);
    if (d > R){ x = x/d*R; y = y/d*R; }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    onMove(x/R, y/R);   // -1..1
  };
  const reset = ()=>{ knob.style.transform = 'translate(0,0)'; onMove(0,0); };

  el.addEventListener('pointerdown', (e)=>{ id = e.pointerId; el.setPointerCapture(id); setVec(e.clientX,e.clientY); });
  el.addEventListener('pointermove', (e)=>{ if(e.pointerId===id) setVec(e.clientX,e.clientY); });
  const up = (e)=>{ if(e.pointerId===id){ id=null; reset(); } };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

makeStick(document.getElementById('dgStickL'), (x,y)=>{
  input.lx=x; input.ly=y;
});
const STICK_R_SENS = 0.45; // réduit la sensibilité du joystick droit
makeStick(document.getElementById('dgStickR'), (x,y)=>{
  input.rx=x*STICK_R_SENS; input.ry=y*STICK_R_SENS;
  if (x !== 0 || y !== 0) _startWalkGame(); else _stopWalkGame();
});

/* ---------- Outil Photo ---------- */
function takePhoto(){
  // Rendre une frame fraîche puis lire le canvas (preserveDrawingBuffer non garanti)
  M.renderer.render(M.scene, M.camera);
  const url = M.renderer.domElement.toDataURL('image/png');
  photos.push(url);
  // Téléchargement immédiat
  const a = document.createElement('a');
  a.href = url; a.download = `djenne-drone-${photos.length}.png`;
  a.click();
}
btnPhoto?.addEventListener('click', takePhoto);

/* ---------- Outil Galerie ---------- */
function toggleGallery(){
  if (!galleryPanel.hidden){ galleryPanel.hidden = true; return; }
  galleryPanel.innerHTML = photos.length
    ? photos.map(u => `<img src="${u}" alt="capture">`).join('')
    : '<p>Aucune photo pour le moment.</p>';
  galleryPanel.hidden = false;
}
btnGallery?.addEventListener('click', toggleGallery);

/* ---------- Outil Vidéo (MediaRecorder) ---------- */
function toggleRecord(){
  if (recorder){   // stop
    recorder.stop();
    return;
  }
  if (typeof MediaRecorder === 'undefined' || !M.renderer.domElement.captureStream){
    alert('Enregistrement vidéo non disponible sur ce navigateur.');
    return;
  }
  const stream = M.renderer.domElement.captureStream(30);
  chunks = [];
  recorder = new MediaRecorder(stream, { mimeType:'video/webm' });
  recorder.ondataavailable = (e)=>{ if(e.data.size) chunks.push(e.data); };
  recorder.onstop = ()=>{
    const blob = new Blob(chunks, { type:'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'djenne-drone.webm'; a.click();
    btnVideo.classList.remove('is-active');
    recorder = null;
  };
  recorder.start();
  btnVideo.classList.add('is-active');
}
btnVideo?.addEventListener('click', toggleRecord);


/* ---------- Outil Points d'intérêt ---------- */
function flyToPoi(p){
  if(p.abs){
    rig.position.copy(p.pos);
  } else {
    rig.position.set(M.viewTarget.x, M.viewTarget.y + p.dy, M.viewTarget.z + p.dz);
  }
  if(p.yaw !== undefined){
    rig.rotation.y = p.yaw;
  } else if(p.abs){
    // Oriente le drone vers le centre de la mosquée depuis sa position
    const dx = M.viewTarget.x - rig.position.x;
    const dz = M.viewTarget.z - rig.position.z;
    rig.rotation.y = Math.atan2(dx, dz) + Math.PI;
  } else {
    rig.rotation.y = 0;
  }
  camYaw = rig.rotation.y;
  vel.fwd = vel.side = vel.up = vel.yaw = 0;
  poiPanel.hidden = true;
}
function toggleList(){
  if (!poiPanel.hidden){ poiPanel.hidden = true; return; }
  poiPanel.innerHTML = '';
  getPois().forEach((p)=>{
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = p.nom;
    b.addEventListener('click', ()=> flyToPoi(p));
    poiPanel.appendChild(b);
  });
  poiPanel.hidden = false;
}
btnList?.addEventListener('click', toggleList);

/* ================================================================
   MOTEUR SONORE — Web Audio API  (son de drone en espace OUVERT)

   Problèmes résolus vs version précédente :
   • "Enfermé dans une boîte" → reverb outdoor synthétique (IR exponentielle
     stéréo 2.5 s) + mix wet/dry  →  sensation d'espace extérieur
   • Stéréo spread : moteurs panés L/R par paires → largeur sonore naturelle
   • Filtre "air" high-shelf +4 dB à 6 kHz → présence extérieure / vent
   • Filtres bandpass Q très faibles (0.3-0.4) → moins de coloration "caisson"
   • Anti-crackling conservé (triangle, gains réduits, compresseur, throttle)
   ================================================================ */
let _sndCtx    = null;
let _sndDry    = null;   // GainNode signal sec (direct)
let _sndWet    = null;   // GainNode signal avec reverb
let _sndMaster = null;   // GainNode maître (fade global)
let _sndComp   = null;   // DynamicsCompressorNode
let _sndMotors = [];     // 4 OscillatorNode triangle
let _sndNoise  = null;   // BufferSourceNode bruit seamless
let _sndBandHi = null;   // BiquadFilter bandpass haute
let _sndBandLo = null;   // BiquadFilter bandpass basse
let _sndAirShf = null;   // BiquadFilter high-shelf "air extérieur"
let _sndNoisGn = null;   // GainNode couche bruit
let _sndOn     = false;
let _sndTimer  = 0;

// Bruit blanc 15 s avec fenêtrage Hann aux bords (boucle sans clic)
function _makeSeamlessNoise(ctx){
  const SR = ctx.sampleRate, len = SR * 15, W = 4096;
  const buf = ctx.createBuffer(1, len, SR);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  for (let i = 0; i < W; i++){
    const w = 0.5 * (1 - Math.cos(Math.PI * i / W));
    d[i] *= w; d[len - 1 - i] *= w;
  }
  return buf;
}

// Impulse Response synthétique pour reverb outdoor :
// Décroissance exponentielle stéréo ~2.5 s, avec pre-delay 20 ms
// → simule un espace ouvert (plaza, désert) sans réflexions denses
function _makeOutdoorIR(ctx){
  const SR = ctx.sampleRate;
  const total  = Math.floor(SR * 2.5);
  const preDly = Math.floor(SR * 0.02);  // 20 ms pre-delay
  const buf = ctx.createBuffer(2, total, SR);
  for (let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    for (let i = preDly; i < total; i++){
      const t = (i - preDly) / SR;
      // Décroissance rapide au début (early reflections clairsemées)
      // puis longue queue (late diffusion)
      const env = Math.exp(-t * 2.2) * (1 + 0.4 * Math.exp(-t * 8));
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

function sndStart(){
  if (_sndOn) return;
  _sndCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_sndCtx.state === 'suspended') _sndCtx.resume();

  // Chaîne de sortie : Master → Compresseur → Destination
  _sndComp = _sndCtx.createDynamicsCompressor();
  _sndComp.threshold.value = -8;
  _sndComp.knee.value      = 8;
  _sndComp.ratio.value     = 6;
  _sndComp.attack.value    = 0.005;
  _sndComp.release.value   = 0.25;
  _sndComp.connect(_sndCtx.destination);

  _sndMaster = _sndCtx.createGain();
  _sndMaster.gain.value = 0;
  _sndMaster.connect(_sndComp);

  // Filtre air (high-shelf) : booste la présence extérieure > 6 kHz
  _sndAirShf = _sndCtx.createBiquadFilter();
  _sndAirShf.type = 'highshelf';
  _sndAirShf.frequency.value = 6000;
  _sndAirShf.gain.value = 4;       // +4 dB
  _sndAirShf.connect(_sndMaster);

  // Mix reverb : sec 65 % + mouillé 35 %
  _sndDry = _sndCtx.createGain(); _sndDry.gain.value = 0.65; _sndDry.connect(_sndAirShf);
  _sndWet = _sndCtx.createGain(); _sndWet.gain.value = 0.35; _sndWet.connect(_sndAirShf);

  // ConvolverNode avec IR outdoor
  const conv = _sndCtx.createConvolver();
  conv.buffer = _makeOutdoorIR(_sndCtx);
  conv.connect(_sndWet);

  // Bus interne : toutes les sources → dry ET reverb
  const srcBus = _sndCtx.createGain(); srcBus.gain.value = 1;
  srcBus.connect(_sndDry);
  srcBus.connect(conv);

  // 4 moteurs triangle — panés L/R pour stéréo spread naturel
  //   moteur 0 (-0.5L), 1 (+0.5R), 2 (-0.3L), 3 (+0.3R)
  const baseHz  = 90;
  const configs = [
    { det: 0,  pan: -0.5 },
    { det: 5,  pan:  0.5 },
    { det: -4, pan: -0.3 },
    { det: 9,  pan:  0.3 },
  ];
  configs.forEach(cfg => {
    const osc = _sndCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = baseHz + cfg.det;
    const panner = _sndCtx.createStereoPanner();
    panner.pan.value = cfg.pan;
    const g = _sndCtx.createGain();
    g.gain.value = 0.08;
    osc.connect(g); g.connect(panner); panner.connect(srcBus);
    osc.start();
    _sndMotors.push(osc);
  });

  // Bruit seamless → filtres bandpass Q très faibles (ouverture maximale)
  const noiseSrc = _sndCtx.createBufferSource();
  noiseSrc.buffer = _makeSeamlessNoise(_sndCtx);
  noiseSrc.loop   = true;

  _sndBandHi = _sndCtx.createBiquadFilter();
  _sndBandHi.type = 'bandpass';
  _sndBandHi.frequency.value = 1400;
  _sndBandHi.Q.value = 0.35;   // très ouvert → pas de coloration "caisson"

  _sndBandLo = _sndCtx.createBiquadFilter();
  _sndBandLo.type = 'bandpass';
  _sndBandLo.frequency.value = 300;
  _sndBandLo.Q.value = 0.4;

  _sndNoisGn = _sndCtx.createGain();
  _sndNoisGn.gain.value = 0.08;

  noiseSrc.connect(_sndBandHi); _sndBandHi.connect(_sndNoisGn);
  noiseSrc.connect(_sndBandLo); _sndBandLo.connect(_sndNoisGn);
  _sndNoisGn.connect(srcBus);
  noiseSrc.start();
  _sndNoise = noiseSrc;

  _sndTimer = 0;
  _sndMaster.gain.setTargetAtTime(0.72, _sndCtx.currentTime, 0.9);
  _sndOn = true;
}

function sndUpdate(speedMs, yawInput, isLanded, dt){
  if (!_sndOn || !_sndCtx) return;
  _sndTimer += dt;
  if (_sndTimer < 0.08) return;   // throttle 12 Hz
  _sndTimer = 0;

  const t  = _sndCtx.currentTime;
  const TC = 0.35;

  if (isLanded){
    _sndMaster.gain.setTargetAtTime(0.18, t, 0.5);
    _sndMotors.forEach(o => o.frequency.setTargetAtTime(72, t, 0.7));
    _sndBandHi.frequency.setTargetAtTime(600, t, 0.7);
    return;
  }
  if (_sndMaster.gain.value < 0.15) _sndMaster.gain.setTargetAtTime(0.72, t, 0.5);

  const sN = Math.min(Math.abs(speedMs) / SPEED, 1);
  const yN = Math.min(Math.abs(yawInput), 1);
  const baseHz  = 90;
  const detunes = [0, 5, -4, 9];
  const pitchMult = 1 + sN * 0.28 + yN * 0.06;

  _sndMotors.forEach((o, i) => {
    o.frequency.setTargetAtTime((baseHz + detunes[i]) * pitchMult, t, TC);
  });

  _sndBandHi.frequency.setTargetAtTime(1400 + sN * 1800, t, TC);
  _sndBandLo.frequency.setTargetAtTime(300  + sN * 150,  t, TC);

  // Plus de vitesse → mix plus mouillé (son se disperse dans l'espace)
  _sndWet.gain.setTargetAtTime(0.35 + sN * 0.10, t, TC);
  _sndDry.gain.setTargetAtTime(0.65 - sN * 0.10, t, TC);

  _sndMaster.gain.setTargetAtTime(0.62 + sN * 0.14 + yN * 0.05, t, TC);
  _sndNoisGn.gain.setTargetAtTime(0.08 + yN * 0.04, t, TC);
}

function sndStop(){
  if (!_sndOn || !_sndCtx) return;
  _sndMaster.gain.setTargetAtTime(0, _sndCtx.currentTime, 0.3);
  setTimeout(() => {
    try { _sndMotors.forEach(o => o.stop()); } catch(_){}
    try { _sndNoise.stop(); } catch(_){}
    try { _sndCtx.close(); } catch(_){}
    _sndCtx = null; _sndMotors = []; _sndNoise = null; _sndOn = false;
  }, 900);
}

window.DroneGame = { enter, exit };
