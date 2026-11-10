/* ==========================================================
   PLACEMENT DE LA CAMÉRA 3e PERSONNE — logique pure (mode Sanctuaire), repris du principe de Sahel Game
   ----------------------------------------------------------
   Sahel Game règle sa caméra par « presets » nommés (config/cameras.json : dist, h, side, fov, look) et passe de l'un à
   l'autre par un lissage exponentiel (camera.js, CameraRig). Taama garde son propre calcul final (collision contre les
   murs, sol, eau, caméra aux yeux en visée, lunette, secousses, zoom au tir) ; ce module ne fournit que les RÉGLAGES
   de placement qui changent avec l'état du personnage, déjà lissés :
     side  : décalage latéral de la caméra, vers la droite de l'écran (m) — la vue « par-dessus l'épaule » de Sahel Game ;
     up    : décalage vertical par rapport à la tête (m) ;
     ahead : distance (m) devant la caméra du point regardé. La caméra regarde parallèlement à son axe, décalée de `side` :
             le personnage apparaît un peu à gauche de l'écran, comme dans Sahel Game. 0 = elle regarde la tête (ancien comportement) ;
     distK : facteur appliqué à la distance choisie par le joueur (molette).
   Valeurs dérivées de Cam_Exploration (3,2 m, côté 0,6, 10 m devant) et Cam_Accroupi (2,8 m, 0,5 m plus bas) de Sahel Game.
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node (tests/camera-rig.test.mjs).
   ========================================================== */

export const PRESETS = {
  exploration: { side: 0.6,  up: 0.2,   ahead: 10, distK: 1 },
  tir:         { side: 0.55, up: 0.1,   ahead: 10, distK: 1 },       // Cam_Visee : un peu plus près de l'épaule
  agenouille:  { side: 0.6,  up: -0.35, ahead: 10, distK: 0.875 },   // Cam_Accroupi : caméra plus basse, 2,8 / 3,2 de la distance
};
export const NO_SHOULDER = { side: 0, up: 0, ahead: 0, distK: 1 };   // ancien comportement : caméra dans l'axe, regard sur la tête
export const RIG_SPEED = 10;                                          // vitesse du lissage (s⁻¹), comme CameraRig de Sahel Game
const KEYS = ['side', 'up', 'ahead', 'distK'];

/** Nom du preset selon l'état : { kneeling, shooting }. */
export function presetFor({ kneeling = false, shooting = false } = {}) {
  if (kneeling) return 'agenouille';
  if (shooting) return 'tir';
  return 'exploration';
}

export class CameraRig {
  constructor(presets = PRESETS, speed = RIG_SPEED) {
    this.presets = presets;
    this.speed = speed;
    this.cur = { ...presets.exploration };
    this.name = 'exploration';
  }

  /** Avance d'un pas de temps vers le preset de l'état. Renvoie les réglages courants (objet réutilisé). */
  update(dt, state) {
    this.name = presetFor(state);
    const goal = this.presets[this.name];
    const k = 1 - Math.exp(-Math.max(0, dt) * this.speed);
    for (const key of KEYS) this.cur[key] += (goal[key] - this.cur[key]) * k;
    return this.cur;
  }

  /** Va tout de suite au preset de l'état (téléportation, entrée dans le jeu). */
  snap(state) {
    this.name = presetFor(state);
    Object.assign(this.cur, this.presets[this.name]);
    return this.cur;
  }
}
