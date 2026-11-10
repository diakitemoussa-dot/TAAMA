/* ==========================================================
   VISÉE DU CANON — repris de Sahel Game (client/src/aimsolve.js)
   ----------------------------------------------------------
   Le joueur vise avec le centre de l'écran, mais le pistolet est tenu à la main, à côté de la caméra :
   sans correction il ne pointerait pas exactement le réticule. On fait donc pivoter la colonne (Spine1)
   d'un petit angle, calculé par itérations, pour que la direction de tir du canon passe par le point visé.
   Le traceur et la flamme partent alors du canon et arrivent EXACTEMENT sur le réticule.
   Aucune dépendance DOM : testable sous Node (tests/aim-solve.test.mjs).
   ========================================================== */
import * as THREE from 'three';

/** Rotation (quaternion, repère monde) à appliquer autour de `pivot` pour que le canon vise `target`.
 *  muzzlePos / muzzleDir : position et direction de tir actuelles du canon. */
export function solveAim(pivot, muzzlePos, muzzleDir, target, iterations = 5) {
  const R = new THREE.Quaternion();
  const mp = new THREE.Vector3(), md = new THREE.Vector3(), want = new THREE.Vector3();
  const step = new THREE.Quaternion();
  for (let i = 0; i < iterations; i++) {
    mp.copy(muzzlePos).sub(pivot).applyQuaternion(R).add(pivot);
    md.copy(muzzleDir).applyQuaternion(R).normalize();
    want.copy(target).sub(mp).normalize();
    step.setFromUnitVectors(md, want);
    R.premultiply(step);
  }
  return R;
}

/** Fait monter ou descendre progressivement le poids de la visée vers `target` (0 ou 1). rate : vitesse (par seconde). */
export function blendWeight(w, target, dt, rate = 9) {
  return w + (target - w) * (1 - Math.exp(-dt * rate));
}

/** Dose une rotation de visée : poids 0 = aucune rotation, 1 = rotation entière. */
export function blendRotation(q, w) {
  return new THREE.Quaternion().slerp(q, w);
}

/** Limite l'angle d'une rotation (en radians) en gardant son axe. */
export function limitRotation(q, maxRad) {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  if (angle <= maxRad) return q;
  const axis = new THREE.Vector3(q.x, q.y, q.z).normalize();
  if (q.w < 0) axis.negate();
  return new THREE.Quaternion().setFromAxisAngle(axis, maxRad);
}

export const AIM_SOLVE_MAX_DEG = 60;   // le buste ne se tord jamais de plus de 60° pour tenir le réticule (valeur de Sahel Game)
