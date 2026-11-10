/* ==========================================================
   MODE TIREUR D'ÉLITE — logique pure (mode Sanctuaire), repris de Sahel Game
   ----------------------------------------------------------
   Sahel Game règle sa caméra par « presets » exportés de Blender (config/cameras.json) et passe de l'un à l'autre
   par un lissage exponentiel (client/src/camera.js). Son preset Cam_Sniper place la caméra À CÔTÉ DE LA TÊTE, au niveau de
   l'épaule droite (0,53 m à droite, 0,49 m derrière, 1,57 m de haut) avec un FOV de 25°. La tête du personnage reste visible.
   Même méthode ici : sniperCameraPosition() reproduit exactement le calcul de CameraRig.update (position + tangage autour
   d'un point d'appui à hauteur de tête). La sensibilité suit les mêmes rapports : visée ×0,65, tireur d'élite ×0,45.
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node (tests/sniper-cam.test.mjs).
   ========================================================== */
import { AIM_LOOK_MULT } from './aim-system.js?v=8';

// Presets de Sahel Game (cameras.json). dist : recul derrière le joueur ; h : hauteur ; side : décalage vers la droite ; fov vertical (°).
export const SAHEL_CAM_VISEE  = { dist: 1.6,   h: 1.7,   side: 0.55,  fov: 45, look: [0.55, 10.0, 1.6] };
export const SAHEL_CAM_SNIPER = { dist: 0.488, h: 1.569, side: 0.528, fov: 25, look: [-6.48, 28.478, -1.872] };
export const SAHEL_LOOK = { BASE: 1, AIM: 0.65, SNIPER: 0.45 };       // sensibilité relative à la vue normale (sensitivity.js de Sahel Game)
export const SNIPER_PIVOT_H = 1.5;                                    // hauteur du point d'appui du tangage (camera.js : ground + 1,5 m)

const rad = (d) => d * Math.PI / 180;

/** Sensibilité de la souris, du toucher et du stick droit en lunette : même rapport tireur d'élite / visée que Sahel Game. */
export const SNIPER_LOOK_MULT = AIM_LOOK_MULT * (SAHEL_LOOK.SNIPER / SAHEL_LOOK.AIM);

/** Multiplicateur de sensibilité : 1 en vue normale, AIM_LOOK_MULT en visée, SNIPER_LOOK_MULT en lunette. */
export function lookMultiplier(aiming, sniper = false) {
  if (!aiming) return 1;
  return sniper ? SNIPER_LOOK_MULT : AIM_LOOK_MULT;
}

/** FOV vertical (°) de la lunette : 25° comme Cam_Sniper en paysage ; en portrait on garde l'angle HORIZONTAL qu'il donne en 16:9. */
export function sniperVFov(aspect) {
  const v = SAHEL_CAM_SNIPER.fov;
  if (!(aspect < 1)) return v;
  const h = 2 * Math.atan(Math.tan(rad(v / 2)) * 16 / 9);
  return 2 * Math.atan(Math.tan(h / 2) / aspect) * 180 / Math.PI;
}

/** Fondu de FOV : `fovDeg` à blend 0, sniperVFov(aspect) à blend 1. */
export function sniperFov(fovDeg, blend, aspect) {
  const b = Math.max(0, Math.min(1, blend));
  return fovDeg + (sniperVFov(aspect) - fovDeg) * b;
}

/** Place un point du preset dans le monde, comme CameraRig.update : right = décalage vers la droite, forward = décalage vers l'avant,
 *  height = hauteur ABSOLUE depuis les pieds ; puis tangage autour d'un point d'appui à hauteur de tête, axe = droite du joueur. */
function placeRigPoint(ground, yaw, pitch, right, forward, height) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = -fz, rz = fx;                                        // droite = f x haut
  const px = rx * right + fx * forward;
  const py = height - SNIPER_PIVOT_H;
  const pz = rz * right + fz * forward;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  const dot = rx * px + rz * pz;                                  // r . v (r est horizontal)
  const cx = -rz * py, cy = rz * px - rx * pz, cz = rx * py;      // r x v
  const qx = px * c + cx * s + rx * dot * (1 - c);
  const qy = py * c + cy * s;
  const qz = pz * c + cz * s + rz * dot * (1 - c);
  return { x: ground.x + qx, y: ground.y + SNIPER_PIVOT_H + qy, z: ground.z + qz };
}

/**
 * Position de la caméra de lunette (repère monde, y = haut), calculée comme CameraRig.update de Sahel Game :
 * ground = pieds du joueur ; yaw = cap du joueur (il regarde vers (sin yaw, cos yaw)) ; pitch > 0 : regarder en haut.
 * Renvoie { x, y, z }.
 */
export function sniperCameraPosition(ground, yaw, pitch, preset = SAHEL_CAM_SNIPER) {
  return placeRigPoint(ground, yaw, pitch, preset.side, -preset.dist, preset.h);
}

/**
 * Point regardé par la caméra de lunette (même repère). Sahel Game ne regarde PAS droit devant : son preset vise un point
 * `look` décalé (≈ 13,6° à gauche et 6,7° sous l'axe du corps), ce qui place la tête et l'arme sur le côté de l'image
 * et le réticule au centre. Le canon est ensuite calé sur ce centre (app/aim-solve.js).
 */
export function sniperLookTarget(ground, yaw, pitch, preset = SAHEL_CAM_SNIPER) {
  return placeRigPoint(ground, yaw, pitch, preset.look[0], preset.look[1], preset.look[2]);
}

/** Le tireur d'élite exige la visée : renvoie l'état voulu de la lunette selon la bascule, la visée possible et l'arme débloquée. */
export function sniperWanted({ toggled, canAim }) {
  return !!toggled && !!canAim;
}
