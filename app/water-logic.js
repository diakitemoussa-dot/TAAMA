/* ==========================================================
   EAU — logique pure (aucune dépendance navigateur : testée par tests/water.test.mjs)
   Seuils de pataugeage / nage avec hystérésis, hauteur de nage, traînée de la voiture, budgets de particules.
   ========================================================== */
export const WADE_IN = 0.15, WADE_OUT = 0.10;          // pataugeage : entrée / sortie (m de profondeur)
export const SWIM_IN = 0.45, SWIM_OUT = 0.30;          // nage : entrée / sortie (le joueur nage dès qu'il entre dans l'eau)
export const DEEP_IN = 1.05, DEEP_OUT = 0.90;          // eau profonde : nage verticale (Swim_Idle) possible ; en deçà, à plat ventre (Swim)
export const SWIM_FEET = 1.15;                         // pieds sous la surface en nage verticale (épaules à fleur d'eau)
export const SWIM_FEET_PRONE = 0.6;                    // idem en nage à plat ventre (corps à 0,5–0,8 m au-dessus des pieds)
export const SWIM_CLEAR = 0.05;                        // jamais plus bas que le sol + 5 cm
export const SWIM_BOB = 0.03;                          // flottement sinusoïdal (m)
export const SWIM_WALK_MUL = 0.55, SWIM_RUN_MUL = 0.7;
export const SHALLOW_WALK_MUL = 0.6, SHALLOW_RUN_MUL = 0.75;   // nage en eau peu profonde (< DEEP_OUT)

/** Profondeur = surface − sol ; 0 si pas d'eau ou sol inconnu. */
export function depth(surfaceY, groundY) {
  if (surfaceY === null || surfaceY === undefined || !Number.isFinite(surfaceY) || !Number.isFinite(groundY)) return 0;
  return Math.max(0, surfaceY - groundY);
}

/** État du joueur dans l'eau : 'dry' | 'wade' | 'swim', avec hystérésis (évite les bascules au seuil). */
export function waterState(prev, d) {
  if (!(d > 0)) return 'dry';
  if (prev === 'swim') return d >= SWIM_OUT ? 'swim' : (d >= WADE_OUT ? 'wade' : 'dry');
  if (d >= SWIM_IN) return 'swim';
  if (prev === 'wade') return d >= WADE_OUT ? 'wade' : 'dry';
  return d >= WADE_IN ? 'wade' : 'dry';
}

/** Eau assez profonde pour la nage verticale ? (hystérésis 1,05 / 0,90) */
export function deepPose(prevDeep, d) { return prevDeep ? d >= DEEP_OUT : d >= DEEP_IN; }

/** Hauteur Y des pieds en nage : sous la surface (selon la pose), léger flottement, JAMAIS sous le sol + 5 cm. */
export function swimFeetY(surfaceY, t, groundY = -Infinity, prone = false) {
  const y = surfaceY - (prone ? SWIM_FEET_PRONE : SWIM_FEET) + SWIM_BOB * Math.sin(t * 2.2);
  return Number.isFinite(groundY) ? Math.max(y, groundY + SWIM_CLEAR) : y;
}
/** Clip de nage : à plat ventre (Swim) en mouvement ou en eau peu profonde, vertical (Swim_Idle) à l'arrêt en eau profonde. */
export function swimPose(moving, deep) { return (!moving && deep) ? 'upright' : 'prone'; }
export function swimSpeedMul(running, d = Infinity) {
  if (d < DEEP_OUT) return running ? SHALLOW_RUN_MUL : SHALLOW_WALK_MUL;
  return running ? SWIM_RUN_MUL : SWIM_WALK_MUL;
}

/* ---------- voiture ---------- */
export const CAR_WADE = 0.25, CAR_SLOW_DEPTH = 0.5, CAR_DEEP_DEPTH = 1.0;
export const CAR_SLOW_SPEED = 6, CAR_DEEP_SPEED = 3;
export const CAR_DROWN_IN = 1.6, CAR_DROWN_OUT = 1.4;

const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));

/** Vitesse maximale (m/s) selon la profondeur : libre hors de l'eau, ~6 m/s à 0,5 m, ~3 m/s à partir de 1 m. */
export function carSpeedCap(d, maxFwd) {
  if (!(d >= CAR_WADE)) return maxFwd;
  if (d < CAR_SLOW_DEPTH) return lerp(maxFwd, CAR_SLOW_SPEED, (d - CAR_WADE) / (CAR_SLOW_DEPTH - CAR_WADE));
  if (d < CAR_DEEP_DEPTH) return lerp(CAR_SLOW_SPEED, CAR_DEEP_SPEED, (d - CAR_SLOW_DEPTH) / (CAR_DEEP_DEPTH - CAR_SLOW_DEPTH));
  return CAR_DEEP_SPEED;
}
export function carInWater(d) { return d >= CAR_WADE; }
/** Moteur noyé : cale au-delà de 1,6 m, redémarre sous 1,4 m. */
export function carDrowned(prev, d) { return prev ? d >= CAR_DROWN_OUT : d >= CAR_DROWN_IN; }

/* ---------- budgets de particules par palier ---------- */
export function particleBudget(level) { return level === 'low' ? 40 : level === 'high' ? 160 : 90; }
export function ringBudget(level) { return level === 'low' ? 12 : level === 'high' ? 28 : 20; }
