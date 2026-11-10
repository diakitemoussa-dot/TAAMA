/* ==========================================================
   FLEUVE (Bani et bras du Niger) — vraie matière d'eau animée
   ----------------------------------------------------------
   Le modèle de la ville contient une surface plate `Fleuve_Eau`. Ce module la remplace par un matériau d'eau :
     · deux couches de vaguelettes (carte de normales générée en code, aucun fichier) qui défilent en sens
       contraires, en coordonnées MONDE (le maillage n'a pas besoin d'UV) → reflets du soleil qui scintillent ;
     · couleur d'eau limoneuse du Bani (vert-brun) plus claire sur les bords vus de biais (Fresnel) ;
     · reflet du ciel qui suit l'heure du jour (DayCycle) : jour, couchant, nuit.
   · RIVAGE : au chargement, une carte de hauteur du sol (rendu vertical du terrain, une seule fois) et un masque de la surface d'eau sont cuits
     (voir bakeBed). Le matériau en tire la profondeur réelle sous chaque pixel d'eau : l'eau disparaît là où le sol l'atteint (plus de feuille posée
     sur le sable ni de scintillement), devient transparente et claire dans le peu profond avec une frange d'écume au rivage, sombre et opaque au
     large, et s'estompe sur les bords du maillage au-dessus d'un sol bas (plus de plaque qui flotte). Sans extension de rendu flottant : ancien aspect.
   Palier de qualité : « low » (mobile faible) = une seule couche et texture plus petite ; « mid » / « high » = deux couches.
   API : window.River { ready, mesh, setStrength(v) }.
   ========================================================== */
import * as THREE from 'three';
import { detectQuality } from './device-quality.js?v=6';

const QUALITY = (() => { try { return detectQuality(); } catch (_) { return 'mid'; } })();
const TEX = QUALITY === 'low' ? 256 : 512;
const BED_R = 1000;                                         // m : demi-côté de la zone cuite autour de l'origine (la zone jouable)
const BED_RES = QUALITY === 'low' ? 1024 : 2048;            // texels : ~2 m (mobile faible) ou ~1 m par texel
const BED_TOP = 400;                                        // m : hauteur de la caméra de cuisson

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
  uHasBed: { value: 0 },                                    // 1 quand la carte du lit est disponible
  uBed: { value: null },                                    // R = hauteur du sol − niveau de l'eau (m), A = 1 s'il y a du sol
  uMask: { value: null },                                   // R = 1 sur le maillage d'eau
  uBedR: { value: BED_R },
  uMaskTexel: { value: 3 / (2 * BED_R) },                   // 3 m en coordonnées de texture (lissage du bord)
};

function makeWaterMaterial(old) {
  const map = makeWaveTexture(TEX);
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x56704a),         // eau limoneuse du Bani (vert-brun)
    roughness: 0.2, metalness: 0.0,
    transparent: true, depthWrite: false,       // transparence réglée par la profondeur (rivage)
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
      .replace('void main() {', 'uniform sampler2D uWave; uniform float uTime; uniform float uStrength; uniform vec3 uSky; uniform float uSkyAmt; uniform float uHasBed; uniform sampler2D uBed; uniform sampler2D uMask; uniform float uBedR; uniform float uMaskTexel;\nvarying vec3 vRiverW;\nvoid main() {')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (uHasBed > 0.5) {
          vec2 buv = vec2((vRiverW.x + uBedR) / (2.0 * uBedR), (uBedR - vRiverW.z) / (2.0 * uBedR));
          if (buv.x > 0.0 && buv.x < 1.0 && buv.y > 0.0 && buv.y < 1.0) {
            vec4 bed = texture2D(uBed, buv);
            float dep = bed.a > 0.5 ? -bed.r : 30.0;                        // profondeur sous ce pixel d'eau (m)
            if (dep < 0.02) discard;                                        // le sol atteint l'eau : rien à dessiner (pas de z-fighting)
            float m = texture2D(uMask, buv).r;
            m += texture2D(uMask, buv + vec2(uMaskTexel, 0.0)).r + texture2D(uMask, buv - vec2(uMaskTexel, 0.0)).r;
            m += texture2D(uMask, buv + vec2(0.0, uMaskTexel)).r + texture2D(uMask, buv - vec2(0.0, uMaskTexel)).r;
            float edge = smoothstep(0.6, 1.0, m / 5.0);                     // bord du maillage : fondu (une plaque ne reste pas suspendue au-dessus d'un sol bas)
            float a = smoothstep(0.0, 0.5, dep) * (0.66 + 0.34 * smoothstep(0.5, 2.2, dep));
            a *= (1.0 - smoothstep(3.5, 6.0, dep)) * edge;
            diffuseColor.rgb = mix(vec3(0.44, 0.49, 0.35), diffuseColor.rgb, smoothstep(0.05, 1.2, dep));   // clair et sableux dans le peu profond
            float foam = (1.0 - smoothstep(0.02, 0.3, dep)) * edge * (0.75 + 0.25 * sin(uTime * 1.7 + vRiverW.x * 0.8 + vRiverW.z * 0.6));
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.94, 0.88), foam * 0.6);
            diffuseColor.a = max(a, foam * 0.8);
            if (diffuseColor.a < 0.01) discard;
          }
        }`)
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
  mat.customProgramCacheKey = () => 'river-water-shore-' + QUALITY;
  return mat;
}

/* ---------- carte du lit (cuite une fois) ---------- */
/** Rend le terrain (maillages Sol_*) vu d'en haut dans une texture flottante : R = hauteur du sol − niveau de l'eau, A = 1 là où il y a du sol ;
 *  puis la surface d'eau seule dans un masque. Retourne false (ancien aspect) si le rendu flottant n'est pas disponible. */
function bakeBed(water) {
  const r = M.renderer;
  if (!r || !(r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'))) return false;
  const grounds = []; M.scene.traverse((o) => { if (o.isMesh && /^Sol_/i.test(o.name || '')) grounds.push(o); });
  if (!grounds.length) return false;
  water.updateWorldMatrix(true, false);
  const surf = new THREE.Vector3().fromBufferAttribute(water.geometry.attributes.position, 0).applyMatrix4(water.matrixWorld).y;
  const opt = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true };
  const bedRT = new THREE.WebGLRenderTarget(BED_RES, BED_RES, { ...opt, type: THREE.HalfFloatType, format: THREE.RGBAFormat });
  const maskRT = new THREE.WebGLRenderTarget(BED_RES, BED_RES, { ...opt, type: THREE.UnsignedByteType, format: THREE.RGBAFormat });
  const cam = new THREE.OrthographicCamera(-BED_R, BED_R, BED_R, -BED_R, 1, BED_TOP + 300);
  cam.position.set(0, BED_TOP, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.layers.set(5); cam.updateMatrixWorld(true);   // x -> droite, -z -> haut
  const bedMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, uniforms: { uSurf: { value: surf } },
    vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uSurf; varying float vY; void main() { gl_FragColor = vec4(vY - uSurf, 0.0, 0.0, 1.0); }' });
  const maskMat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false,
    vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' });
  // état à restaurer
  const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevBg = M.scene.background, prevFog = M.scene.fog, prevOv = M.scene.overrideMaterial, prevShadow = r.shadowMap.autoUpdate;
  const prevClear = new THREE.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  const layers = []; M.scene.traverse((o) => { if (o.layers) layers.push([o, o.layers.mask]); });
  try {
    for (const g of grounds) g.layers.enable(5);
    water.layers.enable(5);
    M.scene.background = null; M.scene.fog = null; r.shadowMap.autoUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0);
    water.visible = false; M.scene.overrideMaterial = bedMat; r.setRenderTarget(bedRT); r.render(M.scene, cam);
    water.visible = true; for (const g of grounds) g.visible = false; M.scene.overrideMaterial = maskMat; r.setRenderTarget(maskRT); r.render(M.scene, cam);
  } finally {
    for (const g of grounds) g.visible = true;
    water.visible = true;
    for (const [o, mask] of layers) o.layers.mask = mask;
    M.scene.overrideMaterial = prevOv; M.scene.background = prevBg; M.scene.fog = prevFog;
    r.shadowMap.autoUpdate = prevShadow; r.autoClear = prevAuto; r.setClearColor(prevClear, prevAlpha); r.setRenderTarget(prevRT);
    bedMat.dispose(); maskMat.dispose();
  }
  if (state._rts) for (const t of state._rts) t.dispose();           // nouvelle cuisson : les anciennes textures sont libérées
  state._rts = [bedRT, maskRT];
  uni.uBed.value = bedRT.texture; uni.uMask.value = maskRT.texture; uni.uHasBed.value = 1;
  state.bed = { res: BED_RES, radius: BED_R, surf, grounds: grounds.length };
  return true;
}

/* ---------- lit creusé : le fleuve est PROFOND ---------- */
/* Le terrain du modèle est presque plat sous l'eau (30 à 80 cm au milieu du fleuve) : on ne pouvait pas vraiment nager. Au chargement, les sommets du terrain
   (Sol_*) qui sont sous l'eau sont abaissés selon leur distance à la rive : profondeur = 0,30 m par mètre depuis la berge, jusqu'à CARVE_MAX (2,8 m).
   Les routes du réseau de la voiture (assets/data/routes-djenne-voiture.json) qui touchent le fleuve ou passent à moins de 40 m de lui sont épargnées (disque de 16 m, fondu sur
   12 m) : la voiture y passe toujours. La carte du lit et le masque sont ensuite recuits de nouveau (l'eau devient plus sombre au large). */
const CARVE_RES = 1024, CARVE_SLOPE = 0.30, CARVE_MAX = 2.8, FORD_R = 16, FORD_FADE = 12, ROAD_NEAR = 40;
const GK = 0.84, GCB_X = -12.0, GCB_Y = 5.2;                  // mètres réels -> repère du jeu (comme app/city-map.js)

/** Distance (en texels) de chaque cellule vraie de 'inside' à la cellule fausse la plus proche (chamfer 3-4). Cellules fausses = 0. */
function chamfer(inside, W, H) {
  const d = new Float32Array(W * H), BIG = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? BIG : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; let m = d[i];
    if (x > 0) m = Math.min(m, d[i - 1] + 1); if (y > 0) { m = Math.min(m, d[i - W] + 1); if (x > 0) m = Math.min(m, d[i - W - 1] + 1.4142); if (x < W - 1) m = Math.min(m, d[i - W + 1] + 1.4142); } d[i] = m; }
  for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; let m = d[i];
    if (x < W - 1) m = Math.min(m, d[i + 1] + 1); if (y < H - 1) { m = Math.min(m, d[i + W] + 1); if (x < W - 1) m = Math.min(m, d[i + W + 1] + 1.4142); if (x > 0) m = Math.min(m, d[i + W - 1] + 1.4142); } d[i] = m; }
  return d;
}
/** Profondeur cible (m) à dist mètres de la rive. */
export function carveDepth(distM) { return Math.min(CARVE_MAX, CARVE_SLOPE * Math.max(0, distM)); }

async function carveRiver(water) {
  const r = M.renderer, grounds = []; M.scene.traverse((o) => { if (o.isMesh && /^Sol_/i.test(o.name || '')) grounds.push(o); });
  if (!r || !grounds.length || !state.bed || !uni.uMask.value) return false;
  let routes; try { routes = await (await fetch('assets/data/routes-djenne-voiture.json?v=1')).json(); } catch (_) { return false; }     // sans le réseau routier, on ne creuse pas (gués inconnus)
  const surf = state.bed.surf, W = CARVE_RES, H = CARVE_RES, texel = (2 * BED_R) / W;
  // 1. hauteur du sol (8 bits : 16 bits sur R,G) et masque de l'eau, lus sur le CPU
  const rt = new THREE.WebGLRenderTarget(W, H, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, generateMipmaps: false });
  const cam = new THREE.OrthographicCamera(-BED_R, BED_R, BED_R, -BED_R, 1, BED_TOP + 300); cam.position.set(0, BED_TOP, 0); cam.up.set(0, 0, -1); cam.lookAt(0, 0, 0); cam.layers.set(5); cam.updateMatrixWorld(true);
  const mat = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, uniforms: { uSurf: { value: surf } },
    vertexShader: 'varying float vY; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vY = w.y; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uSurf; varying float vY; void main() { float q = floor(clamp((vY - uSurf + 64.0) / 128.0, 0.0, 1.0) * 65535.0); gl_FragColor = vec4(floor(q / 256.0) / 255.0, mod(q, 256.0) / 255.0, 0.0, 1.0); }' });
  const prevRT = r.getRenderTarget(), prevAuto = r.autoClear, prevBg = M.scene.background, prevFog = M.scene.fog, prevOv = M.scene.overrideMaterial, prevShadow = r.shadowMap.autoUpdate;
  const prevClear = new THREE.Color(); r.getClearColor(prevClear); const prevAlpha = r.getClearAlpha();
  const layers = []; M.scene.traverse((o) => { if (o.layers) layers.push([o, o.layers.mask]); });
  const px = new Uint8Array(W * H * 4);
  try {
    for (const g of grounds) g.layers.enable(5);
    M.scene.background = null; M.scene.fog = null; r.shadowMap.autoUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0);
    water.visible = false; M.scene.overrideMaterial = mat; r.setRenderTarget(rt); r.render(M.scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, H, px);
  } finally {
    water.visible = true; for (const [o, mask] of layers) o.layers.mask = mask;
    M.scene.overrideMaterial = prevOv; M.scene.background = prevBg; M.scene.fog = prevFog; r.shadowMap.autoUpdate = prevShadow; r.autoClear = prevAuto; r.setClearColor(prevClear, prevAlpha); r.setRenderTarget(prevRT);
    mat.dispose(); rt.dispose();
  }
  // masque de l'eau (2048² -> 1024² par échantillonnage) : relu depuis le rendu déjà cuit
  const mrt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, generateMipmaps: false }), mm = new THREE.ShaderMaterial({ side: THREE.DoubleSide, fog: false, vertexShader: 'void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }', fragmentShader: 'void main() { gl_FragColor = vec4(1.0); }' });
  const mpx = new Uint8Array(W * H * 4);
  try {
    water.layers.enable(5); const hid = grounds.filter((g) => g.visible); for (const g of hid) g.visible = false;
    M.scene.background = null; M.scene.fog = null; r.shadowMap.autoUpdate = false; r.autoClear = true; r.setClearColor(0x000000, 0); M.scene.overrideMaterial = mm; r.setRenderTarget(mrt); r.render(M.scene, cam); r.readRenderTargetPixels(mrt, 0, 0, W, H, mpx);
    for (const g of hid) g.visible = true;
  } finally {
    water.layers.disable(5); M.scene.overrideMaterial = prevOv; M.scene.background = prevBg; M.scene.fog = prevFog; r.shadowMap.autoUpdate = prevShadow; r.autoClear = prevAuto; r.setClearColor(prevClear, prevAlpha); r.setRenderTarget(prevRT); mm.dispose(); mrt.dispose();
  }
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const hasG = px[i * 4 + 3] > 127; const h = ((px[i * 4] * 256 + px[i * 4 + 1]) / 65535) * 128 - 64; inside[i] = (mpx[i * 4] > 127 && hasG && h < -0.05) ? 1 : 0; }
  const dist = chamfer(inside, W, H);
  // 2. gués du réseau routier : disques protégés
  const prot = new Uint8Array(W * H), toTex = (x, z) => [Math.floor(((x + BED_R) / (2 * BED_R)) * W), Math.floor(((BED_R - z) / (2 * BED_R)) * H)];
  const disc = (x, z, rad) => { const [cx, cy] = toTex(x, z), rr = Math.ceil(rad / texel); for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) { const X = cx + dx, Y = cy + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && dx * dx + dy * dy <= rr * rr) prot[Y * W + X] = 1; } };
  const N = routes.n.map(([e, n]) => [n / GK + GCB_X, e / GK - GCB_Y]);
  // toute route du réseau qui touche le fleuve ou le longe à moins de ROAD_NEAR m est épargnée (pas seulement les gués déclarés : une rampe d'accès ou un tronçon riverain
  // devenu plus profond ou plus raide bloquerait la voiture) ; distance (texels) de chaque cellule au fleuve = chamfer sur le complément
  const notRiver = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) notRiver[i] = inside[i] ? 0 : 1;
  const dRiver = chamfer(notRiver, W, H);
  let fords = 0;
  for (const ed of routes.e) {
    const a = N[ed[0]], b = N[ed[1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / 8)); let near = ed[2] > 0;
    const pts = []; for (let i = 0; i <= k; i++) { const x = a[0] + (b[0] - a[0]) * i / k, z = a[1] + (b[1] - a[1]) * i / k; pts.push([x, z]); if (!near && Math.abs(x) < BED_R && Math.abs(z) < BED_R) { const [tx, ty] = toTex(x, z); if (dRiver[ty * W + tx] * texel < ROAD_NEAR) near = true; } }
    if (near) { for (const [x, z] of pts) disc(x, z, FORD_R); fords++; }
  }
  const notProt = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) notProt[i] = prot[i] ? 0 : 1;
  const dProt = chamfer(notProt, W, H);                         // distance (texels) au gué protégé le plus proche (0 dans le gué)
  // 3. abaisse les sommets des terrains
  const v = new THREE.Vector3(), inv = new THREE.Matrix4(); let moved = 0, maxDrop = 0;
  const smooth = (t) => t * t * (3 - 2 * t);
  for (const g of grounds) {
    const pos = g.geometry.attributes.position; g.updateWorldMatrix(true, false); inv.copy(g.matrixWorld).invert();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(g.matrixWorld);
      if (Math.abs(v.x) >= BED_R || Math.abs(v.z) >= BED_R) continue;
      const [tx, ty] = toTex(v.x, v.z), k = ty * W + tx; if (!inside[k]) continue;
      const target = surf - carveDepth(dist[k] * texel); if (v.y <= target) continue;
      const f = smooth(Math.min(1, (dProt[k] * texel) / FORD_FADE));            // 0 dans un gué, 1 à 12 m
      const ny = v.y + (target - v.y) * f; if (ny >= v.y - 0.01) continue;
      maxDrop = Math.max(maxDrop, v.y - ny); v.y = ny; v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z); moved++;
    }
    pos.needsUpdate = true; g.geometry.computeBoundingBox(); g.geometry.computeBoundingSphere(); if (g.geometry.boundsTree && g.geometry.boundsTree.refit) g.geometry.boundsTree.refit();
  }
  state.carved = { moved, maxDrop: +maxDrop.toFixed(2), fords };
  bakeBed(water);                                                 // carte du lit et masque : à refaire avec le nouveau relief
  return moved > 0;
}

/* ---------- application au maillage + animation ---------- */
const M = window.MosqueScene;
const state = { ready: false, mesh: null, bed: null, carved: null };
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
  try { if (bakeBed(waters[0])) console.log(`[Fleuve] lit cuit : ${state.bed.res}² texels, ${state.bed.grounds} terrain(s), niveau ${state.bed.surf.toFixed(2)}`); } catch (e) { console.warn('[Fleuve] lit non cuit (ancien aspect)', e); uni.uHasBed.value = 0; }
  if (uni.uHasBed.value > 0.5 && !/[?&]nocarve=1/.test(location.search)) carveRiver(waters[0]).then((ok) => { if (ok) console.log(`[Fleuve] lit creusé : ${state.carved.moved} sommets abaissés (jusqu'à ${state.carved.maxDrop} m), ${state.carved.fords} tronçons de route épargnés`); }).catch((e) => console.warn('[Fleuve] creusement ignoré', e));
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

window.River = { get ready() { return state.ready; }, get mesh() { return state.mesh; }, get bed() { return state.bed; }, get carved() { return state.carved; }, setStrength(v) { uni.uStrength.value = +v; } };
