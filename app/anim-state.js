/* ==========================================================
   CHOIX DES ANIMATIONS DU JOUEUR — logique pure (mode Sanctuaire), repris du principe de Sahel Game
   ----------------------------------------------------------
   Sahel Game choisit son animation avec une fonction « état → nom de clip » sans effet de bord (animstate.js, pickClip)
   et règle la durée du fondu selon les deux clips (fadeTime). Taama garde ses propres couches (haut/bas du corps pour
   tirer en marchant) ; ce module n'en extrait que les DÉCISIONS, pour les tester sans navigateur :
     - pickBaseClip  : le clip plein-corps hors tir (idle, idle_look, walk, run) ;
     - pickLowerClip : le clip des jambes quand le buste tire (pas de côté, marche arrière, agenouillé…) ;
     - fadeTime      : durée du fondu entre deux clips.
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node (tests/anim-state.test.mjs).
   Repère : cap = angle autour de Y, le personnage regarde vers (sin cap, cos cap), sa droite est (-cos cap, sin cap).
   ========================================================== */

export const IDLE_LOOK_DELAY = 7;          // secondes d'immobilité avant d'enchaîner sur « idle_look »
export const LOWER_AXIS_MIN  = 0.55;       // part minimale du déplacement sur un axe pour parler de pas de côté / de recul
export const FADE_FAST = 0.18;             // fondu entre deux déplacements (s)
export const FADE_SOFT = 0.4;              // fondu autour de l'arrêt et de la pose agenouillée (s)

/** Clips d'arrêt : y arriver ou en partir doit être progressif (même idée que SOFT de Sahel Game). */
export const SOFT_CLIPS = new Set(['idle', 'idle_look', 'pistol kneeling idle']);

/** Clip plein-corps quand le joueur ne tire pas ni ne saute. idleTime : secondes sans bouger. */
export function pickBaseClip({ moving, running, idleTime = 0, idleLookDelay = IDLE_LOOK_DELAY }) {
  if (moving) return running ? 'run' : 'walk';
  return idleTime >= idleLookDelay ? 'idle_look' : 'idle';
}

/** Clip des jambes pendant un tir ou une visée tenue.
 *  move : déplacement { x, z } en repère monde ; bodyYaw : cap du corps (le buste vise là). */
export function pickLowerClip({ kneeling = false, moving = false, move = null, bodyYaw = 0, running = false }) {
  if (kneeling && !moving) return 'pistol kneeling idle';           // agenouillé : les jambes gardent la pose, le buste tire
  const len = move ? Math.hypot(move.x, move.z) : 0;
  if (moving && len * len > 1e-4) {
    const mx = move.x / len, mz = move.z / len;
    const dFwd = mx * Math.sin(bodyYaw) + mz * Math.cos(bodyYaw);
    const dRgt = -mx * Math.cos(bodyYaw) + mz * Math.sin(bodyYaw);
    const aFwd = Math.abs(dFwd), aRgt = Math.abs(dRgt);
    if (aRgt > aFwd && aRgt > LOWER_AXIS_MIN) return dRgt > 0 ? 'pistol strafe right' : 'pistol strafe left';
    if (aFwd > aRgt && aFwd > LOWER_AXIS_MIN && dFwd < 0) return 'pistol walk backward';
    return running ? 'run' : 'walk';
  }
  return 'idle';
}

/** Durée du fondu (secondes) de `from` vers `to` : longue si l'un des deux est un clip d'arrêt, courte sinon. */
export function fadeTime(from, to) {
  return SOFT_CLIPS.has(from) || SOFT_CLIPS.has(to) ? FADE_SOFT : FADE_FAST;
}
