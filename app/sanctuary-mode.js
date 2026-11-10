/* ==========================================================
   MODE SANCTUAIRE — Visite libre intérieure (3e personne)
   Personnage jouable : ZQSD/WASD, manette, course et saut
   Caméra qui suit · Scan automatique à l'approche des tombeaux
   ========================================================== */
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import * as Aim from './aim-system.js?v=8';
import * as WL from './water-logic.js?v=8';
import * as DroneAI from './drone-n-ai.js?v=3';
import { installHeadFade } from './head-fade.js?v=1';
import { useMeshopt, loadModel } from './gltf-extras.js?v=1';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

let _markerImam = null;

/* ---------- Indicateurs direction (GLB animé) ---------- */
const _draco = new DRACOLoader();
_draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
const _gltfDir = new GLTFLoader();
_gltfDir.setDRACOLoader(_draco);

/* ---------- Personnage joueur (GLB animé, 3e personne) ---------- */
import { heroUrl } from './hero.js?v=3';
import { MuzzleFlash } from './muzzle-flash.js?v=1';
import * as Sniper from './sniper-cam.js?v=1';
import * as AimSolve from './aim-solve.js?v=1';
import { HitIndicators } from './hit-indicator.js?v=1';
import { PlayerTag } from './player-tag.js?v=2';
import { smoothValues, dampValues } from './clip-smooth.js?v=2';
import * as AnimState from './anim-state.js?v=1';       // choix des animations (logique pure, testée)
import { CameraRig } from './camera-rig.js?v=1';        // placement de la caméra 3e personne : épaule, accroupi (logique pure, testée)
let _loadedHeroUrl = null;
const _gltfPlayer   = useMeshopt(new GLTFLoader());

let _playerRoot          = null;
let _playerModel         = null;
let _playerMixer         = null;
const _playerActions     = {};
let _playerReady         = false;
let _playerLoading       = false;
let _playerJumping       = false;
let _playerCurrentAction = '';
let _playerIdleTime      = 0;
let _playerShadow        = null;

// Tir en mouvement : le bas du corps joue idle/walk/run, le haut du corps
// joue Shoot_Gadget / Shoot_Gadget_Side. Les deux couches animent des os
// disjoints, donc elles se combinent sans écraser l'animation de tir.
const _playerLowerActions      = {};
const _playerUpperShootActions = {};
const _playerAimLowerActions   = {};   // jambes SANS bassin (le bassin vient de la couche haute en visée)
const _playerAimUpperActions   = {};   // shoot_gadget : haut du corps + bassin
let _playerShootLayer          = false;
let _playerLowerName           = '';
let _playerUpperShootName      = '';
let _playerLayeredShootAction  = null;
let _aimHold                   = false;   // pose de visée tenue (couche haute figée)

/* ---------- Gadget joueur : tir et cible ---------- */
const GADGET_GLB_NODE      = 'Pistol';          // l'arme du personnage Sahel remplace l'ancien gadget
const GADGET_MUZZLE_NODE   = 'Muzzle_Pistol';   // point de tir déjà posé dans le GLB, au bout du canon
const GADGET_GLOW_MATERIAL = 'GN_Blue_Glow';   // partie lumineuse avant du gadget
const GADGET_SHOT_RANGE    = 30;     // m — portée du verrouillage
// Le clip Shoot_Gadget (0,867 s) contient UN tir : le canon se relève dès la 7e image.
// Un seul tir par pression, avec les dégâts de l'ancienne rafale de 3 (6 PV = 2 pressions).
const GADGET_SHOT_DAMAGE   = 3;      // points de vie du drone retirés par tir
const GADGET_SHOT_TIMES    = [0.04]; // s — le coup part dès le début du clip de tir du pistolet (voir _makeSahelShotClip)
const GADGET_SHOT_DURATION = 0.32;  // s — durée du tir agenouillé (= durée du clip)
const GADGET_SHOT_COOLDOWN = 0.12;   // s — anti-rebond : cadence ≈ 0,4 s par coup (Sahel Game : 0,25 s au pistolet)
const DRONE_N_MAX_HP       = 6;
const DRONE_N_RESPAWN_DELAY = 12;    // s — le drone revient pour s'entraîner

let _gadgetNode          = null;
let _gadgetMuzzle        = null;   // point de sortie du laser (GN_Blue_Glow)
let _gadgetShooting      = false;
let _gadgetSideShot      = false;
let _gadgetShootAction   = null;
let _gadgetShotIndex     = 0;
let _gadgetKneelShotT    = 0;      // minuteur de rafale en position agenouillée
let _gadgetCooldown      = 0;
let _gadgetTarget        = null;
let _gadgetLocked        = false;
let _gadgetAudio         = null;

let _droneNHealth        = DRONE_N_MAX_HP;
let _droneNDead          = false;
let _droneNRespawnT      = 0;
let _droneNNoRespawn     = false;   // sentinelles de la base : neutralisées jusqu'à la prochaine entrée dans le sanctuaire
let _droneNGltf          = null;    // gltf d'origine (clonage des sentinelles de la base)
let _boundCtx            = null;    // contexte de sentinelle actuellement lié aux variables globales (null = sentinelle d'origine)
let _droneLaserLock      = false;
const _droneRoster       = [];      // sentinelles supplémentaires du poste de la base : { id, d, health, dead, respawnT, fireCd, noRespawn }

const _fireworkFx        = [];
let   _fireworkTexture   = null;
let   _explosionFireTexture  = null;
let   _explosionSmokeTexture = null;
let   _explosionRingTexture  = null;
const _gadgetOrigin      = new THREE.Vector3();
const _bulletEnd         = new THREE.Vector3();   // point visé de la balle avant l'arrêt par un obstacle
const _muzzleDir         = new THREE.Vector3();   // direction réelle du canon
let   _muzzleFx          = null;                  // flamme de canon, traceur, impact (app/muzzle-flash.js)
let   _hitInd            = null;                  // arcs jaunes : d'où viennent les tirs reçus (app/hit-indicator.js, repris de Sahel Game)
let   _hitIdN            = 0;
const _hitDir            = new THREE.Vector3();
let   _playerTag         = null;                  // nom + barre de vie jaune au-dessus de la tête du joueur (app/player-tag.js)
const _tagPos            = new THREE.Vector3();
const _gadgetAim         = new THREE.Vector3();
const _gadgetDir         = new THREE.Vector3();
const _gadgetUp          = new THREE.Vector3(0, 1, 0);
const _gadgetRay         = new THREE.Raycaster();

let   _dirGLTF       = null;
const _dirNodes      = [];
const _dirMixers     = [];
let   _tombDirPlaced = false;

/* Repères de portail : cercles dorés posés au sol (même couleur que les anciennes flèches) = « place-toi ici » ; ils couvrent exactement
   la zone de déclenchement du portail (PORTAL_RADIUS). Un disque translucide, deux anneaux (fixe + pulsation) et un halo vertical léger. */
function _spawnDirAt(pos, radius = 2.5, opts = {}) {
  if (!M?.scene) return;
  const gold = 0xF9D58B;
  const mk = (geo, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); m.rotation.x = -Math.PI / 2; m.renderOrder = 5; m.raycast = () => {}; m.frustumCulled = false; return m; };
  const root = new THREE.Group(); root.name = 'RepereCercle';
  root.position.copy(pos);
  const disc = mk(new THREE.CircleGeometry(radius * 0.96, 48), 0.20); disc.position.y = 0.03;
  const ring = mk(new THREE.RingGeometry(radius * 0.88, radius, 64), 0.95); ring.position.y = 0.04;
  const pulse = mk(new THREE.RingGeometry(radius * 0.93, radius, 64), 0.8); pulse.position.y = 0.05;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.95, radius * 0.95, 3.0, 40, 1, true), new THREE.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0.10, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  col.position.y = 1.5; col.raycast = () => {}; col.renderOrder = 4; col.frustumCulled = false;
  root.add(disc, ring, pulse, col);
  root.userData.pulse = pulse; root.userData.phaseOff = Math.random() * Math.PI * 2; root.userData.snap = !!opts.snapGround;
  root.userData.parts = { disc, ring, pulse, col }; root.userData.radius = radius; root.userData.fitted = false;
  M.scene.add(root);
  _dirNodes.push(root);
}

/** Ajuste un repère de portail à son décor (une fois les collisions prêtes) : le cercle ne doit entrer ni dans un mur ni dans le sol.
 *  1. des rayons horizontaux (à 0,4 m et 1 m au-dessus du sol) mesurent la distance aux murs ; le cercle est repoussé d'au plus 1,2 m s'il en touche un,
 *     puis son rayon est réduit pour rester à 12 cm du mur le plus proche (jamais sous 0,9 m) ;
 *  2. le disque et les anneaux épousent le relief : chaque sommet est posé sur le sol réel (rayon vertical), de sorte qu'aucun morceau ne s'enfonce ni ne flotte. */
const _fitRay = new THREE.Raycaster();
function _fitDirMarker(root) {
  const cols = colliders; if (!cols || !cols.length) return false;
  const R0 = root.userData.radius, UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
  const groundAt = (x, z, y0) => { _fitRay.set(new THREE.Vector3(x, y0 + 1.2, z), DOWN); _fitRay.far = 6; const h = _fitRay.intersectObjects(cols, false); return h.length ? h[0].point.y : null; };
  const wallDist = (cx, cy, cz, maxD) => {
    let dmin = maxD; const dirs = [];
    for (let i = 0; i < 20; i++) { const a = (i / 20) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let d = maxD; for (const h of [0.4, 1.0]) { _fitRay.set(new THREE.Vector3(cx, cy + h, cz), new THREE.Vector3(dx, 0, dz)); _fitRay.far = maxD; const hit = _fitRay.intersectObjects(cols, false); if (hit.length) d = Math.min(d, hit[0].distance); }
      dirs.push([dx, dz, d]); dmin = Math.min(dmin, d); }
    return { dmin, dirs };
  };
  const gy0 = groundAt(root.position.x, root.position.z, root.position.y); if (gy0 === null) return false;      // sol pas encore chargé : on réessaie
  let cx = root.position.x, cz = root.position.z, cy = gy0;
  // 1. murs
  let w = wallDist(cx, cy, cz, R0 + 1.5), sx = 0, sz = 0;
  for (const [dx, dz, d] of w.dirs) if (d < R0 + 0.15) { const push = R0 + 0.15 - d; sx -= dx * push; sz -= dz * push; }
  const sl = Math.hypot(sx, sz) / w.dirs.length * 2; if (sl > 0.001) { const k = Math.min(1.2, sl) / (Math.hypot(sx, sz) || 1); cx += sx * k; cz += sz * k; const g2 = groundAt(cx, cz, cy); if (g2 !== null) cy = g2; w = wallDist(cx, cy, cz, R0 + 1.5); }
  const R = Math.max(0.9, Math.min(R0, w.dmin - 0.12)), k = R / R0;
  root.position.set(cx, cy, cz); root.scale.set(k, 1, k);
  // 2. relief : disque (maillé en anneaux), anneaux et pulsation épousent le sol (le maillage est tourné de −90° autour de x : z local = hauteur)
  const P = root.userData.parts;
  P.disc.geometry.dispose(); P.disc.geometry = new THREE.RingGeometry(R0 * 0.02, R0 * 0.96, 48, 6);
  for (const m of [P.disc, P.ring, P.pulse]) {
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { const gx = cx + pos.getX(i) * k, gz = cz - pos.getY(i) * k; const g = groundAt(gx, gz, cy); pos.setZ(i, (g === null ? cy : Math.max(g, cy - 0.6)) - cy); }
    pos.needsUpdate = true; m.geometry.computeBoundingSphere();
  }
  root.userData.fitted = true; root.userData.snap = false;
  return true;
}

let _dirTime = 0;

let _dirSnapT = 0;
function _tickDirAnim(dt) {
  _dirTime += dt;
  _dirSnapT -= dt;
  if (_dirSnapT <= 0) {                                   // repose les cercles « snap » sur le terrain (les tuiles du sol arrivent en cours de partie)
    _dirSnapT = 1.0;
    for (const n of _dirNodes) if (!n.userData.fitted && n.userData.parts && colliders && colliders._done) { try { _fitDirMarker(n); } catch (e) { n.userData.fitted = true; console.warn('[Repère] ajustement ignoré', e); } }
    const sol = []; M.scene.traverse((o) => { if (o.isMesh && /^Sol_/.test(o.name)) sol.push(o); });
    if (sol.length) for (const n of _dirNodes) if (n.userData.snap && !n.userData.fitted) {
      const rc = new THREE.Raycaster(new THREE.Vector3(n.position.x, 80, n.position.z), new THREE.Vector3(0, -1, 0)); rc.far = 200;
      const h = rc.intersectObjects(sol, false); if (h.length) n.position.y = h[0].point.y;
    }
  }
  for (const n of _dirNodes) {
    const k = ((_dirTime * 0.55) + n.userData.phaseOff) % 1;           // onde qui s'étend du centre vers le bord, puis recommence
    const p = n.userData.pulse;
    const ps = 0.55 + 0.45 * k; p.scale.set(ps, ps, 1); p.material.opacity = 0.85 * (1 - k);          // l onde s étend dans le plan seulement
  }
}

function _clearDirMarkers() {
  _dirNodes.forEach(n => M?.scene.remove(n));
  _dirNodes.length = 0;
  _tombDirPlaced = false;
  _dirTime = 0;
}

function _loadDirModel() {
  if (_dirNodes.length) return;
  // Deux repères seulement : sol de la cour, devant la porte qui monte sur le toit ; sol du toit, devant la porte qui redescend
  _spawnDirAt(new THREE.Vector3(17.07, 5.09, -5.3612), PORTAL_RADIUS);
  _spawnDirAt(new THREE.Vector3(13.104, 15.37, -3.5774), PORTAL_RADIUS);
  // Cercle posé à l'emplacement du cube placé dans la scène Blender « Djenné — maquette » : Blender (−203,59 ; −185,18 ; 3,68) -> repère du jeu par le recalage de la ville (échelle 1/0,84, rotation −90°, décalage de la mosquée) -> three (x, z, −y)
  _spawnDirAt(new THREE.Vector3(-175.012, 5.40, -219.890), PORTAL_RADIUS, { snapGround: true });
}

/* ---------- Son scanner ---------- */
const _scannerSound = new Audio('assets/audio/scanner_sound.mp3');
_scannerSound.preload = 'auto';
_scannerSound.volume  = 0.85;
window.GameAudio?.track(_scannerSound, 'effects');
const _playScanner = () => { _scannerSound.currentTime = 0; _scannerSound.play().catch(() => {}); };

/* ---------- Son marche ---------- */
const _walkSound = new Audio('assets/audio/walking_sound_for_inside.mp3');
_walkSound.preload = 'auto';
_walkSound.loop    = true;
_walkSound.volume  = 0.7;
window.GameAudio?.track(_walkSound, 'effects');

/* Déverrouillage iOS : play+pause synchrone sur premier geste */
document.addEventListener('audioUnlock', () => {
  [_scannerSound, _walkSound, _insideSound].forEach(a => {
    if (!a || !a.paused) return;     // déjà en lecture (pas ou ambiance démarrés avant ce geste) : on ne les coupe pas
    a.play().catch(() => {}); a.pause(); a.currentTime = 0;
  });
}, { once: true });
let _walkPlaying = false;
/* Cadence des pas : le fichier a un pas environ toutes les 0,57 s (mesuré). Les animations de déplacement tournent à LOCO_ANIM_SCALE :
   marche Sahel 1,3 s pour 2 pas -> un pas toutes les 0,46 s ; course 0,8 s -> toutes les 0,29 s. Vitesses de lecture = 0,57 / ces intervalles
   (la hauteur du son ne change pas : preservesPitch). */
const WALK_SOUND_RATE_WALK = 1.25, WALK_SOUND_RATE_RUN = 1.95;
let _walkTry = 0;
const _startWalk = () => {
  // relance si le son a été coupé de l'extérieur (déverrouillage audio, lecture refusée avant le premier geste) alors que le personnage marche
  if (_walkPlaying && !_walkSound.paused) return;
  const t = performance.now();
  if (_walkPlaying && t - _walkTry < 400) return;
  _walkPlaying = true; _walkTry = t;
  _walkSound.play().catch(() => {});
};
/** Une interface plein écran est ouverte (labo, dossier, carte, guide, dialogue de Tapama) : le personnage ne marche pas et les pas se taisent. */
const _uiBlocking = () => !!(window.__storyFreeze || (window.CityMap && window.CityMap.isOpen) || (window.Guide && window.Guide.isOpen)
  || (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) || document.querySelector('.gu-screen.on'));
setInterval(() => { if (_walkPlaying && _uiBlocking()) _stopWalk(); }, 150);       // filet de sécurité : même si la boucle du jeu est gelée, les pas s'arrêtent
const _stopWalk = () => {
  if (!_walkPlaying) return;
  _walkPlaying = false;
  _walkSound.pause();
};

/* ---------- Son intérieur mosquée ---------- */
const _insideSound = new Audio('assets/audio/inside_sound_of_mosque.mp3');
_insideSound.preload = 'auto';
// Le fichier dure ~48 s : on le laisse boucler naturellement. L'ancien
// redémarrage manuel à 30 s coupait la fin du son.
_insideSound.loop    = true;
_insideSound.volume  = 0.8;
window.GameAudio?.track(_insideSound, 'ambience');
let _insideSoundActive = false;
const _playInsideSound = () => {
  if (_insideSoundActive) return;
  _insideSoundActive = true;
  _insideSound.currentTime = 0;
  _insideSound.play().catch(() => { _insideSoundActive = false; });
};
const _stopInsideSound = () => {
  if (!_insideSoundActive) return;
  _insideSoundActive = false;
  _insideSound.pause();
  _insideSound.currentTime = 0;
};
// L'ambiance intérieure ne doit être audible que sous le toit de la mosquée.
const _syncInsideSound = (inside) => {
  if (inside) _playInsideSound();
  else _stopInsideSound();
};

/* ---------- Pont missions (retiré — mode exploration libre) ---------- */
function _missionEvent(kind, data) {
  // pas de missions en exploration libre
}

/* ---------- DOM ---------- */
const hud           = document.getElementById('sanctuaryHud');
const btnQuit       = document.getElementById('snQuit');
const compassNeedle = document.getElementById('snFan');
const btnPhoto      = document.getElementById('snPhoto');
const joystick      = document.getElementById('snStick');
const snHint        = document.getElementById('snHint');
const snReticle     = document.getElementById('snReticle');
const snTarget      = document.getElementById('snTarget');
const snTargetFill  = document.getElementById('snTargetFill');
const snTargetState = document.getElementById('snTargetState');
const snTargetDist  = document.getElementById('snTargetDist');
const btnFire       = document.getElementById('snFire');
const btnFireSide   = document.getElementById('snFireSide');
let   _hintTimer    = 0;

/* ---------- État global ---------- */
let active = false;
let M      = null;

/* ---------- Navigation ---------- */
const PLAYER_START    = new THREE.Vector3(-36.864, 6.7586, 21.005);
const PLAYER_YAW0     = Math.PI / 2;     // convention 3e personne : +X
// Point d'apparition d'une partie : sur la place du marché, en face de la façade de la mosquée (hors de l'enceinte), le regard tourné vers elle
const PLAYER_SPAWN    = new THREE.Vector3(-10.0, 4.09, 60.0);
const SPAWN_YAW       = Math.PI;         // regard vers -Z (la mosquée)
const PLAYER_EXTERIOR = new THREE.Vector3(-27.602, 6.7586, 36.228);
const EXTERIOR_YAW    = Math.PI;         // regard vers -Z
const APPROACH_DUR    = 2.5;
// Personnage plus rapide (+40 %) : marche 3,0 -> 4,2 m/s, course 5,6 -> 8,0 m/s. Les animations de déplacement sont accélérées dans la
// même proportion (LOCO_ANIM_SCALE) pour que les pieds ne glissent pas.
const WALK_SPEED      = 4.2;
const PLAYER_RUN_SPEED = 8.0;
const LOCO_ANIM_SCALE = 1.4;
const PLAYER_TURN_RATE = 11;             // vitesse d'orientation du personnage
const CAPSULE_R       = 0.38;   // rayon du personnage (passages étroits du sanctuaire)
const EYE_HEIGHT      = 1.7;
const GRAVITY         = 18;    // unités/s²
const FALL_DEATH_Y    = -15;   // respawn si tombé sous ce seuil

/* ---------- Caméra 3e personne ---------- */
const PLAYER_CAM_DIST      = 4.8;
const PLAYER_CAM_MIN       = 2.6;
const PLAYER_CAM_MAX       = 7.5;
const PLAYER_CAM_SHOOT_DIST = 2.5;   // zoom pendant le tir
const PLAYER_CAM_ZOOM_SPEED = 8;     // vitesse du zoom (exponentiel)
const PLAYER_CAM_PITCH0    = -0.16;
const PLAYER_CAM_PITCH_MIN = -1.05;
const PLAYER_CAM_PITCH_MAX = 0.32;
const PLAYER_CAM_SMOOTH    = 14;

/* ---------- Animation du personnage ---------- */
const PLAYER_ANIM_FADE         = 0.18;
const PLAYER_IDLE_LOOK_DELAY   = 7;      // bascule sur idle_look après 7 s d'immobilité
const PLAYER_SHOOT_LAYER_FADE  = 0.14;   // fondu entrée/sortie du tir en mouvement
// Os du bas du corps : tout le reste (buste, bras, mains, tête) constitue
// la couche haute utilisée pendant le tir.
// GLTFLoader nettoie les noms de nœuds avec PropertyBinding.sanitizeNodeName()
// (les ':' de 'mixamorig:Hips' disparaissent, par exemple). On normalise donc
// la liste de la même façon pour que le filtrage des pistes corresponde bien.
const PLAYER_LOWER_BONES = new Set([
  'mixamorig:Hips',
  'mixamorig:LeftUpLeg', 'mixamorig:LeftLeg',
  'mixamorig:LeftFoot', 'mixamorig:LeftToeBase', 'mixamorig:LeftToe_End',
  'mixamorig:RightUpLeg', 'mixamorig:RightLeg',
  'mixamorig:RightFoot', 'mixamorig:RightToeBase', 'mixamorig:RightToe_End',
].map((name) => THREE.PropertyBinding.sanitizeNodeName(name)));
// Jambes sans le bassin : en visée, le bassin de Shoot_Gadget (image 1) est conservé.
const PLAYER_AIM_LOWER_BONES = new Set(PLAYER_LOWER_BONES);
PLAYER_AIM_LOWER_BONES.delete(THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips'));

let _velY = 0;

/* ---------- État nouvelles animations (strafe / kneeling / dying) ---------- */
let _playerKneeling    = false;   // personnage agenouillé (bascule bouton X)
let _playerKneelingPrev = '';     // action avant le kneeling pour pouvoir revenir
let _playerDying       = false;   // personnage neutralisé par le drone N
let _playerRunning     = false;   // le personnage court (bruit perçu par la Sentinelle)
let _playerMoving      = false;   // le personnage se déplace (bruit de pas, entendu de très près)
const PLAYER_MAX_HP        = 6;     // points de vie du personnage face au drone N
const PLAYER_REGEN_DELAY   = 4.0;   // s sans être touché avant de récupérer
const PLAYER_REGEN_STEP    = 1.2;   // s par point de vie récupéré
const DRONE_N_BULLET_DAMAGE = 1;    // points de vie retirés par balle
let _playerHp          = PLAYER_MAX_HP;
let _playerSinceHit    = 0;       // s depuis le dernier impact reçu
let _playerRegenT      = 0;
let _playerDieT        = 0;       // durée de l'animation dying

/* ---------- Regard libre / orbite caméra ---------- */
const LOOK_SENSITIVITY  = 0.004;
const GP_LOOK_SPEED     = 2.4;   // regard au stick droit de la manette (rad/s)

let lookDragId      = null;
let lookDragLastX   = 0;
let lookDragLastY   = 0;
let _lookInited     = false;
let _lookDragMoved  = false;
let _lookDragButton = 0;
let _camSnap        = true;

/* ---------- Secousse caméra (explosion) ---------- */
let _camShakeTime     = 0;
let _camShakeDuration = 0;
let _camShakeAmp      = 0;

/* ---------- États ---------- */
const S_IDLE     = 0;
const S_APPROACH = 1;
const S_FPS      = 3;
const S_RETURN   = 4;   // retour cinématique du drone sur le sac
let state = S_IDLE;
let animT = 0;
const animCamStart  = new THREE.Vector3();
const animCamEnd    = new THREE.Vector3();
const animQuatStart = new THREE.Quaternion();
const animQuatEnd   = new THREE.Quaternion();

/* ---------- Joueur ---------- */
const playerPos   = new THREE.Vector3();
let   playerYaw   = PLAYER_YAW0;      // orientation du personnage
let   cameraYaw   = PLAYER_YAW0;      // orientation absolue de l'orbite caméra
let   playerPitch = PLAYER_CAM_PITCH0;// élévation caméra (négatif = au-dessus)
let   _camDist    = PLAYER_CAM_DIST;
let   _camDistView = PLAYER_CAM_DIST;   // distance lissée (zoom tir)

/* ---------- Entrées ---------- */
const joyInput = { x: 0, y: 0 };
const keys     = { w: false, a: false, s: false, d: false, shift: false };

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

/* ---------- Caméra 3e personne (temporaires) ---------- */
const _camTarget  = new THREE.Vector3();
const _camDir     = new THREE.Vector3();
const _camShoulder = new THREE.Vector3();   // point d'appui de la caméra : la tête décalée vers l'épaule (camera-rig.js)
const _camLookRig  = new THREE.Vector3();   // point regardé hors visée : devant la caméra, parallèlement à son axe
const _camRig      = new CameraRig({ exploration: { side: 0, up: 0, ahead: 0, distK: 1 }, tir: { side: 0, up: 0, ahead: 0, distK: 1 }, agenouille: { side: 0, up: 0, ahead: 0, distK: 1 } });       // réglages de placement lissés : épaule, accroupi, tir
const _rigState = () => ({ kneeling: _playerKneeling, shooting: _gadgetShooting });
const _camDesired = new THREE.Vector3();
const _camOffset  = new THREE.Vector3();
const _camMat     = new THREE.Matrix4();
const _camRay     = new THREE.Raycaster();

/* ---------- Éclairage ---------- */
let ambLight   = null;
let pointLight = null;

/* ---------- HUD ---------- */
let hudAccum        = 0;
let _controlsInited = false;
let _gpHintShown    = false;   // aide manette déjà affichée ? (une fois par session)

/* ---------- Visée précise (clic droit souris ou mode tireur d'élite : L2 maintenue, T, R3) ---------- */
let _aiming        = false;
let _sniper        = false;   // mode tireur d'élite ACTIF : visée + lunette (zoom, sensibilité réduite), repris de Sahel Game
let _sniperLatched = false;   // bascule T / R3 (reste actif jusqu'à la prochaine pression) ; L2 maintenue l'active aussi tant qu'elle est enfoncée
const _sniperPos   = new THREE.Vector3(), _sniperLook = new THREE.Vector3(), _sniperGround = new THREE.Vector3();   // caméra de lunette (épaule droite) et pieds du joueur
let _sniperBlend   = 0;       // 0 = visée normale, 1 = lunette (lissé)
let _aimMouseRight = false;   // état clic droit souris
let _aimBlend      = 0;       // 0 = caméra 3e personne, 1 = caméra aux yeux
let _headFade      = null;    // dissolution tramée de la tête (head-fade.js)
let _headFadeForce = null;    // diagnostic : fondu forcé (null = piloté par le jeu)
let _baseFov       = null;    // FOV d'origine de la caméra (capturé hors visée)
let _baseNear      = null;    // plan de coupe proche d'origine (capturé hors visée)
let _aimSavedPitch = null;    // tangage avant la visée, restitué à la sortie
let _aimLocked     = false;   // réticule posé sur le drone ennemi
const _aimPoint        = new THREE.Vector3();   // point désigné par le réticule
const _aimEye          = new THREE.Vector3();   // position cible de la caméra de visée
let _aimPoseMix = 0;                            // 0 = debout, 1 = à genoux (lissé)
let _aimAppliedTheta = 0;                       // dernier angle de tangage appliqué au buste (rad)
let _aimBoneBase = null, _aimBoneOut = null;
let _aimBones = null;                           // os Spine, Spine1, Spine2 (cache)
let _aimHeadBoneObj = null;                     // os de la tête (cache)
const _tmpHead = new THREE.Vector3();
const _aimOffset = new THREE.Vector3();
const _aimQT = new THREE.Quaternion(), _aimQP = new THREE.Quaternion(), _aimQR = new THREE.Quaternion(), _aimQPi = new THREE.Quaternion();
const _aimAxisV = new THREE.Vector3();
function _aimPose() { return Aim.aimPoseParams(_aimPoseMix); }
/* Décalage du corps par rapport à la visée : 23,4° debout (pose de l'ancien gadget), ramené à 0 en lunette : comme dans Sahel Game,
   le corps fait alors face à la caméra, ce qui garde le pistolet près de l'axe de visée. */
function _aimBodyYaw() { return _aimPose().bodyYaw * (1 - _sniperBlend); }
const _aimLook         = new THREE.Vector3();
const _aimSegEnd       = new THREE.Vector3();
const _aimDronePos     = new THREE.Vector3();
const _camLookAt       = new THREE.Vector3();
const _aimRay          = new THREE.Raycaster();
const _aimNdc          = new THREE.Vector2(0, 0);

/* ========================================================= */
/* ---- Scan — Tombeaux                                  ---- */
/* ========================================================= */
const TOMB_SCAN_DIST     = 3;    // distance de déclenchement (unités scène)
const TOMB_SCAN_DURATION = 2.5;  // secondes pour compléter le scan
const TOMB_SCAN_COOLDOWN = 12;   // secondes avant de pouvoir rescanner

/* Les analyses ne se déclenchent plus à pied : le joueur doit piloter son drone au-dessus
   de la zone. `_droneScanPos` est la position du drone pendant le pilotage (null sinon). */
const DRONE_SCAN_RANGE = 2;   // la zone de détection du drone est DRONE_SCAN_RANGE x plus large qu'à pied
let _droneScanPos = null;
const _droneScanVec = new THREE.Vector3();
let _scanHintCd = 0;
function _scanDist(point) {
  return _droneScanPos ? _droneScanPos.distanceTo(point) / DRONE_SCAN_RANGE : Infinity;
}

let tombCenter    = null;   // THREE.Vector3 centre du mesh Tombeaux
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

let _tombSearchCd = 0;

function _searchTomb(dt) {
  if (tombCenter || !M?.scene) return;      // déjà trouvé
  _tombSearchCd -= dt || 0;
  if (_tombSearchCd > 0) return;            // nouvelle tentative dans 1 s
  _tombSearchCd = 1;
  const c = new THREE.Vector3();
  let found = false;
  M.scene.traverse((o) => {
    if (found || !o.isMesh) return;
    if (/Tombeaux/i.test(o.name || '')) {
      new THREE.Box3().setFromObject(o).getCenter(c);
      found = true;
    }
  });
  if (found) {
    tombCenter = c;
    _tombDirPlaced = false; // sera placé dans tickTombScan dès que le GLB est prêt
  }
}

/* SCANNER RETIRÉ : plus de jauge, de son ni de fiche de résultat quand le drone s'approche d'une zone. Les missions qui attendaient un scan (tombeau, petit tombeau, imam, entrée)
   sont validées EN SILENCE, une seule fois, dès que le drone survole la zone (même distance de déclenchement qu'avant). */
const _silentScanDone = {};
function _tickSilentScans() {
  if (!_droneScanPos) return;
  const zones = [
    ['tomb', tombCenter, TOMB_SCAN_DIST, null],
    ['petit', PETIT_TOMB_POS, PETIT_TOMB_DIST, null],
    ['imam', IMAM_POS, IMAM_DIST, () => isInsideMosque(_droneScanPos)],      // l'imam : le drone doit être sous le toit
    ['entree', ENTREE_POS, ENTREE_DIST, null],
  ];
  for (const [kind, pt, dist, extra] of zones) {
    if (_silentScanDone[kind] || !pt || (extra && !extra())) continue;
    if (_scanDist(pt) < dist) { _silentScanDone[kind] = true; _missionEvent('scan', kind); }
  }
}
// À pied, une zone de scan ne fait rien : on rappelait au joueur d'utiliser son drone (conseil supprimé avec le scanner).
function _tickScanHint(dt) {
  return;
  _scanHintCd = Math.max(0, _scanHintCd - dt);
  if (_scanHintCd > 0 || _droneScanPos || _pilotHold) return;
  const near =
    (tombCenter && tombScanState === 'idle' && playerPos.distanceTo(tombCenter) < TOMB_SCAN_DIST * DRONE_SCAN_RANGE) ||
    (petitTombScanState === 'idle' && playerPos.distanceTo(PETIT_TOMB_POS) < PETIT_TOMB_DIST * DRONE_SCAN_RANGE) ||
    (entreeScanState === 'idle' && playerPos.distanceTo(ENTREE_POS) < ENTREE_DIST * DRONE_SCAN_RANGE) ||
    (imamScanState === 'idle' && playerPos.distanceTo(IMAM_POS) < IMAM_DIST * DRONE_SCAN_RANGE && isInsideMosque());
  if (!near) return;
  _scanHintCd = 25;
  window.GamepadKit?.toast?.('📡 Zone à scanner : décolle ton drone et survole-la');
}

function tickTombScan(dt) {
  _searchTomb(dt);
  if (!tombCenter) return;
  // (Flèche-guide au centre du tombeau retirée : doublon avec celle de _loadDirModel)
  if (petitTombScanState === 'scanning' || petitTombScanState === 'result') return;
  if (imamScanState === 'scanning' || imamScanState === 'result') return;

  const dist = _scanDist(tombCenter);

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
      _missionEvent('scan', 'tomb');
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
  const dist = _scanDist(PETIT_TOMB_POS);

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
      _missionEvent('scan', 'petit');
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

function isInsideMosque(pos = playerPos) {
  if (!colliders || !colliders.length) return false;
  _ceilRay.set(pos, _up);
  _ceilRay.far = 25;
  return _ceilRay.intersectObjects(colliders, false).length > 0;
}

function _imamBusy() {
  return tombScanState      === 'scanning' || tombScanState      === 'result' ||
         petitTombScanState === 'scanning' || petitTombScanState === 'result';
}

function tickImamScan(dt) {
  if (_imamBusy()) return;
  // Le drone doit être sous le toit de la mosquée ; sans drone, une analyse en cours est annulée.
  if (!_droneScanPos || !isInsideMosque(_droneScanPos)) {
    if (imamScanState === 'scanning') {
      imamScanState = 'idle';
      imamScanT     = 0;
      snScanHud.classList.remove('visible');
    }
    return;
  }
  const dist = _scanDist(IMAM_POS);

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
      _missionEvent('scan', 'imam');
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
  const dist = _scanDist(ENTREE_POS);

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
      _missionEvent('scan', 'entree');
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
  document.getElementById('msRoot')?.classList.add('sn-on');
  hud.setAttribute('aria-hidden', 'false');
  if (snHint) {
    snHint.classList.add('is-on');
    clearTimeout(_hintTimer);
    _hintTimer = setTimeout(() => snHint.classList.remove('is-on'), 8000);
  }
  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) hud.classList.add('sn-bar');
}

function hideHud() {
  hud.classList.remove('is-on');
  document.getElementById('msRoot')?.classList.remove('sn-on');
  hud.setAttribute('aria-hidden', 'true');
  if (snHint) {
    clearTimeout(_hintTimer);
    snHint.classList.remove('is-on');
  }
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
    lookDragId      = e.pointerId;
    lookDragLastX   = e.clientX;
    lookDragLastY   = e.clientY;
    _lookDragMoved  = false;
    _lookDragButton = e.button;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== S_FPS) return;
    if (e.pointerId !== lookDragId) return;
    const dx = e.clientX - lookDragLastX;
    const dy = e.clientY - lookDragLastY;
    if (Math.abs(dx) + Math.abs(dy) > 2) _lookDragMoved = true;
    lookDragLastX = e.clientX;
    lookDragLastY = e.clientY;
    const lookMul = Sniper.lookMultiplier(_aiming, _sniper);
    cameraYaw   -= dx * LOOK_SENSITIVITY * lookMul;
    playerPitch -= dy * LOOK_SENSITIVITY * lookMul;
    playerPitch  = _aiming ? Aim.clampAimPitch(playerPitch) : Math.max(PLAYER_CAM_PITCH_MIN, Math.min(PLAYER_CAM_PITCH_MAX, playerPitch));
  });

  canvas.addEventListener('pointerup', (e) => {
    if (e.pointerId !== lookDragId) return;
    const clickToShoot = !_lookDragMoved && e.pointerType === 'mouse' && _lookDragButton === 0;
    lookDragId = null;
    if (clickToShoot) _startGadgetShot(false);
  });
  canvas.addEventListener('pointercancel', (e) => { if (e.pointerId === lookDragId) lookDragId = null; });

  // Clic droit = viser (géré au niveau de la fenêtre) : ici on supprime
  // seulement le menu contextuel.
  canvas.addEventListener('contextmenu', (e) => {
    if (state !== S_FPS) return;
    e.preventDefault();
  });

  canvas.addEventListener('wheel', (e) => {
    if (state !== S_FPS) return;
    e.preventDefault();
    if (_aiming) return;
    _camDist =Math.max(PLAYER_CAM_MIN, Math.min(PLAYER_CAM_MAX, _camDist + e.deltaY * 0.0025));
  }, { passive: false });
}

/* ========================================================= */
/* ---- Collisions BVH                                   ---- */
/* ========================================================= */
// Cube015 = parvis surélevé autour de la mosquée, Plane012 = sol extérieur.
// Sans ces deux maillages, groundUnder() ne trouve aucun sol dès qu'on sort
// du bâtiment et le personnage tombe en chute libre.
// Minarets = les tours de la façade : le personnage, la caméra et les balles ne les traversent plus.
// Ville v2 (djenne-ville-leger.glb) : sol/relief (Sol_*) et maisons (Bat_*) ; elle remplace l'ancien sol plat Plane012.
const COLLIDER_NAMES = /Mosquee_Base|Piliers|Poteaux|Cloture|Torons|boxcollider|Tombeaux|Plateforme|Tapis|land|Minarets|^Cube015$|^Plane012$|^Sol_|^Bat_|^Neantis_|^Voiture_Collider/i;

async function buildColliders() {
  colliders = [];
  const meshes = [];
  try { await M.cityReady; } catch (_) { /* ville v2 indisponible : on reste sur l'ancien sol */ }
  const newCity = !!M.newCity;
  M.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (!COLLIDER_NAMES.test(o.name || '')) return;
    if (newCity && /^Plane012$/i.test(o.name)) return;     // sol plat masqué : on marche sur le relief de la ville v2
    meshes.push(o);
  });
  for (const o of meshes) {
    if (o.geometry && !o.geometry.boundsTree) {
      await new Promise((r) => setTimeout(r, 0));
      o.geometry.computeBoundsTree();
    }
    colliders.push(o);
  }
  colliders._done = true;                       // liste complète (BVH calculés) : les repères de portail peuvent s'ajuster au décor
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
/* ---- Personnage joueur (3e personne)                   ---- */
/* ========================================================= */
function _makeBlobShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0.0, 'rgba(0,0,0,.62)');
  grd.addColorStop(0.55, 'rgba(0,0,0,.30)');
  grd.addColorStop(1.0, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.025;
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return mesh;
}

/** Vitesse de lecture d'une action : les clips de déplacement (marche, course, recul, pas de côté, y compris leurs versions de couche) suivent LOCO_ANIM_SCALE. */
function _locoScale(action) {
  const n = String(action?.getClip?.()?.name || '').toLowerCase();
  return /^(walk|run|pistol walk backward|pistol strafe)/.test(n) ? LOCO_ANIM_SCALE : 1;
}

function _playAction(name, opts = {}) {
  if (!_playerReady || !_playerMixer) return;
  const once = !!opts.once;
  const wanted = _playerActions[name] ? name : 'idle';
  const fade = opts.fade != null ? opts.fade : PLAYER_ANIM_FADE;    // long autour de l'arrêt, court entre déplacements
  const next = _playerActions[wanted];
  if (!next) return;
  if (_playerCurrentAction === wanted && !once) return;

  const prev = _playerActions[_playerCurrentAction];
  next.reset();
  next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
  next.clampWhenFinished = once;
  next.enabled = true;
  next.setEffectiveTimeScale(_locoScale(next));
  next.setEffectiveWeight(1);
  next.play();
  if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
  _playerCurrentAction = wanted;
}

function _filterPlayerClipBones(clip, keep, suffix) {
  const tracks = clip.tracks.filter((track) => keep(track.name.split('.')[0]));
  if (!tracks.length) return null;
  return new THREE.AnimationClip(`${clip.name}${suffix}`, clip.duration, tracks);
}

/**
 * Clip de jambes de visée avec bassin « rebondissant » : jambes du clip de marche + pistes de bassin
 * (position/rotation) = pose de tir (Shoot_Gadget, image 1) + variation du cycle de marche autour de sa moyenne.
 */
function _buildAimBobClip(walkClip, sgClip, suffix) {
  const hips = THREE.PropertyBinding.sanitizeNodeName('mixamorig:Hips');
  const tracks = walkClip.tracks.filter((tr) => PLAYER_AIM_LOWER_BONES.has(tr.name.split('.')[0]));
  const wp = walkClip.tracks.find((tr) => tr.name === hips + '.position');
  const wq = walkClip.tracks.find((tr) => tr.name === hips + '.quaternion');
  const sp = sgClip.tracks.find((tr) => tr.name === hips + '.position');
  const sq = sgClip.tracks.find((tr) => tr.name === hips + '.quaternion');
  const ss = sgClip.tracks.find((tr) => tr.name === hips + '.scale');
  if (wp && sp) {
    const base = [sp.values[0], sp.values[1], sp.values[2]];
    const samples = [];
    for (let i = 0; i < wp.values.length; i += 3) samples.push([wp.values[i], wp.values[i + 1], wp.values[i + 2]]);
    tracks.push(new THREE.VectorKeyframeTrack(hips + '.position', Array.from(wp.times),
      Aim.bobPositions(base, samples, Aim.AIM_BOB_POS).flat()));
  } else if (sp) tracks.push(sp.clone());
  if (wq && sq) {
    const baseQ = [sq.values[0], sq.values[1], sq.values[2], sq.values[3]];
    const samples = [];
    for (let i = 0; i < wq.values.length; i += 4) samples.push([wq.values[i], wq.values[i + 1], wq.values[i + 2], wq.values[i + 3]]);
    tracks.push(new THREE.QuaternionKeyframeTrack(hips + '.quaternion', Array.from(wq.times),
      Aim.bobRotations(baseQ, samples, Aim.AIM_BOB_ROT).flat()));
  } else if (sq) tracks.push(sq.clone());
  if (ss) tracks.push(ss.clone());
  return new THREE.AnimationClip(walkClip.name + suffix, walkClip.duration, tracks);
}

function _filterPlayerClip(clip, lowerOnly, suffix) {
  return _filterPlayerClipBones(clip,
    (bone) => (lowerOnly ? PLAYER_LOWER_BONES.has(bone) : !PLAYER_LOWER_BONES.has(bone)), suffix);
}

/** Ensembles de couches actifs : variantes visée (bassin de Shoot_Gadget) quand la pose de visée est tenue. */
function _lowerSet() { return _aimHold ? _playerAimLowerActions : _playerLowerActions; }
function _upperSet() { return _aimHold ? _playerAimUpperActions : _playerUpperShootActions; }

function _enterShootLayer(shootName, lowerName) {
  if (!_playerMixer || !_playerReady) return false;
  const lowers = _lowerSet(), uppers = _upperSet();
  const upper = uppers[shootName];
  const lower = lowers[lowerName] || lowers.idle;
  if (!upper || !lower) return false;

  const prev = _playerActions[_playerCurrentAction];
  const actualLowerName = lowers[lowerName] ? lowerName : 'idle';
  _playerShootLayer = true;
  _playerUpperShootName = shootName;
  _playerLowerName = actualLowerName;
  _playerLayeredShootAction = upper;

  // Fait disparaître les actions plein-corps (idle, walk, run…). Les couches
  // basse et haute prennent le relais avec leurs os respectifs.
  for (const action of Object.values(_playerActions)) {
    if (action.isRunning() && action.getEffectiveWeight() > 0.001) {
      action.fadeOut(PLAYER_SHOOT_LAYER_FADE);
    }
  }

  lower.reset();
  lower.setLoop(THREE.LoopRepeat, Infinity);
  lower.clampWhenFinished = false;
  lower.enabled = true;
  lower.setEffectiveTimeScale(_locoScale(lower));
  lower.setEffectiveWeight(1);
  // Conserve la phase de marche/course pour éviter un saut de pas.
  if (prev && actualLowerName === _playerCurrentAction) {
    const dur = lower.getClip()?.duration || 0;
    if (dur > 0) lower.time = prev.time % dur;
  }
  lower.play();
  // Agenouillé : on fige le bas du corps pour que la posture ne bouge pas
  // pendant que le buste joue l'animation de tir.
  if (actualLowerName === 'pistol kneeling idle') lower.paused = true;
  // Visée à l'arrêt : jambes figées sur la pose de Shoot_Gadget (temps 0).
  if (actualLowerName === 'idle' && _aimHold) { lower.time = 0; lower.paused = true; }

  upper.reset();
  upper.setLoop(THREE.LoopOnce, 1);
  upper.clampWhenFinished = true;
  upper.enabled = true;
  upper.setEffectiveTimeScale(1);
  upper.setEffectiveWeight(1);
  upper.play();

  _gadgetShootAction = upper;
  _playerCurrentAction = shootName;
  return true;
}

function _updateShootLayer(dt, moving, running) {
  if (!_playerShootLayer) return;
  if (moving) _playerIdleTime = 0;
  else _playerIdleTime += dt;

  // Détermine l'animation du bas du corps selon la direction de déplacement
  // pendant le tir (strafe gauche/droite/arrière ou marche/arrêt normal).
  // (agenouillé : jambes figées sur la pose ; sinon pas de côté, marche arrière, marche ou course : voir anim-state.js)
  const wantLower = AnimState.pickLowerClip({ kneeling: _playerKneeling, moving, move: _move, bodyYaw: playerYaw, running });
  if (wantLower === _playerLowerName) {
    // La couche agenouillée doit rester figée même après un changement d'état.
    const cur = _lowerSet()[wantLower];
    if (cur && wantLower === 'pistol kneeling idle') cur.paused = true;
    if (cur && wantLower === 'idle' && _aimHold) { cur.time = 0; cur.paused = true; }
    return;
  }

  const lowers = _lowerSet();
  const prev = lowers[_playerLowerName];
  const next = lowers[wantLower] || lowers.idle;
  if (!next) return;

  const prevName = _playerLowerName;
  const prevDur = prev?.getClip()?.duration || 0;
  const nextDur = next.getClip()?.duration || 0;
  next.reset();
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = false;
  next.enabled = true;
  next.setEffectiveTimeScale(_locoScale(next));
  next.setEffectiveWeight(1);
  // Synchronise la phase entre walk et run ; idle->walk part du début.
  if (prev && prevDur > 0 && nextDur > 0 &&
      (prevName === 'walk' || prevName === 'run') &&
      (wantLower === 'walk' || wantLower === 'run')) {
    next.time = ((prev.time % prevDur) / prevDur) * nextDur;
  }
  next.play();
  if (prev && prev !== next) next.crossFadeFrom(prev, 0.18, false);
  // Agenouillé : la couche basse reste immobile pendant le tir.
  if (wantLower === 'pistol kneeling idle') next.paused = true;
  // Visée à l'arrêt : jambes figées sur la pose de Shoot_Gadget (temps 0).
  if (wantLower === 'idle' && _aimHold) { next.time = 0; next.paused = true; }
  _playerLowerName = wantLower;
}

function _exitShootLayer(moving, running) {
  const lowers = _lowerSet(), uppers = _upperSet();
  _aimHold = false;
  if (!_playerShootLayer) return;
  _playerShootLayer = false;

  const upper = uppers[_playerUpperShootName];
  const lower = lowers[_playerLowerName];
  const lowerDur = lower?.getClip()?.duration || 0;
  const lowerPhase = lower && lowerDur > 0 ? (lower.time % lowerDur) / lowerDur : 0;
  upper?.fadeOut(PLAYER_SHOOT_LAYER_FADE);
  lower?.fadeOut(PLAYER_SHOOT_LAYER_FADE);
  _playerUpperShootName = '';
  _playerLowerName = '';
  _playerLayeredShootAction = null;

  const want = (_playerKneeling && !moving)
    ? 'pistol kneeling idle'
    : (moving ? (running ? 'run' : 'walk') : 'idle');
  const next = _playerActions[want] || _playerActions.idle;
  if (!next) {
    _playerCurrentAction = '';
    return;
  }
  next.reset();
  next.setLoop(THREE.LoopRepeat, Infinity);
  next.clampWhenFinished = false;
  next.enabled = true;
  next.setEffectiveTimeScale(_locoScale(next));
  next.setEffectiveWeight(1);
  if ((want === 'walk' || want === 'run') && lowerPhase > 0) {
    const dur = next.getClip()?.duration || 0;
    if (dur > 0) next.time = lowerPhase * dur;
  }
  // Reprend la posture agenouillée exactement là où elle a été figée.
  if (want === 'pistol kneeling idle' && lower) {
    const dur = next.getClip()?.duration || 0;
    if (dur > 0) next.time = lower.time % dur;
  }
  next.play();
  next.fadeIn(PLAYER_SHOOT_LAYER_FADE);
  _playerCurrentAction = _playerActions[want] ? want : 'idle';
}

function _cancelShootLayer() {
  const lowers = _lowerSet(), uppers = _upperSet();
  _aimHold = false;
  if (!_playerShootLayer) return;
  _playerShootLayer = false;
  uppers[_playerUpperShootName]?.stop();
  lowers[_playerLowerName]?.stop();
  _playerUpperShootName = '';
  _playerLowerName = '';
  _playerLayeredShootAction = null;
  // Plus aucune action plein-corps n'est active : le prochain _playAction
  // doit démarrer proprement, sans crossfade depuis une action arrêtée.
  _playerCurrentAction = '';
}

/* ---------- Pose de visée tenue : haut du corps figé sur Shoot_Gadget (t=0), jambes libres ---------- */
function _enterAimHold(moving) {
  if (!_playerMixer || !_playerReady || _playerShootLayer) return;
  _aimHold = true;   // avant _enterShootLayer : les helpers renvoient les variantes visée
  if (!_enterShootLayer('shoot_gadget', moving ? 'walk' : 'idle')) { _aimHold = false; return; }
  const up = _upperSet().shoot_gadget;
  up.time = 0;
  up.paused = true;
  up.fadeIn(PLAYER_SHOOT_LAYER_FADE * 2);
}

function _holdAimPose() {
  const up = _upperSet().shoot_gadget;
  if (!up) return;
  up.reset();
  up.setLoop(THREE.LoopOnce, 1);
  up.clampWhenFinished = true;
  up.enabled = true;
  up.setEffectiveTimeScale(1);
  up.setEffectiveWeight(1);
  up.play();
  up.time = 0;
  up.paused = true;
}

/* Au volant (montée, conduite, descente) : le personnage ne peut rien faire d'autre — ni sauter, ni s'agenouiller, ni viser, ni tirer */
function _inVehicle() { return !!(_vehicleCtl && _vehicleCtl.active()); }

/* ---------- Eau : pataugeage et nage (app/water-fx.js : surface + effets ; app/water-logic.js : seuils) ---------- */
// Clips de nage cherchés dans le GLB (noms en minuscules). Aucun ? repli : idle + corps penché + bras simulés.
const SWIM_MOVE_NAMES = ['swim', 'swimming', 'nage', 'swim_forward', 'freestyle'];
const SWIM_IDLE_NAMES = ['swim_idle', 'swim idle', 'treading water', 'treading_water', 'tread', 'tread_water', 'nage_idle'];
const SWIM_TILT = THREE.MathUtils.degToRad(55);       // inclinaison du corps vers l'avant en nage sans clip dédié
const SWIM_PIVOT = 0.95;                              // hauteur du bassin (m) : le corps pivote autour
let _swimming = false, _waterState = 'dry', _waterSurf = null, _waterGroundY = -Infinity;
let _swimT = 0, _swimTilt = 0, _swimDeep = false, _swimProne = false, _swimDepth = Infinity, _swimArmPh = 0, _swimToastDone = false, _wakeT = 0, _footT = 0, _swimBaseY = null;
let _swimMoveName = '', _swimIdleName = '';
const _swimArmBones = [];

function _findSwimClips() {
  let idle = SWIM_IDLE_NAMES.find((n) => _playerActions[n]) || '';
  let move = SWIM_MOVE_NAMES.find((n) => _playerActions[n]) || '';
  if (!idle || !move) for (const k of Object.keys(_playerActions)) {
    if (!/swim|tread|nage/.test(k)) continue;
    if (/idle|tread/.test(k)) idle = idle || k; else move = move || k;
  }
  if (window.__noSwimClips) { idle = ''; move = ''; }                 // diagnostic : force le repli sans clip
  _swimIdleName = idle; _swimMoveName = move;
}
/** Remet le personnage à zéro (clips, couches, inclinaison) à l'entrée / la sortie de la nage. */
function _swimResetBody() {
  if (_playerShootLayer) _cancelShootLayer();
  _playerJumping = false; _playerKneeling = false; _playerKneelingPrev = ''; _gadgetShooting = false;
  if (_playerMixer) { _playerMixer.stopAllAction(); }
  _playerCurrentAction = ''; _playerLowerName = ''; _playerUpperShootName = ''; _playerShootLayer = false; _playerLayeredShootAction = null; _aimHold = false;
  if (_playerModel) {
    if (_swimBaseY === null) _swimBaseY = _playerModel.position.y;
    _playerModel.rotation.x = 0; _playerModel.position.y = _swimBaseY; _playerModel.position.z = 0;
  }
  _swimTilt = 0;
}
function _setSwimming(on) {
  if (on === _swimming) return;
  _swimming = on;
  _swimResetBody();
  if (_playerShadow) _playerShadow.visible = !on;
  if (on) {
    _findSwimClips(); _swimT = 0; _wakeT = 0; _swimDeep = false;
    if (_aiming) _setAiming(false);
    if (!_swimToastDone) { _swimToastDone = true; window.GamepadKit?.toast?.('Tu nages'); }
  } else if (_playerReady) _playAction('idle', { fade: 0.2 });
  try { window.dispatchEvent(new CustomEvent('player:swim', { detail: { on } })); } catch (_) {}
}
/** Remet l'état d'eau à sec (sortie du mode, montée en voiture). */
function _forceDry() {
  _waterState = 'dry'; _waterSurf = null;
  if (_swimming) _setSwimming(false);
}
let _waterWalked = 0, _wwLast = null;      // mètres parcourus dans l'eau depuis l'entrée (0 à sec)
/** État du joueur dans l'eau (une fois par image, avant le déplacement) : pataugeage, nage, éclaboussures, sillage. */
function _tickWater(dt, moving, running) {
  const FX = window.WaterFx;
  const prev = _waterState, prevSurf = _waterSurf;
  let st = 'dry', surf = null;
  if (FX && !_inVehicle() && !_playerDying) {
    surf = FX.surfaceAt(playerPos.x, playerPos.z);
    if (surf !== null) {
      const feet = playerPos.y - EYE_HEIGHT;
      const dep = WL.depth(surf, _waterGroundY);
      st = (prev === 'dry' && feet > surf + 0.4) ? 'dry' : WL.waterState(prev, dep);   // en l'air bien au-dessus de l'eau : pas d'eau
      if (st !== 'dry') { if (_wwLast) _waterWalked += Math.hypot(playerPos.x - _wwLast.x, playerPos.z - _wwLast.z); _wwLast = _wwLast || new THREE.Vector3(); _wwLast.copy(playerPos); }
      else { _waterWalked = 0; _wwLast = null; }
      if (st === 'swim' && !WL.swimAllowed(dep, _waterWalked)) st = 'wade';   // à l'entrée dans l'eau : on patauge d'abord (2 m de marche), puis on nage
      if (st === 'dry') surf = null;
    }
  }
  _waterState = st; _waterSurf = surf;
  if (st !== 'dry') window.WetLook?.soak();                 // dans l'eau : mouillé à fond ; en sortant il sèche en quelques secondes (wet-look.js)
  if (st === 'swim') {
    _swimDepth = WL.depth(surf, _waterGroundY);
    _swimDeep = WL.deepPose(_swimDeep, _swimDepth);
    _swimProne = !!_swimMoveName && WL.swimPose(moving, _swimDeep) === 'prone';
  }
  const nowSwim = st === 'swim';
  if (nowSwim !== _swimming) _setSwimming(nowSwim);
  if (!FX) return;
  const x = playerPos.x, z = playerPos.z;
  if (st !== 'dry' && prev === 'dry') FX.splash(x, surf, z, (nowSwim ? 1.0 : 0.7) + Math.min(0.5, Math.max(0, -_velY) / 18));      // entrée dans l'eau
  else if (st === 'swim' && prev === 'wade') FX.splash(x, surf, z, 0.5);
  else if (st === 'dry' && prev !== 'dry' && prevSurf !== null) FX.splash(x, prevSurf, z, 0.45);                                  // sortie
  if (st === 'wade' && moving) {
    _footT -= dt;
    if (_footT <= 0) { _footT = running ? 0.2 : 0.3; FX.footSplash(x, surf, z); }
  } else if (st === 'swim') {
    FX.swimFx?.(dt, { x, z, yaw: playerYaw, surface: surf, moving, fast: running });
    _wakeT -= dt;
    if (_wakeT <= 0) { _wakeT = moving ? 0.35 : 0.9; FX.wake(x, surf, z, moving ? 1 : 0.4); }
  }
}
/** Bras simulés (crawl) : les épaules tournent autour de l'axe latéral du personnage, en opposition. */
function _applySwimArms(phase) {
  if (!_playerModel) return;
  if (!_swimArmBones.length) {
    for (const n of ['mixamorigLeftArm', 'mixamorigRightArm']) { const b = _playerModel.getObjectByName(n); if (b) _swimArmBones.push(b); }
    if (!_swimArmBones.length) return;
  }
  const lx = Math.cos(playerYaw), lz = -Math.sin(playerYaw);
  for (let i = 0; i < _swimArmBones.length; i++) {
    const bone = _swimArmBones[i];
    const ang = -Math.PI * 0.62 + Math.sin(phase + i * Math.PI) * 0.95;                     // bras tendus vers l'avant, en va-et-vient
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_aimQP); _aimQPi.copy(_aimQP).invert();
    _aimQR.setFromAxisAngle(_aimAxisV.set(lx, 0, lz), ang * _swimTilt / SWIM_TILT);
    _aimQT.copy(_aimQPi).multiply(_aimQR).multiply(_aimQP);
    bone.quaternion.premultiply(_aimQT);
  }
}
function _updateSwimAnimation(dt, moving, running) {
  if (_playerShootLayer) _cancelShootLayer();
  let want = 'idle', clip = false;
  const upright = WL.swimPose(moving, _swimDeep) === 'upright';     // vertical seulement à l'arrêt en eau profonde
  if (!upright && _swimMoveName) { want = _swimMoveName; clip = true; }
  else if (_swimIdleName || _swimMoveName) { want = (upright && _swimIdleName) || _swimMoveName || _swimIdleName; clip = true; }
  _playAction(want, { fade: 0.25 });
  if (_playerCurrentAction === want && _playerActions[want]) _playerActions[want].setEffectiveTimeScale(!clip && moving ? 0.8 : 1);
  _mixerUpdate(dt);
  // repli sans clip de nage : corps penché vers l'avant (autour du bassin), bras qui brassent, flottement déjà donné par la hauteur
  const fallback = !clip && moving, k = 1 - Math.exp(-6 * dt);
  _swimTilt += ((fallback ? SWIM_TILT : 0) - _swimTilt) * k;
  if (_playerModel) {
    const c = Math.cos(_swimTilt), sn = Math.sin(_swimTilt);
    _playerModel.rotation.x = _swimTilt;
    _playerModel.position.y = (_swimBaseY ?? 0) + SWIM_PIVOT * (1 - c);
    _playerModel.position.z = -SWIM_PIVOT * sn;
  }
  if (fallback || _swimTilt > 0.05) { _swimArmPh += dt * (running ? 7 : 5); _applySwimArms(_swimArmPh); }
}

function _tryJump() {
  if (_inVehicle() || _swimming) return;
  if (!_playerReady || _playerJumping || _gadgetShooting) return;
  if (!_playerActions.jump) return;
  if (_playerKneeling) _standUpFromKneel();          // sauter depuis la position agenouillée : le joueur se relève d'abord
  _playerJumping = true;
  _playerIdleTime = 0;
  if (_playerShootLayer) _cancelShootLayer();
  _playAction('jump', { once: true, fade: 0.08 });
  window.GamepadKit?.rumble?.(90, 0.4);
}

/** Se relever sans geste de bascule : appelé quand le joueur marche, court ou saute (une autre animation prend le relais). */
function _standUpFromKneel() {
  if (!_playerKneeling) return;
  _playerKneeling = false;
  _playerKneelingPrev = '';
  if (_playerShootLayer && _aimHold) _cancelShootLayer();
}

/* ---------- Bascule genoux à terre (bouton X / touche K) ---------- */
function _toggleKneeling() {
  if (_inVehicle() || _swimming) return;
  if (!_playerReady || _gadgetShooting || _playerJumping || _playerDying) return;
  if (_playerShootLayer && _aimHold) _cancelShootLayer();
  if (!_playerKneeling) {
    // Entre en position agenouillée.
    if (_playerActions['pistol kneeling idle']) {
      _playerKneelingPrev = _playerCurrentAction || 'idle';
      _playerKneeling = true;
      _playAction('pistol kneeling idle', { once: false, fade: 0.2 });
      window.GamepadKit?.rumble?.(60, 0.2);
    }
  } else {
    // Reviens à l'état d'avant.
    _playerKneeling = false;
    const prev = _playerKneelingPrev || 'idle';
    _playerKneelingPrev = '';
    _playAction(prev, { fade: 0.2 });
    window.GamepadKit?.rumble?.(60, 0.2);
  }
}

function _syncPlayerRoot() {
  if (!_playerRoot) return;
  _playerRoot.position.set(playerPos.x, playerPos.y - EYE_HEIGHT, playerPos.z);
  _playerRoot.rotation.y = playerYaw;
}

/** Axe monde horizontal autour duquel un angle POSITIF relève le canon (regarder vers le haut). */
function _aimPitchAxis(out) {
  return out.set(-Math.cos(cameraYaw), 0, Math.sin(cameraYaw));
}
function _aimPitchQuat(theta, out = new THREE.Quaternion()) {
  return out.setFromAxisAngle(_aimPitchAxis(_aimAxisV), theta);
}
function _aimHeadBone() {
  if (!_aimHeadBoneObj && _playerModel) _aimHeadBoneObj = _playerModel.getObjectByName('mixamorigHead') || null;
  return _aimHeadBoneObj;
}

/** Penche le haut du corps (Spine..Spine2) : le canon suit le tangage visé, tout ce qui est au-dessus bouge d'un bloc. */
function _applyAimPitch() {
  _aimAppliedTheta = 0;
  if (!_playerModel) return;
  if (!_aimBones) {
    const b = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'].map((n) => _playerModel.getObjectByName(n));
    if (b.some((x) => !x)) return;
    _aimBones = b;
    _aimBoneBase = b.map(() => new THREE.Quaternion());
    _aimBoneOut = b.map(() => null);
  }
  // Un clip fige/en pause ne reecrit pas les os : si la rotation de l'image precedente est encore la, on la retire d'abord (pas de cumul).
  for (let i = 0; i < _aimBones.length; i++) {
    if (_aimBoneOut[i] && _aimBones[i].quaternion.equals(_aimBoneOut[i])) _aimBones[i].quaternion.copy(_aimBoneBase[i]);
    _aimBoneOut[i] = null;
  }
  const theta = (_aiming || _aimBlend > 0) ? (playerPitch - _aimPose().pitch0) * _aimBlend : 0;
  if (Math.abs(theta) < 1e-5) { _aimBones[0].updateWorldMatrix(true, true); _applyAimIK(); return; }
  _aimAppliedTheta = theta;
  for (let i = 0; i < _aimBones.length; i++) {
    const bone = _aimBones[i];
    _aimBoneBase[i].copy(bone.quaternion);
    bone.parent.updateWorldMatrix(true, false);
    bone.parent.getWorldQuaternion(_aimQP);
    _aimQPi.copy(_aimQP).invert();
    _aimPitchQuat(theta * Aim.AIM_SPINE_WEIGHTS[i], _aimQR);
    _aimQT.copy(_aimQPi).multiply(_aimQR).multiply(_aimQP);
    bone.quaternion.premultiply(_aimQT);
    _aimBoneOut[i] = (_aimBoneOut[i] || new THREE.Quaternion()).copy(bone.quaternion);
    bone.updateWorldMatrix(false, true);
  }
  _applyAimIK();
}

/* Point que le canon doit viser : le réticule (centre de l'écran) une fois la caméra de visée en place, sinon 30 m devant la caméra. */
const _ikTarget = new THREE.Vector3(), _ikPivot = new THREE.Vector3(), _ikMuzzle = new THREE.Vector3(), _ikDir = new THREE.Vector3();
const _ikWq = new THREE.Quaternion(), _ikPq = new THREE.Quaternion();
function _aimIKTarget(out) {
  if (_aimBlend >= 0.5) return out.copy(_aimPoint);
  _aimRay.setFromCamera(_aimNdc, M.camera);
  return out.copy(_aimRay.ray.origin).addScaledVector(_aimRay.ray.direction, 30);
}

/**
 * Comme dans Sahel Game : après l'animation, la colonne (Spine1) pivote de quelques degrés pour que le canon
 * (Muzzle_Pistol) pointe exactement le réticule. Poids = fondu de la visée, angle limité à 60°.
 * Les rotations de la colonne sont mémorisées comme celles du tangage (_aimBoneBase / _aimBoneOut) pour ne jamais se cumuler.
 */
function _applyAimIK() {
  if (!_aimBones || !_gadgetMuzzle || !M?.camera || !(_aiming || _aimBlend > 0.01)) return;
  const sp = _aimBones[1];
  if (_aimAppliedTheta === 0) _aimBoneBase[1].copy(sp.quaternion);        // pas de tangage appliqué : la base est la pose de l'animation
  _aimBones[0].updateWorldMatrix(true, true);
  _gadgetMuzzle.getWorldPosition(_ikMuzzle);
  _muzzleDirection(_ikDir);
  sp.getWorldPosition(_ikPivot);
  _aimIKTarget(_ikTarget);
  let R = AimSolve.solveAim(_ikPivot, _ikMuzzle, _ikDir, _ikTarget, 5);
  R = AimSolve.limitRotation(R, THREE.MathUtils.degToRad(AimSolve.AIM_SOLVE_MAX_DEG));
  R = AimSolve.blendRotation(R, Math.min(1, _aimBlend));
  sp.getWorldQuaternion(_ikWq);
  sp.parent.getWorldQuaternion(_ikPq);
  sp.quaternion.copy(_ikPq.invert().multiply(R.multiply(_ikWq)));
  _aimBoneOut[1] = (_aimBoneOut[1] || new THREE.Quaternion()).copy(sp.quaternion);
  sp.updateWorldMatrix(false, true);
}

/** Diagnostic : écart (°) entre la direction du canon et la ligne bouche -> réticule. */
function _aimErrorDeg() {
  if (!_gadgetMuzzle || !M?.camera) return null;
  _gadgetMuzzle.updateWorldMatrix(true, false);
  _gadgetMuzzle.getWorldPosition(_ikMuzzle);
  _muzzleDirection(_ikDir);
  _aimIKTarget(_ikTarget);
  return THREE.MathUtils.radToDeg(_ikDir.angleTo(_ikTarget.sub(_ikMuzzle).normalize()));
}
function _mixerUpdate(dt) { _playerMixer.update(dt); _applyAimPitch(); }

function _updatePlayerAnimation(dt, moving, running) {
  if (!_playerReady || !_playerMixer) return;
  // Joueur neutralisé : priorité absolue à l'animation Dying.
  if (_playerDying) {
    if (_playerCurrentAction !== 'dying') {
      if (_playerShootLayer) _cancelShootLayer();
      _playAction('dying', { once: true, fade: 0.1 });
    }
    _mixerUpdate(dt);
    return;
  }
  if (_swimming) { _updateSwimAnimation(dt, moving, running); return; }
  if (_playerKneeling && _playerShootLayer && _aimHold) _cancelShootLayer();
  // Tir agenouillé : le clip complet reste actif, seule la rafale est temporisée.
  if (_playerKneeling && _gadgetShooting) {
    _playAction('pistol kneeling idle');
    _mixerUpdate(dt);
    _updateKneelingShot(dt);
    return;
  }
  // Position agenouillée maintenue tant qu'on ne bouge pas.
  if (_playerKneeling && !moving && !_playerJumping && !_gadgetShooting) {
    _playAction('pistol kneeling idle');
    _mixerUpdate(dt);
    return;
  }
  // Pose de visée tenue : couche haute figée + jambes selon le mouvement.
  const wantHold = _aiming && !_playerKneeling && !_playerJumping && !_playerDying;
  if (wantHold && !_playerShootLayer) _enterAimHold(moving);
  else if (!wantHold && _aimHold && !_gadgetShooting) _exitShootLayer(moving, running);
  if (!_playerJumping && !_gadgetShooting && !_playerShootLayer) {
    if (moving) _playerIdleTime = 0;
    else _playerIdleTime += dt;
    _playAction(AnimState.pickBaseClip({ moving, running, idleTime: _playerIdleTime, idleLookDelay: PLAYER_IDLE_LOOK_DELAY }));
  } else if (_playerShootLayer) {
    _updateShootLayer(dt, moving, running);
  }
  _mixerUpdate(dt);
  if (_gadgetShooting) _updateGadgetShot(moving, running);
}


/* ---- Personnage Sahel (clips Mixamo) : noms que le jeu attend ----
   Le jeu cherche des clips nommés d'après l'ancien personnage. Les clips qui existent déjà sous le même
   nom (idle, walk, run, jump, pistol strafe right, pistol walk backward) n'ont besoin de rien ; absents :
   idle_look et control_idle retombent sur « idle » (voir _playAction), shoot_gadget_side sur shoot_gadget. */
const SAHEL_CLIP_ALIASES = {
  'dying': 'death',
  'pistol kneeling idle': 'pistol kneel',
  'pistol strafe left': 'pistol strafe',
};
const SAHEL_SHOT_DURATION = 0.32;                       // coup sec de pistolet (l'ancien Shoot_Gadget durait 0,87 s)
const SAHEL_SHOT_KEYS     = [0, 0.04, 0.10, SAHEL_SHOT_DURATION]; // pose, coup à 0,04 s (GADGET_SHOT_TIMES), pic du recul, retour
// Recul du pistolet : rotation locale ajoutée à la pose de visée au moment du tir [axe, degrés]
const SAHEL_RECOIL = {
  mixamorigRightHand:    { axis: [1, 0, 0], deg: -10 },
  mixamorigRightForeArm: { axis: [1, 0, 0], deg: -4 },
  mixamorigSpine2:       { axis: [1, 0, 0], deg: -2 },
};

/** Tir ponctuel : pose de visée tenue (Pistol Idle Tir, image 1) + petit recul. Toutes les pistes (bassin compris) sont présentes. */
function _makeSahelShotClip(src) {
  const tracks = [];
  const q = new THREE.Quaternion(), qk = new THREE.Quaternion(), kick = new THREE.Quaternion();
  for (const tr of src.tracks) {
    const n = tr.getValueSize();
    const v0 = Array.from(tr.values.slice(0, n));
    const rec = SAHEL_RECOIL[tr.name.split('.')[0]];
    if (tr.name.endsWith('.quaternion')) {
      q.fromArray(v0);
      qk.copy(q);
      if (rec) qk.multiply(kick.setFromAxisAngle(new THREE.Vector3(...rec.axis), THREE.MathUtils.degToRad(rec.deg)));
      tracks.push(new THREE.QuaternionKeyframeTrack(tr.name, SAHEL_SHOT_KEYS, [...v0, ...v0, ...qk.toArray(), ...v0]));
    } else {
      tracks.push(new THREE.VectorKeyframeTrack(tr.name, SAHEL_SHOT_KEYS, [...v0, ...v0, ...v0, ...v0]));
    }
  }
  return new THREE.AnimationClip('shoot_gadget', SAHEL_SHOT_DURATION, tracks);
}

/* Animations de repos : le bruit de capture de mouvement (quelques dixièmes de degré d'une image clé à l'autre) fait trembler le
   personnage quand il est immobile. On le retire par un lissage gaussien en boucle (app/clip-smooth.js) ; la respiration et les
   appuis lents (< 1 Hz) sont conservés. */
// damp : part de l'oscillation lente conservée. Le repos debout balance le bassin (±5°) alors que les pieds restent « collés » : sans cinématique
// inverse ils glissent de ±8 cm comme un pendule, ce qui donne un personnage instable. On garde 35 % du balancement (respiration, appui).
const SAHEL_SMOOTH_CLIPS = { 'idle': 0.35, 'pistol kneel': 1 };     // debout, et agenouillé (alias « pistol kneeling idle »)
function _smoothClip(clip, damp = 1) {
  const tracks = clip.tracks.map((t) => {
    const isQuat = t instanceof THREE.QuaternionKeyframeTrack;
    if (!isQuat && !/\.position$/.test(t.name)) return t.clone();                      // échelle, etc. : inchangé
    const size = t.getValueSize();
    const smooth = smoothValues(t.values, size, { radius: 6, sigma: 2.5, loop: true, quaternion: isQuat });
    return new t.constructor(t.name, t.times, dampValues(smooth, size, damp, isQuat));
  });
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

function _installSahelClips(clips) {
  for (const [key, damp] of Object.entries(SAHEL_SMOOTH_CLIPS)) {
    const a = _playerActions[key];
    if (a) _playerActions[key] = _playerMixer.clipAction(_smoothClip(a.getClip(), damp));
  }
  for (const [alias, real] of Object.entries(SAHEL_CLIP_ALIASES)) {
    if (!_playerActions[alias] && _playerActions[real]) _playerActions[alias] = _playerActions[real];
  }
  const aim = _playerActions['pistol idle tir']?.getClip();
  if (!_playerActions.shoot_gadget && aim) _playerActions.shoot_gadget = _playerMixer.clipAction(_makeSahelShotClip(aim));
}

function _loadPlayerModel() {
  if (_playerModel || _playerLoading || !M) return;
  _playerLoading = true;

  _loadedHeroUrl = heroUrl();
  loadModel(_gltfPlayer, _loadedHeroUrl, (gltf) => {
    _playerLoading = false;
    if (!M) return;

    const model = gltf.scene;
    model.updateMatrixWorld(true);

    // Normalise la taille (1,78 m) et pose les pieds sur l'origine du groupe.
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    if (size.y > 0.01) model.scale.multiplyScalar(1.78 / size.y);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    model.position.y -= box.min.y;

    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });

    _playerRoot = new THREE.Group();
    _playerRoot.name = 'SanctuaryPlayer';
    _playerRoot.add(model);

    _playerShadow = _makeBlobShadow();
    if (window.ShadowFollow && window.ShadowFollow.realShadows) _playerShadow.material.opacity = 0.2;      // vraies ombres actives : le disque ne garde qu'un léger contact au pied
    _playerRoot.add(_playerShadow);

    _playerModel = model;
    _headFade = installHeadFade(model);
    _gadgetNode = model.getObjectByName(GADGET_GLB_NODE)
               || model.getObjectByName(GADGET_GLB_NODE + '_Mesh')
               || model.getObjectByName('Gadget_Nexus_Mesh');
    _gadgetMuzzle = _findGadgetMuzzle(model);
    if (!_gadgetMuzzle) {
      console.warn('[Sanctuaire] GN_Blue_Glow introuvable : origine de tir approximative.');
    }
    if (!_gadgetNode) {
      console.warn('[Sanctuaire] Gadget_Nexus introuvable dans le GLB du personnage.');
    }
    _playerRoot.visible = false;
    M.scene.add(_playerRoot);

    _playerMixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => {
      const key = String(clip.name || '').trim().toLowerCase();
      if (key) _playerActions[key] = _playerMixer.clipAction(clip);
    });
    _installSahelClips(gltf.animations);

    // Couches basse (jambes) et haute (buste/bras) pour tirer en marchant.
    for (const key of ['idle', 'walk', 'run']) {
      const clip = _playerActions[key]?.getClip();
      const filtered = clip ? _filterPlayerClip(clip, true, '__lower') : null;
      if (filtered) {
        const action = _playerMixer.clipAction(filtered);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        _playerLowerActions[key] = action;
      }
    }
    for (const key of ['shoot_gadget', 'shoot_gadget_side']) {
      const clip = _playerActions[key]?.getClip();
      const filtered = clip ? _filterPlayerClip(clip, false, '__upper') : null;
      if (filtered) {
        const action = _playerMixer.clipAction(filtered);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.enabled = true;
        _playerUpperShootActions[key] = action;
      }
    }

    // Couches basse pour les nouvelles animations de tir en mouvement
    for (const key of ['pistol strafe left', 'pistol strafe right', 'pistol walk backward', 'pistol kneeling idle']) {
      const clip = _playerActions[key]?.getClip();
      const filtered = clip ? _filterPlayerClip(clip, true, '__lower') : null;
      if (filtered) {
        const action = _playerMixer.clipAction(filtered);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
        action.enabled = true;
        _playerLowerActions[key] = action;
      }
    }
    // Variantes visée : le bassin vient de Shoot_Gadget (image 1), les jambes sont sans bassin.
    {
      const sg = _playerActions.shoot_gadget?.getClip();
      const upClip = sg ? _filterPlayerClipBones(sg, (b) => !PLAYER_LOWER_BONES.has(b), '__aimupper') : null;
      if (upClip) {
        const action = _playerMixer.clipAction(upClip);
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        action.enabled = true;
        _playerAimUpperActions.shoot_gadget = action;
      }
      const keepLegs = (b) => PLAYER_AIM_LOWER_BONES.has(b);
      for (const [key, src] of [['idle', 'shoot_gadget'], ['walk', 'walk'], ['run', 'run'],
          ['pistol strafe left', 'pistol strafe left'], ['pistol strafe right', 'pistol strafe right'],
          ['pistol walk backward', 'pistol walk backward']]) {
        const clip = _playerActions[src]?.getClip();
        const filtered = !clip ? null
          : (key === 'idle' ? _filterPlayerClipBones(clip, (b) => PLAYER_LOWER_BONES.has(b), '__aimlower')
            : (sg ? _buildAimBobClip(clip, sg, '__aimlower') : _filterPlayerClipBones(clip, keepLegs, '__aimlower')));
        if (filtered) {
          const action = _playerMixer.clipAction(filtered);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.enabled = true;
          _playerAimLowerActions[key] = action;
        }
      }
    }
    if (!_playerLowerActions.walk || !_playerUpperShootActions.shoot_gadget) {
      console.warn('[Sanctuaire] Tir en mouvement indisponible : couches d’animation incomplètes.');
    }

    _playerMixer.addEventListener('finished', (ev) => {
      if (ev.action === _playerActions.jump) {
        _playerJumping = false;
        window.GamepadKit?.rumble?.(70, 0.25);
      }
    });

    if (!_playerActions.idle) {
      console.warn('[Sanctuaire] Animations du personnage introuvables :', gltf.animations.map(c => c.name));
    }
    _playerReady = true;
    _loadDockedDrone();

    if (active) {
      _playerRoot.visible = true;
      _syncPlayerRoot();
      _playAction('idle');
    }
  }, undefined, (err) => {
    _playerLoading = false;
    console.warn('[Sanctuaire] Impossible de charger le personnage :', err);
    window.GamepadKit?.toast?.('⚠️ Personnage 3D indisponible');
  });
}

/* ========================================================= */
/* ---- Gadget : verrouillage, tir et impacts             ---- */
/* ========================================================= */
/**
 * Repère le sous-mesh qui porte le matériau GN_Blue_Glow et place un point
 * de tir au centre de sa face avant. Ce point suit la main et le gadget
 * pendant toutes les animations.
 */
function _findGadgetMuzzle(model) {
  const named = model.getObjectByName(GADGET_MUZZLE_NODE);
  if (named) return named;
  let muzzle = null;
  model.traverse((o) => {
    if (muzzle || !o.isMesh || !o.geometry) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (!mats.some((m) => m && m.name === GADGET_GLOW_MATERIAL)) return;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    const center = new THREE.Vector3();
    bb.getCenter(center);
    // Le canon du gadget pointe vers +X dans l'espace local de la pièce.
    center.x = bb.max.x;
    const marker = new THREE.Object3D();
    marker.name = 'GadgetMuzzle';
    marker.position.copy(center);
    o.add(marker);
    muzzle = marker;
  });
  return muzzle;
}

function _getGadgetWorldPosition(out) {
  if (!_playerModel) return false;
  // Priorité absolue : la bouche lumineuse du gadget.
  if (!_gadgetMuzzle) _gadgetMuzzle = _findGadgetMuzzle(_playerModel);
  if (_gadgetMuzzle) {
    _gadgetMuzzle.getWorldPosition(out);
    return true;
  }
  if (!_gadgetNode) {
    _gadgetNode = _playerModel.getObjectByName(GADGET_GLB_NODE)
               || _playerModel.getObjectByName(GADGET_GLB_NODE + '_Mesh')
               || _playerModel.getObjectByName('Gadget_Nexus_Mesh');
  }
  if (_gadgetNode) {
    _gadgetNode.getWorldPosition(out);
    return true;
  }
  const hand = _playerModel.getObjectByName('mixamorig:RightHand')
            || _playerModel.getObjectByName('mixamorigRightHand');
  if (hand) {
    hand.getWorldPosition(out);
    out.y += 0.08;
    return true;
  }
  return false;
}

function _gadgetLineClear(origin, target) {
  if (!colliders || colliders.length === 0) return true;
  _gadgetDir.copy(target).sub(origin);
  const dist = _gadgetDir.length();
  if (dist < 0.2) return true;
  _gadgetDir.multiplyScalar(1 / dist);
  _gadgetRay.set(origin, _gadgetDir);
  _gadgetRay.near = 0.05;
  _gadgetRay.far = Math.max(0.05, dist - 0.2);
  return _gadgetRay.intersectObjects(colliders, false).length === 0;
}

const _tgtTmp = new THREE.Vector3();
/* Le gadget reste caché : il est débloqué à la fin du dossier NÉANTIS (S8, app/dispositif1.js écrit taama.gadget = '1') */
function _gadgetUnlocked() { try { return localStorage.getItem('taama.gadget') === '1'; } catch (_) { return false; } }

function _startGadgetShot(side) {
  if (_inVehicle() || _swimming) return;
  if (!_gadgetUnlocked()) return;
  if (!active || state !== S_FPS || !_playerReady || _playerJumping || _gadgetShooting || _playerDying) return;
  if (_gadgetCooldown > 0) return;
  if (document.querySelector('.sn-scan-result.visible')) return;

  // Le clip latéral a été retiré du GLB : on retombe sur le tir normal.
  const name = (side && _playerActions['shoot_gadget_side'])
    ? 'shoot_gadget_side'
    : 'shoot_gadget';
  const act = _playerActions[name];
  if (!act) {
    window.GamepadKit?.toast?.('⚠️ Animation de tir indisponible');
    return;
  }

  // Comme dans Sahel Game : plus de verrouillage automatique ni de tir latéral. Le buste suit toujours la caméra
  // (en visée, avec le décalage de la pose) et la balle part là où le joueur regarde.
  side = false;
  _gadgetSideShot = false;
  _gadgetTarget = null;
  playerYaw = _aiming ? cameraYaw + _aimBodyYaw() : cameraYaw;

  _gadgetShooting = true;
  _gadgetShotIndex = 0;
  _gadgetCooldown = GADGET_SHOT_COOLDOWN;
  _playerIdleTime = 0;
  if (_playerKneeling) {
    // Tir agenouillé : on garde intégralement Pistol Kneeling Idle.
    // Aucune couche Shoot_Gadget n'est jouée, la posture reste identique.
    _gadgetShootAction = null;
    _gadgetKneelShotT = 0;
    _playAction('pistol kneeling idle');
  } else {
    _gadgetShootAction = act;
    const lowerName = (_playerCurrentAction === 'walk' || _playerCurrentAction === 'run')
      ? _playerCurrentAction : 'idle';
    if (_playerShootLayer) {
      // Pose de visée tenue : on ne relance que la couche haute (jambes intactes).
      const uppers = _upperSet();
      const up = uppers[name] || uppers.shoot_gadget;
      up.reset();
      up.setLoop(THREE.LoopOnce, 1);
      up.clampWhenFinished = true;
      up.enabled = true;
      up.setEffectiveTimeScale(1);
      up.setEffectiveWeight(1);
      up.play();
      _gadgetShootAction = up;
    } else if (!_enterShootLayer(name, lowerName)) {
      // Repli si les couches filtrées ne sont pas disponibles (GLB différent).
      _playAction(name, { once: true, fade: 0.06 });
    }
  }
  _syncPlayerRoot();
  // En visée, ne pas « claquer » la caméra si le fondu est en cours.
  _updateThirdPersonCamera(0, !_aiming && _aimBlend === 0);
  window.GamepadKit?.rumble?.(35, 0.18);
}

function _playExplosionSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_gadgetAudio) { _gadgetAudio = new AC(); window.GameAudio?.ctx(_gadgetAudio, 'effects'); }
    const ctx = _gadgetAudio;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;

    // Grondement grave.
    const boom = ctx.createOscillator();
    const boomGain = ctx.createGain();
    boom.type = 'sine';
    boom.frequency.setValueAtTime(92, t);
    boom.frequency.exponentialRampToValueAtTime(28, t + 0.8);
    boomGain.gain.setValueAtTime(0.0001, t);
    boomGain.gain.exponentialRampToValueAtTime(0.34, t + 0.02);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    boom.connect(boomGain);
    boomGain.connect(ctx.destination);
    boom.start(t);
    boom.stop(t + 1.05);

    // Souffle / craquement large bande.
    const len = Math.floor(ctx.sampleRate * 0.9);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const fade = Math.pow(1 - i / len, 2.1);
      data[i] = (Math.random() * 2 - 1) * fade;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1900, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + 0.65);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0001, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.20, t + 0.008);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(t);
  } catch (_) {}
}

function _fireGadgetShotOnce() {
  if (!M?.scene) return;
  if (!_getGadgetWorldPosition(_gadgetOrigin)) {
    _gadgetOrigin.copy(playerPos);
    _gadgetOrigin.y -= 0.55;
  }
  // Comme dans Sahel Game : en visée (ou en tireur d'élite) la balle part du canon vers le point du réticule (centre de l'écran) ;
  // hors visée elle part droit devant le canon. Tant que le fondu n'est pas à mi-course, on tire droit devant.
  _fireBulletShot(_aiming && _aimBlend >= 0.5);
}

function _updateGadgetShot(moving, running) {
  const act = _gadgetShootAction;
  if (!act) {
    _gadgetShooting = false;
    _exitShootLayer(moving, running);
    return;
  }
  while (_gadgetShotIndex < GADGET_SHOT_TIMES.length &&
         act.time >= GADGET_SHOT_TIMES[_gadgetShotIndex]) {
    _gadgetShotIndex++;
    _fireGadgetShotOnce();
  }
  const duration = act.getClip()?.duration || 1.6;
  if (act.time >= duration - 0.03) {
    _gadgetShooting = false;
    _gadgetShootAction = null;
    _gadgetTarget = null;
    _gadgetCooldown = GADGET_SHOT_COOLDOWN;
    // Reprend l'animation plein-corps (marche/course ou idle) en douceur.
    if (_aiming && _aimHold) _holdAimPose();
    else _exitShootLayer(moving, running);
  }
}

function _updateKneelingShot(dt) {
  if (!_gadgetShooting) return;
  _gadgetKneelShotT += dt;

  while (_gadgetShotIndex < GADGET_SHOT_TIMES.length &&
         _gadgetKneelShotT >= GADGET_SHOT_TIMES[_gadgetShotIndex]) {
    _gadgetShotIndex++;
    _fireGadgetShotOnce();
  }

  if (_gadgetKneelShotT >= GADGET_SHOT_DURATION) {
    _gadgetShooting = false;
    _gadgetShootAction = null;
    _gadgetTarget = null;
    _gadgetShotIndex = 0;
    _gadgetKneelShotT = 0;
    _gadgetCooldown = GADGET_SHOT_COOLDOWN;
    // La pose agenouillée continue sans interruption.
    if (_playerKneeling && _playerReady) _playAction('pistol kneeling idle');
  }
}

/* ---------- Destruction du drone N : feu d'artifice ---------------- */
function _makeFireworkTexture() {
  if (_fireworkTexture) return _fireworkTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.00, 'rgba(255,255,255,1)');
  grad.addColorStop(0.22, 'rgba(255,255,255,0.98)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.38)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _fireworkTexture = tex;
  return tex;
}

function _makeFireballTexture() {
  if (_explosionFireTexture) return _explosionFireTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');

  // Base chaude, mais déjà transparente avant le bord du disque.
  const base = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  base.addColorStop(0.00, 'rgba(255,255,255,1)');
  base.addColorStop(0.14, 'rgba(255,252,225,1)');
  base.addColorStop(0.30, 'rgba(255,225,130,0.98)');
  base.addColorStop(0.48, 'rgba(255,165,55,0.88)');
  base.addColorStop(0.64, 'rgba(245,100,22,0.62)');
  base.addColorStop(0.76, 'rgba(175,48,8,0.26)');
  base.addColorStop(0.84, 'rgba(90,18,2,0)');
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);

  // Lobes irréguliers : cassent la forme parfaite de boule de feu.
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 26 + Math.random() * 64;
    const x = 128 + Math.cos(ang) * dist;
    const y = 128 + Math.sin(ang) * dist;
    const r = 18 + Math.random() * 38;
    const hot = Math.random();
    const col = hot < 0.24 ? '255,244,190'
      : hot < 0.68 ? '255,176,64'
      : '255,92,22';
    const a = 0.18 + Math.random() * 0.34;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0.0, `rgba(${col},${a})`);
    grad.addColorStop(0.55, `rgba(${col},${a * 0.48})`);
    grad.addColorStop(1.0, `rgba(${col},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _explosionFireTexture = tex;
  return tex;
}

function _makeSmokeTexture() {
  if (_explosionSmokeTexture) return _explosionSmokeTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  // Moins de lobes, mais plus larges : la fumée garde une structure
  // visible au lieu de devenir un disque uniforme.
  for (let i = 0; i < 10; i++) {
    const x = 128 + (Math.random() - 0.5) * 104;
    const y = 128 + (Math.random() - 0.5) * 104;
    const r = 44 + Math.random() * 54;
    const a = 0.18 + Math.random() * 0.17;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0.0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.48, `rgba(255,255,255,${a * 0.78})`);
    grad.addColorStop(0.78, `rgba(255,255,255,${a * 0.30})`);
    grad.addColorStop(1.0, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _explosionSmokeTexture = tex;
  return tex;
}

function _makeRingTexture() {
  if (_explosionRingTexture) return _explosionRingTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 128, 74, 128, 128, 124);
  grad.addColorStop(0.00, 'rgba(255,255,255,0)');
  grad.addColorStop(0.66, 'rgba(255,255,255,0.02)');
  grad.addColorStop(0.80, 'rgba(255,255,255,0.90)');
  grad.addColorStop(0.88, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  _explosionRingTexture = tex;
  return tex;
}

function _makeFireworkFlash(center, offset, color, delay, baseScale, maxLife) {
  if (!M?.scene) return;
  const mat = new THREE.SpriteMaterial({
    map: _makeFireworkTexture(), color,
    transparent: true, opacity: delay > 0 ? 0 : 1,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(
    center.x + offset[0],
    center.y + offset[1],
    center.z + offset[2]
  );
  sprite.scale.setScalar(baseScale);
  sprite.visible = delay <= 0;
  sprite.renderOrder = 4;
  M.scene.add(sprite);
  _fireworkFx.push({
    kind: 'fireworkFlash',
    flash: sprite, flashMat: mat,
    delay, life: 0, max: maxLife, baseScale,
  });
}

function _makeExplosionSmoke(center, offset, delay, baseScale, maxLife, drift, color, baseOpacity) {
  if (!M?.scene) return;
  const mat = new THREE.SpriteMaterial({
    map: _makeSmokeTexture(), color: color ?? 0x322b27,
    transparent: true, opacity: 0,
    blending: THREE.NormalBlending, depthWrite: false, depthTest: true,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(
    center.x + offset[0],
    center.y + offset[1],
    center.z + offset[2]
  );
  sprite.scale.setScalar(baseScale);
  sprite.visible = delay <= 0;
  sprite.renderOrder = 1;
  M.scene.add(sprite);
  _fireworkFx.push({
    kind: 'explosionSmoke',
    smoke: sprite, smokeMat: mat,
    delay, life: 0, max: maxLife, baseScale,
    baseOpacity: baseOpacity ?? 0.55,
    drift: drift || [0, 0.22, 0],
    spin: (Math.random() - 0.5) * 0.9,
  });
}

function _makeExplosionFireball(center, offset, color, baseScale, maxScale, delay, maxLife, baseOpacity, blending) {
  if (!M?.scene) return;
  const mat = new THREE.SpriteMaterial({
    map: _makeFireballTexture(), color,
    transparent: true, opacity: 0,
    blending: blending ?? THREE.AdditiveBlending,
    depthWrite: false, depthTest: true,
    toneMapped: false, rotation: Math.random() * Math.PI * 2,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(
    center.x + offset[0],
    center.y + offset[1],
    center.z + offset[2]
  );
  sprite.scale.setScalar(baseScale);
  sprite.visible = delay <= 0;
  sprite.renderOrder = 2;
  M.scene.add(sprite);
  _fireworkFx.push({
    kind: 'explosionFireball',
    sprite, mat,
    delay, life: 0, max: maxLife,
    baseScale, maxScale, baseOpacity: baseOpacity ?? 0.9,
  });
}

function _makeExplosionShockwave(center, delay, color, baseScale, maxScale, maxLife, baseOpacity) {
  if (!M?.scene) return;
  const mat = new THREE.SpriteMaterial({
    map: _makeRingTexture(), color,
    transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.position.copy(center);
  sprite.scale.setScalar(baseScale);
  sprite.visible = delay <= 0;
  sprite.renderOrder = 2;
  M.scene.add(sprite);
  _fireworkFx.push({
    kind: 'explosionShockwave',
    sprite, mat,
    delay, life: 0, max: maxLife,
    baseScale, maxScale, baseOpacity: baseOpacity ?? 0.55,
  });
}

function _makeExplosionLight(center) {
  // Volontairement vide : ajouter une PointLight à la scène change le nombre de lumières et fait recompiler tous les matériaux de la ville
  // (blocage de plusieurs secondes à la première explosion). Le flash additif et la boule de feu suffisent à « éclairer » l'explosion.
}

function _makeExplosionDebris(center, count = 13) {
  if (!M?.scene) return;
  for (let i = 0; i < count; i++) {
    const hot = i < 2;
    const geo = new THREE.TetrahedronGeometry(0.055 + Math.random() * 0.06, 0);
    const mat = new THREE.MeshBasicMaterial({         // sans éclairage : pas de nouveau programme de shader lié aux lumières
      color: hot ? 0xff7a20 : 0x2c2a27,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const theta = Math.random() * Math.PI * 2;
    const speed = 2.4 + Math.random() * 3.8;
    const lift = 1.2 + Math.random() * 2.6;
    mesh.position.set(
      center.x + (Math.random() - 0.5) * 0.25,
      center.y + (Math.random() - 0.5) * 0.25,
      center.z + (Math.random() - 0.5) * 0.25
    );
    mesh.scale.setScalar(hot ? 0.55 + Math.random() * 0.45 : 0.7 + Math.random() * 0.9);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.renderOrder = 2;
    M.scene.add(mesh);
    _fireworkFx.push({
      kind: 'explosionDebris',
      mesh, geo, mat,
      vel: new THREE.Vector3(
        Math.cos(theta) * speed,
        lift,
        Math.sin(theta) * speed
      ),
      spin: new THREE.Vector3(
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14,
        (Math.random() - 0.5) * 14
      ),
      life: 0,
      max: 1.1 + Math.random() * 0.8,
      gravity: 9.8,
    });
  }
}

function _makeFireworkBurst(center, offset, spec) {
  if (!M?.scene) return;
  const count = spec.count;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const base = new THREE.Color(spec.color);
  const tmp = new THREE.Color();

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const sinPhi = Math.sin(phi);
    const speed = spec.speed * (0.35 + Math.random() * 0.75);
    const i3 = i * 3;
    velocities[i3]     = sinPhi * Math.cos(theta) * speed;
    velocities[i3 + 1] = Math.cos(phi) * speed + (spec.upBias ?? 0.35);
    velocities[i3 + 2] = sinPhi * Math.sin(theta) * speed;

    positions[i3]     = (Math.random() - 0.5) * 0.05;
    positions[i3 + 1] = (Math.random() - 0.5) * 0.05;
    positions[i3 + 2] = (Math.random() - 0.5) * 0.05;

    tmp.copy(base).offsetHSL(
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.05,
      (Math.random() - 0.5) * 0.12
    );
    colors[i3]     = tmp.r;
    colors[i3 + 1] = tmp.g;
    colors[i3 + 2] = tmp.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: spec.size,
    map: _makeFireworkTexture(),
    vertexColors: true,
    transparent: true,
    opacity: 1,
    alphaTest: 0.01,
    blending: spec.blending ?? THREE.NormalBlending,
    depthWrite: false,
    depthTest: true,
    sizeAttenuation: true,
    toneMapped: false,
  });
  const points = new THREE.Points(geo, mat);
  points.position.set(
    center.x + offset[0],
    center.y + offset[1],
    center.z + offset[2]
  );
  points.frustumCulled = false;
  points.visible = spec.delay <= 0;
  points.renderOrder = 3;
  M.scene.add(points);

  _fireworkFx.push({
    kind: 'fireworkBurst',
    points, geo, mat, velocities,
    delay: spec.delay,
    life: 0,
    max: spec.life,
    gravity: spec.gravity,
    drag: spec.drag,
    baseSize: spec.size,
  });
}

/* Préchauffage : crée les textures de l'explosion et compile ses matériaux AVANT le premier tir (sinon ~1 s de blocage à la 1re explosion). */
let _fxWarm = false;
function _prewarmExplosionFx() {
  if (_fxWarm || !M?.scene || !M.renderer) return;
  _fxWarm = true;
  try {
    const maps = [_makeFireworkTexture(), _makeFireballTexture(), _makeSmokeTexture(), _makeRingTexture()];
    const dummies = [];
    const pts = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(3), 3)),
      new THREE.PointsMaterial({ map: maps[0], vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, size: 0.1 }));
    dummies.push(pts);
    for (const m of maps) dummies.push(new THREE.Sprite(new THREE.SpriteMaterial({ map: m, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })));
    dummies.push(new THREE.Mesh(new THREE.TetrahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })));
    for (const d of dummies) { d.frustumCulled = false; M.scene.add(d); }
    for (const m of maps) M.renderer.initTexture?.(m);
    M.renderer.compile(M.scene, M.camera);
    for (const d of dummies) { M.scene.remove(d); d.geometry?.dispose?.(); d.material?.dispose?.(); }
  } catch (e) { console.warn('[Sanctuaire] préchauffage des explosions :', e); }
}

function _spawnDroneNExplosion(center) {
  if (!M?.scene) return;

  // 1. Flash blanc très bref + lumière qui éclaire la scène.
  _makeFireworkFlash(center, [0, 0.08, 0], 0xffffff, 0, 0.45, 0.20);
  _makeExplosionLight(center);

  // 2. Boule de feu : cœur blanc additif, puis couches orange en fusion
  //    normale pour garder des couleurs chaudes sans écran blanc.
  _makeExplosionFireball(center, [ 0.00, 0.10,  0.00], 0xffffff, 0.55, 1.55, 0.00, 0.30, 1.00, THREE.AdditiveBlending);
  _makeExplosionFireball(center, [ 0.08, 0.16,  0.05], 0xffe8b0, 0.85, 2.45, 0.02, 0.50, 0.90, THREE.AdditiveBlending);
  _makeExplosionFireball(center, [-0.10, 0.06, -0.05], 0xffc890, 1.05, 3.05, 0.05, 0.85, 0.62, THREE.NormalBlending);

  // 3. Onde de choc (une seule).
  _makeExplosionShockwave(center, 0.00, 0xffd9a0, 0.35, 3.4, 0.32, 0.20);

  // 4. Fumée : 4 bouffées + une lueur chaude (au lieu de 11).
  const smokePuffs = [
    { off: [ 0.00, 0.05,  0.00], delay: 0.02, scale: 1.20, life: 2.60, color: 0x332c27, opacity: 0.60, drift: [ 0.02, 0.16,  0.01] },
    { off: [ 0.72, 0.18,  0.12], delay: 0.08, scale: 1.00, life: 2.30, color: 0x4a4038, opacity: 0.48, drift: [ 0.12, 0.14,  0.03] },
    { off: [-0.68, 0.10, -0.14], delay: 0.12, scale: 1.00, life: 2.30, color: 0x443b34, opacity: 0.48, drift: [-0.11, 0.13,  0.02] },
    { off: [ 0.12, 0.52, -0.18], delay: 0.24, scale: 0.88, life: 2.20, color: 0x5a4e44, opacity: 0.38, drift: [ 0.04, 0.18, -0.02] },
  ];
  for (const p of smokePuffs) {
    _makeExplosionSmoke(center, p.off, p.delay, p.scale, p.life, p.drift, p.color, p.opacity);
  }
  _makeExplosionSmoke(center, [ 0.08, 0.10,  0.04], 0.06, 0.95, 1.30, [0.03, 0.16, 0.01], 0x7a4025, 0.26);

  // 5. Étincelles : 3 salves au lieu de 4, 3× moins de particules.
  _makeFireworkBurst(center, [0, 0.08, 0], {
    delay: 0.00, color: 0xff9a2e, count: 60, speed: 6.8, size: 0.15,
    life: 1.20, gravity: 9.8, drag: 0.42, upBias: 0.75,
    blending: THREE.AdditiveBlending,
  });
  _makeFireworkBurst(center, [0, 0.10, 0], {
    delay: 0.00, color: 0xfff0b0, count: 24, speed: 8.8, size: 0.11,
    life: 0.90, gravity: 9.8, drag: 0.36, upBias: 0.85,
    blending: THREE.AdditiveBlending,
  });
  _makeFireworkBurst(center, [0, 0.05, 0], {
    delay: 0.08, color: 0xff5a14, count: 36, speed: 4.0, size: 0.13,
    life: 1.60, gravity: 6.2, drag: 0.62, upBias: 0.55,
    blending: THREE.AdditiveBlending,
  });

  // 6. Débris sombres et éclats incandescents projetés.
  _makeExplosionDebris(center, 6);
}

function _disposeFireworkFx(fx) {
  if (!fx) return;
  if (fx.points && M?.scene) M.scene.remove(fx.points);
  if (fx.flash && M?.scene) M.scene.remove(fx.flash);
  if (fx.smoke && M?.scene) M.scene.remove(fx.smoke);
  if (fx.sprite && M?.scene) M.scene.remove(fx.sprite);
  if (fx.mesh && M?.scene) M.scene.remove(fx.mesh);
  if (fx.light && M?.scene) M.scene.remove(fx.light);
  fx.geo?.dispose();
  fx.mat?.dispose();
  fx.flashMat?.dispose();
  fx.smokeMat?.dispose();
}

function _clearFireworkFx() {
  for (const fx of _fireworkFx) _disposeFireworkFx(fx);
  _fireworkFx.length = 0;
}

function _updateFireworkFx(dt) {
  for (let i = _fireworkFx.length - 1; i >= 0; i--) {
    const fx = _fireworkFx[i];

    if (fx.delay > 0) {
      fx.delay -= dt;
      if (fx.delay > 0) continue;
      fx.delay = 0;
      if (fx.flash) fx.flash.visible = true;
      if (fx.smoke) fx.smoke.visible = true;
      if (fx.sprite) fx.sprite.visible = true;
      if (fx.points) fx.points.visible = true;
    }

    if (fx.kind === 'explosionLight') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      const k = Math.min(1, fx.life / fx.max);
      fx.light.intensity = fx.baseIntensity * Math.pow(1 - k, 2.2);
      continue;
    }

    if (fx.kind === 'fireworkFlash') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      const k = Math.min(1, fx.life / fx.max);
      fx.flash.scale.setScalar(fx.baseScale * (0.8 + k * 3.2));
      fx.flashMat.opacity = Math.pow(1 - k, 1.7);
      continue;
    }

    if (fx.kind === 'explosionFireball') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      const k = Math.min(1, fx.life / fx.max);
      const ease = 1 - Math.pow(1 - k, 2.2);
      fx.sprite.scale.setScalar(
        fx.baseScale + (fx.maxScale - fx.baseScale) * ease
      );
      const rise = Math.min(1, k / 0.10);
      fx.mat.opacity = fx.baseOpacity * rise * Math.pow(1 - k, 1.6);
      fx.mat.rotation += dt * 0.35;
      continue;
    }

    if (fx.kind === 'explosionShockwave') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      const k = Math.min(1, fx.life / fx.max);
      const ease = 1 - Math.pow(1 - k, 3);
      fx.sprite.scale.setScalar(
        fx.baseScale + (fx.maxScale - fx.baseScale) * ease
      );
      fx.mat.opacity = fx.baseOpacity * Math.pow(1 - k, 1.35);
      continue;
    }

    if (fx.kind === 'explosionSmoke') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      const k = Math.min(1, fx.life / fx.max);
      const grow = 0.72 + k * 2.35;
      fx.smoke.scale.setScalar(fx.baseScale * grow);
      const fadeIn = Math.min(1, k / 0.12);
      const fadeOut = k < 0.70 ? 1 : 1 - (k - 0.70) / 0.30;
      fx.smokeMat.opacity = fx.baseOpacity * fadeIn * fadeOut;
      fx.smoke.position.x += fx.drift[0] * dt;
      fx.smoke.position.y += fx.drift[1] * dt;
      fx.smoke.position.z += fx.drift[2] * dt;
      fx.smokeMat.rotation += fx.spin * dt;
      continue;
    }

    if (fx.kind === 'explosionDebris') {
      fx.life += dt;
      if (fx.life >= fx.max) {
        _disposeFireworkFx(fx);
        _fireworkFx.splice(i, 1);
        continue;
      }
      fx.vel.y -= fx.gravity * dt;
      fx.mesh.position.addScaledVector(fx.vel, dt);
      fx.mesh.rotation.x += fx.spin.x * dt;
      fx.mesh.rotation.y += fx.spin.y * dt;
      fx.mesh.rotation.z += fx.spin.z * dt;
      const k = fx.life / fx.max;
      fx.mat.opacity = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      continue;
    }

    if (fx.kind !== 'fireworkBurst') continue;

    fx.life += dt;
    if (fx.life >= fx.max) {
      _disposeFireworkFx(fx);
      _fireworkFx.splice(i, 1);
      continue;
    }

    const fade = 1 - fx.life / fx.max;
    fx.mat.opacity = Math.pow(fade, 1.35);
    fx.mat.size = fx.baseSize * (0.4 + 0.6 * fade);

    const arr = fx.geo.attributes.position.array;
    const vel = fx.velocities;
    const drag = Math.pow(fx.drag, dt);
    for (let j = 0; j < arr.length; j += 3) {
      vel[j]     *= drag;
      vel[j + 1]  = vel[j + 1] * drag - fx.gravity * dt;
      vel[j + 2] *= drag;
      arr[j]     += vel[j] * dt;
      arr[j + 1] += vel[j + 1] * dt;
      arr[j + 2] += vel[j + 2] * dt;
    }
    fx.geo.attributes.position.needsUpdate = true;
  }
}

/* ---------- Animations du drone N : esquives et destruction ---------- */
function _captureDroneNTransforms(model) {
  const list = [];
  model.traverse((node) => {
    list.push({
      node,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    });
  });
  return list;
}

// Remet le modèle dans sa pose de repos (au cas où une esquive était en
// cours) puis relance éventuellement l'Idle.
function _resetDroneNModel(d, playIdle = true) {
  if (!d) return;
  if (d.mixer) d.mixer.stopAllAction();
  d.currentAction = null;
  d.dodging = false;
  d.dodgeDir = 0;
  if (d.ai) {
    DroneAI.resetAI(d.ai);
    d.yaw = 0;
    d.scanning = false;
  }
  for (const t of d.initialTransforms || []) {
    t.node.position.copy(t.position);
    t.node.quaternion.copy(t.quaternion);
    t.node.scale.copy(t.scale);
  }
  d.model?.updateMatrixWorld(true);
  if (playIdle && d.actions?.Idle) {
    const idle = d.actions.Idle;
    idle.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    d.currentAction = idle;
  }
}

function _playDroneNAction(name, fade = 0.15, timeScale = 1, crossFade = true) {
  const d = _sanctuaryDroneN;
  const next = d?.actions?.[name];
  if (!next) return null;
  const prev = d.currentAction;
  next.reset();
  next.setEffectiveTimeScale(timeScale);
  next.setEffectiveWeight(1);
  next.play();
  if (prev && prev !== next && crossFade) {
    next.crossFadeFrom(prev, fade, false);
  } else if (fade > 0) {
    next.fadeIn(fade);
  }
  d.currentAction = next;
  return next;
}

function _playDroneNDodge() {
  const d = _sanctuaryDroneN;
  if (!d || _droneNDead) return;
  // Alterne gauche/droite à chaque impact pour montrer les deux esquives.
  d.dodgeDir = d.dodgeDir === 1 ? -1 : 1;
  const name = d.dodgeDir > 0 ? 'Dodge_Right' : 'Dodge_Left';
  const action = _playDroneNAction(name, 0.12, 1.1);
  if (!action) return;
  d.dodging = true;
  // Le drone ne riposte pas pendant son esquive.
  _droneNFireCooldown = Math.max(_droneNFireCooldown, 0.45);
}

function _onDroneNAnimationFinished(event) {
  const owner = _droneRoster.find((r) => r.d.mixer === event.target);
  if (owner && _boundCtx !== owner) { _withCtx(owner, () => _onDroneNAnimationFinished(event)); return; }
  const d = _sanctuaryDroneN;
  if (!d) return;
  const a = d.actions || {};

  // Fin d'une esquive : retour à l'Idle, sauf si une autre esquive a pris
  // le relais entre-temps.
  if (!_droneNDead && d.currentAction === event.action &&
      (event.action === a.Dodge_Left || event.action === a.Dodge_Right)) {
    d.dodging = false;
    _playDroneNAction('Idle', 0.2);
  }
}

function _damageDroneN(amount) {
  if (!_sanctuaryDroneN || _droneNDead) return;
  _droneNHealth = Math.max(0, _droneNHealth - amount);
  if (_droneNHealth <= 0) {
    _destroyDroneN();                       // explosion : pas de vibration de la manette
  } else {
    window.GamepadKit?.rumble?.(45, 0.22);
    // Touché : la Sentinelle sait où est le joueur et passe en engagement.
    if (_sanctuaryDroneN.ai) DroneAI.onHit(_sanctuaryDroneN.ai, playerPos);
    _playDroneNDodge();
    _updateGadgetHud();
  }
}

function _destroyDroneN() {
  const d = _sanctuaryDroneN;
  if (!d) return;
  d.group.getWorldPosition(_gadgetAim);
  _gadgetAim.y += 0.25;

  _droneNDead = true;
  _droneNHealth = 0;
  _droneNRespawnT = DRONE_N_RESPAWN_DELAY;
  d.dodging = false;
  d.currentAction = null;
  d.mixer?.stopAllAction();
  d.group.visible = false;
  _gadgetTarget = null;
  _hideDroneNLaserFx();

  // Explosion cinématique : flash, boule de feu, onde de choc, fumée,
  // étincelles et débris remplacent la chute + explosion du drone.
  _spawnDroneNExplosion(_gadgetAim);
  _playExplosionSound();
  _triggerCameraShake(0.45, 0.12);
  _updateGadgetHud();
  window.GamepadKit?.toast?.('💥 Drone hostile détruit');
}

function _respawnDroneN() {
  const d = _sanctuaryDroneN;
  if (!d) return;
  _droneNDead = false;
  _droneNHealth = DRONE_N_MAX_HP;
  _droneNRespawnT = 0;
  _resetDroneNModel(d, true);
  d.group.position.copy(d.home || DRONE_N_POS);
  d.group.quaternion.copy(d.baseQuat);
  d.group.visible = active || _pilotHold;
  _droneNFireCooldown = 1.2;
  _updateGadgetHud();
  window.GamepadKit?.toast?.('🛰️ Drone hostile de retour');
}

function _updateGadgetHud() {
  if (!snTarget) return;
  // cible affichée : la sentinelle vivante la plus proche
  let focus = null, fd = Infinity;
  for (const c of _liveDrones([])) {
    const dist = Math.hypot(c.d.group.position.x - playerPos.x, c.d.group.position.z - playerPos.z);
    if (dist < fd) { fd = dist; focus = c; }
  }
  if (focus && focus.r && focus.r !== _boundCtx) { _withCtx(focus.r, _updateGadgetHudFor); return; }
  _updateGadgetHudFor();
}
function _updateGadgetHudFor() {
  if (!snTarget) return;
  const d = _sanctuaryDroneN;
  const on = active && state === S_FPS && !!d?.group && !_droneNDead && _gadgetUnlocked();
  snTarget.classList.toggle('is-on', on);
  if (!on) {
    snReticle?.classList.remove('is-lock');
    return;
  }

  d.group.getWorldPosition(_gadgetAim);
  _gadgetAim.y += 0.15;
  const dist = playerPos.distanceTo(_gadgetAim);
  const inRange = dist <= GADGET_SHOT_RANGE;
  const los = inRange && _gadgetLineClear(playerPos, _gadgetAim);
  snTarget.classList.toggle('is-blocked', !inRange || !los);
  snReticle?.classList.toggle('is-lock', inRange && los);

  if (snTargetFill) {
    snTargetFill.style.width = `${Math.max(0, Math.min(100, (_droneNHealth / DRONE_N_MAX_HP) * 100))}%`;
  }
  if (snTargetState) {
    snTargetState.textContent = !inRange ? 'HORS PORTÉE' : (!los ? 'HORS DE VUE' : 'DRONE HOSTILE');
  }
  if (snTargetDist) snTargetDist.textContent = `${dist.toFixed(1)} m`;
}

/* ========================================================= */
/* ---- Drone posé sur le sac (décollage L1 / LB)         ---- */
/* ========================================================= */
const DRONE_GLB_URL     = 'assets/models/drone.glb';
const DRONE_DOCK_Z      = 0.0539;   // demi-épaisseur du drone le long de la normale du pad
const DRONE_DOCK_YAW    = Math.PI;  // le drone posé sur le sac est tourné de 180° (avant ↔ arrière)
const DRONE_DOCK_SCALE  = 0.19;     // même échelle que le drone posé dans Blender
const DRONE_TAKEOFF_DUR = 1.35;     // s
const DRONE_DISC_DUR    = 0.5;      // s — montée douce des disques d'hélices

const _gltfDrone = new GLTFLoader();
_gltfDrone.setDRACOLoader(_draco);
useMeshopt(_gltfDrone);

let _dockedDrone        = null;     // { group, model, discs:[{ node, base }] }
let _dockedDroneLoading = false;
let _droneTakeoff       = null;     // animation de décollage en cours
let _pilotHold          = false;    // personnage visible pendant le pilotage
let _droneReturn        = null;     // animation de retour du drone vers le sac

function _loadDockedDrone() {
  if (_dockedDrone || _dockedDroneLoading || !M) return;
  _dockedDroneLoading = true;
  _gltfDrone.load(DRONE_GLB_URL, (gltf) => {
    _dockedDroneLoading = false;
    const model = gltf.scene;
    // Même convention que le mode pilotage : base droite, sans rotation du GLB.
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.sub(center);          // centre géométrique sur l'origine du groupe

    const discs = [];
    model.traverse((o) => {
      if (!/^PropDisc_HELICE_/i.test(o.name || '')) return;
      const base = o.scale.clone();
      o.scale.setScalar(0.0001);         // rangé : disques invisibles (échelle 0)
      discs.push({ node: o, base });
    });

    const group = new THREE.Group();
    group.name = 'DockedDrone';
    group.add(model);
    _dockedDrone = { group, model, discs };
    _attachDockedDrone();
  }, undefined, (err) => {
    _dockedDroneLoading = false;
    console.warn('[Sanctuaire] Drone indisponible :', err);
  });
}

function _attachDockedDrone() {
  const dd = _dockedDrone;
  if (!dd || !_playerModel) return;
  const anchor = _playerModel.getObjectByName('DroneLandingPad');
  if (!anchor) return;
  const g = dd.group;
  // Repère de l'ancre dans le GLB : +Y = normale du pad (vers l'extérieur),
  // +Z = haut du dos. Le drone est donc aligné tel quel : dessus vers l'extérieur,
  // nez vers le haut, comme dans Blender.
  g.position.set(0, DRONE_DOCK_Z, 0);
  g.rotation.set(0, DRONE_DOCK_YAW, 0);          // retourné de 180° autour de la normale du pad : nez vers le bas, arrière vers le haut
  g.scale.setScalar(DRONE_DOCK_SCALE);
  g.visible = true;
  if (g.parent !== anchor) anchor.add(g);
  for (const d of dd.discs) d.node.scale.copy(d.base).multiplyScalar(0.0001);
}

function _startDroneTakeoff() {
  if (_vehicleCtl && _vehicleCtl.active()) { window.GamepadKit?.toast?.('Impossible de lancer le drone depuis la voiture'); return false; }
  const dd = _dockedDrone;
  if (!dd || !_playerModel || _droneTakeoff || !dd.group.parent) return false;
  if (dd.group.parent === M.scene) return false;      // déjà détaché
  const g = dd.group;
  g.updateWorldMatrix(true, true);
  const from = new THREE.Vector3();
  g.getWorldPosition(from);
  const qDock = new THREE.Quaternion();
  g.getWorldQuaternion(qDock);
  // Normale du pad = +Y local de l'ancre dans le GLB.
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(qDock).normalize();
  const to = from.clone()
    .addScaledVector(normal, 2.4)                     // dégage la façade / le dos
    .add(new THREE.Vector3(0, 1.35, 0));              // monte au-dessus de la tête
  // Orientation finale = celle du modèle en mode pilotage (rig yaw + π, modèle + π/2).
  const qLevel = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, playerYaw - Math.PI / 2, 0, 'YXZ')
  );

  M.scene.attach(g);                                  // détache du sac en gardant la pose monde
  g.visible = true;
  _droneTakeoff = { t: 0, from, to, qDock, qLevel };
  window.GamepadKit?.rumble?.(110, 0.55);
  return true;
}

function _updateDockedDrone(dt) {
  const tk = _droneTakeoff;
  if (!tk || !_dockedDrone) return;
  tk.t += dt;

  // Disques d'hélices : 0 -> taille réelle, en douceur (ease-out).
  const kd = Math.min(1, tk.t / DRONE_DISC_DUR);
  const ed = Math.max(0.0001, 1 - Math.pow(1 - kd, 3));
  for (const d of _dockedDrone.discs) d.node.scale.copy(d.base).multiplyScalar(ed);

  // Élévation + redressement du drone (ease-in-out).
  const kr = Math.min(1, tk.t / DRONE_TAKEOFF_DUR);
  const er = kr < 0.5 ? 4 * kr * kr * kr : 1 - Math.pow(-2 * kr + 2, 3) / 2;
  const g = _dockedDrone.group;
  g.position.lerpVectors(tk.from, tk.to, er);
  g.quaternion.slerpQuaternions(tk.qDock, tk.qLevel, er);

  if (kr >= 1) _handoffDrone();
}

let _handoffWait = 0;
function _handoffDrone() {
  const tk = _droneTakeoff;
  if (!tk) return;
  // le modèle de pilotage n'est pas encore chargé : le drone du sac reste visible (3 s au plus) au lieu de disparaître
  if (window.DroneGame?.modelReady && !window.DroneGame.modelReady() && (performance.now() - (_handoffWait || (_handoffWait = performance.now()))) < 3000) { window.DroneGame.preload?.(); return; }
  _handoffWait = 0;
  _droneTakeoff = null;
  const g = _dockedDrone?.group;
  const start = new THREE.Vector3();
  if (g) { g.getWorldPosition(start); g.visible = false; }
  const yaw = playerYaw;
  _enterPilotHold();                                  // garde le personnage dans la scène…
  window.DroneGame?.enter?.({ launch: { position: start, yaw } });   // …et passe au pilotage
}

/* ========================================================= */
/* ---- Drone N — drone supplémentaire du sanctuaire      ---- */
/* ========================================================= */
/* Le drone N (modélisé dans Blender) est un drone EN PLUS de celui du joueur.
   L'ancien drone reste posé sur le sac et reste le drone pilotable.
   Le drone N est placé devant la mosquée, au point d'apparition extérieur
   (entre les deux tombeaux), joue Idle et suit une IA de Sentinelle
   (drone-n-ai.js : patrouille, alerte, engagement, recherche). Il tire des
   lasers depuis le canon Cylinder.001 uniquement en état ENGAGE. */
const DRONE_N_GLB_URL       = 'assets/models/droneN.glb?v=1';
const DRONE_N_SIZE          = 1.3;          // envergure max en unités monde
const DRONE_N_TURN_SPEED    = 10.0;         // lissage de la rotation vers le personnage (7 avant : réaction visuelle plus vive)
const DRONE_N_FIRE_INTERVAL = 0.55;         // s entre deux tirs laser
const DRONE_N_BULLET_SPEED  = 55.0;         // m/s — vitesse des balles traçantes
const DRONE_N_BULLET_RANGE  = 45.0;         // m — portée avant disparition
const DRONE_N_BULLET_SPREAD = 0.03;         // dispersion du tir (≈ 1,7°)
const DRONE_N_BULLET_RADIUS = 0.4;          // m — rayon de touche autour du corps du joueur
const DRONE_N_BULLET_MAX    = 8;            // balles simultanées
const DRONE_N_TRACER_LEN    = 1.0;          // m — longueur de la traînée lumineuse
const DRONE_N_MUZZLE_LIFE   = 0.07;         // s — flash de bouche
const DRONE_N_IMPACT_LIFE   = 0.16;         // s — flash d'impact
const DRONE_N_SPARK_COUNT   = 6;            // étincelles par impact
const DRONE_N_SPARK_LIFE    = 0.35;         // s
const DRONE_N_SPARK_POOL    = 16;
const DRONE_N_POS           = new THREE.Vector3(
  PLAYER_EXTERIOR.x,
  PLAYER_EXTERIOR.y + 0.30,
  PLAYER_EXTERIOR.z - 2.0
);

let _vehicleCtl = null;                // contrôleur du véhicule (voir window.SanctuaryMode.vehicle)
let _sanctuaryDroneN        = null;   // { group, model, mixer, baseQuat, emitter }
let _sanctuaryDroneNLoading = false;
let _droneNLaser            = null;   // effets de tir (balles traçantes, flash bouche, impact, étincelles)
let _droneNFireCooldown     = 0;
let _droneNShotsFired       = 0;      // compteur de coups tirés (diagnostic)

const _droneNYawQuat    = new THREE.Quaternion();
const _droneNTargetQuat = new THREE.Quaternion();
const _droneNYawAxis    = new THREE.Vector3(0, 1, 0);

const _droneNUpAxis      = new THREE.Vector3(0, 1, 0);
const _droneNBulletTmp   = new THREE.Vector3();
const _droneNBulletHit   = new THREE.Vector3();
const _droneNBulletNorm  = new THREE.Vector3();
const _droneNBulletNormalMat = new THREE.Matrix3();
const _droneNPlayerPt    = new THREE.Vector3();
const _droneNMuzzlePos   = new THREE.Vector3();
const _droneNShotTarget  = new THREE.Vector3();
const _droneNShotDir     = new THREE.Vector3();
const _droneNLOSRay      = new THREE.Raycaster();

/* Le drone N d'origine (celui posé près du point d'apparition, dans la mosquée) est retiré du jeu : il ne sert plus que de modèle pour
   cloner les sentinelles de la base NÉANTIS. Caché, « détruit » et sans réapparition ; il n'est ni ciblé, ni animé, ni dangereux. */
function _retireMainDrone() {
  const d = _sanctuaryDroneN; if (!d || _boundCtx) return;
  d.group.visible = false;
  if (d.statusSprite) d.statusSprite.visible = false;
  _droneNDead = true; _droneNNoRespawn = true; _droneNRespawnT = 0; _droneNHealth = 0;
}

function _loadSanctuaryDroneN() {
  if (_sanctuaryDroneN || _sanctuaryDroneNLoading || !M) return;
  _sanctuaryDroneNLoading = true;
  loadModel(_gltfDrone, DRONE_N_GLB_URL, (gltf) => {
    _sanctuaryDroneNLoading = false;
    _droneNGltf = gltf;
    const model = gltf.scene;
    model.name = 'droneN_model';
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    model.position.sub(center);                 // centre sur l'origine du groupe
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    const group = new THREE.Group();
    group.name = 'droneN';
    group.add(model);
    group.position.copy(DRONE_N_POS);
    group.scale.setScalar(DRONE_N_SIZE / maxDim);
    group.visible = active;

    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      if (clip.name === 'Idle') {
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.clampWhenFinished = false;
      } else {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.enabled = true;
      actions[clip.name] = action;
    }
    // Filet de sécurité si le clip Idle a été renommé à l'export.
    if (!actions.Idle && gltf.animations[0]) {
      const fallback = mixer.clipAction(gltf.animations[0]);
      fallback.setLoop(THREE.LoopRepeat, Infinity);
      fallback.enabled = true;
      actions.Idle = fallback;
    }

    M.scene.add(group);
    // Le nez du drone N (+Z local) est orienté vers le point d'apparition extérieur.
    group.lookAt(PLAYER_EXTERIOR.x, PLAYER_EXTERIOR.y - 0.25, PLAYER_EXTERIOR.z);
    // Cylinder.001 est le canon lumineux situé sous le drone : c'est la bouche de tir.
    // GLTFLoader peut assainir le nom en « Cylinder001 » (point retiré).
    const emitter = model.getObjectByName('Cylinder.001')
                 || model.getObjectByName('Cylinder001');
    if (!emitter) console.warn('[Sanctuaire] Canon Cylinder.001 introuvable sur droneN.');
    _sanctuaryDroneN = {
      group, model, mixer, actions,
      ai: DroneAI.createAI(DroneAI.makePatrolWaypoints(DRONE_N_POS), { center: DRONE_N_POS.clone(), radius: DRONE_N_ROAM_RADIUS }),
      yaw: 0,            // lacet courant (le repos regarde vers +Z)
      scanning: false,
      scanBaseYaw: 0,
      statusSprite: null,
      initialTransforms: _captureDroneNTransforms(model),
      baseQuat: group.quaternion.clone(),
      emitter,
      currentAction: null,
      dodging: false,
      dodgeDir: 0,
      maxDim,
    };
    mixer.addEventListener('finished', _onDroneNAnimationFinished);
    _resetDroneNModel(_sanctuaryDroneN, true);
    _droneNHealth = DRONE_N_MAX_HP;
    _droneNDead = false;
    _droneNRespawnT = 0;
    _retireMainDrone();
    _updateGadgetHud();
  }, undefined, (err) => {
    _sanctuaryDroneNLoading = false;
    console.warn('[Sanctuaire] Drone N indisponible :', err);
  });
}

/* ---------- Sentinelles de la base NÉANTIS : plusieurs drones N indépendants ----------
   Chaque sentinelle a son contexte (vie, mort, tir, IA) ; les fonctions d'origine travaillent sur des variables globales,
   on les « lie » donc au contexte voulu le temps d'un appel (_withCtx). Aucune alerte de groupe : chaque IA ne réagit qu'à
   ce qu'elle perçoit elle-même (cône de vision de 12 m, bruit à 5 m) — le joueur peut les neutraliser une par une. */
const SENTINEL_ACTIVE_R = 240;           // m — au-delà, une sentinelle en patrouille est gelée (économie) ; relevé (160 -> 240) car elles patrouillent maintenant sur de grandes zones
// Patrouille « de partout » : chaque drone choisit des points au hasard dans un disque autour de son poste (drone-n-ai.js : pickRoamPoint).
const DRONE_N_ROAM_RADIUS = 140;         // m — sentinelle d'origine (devant la mosquée)
const SENTINEL_ROAM_RADIUS = { Cube: 55, Dock: 75, default: 110 };   // m — sentinelles du poste de la base, selon leur poste
const DRONE_N_ALARM_COOLDOWN = 1.0;      // s — délai mini entre deux propagations d'alarme
function _saveGlobals() {
  return { d: _sanctuaryDroneN, h: _droneNHealth, dead: _droneNDead, rt: _droneNRespawnT, fc: _droneNFireCooldown, nr: _droneNNoRespawn, ctx: _boundCtx };
}
function _loadGlobals(g) {
  _sanctuaryDroneN = g.d; _droneNHealth = g.h; _droneNDead = g.dead; _droneNRespawnT = g.rt; _droneNFireCooldown = g.fc; _droneNNoRespawn = g.nr; _boundCtx = g.ctx;
}
function _bindCtx(r) {
  _sanctuaryDroneN = r.d; _droneNHealth = r.health; _droneNDead = r.dead; _droneNRespawnT = r.respawnT; _droneNFireCooldown = r.fireCd;
  _droneNNoRespawn = !!r.noRespawn; _boundCtx = r;
}
function _syncCtx(r) { r.health = _droneNHealth; r.dead = _droneNDead; r.respawnT = _droneNRespawnT; r.fireCd = _droneNFireCooldown; }
function _withCtx(r, fn) {
  if (!r) return fn();
  const saved = _saveGlobals();
  if (saved.ctx === null) _mainSaved = { d: saved.d, dead: saved.dead };
  _bindCtx(r);
  try { return fn(); } finally { _syncCtx(r); _loadGlobals(saved); }
}
/** Contexte propriétaire d'un objet drone (null = sentinelle d'origine). */
function _ctxOfDrone(d) { return _droneRoster.find((r) => r.d === d) || null; }
/** Toutes les sentinelles vivantes et visibles : [{ r, d }] (r = null pour la sentinelle d'origine). */
let _mainSaved = null;
function _liveDrones(out = []) {
  out.length = 0;
  const main = _boundCtx ? _mainSaved : { d: _sanctuaryDroneN, dead: _droneNDead };
  if (main && main.d?.group?.visible && !main.dead) out.push({ r: null, d: main.d });
  for (const r of _droneRoster) {
    const dead = r === _boundCtx ? _droneNDead : r.dead;
    if (r.d.group?.visible && !dead) out.push({ r, d: r.d });
  }
  return out;
}

function _spawnBaseSentinels() {
  const nb = window.NeantisBase;
  if (!_droneNGltf || !_sanctuaryDroneN || !nb || !nb.loaded || _droneRoster.length || !M) return;
  const POSTS = ['Portail', 'Allee', 'Entree', 'Tour_SO', 'Tour_SE', 'Tour_NO', 'Tour_NE', 'Hangar', 'Dock', 'Cube1', 'Cube2', 'Cube3', 'Cube4'];
  const maxDim = _sanctuaryDroneN.maxDim || 1;
  for (const nm of POSTS) {
    const home = nb.anchor('Anchor_Drone_' + nm), look = nb.anchor('Anchor_DroneLook_' + nm);
    if (!home || !look) continue;
    const model = SkeletonUtils.clone(_droneNGltf.scene);
    const group = new THREE.Group();
    group.name = 'droneN_' + nm;
    group.add(model);
    group.scale.setScalar(DRONE_N_SIZE / maxDim);
    group.position.copy(home);
    group.visible = active;
    const mixer = new THREE.AnimationMixer(model);
    const actions = {};
    for (const clip of _droneNGltf.animations) {
      const a = mixer.clipAction(clip);
      if (clip.name === 'Idle') { a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; }
      else { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      a.enabled = true; actions[clip.name] = a;
    }
    if (!actions.Idle && _droneNGltf.animations[0]) { const f = mixer.clipAction(_droneNGltf.animations[0]); f.setLoop(THREE.LoopRepeat, Infinity); f.enabled = true; actions.Idle = f; }
    M.scene.add(group);
    group.lookAt(look.x, look.y, look.z);                 // le nez (+Z local) regarde vers le point de visée du poste
    const emitter = model.getObjectByName('Cylinder.001') || model.getObjectByName('Cylinder001');
    const d = {
      group, model, mixer, actions, home: home.clone(), post: nm,
      ai: DroneAI.createAI(DroneAI.makePatrolWaypoints(home, /^Cube/.test(nm) ? 1.0 : (nm === 'Dock' ? 2.0 : 3.0), 3),
        { center: home.clone(), radius: /^Cube/.test(nm) ? SENTINEL_ROAM_RADIUS.Cube : (nm === 'Dock' ? SENTINEL_ROAM_RADIUS.Dock : SENTINEL_ROAM_RADIUS.default) }),
      yaw: 0, scanning: false, scanBaseYaw: 0, statusSprite: null,
      initialTransforms: _captureDroneNTransforms(model), baseQuat: group.quaternion.clone(), emitter,
      currentAction: null, dodging: false, dodgeDir: 0, maxDim,
    };
    mixer.addEventListener('finished', _onDroneNAnimationFinished);
    _resetDroneNModel(d, true);
    _droneRoster.push({ id: nm, d, health: DRONE_N_MAX_HP, dead: false, respawnT: 0, fireCd: 1.2, noRespawn: true });
  }
  console.log('[Sanctuaire] sentinelles de la base :', _droneRoster.length);
}

function _resetSentinels(visible) {
  for (const r of _droneRoster) {
    _resetDroneNModel(r.d, visible);
    r.d.group.position.copy(r.d.home); r.d.group.quaternion.copy(r.d.baseQuat);
    r.d.group.visible = visible;
    r.health = DRONE_N_MAX_HP; r.dead = false; r.respawnT = 0; r.fireCd = 1.2;
    if (r.d.statusSprite) r.d.statusSprite.visible = false;
  }
}

/**
 * Alarme : dès qu'un drone repère le joueur (ALERT / ENGAGE), les drones en patrouille dans un rayon de DRONE_N_ALARM_RADIUS viennent
 * fouiller le secteur (SEARCH à la dernière position connue). Les drones morts ou déjà en action ne sont pas touchés.
 */
let _droneAlarmT = 0;
function _shareDroneAlarm(dt) {
  _droneAlarmT -= dt;
  if (_droneAlarmT > 0) return;
  const all = [];
  if (_sanctuaryDroneN?.ai && !_droneNDead) all.push({ ai: _sanctuaryDroneN.ai, pos: _sanctuaryDroneN.group.position });
  for (const r of _droneRoster) if (!r.dead && r.d.ai && r.d.group) all.push({ ai: r.d.ai, pos: r.d.group.position });
  let raised = false;
  for (const a of all) {
    if ((a.ai.state !== DroneAI.AI_ALERT && a.ai.state !== DroneAI.AI_ENGAGE) || !a.ai.lastKnown) continue;
    for (const b of all) {
      if (b === a || DroneAI.horizontalDist(a.pos, b.pos) > DroneAI.DRONE_N_ALARM_RADIUS) continue;
      if (DroneAI.onAlarm(b.ai, a.ai.lastKnown)) raised = true;
    }
  }
  if (raised) _droneAlarmT = DRONE_N_ALARM_COOLDOWN;
}

function _updateAllDroneN(dt, passive = false) {
  _updateSanctuaryDroneN(dt, passive);                  // sentinelle d'origine (variables globales = elle)
  if (!_droneRoster.length) { if (active) _spawnBaseSentinels(); return; }
  if (!passive && active) _shareDroneAlarm(dt);         // un drone qui repère le joueur prévient ses voisins
  _droneLaserLock = true;                               // les balles ont déjà été avancées par la sentinelle d'origine
  try {
    for (const r of _droneRoster) {
      const g = r.d.group; if (!g) continue;
      if (!r.dead && r.d.ai.state === DroneAI.AI_PATROL && Math.hypot(g.position.x - playerPos.x, g.position.z - playerPos.z) > SENTINEL_ACTIVE_R) continue;
      _withCtx(r, () => {
        if (r.d.mixer) r.d.mixer.update(dt);
        _updateSanctuaryDroneN(dt, passive);
      });
    }
  } finally { _droneLaserLock = false; }
}

const DRONE_N_STATUS_COLORS = {
  PATROL: 0x38ddff,   // bleu : patrouille
  ALERT:  0xffd23a,   // jaune : intrus repéré
  ENGAGE: 0xff3b3b,   // rouge : tir
  SEARCH: 0xff9a3a,   // orange : recherche
};
const DRONE_N_STATUS_HEIGHT = 0.55;   // m au-dessus du drone
const DRONE_N_TOAST_GAP     = 5;      // s mini entre deux messages « intrus détecté »
const DRONE_N_SCAN_AMPLITUDE = 1.4;   // rad — amplitude du balayage (0,9 avant : il couvre plus d'angle)
const DRONE_N_BLOCK_CHECK   = 0.7;    // m — distance testée devant le drone avant d'avancer

let _droneNToastT = 0;
const _droneNMovePos  = new THREE.Vector3();
const _droneNAheadPos = new THREE.Vector3();
const _droneNEyePos   = new THREE.Vector3();

function _ensureDroneNStatus(d) {
  if (d.statusSprite || !M) return d.statusSprite;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _makeDroneNStatusTexture(), color: DRONE_N_STATUS_COLORS.PATROL,
    transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending,
    depthWrite: false, depthTest: false, toneMapped: false,
  }));
  sprite.name = 'droneN_status';
  sprite.scale.setScalar(0.28);
  sprite.renderOrder = 10;
  sprite.visible = false;
  M.scene.add(sprite);
  d.statusSprite = sprite;
  return sprite;
}

function _updateDroneNStatus(d, aiState) {
  const sprite = _ensureDroneNStatus(d);
  if (!sprite) return;
  sprite.visible = (active || _pilotHold) && !_droneNDead && d.group.visible;
  if (!sprite.visible) return;
  sprite.position.copy(d.group.position);
  sprite.position.y += DRONE_N_STATUS_HEIGHT;
  sprite.material.color.setHex(DRONE_N_STATUS_COLORS[aiState] ?? DRONE_N_STATUS_COLORS.PATROL);
  // Pulsation plus rapide à mesure que la menace augmente.
  const rate = aiState === 'ENGAGE' ? 14 : aiState === 'ALERT' ? 9 : 3;
  sprite.material.opacity = 0.65 + 0.3 * Math.sin(performance.now() * 0.001 * rate);
}

// Chemin dégagé devant le drone (colliders du sanctuaire) : évite de traverser un mur.
function _droneNPathClear(d, target) {
  _droneNEyePos.copy(d.group.position);
  const dx = target.x - _droneNEyePos.x;
  const dz = target.z - _droneNEyePos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-3) return true;
  const step = Math.min(len, DRONE_N_BLOCK_CHECK);
  _droneNAheadPos.set(_droneNEyePos.x + (dx / len) * step, _droneNEyePos.y, _droneNEyePos.z + (dz / len) * step);
  return _droneNLaserClear(_droneNEyePos, _droneNAheadPos);
}

/**
 * IA de la Sentinelle (voir drone-n-ai.js) : patrouille entre des waypoints,
 * repère le joueur (cône frontal + bruit de course), s'alerte, tire, puis le
 * cherche à sa dernière position connue avant de reprendre sa ronde.
 */
function _updateSanctuaryDroneN(dt, passive = false) {
  const d = _sanctuaryDroneN;
  if (!d?.baseQuat || !playerPos) return;

  if (_droneNDead) {
    _droneNRespawnT -= dt;
    _tickDroneNLaser(dt);
    if (_droneNRespawnT <= 0 && !_droneNNoRespawn) _respawnDroneN();
    return;
  }

  const g = d.group;
  _droneNToastT = Math.max(0, _droneNToastT - dt);

  // --- Perception ---
  const horizontalDist = DroneAI.horizontalDist(g.position, playerPos);
  let sensed = null;
  // En mode passif (le joueur pilote son drone), la Sentinelle patrouille sans percevoir ni tirer.
  if (!passive && active && horizontalDist <= DroneAI.DRONE_N_VIEW_RADIUS + 1e-3 && !isInsideMosque()) {
    _droneNShotTarget.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
    const lineClear = _droneNLaserClear(g.position, _droneNShotTarget);
    sensed = DroneAI.senses({
      dronePos: g.position, droneYaw: d.yaw, playerPos,
      playerRunning: _playerRunning && !_playerDying, playerMoving: _playerMoving && !_playerDying, lineClear,
    });
  }

  // --- Décision ---
  const out = DroneAI.stepAI(d.ai, dt, { sensed, playerPos, dronePos: g.position });
  if (out.changed && out.state === DroneAI.AI_ALERT && _droneNToastT <= 0) {
    _droneNToastT = DRONE_N_TOAST_GAP;
    window.GamepadKit?.toast?.('👁️ Sentinelle : intrus repéré');
  }

  // --- Déplacement (plan horizontal, hauteur constante) ---
  let desiredYaw = d.yaw;
  if (out.moveTarget) {
    if (_droneNPathClear(d, out.moveTarget)) {
      desiredYaw = DroneAI.yawTo(g.position, out.moveTarget);
      const dist = DroneAI.horizontalDist(g.position, out.moveTarget);
      const stepLen = Math.min(dist, out.moveSpeed * dt);
      if (dist > 1e-3) {
        _droneNMovePos.set(out.moveTarget.x - g.position.x, 0, out.moveTarget.z - g.position.z).multiplyScalar(stepLen / dist);
        g.position.add(_droneNMovePos);
      }
    } else if (d.ai.state === DroneAI.AI_PATROL) {
      DroneAI.skipWaypoint(d.ai);                                   // waypoint inaccessible : point suivant (ou nouveau tirage en patrouille libre)
    } else {
      d.ai.lastKnown = { x: g.position.x, y: g.position.y, z: g.position.z };   // bloqué : on cherche sur place
    }
  }
  if (out.faceTarget) desiredYaw = DroneAI.yawTo(g.position, out.faceTarget);
  if (out.scan) {
    if (!d.scanning) { d.scanning = true; d.scanBaseYaw = d.yaw; d.ai.scanPhase = 0; }
    d.ai.scanPhase += dt * DroneAI.DRONE_N_SCAN_SPEED;
    desiredYaw = d.scanBaseYaw + Math.sin(d.ai.scanPhase) * DRONE_N_SCAN_AMPLITUDE;
  } else {
    d.scanning = false;
  }

  // --- Orientation : lacet lissé appliqué à l'orientation de repos (qui garde son léger piqué) ---
  const k = 1 - Math.exp(-DRONE_N_TURN_SPEED * dt);
  d.yaw += DroneAI.angleDiff(d.yaw, desiredYaw) * k;
  _droneNYawQuat.setFromAxisAngle(_droneNYawAxis, d.yaw);
  g.quaternion.copy(d.baseQuat).premultiply(_droneNYawQuat);

  _updateDroneNStatus(d, out.state);
  _updateDroneNFiring(dt, out.mayFire);
  _tickDroneNLaser(dt);
}

/* ---------- Tirs laser du drone N (depuis Cylinder.001) ---------- */
function _makeDroneNStatusTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.00, 'rgba(255,255,255,1)');
  grad.addColorStop(0.30, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.60, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _makeDroneNFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0.00, 'rgba(255,255,240,1)');
  grad.addColorStop(0.25, 'rgba(255,214,130,0.95)');
  grad.addColorStop(0.60, 'rgba(255,140,40,0.45)');
  grad.addColorStop(1.00, 'rgba(255,90,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function _makeDroneNFlashSprite(name) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: _droneNLaser.tex, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true,
    toneMapped: false,
  }));
  sprite.name = name;
  sprite.visible = false;
  M.scene.add(sprite);
  return sprite;
}

function _ensureDroneNLaser() {
  if (_droneNLaser || !M) return _droneNLaser;

  _droneNLaser = {
    tex: _makeDroneNFlashTexture(),
    bullets: [],            // balles en vol { mesh, pos, dir, travelled }
    bulletPool: [],         // traînées inactives
    sparks: [],             // étincelles actives { sprite, vel, life }
    sparkPool: [],
    muzzle: null, impact: null,
    muzzleT: 0, impactT: 0,
  };
  const fx = _droneNLaser;
  fx.muzzle = _makeDroneNFlashSprite('droneN_muzzleFlash');
  fx.impact = _makeDroneNFlashSprite('droneN_bulletImpact');
  return fx;
}

// Traînée d'une balle traçante : cœur blanc-jaune et halo orangé (additif).
function _makeDroneNTracer() {
  const tracer = new THREE.Group();
  tracer.name = 'droneN_tracer';
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff1c8, transparent: true, opacity: 1, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.055, 1, 5, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xff9a2e, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
  tracer.add(glow, core);
  tracer.visible = false;
  M.scene.add(tracer);
  return tracer;
}

function _spawnDroneNSparks(point, normal) {
  const fx = _droneNLaser;
  if (!fx) return;
  for (let i = 0; i < DRONE_N_SPARK_COUNT; i++) {
    let sp = fx.sparkPool.pop();
    if (!sp) {
      if (fx.sparks.length >= DRONE_N_SPARK_POOL) break;
      sp = {
        sprite: _makeDroneNFlashSprite('droneN_spark'),
        vel: new THREE.Vector3(), life: 0,
      };
    }
    sp.sprite.position.copy(point);
    sp.vel.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(2.2).addScaledVector(normal, 1.5 + Math.random() * 2.5);
    sp.life = DRONE_N_SPARK_LIFE * (0.6 + Math.random() * 0.4);
    sp.sprite.scale.setScalar(0.07 + Math.random() * 0.05);
    sp.sprite.material.opacity = 1;
    sp.sprite.visible = true;
    fx.sparks.push(sp);
  }
}

function _droneNImpact(point, normal, hitPlayer) {
  const fx = _droneNLaser;
  if (!fx) return;
  fx.impact.position.copy(point);
  fx.impact.material.rotation = Math.random() * Math.PI * 2;
  fx.impact.scale.setScalar(hitPlayer ? 0.5 : 0.38);
  fx.impact.material.opacity = 1;
  fx.impact.visible = true;
  fx.impactT = DRONE_N_IMPACT_LIFE;
  _spawnDroneNSparks(point, normal);
}

// Coup de feu sec : claquement bruité + léger « thump » grave.
function _playDroneNShotSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_gadgetAudio) { _gadgetAudio = new AC(); window.GameAudio?.ctx(_gadgetAudio, 'effects'); }
    const ctx = _gadgetAudio;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;

    const len = Math.floor(ctx.sampleRate * 0.12);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.16, t);
    nGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    noise.connect(filter); filter.connect(nGain); nGain.connect(ctx.destination);
    noise.start(t);

    const thump = ctx.createOscillator();
    const tGain = ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(170, t);
    thump.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    tGain.gain.setValueAtTime(0.0001, t);
    tGain.gain.exponentialRampToValueAtTime(0.14, t + 0.004);
    tGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    thump.connect(tGain); tGain.connect(ctx.destination);
    thump.start(t);
    thump.stop(t + 0.11);
  } catch (_) {}
}

function _droneNLaserClear(origin, target) {
  if (!colliders || colliders.length === 0) return true;
  _droneNShotDir.copy(target).sub(origin);
  const dist = _droneNShotDir.length();
  if (dist < 0.2) return true;
  _droneNShotDir.multiplyScalar(1 / dist);
  _droneNLOSRay.set(origin, _droneNShotDir);
  _droneNLOSRay.near = 0.05;
  _droneNLOSRay.far = Math.max(0.05, dist - 0.15);
  return _droneNLOSRay.intersectObjects(colliders, false).length === 0;
}

function _updateDroneNFiring(dt, mayFire) {
  const d = _sanctuaryDroneN;
  if (!d) return;

  // Le drone ne tire qu'en état ENGAGE (joueur vu, délai de réaction écoulé).
  const canShoot = active && !_droneNDead && d.group.visible && mayFire;
  if (!canShoot) {
    _droneNFireCooldown = 0;   // prêt à tirer dès la prochaine entrée dans le rayon
    return;
  }

  // Pendant une esquive, le drone ne tire pas.
  if (d.dodging) {
    _droneNFireCooldown = Math.max(_droneNFireCooldown, 0.2);
    return;
  }

  _droneNFireCooldown -= dt;
  if (_droneNFireCooldown > 0) return;

  // Pas de tir à travers les murs du sanctuaire.
  if (isInsideMosque()) {
    _droneNFireCooldown = 0.2;
    return;
  }

  if (!d.emitter) {
    _droneNFireCooldown = 0.5;
    return;
  }

  d.emitter.getWorldPosition(_droneNMuzzlePos);
  _droneNShotTarget.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
  if (!_droneNLaserClear(_droneNMuzzlePos, _droneNShotTarget)) {
    _droneNFireCooldown = 0.2;
    return;
  }

  _fireDroneNLaser(d);
  _droneNFireCooldown = DRONE_N_FIRE_INTERVAL;
}

/* ---------- Points de vie du personnage face au drone N ---------- */
function _ensurePlayerHpHud() {
  let hud = document.getElementById('snPlayerHp');
  if (hud) return hud;
  hud = document.createElement('div');
  hud.id = 'snPlayerHp';
  hud.style.cssText = [
    'position:fixed', 'left:50%', 'bottom:22px', 'transform:translateX(-50%)',
    'width:min(240px,50vw)', 'pointer-events:none', 'z-index:60', 'display:none',
    'font:600 11px/1 system-ui,sans-serif', 'letter-spacing:.14em', 'color:#ffd9d2',
    'text-shadow:0 1px 3px rgba(0,0,0,.7)',
  ].join(';');
  hud.innerHTML =
    '<div style="margin-bottom:5px;text-align:center">INTÉGRITÉ</div>' +
    '<div style="height:8px;border-radius:4px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.25);overflow:hidden">' +
    '<i id="snPlayerHpFill" style="display:block;height:100%;width:100%;background:#ff5a45;transition:width .2s"></i></div>';
  document.body.appendChild(hud);

  const flash = document.createElement('div');
  flash.id = 'snHitFlash';
  flash.style.cssText = [
    'position:fixed', 'inset:0', 'pointer-events:none', 'z-index:59', 'opacity:0',
    'background:radial-gradient(ellipse at center, rgba(255,40,20,0) 45%, rgba(255,40,20,.75) 100%)',
  ].join(';');
  document.body.appendChild(flash);
  return hud;
}

function _updatePlayerHpHud() {
  const hud = _ensurePlayerHpHud();
  const show = active && state === S_FPS && (_playerHp < PLAYER_MAX_HP || _playerDying);
  hud.style.display = show ? 'block' : 'none';
  const fill = document.getElementById('snPlayerHpFill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, (_playerHp / PLAYER_MAX_HP) * 100))}%`;
}

function _flashPlayerHit() {
  const flash = document.getElementById('snHitFlash');
  if (!flash) return;
  flash.style.transition = 'none';
  flash.style.opacity = '0.9';
  void flash.offsetWidth;   // force le recalcul avant de lancer la transition de retour
  flash.style.transition = 'opacity .6s ease-out';
  flash.style.opacity = '0';
}

function _resetPlayerHealth() {
  _playerHp = PLAYER_MAX_HP;
  _playerSinceHit = 0;
  _playerRegenT = 0;
  _updatePlayerHpHud();
}

// Une balle du drone N touche le personnage : il perd un point de vie, et n'est
// neutralisé qu'à zéro.
/** Arc jaune du côté du tireur (Sahel Game) : `from` = origine du tir ; power 1 = touché, moins = balle qui frôle. */
function _indicateShotFrom(src, from, power) {
  if (!_hitInd) _hitInd = new HitIndicators();
  if (src._hitId == null) src._hitId = `dn${++_hitIdN}`;       // un même drone réutilise le même arc
  _hitInd.shotFrom(src._hitId, from, power);
}

function _damagePlayerByDroneN(amount) {
  if (_playerDying) return;
  _playerHp = Math.max(0, _playerHp - amount);
  _playerSinceHit = 0;
  _playerRegenT = 0;
  _flashPlayerHit();
  _triggerCameraShake(0.16, 0.05);
  if (performance.now() - (window.__hitRumbleT || 0) > 600) { window.__hitRumbleT = performance.now(); window.GamepadKit?.rumble?.(70, 0.35); }
  if (_playerHp <= 0) _neutralizePlayerByDroneN();
  _updatePlayerHpHud();
}

// Récupération progressive quand on n'est plus touché.
function _updatePlayerHealth(dt) {
  if (!active || _playerDying || _playerHp >= PLAYER_MAX_HP) return;
  _playerSinceHit += dt;
  if (_playerSinceHit < PLAYER_REGEN_DELAY) return;
  _playerRegenT += dt;
  if (_playerRegenT >= PLAYER_REGEN_STEP) {
    _playerRegenT = 0;
    _playerHp = Math.min(PLAYER_MAX_HP, _playerHp + 1);
    _updatePlayerHpHud();
  }
}

// Le personnage est touché : neutralisation et animation Dying.
function _neutralizePlayerByDroneN() {
  _playerDying = true;
  _aimMouseRight = false; _resetAim();
  _playerDieT = 0;
  _gadgetShooting = false;
  _gadgetShootAction = null;
  _gadgetTarget = null;
  _cancelShootLayer();
  joyInput.x = joyInput.y = 0;
  keys.w = keys.a = keys.s = keys.d = keys.shift = false;
  if (_playerActions.dying) {
    _playAction('dying', { once: true, fade: 0.1 });
  }
  window.GamepadKit?.rumble?.(150, 0.5);
  window.GamepadKit?.toast?.('☠️ Neutralisé par le drone hostile');
}

// Tire une balle traçante depuis la bouche du canon vers le torse du joueur,
// avec une légère dispersion : la balle voyage et peut rater si le joueur bouge.
function _fireDroneNLaser(d) {
  const fx = _ensureDroneNLaser();
  if (!fx || !d?.emitter) return;
  if (fx.bullets.length >= DRONE_N_BULLET_MAX) return;

  d.emitter.getWorldPosition(_droneNMuzzlePos);
  _droneNShotTarget.set(playerPos.x, playerPos.y - 0.35, playerPos.z);
  _droneNShotDir.copy(_droneNShotTarget).sub(_droneNMuzzlePos);
  const dist = _droneNShotDir.length();
  if (dist < 0.15) return;
  _droneNShotDir.multiplyScalar(1 / dist);
  _droneNShotDir.x += (Math.random() * 2 - 1) * DRONE_N_BULLET_SPREAD;
  _droneNShotDir.y += (Math.random() * 2 - 1) * DRONE_N_BULLET_SPREAD;
  _droneNShotDir.z += (Math.random() * 2 - 1) * DRONE_N_BULLET_SPREAD;
  _droneNShotDir.normalize();

  let mesh = fx.bulletPool.pop();
  if (!mesh) mesh = _makeDroneNTracer();
  const bullet = {
    mesh,
    pos: _droneNMuzzlePos.clone().addScaledVector(_droneNShotDir, 0.06),
    dir: _droneNShotDir.clone(),
    origin: _droneNMuzzlePos.clone(),                  // d'où part la balle : direction affichée par l'arc jaune
    src: fx,
    travelled: 0,
  };
  mesh.scale.set(1, DRONE_N_TRACER_LEN, 1);
  mesh.quaternion.setFromUnitVectors(_droneNUpAxis, bullet.dir);
  mesh.position.copy(bullet.pos).addScaledVector(bullet.dir, -DRONE_N_TRACER_LEN * 0.5);
  mesh.visible = true;
  fx.bullets.push(bullet);
  _droneNShotsFired++;

  fx.muzzle.position.copy(bullet.pos);
  fx.muzzle.material.rotation = Math.random() * Math.PI * 2;
  fx.muzzle.scale.setScalar(0.5);
  fx.muzzle.material.opacity = 1;
  fx.muzzle.visible = true;
  fx.muzzleT = DRONE_N_MUZZLE_LIFE;
  _playDroneNShotSound();
}

function _retireDroneNBullet(fx, index) {
  const bullet = fx.bullets[index];
  bullet.mesh.visible = false;
  fx.bulletPool.push(bullet.mesh);
  fx.bullets.splice(index, 1);
}

// Avance une balle d'un pas : touche le joueur, un obstacle, ou continue.
// Retourne false quand la balle doit disparaître.
function _stepDroneNBullet(fx, bullet, dt) {
  const step = DRONE_N_BULLET_SPEED * dt;

  // Obstacle le plus proche sur le segment parcouru pendant ce pas.
  let tObs = Infinity;
  if (colliders && colliders.length) {
    _droneNLOSRay.set(bullet.pos, bullet.dir);
    _droneNLOSRay.near = 0;
    _droneNLOSRay.far = step;
    const hit = _droneNLOSRay.intersectObjects(colliders, false)[0];
    if (hit) {
      tObs = hit.distance;
      _droneNBulletHit.copy(hit.point);
      if (hit.face) {
        _droneNBulletNormalMat.getNormalMatrix(hit.object.matrixWorld);
        _droneNBulletNorm.copy(hit.face.normal).applyMatrix3(_droneNBulletNormalMat).normalize();
        if (_droneNBulletNorm.dot(bullet.dir) > 0) _droneNBulletNorm.negate();
      } else {
        _droneNBulletNorm.copy(bullet.dir).negate();
      }
    }
  }

  // Joueur : trois points le long du corps ; la balle passe-t-elle à moins de DRONE_N_BULLET_RADIUS ?
  let tPlayer = Infinity, nearest = Infinity;
  if (!_playerDying && active && state === S_FPS) {
    for (const dy of [-0.2, -0.65, -1.1]) {
      _droneNPlayerPt.set(playerPos.x, playerPos.y + dy, playerPos.z).sub(bullet.pos);
      const t = Math.min(step, Math.max(0, _droneNPlayerPt.dot(bullet.dir)));
      _droneNBulletTmp.copy(bullet.dir).multiplyScalar(t);
      const dPt = _droneNBulletTmp.distanceTo(_droneNPlayerPt);
      if (dPt < nearest) nearest = dPt;
      if (dPt <= DRONE_N_BULLET_RADIUS) tPlayer = Math.min(tPlayer, t);
    }
    // balle qui frôle le joueur (moins de 1,6 m) : arc jaune plus discret, une seule fois par balle
    if (nearest < 1.6 && tPlayer === Infinity && !bullet.warned) { bullet.warned = true; _indicateShotFrom(bullet.src, bullet.origin, 0.55); }
  }

  if (tPlayer < tObs) {
    _droneNBulletHit.copy(bullet.pos).addScaledVector(bullet.dir, tPlayer);
    _droneNBulletNorm.copy(bullet.dir).negate();
    _droneNImpact(_droneNBulletHit, _droneNBulletNorm, true);
    _indicateShotFrom(bullet.src, bullet.origin, 1);      // touché : arc jaune plein
    _damagePlayerByDroneN(DRONE_N_BULLET_DAMAGE);
    return false;
  }
  if (tObs < Infinity) {
    _droneNImpact(_droneNBulletHit, _droneNBulletNorm, false);
    return false;
  }

  bullet.pos.addScaledVector(bullet.dir, step);
  bullet.travelled += step;
  if (bullet.travelled >= DRONE_N_BULLET_RANGE) return false;
  // La tête de la traînée est à bullet.pos, la queue derrière.
  bullet.mesh.position.copy(bullet.pos).addScaledVector(bullet.dir, -DRONE_N_TRACER_LEN * 0.5);
  return true;
}

function _tickDroneNLaser(dt) {
  if (_droneLaserLock) return;
  const fx = _droneNLaser;
  if (!fx) return;

  for (let i = fx.bullets.length - 1; i >= 0; i--) {
    if (!_stepDroneNBullet(fx, fx.bullets[i], dt)) _retireDroneNBullet(fx, i);
  }

  if (fx.muzzleT > 0) {
    fx.muzzleT = Math.max(0, fx.muzzleT - dt);
    const k = fx.muzzleT / DRONE_N_MUZZLE_LIFE;
    fx.muzzle.visible = k > 0;
    fx.muzzle.material.opacity = k;
    fx.muzzle.scale.setScalar(0.5 + (1 - k) * 0.3);
  } else if (fx.muzzle.visible) {
    fx.muzzle.visible = false;
  }

  if (fx.impactT > 0) {
    fx.impactT = Math.max(0, fx.impactT - dt);
    const k = fx.impactT / DRONE_N_IMPACT_LIFE;
    fx.impact.visible = k > 0;
    fx.impact.material.opacity = k;
    fx.impact.scale.setScalar(0.38 + (1 - k) * 0.5);
  } else if (fx.impact.visible) {
    fx.impact.visible = false;
  }

  for (let i = fx.sparks.length - 1; i >= 0; i--) {
    const sp = fx.sparks[i];
    sp.life -= dt;
    if (sp.life <= 0) {
      sp.sprite.visible = false;
      fx.sparkPool.push(sp);
      fx.sparks.splice(i, 1);
      continue;
    }
    sp.vel.y -= 7 * dt;
    sp.sprite.position.addScaledVector(sp.vel, dt);
    sp.sprite.material.opacity = Math.min(1, sp.life / (DRONE_N_SPARK_LIFE * 0.5));
  }
}

function _hideDroneNLaserFx() {
  _droneNFireCooldown = 0;
  if (_sanctuaryDroneN?.statusSprite) _sanctuaryDroneN.statusSprite.visible = false;
  for (const r of _droneRoster) if (r.d.statusSprite) r.d.statusSprite.visible = false;
  const fx = _droneNLaser;
  if (!fx) return;
  for (let i = fx.bullets.length - 1; i >= 0; i--) _retireDroneNBullet(fx, i);
  for (const sp of fx.sparks) { sp.sprite.visible = false; fx.sparkPool.push(sp); }
  fx.sparks.length = 0;
  fx.muzzleT = 0;
  fx.impactT = 0;
  fx.muzzle.visible = false;
  fx.impact.visible = false;
}

/* ========================================================= */
/* ---- Pilotage : personnage visible + retour L1/LB      ---- */
/* ========================================================= */
const DRONE_RETURN_SPEED  = 22;     // m/s — vitesse de croisière du retour
const DRONE_RETURN_PHASE2 = 1.05;   // s — approche finale vers le sac

function _enterPilotHold() {
  _aimMouseRight = false; _resetAim();
  active = false;
  state  = S_IDLE;
  _pilotHold = true;
  if (_gadgetNode) _gadgetNode.visible = false;
  _hideDroneNLaserFx();   // les balles en vol disparaissent ; le drone N reste visible
  _playerJumping  = false;
  _playerIdleTime = 0;
  _gadgetShooting = false;
  _gadgetShootAction = null;
  _gadgetTarget = null;
  _cancelShootLayer();
  joyInput.x = joyInput.y = 0;
  keys.w = keys.a = keys.s = keys.d = keys.shift = false;
  lookDragId = null;
  _camSnap = true;
  _velY = 0;

  // Le personnage reste visible : bras au niveau de la poitrine, tête baissée,
  // petite respiration (clip control_idle). Son mixer continue via pilotTick().
  if (_playerRoot) {
    _playerRoot.visible = true;
    _syncPlayerRoot();
    _playAction('control_idle', { fade: 0.28 });
  }

  hideHud();
  _stopWalk();
  _stopInsideSound();
  M.setGameUpdate(null);
  M.controls.enabled = false;
  // Les lumières du sanctuaire restent allumées pour éclairer le personnage.
}

/** Appelé par DroneGame.update() : entretient l'animation du personnage pendant le vol. */
function pilotTick(dt, dronePos) {
  if (!_pilotHold) return;
  // Le drone survole les zones : c'est lui qui déclenche les analyses.
  _droneScanPos = dronePos ? _droneScanVec.copy(dronePos) : null;
  _searchTomb(dt); _tickSilentScans();
  _updateFireworkFx(Math.min(dt, 0.05));
  // Le drone N reste visible et patrouille (sans tirer) pendant que le joueur pilote.
  if (_sanctuaryDroneN?.mixer) _sanctuaryDroneN.mixer.update(Math.min(dt, 0.05));
  _updateAllDroneN(Math.min(dt, 0.05), true);
  if (_playerMixer) _playerMixer.update(Math.min(dt, 0.05));
  if (_playerRoot) _syncPlayerRoot();
  if (pointLight) {
    pointLight.position.copy(playerPos);
    pointLight.position.y += 0.45;
  }
}

/** Sortie brutale du pilotage (B/START) : le drone ne revient pas, on masque le personnage. */
function endPilotHold() {
  if (!_pilotHold) return;
  _pilotHold = false;
  _droneScanPos = null;
  _droneReturn = null;
  if (_sanctuaryDroneN) _sanctuaryDroneN.group.visible = false;
  for (const r of _droneRoster) r.d.group.visible = false;
  _hideDroneNLaserFx();
  if (_playerMixer) _playerMixer.stopAllAction();
  _playerCurrentAction = '';
  if (_playerRoot) _playerRoot.visible = false;
  if (_dockedDrone) _attachDockedDrone();
  if (ambLight)   ambLight.visible = false;
  if (pointLight) pointLight.visible = false;
  _stopInsideSound();
}

/* Fondu de caméra au retour du drone : la caméra part de la vue du pilote et glisse vers la vue du personnage (plus de coupure). */
let _camBlendIn = null;
const CAM_BLEND_IN_DUR = 0.9;   // s
const _cbQ = new THREE.Quaternion();
function _applyCamBlendIn(dt) {
  const b = _camBlendIn; if (!b) return;
  b.t += dt;
  const u = Math.min(1, b.t / CAM_BLEND_IN_DUR), k = u * u * (3 - 2 * u);
  _cbQ.copy(M.camera.quaternion);
  M.camera.position.lerpVectors(b.pos, M.camera.position, k);
  M.camera.quaternion.slerpQuaternions(b.quat, _cbQ, k);
  const tf = M.camera.fov, f = b.fov + (tf - b.fov) * k;
  if (Math.abs(f - tf) > 0.01) { M.camera.fov = f; M.camera.updateProjectionMatrix(); }
  if (u >= 1) _camBlendIn = null;
}

/** Retour du drone vers le personnage (L1/LB pendant le pilotage). */
function returnDrone(pose) {
  if (!_pilotHold || !M || !pose || !pose.position) return false;
  _pilotHold = false;
  _droneScanPos = null;
  _droneReturn = null;
  active = true;
  state  = S_RETURN;
  _retireMainDrone();
  for (const r of _droneRoster) r.d.group.visible = !r.dead;
  _camSnap = true;
  _playerJumping  = false;
  _playerIdleTime = 0;

  if (_playerRoot) {
    _playerRoot.visible = true;
    _syncPlayerRoot();
    _playAction('control_idle', { fade: 0.2 });
  }
  hideHud();
  M.controls.enabled = false;
  document.querySelector('.mq-ui')?.classList.add('dg-hidden');
  if (ambLight)   ambLight.visible = true;
  if (pointLight) pointLight.visible = true;
  _camBlendIn = pose.cam ? { t: 0, pos: pose.cam.pos, quat: pose.cam.quat, fov: pose.cam.fov } : null;
  _updateThirdPersonCamera(0, true);

  const dd = _dockedDrone;
  if (!dd || !_playerModel) { _finishDroneReturn(); return true; }
  const g = dd.group;
  if (g.parent !== M.scene) M.scene.attach(g);
  g.visible = true;
  g.position.copy(pose.position);
  g.quaternion.copy(pose.quaternion);
  g.scale.copy(pose.scale);
  for (const d of dd.discs) d.node.scale.copy(d.base);

  _playerModel.updateMatrixWorld(true);
  const anchor = _playerModel.getObjectByName('DroneLandingPad');
  if (!anchor) { _finishDroneReturn(); return true; }
  const aPos   = new THREE.Vector3().setFromMatrixPosition(anchor.matrixWorld);
  const aQuat  = new THREE.Quaternion().setFromRotationMatrix(anchor.matrixWorld);
  const aScale = new THREE.Vector3().setFromMatrixScale(anchor.matrixWorld);
  const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(aQuat).normalize();
  const dockPos   = aPos.clone().addScaledVector(normal, DRONE_DOCK_Z * aScale.y);
  const dockQuat  = aQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), DRONE_DOCK_YAW));   // même retournement que _attachDockedDrone
  const dockScale = DRONE_DOCK_SCALE * aScale.x;
  const approach  = dockPos.clone().addScaledVector(normal, 1.6).add(new THREE.Vector3(0, 0.9, 0));
  const qLevel    = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(0, playerYaw - Math.PI / 2, 0, 'YXZ')
  );

  const dist = pose.position.distanceTo(approach);
  _droneReturn = {
    t: 0,
    dur1: Math.min(3.0, Math.max(1.1, dist / DRONE_RETURN_SPEED)),
    dur2: DRONE_RETURN_PHASE2,
    fromPos:   pose.position.clone(),
    fromQuat:  pose.quaternion.clone(),
    fromScale: pose.scale.clone(),
    approach, dockPos, dockQuat, dockScale, qLevel,
    dockScaleVec: new THREE.Vector3(dockScale, dockScale, dockScale),
    armsLowered: false,
  };
  M.setGameUpdate(update);
  return true;
}

function _tickDroneReturn(dt) {
  const r = _droneReturn;
  if (!r) { _finishDroneReturn(); return; }
  r.t += dt;
  const dd = _dockedDrone;
  const g  = dd && dd.group;
  if (!g) { _finishDroneReturn(); return; }

  const total = r.dur1 + r.dur2;
  const uAll  = Math.min(1, r.t / total);

  if (r.t < r.dur1) {
    const u = Math.min(1, r.t / r.dur1);
    const k = u * u * (3 - 2 * u);                    // smoothstep
    g.position.lerpVectors(r.fromPos, r.approach, k);
    g.position.y += Math.sin(Math.PI * k) * 0.25;     // léger arc ascendant
    g.quaternion.slerpQuaternions(r.fromQuat, r.qLevel, k);
  } else {
    const u = Math.min(1, (r.t - r.dur1) / r.dur2);
    const k = 1 - Math.pow(1 - u, 3);                 // ease-out
    g.position.lerpVectors(r.approach, r.dockPos, k);
    g.quaternion.slerpQuaternions(r.qLevel, r.dockQuat, k);
    const kd = Math.max(0.0001, 1 - k);
    for (const d of dd.discs) d.node.scale.copy(d.base).multiplyScalar(kd);
    if (u > 0.55 && !r.armsLowered) {
      r.armsLowered = true;
      _playAction('idle', { fade: 0.35 });            // il baisse les bras quand le drone arrive
    }
  }
  g.scale.lerpVectors(r.fromScale, r.dockScaleVec, uAll);

  if (_playerMixer) _playerMixer.update(dt);
  _updateThirdPersonCamera(dt);
  _applyCamBlendIn(dt);
  if (pointLight) {
    pointLight.position.copy(playerPos);
    pointLight.position.y += 0.45;
  }
  if (r.t >= total) _finishDroneReturn();
}

function _finishDroneReturn() {
  _droneReturn = null; _camBlendIn = null;
  if (_dockedDrone) _attachDockedDrone();
  state = S_FPS;
  _camDistView = _camDist;
  _playerIdleTime = 0;
  _playAction('idle');
  showHud();
  _syncInsideSound(isInsideMosque());
  if (M) M.setGameUpdate(update);
  window.GamepadKit?.toast?.('✅ Drone revenu sur le sac');
}

/* ---------- Caméra 3e personne : position désirée + collision ---------- */
/** Position de la caméra de visée : décalage fixe (caméra Blender) depuis les pieds, tourné comme le corps visé. */
function _aimCameraPosition(out) {
  const head = _aimHeadBone();
  const sc = _playerModel ? _playerModel.scale.x : 1;
  if (head) {
    // Tête (os) APRÈS le tangage : la caméra est rigide avec le haut du corps.
    head.updateWorldMatrix(true, false); head.getWorldPosition(_tmpHead);
    const yawB = cameraYaw + _aimBodyYaw();
    const o = Aim.aimOffsetFromHead(yawB, sc), t = Aim.aimTrimOffset(yawB, sc);
    _aimOffset.set(o.x + t.x, o.y + t.y, o.z + t.z).applyQuaternion(_aimPitchQuat(_aimAppliedTheta, _aimQR));
    return out.copy(_tmpHead).add(_aimOffset);
  }
  const off = Aim.aimCameraOffset(cameraYaw + _aimBodyYaw(), sc);
  out.set(playerPos.x + off.x, playerPos.y - EYE_HEIGHT + off.y, playerPos.z + off.z);
  return out;
}

function _computeDesiredCamera(out, dt = 0) {
  _camTarget.copy(playerPos);
  _camTarget.y -= 0.1;

  const cp = Math.cos(playerPitch);
  _camDir.set(Math.sin(cameraYaw) * cp, Math.sin(playerPitch), Math.cos(cameraYaw) * cp);
  // Par-dessus l'épaule (réglages de camera-rig.js) : la caméra est décalée vers la droite de l'écran, un peu plus haut ou plus bas
  // selon la pose, et regarde droit devant elle ; le personnage apparaît donc un peu à gauche. R = droite écran = (-cos, 0, sin).
  const rig = _camRig.cur;
  _camShoulder.copy(_camTarget);
  _camShoulder.x += -Math.cos(cameraYaw) * rig.side;
  _camShoulder.z += Math.sin(cameraYaw) * rig.side;
  _camShoulder.y += rig.up;
  _camLookRig.copy(_camShoulder).addScaledVector(_camDir, Math.max(rig.ahead, 0.001));
  out.copy(_camShoulder).addScaledVector(_camDir, -_camDistView * rig.distK);

  // Visée : la caméra glisse jusqu'aux yeux du personnage.
  if (_aimBlend > 0) {
    _aimCameraPosition(_aimEye);
    out.lerp(_aimEye, _aimBlend);
  }
  // Lunette : la caméra glisse à côté de la tête, au niveau de l'épaule droite (position de Cam_Sniper dans Sahel Game).
  if (_sniperBlend > 0) {
    _sniperGround.set(playerPos.x, playerPos.y - EYE_HEIGHT, playerPos.z);
    const sp = Sniper.sniperCameraPosition(_sniperGround, cameraYaw, playerPitch);
    _sniperPos.set(sp.x, sp.y, sp.z);
    out.lerp(_sniperPos, _sniperBlend);
  }

  // Ne jamais traverser un mur / pilier entre la tête et la caméra.
  if (colliders && colliders.length) {
    _camOffset.copy(out).sub(_camTarget);
    const want = _camOffset.length();
    if (want > 0.001) {
      _camOffset.multiplyScalar(1 / want);
      _camRay.set(_camTarget, _camOffset);
      _camRay.far = want;
      // la voiture (colliders « Voiture_Collider_* ») ne repousse pas la caméra : sinon, debout contre la portière, elle se colle dans le personnage
      const hits = _camRay.intersectObjects(colliders, false).filter((h) => !/^Voiture_Collider/.test(h.object.name));
      if (hits.length) {
        const d = Math.max(0.35, hits[0].distance - 0.22);
        out.copy(_camTarget).addScaledVector(_camOffset, d);
      }
    }
  }

  // Ne pas passer sous la surface de l'eau quand le joueur patauge ou nage.
  if (_waterSurf !== null) out.y = Math.max(out.y, _waterSurf + 0.3);
  // Ne pas passer sous le sol.
  out.y = Math.max(out.y, playerPos.y - EYE_HEIGHT + 0.35);
  return out;
}

function _refreshApproachEnd() {
  _camRig.snap(_rigState());
  _computeDesiredCamera(animCamEnd);
  _camMat.lookAt(animCamEnd, _camLookRig, _up);
  animQuatEnd.setFromRotationMatrix(_camMat);
}

function _triggerCameraShake(duration, amplitude) {
  if (window.GameSettings && window.GameSettings.reduceShake) return;      // Options › Réduire les secousses de la caméra
  _camShakeDuration = Math.max(_camShakeDuration, duration);
  _camShakeTime = Math.max(_camShakeTime, duration);
  _camShakeAmp = Math.max(_camShakeAmp, amplitude);
}

function _applyCameraShake(dt) {
  if (_camShakeTime <= 0 || !M?.camera) return;
  _camShakeTime = Math.max(0, _camShakeTime - dt);
  const k = _camShakeDuration > 0 ? _camShakeTime / _camShakeDuration : 0;
  const amp = _camShakeAmp * k * k;
  M.camera.position.x += (Math.random() - 0.5) * amp * 2;
  M.camera.position.y += (Math.random() - 0.5) * amp * 2;
  M.camera.position.z += (Math.random() - 0.5) * amp * 2;
  M.camera.rotation.z += (Math.random() - 0.5) * amp * 0.35;
  if (_camShakeTime <= 0) {
    _camShakeAmp = 0;
    _camShakeDuration = 0;
  }
}

function _updateThirdPersonCamera(dt, snap = false) {
  // Zoom fluide pendant le tir hors visée : la caméra se rapproche du
  // personnage, puis revient doucement à la distance choisie par le joueur.
  const targetDist = _gadgetShooting
    ? Math.min(_camDist, PLAYER_CAM_SHOOT_DIST)
    : _camDist;
  const zoomK = 1 - Math.exp(-PLAYER_CAM_ZOOM_SPEED * dt);
  _camDistView += (targetDist - _camDistView) * zoomK;

  // Fondu 3e personne <-> caméra aux yeux : position, FOV et tête suivent _aimBlend.
  const poseTarget = _playerKneeling ? 1 : 0;
  _aimPoseMix = (snap || dt <= 0) ? poseTarget : Aim.approach(_aimPoseMix, poseTarget, Aim.AIM_POSE_SPEED, dt);
  if (Math.abs(_aimPoseMix - poseTarget) < 0.002) _aimPoseMix = poseTarget;
  const blendTarget = _aiming ? 1 : 0;
  _aimBlend = snap ? blendTarget : Aim.approach(_aimBlend, blendTarget, Aim.AIM_BLEND_SPEED, dt);
  if (Math.abs(_aimBlend - blendTarget) < 0.002) _aimBlend = blendTarget;
  // Lunette (mode tireur d'élite) : même lissage que la visée ; le zoom, le réticule et la vignette suivent _sniperBlend.
  const sniperTarget = (_sniper && _aiming) ? 1 : 0;
  _sniperBlend = snap ? sniperTarget : Aim.approach(_sniperBlend, sniperTarget, Aim.AIM_BLEND_SPEED, dt);
  if (Math.abs(_sniperBlend - sniperTarget) < 0.002) _sniperBlend = sniperTarget;
  { const sc = document.getElementById('snScope'); if (sc) sc.style.opacity = String(_sniperBlend);
    const ret = document.getElementById('snAimReticle'); if (ret) ret.style.transform = `translate(-50%,-50%) scale(${1 - 0.3 * _sniperBlend})`; }
  // En lunette la tête RESTE visible (la caméra est à côté, à l'épaule, comme dans Sahel Game) : le fondu de la tête s'annule avec _sniperBlend.
  _headFade?.setFade(_headFadeForce ?? Aim.headFade(_aimBlend) * (1 - _sniperBlend));
  if (_aiming && _aimBlend < 1) playerPitch = Aim.approach(playerPitch, _aimPose().pitch0, Aim.AIM_BLEND_SPEED, dt);
  else if (!_aiming && _aimBlend > 0 && _aimSavedPitch !== null) playerPitch = Aim.approach(playerPitch, _aimSavedPitch, Aim.AIM_BLEND_SPEED, dt);
  if (!_aiming && _aimBlend === 0) _aimSavedPitch = null;
  if (_baseFov !== null) {
    const fov = Sniper.sniperFov(Aim.aimFov(_baseFov, _aimBlend, M.camera.aspect), _sniperBlend, M.camera.aspect);   // 25° en lunette (Cam_Sniper)
    const near = _baseNear !== null ? Aim.aimNear(_baseNear, _aimBlend) : M.camera.near;
    const fovChanged = Math.abs(M.camera.fov - fov) > 0.01;
    const nearChanged = Math.abs(M.camera.near - near) > 1e-5;
    if (fovChanged || nearChanged) {
      if (fovChanged) M.camera.fov = fov;
      if (nearChanged) M.camera.near = near;
      M.camera.updateProjectionMatrix();
    }
  }

  if (snap || _camSnap) _camRig.snap(_rigState());      // téléportation, entrée dans le jeu : pas de glissement de l'épaule
  else _camRig.update(dt, _rigState());
  _computeDesiredCamera(_camDesired, dt);
  if (snap || _camSnap) {
    M.camera.position.copy(_camDesired);
    _camSnap = false;
  } else {
    const k = 1 - Math.exp(-PLAYER_CAM_SMOOTH * dt);
    M.camera.position.lerp(_camDesired, k);
  }

  // Regard : vers le joueur en 3e personne, droit devant (axe du réticule) en visée.
  _aimLook.copy(M.camera.position).addScaledVector(_camDir, 8);
  _camLookAt.copy(_camLookRig).lerp(_aimLook, _aimBlend);
  // Lunette : comme Sahel Game, la caméra regarde le point `look` de son preset (≈ 13,6° à gauche et 6,7° sous l'axe du corps),
  // ce qui laisse la tête et l'arme visibles sur le côté de l'image ; le canon est calé sur le réticule au centre (_applyAimIK).
  if (_sniperBlend > 0) {
    const lt = Sniper.sniperLookTarget(_sniperGround, cameraYaw, playerPitch);
    _sniperLook.set(lt.x, lt.y, lt.z);
    _camLookAt.lerp(_sniperLook, _sniperBlend);
  }
  M.camera.lookAt(_camLookAt);
  M.camera.updateMatrixWorld();
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

/* ---------- Vidéo (🎥) — enregistre le canvas du sanctuaire ---------- */
let _recorder  = null;
let _recChunks = [];

function toggleRecord() {
  if (_recorder) {                        // arrêt → téléchargement (voir onstop)
    try { _recorder.stop(); } catch (_) {}
    return;
  }
  if (typeof MediaRecorder === 'undefined' || !M.renderer.domElement.captureStream) {
    window.GamepadKit?.toast?.('🎥 Enregistrement vidéo non disponible sur ce navigateur');
    return;
  }
  const stream = M.renderer.domElement.captureStream(30);
  _recChunks = [];
  _recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  _recorder.ondataavailable = (e) => { if (e.data.size) _recChunks.push(e.data); };
  _recorder.onstop = () => {
    const blob = new Blob(_recChunks, { type: 'video/webm' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'djenne-sanctuaire.webm';
    a.click();
    document.getElementById('snVideo')?.classList.remove('is-active');
    _recorder = null;
    window.GamepadKit?.toast?.('🎥 Vidéo enregistrée');
  };
  _recorder.start();
  document.getElementById('snVideo')?.classList.add('is-active');
  window.GamepadKit?.toast?.('🎥 Enregistrement en cours…');
}

function _initControls() {
  if (_controlsInited) return;
  _controlsInited = true;
  // T = tireur d'élite. Écouteur en phase de capture pour passer avant « T = relire le dernier appel » de Tapama, mais seulement
  // quand l'arme est débloquée et que le jeu est en cours ; sinon T garde son rôle habituel.
  window.addEventListener('keydown', (e) => {
    if ((e.key || '').toLowerCase() !== 't' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (state !== S_FPS || window.__storyFreeze || !_gadgetUnlocked() || _inVehicle() || _swimming) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '')) return;
    _toggleSniper();
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (state !== S_FPS || window.__storyFreeze) return;       // labo / dossier ouverts : Échap, F, X… ne doivent pas atteindre le jeu
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'w' || k === 'arrowup')    { keys.w = true;  e.preventDefault(); }
    if (k === 's' || k === 'arrowdown')               { keys.s = true;  e.preventDefault(); }
    if (k === 'q' || k === 'a' || k === 'arrowleft')  { keys.a = true;  e.preventDefault(); }
    if (k === 'd' || k === 'arrowright')              { keys.d = true;  e.preventDefault(); }
    if (k === 'shift')                                 keys.shift = true;
    if (k === 'x')                                     { if (!e.repeat) _tryJump(); e.preventDefault(); }
    if (k === 'r')                                     { if (!e.repeat && !_droneTakeoff && !_inVehicle() && !_sanctuaryMenuOpen()) _startDroneTakeoff(); e.preventDefault(); }      // R = lancer le drone (clavier) : c'est le joueur qui décide, rien ne décolle tout seul
    if (k === 'k')                                     { if (!e.repeat) _toggleKneeling(); e.preventDefault(); }
    if (k === 'f')                                     { if (!e.repeat && !window.__vehicleBusy) _startGadgetShot(false); e.preventDefault(); }      // F = tir, sauf près de la voiture (monter / descendre)
    if (k === 'v')                                     { if (!e.repeat) _startGadgetShot(true); e.preventDefault(); }
    if (k === 'escape') exit();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'w' || k === 'arrowup')    keys.w = false;
    if (k === 's' || k === 'arrowdown')               keys.s = false;
    if (k === 'q' || k === 'a' || k === 'arrowleft')  keys.a = false;
    if (k === 'd' || k === 'arrowright')              keys.d = false;
    if (k === 'shift')                                 keys.shift = false;
  });
  window.addEventListener('blur', () => {
    keys.w = keys.a = keys.s = keys.d = keys.shift = false;
    _aimMouseRight = false;
  });
  window.addEventListener('mousedown', (e) => {
    if (state !== S_FPS || window.__storyFreeze) return;
    if (e.button === 2) _aimMouseRight = true;
    // Tir au clic gauche pendant que le clic droit est maintenu : le navigateur ne
    // génère pas de pointerdown pour un 2e bouton, donc on tire ici.
    if (e.button === 0 && _aimMouseRight) _startGadgetShot(false);
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) _aimMouseRight = false;
  });
  window.addEventListener('contextmenu', (e) => {
    if (state !== S_FPS) return;
    e.preventDefault();   // empêche le menu contextuel quand on vise
  });
  makeStick(joystick, (x, y) => {
    joyInput.x = x; joyInput.y = y;
  });
  btnQuit?.addEventListener('click', exit);
  document.getElementById('snVideo')?.addEventListener('click', toggleRecord);

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
  poiPanel?.querySelector('button[data-sn-action="quit"]')?.addEventListener('click', () => {
    poiPanel.hidden = true;
    exit();
  });

  btnPhoto?.addEventListener('click', () => {
    M.renderer.render(M.scene, M.camera);
    const url = M.renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a'); a.href = url; a.download = 'djenne-sanctuaire.png'; a.click();
    _missionEvent('photo', { x: playerPos.x, y: playerPos.y, z: playerPos.z });
  });

  btnFire?.addEventListener('click', (e) => {
    e.preventDefault();
    _startGadgetShot(false);
  });
  btnFireSide?.addEventListener('click', (e) => {
    e.preventDefault();
    _startGadgetShot(true);
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

const PORTAL_RADIUS       = 1.8;   // distance de déclenchement = rayon du cercle doré (unités scène)
const PORTAL_COOLDOWN_SEC = 2.5;   // délai anti-rebond après téléport

/* Vidéo de transition A <-> B (place ton fichier dans assets/videos/) */

let _portalCooldown = 0;
let _portalHold     = null;   // arrivée du dernier portail : à quitter avant de re-déclencher

/* ---------- Overlay vidéo de transition ---------- */
let _portalVideoOverlay = null;
let _portalVideoPending = null;   // { dest: Vector3, type: 'roof'|'floor' }

/* Transition du portail : GIF animé (assets/videos/transition portail jour.gif). Un GIF n'envoie pas d'événement « fin » : sa durée est lue
   dans le fichier (somme des délais des images) puis la téléportation a lieu à la fin. Il est rejoué à chaque passage (nouvelle URL blob). */
const PORTAL_GIF_URL = 'assets/videos/transition portail jour.gif?v=1';
let _portalGif = null;          // { bytes: ArrayBuffer, ms }
let _portalGifTimer = 0;
let _portalImgEl = null;

function _gifDurationMs(buf) {          // lit les blocs du GIF (pas de recherche d'octets : les données d'image peuvent contenir 21 F9)
  const d = new Uint8Array(buf); let i = 13, total = 0;
  if (d[10] & 0x80) i += 3 << ((d[10] & 7) + 1);
  while (i < d.length) {
    const b = d[i];
    if (b === 0x21) {
      if (d[i + 1] === 0xF9) { const t = d[i + 4] | (d[i + 5] << 8); total += (t < 2 ? 10 : t) * 10; }
      i += 2; while (i < d.length && d[i] !== 0) i += d[i] + 1; i++;
    } else if (b === 0x2C) {
      const fl = d[i + 9]; i += 10; if (fl & 0x80) i += 3 << ((fl & 7) + 1);
      i++; while (i < d.length && d[i] !== 0) i += d[i] + 1; i++;
    } else break;
  }
  return total;
}

function _ensurePortalVideo() {
  if (_portalVideoOverlay) return;
  const overlay = document.createElement('div');
  overlay.id = 'portalTransition';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:99999','background:#000',
    'display:flex','align-items:center','justify-content:center',
    'visibility:hidden','opacity:0','transition:opacity .3s ease'
  ].join(';');
  const img = document.createElement('img');
  img.id = 'portalTransitionGif'; img.alt = ''; img.draggable = false;
  img.style.cssText = 'width:100vw;height:100vh;object-fit:cover;background:#000;';
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  _portalVideoOverlay = overlay;
  _portalImgEl = img;
}

function _showPortalVideo(dest, type) {
  _ensurePortalVideo();
  _portalVideoPending = { dest: dest.clone(), type };
  const play = () => {
    const ms = Math.max(800, Math.min(9000, _portalGif.ms || 2500));
    const url = URL.createObjectURL(new Blob([_portalGif.bytes], { type: 'image/gif' }));
    _portalImgEl.onload = () => { if (_portalImgEl.dataset.blob === url) URL.revokeObjectURL(url); };
    _portalImgEl.dataset.blob = url; _portalImgEl.src = url;                    // nouvelle URL : le GIF repart de la première image
    _portalVideoOverlay.style.visibility = 'visible';
    requestAnimationFrame(() => { _portalVideoOverlay.style.opacity = '1'; });
    clearTimeout(_portalGifTimer); _portalGifTimer = setTimeout(_onPortalVideoEnd, ms);
  };
  if (_portalGif) { play(); return; }
  fetch(PORTAL_GIF_URL).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
    .then((bytes) => { _portalGif = { bytes, ms: _gifDurationMs(bytes) }; play(); })
    .catch((e) => { console.warn('[Portail] transition indisponible :', e); _onPortalVideoEnd(); });
}

function _onPortalVideoEnd() {
  if (!_portalVideoOverlay) return;
  clearTimeout(_portalGifTimer); _portalGifTimer = 0;
  _portalVideoOverlay.style.opacity = '0';
  setTimeout(() => {
    _portalVideoOverlay.style.visibility = 'hidden';
    if (_portalImgEl) _portalImgEl.removeAttribute('src');
    if (_portalVideoPending) {
      playerPos.copy(_portalVideoPending.dest);
      _portalCooldown = PORTAL_COOLDOWN_SEC;
      _portalHold = { x: _portalVideoPending.dest.x, z: _portalVideoPending.dest.z };
      _afterTeleport();
      _teleportFlash();
      if (_portalVideoPending.type === 'roof') _missionEvent('portal', 'roof');
      else                                        _missionEvent('portal', 'floor');
      _portalVideoPending = null;
    }
  }, 300);
}

function _teleportFlash() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:#f9d58b;opacity:0;pointer-events:none;z-index:9999;transition:opacity .12s ease';
  document.body.appendChild(flash);
  requestAnimationFrame(() => { flash.style.opacity = '0.65'; });
  setTimeout(() => { flash.style.opacity = '0'; setTimeout(() => flash.remove(), 180); }, 130);
}

function _afterTeleport() {
  cameraYaw   = playerYaw;
  playerPitch = PLAYER_CAM_PITCH0;
  _camDistView = _camDist;
  _velY = 0;
  _playerJumping = false;
  _playerIdleTime = 0;
  _camSnap = true;
  _syncPlayerRoot();
}

function tickPortals(dt) {
  if (_portalCooldown > 0) _portalCooldown -= dt;

  /* Anti-rebond : tant qu'on n'a pas quitté le point d'arrivée du dernier
     passage, aucun portail ne se déclenche (fini l'aller-retour automatique). */
  if (_portalHold) {
    const hx = playerPos.x - _portalHold.x;
    const hz = playerPos.z - _portalHold.z;
    if (Math.sqrt(hx * hx + hz * hz) > PORTAL_RADIUS * 2) _portalHold = null;
    else return;
  }
  if (_portalCooldown > 0) return;

  const ax = playerPos.x - PORTAL_A_TRIGGER.x;
  const az = playerPos.z - PORTAL_A_TRIGGER.z;
  if (Math.sqrt(ax * ax + az * az) < PORTAL_RADIUS) {
    // plus de vidéo de transition : téléportation immédiate (comme le retour toit → bas), avec le même éclair doré
    playerPos.copy(PORTAL_A_DEST);
    _portalCooldown = PORTAL_COOLDOWN_SEC;
    _portalHold = { x: PORTAL_A_DEST.x, z: PORTAL_A_DEST.z };
    _afterTeleport();
    _teleportFlash();
    _missionEvent('portal', 'roof');
    return;
  }

  const bx = playerPos.x - PORTAL_B_TRIGGER.x;
  const bz = playerPos.z - PORTAL_B_TRIGGER.z;
  if (Math.sqrt(bx * bx + bz * bz) < PORTAL_RADIUS) {
    // Pas de vidéo au retour (toit → bas) : téléportation instantanée
    playerPos.copy(PORTAL_B_DEST);
    _portalCooldown = PORTAL_COOLDOWN_SEC;
    _portalHold = { x: PORTAL_B_DEST.x, z: PORTAL_B_DEST.z };
    _afterTeleport();
    _teleportFlash();
    _missionEvent('portal', 'floor');
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
  cameraYaw       = lieu.yaw;
  playerPitch     = PLAYER_CAM_PITCH0;
  _camDistView    = _camDist;
  _velY           = 0;
  _playerJumping  = false;
  _playerIdleTime = 0;
  _camSnap        = true;
  _syncPlayerRoot();
  _updateThirdPersonCamera(0, true);
  _missionEvent('visit', id);
}

/* ---------- Réticule de visée + FOV zoom ---------- */
function _ensureAimReticle(){
  if (document.getElementById('snAimReticle')) return;
  const reticle = document.createElement('div');
  reticle.id = 'snAimReticle';
  reticle.style.cssText = [
    'position:fixed','left:50%','top:50%','transform:translate(-50%,-50%)',
    'width:96px','height:96px','pointer-events:none','z-index:60',
    'display:none'
  ].join(';');
  reticle.innerHTML = `
    <div style="position:absolute;inset:0;border:3px solid rgba(249,213,139,.7);border-radius:50%;box-shadow:0 0 20px rgba(249,213,139,.5);"></div>
    <div style="position:absolute;left:50%;top:50%;width:3px;height:30px;background:rgba(249,213,139,1);transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:30px;height:3px;background:rgba(249,213,139,1);transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:2px;height:16px;background:#fff;transform:translate(-50%,-50%);"></div>
    <div style="position:absolute;left:50%;top:50%;width:16px;height:2px;background:#fff;transform:translate(-50%,-50%);"></div>
  `;
  document.body.appendChild(reticle);
  const scope = document.createElement('div');       // vignette de lunette : bords sombres, visible seulement en mode tireur d'élite
  scope.id = 'snScope';
  scope.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:59;opacity:0;' +
    'background:radial-gradient(circle at 50% 50%, rgba(0,0,0,0) 34%, rgba(24,12,6,.5) 72%, rgba(10,5,2,.88) 100%)';
  document.body.appendChild(scope);
}

/**
 * Point désigné par le réticule : rayon du centre de l'écran contre le décor
 * (BVH), portée AIM_RANGE. Indique aussi si le réticule est sur le drone ennemi.
 */
function _updateAimPoint() {
  if (!_aiming || _aimBlend < 0.5) {
    if (_aimLocked) _setAimLock(false);
    return;
  }
  _aimRay.setFromCamera(_aimNdc, M.camera);
  _aimRay.near = 0.05;
  _aimRay.far = Aim.AIM_RANGE;
  const hits = (colliders && colliders.length) ? _aimRay.intersectObjects(colliders, false) : [];
  if (hits.length) _aimPoint.copy(hits[0].point);
  else _aimPoint.copy(_aimRay.ray.origin).addScaledVector(_aimRay.ray.direction, Aim.AIM_RANGE);

  let lock = false;
  for (const c of _liveDrones([])) {
    c.d.group.getWorldPosition(_aimDronePos);
    _aimDronePos.y += 0.15;
    if (Aim.segmentHitsSphere(_aimRay.ray.origin, _aimPoint, _aimDronePos, Aim.aimHitRadius(window.GameSettings?.aimAssist))) { lock = true; break; }
  }
  if (lock !== _aimLocked) _setAimLock(lock);
}

/**
 * Tir en visée : de la bouche du gadget vers le point visé, arrêté par le premier
 * obstacle. Le drone n'est touché que si ce trajet le traverse réellement.
 */
function _fireBulletShot(useReticle) {
  _muzzleDirection(_muzzleDir);
  if (useReticle) _bulletEnd.copy(_aimPoint);
  else _bulletEnd.copy(_gadgetOrigin).addScaledVector(_muzzleDir, Aim.AIM_RANGE);
  _gadgetDir.copy(_bulletEnd).sub(_gadgetOrigin);
  const dist = _gadgetDir.length();
  _aimSegEnd.copy(_bulletEnd);
  if (dist > 0.05) {
    _gadgetDir.multiplyScalar(1 / dist);
    if (colliders && colliders.length) {
      _gadgetRay.set(_gadgetOrigin, _gadgetDir);
      _gadgetRay.near = 0.05;
      _gadgetRay.far = dist;
      const wallHits = _gadgetRay.intersectObjects(colliders, false);
      if (wallHits.length) _aimSegEnd.copy(wallHits[0].point);
    }
  }

  let hit = false, hitCtx = null, bestD = Infinity;
  for (const c of _liveDrones([])) {
    c.d.group.getWorldPosition(_tgtTmp);
    _tgtTmp.y += 0.15;
    if (!Aim.segmentHitsSphere(_gadgetOrigin, _aimSegEnd, _tgtTmp, Aim.aimHitRadius(window.GameSettings?.aimAssist))) continue;
    const dd = _gadgetOrigin.distanceTo(_tgtTmp);
    if (dd < bestD) { bestD = dd; hit = true; hitCtx = c.r; _aimDronePos.copy(_tgtTmp); }
  }

  // Flamme à la bouche du canon, traceur jusqu'au point d'impact, étincelles et poussière là où la balle s'arrête.
  _ensureMuzzleFx();
  // 0,7 = échelle du pistolet (Sahel Game, où le canon est vu à ~3 m). En vue de visée le canon est à ~0,7 m de la caméra : on réduit
  // la flamme dans la même proportion pour qu'elle garde la même taille apparente (jamais sous 40 %).
  const camDist = M.camera ? _gadgetOrigin.distanceTo(M.camera.position) : 3;
  _muzzleFx.shot(_gadgetOrigin, _muzzleDir, 0.7 * Math.min(1, Math.max(0.4, camDist / 2.5)));
  const end = hit ? _aimDronePos : _aimSegEnd;
  _muzzleFx.tracer(_gadgetOrigin, end);
  if (hit) _withCtx(hitCtx, () => _damageDroneN(GADGET_SHOT_DAMAGE));
  if (hit || end.distanceToSquared(_bulletEnd) > 0.01) _muzzleFx.impact(end);   // la balle a rencontré quelque chose (drone, mur, sol)
  _playPistolShotSound();
}

/** Direction de tir réelle du pistolet : axe +X du nœud Muzzle_Pistol (même convention que Sahel Game). */
function _muzzleDirection(out) {
  if (_gadgetMuzzle) {
    _gadgetMuzzle.updateWorldMatrix(true, false);
    return out.set(1, 0, 0).transformDirection(_gadgetMuzzle.matrixWorld);
  }
  return out.set(Math.sin(playerYaw), 0, Math.cos(playerYaw));
}

function _ensureMuzzleFx() {
  if (_muzzleFx || !M?.scene) return;
  _muzzleFx = new MuzzleFlash(M.scene, M.camera, M.renderer);
}

/** Détonation de pistolet : claquement bref (bruit filtré) + petit « thump » grave. */
function _playPistolShotSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!_gadgetAudio) { _gadgetAudio = new AC(); window.GameAudio?.ctx(_gadgetAudio, 'effects'); }
    const ctx = _gadgetAudio;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 0.16);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const noise = ctx.createBufferSource(); noise.buffer = buf;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.32, t + 0.003); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    noise.connect(hp); hp.connect(ng); ng.connect(ctx.destination); noise.start(t);
    const thump = ctx.createOscillator(); const tg = ctx.createGain();
    thump.type = 'sine'; thump.frequency.setValueAtTime(170, t); thump.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    tg.gain.setValueAtTime(0.0001, t); tg.gain.exponentialRampToValueAtTime(0.28, t + 0.004); tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    thump.connect(tg); tg.connect(ctx.destination); thump.start(t); thump.stop(t + 0.12);
  } catch (_) {}
}

function _setAiming(on){
  if (on && (_inVehicle() || _swimming)) on = false;
  if (on && !_gadgetUnlocked()) on = false;
  if (!on) { _sniper = false; _sniperLatched = false; }   // pas de lunette sans visée
  _ensureAimReticle();
  if (on && !_aiming) _aimSavedPitch = playerPitch;
  _aiming = on;
  const ret = document.getElementById('snAimReticle');
  ret.style.display = on ? 'block' : 'none';
  if (!on) _setAimLock(false);
}

/** Mode tireur d'élite : T au clavier, R3 à la manette. Il implique la visée (voir tickFPS) et la quitte avec elle. */
function _toggleSniper() {
  if (state !== S_FPS || _inVehicle() || _swimming || !_gadgetUnlocked()) return;
  _sniperLatched = !_sniperLatched;
  window.GamepadKit?.toast?.(_sniperLatched ? '🔭 Tireur d’élite : zoom + visée lente' : '🎯 Visée normale');
}

function _setAimLock(on){
  _aimLocked = on;
  document.getElementById('snAimReticle')?.classList.toggle('is-lock', on);
}

/** Retour immédiat à la caméra normale (sortie du mode, mort, etc.). */
function _resetAim(){
  _setAiming(false);
  _aimBlend = 0;
  _sniper = false; _sniperLatched = false; _sniperBlend = 0;
  { const sc = document.getElementById('snScope'); if (sc) sc.style.opacity = '0'; }
  _headFade?.setFade(0);
  if (_baseFov !== null && M?.camera){
    M.camera.fov = _baseFov;
    if (_baseNear !== null) M.camera.near = _baseNear;
    M.camera.updateProjectionMatrix();
  }
  _baseFov = null;
  _baseNear = null;
  if (_aimSavedPitch !== null) { playerPitch = _aimSavedPitch; _aimSavedPitch = null; }
}

/* ========================================================= */
/* ---- Tick FPS                                         ---- */
/* ========================================================= */
function tickFPS(dt) {
  if (_portalVideoPending) return;   // transition vidéo en cours : on gèle le joueur
  // Manette : stick gauche = se déplacer (L3 = courir), stick droit = orbiter la caméra
  const GP = window.GamepadKit;
  const gp = GP && GP.connected() ? GP.state() : null;
  const gx = gp ? gp.lx : 0;
  const gz = gp ? gp.ly : 0;

  // Visée : clic droit (souris) ou mode tireur d'élite (L2 maintenue, T, R3). Quand on vise, la caméra glisse aux yeux du personnage et le FOV se réduit.
  // Comme dans Sahel Game : L2 (LT) MAINTENUE = tireur d'élite (zoom de lunette), relâchée = retour à la vue normale.
  // T / R3 le font aussi par bascule. Il faut l'arme débloquée, hors voiture et hors nage.
  const sniperHoldGP = !!gp && GP.down('LT') && _gadgetUnlocked() && !_inVehicle() && !_swimming;
  _sniper = _sniperLatched || sniperHoldGP;
  const wantAim = _aimMouseRight || _sniper;                  // le tireur d'élite maintient la visée sans garder le bouton enfoncé
  if (wantAim !== _aiming) _setAiming(wantAim);
  // FOV d'origine de la caméra, mémorisé quand la caméra est en 3e personne pour le restituer à l'identique.
  if (_baseFov === null && _aimBlend === 0) _baseFov = M.camera.fov;
  if (_baseNear === null && _aimBlend === 0) _baseNear = M.camera.near;

  // Regard au stick droit / glisser à l'écran : orbite autour du personnage.
  if (gp && (Math.abs(gp.rx) > 0.06 || Math.abs(gp.ry) > 0.06)) {
    const lookMul = Sniper.lookMultiplier(_aiming, _sniper);
    cameraYaw   -= gp.rx * GP_LOOK_SPEED * dt * lookMul;
    playerPitch -= gp.ry * GP_LOOK_SPEED * dt * lookMul;
    playerPitch  = _aiming ? Aim.clampAimPitch(playerPitch) : Math.max(PLAYER_CAM_PITCH_MIN, Math.min(PLAYER_CAM_PITCH_MAX, playerPitch));
  }

  // Déplacement relatif à la caméra (clavier + joystick tactile + manette).
  let ix = joyInput.x + gx + (keys.d ? 1 : 0) - (keys.a ? 1 : 0);
  let iz = -joyInput.y - gz + (keys.w ? 1 : 0) - (keys.s ? 1 : 0);
  if (_uiBlocking()) { ix = 0; iz = 0; }                       // carte, guide, dialogue ouverts : on ne marche pas (touches tenues comprises)
  const inMag = Math.hypot(ix, iz);
  if (inMag > 1) { ix /= inMag; iz /= inMag; }
  // On peut se déplacer pendant le tir ; le personnage garde son orientation
  // vers la cible et strafe autour d'elle.
  // Agenouillé : dès qu'il marche ou court (hors tir), l'animation de marche prend le relais et le joueur se relève.
  if (_playerKneeling && !_gadgetShooting && !_playerDying && inMag > 0.08) _standUpFromKneel();
  const isMoving = !(_playerKneeling && _gadgetShooting) && inMag > 0.08;
  // Course : Maj au clavier, ou stick gauche enfoncé (L3) à la manette.
  const running  = isMoving && !_aiming && (keys.shift || !!(GP && GP.down('L3')));

  // Joueur neutralisé par le drone N : plus de contrôle, seule l'animation Dying joue.
  _playerRunning = running;
  _playerMoving = isMoving;
  if (_playerDying) {
    _move.set(0, 0, 0);
    _playerRunning = false;
    _playerDieT += dt;
    if (_playerDieT >= 3.0) {
      _playerDying = false;
      _playerDieT = 0;
      _resetPlayerHealth();
      _playAction('idle');
    }
    _syncPlayerRoot();
    _updateThirdPersonCamera(dt);
    _playerMixer?.update(dt);
    return;
  }

  _tickWater(dt, isMoving, running);

  // Avant caméra F = (sin,0,cos) ; droite écran R = (-cos,0,sin).
  const sy = Math.sin(cameraYaw), cy = Math.cos(cameraYaw);
  _fwd.set(sy, 0, cy);
  _tmpA.set(-cy, 0, sy);
  _move.copy(_fwd).multiplyScalar(iz).addScaledVector(_tmpA, ix);

  if (isMoving) {
    const mag = Math.min(1, inMag);
    _move.normalize().multiplyScalar((running ? PLAYER_RUN_SPEED : WALK_SPEED) * mag * (_swimming ? WL.swimSpeedMul(running, _swimDepth) : 1));
    if (colliders && colliders.length) movePlayer(dt);

    // Le personnage pivote en douceur vers sa direction de déplacement,
    // sauf pendant le tir où il reste orienté vers la cible (strafe).
    if (!_gadgetShooting && !_aiming) {
      const targetYaw = Math.atan2(_move.x, _move.z);
      let dYaw = targetYaw - playerYaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      playerYaw += dYaw * Math.min(1, PLAYER_TURN_RATE * dt);
    }
  } else {
    _move.set(0, 0, 0);
  }

  // En visée, le corps reste orienté vers la caméra : le déplacement devient un strafe.
  if (_aiming) {
    let dYaw = cameraYaw + _aimBodyYaw() - playerYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    playerYaw += dYaw * Math.min(1, PLAYER_TURN_RATE * dt);
  }

  if (isMoving && !_playerJumping && !_swimming) {
    _walkSound.playbackRate = running ? WALK_SOUND_RATE_RUN : WALK_SOUND_RATE_WALK;
    _startWalk();
  } else {
    _stopWalk();
  }

  if (_swimming && colliders && colliders.length) {
    // Nage : tenu à la surface (pieds ≈ surface − 1,15 m), le sol ne tire plus vers le fond
    _velY = 0;
    const fl = groundUnder(); _waterGroundY = fl > -Infinity ? fl - EYE_HEIGHT : -Infinity;
    playerPos.y += (WL.swimFeetY(_waterSurf, _swimT, _waterGroundY, _swimProne) + EYE_HEIGHT - playerPos.y) * Math.min(1, dt * 7);
    _swimT += dt;
    depenetrate();
  } else if (colliders && colliders.length) {
    // Gravité
    _velY -= GRAVITY * dt;
    playerPos.y += _velY * dt;

    const floorY = groundUnder();
    _waterGroundY = floorY > -Infinity ? floorY - EYE_HEIGHT : -Infinity;
    if (floorY === -Infinity && !_playerJumping && playerPos.y > -5) {
      // aucun sol détecté sous le joueur (le terrain de la place n'est pas encore chargé) : on le retient au lieu de le laisser tomber
      playerPos.y -= _velY * dt; _velY = 0;
    }
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
      playerPos.copy(PLAYER_SPAWN);
      playerYaw   = SPAWN_YAW;
      cameraYaw   = SPAWN_YAW;
      playerPitch = PLAYER_CAM_PITCH0;
      _velY = 0;
      _playerJumping = false;
      _playerIdleTime = 0;
      _camSnap = true;
      _teleportFlash();
    }

    depenetrate();
  }

  // Portails avant la caméra : le snap évite un travelling entre les lieux.
  tickPortals(dt);

  _syncPlayerRoot();
  _updatePlayerAnimation(dt, isMoving, running);
  _updateThirdPersonCamera(dt);
  _updateAimPoint();
  _applyCameraShake(dt);
  _muzzleFx?.update(dt);
  // Repère du joueur (nom + barre de vie jaune) au-dessus de la tête ; caché en visée aux yeux / lunette, à la mort et au volant.
  if (!_playerTag) _playerTag = new PlayerTag();
  _tagPos.set(playerPos.x, playerPos.y - EYE_HEIGHT + 2.0, playerPos.z);
  _playerTag.update(M.camera, _tagPos, {
    name: window.GameUI?.player?.()?.name || 'Joueur',
    frac: _playerHp / PLAYER_MAX_HP,
    hidden: _playerDying || _aimBlend > 0.5 || _inVehicle() || !_playerRoot?.visible,
  });
  if (_hitInd) {                                   // arcs jaunes : ils tournent avec la caméra (cap de son regard)
    M.camera.getWorldDirection(_hitDir);
    _hitInd.update(dt, Math.atan2(_hitDir.x, _hitDir.z), playerPos);
  }
  if (pointLight) {
    pointLight.position.copy(playerPos);
    pointLight.position.y += 0.45;   // au-dessus de la tête : évite l'effet « ampoule dans le corps »
  }

  _tickDirAnim(dt);
  window.ShadowFollow?.update?.(_shadowC.set(playerPos.x, playerPos.y - EYE_HEIGHT, playerPos.z));       // la carte d'ombre du soleil suit le joueur : vraies ombres nettes
  _tickScanHint(dt);
  _searchTomb(dt); _tickSilentScans();

  hudAccum += dt;
  if (hudAccum > 0.1) {
    hudAccum = 0;
    if (compassNeedle) {
      const deg = ((THREE.MathUtils.radToDeg(playerYaw) % 360) + 360) % 360;
      compassNeedle.style.transform = `rotate(${deg}deg)`;
    }
    _updateGadgetHud();
  }
}

/* ========================================================= */
/* ---- Boucle principale                                ---- */
/* ========================================================= */
// Menu du sanctuaire : fiche d'analyse ou panneau des lieux (☰).
// On évite de dépendre des autres overlays (menu principal, missions…).
function _sanctuaryMenuOpen() {
  const poi = document.getElementById('snPoiPanel');
  return !!document.querySelector('.sn-scan-result.visible') || !!(poi && !poi.hidden);
}

function update(dt) {
  window.WetLook?.update(dt, _playerModel);
  dt = Math.min(dt, 0.05);
  if (dt <= 0) return;
  if (window.__storyFreeze) { _stopWalk(); _stopInsideSound(); return; }       // scène plein écran de l'histoire (labo, dossier : app/dispositif1.js : plus de pas ni d'ambiance de mosquée) : le monde 3D est gelé
  if (_gadgetNode) _gadgetNode.visible = _gadgetUnlocked() && !_swimming && !_pilotHold && !(window.Vehicle && window.Vehicle.state === 'drive');   // pas de pistolet avant le dispositif 1 (ni au volant, ni à la nage, ni en pilotant le drone)

  if (_gadgetCooldown > 0) _gadgetCooldown = Math.max(0, _gadgetCooldown - dt);
  _updateFireworkFx(dt);

  // Idle du drone N supplémentaire (l'ancien drone reste sur le sac).
  if (_sanctuaryDroneN?.mixer) _sanctuaryDroneN.mixer.update(dt);
  _updateAllDroneN(dt);
  _updatePlayerHealth(dt);

  // Cinématique de retour du drone : pas de contrôle joueur pendant ce temps.
  if (state === S_RETURN) { _tickDroneReturn(dt); return; }

  // --- Manette : menus, actions et bascule drone/personnage ---
  const GP = window.GamepadKit;
  if (GP && GP.connected()) {
    // Options/START : ouvre ou referme le menu du sanctuaire (☰).
    // Les flèches directionnelles et X sont gérés par KeyboardMenu
    // uniquement quand un menu est visible (voir gamepad.js).
    if (GP.justPressed('START') && !document.querySelector('.sn-scan-result.visible')) {
      document.getElementById('snMenu')?.click();
      const poi = document.getElementById('snPoiPanel');
      if (poi && !poi.hidden) window.KeyboardMenu?.move?.(1);   // focus sur le 1er item
    }

    // A ferme une fiche d'analyse.
    if (GP.justPressed('A')) {
      document.querySelector('.sn-scan-result.visible .sn-scan-close')?.click();
    }
    // ○/B : saut hors menu. ✕/X : bascule genoux à terre.
    if (GP.justPressed('B') && !_sanctuaryMenuOpen() && state === S_FPS && !(window.CityMap && window.CityMap.busy)) {   // carte ouverte (ou fermée à l'instant par ○) : pas de saut
      _tryJump();
    }
    if (GP.justPressed('X') && !_sanctuaryMenuOpen() && state === S_FPS) {
      _toggleKneeling();
    }

    if (GP.justPressed('R3') && !_sanctuaryMenuOpen() && state === S_FPS) _toggleSniper();   // R3 = tireur d'élite
    if (GP.justPressed('RB') && !(_vehicleCtl && _vehicleCtl.active())) toggleRecord();   // en voiture : L1 puis R1 = phares
    if (state === S_FPS && !_sanctuaryMenuOpen()) {
      if (GP.justPressed('RT')) _startGadgetShot(false);
    }
  }

  // --- Bascule drone/personnage : L1/LB uniquement ---
  if (state === S_FPS && !_droneTakeoff && !(_vehicleCtl && _vehicleCtl.active()) && GP?.connected?.() && GP.justPressed('LB') &&
      !_sanctuaryMenuOpen()) {
    _startDroneTakeoff();
  }
  if (_droneTakeoff) {
    _updateDockedDrone(dt);
    if (!active) return;                 // passage en mode pilotage
  }

  if (state === S_APPROACH) {
    animT += dt / APPROACH_DUR;
    if (animT >= 1) {
      animT = 0; state = S_FPS;
      playerPos.copy(PLAYER_SPAWN);
      playerYaw   = SPAWN_YAW;
      cameraYaw   = SPAWN_YAW;
      playerPitch = PLAYER_CAM_PITCH0;
      _camSnap    = true;
      _playerIdleTime = 0;
      if (!colliders) colliders = [];
      if (colliders.length) depenetrate();
      _syncPlayerRoot();
      if (_playerReady) {
        _playerRoot.visible = true;
        _playAction('idle');
      }
      _initControls();
      _initLookDrag();
      _updateThirdPersonCamera(0, true);
      showHud();
      return;
    }
    const t = easeInOut(animT);
    M.camera.position.lerpVectors(animCamStart, animCamEnd, t);
    M.camera.quaternion.slerpQuaternions(animQuatStart, animQuatEnd, t);
    _syncPlayerRoot();
    _updatePlayerAnimation(dt, false, false);
  } else if (state === S_FPS && _vehicleCtl && _vehicleCtl.active()) {
    _stopWalk(); _playerRunning = false;         // plus de bruit de pas au volant
    if (_swimming || _waterState !== 'dry') _forceDry();
    _vehicleCtl.tick(dt);                       // véhicule (app/vehicle.js) : monte/descend/conduit — il pilote le joueur et la caméra
  } else if (state === S_FPS) {
    tickFPS(dt);
    const inside = isInsideMosque();
    // Tant que les collisions ne sont pas prêtes, on ne coupe pas le son :
    // isInsideMosque() renverrait false alors qu'on se trouve à l'intérieur.
    if (colliders && colliders.length) _syncInsideSound(inside);
  }
}

/* ========================================================= */
/* ---- enter / exit                                     ---- */
/* ========================================================= */
const _shadowC = new THREE.Vector3();
function enter() {
  window.ShadowFollow?.on?.();
  if (active) return;
  M = window.MosqueScene;
  if (!M) return;
  active = true;
  _pilotHold = false;
  _droneScanPos = null;
  _droneReturn = null;

  // État du personnage et de la caméra 3e personne.
  playerPos.copy(PLAYER_SPAWN);
  playerYaw       = SPAWN_YAW;
  cameraYaw       = SPAWN_YAW;
  playerPitch     = PLAYER_CAM_PITCH0;
  _camDist        = PLAYER_CAM_DIST;
  _camDistView    = PLAYER_CAM_DIST;
  _camSnap        = true;
  _playerJumping  = false;
  _playerIdleTime = 0;
  _gadgetShooting = false;
  _gadgetShootAction = null;
  _gadgetTarget   = null;
  _gadgetShotIndex = 0;
  _gadgetCooldown = 0;
  _gadgetKneelShotT = 0;
  _playerKneeling = false;
  _playerKneelingPrev = '';
  _playerDying = false;
  _playerDieT = 0;
  _resetPlayerHealth();
  _droneNDead     = false;
  _droneNHealth   = DRONE_N_MAX_HP;
  _droneNRespawnT = 0;
  _clearFireworkFx();

  animCamStart.copy(M.camera.position);
  animQuatStart.copy(M.camera.quaternion);
  _refreshApproachEnd();
  animT = 1; state = S_APPROACH;      // pas de descente de caméra : update() bascule aussitôt en 3e personne, caméra collée derrière le personnage
  M.controls.enabled = false;
  document.querySelector('.mq-ui')?.classList.add('dg-hidden');
  // Ferme le menu principal s'il est encore affiché (ou en fondu).
  try { window.GameMenu?.hide?.(); } catch (_) {}
  const gmMenu = document.getElementById('gmMenu');
  if (gmMenu) { gmMenu.classList.remove('on'); gmMenu.hidden = true; }
  if (!ambLight) {
    ambLight   = new THREE.AmbientLight(0xffe8c0, 0.08);
    pointLight = new THREE.PointLight(0xffd090, 0.9, 12);
    M.scene.add(ambLight); M.scene.add(pointLight);
  }
  ambLight.color.set(0xffe8c0); ambLight.intensity = 0.08;
  ambLight.visible = true; pointLight.visible = true;

  buildColliders().then(() => {
    if (active && state === S_APPROACH) _refreshApproachEnd();
  }).catch(() => {});

  if (typeof window.stopModelWind === 'function') window.stopModelWind();
  _playInsideSound();

  _loadDirModel();
  setTimeout(_prewarmExplosionFx, 1500);

  // Personnage joueur : visible dès l'approche, prêt pour la prise en main.
  _loadPlayerModel();
  if (_playerRoot) {
    _playerRoot.visible = true;
    _syncPlayerRoot();
    _playAction('idle');
  }

  // Drone N : drone supplémentaire, en plus de celui posé sur le sac.
  if (_sanctuaryDroneN) {
    _resetDroneNModel(_sanctuaryDroneN, true);
    _sanctuaryDroneN.group.position.copy(DRONE_N_POS);
    _sanctuaryDroneN.group.quaternion.copy(_sanctuaryDroneN.baseQuat);
    _retireMainDrone();
    _droneNFireCooldown = 1.2;
    _resetSentinels(true);
    _updateGadgetHud();
  } else {
    _loadSanctuaryDroneN();
  }

  if (_dockedDrone) _attachDockedDrone();

  // Aide manette (une fois par session, si une manette est branchée)
  if (window.GamepadKit?.connected() && !_gpHintShown) {
    _gpHintShown = true;
    window.GamepadKit.toast('🎮 Stick G marcher · L3 courir · ○ sauter · ✕ genoux à terre (bascule) · R2 tir · L1 drone ↔ personnage · Options menu · R1 vidéo');
  }

  M.setGameUpdate(update);
}

function exit() {
  window.ShadowFollow?.off?.();
  if (!active) return;
  active = false; state = S_IDLE;
  _hitInd?.clear();
  _playerTag?.hide();
  _forceDry();
  setTimeout(() => window.dispatchEvent(new CustomEvent('sanctuary:exit')), 0);
  _aimMouseRight = false;
  _resetAim();
  if (_recorder) { try { _recorder.stop(); } catch (_) {} }
  joyInput.x = joyInput.y = 0;
  keys.w = keys.a = keys.s = keys.d = keys.shift = false;
  lookDragId = null;
  playerPitch = PLAYER_CAM_PITCH0;
  _camDistView = _camDist;
  _portalCooldown = 0;
  _portalHold     = null;
  clearTimeout(_portalGifTimer); _portalGifTimer = 0;
  if (_portalImgEl) _portalImgEl.removeAttribute('src');
  _portalVideoPending = null;
  if (_portalVideoOverlay) {
    _portalVideoOverlay.style.visibility = 'hidden';
    _portalVideoOverlay.style.opacity = '0';
  }
  _velY = 0;
  _camSnap = true;
  _playerJumping = false;
  _playerIdleTime = 0;
  _gadgetShooting = false;
  _gadgetShootAction = null;
  _gadgetTarget = null;
  _gadgetShotIndex = 0;
  _gadgetCooldown = 0;
  _gadgetKneelShotT = 0;
  _playerKneeling = false;
  _playerKneelingPrev = '';
  _playerDying = false;
  _playerDieT = 0;
  _resetPlayerHealth();
  _droneNDead = false;
  _droneNHealth = DRONE_N_MAX_HP;
  _droneNRespawnT = 0;
  _retireMainDrone();
  _clearFireworkFx();
  _cancelShootLayer();
  _playerCurrentAction = '';
  if (_playerMixer) _playerMixer.stopAllAction();
  _pilotHold = false;
  _droneScanPos = null;
  _droneReturn = null;
  if (_droneTakeoff) _droneTakeoff = null;
  if (_dockedDrone) _attachDockedDrone();
  if (_sanctuaryDroneN) {
    // Remet le modèle en pose de repos : sinon les morceaux de l'explosion
    // resteraient dispersés à la prochaine entrée dans le sanctuaire.
    _resetDroneNModel(_sanctuaryDroneN, false);
    _sanctuaryDroneN.group.visible = false;
  }
  _resetSentinels(false);
  _droneNFireCooldown = 0;
  _hideDroneNLaserFx();
  _updateGadgetHud();
  if (_playerRoot) _playerRoot.visible = false;
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
/* --------------------------------------------------------- */
/* ---- API missions : points d'intérêt + réarmement scans ---- */

function spots(){
  return {
    tomb:   tombCenter ? tombCenter.clone() : null,
    petit:  PETIT_TOMB_POS.clone(),
    imam:   IMAM_POS.clone(),
    entree: ENTREE_POS.clone(),
    roof:   PORTAL_A_DEST.clone(),
  };
}
function resetScans(){
  for (const k in _silentScanDone) delete _silentScanDone[k];
  resetTombScan();
  resetPetitTombScan();
  resetImamScan();
  resetEntreeScan();
}

function _camLocal(boneName) {
  const b = _playerModel?.getObjectByName(boneName);
  if (!b || !M?.camera) return null;
  M.camera.updateMatrixWorld();
  return M.camera.worldToLocal(b.getWorldPosition(new THREE.Vector3())).toArray();
}

window.SanctuaryMode = {
  // nage (app/water-fx.js) : true tant que le joueur nage ; événement window « player:swim » { on }
  get swimming() { return _swimming; },
  get waterState() { return _waterState; },
  // diagnostic : force le fondu de la tête (null = rend la main au jeu)
  debugForceHeadFade: (v) => { _headFadeForce = v; },
  // diagnostic : fixe les points de vie du joueur (repère au-dessus de la tête)
  debugPlayerHp: (n) => { _playerHp = Math.max(0, Math.min(PLAYER_MAX_HP, n)); _updatePlayerHpHud(); },
  // diagnostic : fait apparaître l'arc jaune d'un tir reçu depuis (x, z) ; id distingue plusieurs tireurs (power : 1 touché, ~0,55 frôlé)
  debugHitFrom: (x, z, power = 1, id = 'debug') => { _indicateShotFrom({ _hitId: `dbg-${id}` }, { x, z }, power); },
  // diagnostic : téléporte le personnage (test de l'IA de la Sentinelle)
  debugTeleport: (x, y, z) => { playerPos.set(x, y, z); },
  // diagnostic : inflige des dégâts à une sentinelle de la base (id = poste) ou à celle d'origine (sans id)
  debugDamage: (id, n = 1) => { const r = id ? _droneRoster.find((x) => x.id === id) : null; _withCtx(r, () => _damageDroneN(n)); },
  // position du personnage (null hors sanctuaire) : portes et ramassage de la base NÉANTIS
  playerPosition: () => (active ? playerPos : null),
  // interface du véhicule (app/vehicle.js) : le contrôleur { active(), tick(dt) } remplace tickFPS tant qu'il est actif
  vehicle: {
    setController: (c) => { _vehicleCtl = c; },
    pos: playerPos,
    root: () => _playerRoot,
    play: (name, opts) => _playAction(name, opts),
    mixer: () => _playerMixer,
    model: () => _playerModel,
    // arrête toutes les animations du personnage (couches comprises) avant un clip spécial ; _playAction('idle') reprend ensuite
    resetActions: () => { if (_playerMixer) _playerMixer.stopAllAction(); _playerCurrentAction = ''; _playerLowerName = ''; _playerUpperShootName = ''; _playerShootLayer = false; _playerLayeredShootAction = null; _aimHold = false; _gadgetShooting = false; },
    setHeadFade: (f) => { _headFade?.setFade(f); },
    fov: () => _baseFov,
    sync: () => _syncPlayerRoot(),
    setYaw: (y) => { playerYaw = y; },
    getYaw: () => playerYaw,
    setCameraYaw: (y) => { cameraYaw = y; },
    snapCamera: () => { _camSnap = true; },
    joy: joyInput,
    colliders: () => colliders,
    removeCollider: (m) => { if (!colliders) return; const i = colliders.indexOf(m); if (i >= 0) colliders.splice(i, 1); },
    addCollider: (m) => { if (!colliders) return false; if (!colliders.includes(m)) colliders.push(m); return true; },
    eyeHeight: EYE_HEIGHT,
    state: () => state,
  },
  enter, exit, isActive, spots, resetScans,
  takeoffDrone: _startDroneTakeoff,
  returnDrone, pilotTick, endPilotHold,
  shoot: _startGadgetShot,
  // commandes tactiles (app/touch-controls.js) : glisser de la caméra (dx, dy en px écran × sensibilité) et état de visée
  look: (dx, dy, mul = 1) => {
    if (state !== S_FPS) return;
    const m = Sniper.lookMultiplier(_aiming, _sniper) * mul;
    cameraYaw   -= dx * LOOK_SENSITIVITY * m;
    playerPitch -= dy * LOOK_SENSITIVITY * m;
    playerPitch  = _aiming ? Aim.clampAimPitch(playerPitch) : Math.max(PLAYER_CAM_PITCH_MIN, Math.min(PLAYER_CAM_PITCH_MAX, playerPitch));
  },
  isAiming: () => _aiming,
  debug: () => ({
    active,
    state,
    ready: _playerReady,
    actions: Object.keys(_playerActions),
    current: _playerCurrentAction,
    shooting: _gadgetShooting,
    sideShot: _gadgetSideShot,
    jumping: _playerJumping,
    swimming: _swimming, waterWalked: _waterWalked, waterState: _waterState, waterSurf: _waterSurf, swimClips: [_swimMoveName, _swimIdleName], swimTilt: _swimTilt,
    kneeling: _playerKneeling,
    dying: _playerDying,
    lower: _playerLowerName,
    lowerPaused: !!_lowerSet()[_playerLowerName]?.paused,
    move: _move.toArray(),
    joy: [joyInput.x, joyInput.y],
    keys: { ...keys },
    shootTime: _gadgetShootAction?.time ?? -1,
    shootDur: _gadgetShootAction?.getClip()?.duration ?? -1,
    aimHold: _aimHold,
    rightHandCam: _camLocal('mixamorigRightHand'),
    leftHandCam:  _camLocal('mixamorigLeftHand'),
    muzzleCam:    _gadgetMuzzle && M?.camera ? (M.camera.updateMatrixWorld(), M.camera.worldToLocal(_gadgetMuzzle.getWorldPosition(new THREE.Vector3())).toArray()) : null,
    modelScale: _playerModel ? _playerModel.scale.x : null,
    headPos: (() => { const h = _playerModel?.getObjectByName('mixamorigHead'); return h ? h.getWorldPosition(new THREE.Vector3()).toArray() : null; })(),
    upperPaused: !!_upperSet().shoot_gadget?.paused,
    kneelShotT: _gadgetKneelShotT,
    cooldown: _gadgetCooldown,
    camDist: _camDistView,
    camDistBase: _camDist,
    aiming: _aiming,
    aimErrorDeg: _aimErrorDeg(),
    sniper: _sniper,
    sniperBlend: _sniperBlend,
    aimBlend: +_aimBlend.toFixed(3),
    headFade: Aim.headFade(_aimBlend) * (1 - _sniperBlend),
    headFadeOk: !!_headFade?.ok,
    aimLocked: _aimLocked,
    aimPoint: _aimPoint.toArray(),
    fov: M?.camera?.fov ?? null,
    near: M?.camera?.near ?? null,
    baseFov: _baseFov,
    camPos: M?.camera ? M.camera.position.toArray() : null,
    camYaw: cameraYaw,
    camPitch: playerPitch,
    aimPoseMix: _aimPoseMix,
    barrelPitch: (() => { if (!_gadgetNode) return null; _gadgetNode.updateWorldMatrix(true, false); return Math.asin(new THREE.Vector3(1, 0, 0).transformDirection(_gadgetNode.matrixWorld).y); })(),
    barrelYaw: (() => { if (!_gadgetNode) return null; _gadgetNode.updateWorldMatrix(true, false); const d = new THREE.Vector3(1, 0, 0).transformDirection(_gadgetNode.matrixWorld); return Math.atan2(d.x, d.z); })(),
    rootPos: _playerRoot ? _playerRoot.position.toArray() : null,
    rootYaw: _playerRoot ? _playerRoot.rotation.y : null,
    menu: window.KeyboardMenu?.current?.() || '',
    gadget: !!_gadgetNode,
    muzzle: !!_gadgetMuzzle,
    target: !!_gadgetTarget,
    health: _droneNHealth,
    dead: _droneNDead,
    droneN: !!_sanctuaryDroneN,
    sentinels: _droneRoster.map((r) => ({ id: r.id, ai: r.d.ai.state, dead: r.dead, hp: r.health, vis: !!r.d.group.visible, pos: r.d.group.position.toArray().map((v) => +v.toFixed(1)) })),
    droneNAnim: _sanctuaryDroneN?.currentAction?._clip?.name || '',
    droneNDodging: !!_sanctuaryDroneN?.dodging,
    droneNAi: _sanctuaryDroneN?.ai?.state || '',
    droneNAiDetail: _sanctuaryDroneN?.ai ? { wp: _sanctuaryDroneN.ai.waypoints[0] || null, wpN: _sanctuaryDroneN.ai.waypoints.length, pauseT: _sanctuaryDroneN.ai.pauseT, roam: !!_sanctuaryDroneN.ai.roam, dead: _droneNDead } : null,
    droneNYaw: _sanctuaryDroneN?.yaw ?? 0,
    playerHp: _playerHp,
    pilotHold: _pilotHold,
    colliderNames: colliders ? [...new Set(colliders.map((c) => c.name))] : [],
    scans: { tomb: tombScanState, petit: petitTombScanState, imam: imamScanState, entree: entreeScanState },
    droneNShots: _droneNShotsFired,
    droneNBullets: _droneNLaser?.bullets.length || 0,
    droneNRespawnT: _droneNRespawnT,
    fireworks: _fireworkFx.length,
    droneNVisible: !!_sanctuaryDroneN?.group?.visible,
    droneNPos: _sanctuaryDroneN?.group ? _sanctuaryDroneN.group.getWorldPosition(new THREE.Vector3()).toArray() : null,
    pos: playerPos.toArray(),
    yaw: playerYaw,
  }),
};
