/* ==========================================================
   VISÉE PRÉCISE — logique pure (mode Sanctuaire)
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node.
   La caméra de visée reproduit la caméra « Camera » de la scène Blender,
   rigidement attachée au personnage : AIM_CAM_LOCAL, AIM_BODY_YAW,
   AIM_PITCH0, AIM_HFOV_DEG. Autres réglages : AIM_LOOK_MULT, AIM_HIT_RADIUS.
   Caméra liée à l'os de la tête (AIM_CAM_FROM_HEAD) + postures debout/genoux (AIM_POSE_*, aimPoseParams),
   tangage du buste réparti sur la colonne (AIM_SPINE_WEIGHTS, clampAimPitch).
   Dissolution de la tête en visée : AIM_HEAD_FADE_FROM/TO + headFade(blend).
   ========================================================== */

export const AIM_BLEND_SPEED   = 9;     // vitesse du fondu 3e personne <-> visée (exponentiel)
export const AIM_LOOK_MULT     = 0.35;  // sensibilité souris/stick/toucher en visée (1 = normale) ; réduite de 0,6 à 0,35 : viseur plus lent et plus précis. La lunette en dérive (sniper-cam.js)
export const AIM_RANGE         = 60;    // m — portée du rayon de visée
export const AIM_HIT_RADIUS    = 0.6;   // m — tolérance de touche sur le drone ennemi
export const AIM_HIT_RADIUS_NO_ASSIST = 0.3;   // m — tolérance sans « Aide à la visée du gadget » (Options › Jeu)

/** Tolérance de touche selon l'option « Aide à la visée du gadget » (activée par défaut). */
export function aimHitRadius(assist) {
  return assist === false ? AIM_HIT_RADIUS_NO_ASSIST : AIM_HIT_RADIUS;
}
export const AIM_HFOV_DEG   = 46.938;   // objectif 41,459 mm sur capteur 36 mm (caméra Blender)
export const AIM_CAM_LOCAL  = { x: 0.0721, y: 1.5082, z: -0.1715 }; // m Blender, depuis les pieds, repère du personnage (à multiplier par l'échelle du modèle)
export const AIM_BODY_YAW   = 0.4083;   // rad : le corps est tourné de 23,4° par rapport à la direction de visée
export const AIM_PITCH0     = 0.0891;   // rad : tangage de la caméra Blender (+5,1°)

/** Rapproche `current` de `target` (lissage exponentiel indépendant du framerate). */
export function approach(current, target, speed, dt) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** FOV vertical (°) pour un aspect donné : l'angle horizontal est conservé en paysage, l'angle vertical en portrait. */
export function aimVFov(aspect) {
  if (!(aspect >= 1)) return AIM_HFOV_DEG;
  const h = AIM_HFOV_DEG * Math.PI / 180;
  return 2 * Math.atan(Math.tan(h / 2) / aspect) * 180 / Math.PI;
}

/** FOV pour un fondu donné : baseFov à 0, aimVFov(aspect) à 1. */
export function aimFov(baseFov, blend, aspect) {
  return lerp(baseFov, aimVFov(aspect), blend);
}

/** Décalage AIM_CAM_LOCAL tourné par le lacet `yaw` (rotation autour de Y, Three.js), multiplié par `scale` (échelle du modèle). */
export function aimCameraOffset(yaw, scale = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const { x, y, z } = AIM_CAM_LOCAL;
  return { x: (x * c + z * s) * scale, y: y * scale, z: (-x * s + z * c) * scale };
}

/** Multiplicateur de sensibilité de la souris, du toucher et du stick droit. */
export function lookMultiplier(aiming) {
  return aiming ? AIM_LOOK_MULT : 1;
}

/**
 * Le segment [a, b] passe-t-il à moins de `r` du point `c` ?
 * Points : objets { x, y, z }.
 */
export function segmentHitsSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + dx * t - c.x;
  const py = a.y + dy * t - c.y;
  const pz = a.z + dz * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}

export const AIM_HEAD_FADE_FROM = 0.35;  // fondu de la caméra où la tête commence à se dissoudre
export const AIM_HEAD_FADE_TO   = 0.80;  // …et où elle a complètement disparu

/** Opacité retirée à la tête (0 = visible, 1 = dissoute) pour un fondu de caméra donné : smoothstep entre FROM et TO. */
export function headFade(blend) {
  const t = Math.min(1, Math.max(0, (blend - AIM_HEAD_FADE_FROM) / (AIM_HEAD_FADE_TO - AIM_HEAD_FADE_FROM)));
  return t * t * (3 - 2 * t);
}

/* ---------- Caméra liée à la tête, posture debout / à genoux, tangage du buste ---------- */
export const AIM_CAM_FROM_HEAD = { x: 0.0791, y: 0.1174, z: -0.1047 }; // m Blender, depuis l'os de la tête (x2 échelle du modèle)
export const AIM_POSE_STAND = { bodyYaw: 0.4083, pitch0: 0.0891 };
export const AIM_POSE_KNEEL = { bodyYaw: 0.3209, pitch0: -0.0560 };
export const AIM_POSE_SPEED = 8;                      // vitesse du fondu debout <-> genoux (exponentiel)
export const AIM_SPINE_WEIGHTS = [0.3, 0.35, 0.35];   // répartition du tangage sur Spine, Spine1, Spine2 (somme = 1)
export const AIM_PITCH_MIN = -0.8;                    // rad : tangage de visée mini (vers le bas)
export const AIM_PITCH_MAX = 1.45;                    // rad : tangage de visée maxi (vers le haut, ≈ 83°) ; relevé de 0,6 : les drones ennemis tirent depuis le ciel

/** Paramètres de pose pour un mélange mix (0 = debout, 1 = à genoux) : { bodyYaw, pitch0 } interpolés linéairement. */
export function aimPoseParams(mix) {
  return {
    bodyYaw: lerp(AIM_POSE_STAND.bodyYaw, AIM_POSE_KNEEL.bodyYaw, mix),
    pitch0: lerp(AIM_POSE_STAND.pitch0, AIM_POSE_KNEEL.pitch0, mix),
  };
}

/** Décalage caméra depuis la tête : AIM_CAM_FROM_HEAD x scale, tourné par `yaw` autour de Y. */
export function aimOffsetFromHead(yaw, scale = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const { x, y, z } = AIM_CAM_FROM_HEAD;
  return { x: (x * c + z * s) * scale, y: y * scale, z: (-x * s + z * c) * scale };
}

/** Ajustement de la caméra de visée pour le personnage Sahel (pistolet) : AIM_CAM_FROM_HEAD a été calibré sur l'ancien personnage.
 *  Sur le nouveau, la tête est 8,8 cm plus haute dans la pose de visée au pistolet ; sans correction le pistolet sort du bas de l'écran
 *  et sa flamme avec. On abaisse donc la caméra de 6 cm (le pistolet revient dans le tiers inférieur du cadre, comme l'ancien gadget).
 *  On NE la recule PAS jusqu'à AIM_CAM_LOCAL : à cet endroit (19,6 cm plus en arrière) elle se retrouve dans le sac à dos.
 *  Décalage en m Blender, x échelle du modèle, repère du corps. */
export const AIM_CAM_TRIM_SAHEL = { x: -0.03, y: -0.06, z: 0 };

/** Décalage AIM_CAM_TRIM_SAHEL x scale, tourné par `yaw` autour de Y (même repère que aimOffsetFromHead). */
export function aimTrimOffset(yaw, scale = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const { x, y, z } = AIM_CAM_TRIM_SAHEL;
  return { x: (x * c + z * s) * scale, y: y * scale, z: (-x * s + z * c) * scale };
}

/** Borne le tangage de visée dans [AIM_PITCH_MIN, AIM_PITCH_MAX]. */
export function clampAimPitch(p) {
  return Math.min(AIM_PITCH_MAX, Math.max(AIM_PITCH_MIN, p));
}

/* ---------- Plan de coupe proche en visée ---------- */
export const AIM_NEAR = 0.06;   // m : plan de coupe proche en visée (épaules/bras/mains à 20-30 cm de la caméra)

/** Plan de coupe proche pour un fondu donné : interpolation géométrique de baseNear (0) à AIM_NEAR (1). */
export function aimNear(baseNear, blend) {
  return baseNear * Math.pow(AIM_NEAR / baseNear, blend);
}

/* ---------- Rebond du bassin en marche visée (quaternions [x, y, z, w]) ---------- */
export const AIM_BOB_POS = 0.8;   // échelle du rebond/balancement de translation du bassin (1 = amplitude du clip de marche)
export const AIM_BOB_ROT = 0.35;   // échelle des rotations du bassin (balancement) – garde l'arme lisible

/** Produit de Hamilton a ⊗ b. */
export function qMul(a, b) {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function qConj(q) { return [-q[0], -q[1], -q[2], q[3]]; }

export function qNormalize(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Interpolation sphérique par le chemin le plus court : t = 0 -> a, t = 1 -> b (au signe près). */
export function qSlerp(a, b, t) {
  let [bx, by, bz, bw] = b;
  let d = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (d < 0) { d = -d; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  let s0, s1;
  if (d > 0.9995) {            // quasi colinéaires : interpolation linéaire normalisée
    s0 = 1 - t; s1 = t;
  } else {
    const th = Math.acos(d), sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn;
  }
  return qNormalize([a[0] * s0 + bx * s1, a[1] * s0 + by * s1, a[2] * s0 + bz * s1, a[3] * s0 + bw * s1]);
}

/** Moyenne de quaternions : alignés sur l'hémisphère du premier, sommés, normalisés. */
export function qMean(list) {
  const r = [0, 0, 0, 0], q0 = list[0];
  for (const q of list) {
    const sg = (q[0] * q0[0] + q[1] * q0[1] + q[2] * q0[2] + q[3] * q0[3]) < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) r[i] += sg * q[i];
  }
  return qNormalize(r);
}

/** Translation du bassin : base + k·(échantillon − moyenne), pour chaque échantillon [x,y,z]. */
export function bobPositions(base, samples, k) {
  const m = [0, 0, 0];
  for (const s of samples) for (let i = 0; i < 3; i++) m[i] += s[i] / samples.length;
  return samples.map((s) => [base[0] + k * (s[0] - m[0]), base[1] + k * (s[1] - m[1]), base[2] + k * (s[2] - m[2])]);
}

/** Rotation du bassin : qBase ⊗ slerp(identité, qMoyenne⁻¹ ⊗ q_i, k), pour chaque q_i. */
export function bobRotations(baseQ, samples, k) {
  const inv = qConj(qMean(samples));
  return samples.map((q) => qNormalize(qMul(baseQ, qSlerp([0, 0, 0, 1], qMul(inv, q), k))));
}
