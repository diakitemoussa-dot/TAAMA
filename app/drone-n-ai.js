/* ==========================================================
   IA DE LA SENTINELLE NEXUS (drone N) — logique pure
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node.
   États : PATROL -> ALERT -> ENGAGE -> SEARCH -> PATROL.
   Positions et directions : objets { x, y, z } (plan horizontal = x/z).
   ========================================================== */

export const AI_PATROL = 'PATROL';
export const AI_ALERT  = 'ALERT';
export const AI_ENGAGE = 'ENGAGE';
export const AI_SEARCH = 'SEARCH';

export const DRONE_N_VIEW_RADIUS     = 12.0;  // m — portée de vision
export const DRONE_N_VIEW_HALF_ANGLE = 50;    // ° — demi-angle du cône frontal (100° au total)
export const DRONE_N_HEAR_RADIUS     = 5.0;   // m — un joueur qui court est entendu sans être vu
export const DRONE_N_PATROL_SPEED    = 3.2;   // m/s
export const DRONE_N_CHASE_SPEED     = 6.0;   // m/s — rapprochement en recherche
export const DRONE_N_REACTION_TIME   = 0.6;   // s — délai entre détection et premier tir
export const DRONE_N_LOSE_TIME       = 1.5;   // s — ligne de vue perdue avant de passer en recherche
export const DRONE_N_SEARCH_TIME     = 4.0;   // s — balayage à la dernière position connue
export const DRONE_N_WAYPOINT_PAUSE  = 1.2;   // s — pause (scan) à chaque waypoint
export const DRONE_N_WAYPOINT_RADIUS = 6.0;   // m — rayon de la boucle de patrouille
export const DRONE_N_WAYPOINT_COUNT  = 4;
export const DRONE_N_SCAN_SPEED      = 2.0;   // rad/s — rotation de balayage

/** Boucle de patrouille autour de `center` (points à hauteur `center.y`). */
export function makePatrolWaypoints(center, radius = DRONE_N_WAYPOINT_RADIUS, count = DRONE_N_WAYPOINT_COUNT) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    pts.push({ x: center.x + Math.sin(a) * radius, y: center.y, z: center.z + Math.cos(a) * radius });
  }
  return pts;
}

/** Distance horizontale entre deux points. */
export function horizontalDist(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

/** Lacet (rad) pour regarder de `from` vers `to` (convention du jeu : atan2(dx, dz), nez = +Z). */
export function yawTo(from, to) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

/** Écart angulaire signé le plus court entre deux lacets, dans [-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Le drone perçoit-il le joueur ?
 * @param {object} p
 *  - dronePos, droneYaw : position et lacet du drone
 *  - playerPos
 *  - playerRunning : le joueur court (bruit)
 *  - lineClear : la ligne de vue vers le joueur est dégagée
 * @returns {'seen'|'heard'|null}
 */
export function senses({ dronePos, droneYaw, playerPos, playerRunning, lineClear }) {
  if (!lineClear) return null;
  const dist = horizontalDist(dronePos, playerPos);
  if (dist > DRONE_N_VIEW_RADIUS) return null;
  if (dist < 0.05) return 'seen';
  const off = Math.abs(angleDiff(droneYaw, yawTo(dronePos, playerPos)));
  if (off <= (DRONE_N_VIEW_HALF_ANGLE * Math.PI) / 180) return 'seen';
  if (playerRunning && dist <= DRONE_N_HEAR_RADIUS) return 'heard';
  return null;
}

/** État initial de l'IA. `waypoints` : boucle de patrouille. */
export function createAI(waypoints) {
  return {
    state: AI_PATROL,
    waypoints,
    wpIndex: 0,
    pauseT: 0,         // pause restante au waypoint
    reactT: 0,         // délai de réaction restant (ALERT)
    lostT: 0,          // temps écoulé sans ligne de vue (ENGAGE)
    searchT: 0,        // temps de recherche restant (SEARCH)
    lastKnown: null,   // dernière position connue du joueur
    scanPhase: 0,      // phase du balayage (rad)
  };
}

/** Remet l'IA en patrouille (respawn, entrée/sortie du sanctuaire). */
export function resetAI(ai) {
  ai.state = AI_PATROL;
  ai.wpIndex = 0;
  ai.pauseT = 0;
  ai.reactT = 0;
  ai.lostT = 0;
  ai.searchT = 0;
  ai.lastKnown = null;
  ai.scanPhase = 0;
  return ai;
}

/** Le drone touché sait où est le joueur : alerte immédiate sans délai de réaction. */
export function onHit(ai, playerPos) {
  ai.lastKnown = { x: playerPos.x, y: playerPos.y, z: playerPos.z };
  ai.lostT = 0;
  if (ai.state !== AI_ENGAGE) {
    ai.state = AI_ENGAGE;
    ai.reactT = 0;
  }
}

/**
 * Avance l'IA d'un pas de temps.
 * @param {object} ai
 * @param {number} dt
 * @param {{ sensed: 'seen'|'heard'|null, playerPos: object, dronePos: object }} ctx
 * @returns {{ state: string, changed: boolean, moveTarget: object|null, moveSpeed: number,
 *             faceTarget: object|null, scan: boolean, mayFire: boolean }}
 *   moveTarget : point à rejoindre (null = sur place), faceTarget : point à regarder
 *   (null = direction de marche), scan : balayer en rotation, mayFire : tir autorisé.
 */
export function stepAI(ai, dt, { sensed, playerPos, dronePos }) {
  const prev = ai.state;
  const out = { state: prev, changed: false, moveTarget: null, moveSpeed: 0, faceTarget: null, scan: false, mayFire: false };

  if (sensed) ai.lastKnown = { x: playerPos.x, y: playerPos.y, z: playerPos.z };

  switch (ai.state) {
    case AI_PATROL: {
      if (sensed) {
        ai.state = AI_ALERT;
        ai.reactT = DRONE_N_REACTION_TIME;
        break;
      }
      if (ai.pauseT > 0) {
        ai.pauseT -= dt;
        out.scan = true;
        break;
      }
      const wp = ai.waypoints[ai.wpIndex];
      if (horizontalDist(dronePos, wp) < 0.3) {
        ai.pauseT = DRONE_N_WAYPOINT_PAUSE;
        ai.wpIndex = (ai.wpIndex + 1) % ai.waypoints.length;
      } else {
        out.moveTarget = wp;
        out.moveSpeed = DRONE_N_PATROL_SPEED;
      }
      break;
    }
    case AI_ALERT: {
      out.faceTarget = ai.lastKnown || playerPos;
      if (!sensed) {
        ai.state = AI_SEARCH;
        ai.searchT = DRONE_N_SEARCH_TIME;
        break;
      }
      ai.reactT -= dt;
      if (ai.reactT <= 0) {
        ai.state = AI_ENGAGE;
        ai.lostT = 0;
      }
      break;
    }
    case AI_ENGAGE: {
      out.faceTarget = ai.lastKnown || playerPos;
      if (sensed) {
        ai.lostT = 0;
        out.mayFire = true;
      } else {
        ai.lostT += dt;
        if (ai.lostT >= DRONE_N_LOSE_TIME) {
          ai.state = AI_SEARCH;
          ai.searchT = DRONE_N_SEARCH_TIME;
        }
      }
      break;
    }
    case AI_SEARCH: {
      if (sensed) {
        ai.state = AI_ALERT;
        ai.reactT = DRONE_N_REACTION_TIME;
        break;
      }
      const target = ai.lastKnown;
      if (target && horizontalDist(dronePos, target) > 0.8) {
        out.moveTarget = target;
        out.moveSpeed = DRONE_N_CHASE_SPEED;
        break;
      }
      // Sur place : balayage jusqu'à épuisement du délai.
      ai.searchT -= dt;
      out.scan = true;
      if (ai.searchT <= 0) {
        ai.state = AI_PATROL;
        ai.lastKnown = null;
        ai.pauseT = 0;
      }
      break;
    }
    default:
      ai.state = AI_PATROL;
  }

  out.state = ai.state;
  out.changed = ai.state !== prev;
  return out;
}
