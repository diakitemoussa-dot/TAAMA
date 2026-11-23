/* ==========================================================
   BÂTIMENTS EN TERRE — un aspect moins « bloc » : enduit, arêtes adoucies, murs faits à la main
   ----------------------------------------------------------
   Les maisons (`Bat_*`, couleurs en attribut de sommet) sont des volumes à angles droits, ombrés à plat, d'un brun sombre uniforme.
   Ce module, sans toucher au modèle ni aux collisions, leur donne l'allure de maisons en banco :
     1. NORMALES ADOUCIES (une fois, au chargement) : chaque normale est mélangée à la moyenne des normales des sommets qui partagent sa position.
        Les angles vifs prennent un dégradé d'ombre (arête « arrondie »), les grandes faces restent plates (le mélange est faible). Voir smoothNormals.
     2. COULEUR : teinte ocre sableuse plus claire (le brun d'origine est gardé pour la variété entre maisons), enduit par plaques (bruit de valeur en
        coordonnées monde, deux échelles), toits un peu plus pâles (face vers le haut).
     3. MURS FAITS À LA MAIN : dans le vertex shader, chaque sommet est déplacé de quelques centimètres selon un bruit lisse de sa position MONDE
        (les sommets qui se touchent bougent pareil : aucune fissure) → arêtes un peu de travers, parapets inégaux. ≤ 9 cm : sans effet sur les collisions.
   Palier « low » (mobile faible) : normales adoucies et couleur seulement (pas de déplacement de sommets, un seul octave de bruit).
   ========================================================== */

/** Adoucit les normales : n' = normalize((1 − w)·n + w·moyenne(n des sommets à la même position)). Fonction pure (Float32Array en entrée, modifiée sur place).
 *  cell : pas de quantification des positions (m). */
export function smoothNormals(positions, normals, weight = 0.3, cell = 0.02) {
  const n = positions.length / 3;
  if (weight <= 0 || n === 0) return normals;
  let size = 1; while (size < n * 2) size <<= 1;
  const mask = size - 1, keys = new Int32Array(size).fill(-1), sx = new Float32Array(size), sy = new Float32Array(size), sz = new Float32Array(size);
  const slot = new Int32Array(n), inv = 1 / cell;
  for (let i = 0; i < n; i++) {
    const qx = Math.round(positions[i * 3] * inv), qy = Math.round(positions[i * 3 + 1] * inv), qz = Math.round(positions[i * 3 + 2] * inv);
    let h = (Math.imul(qx, 73856093) ^ Math.imul(qy, 19349663) ^ Math.imul(qz, 83492791)) & mask;
    const key = (Math.imul(qx, 31) + Math.imul(qy, 17) + Math.imul(qz, 13)) | 0;
    // sonde linéaire ; deux positions sont identiques si hash ET clé coïncident (quantification fine : collisions négligeables)
    while (keys[h] !== -1 && keys[h] !== key) h = (h + 1) & mask;
    keys[h] = key; slot[i] = h;
    sx[h] += normals[i * 3]; sy[h] += normals[i * 3 + 1]; sz[h] += normals[i * 3 + 2];
  }
  const w = weight;
  for (let i = 0; i < n; i++) {
    const h = slot[i], ml = Math.hypot(sx[h], sy[h], sz[h]) || 1;
    const nx = (1 - w) * normals[i * 3] + w * sx[h] / ml, ny = (1 - w) * normals[i * 3 + 1] + w * sy[h] / ml, nz = (1 - w) * normals[i * 3 + 2] + w * sz[h] / ml;
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / l; normals[i * 3 + 1] = ny / l; normals[i * 3 + 2] = nz / l;
  }
  return normals;
}

export const MUD = { normalWeight: 0.32, wobble: 0.085, tint: [0.80, 0.63, 0.43], tintAmount: 0.42, brighten: 1.28 };

const NOISE_GLSL = `
float mudHash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mudNoise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mudHash(i), mudHash(i + vec3(1,0,0)), f.x), mix(mudHash(i + vec3(0,1,0)), mudHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mudHash(i + vec3(0,0,1)), mudHash(i + vec3(1,0,1)), f.x), mix(mudHash(i + vec3(0,1,1)), mudHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

/** Applique le style à un matériau de maisons (MeshStandardMaterial à couleurs de sommet). */
export function styleMaterial(mat, { wobble = true, octaves = 2 } = {}) {
  const key = `mud-${wobble ? 'w' : 'n'}${octaves}`;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWob = { value: MUD.wobble };
    sh.uniforms.uTint = { value: MUD.tint };
    sh.uniforms.uTintAmt = { value: MUD.tintAmount };
    sh.uniforms.uBright = { value: MUD.brighten };
    sh.vertexShader = sh.vertexShader
      .replace('void main() {', `uniform float uWob;\nvarying vec3 vMudW;\nvarying vec3 vMudN;\n${NOISE_GLSL}\nvoid main() {`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 mw = modelMatrix * vec4(transformed, 1.0);
          vMudW = mw.xyz;
          ${wobble ? `
          // murs faits à la main : décalage lisse (bruit de la position monde) ; les sommets qui se touchent bougent pareil
          vec3 q = mw.xyz * 0.55;
          vec3 d = vec3(mudNoise(q) - 0.5, mudNoise(q + 11.3) - 0.5, mudNoise(q + 27.1) - 0.5);
          vec3 off = vec3(d.x, d.y * 0.35, d.z) * 2.0 * uWob;
          transformed += (inverse(mat3(modelMatrix)) * off);` : ''}
        }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\nvMudN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('void main() {', `uniform vec3 uTint; uniform float uTintAmt; uniform float uBright;\nvarying vec3 vMudW;\nvarying vec3 vMudN;\n${NOISE_GLSL}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 c = diffuseColor.rgb;
          float lum = dot(c, vec3(0.299, 0.587, 0.114));
          vec3 sand = uTint * (0.62 + lum * 1.35);                                     // ocre sableux : la luminosité d'origine garde la variété entre maisons
          c = mix(c * uBright, sand, uTintAmt);
          float p1 = mudNoise(vMudW * vec3(0.32, 0.5, 0.32));                           // grandes plaques d'enduit
          ${octaves > 1 ? 'float p2 = mudNoise(vMudW * 2.3);' : 'float p2 = 0.5;'}
          c *= 0.86 + 0.26 * p1 + 0.10 * (p2 - 0.5);
          float up = clamp(vMudN.y, 0.0, 1.0);
          c = mix(c, c * vec3(1.08, 1.05, 0.98), up * 0.6);                              // toits : un peu plus pâles et chauds
          diffuseColor.rgb = c;
        }`);
  };
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
}

/* ---------- application à la scène (une fois la ville chargée) ---------- */
function install() {
  const M = window.MosqueScene; if (!M || !M.scene) return;
  if (/[?&]nomud=1/.test(location.search)) return;                 // ?nomud=1 : aspect d'origine (comparaison)
  const LEVEL = (() => { try { return (window.Quality && window.Quality.level) || 'mid'; } catch (_) { return 'mid'; } })();
  let tries = 0, done = false;
  const apply = () => {
    if (done) return; const bats = [];
    M.scene.traverse((o) => { if (o.isMesh && /^Bat_/.test(o.name || '') && o.geometry && o.geometry.attributes.color) bats.push(o); });
    if (!bats.length) return;
    done = true; const t0 = performance.now(); const mats = new Set(); let verts = 0;
    for (const o of bats) {
      const g = o.geometry, pos = g.attributes.position, nor = g.attributes.normal;
      if (nor && !g.userData.mudSmoothed && pos.itemSize === 3 && nor.itemSize === 3 && nor.array instanceof Float32Array && pos.array instanceof Float32Array) {
        smoothNormals(pos.array, nor.array, MUD.normalWeight); nor.needsUpdate = true; g.userData.mudSmoothed = true; verts += pos.count;
      }
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.isMeshStandardMaterial) mats.add(m);
    }
    for (const m of mats) styleMaterial(m, { wobble: LEVEL !== 'low', octaves: LEVEL === 'low' ? 1 : 2 });
    console.log(`[Banco] ${bats.length} maillages de maisons stylisés (${verts} sommets, ${Math.round(performance.now() - t0)} ms) — qualité ${LEVEL}`);
  };
  if (M.addFrameHook) M.addFrameHook(() => { if (!done && ++tries % 30 === 0 && M.loaded) apply(); });
  window.MudStyle = { get applied() { return done; }, MUD };
}
if (typeof window !== 'undefined') install();
