/* ==========================================================
   LAMPADAIRES DE DJENNÉ — s'allument à la tombée de la nuit
   ----------------------------------------------------------
   Positions : assets/models/djenne-lampadaires.json (≈ 490 points le long des routes OSM, dans le repère
   du jeu, y = sol). Rendu léger :
     • poteaux et lanternes en InstancedMesh (2 draw calls) ;
     • halos additifs (1 THREE.Points) ;
     • quelques vraies lumières (PointLight) qui suivent la caméra : les plus proches seulement.
   Allumage : hauteur du soleil (DayCycle.sunElevation) → progressif au crépuscule et à l'aube.
   Ville v2 uniquement (les positions sont calées sur djenne-ville-leger.glb).
   ========================================================== */
import * as THREE from 'three';
import { detectQuality } from './device-quality.js?v=6';

const M = window.MosqueScene;
const LAMPS_URL = 'assets/models/djenne-lampadaires.json?v=4';

const POST_H   = 5.2;                      // hauteur du poteau (unités du jeu)
const HEAD_R   = 0.34;                     // rayon de la lanterne
const WARM_ON  = new THREE.Color(0xffd79a);
const WARM_OFF = new THREE.Color(0x4a443a);
const LIGHT_COLOR = 0xffb866;
const POOL = { low: 0, mid: 2, high: 3 };  // vraies lumières selon la qualité
const GLOW_SIZE = 12;                      // taille du halo (m)

let built = false, lamps = null, group = null;
let headMat = null, glowMat = null, pool = [], poolT = 0, level = -1, headMesh = null;

function nightLevel() {
  // 0 = plein jour … 1 = nuit noire. Soleil à +5° : rien ; à −4° : tout allumé.
  let e = window.DayCycle && typeof window.DayCycle.sunElevation === 'number' ? window.DayCycle.sunElevation : null;
  if (e === null) {
    const h = window.DayCycle ? window.DayCycle.now() : 12;
    return (h >= 18.4 || h < 5.6) ? 1 : 0;
  }
  const t = Math.min(1, Math.max(0, (5 - e) / 9));
  return t * t * (3 - 2 * t);
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,236,190,1)');
  grad.addColorStop(0.18, 'rgba(255,200,120,0.55)');
  grad.addColorStop(0.5, 'rgba(255,160,70,0.14)');
  grad.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function build(list, quality) {
  const step = quality === 'low' ? 2 : 1;                          // appareil faible : un lampadaire sur deux
  const pts = list.filter((_, i) => i % step === 0);
  const n = pts.length;
  group = new THREE.Group(); group.name = 'LampadairesDjenne';

  // poteaux
  const postGeo = new THREE.CylinderGeometry(0.07, 0.11, POST_H, 6); postGeo.translate(0, POST_H / 2 - 0.1, 0);
  const posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: 0x2c2b29, roughness: 0.8, metalness: 0.5 }), n);
  // lanternes
  headMat = new THREE.MeshBasicMaterial({ color: WARM_OFF.clone() });
  headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(HEAD_R, 8, 6), headMat, n);
  const m4 = new THREE.Matrix4();
  const glowPos = new Float32Array(n * 3);
  pts.forEach((p, i) => {
    m4.makeTranslation(p[0], p[1], p[2]); posts.setMatrixAt(i, m4);
    m4.makeTranslation(p[0], p[1] + POST_H, p[2]); headMesh.setMatrixAt(i, m4);
    glowPos.set([p[0], p[1] + POST_H, p[2]], i * 3);
  });
  for (const o of [posts, headMesh]) {
    o.instanceMatrix.needsUpdate = true; o.frustumCulled = false;
    o.raycast = () => {};                                          // pas de collision (le drone traverse les poteaux)
    o.castShadow = false; o.receiveShadow = false;
  }
  // halos
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
  glowMat = new THREE.PointsMaterial({ map: glowTexture(), size: GLOW_SIZE, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
  const glow = new THREE.Points(geo, glowMat); glow.frustumCulled = false; glow.raycast = () => {};
  glow.visible = false;
  group.add(posts, headMesh, glow);
  group.userData.glow = glow;

  // vraies lumières (constantes : pas de recompilation de shader au lever/coucher du soleil)
  const k = POOL[quality] ?? 3;
  for (let i = 0; i < k; i++) {
    const L = new THREE.PointLight(LIGHT_COLOR, 0, 30, 2);
    L.castShadow = false; group.add(L); pool.push(L);
  }
  group.userData.pts = pts;
  M.scene.add(group);
  built = true;
}

function assignLights(camPos) {
  const pts = group.userData.pts; if (!pool.length) return;
  const best = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; const dx = p[0] - camPos.x, dz = p[2] - camPos.z;
    best.push([dx * dx + dz * dz, i]);
  }
  best.sort((a, b) => a[0] - b[0]);
  pool.forEach((L, j) => { const p = pts[best[j][1]]; L.position.set(p[0], p[1] + POST_H - 0.4, p[2]); });
}

let lastCheck = 0;
M?.addFrameHook((dt) => {
  if (!built) {
    lastCheck += dt;
    if (lastCheck < 0.5 || !M.loaded || !M.newCity) return;        // attend la ville v2
    lastCheck = -999;
    fetch(LAMPS_URL).then((r) => r.json()).then((j) => {
      lamps = j.lamps || []; if (lamps.length) build(lamps, detectQuality());
    }).catch((e) => console.warn('[lampadaires] indisponibles :', e));
    return;
  }
  const f = nightLevel();
  if (Math.abs(f - level) > 0.004) {
    level = f;
    headMat.color.copy(WARM_OFF).lerp(WARM_ON, f);
    glowMat.opacity = 0.95 * f;
    group.userData.glow.visible = f > 0.01;
    for (const L of pool) L.intensity = 110 * f;
  }
  if (f > 0.01 && pool.length) {
    poolT += dt;
    if (poolT > 0.3) { poolT = 0; assignLights(M.camera.position); }
  }
});

window.CityLights = {
  get built() { return built; },
  get count() { return group ? group.userData.pts.length : 0; },
  get level() { return level; },
};
