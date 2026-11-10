/* ==========================================================
   MODE JEU — Pilotage de drone (vol libre dans la maquette)
   Dépend de window.MosqueScene exposé par mosque-viewer.js.
   ========================================================== */
import * as THREE from 'three';
import { mediaUrl, currentBytesPlan } from './device-quality.js?v=6';
import { t as _t } from './i18n.js?v=1';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { createRemote, fovFor, aimDrop } from './drone-remote.js?v=1';
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
window.GameAudio?.track(_scannerSound, 'effects');
const _playScanner = () => { _scannerSound.currentTime = 0; _scannerSound.play().catch(() => {}); };

/* Déverrouillage iOS : play+pause synchrone sur premier geste */
document.addEventListener('audioUnlock', () => {
  [_scannerSound].forEach(a => {
    if (!a.paused) return;
    a.play().catch(() => {}); a.pause(); a.currentTime = 0;
  });
}, { once: true });

/* Son drone part — joué 30s après le début du jeu */
const _dronePart = new Audio(mediaUrl('dronePart'));       // mobile : version allégée (0,7 Mo au lieu de 4,7 Mo)
_dronePart.preload = currentBytesPlan().deferHeavyAudio ? 'none' : 'auto';   // mobile / réseau lent : chargé au premier vol
window.GameAudio?.track(_dronePart, 'drone');
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
const elNeedle  = document.getElementById('dgNeedle');
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

/* ---------- Visée / zoom (L2/LT manette ou clic droit souris) ---------- */
let aiming = false;
const AIM_FOV      = 25;      // FOV en visée (plus petit = plus zoomé)
const AIM_DIST     = 3.5;     // distance caméra–drone en visée (au lieu de ORBIT_HDIST = 7)
let _savedFov = null;         // FOV d'origine pour restauration
let _aimMouseRight = false;   // état clic droit souris

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
const SCAN_DIST     = 28;       // (obsolète — remplacé par zone horizontale + altitude)
const SCAN_DIST_H   = 18;       // rayon HORIZONTAL (xz) de déclenchement — zone réduite
const SCAN_VERT     = 7;        // tolérance verticale sous le centre des œufs (drone doit être EN HAUT)
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

  // Zone de déclenchement : proche horizontalement ET en hauteur (au niveau des œufs).
  // Évite que le scanner se déclenche quand le drone est EN BAS / dans le village.
  const dxz    = Math.hypot(rig.position.x - oeufCenter.x, rig.position.z - oeufCenter.z);
  const inZone = dxz < SCAN_DIST_H && rig.position.y > (oeufCenter.y - SCAN_VERT);

  if(scanState === 'idle'){
    if(inZone){
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
    if(!inZone){
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

const DRACO_DECODER = 'assets/vendor/three/examples/jsm/libs/draco/';

// Registre des modèles pilotables. yaw = offset d'orientation pour aligner le nez sur le
// sens de vol (+Z monde). pick = fonction de sélection du clip selon les entrées.
// spinProps = true si l'anim doit être modulée par propSpeed (hélices qui ralentissent au sol).
const MODELS = {
  drone: {
    url: 'assets/models/drone.glb',
    yaw: Math.PI / 2,          // le drone a son nez sur +X -> +90° pour viser +Z
    idle: 'Idle_Hover',
    spinProps: true,
    pick: pickClipDrone,
  },
  vaisseau: {
    url: `assets/models/vaisseau.glb?v=1`, // version fixe : à incrémenter à chaque ré-export (le cache navigateur sert le reste)
    yaw: -Math.PI / 2,         // nez du modèle sur -X local -> -90° pour aligner le nez sur l'avant du rig (-Z)
    idle: 'Hover',
    spinProps: false,          // hélices déjà en boucle continue dans chaque clip
    scale: 3,                  // vaisseau 3× plus grand que le drone
    pick: pickClipVaisseau,
  },
};

// État par modèle chargé : id -> { root, mixer, actions, currentClip, loaded, loading, footprint }
const modelState = {};

/* ---------- Ombre de contact (blob) : disque sombre plaqué au sol sous l'appareil ---------- */
let blobShadow = null;
function makeBlobShadow(){
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 128;
  const g = cvs.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.30)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const tex  = new THREE.CanvasTexture(cvs);
  const mat  = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;   // à plat sur le sol
  mesh.renderOrder = 2;
  mesh.name = 'blobShadow';
  mesh.raycast = () => {};          // JAMAIS un obstacle : invisible au raycasting (sol, collisions, scan)
  return mesh;
}
let activeModelId = 'drone'; // le drone est toujours le modèle affiché à l'entrée
let _gpHintShown  = false;   // aide manette déjà affichée ? (une fois par session)

// Entrées normalisées -1..1 (gauche: lx=yaw, ly=altitude ; droite: rx=strafe, ry=avance)
// input = fusion joysticks tactiles + manette (recalculé à chaque frame par applyGamepad())
const input      = { lx:0, ly:0, rx:0, ry:0 };
const touchInput = { lx:0, ly:0, rx:0, ry:0 };   // joysticks à l'écran uniquement

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
/* Fondu de caméra entre le personnage (sanctuaire) et le pilotage : au lancement, la caméra part de la vue du personnage et glisse vers la vue du drone (plus de coupure). */
let _camBlend = null;
const _camQ = new THREE.Quaternion();
const CAM_BLEND_DUR = 0.9;   // s
let launchGrace = 0;     // s : juste après le lancement depuis le sac, hélices en rotation (jamais « posé »)
let propSpeed = 1;      // vitesse de l'animation (hélices), lissée : 1 en vol, 0 posé
let launchActive = false; // décollage depuis le sac : L1/LB fait revenir le drone

/* --- Vue du pilote (vol depuis le sac) : caméra aux yeux du joueur, qui regarde le drone au loin ; télécommande + téléphone en incrustation (app/drone-remote.js) --- */
const remote = createRemote();
/* Barre d'outils de la vue du pilote : icônes dessinées (enregistrer, photo, menu, drone, caméra) à la place des émojis ; le bouton du milieu est mis en avant */
const TB_ICONS = {
  dgGallery: '<svg viewBox="0 0 24 24"><path d="M5 3h11l3 3v15H5z M8 3v6h7V3 M8 21v-7h8v7"/></svg>',
  dgPhoto: '<svg viewBox="0 0 24 24"><path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13.5" r="3.6"/></svg>',
  dgList: '<svg viewBox="0 0 24 24"><path d="M5 7h14 M5 12h14 M5 17h14"/></svg>',
  dgModel: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="2.4"/><circle cx="5.5" cy="5.5" r="2.6"/><circle cx="18.5" cy="5.5" r="2.6"/><circle cx="5.5" cy="18.5" r="2.6"/><circle cx="18.5" cy="18.5" r="2.6"/><path d="M7.4 7.4l3 3 M16.6 7.4l-3 3 M7.4 16.6l3-3 M16.6 16.6l-3-3"/></svg>',
  dgVideo: '<svg viewBox="0 0 24 24"><path d="M3 7h12v10H3z M15 11l6-3v8l-6-3"/></svg>',
};
let _tbStyled = false;
function styleToolbar() {
  if (_tbStyled) return; _tbStyled = true;
  for (const [id, svg] of Object.entries(TB_ICONS)) { const b = document.getElementById(id); if (b) { b.dataset.emoji = b.textContent; b.innerHTML = svg; b.classList.add('dg-tool--svg'); } }
  document.getElementById('dgList')?.classList.add('dg-tool--main');
}
const pilotPos = new THREE.Vector3(), pilotDir = new THREE.Vector3(), _pvLook = new THREE.Vector3(), _pvCam = new THREE.Vector3();
let pilotYaw = 0, pv = 0, pvFov = 50, fovBase = 50;       // pv : fondu 0 (poursuite) -> 1 (vue du pilote)
const droneCam = new THREE.PerspectiveCamera(72, 256 / 144, 0.3, 6000);   // la caméra du drone (écran du téléphone)
const PILOT_CAM = false;                    // true : caméra aux yeux du pilote ; false : caméra de poursuite derrière le drone (comme avant) — la télécommande et le téléphone restent affichés dans les deux cas
const PV_BACK = 2.3, PV_UP = 0.55;           // caméra du pilote : recul et hauteur par rapport à ses yeux
const _dcOff = new THREE.Vector3(0, -0.04, -0.45);

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

/* ---------- Chargement générique d'un modèle ---------- */
function ensureModel(id, onReady){
  let st = modelState[id];
  if (st && st.loaded){ onReady && onReady(st); return; }
  if (st && st.loading) return;                 // chargement déjà en cours
  st = modelState[id] = { root:null, mixer:null, actions:{}, currentClip:'', loaded:false, loading:true };
  const def = MODELS[id];
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_DECODER);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load(def.url, (gltf)=>{
    const root = gltf.scene;
    // Normaliser la taille à ~DRONE_SIZE unités (échelle de la maquette)
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(DRONE_SIZE / maxDim * (def.scale || 1));
    root.rotation.y = def.yaw;                  // aligne le nez sur le sens du vol
    // Recentrer APRÈS échelle + rotation : le centre géométrique tombe pile sur l'origine
    // du rig (sinon un modèle non centré dérive quand on l'agrandit, ex. vaisseau ×3)
    root.updateMatrixWorld(true);
    const fbox   = new THREE.Box3().setFromObject(root);
    const center = fbox.getCenter(new THREE.Vector3());
    root.position.sub(center);
    const fsize  = fbox.getSize(new THREE.Vector3());
    st.footprint = Math.max(fsize.x, fsize.z) || DRONE_SIZE;   // largeur au sol -> taille de l'ombre
    root.traverse((o) => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    st.mixer = new THREE.AnimationMixer(root);
    gltf.animations.forEach((clip)=>{
      const a = st.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      st.actions[clip.name] = a;
    });
    if (st.actions[def.idle]){ st.actions[def.idle].play(); st.currentClip = def.idle; }
    st.root = root; st.loaded = true; st.loading = false;
    onReady && onReady(st);
  }, undefined, (err)=>{
    console.error('Erreur chargement modèle "'+id+'" :', err);
    st.loading = false;
    if (id !== 'drone'){          // repli automatique sur le drone
      activeModelId = 'drone';
      ensureModel('drone', attachActive);
      if (typeof window.updateModelButton === 'function') window.updateModelButton();
    }
  });
}

// Attache le modèle actif au rig et détache les autres (le rig conserve pos/vitesse/cap)
function attachActive(st){
  for (const k in modelState){
    const s = modelState[k];
    if (s && s.root && s !== st) rig.remove(s.root);
  }
  if (st && st.root && st.root.parent !== rig) rig.add(st.root);
}

// Bascule le modèle actif (charge à la demande), conserve pos/vitesse/cap du rig.
function setModel(id){
  if (!MODELS[id] || id === activeModelId) return;
  // Stoppe proprement les actions du modèle qu'on quitte (évite qu'un mixer inactif garde un état)
  const prev = modelState[activeModelId];
  if (prev && prev.mixer) prev.mixer.stopAllAction();
  activeModelId = id;
  ensureModel(id, (st) => {
    attachActive(st);
    // Repart de l'idle du nouveau modèle
    const def = MODELS[id];
    if (st.actions[def.idle]){ st.actions[def.idle].reset().play(); st.currentClip = def.idle; }
  });
  if (typeof window.updateModelButton === 'function') window.updateModelButton();
}

function activeState(){ return modelState[activeModelId]; }

/* ---------- Entrée / sortie ---------- */
function enter(opts){
  if (active) return;
  M = window.MosqueScene;
  if (!M) return;
  active = true;
  const launch = opts && opts.launch;
  launchActive = !!(launch && launch.position);

  if (!rigAdded){ M.scene.add(rig); rigAdded = true; }
  rig.visible = true;                 // réaffiche le drone en entrant en mode jeu
  ensureModel(activeModelId, attachActive);

  if (launch && launch.position){
    // Décollage depuis le sac du personnage : on reprend la position du drone
    rig.position.copy(launch.position);
    rig.rotation.set(0, (launch.yaw || 0) + Math.PI, 0);   // nez dans le même sens que le personnage
    camYaw = rig.rotation.y;
    vel.fwd = vel.side = vel.up = vel.yaw = 0;
    battery = 100;
    _prevPos.copy(rig.position);
    { const pp = window.SanctuaryMode?.vehicle?.pos; if (pp) pilotPos.copy(pp); else pilotPos.copy(rig.position); pilotYaw = launch.yaw || 0; pv = 0; fovBase = M.camera.fov; pvFov = fovBase; }

    // la caméra actuelle (vue du personnage) sert de point de départ au fondu vers la vue du pilote
    _camBlend = { t: 0, pos: M.camera.position.clone(), quat: M.camera.quaternion.clone(), fov: M.camera.fov };

    // Déjà en vol : caméra poursuite derrière le drone
    orbitMode      = false;
    orbitReturning = false;
    orbitAzim      = camYaw;
    orbitElev      = -0.15;
    landed         = false;
    launchGrace    = 2.5; propSpeed = 1;      // le drone apparaît hélices déjà lancées, en vol stationnaire (Idle_Hover)
    { const _s0 = activeState(); if (_s0 && _s0.mixer) _s0.mixer.timeScale = 1; }

    // Caméra chase immédiate (évite un flash de la vue d'ensemble au passage sanctuaire → pilotage)
    M.camera.position.set(
      rig.position.x + Math.sin(camYaw) * ORBIT_HDIST,
      rig.position.y + ORBIT_VOFF + Math.tan(-0.15) * ORBIT_HDIST,
      rig.position.z + Math.cos(camYaw) * ORBIT_HDIST
    );
    M.camera.lookAt(rig.position.x, rig.position.y + 1.2, rig.position.z);
  } else {
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
  }

  // Masquer l'UI normale, couper les OrbitControls
  document.querySelector('.mq-ui')?.classList.add('dg-hidden');
  M.controls.enabled = false;

  goLandscape();
  syncOrientationUi();
  sndStart();
  _initOrbitDrag();

  if (!scanGroup) initScan();
  if (!blobShadow){ blobShadow = makeBlobShadow(); M.scene.add(blobShadow); }
  blobShadow.visible = true;
  if (typeof window.stopModelWind === 'function') window.stopModelWind();
  _dronePartTimer = setTimeout(_playDronePart, 30000);

  // Affiche le message "décolle" — inutile quand le drone vient de décoller du sac
  if (!launch) takeoffHint.classList.add('is-on');
  else takeoffHint.classList.remove('is-on');

  // Aide manette (une fois par session, si une manette est branchée)
  if (window.GamepadKit?.connected() && !_gpHintShown){
    _gpHintShown = true;
    window.GamepadKit.toast(launchActive
      ? '🎮 Sticks = vol · L1 retour personnage · ✕ photo · R1 vidéo · Options menu'
      : '🎮 Manette : sticks = vol · ✕ photo · R1 vidéo · Options menu');
  }

  // Bouton bascule de modèle (drone <-> vaisseau)
  const _modelBtn = document.getElementById('dgModel');
  window.updateModelButton = function updateModelButton(){
    if (!_modelBtn) return;
    _modelBtn.textContent = activeModelId === 'vaisseau' ? '🛸' : '🚁';
    _modelBtn.setAttribute('aria-label',
      activeModelId === 'vaisseau' ? 'Passer au drone' : 'Passer au vaisseau');
  };
  if (_modelBtn && !_modelBtn._wired){
    _modelBtn._wired = true;
    _modelBtn.addEventListener('click', () => {
      setModel(activeModelId === 'vaisseau' ? 'drone' : 'vaisseau');
    });
  }
  updateModelButton();

  inspectionEnter();
  M.setGameUpdate(update);
}

function exit(opts){
  opts = opts || {};
  const toSanctuary = !!opts.toSanctuary;
  if (!active) return;
  active = false;
  if (_dronePartTimer) { clearTimeout(_dronePartTimer); _dronePartTimer = null; }
  _dronePart.pause(); _dronePart.currentTime = 0;
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
  if (blobShadow) blobShadow.visible = false;
  hud.classList.remove('is-on');
  hud.setAttribute('aria-hidden','true');
  rotateEl.classList.remove('is-on');
  takeoffHint.classList.remove('is-on');
  launchActive = false;
  remote.show(false); hud.classList.remove('dg-pilot'); document.body.classList.remove('dg-flight'); pv = 0;                    // fin de la vue du pilote : corps et champ de vision rétablis
  try { const pr = window.SanctuaryMode?.vehicle?.root?.(); if (pr) pr.visible = true; if (M.camera.fov !== fovBase) { M.camera.fov = fovBase; M.camera.updateProjectionMatrix(); } } catch (_) {}
  inspectionExit();

  try { screen.orientation.unlock(); } catch(_){}
  try {
    if (document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
    else if (document.webkitExitFullscreen && document.webkitFullscreenElement) document.webkitExitFullscreen();
  } catch(_){}

  if (toSanctuary){
    // Retour au personnage : le sanctuaire reprend la caméra, l'update et le personnage.
    M.controls.enabled = false;
    return;
  }

  document.querySelector('.mq-ui')?.classList.remove('dg-hidden');
  M.controls.enabled = true;

  // Retour à la vue d'ensemble (restaure le clamp anti-sol + resynchronise la cible OrbitControls,
  // sinon la caméra peut sauter à la 1re frame et on pourrait passer sous le sol)
  M.controls.maxPolarAngle = Math.PI * 0.495;
  M.camera.position.set(M.viewOverview.x, M.viewOverview.y, M.viewOverview.z);
  M.controls.target.copy(M.viewTarget);
  M.controls.update();
  if (typeof window.playModelWind  === 'function') window.playModelWind();
  try { window.SanctuaryMode?.endPilotHold?.(); } catch(_){}
}

/* Retour du drone vers le personnage (L1/LB, uniquement après un décollage du sac). */
function returnToCharacter(){
  if (!active || !launchActive) return false;
  const st   = activeState();
  const root = st && st.root;
  if (!root) return false;

  // Capture de la pose monde du drone avant de quitter le mode pilotage.
  root.updateWorldMatrix(true, false);
  const pose = {
    position:   new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale:      new THREE.Vector3(),
  };
  root.getWorldPosition(pose.position);
  root.getWorldQuaternion(pose.quaternion);
  root.getWorldScale(pose.scale);

  pose.cam = { pos: M.camera.position.clone(), quat: M.camera.quaternion.clone(), fov: M.camera.fov };   // vue du pilote : le sanctuaire fond depuis elle jusqu'au personnage
  window.GamepadKit?.rumble?.(90, 0.35);
  _camBlend = null;
  exit({ toSanctuary: true });
  const ok = window.SanctuaryMode?.returnDrone?.(pose);
  if (!ok){
    // Sécurité : si le sanctuaire ne peut pas reprendre, on restaure la vue d'ensemble.
    document.querySelector('.mq-ui')?.classList.remove('dg-hidden');
    M.controls.enabled = true;
    M.camera.position.set(M.viewOverview.x, M.viewOverview.y, M.viewOverview.z);
    M.controls.target.copy(M.viewTarget);
    M.controls.update();
    try { window.SanctuaryMode?.endPilotHold?.(); } catch(_){}
  }
  return true;
}

/* ---------- Choix de l'animation selon le vol ---------- */
function pickClipVaisseau(){
  const ary = Math.abs(input.ry);   // ry = avance (ry<0 = haut = avancer)
  // Virage : horizontale du stick (droit rx prioritaire, sinon gauche lx). Droite = TurnRight, gauche = TurnLeft.
  const turn = Math.abs(input.rx) > Math.abs(input.lx) ? input.rx : input.lx;
  if (Math.abs(turn) > 0.15) return turn > 0 ? 'TurnRight' : 'TurnLeft';
  if (ary > 0.15) return input.ry < 0 ? 'Reverse'  : 'Forward';    // clips inversés côté modèle : haut(avance)=clip Reverse, bas(recule)=clip Forward
  return 'Hover';
}

function pickClipDrone(){
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

function setClipOn(st, name){
  if (!st || !name || name === st.currentClip || !st.actions[name]) return;
  const next = st.actions[name];
  const prev = st.actions[st.currentClip];
  next.reset().play();
  if (prev) prev.crossFadeTo(next, 0.25, false);
  else next.fadeIn(0.25);
  st.currentClip = name;
}

/* ---------- Collisions (raycasting) ---------- */
const raycaster = new THREE.Raycaster();
let colliders = null;                 // meshes solides (construits une fois)
const DRONE_SIZE    = 0.75;           // taille du drone (minuscule face à la mosquée ~20m ; plus petit que le personnage quand il décolle du sac)
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
  // Rayon juste au-dessus du drone : on veut la surface SOUS lui (sol/étage),
  // pas le toit qui se trouve au-dessus quand on décolle depuis l'intérieur.
  _rayOrigin.copy(rig.position); _rayOrigin.y += 0.5;
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
  _hapticCooldown = 0.30;                     // 300 ms avant la prochaine
  window.GamepadKit?.rumble?.(90, 0.7);       // vibration manette (si branchée)
  if (navigator.vibrate) navigator.vibrate([70, 35, 40]);   // choc + rebond (mobile)
}

/* ---------- Manette (GamepadKit) ----------
   Sticks = vol (mêmes axes que les joysticks tactiles).
   Drone posé (caméra orbitale) : le stick droit fait tourner la caméra.
   Boutons : A photo · RB vidéo · Options/BACK menu des lieux (avec Quitter) ·
             L1/LB retour au personnage uniquement après un décollage du sac.
   △/Y, ○/B et X hors menu sont volontairement inactifs.
   Retourne true si la manette demande la sortie du mode jeu. */
function applyGamepad(dt){
  const GP = window.GamepadKit;
  const g  = (GP && GP.connected()) ? GP.state() : null;

  // Caméra orbitale au stick droit quand le drone est posé
  const orbitCam = orbitMode && !!g;
  if (orbitCam){
    orbitAzim -= g.rx * 2.6 * dt;
    orbitElev  = Math.max(ORBIT_ELEV_MIN, Math.min(ORBIT_ELEV_MAX, orbitElev + g.ry * 1.7 * dt));
  }

  // Fusion tactile + manette (bornée à -1..1)
  input.lx = touchInput.lx + (g ? g.lx : 0);
  input.ly = touchInput.ly + (g ? g.ly : 0);
  input.rx = touchInput.rx + (g && !orbitCam ? g.rx : 0);
  input.ry = touchInput.ry + (g && !orbitCam ? g.ry : 0);
  for (const k of ['lx','ly','rx','ry']){
    if (input[k] >  1) input[k] =  1;
    if (input[k] < -1) input[k] = -1;
  }

  if (!g) return false;
  // Retour du drone sur le personnage : L1/LB uniquement.
  if (launchActive && GP.justPressed('LB')){
    returnToCharacter();
    return true;
  }
  if (GP.justPressed('A')){                              // 📷 photo
    takePhoto();
    GP.toast('📷 Photo prise !');
  }
  if (GP.justPressed('RB'))   toggleRecord();            // 🎥 démarrer / arrêter la vidéo
  if (GP.justPressed('Y') && _insp.pickup) inspectionPickup();   // △/Y : récupérer le dispositif (scène 1)
  if (GP.justPressed('START') || GP.justPressed('BACK')) toggleList();   // ☰ menu des lieux
  // △/Y, ○/B et X hors menu : aucune action (les menus sont gérés par
  // KeyboardMenu : croix directionnelle + X pour valider).
  return false;
}

/* ---------- Viseur de visée (zoom L2/LT ou clic droit souris) ---------- */
function _ensureAimReticle(){
  if (document.getElementById('dgAimReticle')) return;
  const reticle = document.createElement('div');
  reticle.id = 'dgAimReticle';
  reticle.style.cssText = [
    'position:fixed','left:50%','top:50%','transform:translate(-50%,-50%)',
    'width:170px','height:170px','pointer-events:none','z-index:60',
    'display:none'
  ].join(';');
  reticle.innerHTML = `
    <div style="position:absolute;inset:0;border:3px solid rgba(249,213,139,.7);border-radius:50%;box-shadow:0 0 15px rgba(249,213,139,.4);"></div>
    <div style="position:absolute;left:50%;top:50%;width:3px;height:28px;background:rgba(249,213,139,1);transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:28px;height:3px;background:rgba(249,213,139,1);transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:2px;height:14px;background:#fff;transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:14px;height:2px;background:#fff;transform:translate(-50%,-50%);"></div>
  `;
  document.body.appendChild(reticle);
}

function _toggleAim(on){
  _ensureAimReticle();
  const ret = document.getElementById('dgAimReticle');
  if (on){
    _savedFov = M.camera.fov;
    M.camera.fov = AIM_FOV;
    M.camera.updateProjectionMatrix();
    ret.style.display = 'block';
  } else {
    if (_savedFov !== null){
      M.camera.fov = _savedFov;
      M.camera.updateProjectionMatrix();
      _savedFov = null;
    }
    ret.style.display = 'none';
  }
}

/* ---------- Boucle de vol ---------- */
function update(dt){
  dt = Math.min(dt, 0.05);   // borne pour éviter les sauts
  if (dt <= 0) return;       // frame nulle : évite une vitesse NaN (division par dt plus bas)
  try { window.SanctuaryMode?.pilotTick?.(dt, rig.position); } catch(_) {}   // personnage visible pendant le vol
  if (applyGamepad(dt)) return;   // manette : sortie demandée

  // --- Visée zoom : L2/LT manette, ou clic droit souris ---
  const GP = window.GamepadKit;
  const gp = GP && GP.connected() ? GP.state() : null;
  const wantAimGP = gp ? GP.down('LT') : false;   // gâchette gauche (L2 sur beaucoup de manettes)
  const wantAim = wantAimGP || _aimMouseRight;
  if (wantAim !== aiming){
    aiming = wantAim;
    _toggleAim(aiming);
  }

  const _st = activeState();
  if (_st && _st.mixer){
    const _def = MODELS[activeModelId];
    if (_def.spinProps){
      const target = landed ? 0 : 1;                       // hélices à l'arrêt quand posé
      propSpeed += (target - propSpeed) * Math.min(1, 6 * dt);
      if (target === 0 && propSpeed < 0.03) propSpeed = 0;
      _st.mixer.timeScale = propSpeed;
    } else {
      _st.mixer.timeScale = 1;                             // vaisseau : vitesse d'anim constante
    }
    _st.mixer.update(dt);
    setClipOn(_st, _def.pick());
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

  // Barrière invisible : bloque le drone avant les collines (inner = 0.70R).
  // Ville v2 : plus de barrière autour de la mosquée, seulement le bord du terrain (≈ 5 km).
  const maxR = M.newCity ? 4800 : (M.domeRadius || 600) * 0.62;
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

  // Ombre de contact : toujours visible sous l'appareil (drone ET vaisseau), même posé au sol
  if (blobShadow){
    if (minY > -Infinity){
      const surfaceY = minY - CLEARANCE;                 // groundUnder() = surface + CLEARANCE
      const alt      = Math.max(0, rig.position.y - surfaceY);
      const _bs      = activeState();
      const foot     = (_bs && _bs.footprint) ? _bs.footprint : DRONE_SIZE;
      const s        = foot * 1.5 * (1 + Math.min(alt / 25, 1.3));    // grandit en montant
      blobShadow.visible = true;
      blobShadow.position.set(rig.position.x, surfaceY + 0.05, rig.position.z);
      blobShadow.scale.set(s, s, 1);
      blobShadow.material.opacity = Math.max(0.1, 0.5 * (1 - Math.min(alt / 45, 1)));  // s'estompe en hauteur
    } else {
      blobShadow.visible = false;
    }
  }

  // "Posé" = au sol, sans commande et quasi immobile -> on coupe les hélices
  const noInput = (Math.abs(input.lx) + Math.abs(input.ly) + Math.abs(input.rx) + Math.abs(input.ry)) < 0.1;
  const slow    = (Math.abs(vel.fwd) + Math.abs(vel.side) + Math.abs(vel.up)) < 2;
  if (launchGrace > 0) launchGrace -= dt;
  landed = grounded && noInput && slow && launchGrace <= 0;

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
  // Vue du pilote : fondu vers les yeux du joueur (position fixe), qui suivent le drone ; champ de vision réglé pour garder le drone lisible
  const wantPilot = PILOT_CAM && launchActive && !aiming;
  pv += ((wantPilot ? 1 : 0) - pv) * (1 - Math.exp(-3 * dt));
  if (pv > 0.002) {
    pilotDir.set(Math.sin(pilotYaw), 0, Math.cos(pilotYaw));
    _pvCam.copy(pilotPos).addScaledVector(pilotDir, -PV_BACK); _pvCam.y += PV_UP;        // quelques mètres derrière sa tête : le drone qui décolle au-dessus de lui reste dans le champ
    const dist = _pvCam.distanceTo(rig.position);
    const tf = fovFor(dist);
    pvFov += (tf - pvFov) * (1 - Math.exp(-6 * dt));
    _pvLook.copy(rig.position); _pvLook.y -= aimDrop(dist, pvFov);          // le drone apparaît dans la moitié haute : la télécommande occupe le bas
    { const dx = _pvLook.x - _pvCam.x, dz = _pvLook.z - _pvCam.z, hd = Math.max(0.5, Math.hypot(dx, dz)), el = Math.atan2(_pvLook.y - _pvCam.y, hd);
      const ce = Math.max(-0.7, Math.min(0.5, el)); if (ce !== el) _pvLook.y = _pvCam.y + Math.tan(ce) * hd; }      // jamais de regard vertical (pas de bascule) : le drone peut sortir par le haut
    _camPos.lerp(_pvCam, pv);
    M.camera.position.copy(_camPos);
    M.camera.lookAt(rig.position.x + (_pvLook.x - rig.position.x) * pv, rig.position.y + _lookOffY + (_pvLook.y - rig.position.y - _lookOffY) * pv, rig.position.z + (_pvLook.z - rig.position.z) * pv);
    M.camera.fov = fovBase + (pvFov - fovBase) * pv; M.camera.updateProjectionMatrix();
  } else {
    M.camera.position.copy(_camPos);
    M.camera.lookAt(rig.position.x, rig.position.y + _lookOffY, rig.position.z);
  }
  const pilotOn = launchActive && !aiming;                  // télécommande + petites interfaces : en vol depuis le sac, hors visée
  if (pilotOn !== remote.visible) { remote.show(pilotOn); hud.classList.toggle('dg-pilot', pilotOn); document.body.classList.toggle('dg-flight', pilotOn); if (pilotOn) styleToolbar(); }
  { const pr = window.SanctuaryMode?.vehicle?.root?.(); if (pr) pr.visible = !(pv > 0.35); }          // vue à la première personne : le corps du pilote n'est pas dans le champ
  if (remote.visible) {
    const dist0 = rig.position.distanceTo(_prevPos);
    droneCam.position.copy(_dcOff).applyQuaternion(rig.quaternion).add(rig.position);
    droneCam.quaternion.copy(rig.quaternion); droneCam.rotateX(-0.14); droneCam.updateMatrixWorld(true);
    const _ag = (minY > -Infinity) ? (minY - CLEARANCE) : M.viewTarget.y;
    remote.update(dt, { lx: input.lx, ly: input.ly, rx: input.rx, ry: input.ry, altM: rig.position.y - _ag, speedMs: dist0 / dt, headingDeg: ((THREE.MathUtils.radToDeg(rig.rotation.y) % 360) + 360) % 360, battery },
      ((window.Quality && window.Quality.level) || 'mid') !== 'low' ? { renderer: M.renderer, scene: M.scene, camera: droneCam, THREE } : null);
  }

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
    if (elNeedle) elNeedle.style.transform = `rotate(${-headingDeg}deg)`;          // l'aiguille garde le nord
    elAngle.textContent = (Math.abs(vel.fwd) * 0.25).toFixed(1) + '°';
    elSpeed.textContent = speedMph + ' MPH';
    const _groundY = (minY > -Infinity) ? (minY - CLEARANCE) : M.viewTarget.y;
    elAlt.textContent   = 'H : ' + Math.max(0, Math.round(rig.position.y - _groundY)) + 'M';

    battery = Math.max(0, battery - 0.01);
    elBatt.textContent = Math.round(battery) + '%';
    const bars = Math.max(0, Math.min(4, Math.ceil(battery / 25)));            // les barres montrent la batterie
    elSignal.textContent = '▮'.repeat(bars) + '▯'.repeat(4-bars);
  }

  tickScan(dt);
  inspectionTick(dt);

  let _fovTrue = null;
  if (_camBlend) {                                            // fondu depuis la caméra du personnage (sortie du sac) vers la caméra du drone
    _camBlend.t += dt;
    const u = Math.min(1, _camBlend.t / CAM_BLEND_DUR), k = u * u * (3 - 2 * u);
    _fovTrue = M.camera.fov;
    _camQ.copy(M.camera.quaternion);
    M.camera.position.lerpVectors(_camBlend.pos, M.camera.position, k);
    M.camera.quaternion.slerpQuaternions(_camBlend.quat, _camQ, k);
    const f = _camBlend.fov + (_fovTrue - _camBlend.fov) * k;
    if (Math.abs(f - _fovTrue) > 0.01) { M.camera.fov = f; M.camera.updateProjectionMatrix(); } else _fovTrue = null;
    if (u >= 1) _camBlend = null;
  }
  M.renderer.render(M.scene, M.camera);
  if (_fovTrue !== null) { M.camera.fov = _fovTrue; M.camera.updateProjectionMatrix(); }
}

btnQuit?.addEventListener('click', exit);
document.getElementById('dgMapPill')?.addEventListener('click', () => { try { window.CityMap?.toggle?.(); } catch (_) {} });

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
  touchInput.lx=x; touchInput.ly=y;
});
const STICK_R_SENS = 0.45; // réduit la sensibilité du joystick droit
makeStick(document.getElementById('dgStickR'), (x,y)=>{
  touchInput.rx=x*STICK_R_SENS; touchInput.ry=y*STICK_R_SENS;
});

/* ---------- Outil Photo ---------- */
function takePhoto(){
  // Rendre une frame fraîche puis lire le canvas (preserveDrawingBuffer non garanti)
  M.renderer.render(M.scene, M.camera);
  const url = M.renderer.domElement.toDataURL('image/png');
  photos.push(url);
  inspectionPhoto();
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
    window.GamepadKit?.toast?.('🎥 Vidéo enregistrée');
  };
  recorder.start();
  btnVideo.classList.add('is-active');
  window.GamepadKit?.toast?.('🎥 Enregistrement en cours…');
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
  // Sortie du mode pilotage depuis le menu (utile à la manette).
  const quit = document.createElement('button');
  quit.type = 'button';
  quit.textContent = '↩ Quitter';
  quit.addEventListener('click', ()=>{ poiPanel.hidden = true; exit(); });
  poiPanel.appendChild(quit);
  poiPanel.hidden = false;
  window.KeyboardMenu?.move?.(1);   // focus sur le 1er item (manette)
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
let _sndSub    = null;   // OscillatorNode sub-bass (sine) — "géant" pour le vaisseau
let _sndSubGn  = null;   // GainNode du sub-bass (0 pour le drone)
let _sndOn     = false;
let _sndTimer  = 0;

/* Profil sonore selon le modèle actif. Le drone garde EXACTEMENT ses valeurs d'origine ;
   le vaisseau reçoit un profil "géant" : fréquence très grave, timbre riche (sawtooth),
   sub-bass ressentie, réverb immense. Lu dynamiquement -> le swap glisse en live. */
function sndProfile(){
  if (activeModelId === 'vaisseau'){
    return {
      type: 'sawtooth', baseHz: 30, detunes: [0, 3, -2, 5], pitchSpread: 0.14,
      subHz: 24, subGain: 0.30,
      wetBase: 0.55, wetSpeed: 0.10, master: 0.85, masterSpeed: 0.10,
      noiseBase: 0.05, noiseYaw: 0.03, bandHi: 700, bandHiSpeed: 700,
      bandLo: 180, bandLoSpeed: 120, idleHz: 24, idleMaster: 0.30, idleBandHi: 380,
    };
  }
  return {  // drone — valeurs d'origine, inchangées
    type: 'triangle', baseHz: 90, detunes: [0, 5, -4, 9], pitchSpread: 0.28,
    subHz: 0, subGain: 0,
    wetBase: 0.35, wetSpeed: 0.10, master: 0.62, masterSpeed: 0.14,
    noiseBase: 0.08, noiseYaw: 0.04, bandHi: 1400, bandHiSpeed: 1800,
    bandLo: 300, bandLoSpeed: 150, idleHz: 72, idleMaster: 0.18, idleBandHi: 600,
  };
}

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
  window.GameAudio?.ctx(_sndCtx, 'drone');
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

  // 4 moteurs — panés L/R pour stéréo spread naturel. Type/fréquence issus du profil du modèle.
  const prof = sndProfile();
  const pans = [-0.5, 0.5, -0.3, 0.3];
  pans.forEach((pan, i) => {
    const osc = _sndCtx.createOscillator();
    osc.type = prof.type;
    osc.frequency.value = prof.baseHz + prof.detunes[i];
    const panner = _sndCtx.createStereoPanner();
    panner.pan.value = pan;
    const g = _sndCtx.createGain();
    g.gain.value = 0.08;
    osc.connect(g); g.connect(panner); panner.connect(srcBus);
    osc.start();
    _sndMotors.push(osc);
  });

  // Sub-bass (sine) : couche grave "ressentie" — muet pour le drone, puissant pour le vaisseau
  _sndSub = _sndCtx.createOscillator();
  _sndSub.type = 'sine';
  _sndSub.frequency.value = prof.subHz || 24;
  _sndSubGn = _sndCtx.createGain();
  _sndSubGn.gain.value = prof.subGain;
  _sndSub.connect(_sndSubGn); _sndSubGn.connect(srcBus);
  _sndSub.start();

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
  const p  = sndProfile();

  // Timbre + sub-bass : suivent le modèle actif (glissent en douceur après un swap à chaud)
  _sndMotors.forEach(o => { if (o.type !== p.type) o.type = p.type; });
  if (_sndSub){
    _sndSub.frequency.setTargetAtTime(p.subHz || 0.0001, t, 0.6);
    _sndSubGn.gain.setTargetAtTime(isLanded ? p.subGain * 0.7 : p.subGain, t, 0.6);
  }

  if (isLanded){
    _sndMaster.gain.setTargetAtTime(p.idleMaster, t, 0.5);
    _sndMotors.forEach((o, i) => o.frequency.setTargetAtTime(p.idleHz + p.detunes[i], t, 0.7));
    _sndBandHi.frequency.setTargetAtTime(p.idleBandHi, t, 0.7);
    return;
  }
  if (_sndMaster.gain.value < 0.15) _sndMaster.gain.setTargetAtTime(p.master, t, 0.5);

  const sN = Math.min(Math.abs(speedMs) / SPEED, 1);
  const yN = Math.min(Math.abs(yawInput), 1);
  const pitchMult = 1 + sN * p.pitchSpread + yN * 0.06;

  _sndMotors.forEach((o, i) => {
    o.frequency.setTargetAtTime((p.baseHz + p.detunes[i]) * pitchMult, t, TC);
  });

  _sndBandHi.frequency.setTargetAtTime(p.bandHi + sN * p.bandHiSpeed, t, TC);
  _sndBandLo.frequency.setTargetAtTime(p.bandLo + sN * p.bandLoSpeed, t, TC);

  // Plus de vitesse → mix plus mouillé (son se disperse dans l'espace)
  _sndWet.gain.setTargetAtTime(p.wetBase + sN * p.wetSpeed, t, TC);
  _sndDry.gain.setTargetAtTime((1 - p.wetBase) - sN * p.wetSpeed, t, TC);

  _sndMaster.gain.setTargetAtTime(p.master + sN * p.masterSpeed + yN * 0.05, t, TC);
  _sndNoisGn.gain.setTargetAtTime(p.noiseBase + yN * p.noiseYaw, t, TC);
}

function sndStop(){
  if (!_sndOn || !_sndCtx) return;
  _sndMaster.gain.setTargetAtTime(0, _sndCtx.currentTime, 0.3);
  setTimeout(() => {
    try { _sndMotors.forEach(o => o.stop()); } catch(_){}
    try { _sndNoise.stop(); } catch(_){}
    try { _sndSub && _sndSub.stop(); } catch(_){}
    try { _sndCtx.close(); } catch(_){}
    _sndCtx = null; _sndMotors = []; _sndNoise = null; _sndSub = null; _sndSubGn = null; _sndOn = false;
  }, 900);
}

/* ==========================================================
   SCÈNES 0-1 — VOL D'INSPECTION (bible de scénario, chapitre 1)
   ----------------------------------------------------------
   Après l'ouverture (taama.acte = '0:done'), le joueur pilote le drone et inspecte la mosquée, en commençant par le toit.
   • objectif affiché en haut de l'écran tant que le dispositif 1 n'est pas récupéré ;
   • repérage : drone à ≤ 12 m du dispositif et dispositif dans le champ (ou photo prise dans cette zone) →
     événement « dispositif1:spotted », taama.d1.spotted = '1', radio, séquence 4 terminée ;
   • ~60 s sans repérage : radio d'indice ;
   • ≤ 6 m : Dispositif1.activate() (le dispositif s'illumine) ; ≤ 3 m et activé : « E / ▲ Récupérer le dispositif » → Dispositif1.take(),
     puis le drone revient sur le personnage (à pied, devant la mosquée, près du pick-up).
   ========================================================== */
const INSP_SPOT_R = 12, INSP_ACT_R = 6, INSP_TAKE_R = 3, INSP_HINT_S = 60;
const _insp = { on: false, spotted: false, activated: false, pickup: false, taking: false, t: 0, hinted: false, ph: 0 };
const _inspV = new THREE.Vector3();
let _inspUi = null, _inspTakeUi = null;
const _lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const _lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const _radio = (key) => { try { const r = window.Tapama?.RADIO?.[key]; if (r) window.Tapama.radio({ text: r.text, mood: r.mood }); } catch (_) {} };

function inspectionWanted(){
  if (_lsGet('taama.dispositif1') === '1') return false;
  const a = _lsGet('taama.acte');
  return a === '0:done' || a === '1:vol';
}

function _inspEl(id, css, html){
  const d = document.createElement('div');
  d.id = id; d.style.cssText = css; d.innerHTML = html; d.style.display = 'none';
  document.body.appendChild(d);
  return d;
}

function inspectionEnter(){
  _insp.on = inspectionWanted();
  _insp.spotted = _lsGet('taama.d1.spotted') === '1';
  _insp.activated = false; _insp.pickup = false; _insp.taking = false; _insp.t = 0; _insp.hinted = false;
  if (!_insp.on) return;
  if (_lsGet('taama.acte') === '0:done') {
    _lsSet('taama.acte', '1:vol');
    setTimeout(() => { if (active && _insp.on) _radio('inspection'); }, 1800);
  }
  if (!_inspUi) {
    _inspUi = _inspEl('dgInspect',
      'position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:58;padding:7px 16px;border-radius:14px;max-width:86vw;text-align:center;' +
      'background:rgba(45,40,34,.82);border:1px solid rgba(249,213,139,.8);color:#F8F3EA;font:700 14px "Open Sans",system-ui,sans-serif;pointer-events:none',
      '<span style="color:#F9D58B;margin-right:8px">◎</span><span data-t></span>');
    _inspTakeUi = _inspEl('dgTakePrompt',
      'position:fixed;left:50%;top:34%;transform:translateX(-50%);z-index:70;padding:10px 22px;border-radius:16px;cursor:pointer;' +
      'background:rgba(85,65,93,.92);border:2px solid #F9D58B;color:#F8F3EA;font:700 16px "Open Sans",system-ui,sans-serif;box-shadow:0 0 18px rgba(249,213,139,.45)',
      '<span style="color:#F9D58B;margin-right:10px">E / ▲</span><span data-t></span>');
    _inspTakeUi.addEventListener('click', () => { if (_insp.pickup) inspectionPickup(); });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat && active && _insp.pickup) { e.stopImmediatePropagation(); inspectionPickup(); }
    }, true);
  }
}

function inspectionExit(){
  _insp.on = false; _insp.pickup = false;
  if (_inspUi) _inspUi.style.display = 'none';
  if (_inspTakeUi) _inspTakeUi.style.display = 'none';
}

function inspectionSpot(){
  if (_insp.spotted) return;
  _insp.spotted = true;
  _lsSet('taama.d1.spotted', '1');
  try { window.dispatchEvent(new CustomEvent('dispositif1:spotted')); } catch (_) {}
  _radio('inspectionRepere');
  try { window.GameUI?.completeSequence?.(4); } catch (_) {}
}

function inspectionPhoto(){
  if (!_insp.on || _insp.spotted) return;
  const D = window.Dispositif1;
  if (!D || !D.built || D.taken) return;
  if (rig.position.distanceTo(D.position) <= INSP_SPOT_R * 1.5) inspectionSpot();   // photo prise dans la zone
}

function inspectionTick(dt){
  if (!_insp.on) return;
  const D = window.Dispositif1;
  if (D && D.taken) { _insp.pickup = false; return; }
  _insp.t += dt;
  if (!_insp.spotted && !_insp.hinted && _insp.t > INSP_HINT_S && !window.Tapama?.isBusy?.()) { _insp.hinted = true; _radio('inspectionIndice'); }
  if (!D || !D.built || _insp.taking) { _insp.pickup = false; return; }

  _inspV.copy(D.position); _inspV.y += 0.5;
  const dist = rig.position.distanceTo(_inspV);

  if (!_insp.spotted && dist <= INSP_SPOT_R) {
    _inspV.project(M.camera);                                   // dispositif dans le champ de la caméra ?
    if (_inspV.z < 1 && Math.abs(_inspV.x) < 1 && Math.abs(_inspV.y) < 1) inspectionSpot();
  }
  if (!_insp.activated && dist <= INSP_ACT_R) {
    _insp.activated = true;
    try { D.activate(); } catch (_) {}
  }
  _insp.pickup = !!(D.active && dist <= INSP_TAKE_R && !window.Tapama?.isBusy?.());
  _insp.ph += dt;
  if (_insp.ph > 0.1) {
    _insp.ph = 0;
    const show = hud.classList.contains('is-on');
    if (_inspUi) {
      _inspUi.querySelector('[data-t]').textContent = _t(_insp.spotted ? 'Rapproche-toi du dispositif' : 'Inspecte la mosquée en commençant par le haut');
      _inspUi.style.display = show ? '' : 'none';
    }
    if (_inspTakeUi) {
      _inspTakeUi.querySelector('[data-t]').textContent = _t('Récupérer le dispositif');
      _inspTakeUi.style.display = (show && _insp.pickup) ? '' : 'none';
    }
  }
}

function inspectionPickup(){
  const D = window.Dispositif1;
  if (!_insp.on || !_insp.pickup || _insp.taking || !D) return;
  _insp.taking = true; _insp.pickup = false;
  if (_inspTakeUi) _inspTakeUi.style.display = 'none';
  D.take();
  const done = () => {
    window.removeEventListener('dispositif1:taken', done);
    if (_lsGet('taama.acte') === '1:vol') _lsSet('taama.acte', '1:d1');
    // le drone revient sur le personnage, à pied devant la mosquée (pick-up garé à côté) ; sans personnage, retour à la vue d'ensemble puis sanctuaire
    setTimeout(() => {
      if (!active) return;
      if (launchActive && returnToCharacter()) return;
      exit();
      try { document.querySelector('[data-action="interior"]')?.click(); } catch (_) {}
    }, 2200);
  };
  window.addEventListener('dispositif1:taken', done);
}

window.DroneGame = {
  enter, exit, setModel, getModel: () => activeModelId,
  // Les tuiles de la maquette arrivent/sont libérées en cours de jeu :
  // on force la reconstruction de la liste des colliders au prochain tick.
  invalidateColliders: () => { colliders = null; },
  isActive: () => active,
  debugPilot: () => ({ pv, pvFov, fov: M && M.camera.fov, vis: remote.visible, pos: rig.position.toArray(), aiming, launchActive, landed }),
  // commandes tactiles (app/touch-controls.js) : sticks virtuels (-1..1, y écran vers le bas) et retour au personnage
  setTouchAxes: (lx, ly, rx, ry) => { touchInput.lx = lx; touchInput.ly = ly; touchInput.rx = rx * STICK_R_SENS; touchInput.ry = ry * STICK_R_SENS; },
  launched: () => launchActive,
  preload: () => { ensureModel(activeModelId, attachActive); },          // charge le modèle du drone à l'avance : il apparaît aussitôt au premier vol
  modelReady: () => { const st = modelState[activeModelId]; return !!(st && st.loaded); },
  returnToCharacter: () => returnToCharacter(),
  // diagnostic : téléporte le drone (tests du vol d'inspection)
  debugTeleport: (x, y, z) => { rig.position.set(x, y, z); vel.fwd = vel.side = vel.up = 0; },
  inspection: () => ({ ..._insp, pos: rig.position.toArray() }),
};

// le modèle du drone se charge dès que le jeu a démarré (197 Ko) : plus d'attente au premier lancement
setTimeout(() => { try { if (window.MosqueScene) ensureModel(activeModelId, attachActive); } catch (_) {} }, 2500);

// Une tuile chargée ou libérée change le décor solide : on reconstruit les colliders.
window.addEventListener('mosque:tiles-changed', () => { colliders = null; });
