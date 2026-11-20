/* ==========================================================
   MODE SANCTUAIRE — Visite libre intérieure FPS
   Drag écran → regarder autour ; joystick → avancer/reculer/tourner
   Scan automatique à l'approche du mesh Tombeaux
   ========================================================== */
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let _markerImam = null;

/* ---------- Indicateurs direction (GLB animé) ---------- */
const _draco = new DRACOLoader();
_draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const _gltfDir = new GLTFLoader();
_gltfDir.setDRACOLoader(_draco);

let   _dirGLTF       = null;
const _dirNodes      = [];
const _dirMixers     = [];
let   _tombDirPlaced = false;

function _spawnDirAt(pos) {
  if (!_dirGLTF || !M?.scene) return;
  const root = _dirGLTF.scene.clone(true);
  root.position.copy(pos);
  root.userData.baseY    = pos.y;
  root.userData.phaseOff = Math.random() * Math.PI * 2;
  root.traverse(child => {
    if (child.isMesh) {
      child.material = child.material.clone();
      child.material.color.set(0xF9D58B);
      child.material.emissive.set(0xF9D58B);
      child.material.emissiveIntensity = 0.8;
    }
  });
  M.scene.add(root);
  _dirNodes.push(root);
}

let _dirTime = 0;

function _tickDirAnim(dt) {
  _dirTime += dt;
  for (const n of _dirNodes) {
    n.position.y = n.userData.baseY + Math.sin(_dirTime * 2.2 + n.userData.phaseOff) * 0.18;
    n.rotation.y = _dirTime * 0.6 + n.userData.phaseOff;
  }
}

function _clearDirMarkers() {
  _dirNodes.forEach(n => M?.scene.remove(n));
  _dirNodes.length = 0;
  _tombDirPlaced = false;
  _dirTime = 0;
}

function _loadDirModel() {
  const _doSpawn = () => {
    _spawnDirAt(new THREE.Vector3( 22.411,  6.9853,   9.3035));  // entrée principale
    _spawnDirAt(new THREE.Vector3(  3.2361, 6.9853,  30.476));   // petit tombeau
    _spawnDirAt(new THREE.Vector3(-40.826,  6.9853,  33.8));     // zone extérieure ouest
    _spawnDirAt(new THREE.Vector3( 17.487,  6.9853,  -6.6934));  // Blender X=17.487 Y=6.6934 Z=6.9853
    _spawnDirAt(new THREE.Vector3( 14.11,  17.541,   -2.5977));  // Blender X=14.11  Y=2.5977 Z=17.541
    _spawnDirAt(new THREE.Vector3( -9.975,  6.9853,  21.253));   // Blender X=-9.975 Y=-21.253 Z=6.9853
  };
  if (_dirGLTF) { _doSpawn(); return; }
  _gltfDir.load('assets/models/direction.glb', (gltf) => {
    _dirGLTF = gltf;
    _doSpawn();
  });
}

/* ---------- Son scanner ---------- */
const _scannerSound = new Audio('assets/audio/scanner_sound.mp3');
_scannerSound.preload = 'auto';
_scannerSound.volume  = 0.85;
const _playScanner = () => { _scannerSound.currentTime = 0; _scannerSound.play().catch(() => {}); };

/* ---------- Son marche ---------- */
const _walkSound = new Audio('assets/audio/walking_sound_for_inside.mp3');
_walkSound.preload = 'auto';
_walkSound.loop    = true;
_walkSound.volume  = 0.7;

/* Déverrouillage iOS : play+pause synchrone sur premier geste */
document.addEventListener('audioUnlock', () => {
  [_scannerSound, _walkSound, _insideSound].forEach(a => {
    if (!a) return;
    a.play().catch(() => {}); a.pause(); a.currentTime = 0;
  });
}, { once: true });
let _walkPlaying = false;
const _startWalk = () => {
  if (_walkPlaying) return;
  _walkPlaying = true;
  _walkSound.play().catch(() => {});
};
const _stopWalk = () => {
  if (!_walkPlaying) return;
  _walkPlaying = false;
  _walkSound.pause();
};

/* ---------- Son intérieur mosquée ---------- */
const _insideSound = new Audio('assets/audio/inside_sound_of_mosque.mp3');
_insideSound.preload = 'auto';
_insideSound.loop    = false;
_insideSound.volume  = 0.8;
_insideSound.addEventListener('timeupdate', () => {
  if (_insideSound.currentTime >= 30) {
    _insideSound.currentTime = 0;
    _insideSound.play().catch(() => {});
  }
});
const _playInsideSound = () => { _insideSound.currentTime = 0; _insideSound.play().catch(() => {}); };
const _stopInsideSound = () => { _insideSound.pause(); _insideSound.currentTime = 0; };

/* ---------- DOM ---------- */
const hud           = document.getElementById('sanctuaryHud');
const btnQuit       = document.getElementById('snQuit');
const compassNeedle = document.getElementById('snFan');
const btnPhoto      = document.getElementById('snPhoto');
const joystick      = document.getElementById('snStick');

/* ---------- État global ---------- */
let active = false;
let M      = null;

/* ---------- Navigation ---------- */
const PLAYER_START    = new THREE.Vector3(-36.864, 6.7586, 21.005);
const PLAYER_YAW0     = -Math.PI / 2;
const PLAYER_EXTERIOR = new THREE.Vector3(-27.602, 6.7586, 36.228);
const EXTERIOR_YAW    = 0;
const APPROACH_DUR    = 2.5;
const WALK_SPEED      = 3.0;
const TURN_SPEED      = 0.85;
const CAPSULE_R       = 0.55;
const EYE_HEIGHT      = 1.7;
const GRAVITY         = 18;    // unités/s²
const FALL_DEATH_Y    = -15;   // respawn si tombé sous ce seuil

let _velY = 0;

/* ---------- Regard libre ---------- */
const LOOK_SENSITIVITY  = 0.004;
const LOOK_RETURN_SPEED = 3.5;
const PITCH_LIMIT       = Math.PI / 2.2;

let lookOffsetYaw   = 0;
let lookOffsetPitch = 0;
let lookDragId      = null;
let lookDragLastX   = 0;
let lookDragLastY   = 0;
let _lookInited     = false;

/* ---------- États ---------- */
const S_IDLE     = 0;
const S_APPROACH = 1;
const S_FPS      = 3;
let state = S_IDLE;
let animT = 0;
const animCamStart  = new THREE.Vector3();
const animQuatStart = new THREE.Quaternion();
const animQuatEnd   = new THREE.Quaternion();

/* ---------- Joueur ---------- */
const playerPos   = new THREE.Vector3();
let   playerYaw   = PLAYER_YAW0;
let   playerPitch = 0;

/* ---------- Entrées ---------- */
const joyInput = { x: 0, y: 0 };
const keys     = { w: false, a: false, s: false, d: false };

/* ---------- Collision BVH ---------- */
let colliders = null;
const raycaster   = new THREE.Raycaster();
const _down       = new THREE.Vector3(0, -1, 0);
const _up         = new THREE.Vector3(0,  1,  0);
const _ceilRay    = new THREE.Raycaster();
const _fwd        = new THREE.Vector3();
const _move       = new THREE.Vector3();
const _moveDir    = new THREE.Vector3();
const _wallNormal = new THREE.Vector3();
const _tang       = new THREE.Vector3();
const _nMat       = new THREE.Matrix3();
const _rayOrigin  = new THREE.Vector3();
const _tmpA       = new THREE.Vector3();

/* ---------- Éclairage ---------- */
let ambLight   = null;
let pointLight = null;

/* ---------- HUD ---------- */
let hudAccum        = 0;
let _controlsInited = false;

/* ========================================================= */
/* ---- Scan — Tombeaux                                  ---- */
/* ========================================================= */
const TOMB_SCAN_DIST     = 3;    // distance de déclenchement (unités scène)
const TOMB_SCAN_DURATION = 2.5;  // secondes pour compléter le scan
const TOMB_SCAN_COOLDOWN = 12;   // secondes avant de pouvoir rescanner

let tombCenter    = null;   // THREE.Vector3 centre du mesh Tombeaux
let tombSearched  = false;
let tombScanState = 'idle'; // 'idle' | 'scanning' | 'result' | 'cooldown'
let tombScanT     = 0;      // progression 0 → 1
let tombCooldownT = 0;

/* Création du panel HTML — classes sn-scan-* autonomes */
const snScanHud = document.createElement('div');
snScanHud.id = 'snScanHud';
snScanHud.className = 'sn-scan-hud';
snScanHud.innerHTML = `
  <div class="sn-scan-laser">
    <div class="sn-scan-beam"></div>
  </div>
  <div class="sn-scan-info">
    <div class="sn-scan-label">ANALYSE EN COURS</div>
    <div class="sn-scan-bar">
      <div class="sn-scan-progress" id="snScanProgress"></div>
    </div>
  </div>
`;
document.body.appendChild(snScanHud);

const snScanResult = document.createElement('div');
snScanResult.id = 'snScanResult';
snScanResult.className = 'sn-scan-result';
snScanResult.innerHTML = `
  <div class="sn-scan-result-header">◈ ANALYSE COMPLÈTE</div>
  <p class="sn-scan-result-title">TOMBEAUX</p>
  <ul class="sn-scan-list">
    <li>Sur la terrasse, devant le mur de la prière, se trouvent <strong>deux tombes</strong></li>
    <li>La plus grande abrite <strong>Almany Ismaïla</strong>, un imam important de Djenné au <strong>XVIIIe siècle</strong></li>
    <li>Selon la tradition, des fidèles viennent y prier et demander une bénédiction (<strong>baraka</strong>)</li>
    <li>Ce sont de simples tombes en terre, entretenues comme le reste du bâtiment</li>
  </ul>
  <button class="sn-scan-close" id="snScanClose">FERMER ✕</button>
`;
document.body.appendChild(snScanResult);

const snScanProgress = document.getElementById('snScanProgress');
document.getElementById('snScanClose')?.addEventListener('click', () => {
  snScanResult.classList.remove('visible');
  snScanHud.classList.remove('visible');
  tombScanState = 'cooldown';
  tombCooldownT = TOMB_SCAN_COOLDOWN;
});

function _searchTomb() {
  if (tombSearched || !M?.scene) return;
  tombSearched = true;
  tombCenter = new THREE.Vector3();
  let found = false;
  M.scene.traverse((o) => {
    if (found || !o.isMesh) return;
    if (/Tombeaux/i.test(o.name || '')) {
      new THREE.Box3().setFromObject(o).getCenter(tombCenter);
      found = true;
    }
  });
  if (!found) { tombCenter = null; return; }
  _tombDirPlaced = false; // sera placé dans tickTombScan dès que le GLB est prêt
}

function tickTombScan(dt) {
  _searchTomb();
  if (!tombCenter) return;
  if (!_tombDirPlaced && _dirGLTF) { _spawnDirAt(tombCenter); _tombDirPlaced = true; }
  if (petitTombScanState === 'scanning' || petitTombScanState === 'result') return;
  if (imamScanState === 'scanning' || imamScanState === 'result') return;

  const dist = playerPos.distanceTo(tombCenter);

  if (tombScanState === 'idle') {
    if (dist < TOMB_SCAN_DIST) {
      tombScanState = 'scanning';
      tombScanT     = 0;
      _playScanner();
      snScanHud.classList.add('visible');
      snScanResult.classList.remove('visible');
      snScanProgress.style.width = '0%';
    }

  } else if (tombScanState === 'scanning') {
    if (dist > TOMB_SCAN_DIST) {
      tombScanState = 'idle';
      tombScanT     = 0;
      snScanHud.classList.remove('visible');
      return;
    }
    tombScanT += dt / TOMB_SCAN_DURATION;
    snScanProgress.style.width = `${Math.min(tombScanT * 100, 100)}%`;
    if (tombScanT >= 1) {
      tombScanState = 'result';
      snScanResult.classList.add('visible');
    }

  } else if (tombScanState === 'cooldown') {
    tombCooldownT -= dt;
    if (tombCooldownT <= 0) tombScanState = 'idle';
  }
  /* 'result' : on attend le clic FERMER */
}

function resetTombScan() {
  tombScanState = 'idle';
  tombScanT     = 0;
  tombCooldownT = 0;
  snScanHud.classList.remove('visible');
  snScanResult.classList.remove('visible');
}

/* ========================================================= */
/* ---- Scan — Petit tombeau (position fixe)             ---- */
/* ========================================================= */
const PETIT_TOMB_POS      = new THREE.Vector3(3.3037, 6.7586, 30.634);
const PETIT_TOMB_DIST     = 6;
const PETIT_TOMB_DURATION = 2.5;
const PETIT_TOMB_COOLDOWN = 12;

let petitTombScanState = 'idle';
let petitTombScanT     = 0;
let petitTombCooldownT = 0;

const snPetitScanResult = document.createElement('div');
snPetitScanResult.id = 'snPetitScanResult';
snPetitScanResult.className = 'sn-scan-result';
snPetitScanResult.innerHTML = `
  <div class="sn-scan-result-header">◈ ANALYSE COMPLÈTE</div>
  <p class="sn-scan-result-title">PETIT TOMBEAU</p>
  <ul class="sn-scan-list">
    <li>C'est la <strong>seconde tombe</strong>, plus petite, posée sur la même terrasse</li>
    <li>On sait <strong>mal qui y repose</strong> : son nom ne nous est pas parvenu avec certitude</li>
    <li>Elle se tient tout près du mur de la prière, là où passent les fidèles</li>
    <li>Faite de terre, elle reste simple et sans décor, comme l'ensemble du lieu</li>
  </ul>
  <button class="sn-scan-close" id="snPetitScanClose">FERMER ✕</button>
`;
document.body.appendChild(snPetitScanResult);

document.getElementById('snPetitScanClose')?.addEventListener('click', () => {
  snPetitScanResult.classList.remove('visible');
  snScanHud.classList.remove('visible');
  petitTombScanState = 'cooldown';
  petitTombCooldownT = PETIT_TOMB_COOLDOWN;
});

function tickPetitTombScan(dt) {
  if (tombScanState === 'scanning' || tombScanState === 'result') return;
  if (imamScanState === 'scanning' || imamScanState === 'result') return;
  const dist = playerPos.distanceTo(PETIT_TOMB_POS);

  if (petitTombScanState === 'idle') {
    if (dist < PETIT_TOMB_DIST) {
      petitTombScanState = 'scanning';
      petitTombScanT     = 0;
      _playScanner();
      snScanHud.classList.add('visible');
      snPetitScanResult.classList.remove('visible');
      snScanProgress.style.width = '0%';
    }

  } else if (petitTombScanState === 'scanning') {
    if (dist > PETIT_TOMB_DIST) {
      petitTombScanState = 'idle';
      petitTombScanT     = 0;
      snScanHud.classList.remove('visible');
      return;
    }
    petitTombScanT += dt / PETIT_TOMB_DURATION;
    snScanProgress.style.width = `${Math.min(petitTombScanT * 100, 100)}%`;
    if (petitTombScanT >= 1) {
      petitTombScanState = 'result';
      snPetitScanResult.classList.add('visible');
    }

  } else if (petitTombScanState === 'cooldown') {
    petitTombCooldownT -= dt;
    if (petitTombCooldownT <= 0) petitTombScanState = 'idle';
  }
}

function resetPetitTombScan() {
  petitTombScanState = 'idle';
  petitTombScanT     = 0;
  petitTombCooldownT = 0;
  snPetitScanResult.classList.remove('visible');
}

/* ========================================================= */
/* ---- Scan — Place de l'Imam (position fixe)           ---- */
/* ========================================================= */
const IMAM_POS      = new THREE.Vector3(-9.8271, 6.6569, 23.645);
const IMAM_DIST     = 3;
const IMAM_DURATION = 2.5;
const IMAM_COOLDOWN = 12;

let imamScanState = 'idle';
let imamScanT     = 0;
let imamCooldownT = 0;

const snImamScanResult = document.createElement('div');
snImamScanResult.id = 'snImamScanResult';
snImamScanResult.className = 'sn-scan-result';
snImamScanResult.innerHTML = `
  <div class="sn-scan-result-header">◈ ANALYSE COMPLÈTE</div>
  <p class="sn-scan-result-title">PLACE DE L'IMAM</p>
  <ul class="sn-scan-list">
    <li>L'imam dirige la prière depuis le <strong>mihrab</strong>, une niche tournée vers <strong>La Mecque (qibla)</strong></li>
    <li>Le vendredi, il prononce la <strong>khouṭba</strong> (le sermon) devant de nombreux fidèles</li>
    <li>Les jours de grande affluence, la foule déborde dans la cour et les ruelles autour</li>
    <li>À Djenné, des imams se succèdent à la tête de la mosquée depuis très longtemps</li>
  </ul>
  <button class="sn-scan-close" id="snImamScanClose">FERMER ✕</button>
`;
document.body.appendChild(snImamScanResult);

document.getElementById('snImamScanClose')?.addEventListener('click', () => {
  snImamScanResult.classList.remove('visible');
  snScanHud.classList.remove('visible');
  imamScanState = 'cooldown';
  imamCooldownT = IMAM_COOLDOWN;
});

function isInsideMosque() {
  if (!colliders || !colliders.length) return false;
  _ceilRay.set(playerPos, _up);
  _ceilRay.far = 25;
  return _ceilRay.intersectObjects(colliders, false).length > 0;
}

function _imamBusy() {
  return tombScanState      === 'scanning' || tombScanState      === 'result' ||
         petitTombScanState === 'scanning' || petitTombScanState === 'result';
}

function tickImamScan(dt) {
  if (_imamBusy()) return;
  if (!isInsideMosque()) return;
  const dist = playerPos.distanceTo(IMAM_POS);

  if (imamScanState === 'idle') {
    if (dist < IMAM_DIST) {
      imamScanState = 'scanning';
      imamScanT     = 0;
      _playScanner();
      snScanHud.classList.add('visible');
      snImamScanResult.classList.remove('visible');
      snScanProgress.style.width = '0%';
    }

  } else if (imamScanState === 'scanning') {
    if (dist > IMAM_DIST) {
      imamScanState = 'idle';
      imamScanT     = 0;
      snScanHud.classList.remove('visible');
      return;
    }
    imamScanT += dt / IMAM_DURATION;
    snScanProgress.style.width = `${Math.min(imamScanT * 100, 100)}%`;
    if (imamScanT >= 1) {
      imamScanState = 'result';
      snImamScanResult.classList.add('visible');
    }

  } else if (imamScanState === 'cooldown') {
    imamCooldownT -= dt;
    if (imamCooldownT <= 0) imamScanState = 'idle';
  }
}

function resetImamScan() {
  imamScanState = 'idle';
  imamScanT     = 0;
  imamCooldownT = 0;
  snImamScanResult.classList.remove('visible');
}

/* ========================================================= */
/* ---- Scan — Entrée principale (position fixe)         ---- */
/* ========================================================= */
const ENTREE_POS      = new THREE.Vector3(22.411, 6.2587, 9.3035);
const ENTREE_DIST     = 7;
const ENTREE_DURATION = 2.5;
const ENTREE_COOLDOWN = 12;

let entreeScanState = 'idle';
let entreeScanT     = 0;
let entreeCooldownT = 0;

const snEntreeScanResult = document.createElement('div');
snEntreeScanResult.id = 'snEntreeScanResult';
snEntreeScanResult.className = 'sn-scan-result';
snEntreeScanResult.innerHTML = `
  <div class="sn-scan-result-header">◈ ANALYSE COMPLÈTE</div>
  <p class="sn-scan-result-title">ENTRÉE PRINCIPALE</p>
  <ul class="sn-scan-list">
    <li>Avant d'entrer, les <strong>fidèles retirent leurs chaussures</strong> : on passe du dehors à l'espace de prière</li>
    <li>L'entrée principale se trouve du <strong>côté nord</strong> du bâtiment</li>
    <li>Les murs épais en <strong>banco</strong> gardent l'intérieur frais, même en pleine saison sèche</li>
    <li>Au début du grand crépissage, une <strong>course</strong> a lieu : on rivalise pour apporter le premier mortier à la mosquée</li>
  </ul>
  <button class="sn-scan-close" id="snEntreeScanClose">FERMER ✕</button>
`;
document.body.appendChild(snEntreeScanResult);

document.getElementById('snEntreeScanClose')?.addEventListener('click', () => {
  snEntreeScanResult.classList.remove('visible');
  snScanHud.classList.remove('visible');
  entreeScanState = 'cooldown';
  entreeCooldownT = ENTREE_COOLDOWN;
});

function _entreeBusy() {
  return tombScanState      === 'scanning' || tombScanState      === 'result' ||
         petitTombScanState === 'scanning' || petitTombScanState === 'result' ||
         imamScanState      === 'scanning' || imamScanState      === 'result';
}

function tickEntreeScan(dt) {
  if (_entreeBusy()) return;
  const dist = playerPos.distanceTo(ENTREE_POS);

  if (entreeScanState === 'idle') {
    if (dist < ENTREE_DIST) {
      entreeScanState = 'scanning';
      entreeScanT     = 0;
      _playScanner();
      snScanHud.classList.add('visible');
      snEntreeScanResult.classList.remove('visible');
      snScanProgress.style.width = '0%';
    }

  } else if (entreeScanState === 'scanning') {
    if (dist > ENTREE_DIST) {
      entreeScanState = 'idle';
      entreeScanT     = 0;
      snScanHud.classList.remove('visible');
      return;
    }
    entreeScanT += dt / ENTREE_DURATION;
    snScanProgress.style.width = `${Math.min(entreeScanT * 100, 100)}%`;
    if (entreeScanT >= 1) {
      entreeScanState = 'result';
      snEntreeScanResult.classList.add('visible');
    }

  } else if (entreeScanState === 'cooldown') {
    entreeCooldownT -= dt;
    if (entreeCooldownT <= 0) entreeScanState = 'idle';
  }
}

function resetEntreeScan() {
  entreeScanState = 'idle';
  entreeScanT     = 0;
  entreeCooldownT = 0;
  snEntreeScanResult.classList.remove('visible');
}

/* ========================================================= */

function isActive() { return active; }

function showHud() {
  hud.classList.add('is-on');
  hud.setAttribute('aria-hidden', 'false');
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) hud.classList.add('sn-bar');
}

function hideHud() {
  hud.classList.remove('is-on');
  hud.setAttribute('aria-hidden', 'true');
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/* ========================================================= */
/* ---- Drag look-around (sur le canvas Three.js)        ---- */
/* ========================================================= */
function _initLookDrag() {
  if (_lookInited) return;
  _lookInited = true;
  const canvas = M.renderer.domElement;

  canvas.addEventListener('pointerdown', (e) => {
    if (state !== S_FPS) return;
    if (lookDragId !== null) return;
    lookDragId    = e.pointerId;
    lookDragLastX = e.clientX;
    lookDragLastY = e.clientY;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== S_FPS) return;
    if (e.pointerId !== lookDragId) return;
    const dx = e.clientX - lookDragLastX;
    const dy = e.clientY - lookDragLastY;
    lookDragLastX = e.clientX;
    lookDragLastY = e.clientY;
    lookOffsetYaw   -= dx * LOOK_SENSITIVITY;
    lookOffsetPitch -= dy * LOOK_SENSITIVITY;
    lookOffsetPitch  = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, lookOffsetPitch));
  });

  canvas.addEventListener('pointerup',     (e) => { if (e.pointerId === lookDragId) lookDragId = null; });
  canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === lookDragId) lookDragId = null; });
}

/* ========================================================= */
/* ---- Collisions BVH                                   ---- */
/* ========================================================= */
const COLLIDER_NAMES = /Mosquee_Base|Piliers|Poteaux|Cloture|Torons|boxcollider|Tombeaux|Plateforme|land/i;

async function buildColliders() {
  colliders = [];
  const meshes = [];
  M.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!COLLIDER_NAMES.test(o.name || '')) return;
    meshes.push(o);
  });
  for (const o of meshes) {
    if (o.geometry && !o.geometry.boundsTree) {
      await new Promise((r) => setTimeout(r, 0));
      o.geometry.computeBoundsTree();
    }
    colliders.push(o);
  }
}

function clearDist(dir, maxLen) {
  const perp = _tmpA.set(-dir.z, 0, dir.x);
  if (perp.lengthSq() > 1e-9) perp.normalize();
  let min = Infinity;
  for (let i = -1; i <= 1; i++) {
    _rayOrigin.copy(playerPos).addScaledVector(perp, i * CAPSULE_R);
    raycaster.set(_rayOrigin, dir); raycaster.far = maxLen;
    const h = raycaster.intersectObjects(colliders, false);
    if (h.length && h[0].distance < min) min = h[0].distance;
  }
  return min;
}

function groundUnder() {
  _rayOrigin.copy(playerPos);
  raycaster.set(_rayOrigin, _down); raycaster.far = 40;
  const h = raycaster.intersectObjects(colliders, false);
  return h.length ? h[0].point.y + EYE_HEIGHT : -Infinity;
}

function movePlayer(dt) {
  const dist = _move.length() * dt;
  if (dist < 1e-4) return;
  _moveDir.copy(_move).normalize();
  const fwdDist = clearDist(_moveDir, dist + CAPSULE_R);
  const allowed = fwdDist === Infinity ? dist : Math.min(dist, Math.max(0, fwdDist - CAPSULE_R));
  playerPos.addScaledVector(_moveDir, allowed);
  const remain = dist - allowed;
  if (remain < 1e-3 || fwdDist === Infinity) return;
  _rayOrigin.copy(playerPos);
  raycaster.set(_rayOrigin, _moveDir); raycaster.far = CAPSULE_R + remain + 1;
  const hits = raycaster.intersectObjects(colliders, false);
  if (!hits.length || !hits[0].face) return;
  _nMat.getNormalMatrix(hits[0].object.matrixWorld);
  _wallNormal.copy(hits[0].face.normal).applyMatrix3(_nMat);
  _wallNormal.y = 0;
  if (_wallNormal.lengthSq() < 1e-6) return;
  _wallNormal.normalize();
  _tang.copy(_moveDir).addScaledVector(_wallNormal, -_moveDir.dot(_wallNormal));
  _tang.y = 0;
  const tl = _tang.length();
  if (tl < 1e-4) return;
  _tang.multiplyScalar(1 / tl);
  const tangDist = clearDist(_tang, remain + CAPSULE_R);
  const slide    = tangDist === Infinity ? remain : Math.max(0, tangDist - CAPSULE_R);
  playerPos.addScaledVector(_tang, Math.min(remain, slide));
}

function depenetrate() {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    _tmpA.set(Math.sin(a), 0, Math.cos(a));
    raycaster.set(playerPos, _tmpA); raycaster.far = CAPSULE_R + 0.1;
    const h = raycaster.intersectObjects(colliders, false);
    if (h.length && h[0].distance < CAPSULE_R)
      playerPos.addScaledVector(_tmpA, -(CAPSULE_R - h[0].distance));
  }
}

/* ========================================================= */
/* ---- Joystick + contrôles clavier                     ---- */
/* ========================================================= */
function makeStick(el, onMove) {
  const knob = el.querySelector('.sn-stick-knob');
  let id = null; const R = 48;
  const setVec = (cx, cy) => {
    const rect = el.getBoundingClientRect();
    let x = cx - (rect.left + rect.width / 2);
    let y = cy - (rect.top  + rect.height / 2);
    const d = Math.hypot(x, y);
    if (d > R) { x = x / d * R; y = y / d * R; }
    knob.style.transform = `translate(${x}px,${y}px)`;
    onMove(x / R, y / R);
  };
  const reset = () => { knob.style.transform = 'translate(0,0)'; onMove(0, 0); };
  el.addEventListener('pointerdown',   (e) => { id = e.pointerId; el.setPointerCapture(id); setVec(e.clientX, e.clientY); });
  el.addEventListener('pointermove',   (e) => { if (e.pointerId === id) setVec(e.clientX, e.clientY); });
  el.addEventListener('pointerup',     (e) => { if (e.pointerId === id) { id = null; reset(); } });
  el.addEventListener('pointercancel', (e) => { if (e.pointerId === id) { id = null; reset(); } });
}

function _initControls() {
  if (_controlsInited) return;
  _controlsInited = true;
  window.addEventListener('keydown', (e) => {
    if (state !== S_FPS) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'arrowup')    { keys.w = true;  e.preventDefault(); }
    if (k === 's' || k === 'arrowdown')  { keys.s = true;  e.preventDefault(); }
    if (k === 'q' || k === 'arrowleft')  { keys.a = true;  e.preventDefault(); }
    if (k === 'd' || k === 'arrowright') { keys.d = true;  e.preventDefault(); }
    if (k === 'escape') exit();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'arrowup')    keys.w = false;
    if (k === 's' || k === 'arrowdown')  keys.s = false;
    if (k === 'q' || k === 'arrowleft')  keys.a = false;
    if (k === 'd' || k === 'arrowright') keys.d = false;
  });
  makeStick(joystick, (x, y) => {
    joyInput.x = x; joyInput.y = y;
  });
  btnQuit?.addEventListener('click', exit);

  /* ☰ Panneau lieux */
  const poiPanel = document.getElementById('snPoiPanel');
  document.getElementById('snMenu')?.addEventListener('click', () => {
    poiPanel.hidden = !poiPanel.hidden;
  });
  poiPanel?.querySelectorAll('button[data-sn-poi]').forEach((btn) => {
    btn.addEventListener('click', () => {
      jumpTo(btn.dataset.snPoi);
      poiPanel.hidden = true;
    });
  });

  btnPhoto?.addEventListener('click', () => {
    M.renderer.render(M.scene, M.camera);
    const url = M.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'djenne-sanctuaire.png'; a.click();
  });
}

/* ========================================================= */
/* ---- Portails porte ↔ toit                            ---- */
/* ========================================================= */
// Conversion Blender→Three.js : X=BX, Y=BZ, Z=-BY
const PORTAL_A_TRIGGER = new THREE.Vector3(17.07,  5.789,  -5.3612); // porte du bas
const PORTAL_B_TRIGGER = new THREE.Vector3(13.104, 18.321, -3.5774); // porte du toit

const PORTAL_A_DEST    = new THREE.Vector3(13.104, 19.0,   -3.5774); // atterrit sur le toit
const PORTAL_B_DEST    = new THREE.Vector3(17.07,  6.5,    -5.3612); // atterrit en bas

const PORTAL_RADIUS       = 2.5;   // distance de déclenchement (unités scène)
const PORTAL_COOLDOWN_SEC = 2.5;   // délai anti-rebond après téléport

let _portalCooldown = 0;

function _teleportFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#f9d58b;opacity:0;pointer-events:none;z-index:9999;transition:opacity .12s ease';
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = '0.65'; });
  setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 180); }, 130);
}

function tickPortals(dt) {
  if (_portalCooldown > 0) { _portalCooldown -= dt; return; }

  const ax = playerPos.x - PORTAL_A_TRIGGER.x;
  const az = playerPos.z - PORTAL_A_TRIGGER.z;
  if (Math.sqrt(ax * ax + az * az) < PORTAL_RADIUS) {
    playerPos.copy(PORTAL_A_DEST);
    lookOffsetYaw = 0; lookOffsetPitch = 0;
    _velY = 0;
    _portalCooldown = PORTAL_COOLDOWN_SEC;
    _teleportFlash();
    return;
  }

  const bx = playerPos.x - PORTAL_B_TRIGGER.x;
  const bz = playerPos.z - PORTAL_B_TRIGGER.z;
  if (Math.sqrt(bx * bx + bz * bz) < PORTAL_RADIUS) {
    playerPos.copy(PORTAL_B_DEST);
    lookOffsetYaw = 0; lookOffsetPitch = 0;
    _velY = 0;
    _portalCooldown = PORTAL_COOLDOWN_SEC;
    _teleportFlash();
    return;
  }
}

/* ========================================================= */
/* ---- Téléportation instantanée                        ---- */
/* ========================================================= */
const LIEUX = {
  exterior: { pos: PLAYER_EXTERIOR, yaw: EXTERIOR_YAW },
  interior: { pos: PLAYER_START,    yaw: PLAYER_YAW0  },
};

function jumpTo(id) {
  const lieu = LIEUX[id];
  if (!lieu || state !== S_FPS) return;
  playerPos.copy(lieu.pos);
  playerYaw       = lieu.yaw;
  lookOffsetYaw   = 0;
  lookOffsetPitch = 0;
  M.camera.rotation.order = 'YXZ';
  M.camera.rotation.y = playerYaw;
  M.camera.rotation.x = 0;
  M.camera.position.copy(playerPos);
}

/* ========================================================= */
/* ---- Tick FPS                                         ---- */
/* ========================================================= */
function tickFPS(dt) {
  const mx = joyInput.x + (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  const mz = joyInput.y + (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
  playerYaw -= mx * TURN_SPEED * dt;

  _fwd.set(Math.sin(playerYaw), 0, Math.cos(playerYaw));
  _move.copy(_fwd).multiplyScalar(mz * WALK_SPEED); _move.y = 0;
  if (_move.lengthSq() > 1e-6 && colliders && colliders.length) movePlayer(dt);

  const isMoving = Math.abs(mz) > 0.05 || Math.abs(mx) > 0.05;
  if (isMoving) _startWalk(); else _stopWalk();
  if (isMoving) {
    const k = Math.min(1, LOOK_RETURN_SPEED * dt);
    lookOffsetYaw   += (0 - lookOffsetYaw)   * k;
    lookOffsetPitch += (0 - lookOffsetPitch) * k;
  }

  if (colliders && colliders.length) {
    // Gravité
    _velY -= GRAVITY * dt;
    playerPos.y += _velY * dt;

    const floorY = groundUnder();
    if (floorY > -Infinity) {
      if (playerPos.y <= floorY) {
        // Sous le sol : remonter et stopper
        playerPos.y = floorY;
        _velY = 0;
      } else if (playerPos.y - floorY < 0.8) {
        // Très proche du sol : snap (marche normale)
        playerPos.y = floorY;
        _velY = 0;
      }
      // Sinon : en l'air, la gravité continue
    }

    // Sécurité : tombé sous le modèle → respawn au départ
    if (playerPos.y < FALL_DEATH_Y) {
      playerPos.copy(PLAYER_START);
      playerYaw = PLAYER_YAW0;
      lookOffsetYaw = 0; lookOffsetPitch = 0;
      _velY = 0;
      _teleportFlash();
    }

    depenetrate();
  }

  M.camera.rotation.order = 'YXZ';
  M.camera.rotation.y = playerYaw + lookOffsetYaw;
  M.camera.rotation.x = lookOffsetPitch;
  M.camera.position.copy(playerPos);
  if (pointLight) pointLight.position.copy(playerPos);

  _tickDirAnim(dt);
  tickPortals(dt);
  tickTombScan(dt);
  tickPetitTombScan(dt);
  tickImamScan(dt);
  tickEntreeScan(dt);

  hudAccum += dt;
  if (hudAccum > 0.1) {
    hudAccum = 0;
    if (compassNeedle) {
      const deg = ((THREE.MathUtils.radToDeg(-playerYaw) % 360) + 360) % 360;
      compassNeedle.style.transform = `rotate(${deg}deg)`;
    }
  }
}

/* ========================================================= */
/* ---- Boucle principale                                ---- */
/* ========================================================= */
function update(dt) {
  dt = Math.min(dt, 0.05);
  if (dt <= 0) return;
  if (state === S_APPROACH) {
    animT += dt / APPROACH_DUR;
    if (animT >= 1) {
      animT = 0; state = S_FPS;
      playerPos.copy(PLAYER_START);
      playerYaw = PLAYER_YAW0; playerPitch = 0;
      lookOffsetYaw = 0; lookOffsetPitch = 0;
      if (!colliders) colliders = [];
      if (colliders.length) depenetrate();
      _initControls();
      _initLookDrag();
      showHud();
      return;
    }
    const t = easeInOut(animT);
    M.camera.position.lerpVectors(animCamStart, PLAYER_START, t);
    M.camera.quaternion.slerpQuaternions(animQuatStart, animQuatEnd, t);
  } else if (state === S_FPS) {
    tickFPS(dt);
  }
}

/* ========================================================= */
/* ---- enter / exit                                     ---- */
/* ========================================================= */
function enter() {
  if (active) return;
  M = window.MosqueScene;
  if (!M) return;
  active = true;
  animCamStart.copy(M.camera.position);
  animQuatStart.copy(M.camera.quaternion);
  animQuatEnd.setFromEuler(new THREE.Euler(0, PLAYER_YAW0, 0, 'YXZ'));
  animT = 0; state = S_APPROACH;
  M.controls.enabled = false;
  document.querySelector('.mq-ui')?.classList.add('dg-hidden');
  if (!ambLight) {
    ambLight   = new THREE.AmbientLight(0xffe8c0, 0.08);
    pointLight = new THREE.PointLight(0xffd090, 0.6, 12);
    M.scene.add(ambLight); M.scene.add(pointLight);
  }
  ambLight.color.set(0xffe8c0); ambLight.intensity = 0.08;
  ambLight.visible = true; pointLight.visible = true;
  buildColliders();
  if (typeof window.stopModelWind === 'function') window.stopModelWind();
  _playInsideSound();

  _loadDirModel();

  M.setGameUpdate(update);
}

function exit() {
  if (!active) return;
  active = false; state = S_IDLE;
  joyInput.x = joyInput.y = 0;
  keys.w = keys.a = keys.s = keys.d = false;
  lookDragId = null; lookOffsetYaw = 0; lookOffsetPitch = 0;
  _portalCooldown = 0;
  _velY = 0;
  resetTombScan();
  resetPetitTombScan();
  resetImamScan();
  resetEntreeScan();
  _clearDirMarkers();
  if (_markerImam) M.scene.remove(_markerImam);
  if (ambLight)   { ambLight.color.set(0xffe8c0); ambLight.intensity = 0.08; ambLight.visible = false; }
  if (pointLight)   pointLight.visible = false;
  hideHud();
  M.setGameUpdate(null);
  document.querySelector('.mq-ui')?.classList.remove('dg-hidden');
  M.controls.enabled = true;
  M.controls.maxPolarAngle = Math.PI * 0.495;
  M.camera.rotation.order = 'XYZ';
  M.camera.position.copy(M.viewOverview);
  M.controls.target.copy(M.viewTarget);
  M.controls.update();
  _stopInsideSound();
  _stopWalk();
  if (typeof window.playModelWind  === 'function') window.playModelWind();
}

/* --------------------------------------------------------- */
window.SanctuaryMode = { enter, exit, isActive };
