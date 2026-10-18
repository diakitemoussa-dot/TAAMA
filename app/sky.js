/* ==========================================================
   CIEL 3D GÉNÉRÉ — « Les Gardiens de Djenné »
   ----------------------------------------------------------
   1) Ciel atmosphérique (three/addons/objects/Sky.js) : dégradé
      réaliste + disque solaire — ambiance coucher de soleil,
      aligné sur la DirectionalLight de la scène (mosque-viewer.js).
   2) Couche de nuages générée : sprites moelleux (textures canvas),
      répartis en cercle autour du village, dérive lente en continu.
   3) Halo de soleil : sprite lumineux additif sur la direction du soleil.

   Les nuages du modèle GLB sont masqués (remplacés) — réversibles via
   GameSky.setLegacyCloudsVisible(true).

   API (débogage / réglages) :
     GameSky.setSunDirection(x, y, z)      → déplace soleil + halo
     GameSky.setCloudsVisible(false)       → cache les nuages générés
     GameSky.setLegacyCloudsVisible(true)  → ré-affiche les nuages du modèle
     GameSky.setSunHaloVisible(false)      → enlève le halo du soleil
     GameSky.setExposure(0.6)              → adoucit le ciel (défaut 0.7)
   ========================================================== */
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

/* Direction du soleil : coucher de soleil par défaut
   (élévation 12°, azimut 225° — dans l'axe de la vue d'ouverture).
   Alignée sur la DirectionalLight de mosque-viewer.js ; l'API
   GameSky.setSunDirection() recale les deux en même temps. */
const SUN_ELEVATION = 12;   // degrés au-dessus de l'horizon
const SUN_AZIMUTH   = 225;  // degrés (setFromSphericalCoords)
const sunDir = new THREE.Vector3().setFromSphericalCoords(
  1,
  THREE.MathUtils.degToRad(90 - SUN_ELEVATION),
  THREE.MathUtils.degToRad(SUN_AZIMUTH)
);

/* Teintes chaudes des nuages au couchant */
const CLOUD_TINTS = [0xffe6c8, 0xffd2a6, 0xf5bb90];
let sky = null;
let sunHalo = null;
let cloudGroup = null;
let cloudsBuilt = false;
const legacyClouds = [];

/* ---------------- Textures générées (canvas) ---------------- */

function makeCloudTexture(seed){
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');

  let r = seed;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };

  const puffs = 16 + Math.floor(rand() * 10);
  for (let i = 0; i < puffs; i++){
    const px = S * (0.18 + rand() * 0.64);
    const py = S * (0.32 + rand() * 0.36);          // bande verticale centrale : nuage aplati
    const pr = S * (0.09 + rand() * 0.16);
    const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
    g.addColorStop(0,    'rgba(255,255,255,0.90)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.50)');
    g.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fondu des bords : le sprite n'a pas de bord visible
  const mask = ctx.createRadialGradient(S / 2, S / 2, S * 0.18, S / 2, S / 2, S * 0.52);
  mask.addColorStop(0, 'rgba(255,255,255,1)');
  mask.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture(){
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0.00, 'rgba(255,236,190,1)');
  g.addColorStop(0.20, 'rgba(255,206,130,0.65)');
  g.addColorStop(0.55, 'rgba(255,168,88,0.22)');
  g.addColorStop(1.00, 'rgba(255,140,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------- Initialisation ---------------- */

function init(M){
  const scene = M.scene;

  /* ---------- 1) Ciel atmosphérique + disque solaire ---------- */
  sky = new Sky();
  sky.name = 'MS_Sky';
  sky.scale.setScalar(30000);                 // le shader force la profondeur au fond : jamais coupé
  const u = sky.material.uniforms;
  u.turbidity.value       = 8.0;              // brume chaude du couchant
  u.rayleigh.value        = 2.6;              // dégradé orangé profond à l'horizon
  u.mieCoefficient.value  = 0.005;            // lueur dorée autour du soleil
  u.mieDirectionalG.value = 0.8;
  u.sunPosition.value.copy(sunDir);

  /* Exposition propre au ciel : sans tone mapping sur la scène, le soleil
     peut paraître trop fort — on adoucit tout le ciel (réglable en direct). */
  u.skyExposure = { value: 0.7 };
  sky.material.fragmentShader =
    'uniform float skyExposure;\n' + sky.material.fragmentShader
      .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyExposure, 1.0 );');

  scene.add(sky);

  /* ---------- 3) Halo de soleil (sprite additif) ---------- */
  sunHalo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  }));
  sunHalo.name = 'MS_SunHalo';
  scene.add(sunHalo);

  const placeHalo = () => {
    const R = M.domeRadius || 400;
    sunHalo.position.copy(sunDir).multiplyScalar(R * 2.6);
    const s = R * 0.55;
    sunHalo.scale.set(s, s, 1);
  };
  placeHalo();

  /* ---------- 2) Nuages générés (dès que la maquette est chargée) ---------- */
  const buildClouds = () => {
    if (cloudsBuilt) return;
    const R = M.domeRadius || 0;
    if (!R) return;                            // maquette pas encore chargée
    cloudsBuilt = true;

    cloudGroup = new THREE.Group();
    cloudGroup.name = 'MS_Clouds';

    const texes = [makeCloudTexture(11), makeCloudTexture(37), makeCloudTexture(73)];
    const cy = M.viewTarget.y;
    for (let i = 0; i < 34; i++){
      const mat = new THREE.SpriteMaterial({
        map: texes[i % texes.length],
        color: CLOUD_TINTS[Math.floor(Math.random() * CLOUD_TINTS.length)],
        transparent: true,
        opacity: 0.66 + Math.random() * 0.18,
        rotation: (Math.random() - 0.5) * 0.6,
        depthWrite: false,
        fog: false,
      });
      const sp = new THREE.Sprite(mat);
      const ang = Math.random() * Math.PI * 2;
      const rad = R * (0.30 + Math.random() * 0.62);
      const base = R * (0.15 + Math.random() * 0.20);
      sp.scale.set(base * (1.5 + Math.random() * 0.9), base * 0.7, 1);
      sp.position.set(Math.cos(ang) * rad, cy + R * (0.20 + Math.random() * 0.40), Math.sin(ang) * rad);
      cloudGroup.add(sp);
    }
    scene.add(cloudGroup);

    /* Nuages du modèle GLB : masqués (remplacés par les nuages générés) */
    scene.traverse((o) => {
      if (o.isMesh && /Cloud/i.test(o.name || '')){
        o.visible = false;
        legacyClouds.push(o);
      }
    });

    placeHalo();                               // rayon réel connu → halo bien proportionné
  };

  /* ---------- Animation : dérive lente des nuages ---------- */
  M.addFrameHook?.((dt) => {
    buildClouds();
    if (cloudGroup) cloudGroup.rotation.y += Math.min(dt, 0.1) * 0.0045;   // ~23 min pour un tour complet
  });

  /* ---------- API ---------- */
  window.GameSky = {
    get sky(){ return sky; },
    get clouds(){ return cloudGroup; },
    setSunDirection(x, y, z){
      sunDir.set(x, y, z).normalize();
      if (sky) sky.material.uniforms.sunPosition.value.copy(sunDir);
      placeHalo();
      M.setSunLightDirection?.(sunDir.x, sunDir.y, sunDir.z);   // recale l'éclairage de la maquette
    },
    setCloudsVisible(on){ if (cloudGroup) cloudGroup.visible = !!on; },
    setLegacyCloudsVisible(on){ legacyClouds.forEach((m) => { m.visible = !!on; }); },
    setSunHaloVisible(on){ if (sunHalo) sunHalo.visible = !!on; },
    setExposure(v){ if (sky) sky.material.uniforms.skyExposure.value = Math.min(2, Math.max(0.05, v)); },
  };
}

/* ---------------- Démarrage ---------------- */
const M = window.MosqueScene;
if (M && M.scene) init(M);
else console.warn('[sky] MosqueScene indisponible — ciel non ajouté.');
