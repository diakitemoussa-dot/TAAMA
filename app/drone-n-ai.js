/* ==========================================================
   IA DE LA SENTINELLE NEXUS (drone N) — logique pure
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node.
   États : PATROL -> ALERT -> ENGAGE -> SEARCH -> PATROL.
   Positions et directions : objets { x, y, z } (plan horizontal = x/z).

   Version « intelligente » :
   - perception élargie et plus rapide (portée 22 m, cône de 140°, bruit des pas, sixième sens à 3,5 m, réaction 0,25 s) ;
   - poursuite : en combat le drone se rapproche jusqu'à sa distance de tir au lieu de rester sur place, et ne lâche
     le joueur qu'après 3 s sans le voir ; la recherche dure 8 s ;
   - alarme : un drone qui repère le joueur prévient les drones voisins (onAlarm), qui viennent fouiller le secteur ;
   - patrouille « de partout » : au lieu d'une petite boucle fixe, un drone en mode ROAM choisit des points au hasard sur une grande
     zone autour de son poste (pickRoamPoint) et en change dès qu'il en atteint un ou que le chemin est bloqué (skipWaypoint).
   ========================================================== */

export const AI_PATROL = 'PATROL';
export const AI_ALERT  = 'ALERT';
export const AI_ENGAGE = 'ENGAGE';
export const AI_SEARCH = 'SEARCH';

export const DRONE_N_VIEW_RADIUS      = 22.0;  // m — portée de vision (12 avant)
export const DRONE_N_VIEW_HALF_ANGLE  = 70;    // ° — demi-angle du cône frontal (140° au total ; 100° avant)
export const DRONE_N_NEAR_RADIUS      = 3.5;   // m — sixième sens : un joueur aussi proche est repéré sous n'importe quel angle
export const DRONE_N_HEAR_RADIUS      = 10.0;  // m — un joueur qui court est entendu sans être vu (5 avant)
export const DRONE_N_WALK_HEAR_RADIUS = 4.0;   // m — un joueur qui marche est entendu de très près
export const DRONE_N_PATROL_SPEED     = 4.5;   // m/s (3,2 avant)
export const DRONE_N_CHASE_SPEED      = 8.5;   // m/s — poursuite et recherche (6 avant)
export const DRONE_N_REACTION_TIME    = 0.25;  // s — délai entre détection et premier tir (0,6 avant)
export const DRONE_N_LOSE_TIME        = 3.0;   // s — ligne de vue perdue avant de passer en recherche (1,5 avant)
export const DRONE_N_SEARCH_TIME      = 8.0;   // s — balayage à la dernière position connue (4 avant)
export const DRONE_N_WAYPOINT_PAUSE   = 0.6;   // s — pause (scan) à chaque waypoint (1,2 avant)
export const DRONE_N_WAYPOINT_RADIUS  = 6.0;   // m — rayon de la boucle de patrouille classique
export const DRONE_N_WAYPOINT_COUNT   = 4;
export const DRONE_N_SCAN_SPEED       = 3.0;   // rad/s — rotation de balayage (2 avant)
export const DRONE_N_ENGAGE_DIST      = 12.0;  // m — distance de tir : au-delà, le drone se rapproche du joueur
export const DRONE_N_ALARM_RADIUS     = 45.0;  // m — les drones de ce rayon sont prévenus quand l'un d'eux repère le joueur
export const DRONE_N_ROAM_MIN_LEG     = 14.0;  // m — longueur mini d'un trajet de patrouille libre

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
 *  - playerRunning : le joueur court (bruit fort)
 *  - playerMoving : le joueur se déplace (bruit de pas, entendu de très près)
 *  - lineClear : la ligne de vue vers le joueur est dégagée
 * @returns {'seen'|'heard'|null}
 */
export function senses({ dronePos, droneYaw, playerPos, playerRunning, playerMoving = false, lineClear }) {
  if (!lineClear) return null;
  const dist = horizontalDist(dronePos, playerPos);
  if (dist > DRONE_N_VIEW_RADIUS) return null;
  if (dist <= DRONE_N_NEAR_RADIUS) return 'seen';
  const off = Math.abs(angleDiff(droneYaw, yawTo(dronePos, playerPos)));
  if (off <= (DRONE_N_VIEW_HALF_ANGLE * Math.PI) / 180) return 'seen';
  if (playerRunning && dist <= DRONE_N_HEAR_RADIUS) return 'heard';
  if (playerMoving && dist <= DRONE_N_WALK_HEAR_RADIUS) return 'heard';
  return null;
}

/**
 * Point de patrouille libre : tiré au hasard dans le disque `roam` = { center, radius, minLeg? }, à au moins `minLeg` de `from`
 * (sinon le drone ferait du sur-place). rng : générateur dans [0, 1[ (Math.random par défaut, injectable pour les tests).
 */
export function pickRoamPoint(roam, from, rng = Math.random) {
  const minLeg = roam.minLeg ?? DRONE_N_ROAM_MIN_LEG;
  let p = null;
  for (let tries = 0; tries < 10; tries++) {
    const a = rng() * Math.PI * 2, r = roam.radius * Math.sqrt(rng());          // tirage uniforme dans le disque
    p = { x: roam.center.x + Math.sin(a) * r, y: roam.center.y, z: roam.center.z + Math.cos(a) * r };
    if (horizontalDist(from, p) >= minLeg) return p;
  }
  return p;
}

/** État initial de l'IA. `waypoints` : boucle de patrouille ; `roam` : { center, radius, minLeg? } pour patrouiller librement sur une grande zone. */
export function createAI(waypoints, roam = null) {
  return {
    state: AI_PATROL,
    waypoints: roam ? [] : waypoints,   // en mode ROAM le premier point est tiré au premier pas
    roam,
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
  if (ai.roam) ai.waypoints = [];       // nouveau point libre au prochain pas
  ai.pauseT = 0;
  ai.reactT = 0;
  ai.lostT = 0;
  ai.searchT = 0;
  ai.lastKnown = null;
  ai.scanPhase = 0;
  return ai;
}

/** Le waypoint courant est inaccessible : patrouille classique -> point suivant ; patrouille libre -> nouveau tirage au prochain pas. */
export function skipWaypoint(ai) {
  if (ai.roam) { ai.waypoints = []; ai.wpIndex = 0; ai.pauseT = 0; }
  else ai.wpIndex = (ai.wpIndex + 1) % ai.waypoints.length;
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

/** Alarme d'un drone voisin : un drone en PATROL vient fouiller la zone (SEARCH à `pos`). Renvoie true s'il a changé d'état. */
export function onAlarm(ai, pos) {
  if (ai.state !== AI_PATROL) return false;
  ai.state = AI_SEARCH;
  ai.searchT = DRONE_N_SEARCH_TIME;
  ai.lastKnown = { x: pos.x, y: pos.y, z: pos.z };
  return true;
}

/**
 * Avance l'IA d'un pas de temps.
 * @param {object} ai
 * @param {number} dt
 * @param {{ sensed: 'seen'|'heard'|null, playerPos: object, dronePos: object, rng?: () => number }} ctx
 * @returns {{ state: string, changed: boolean, moveTarget: object|null, moveSpeed: number,
 *             faceTarget: object|null, scan: boolean, mayFire: boolean }}
 *   moveTarget : point à rejoindre (null = sur place), faceTarget : point à regarder
 *   (null = direction de marche), scan : balayer en rotation, mayFire : tir autorisé.
 */
export function stepAI(ai, dt, { sensed, playerPos, dronePos, rng }) {
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
      if (ai.roam && !ai.waypoints[ai.wpIndex]) {      // patrouille libre : nouveau point tiré au hasard
        ai.waypoints = [pickRoamPoint(ai.roam, dronePos, rng)];
        ai.wpIndex = 0;
      }
      const wp = ai.waypoints[ai.wpIndex];
      if (horizontalDist(dronePos, wp) < 0.3) {
        ai.pauseT = DRONE_N_WAYPOINT_PAUSE;
        if (ai.roam) ai.waypoints = [];
        else ai.wpIndex = (ai.wpIndex + 1) % ai.waypoints.length;
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
      // Poursuite : tant que le joueur est plus loin que la distance de tir (ou hors de vue), le drone se rapproche de sa dernière position connue.
      if (ai.state === AI_ENGAGE && ai.lastKnown) {
        const gap = horizontalDist(dronePos, ai.lastKnown);
        if (gap > (sensed ? DRONE_N_ENGAGE_DIST : 0.8)) {
          out.moveTarget = ai.lastKnown;
          out.moveSpeed = DRONE_N_CHASE_SPEED;
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
