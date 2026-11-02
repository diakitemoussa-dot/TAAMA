/* ==========================================================
   FLEUVE (Bani et bras du Niger) — vraie matière d'eau animée
   ----------------------------------------------------------
   Le modèle de la ville contient une surface plate `Fleuve_Eau`. Ce module la remplace par un matériau d'eau :
     · deux couches de vaguelettes (carte de normales générée en code, aucun fichier) qui défilent en sens
       contraires, en coordonnées MONDE (le maillage n'a pas besoin d'UV) → reflets du soleil qui scintillent ;
     · couleur d'eau limoneuse du Bani (vert-brun) plus claire sur les bords vus de biais (Fresnel) ;
     · reflet du ciel qui suit l'heure du jour (DayCycle) : jour, couchant, nuit.
   Palier de qualité : « low » (mobile faible) = une seule couche et texture plus petite ; « mid » / « high » = deux couches.
   API : window.River { ready, mesh, setStrength(v) }.
   ========================================================== */
import * as THREE from 'three';
import { detectQuality } from './device-quality.js?v=5';

const QUALITY = (() => { try { return detectQuality(); } catch (_) { return 'mid'; } })();
const TEX = QUALITY === 'low' ? 256 : 512;

/* ---------- carte de normales de vaguelettes (tileable) ---------- */
function makeWaveTexture(size) {
  // hauteur = somme de sinus à périodes entières (donc raccord parfait sur les bords) avec phases pseudo-aléatoires
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const waves = [];
  for (let i = 0; i < 16; i++) {                           // directions réparties dans tout le cercle : vaguelettes naturelles, pas de rayures
    const ang = (i / 16) * Math.PI * 2 + rnd() * 0.35, f = 5 + rnd() * 17;
    const kx = Math.round(Math.cos(ang) * f), ky = Math.round(Math.sin(ang) * f);
    if (!kx && !ky) { i--; continue; }
    waves.push({ kx, ky, ph: rnd() * Math.PI * 2, a: 1 / (1 + f * 0.09) });
  }
  const h = new Float32Array(size * size);
  const TAU = Math.PI * 2 / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (const w of waves) v += Math.sin((w.kx * x + w.ky * y) * TAU + w.ph) * w.a;
    h[y * size + x] = v;
  }
  const data = new Uint8Array(size * size * 4);
  const S = 1.5;                                           // relief des vaguelettes
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)];
    const u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
    let nx = (l - r) * S, ny = (u - d) * S;
    const nz = 1, inv = 1 / Math.hypot(nx, ny, nz);
    nx *= inv; ny *= inv;
    const i = (y * size + x) * 4;
    data[i] = Math.round((nx * 0.5 + 0.5) * 255); data[i + 1] = Math.round((ny * 0.5 + 0.5) * 255); data[i + 2] = 255; data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = QUALITY === 'low' ? 1 : 4; tex.needsUpdate = true;
  return tex;
}

/* ---------- matériau ---------- */
const uni = {
  uTime: { value: 0 },
  uStrength: { value: QUALITY === 'low' ? 0.5 : 0.7 },
  uSky: { value: new THREE.Color(0x9ec3d8) },
  uSkyAmt: { value: 1 },
};

function makeWaterMaterial(old) {
  const map = makeWaveTexture(TEX);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x56704a),         // eau limoneuse du Bani (vert-brun)
    roughness: 0.2, metalness: 0.0,
    envMapIntensity: 0.6,
    side: THREE.DoubleSide,
  });
  if (old && old.side !== undefined) mat.side = old.side;
  mat.userData.isRiverWater = true;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni, { uWave: { value: map } });
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', 'varying vec3 vRiverW;\nvoid main() {')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vRiverW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    const two = QUALITY !== 'low';
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', 'uniform sampler2D uWave; uniform float uTime; uniform float uStrength; uniform vec3 uSky; uniform float uSkyAmt;\nvarying vec3 vRiverW;\nvoid main() {')
      .replace('#include <normal_fragment_maps>', `
        {
          vec2 p = vRiverW.xz;
          vec3 nA = texture2D(uWave, p * 0.050 + uTime * vec2(0.022, 0.013)).xyz * 2.0 - 1.0;
          ${two ? 'vec3 nB = texture2D(uWave, p * 0.131 + uTime * vec2(-0.034, 0.024)).xyz * 2.0 - 1.0;\n          vec3 nC = texture2D(uWave, p * 0.310 + uTime * vec2(0.018, -0.040)).xyz * 2.0 - 1.0;' : 'vec3 nB = vec3(0.0); vec3 nC = vec3(0.0);'}
          vec3 nw = normalize(vec3((nA.x + nB.x * 0.7 + nC.x * 0.35) * uStrength, 1.0, (nA.y + nB.y * 0.7 + nC.y * 0.35) * uStrength));
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float fr = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += uSky * (0.05 + fr * 0.55) * uSkyAmt;     // reflet du ciel, plus fort sur les bords vus de biais
        }`);
  };
  mat.customProgramCacheKey = () => 'river-water-' + QUALITY;
  return mat;
}

/* ---------- application au maillage + animation ---------- */
const M = window.MosqueScene;
const state = { ready: false, mesh: null };
let applied = false, tries = 0;

function dayParams() {
  const D = window.DayCycle;
  let elev = 40;
  try { if (D && typeof D.sunElevation === 'number') elev = D.sunElevation; } catch (_) {}
  const day = THREE.MathUtils.smoothstep(elev, -6, 14);                       // 0 la nuit, 1 en plein jour
  const low = 1 - THREE.MathUtils.smoothstep(Math.abs(elev), 4, 28);          // couchant / aube
  uni.uSky.value.setRGB(
    THREE.MathUtils.lerp(0.05, 0.62, day) + low * 0.30,
    THREE.MathUtils.lerp(0.07, 0.76, day) + low * 0.10,
    THREE.MathUtils.lerp(0.14, 0.86, day) - low * 0.10,
  );
  uni.uSkyAmt.value = 0.35 + 0.65 * day;
}

function apply() {
  if (applied || !M || !M.scene) return;
  const waters = [];
  M.scene.traverse((o) => { if (o.isMesh && /^Fleuve/i.test(o.name || '')) waters.push(o); });
  if (!waters.length) return;
  applied = true;
  const shared = makeWaterMaterial(waters[0].material);
  for (const o of waters) {
    const old = o.material;
    o.material = shared;
    o.castShadow = false; o.receiveShadow = false; o.renderOrder = 1;
    for (const m of (Array.isArray(old) ? old : [old])) { try { m.dispose && m.dispose(); } catch (_) {} }
  }
  state.mesh = waters[0]; state.ready = true;
  console.log(`[Fleuve] eau animée appliquée à ${waters.length} maillage(s) — qualité ${QUALITY}`);
}

if (M && M.addFrameHook) {
  let dayT = 0;
  M.addFrameHook((dt) => {
    if (!applied) { if (++tries % 30 === 0 && M.loaded) apply(); return; }
    uni.uTime.value += Math.min(dt, 0.1);
    if ((dayT += dt) > 0.5) { dayT = 0; dayParams(); }
  });
}

window.River = { get ready() { return state.ready; }, get mesh() { return state.mesh; }, setStrength(v) { uni.uStrength.value = +v; } };
