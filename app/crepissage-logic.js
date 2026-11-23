/* ==========================================================
   CRÉPISSAGE — logique pure (aucune dépendance : ni Three.js ni DOM). Testée sous Node (tests/crepissage.test.mjs).
   • Couverture : grille de cases ; chaque coup de main ajoute de la « terre » aux cases proches, une case est couverte à partir de COVER_AT.
   • Viseur : vitesse du point visé selon le stick (zone morte, courbe), bornes du panneau.
   • Bras : solveur à deux os (épaule → coude → main) qui renvoie la position du coude pour qu'une main atteigne une cible.
   Les vecteurs sont des tableaux [x, y, z].
   ========================================================== */

export const GRID_W = 48, GRID_H = 28;     // cases de la grille de couverture
export const COVER_AT = 0.85;              // « terre » minimale pour qu'une case compte comme couverte
export const DONE_AT = 0.95;               // part de cases couvertes qui termine la mission
export const DEADZONE = 0.18;

export function createCoverage(w = GRID_W, h = GRID_H) { return { w, h, a: new Float32Array(w * h) }; }

/** Pose de la terre en (u, v) ∈ [0,1]², rayon `r` (en fraction de la largeur). Renvoie le nombre de cases qui viennent d'être couvertes. */
export function stamp(cov, u, v, r = 0.045, amount = 0.6) {
  const { w, h, a } = cov;
  const cx = u * w, cy = v * h, rx = r * w, ry = r * w;           // rayon carré en cases (le panneau n'est pas carré : on le mesure en largeur)
  const x0 = Math.max(0, Math.floor(cx - rx)), x1 = Math.min(w - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry)), y1 = Math.min(h - 1, Math.ceil(cy + ry));
  let fresh = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
    if (d >= 1) continue;
    const before = a[y * w + x];
    const after = Math.min(1, before + amount * (1 - d * d));
    a[y * w + x] = after;
    if (before < COVER_AT && after >= COVER_AT) fresh++;
  }
  return fresh;
}

/** Part des cases couvertes, de 0 à 1. */
export function percent(cov) {
  let n = 0; const { a } = cov;
  for (let i = 0; i < a.length; i++) if (a[i] >= COVER_AT) n++;
  return n / a.length;
}
export const isDone = (cov) => percent(cov) >= DONE_AT;

/** Stick → vitesse du viseur (fraction du panneau par seconde) : zone morte, puis courbe douce. */
export function stickVelocity(x, y, speed = 0.9) {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return { vx: 0, vy: 0, mag: 0 };
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)), curve = k * k * (3 - 2 * k);
  return { vx: (x / m) * curve * speed, vy: (y / m) * curve * speed, mag: curve };
}
export const clamp01 = (v) => Math.max(0, Math.min(1, v));

/* ---------- bras à deux os ---------- */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Position du coude pour que la main (au bout de deux os de longueurs l1 puis l2, partant de l'épaule) atteigne `target`.
 * `pole` : direction vers laquelle le coude se plie (ex. vers le bas et vers l'extérieur). La cible est ramenée à la portée du bras.
 * Renvoie { elbow, hand } : `hand` est la main réellement atteinte (≠ target si trop loin).
 */
export function solveTwoBone(shoulder, target, l1, l2, pole = [0, -1, 0]) {
  let d = sub(target, shoulder), dl = len(d);
  const maxR = (l1 + l2) * 0.999, minR = Math.abs(l1 - l2) * 1.001 + 1e-4;
  if (dl > maxR) { d = mul(norm(d), maxR); dl = maxR; }
  if (dl < minR) { d = mul(norm(d.some((c) => c) ? d : [0, 0, 1]), minR); dl = minR; }
  const dir = norm(d);
  const a = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl);            // distance de l'épaule au pied de la hauteur du coude
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  let side = sub(pole, mul(dir, dot(pole, dir)));                 // composante du pôle perpendiculaire à l'axe épaule-main
  if (len(side) < 1e-5) side = sub([1, 0, 0], mul(dir, dir[0]));
  side = norm(side);
  const elbow = add(add(shoulder, mul(dir, a)), mul(side, h));
  return { elbow, hand: add(shoulder, d) };
}

/** Lissage exponentiel (indépendant de la fréquence d'images). */
export const damp = (cur, goal, rate, dt) => cur + (goal - cur) * (1 - Math.exp(-rate * dt));
