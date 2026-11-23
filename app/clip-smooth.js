/* ==========================================================
   LISSAGE D'UNE ANIMATION DE REPOS — logique pure (aucune dépendance Three.js / DOM)
   ----------------------------------------------------------
   Les animations de repos du personnage (capture de mouvement) contiennent du « bruit » haute fréquence : d'une image clé à
   l'autre, les os sautent de quelques dixièmes de degré. Immobile, le personnage a l'air de trembler. Un filtre passe-bas
   (moyenne gaussienne des images voisines, en boucle) retire ce tremblement et garde le mouvement lent (respiration, appui).

   smoothValues(values, itemSize, { radius, sigma, loop, quaternion })  -> nouveau tableau (même taille)
   highFrequencyNoise(values, itemSize, quaternion)                      -> écart moyen entre une clé et la moyenne de ses voisines
   ========================================================== */

/** Poids gaussiens normalisés de -radius à +radius. */
export function gaussianKernel(radius, sigma) {
  const w = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) { const g = Math.exp(-(i * i) / (2 * sigma * sigma)); w.push(g); sum += g; }
  return w.map((x) => x / sum);
}

/**
 * Lisse une piste de valeurs (tableau plat de n éléments de taille itemSize).
 * loop : les images de début et de fin se rejoignent (animation bouclée) ; sinon les bords sont répétés.
 * quaternion : itemSize = 4, chaque rotation est alignée sur l'hémisphère de la clé centrale avant la moyenne, puis normalisée.
 */
export function smoothValues(values, itemSize, { radius = 6, sigma = 2.5, loop = true, quaternion = false } = {}) {
  const n = Math.floor(values.length / itemSize);
  const out = new Float32Array(values.length);
  if (n < 3) { out.set(values); return out; }
  const kernel = gaussianKernel(radius, sigma);
  // clip bouclé : la dernière clé duplique souvent la première ; on l'ignore pour la moyenne circulaire puis on la recopie
  const dup = loop && itemSize > 0 && sameItem(values, 0, n - 1, itemSize);
  const m = dup ? n - 1 : n;
  const at = (i) => (loop ? ((i % m) + m) % m : Math.max(0, Math.min(n - 1, i)));
  const count = loop ? m : n;
  for (let i = 0; i < count; i++) {
    const ci = i * itemSize;
    const acc = new Array(itemSize).fill(0);
    for (let k = -radius; k <= radius; k++) {
      const j = at(i + k) * itemSize, w = kernel[k + radius];
      let sg = 1;
      if (quaternion) { let d = 0; for (let c = 0; c < 4; c++) d += values[ci + c] * values[j + c]; sg = d < 0 ? -1 : 1; }
      for (let c = 0; c < itemSize; c++) acc[c] += w * sg * values[j + c];
    }
    if (quaternion) { const l = Math.hypot(acc[0], acc[1], acc[2], acc[3]) || 1; for (let c = 0; c < 4; c++) acc[c] /= l; }
    for (let c = 0; c < itemSize; c++) out[ci + c] = acc[c];
  }
  if (dup) for (let c = 0; c < itemSize; c++) out[(n - 1) * itemSize + c] = out[c];
  return out;
}

function sameItem(values, a, b, size) {
  for (let c = 0; c < size; c++) if (Math.abs(values[a * size + c] - values[b * size + c]) > 1e-4) return false;
  return true;
}

/** Bruit haute fréquence moyen : pour chaque clé, écart (degrés pour les quaternions, unités sinon) à la moyenne de ses deux voisines. */
export function highFrequencyNoise(values, itemSize, quaternion = false) {
  const n = Math.floor(values.length / itemSize);
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 1; i < n - 1; i++) {
    const a = (i - 1) * itemSize, b = i * itemSize, c = (i + 1) * itemSize;
    if (quaternion) {
      let d = 0; for (let k = 0; k < 4; k++) d += values[a + k] * values[c + k];
      const sg = d < 0 ? -1 : 1;
      const m = [0, 1, 2, 3].map((k) => values[a + k] + sg * values[c + k]);
      const l = Math.hypot(...m) || 1;
      let dot = 0; for (let k = 0; k < 4; k++) dot += (m[k] / l) * values[b + k];
      sum += 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
    } else {
      let e = 0; for (let k = 0; k < itemSize; k++) e += (values[b + k] - 0.5 * (values[a + k] + values[c + k])) ** 2;
      sum += Math.sqrt(e);
    }
  }
  return sum / (n - 2);
}

/**
 * Amortit les oscillations d'une piste autour de sa valeur moyenne : factor = 1 ne change rien, 0 fige la piste sur sa moyenne.
 * Sert à calmer un repos dont le bas du corps se balance (les pieds glissent comme un pendule, faute de cinématique inverse).
 * quaternion : rotations alignées sur l'hémisphère de la moyenne, interpolées linéairement vers elle puis normalisées (petits angles).
 */
export function dampValues(values, itemSize, factor, quaternion = false) {
  const n = Math.floor(values.length / itemSize);
  const out = new Float32Array(values.length);
  if (n < 2 || factor >= 1) { out.set(values); return out; }
  const mean = new Array(itemSize).fill(0);
  const ref = values.slice(0, itemSize);
  for (let i = 0; i < n; i++) {
    let sg = 1;
    if (quaternion) { let d = 0; for (let c = 0; c < 4; c++) d += ref[c] * values[i * 4 + c]; sg = d < 0 ? -1 : 1; }
    for (let c = 0; c < itemSize; c++) mean[c] += (sg * values[i * itemSize + c]) / n;
  }
  if (quaternion) { const l = Math.hypot(mean[0], mean[1], mean[2], mean[3]) || 1; for (let c = 0; c < 4; c++) mean[c] /= l; }
  for (let i = 0; i < n; i++) {
    let sg = 1;
    if (quaternion) { let d = 0; for (let c = 0; c < 4; c++) d += mean[c] * values[i * 4 + c]; sg = d < 0 ? -1 : 1; }
    const o = new Array(itemSize);
    for (let c = 0; c < itemSize; c++) o[c] = mean[c] + factor * (sg * values[i * itemSize + c] - mean[c]);
    if (quaternion) { const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1; for (let c = 0; c < 4; c++) o[c] /= l; }
    for (let c = 0; c < itemSize; c++) out[i * itemSize + c] = o[c];
  }
  return out;
}
