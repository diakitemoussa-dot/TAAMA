/**
 * Tests unitaires de l'IA de la Sentinelle NEXUS (aucune dépendance navigateur).
 * Usage : node tests/drone-n-ai.test.mjs
 */
import assert from 'node:assert/strict';
import * as D from '../app/drone-n-ai.js';

const test = (name, fn) => { fn(); console.log(`ok - ${name}`); };
const v = (x, y, z) => ({ x, y, z });
const ORIGIN = v(0, 0, 0);

test('makePatrolWaypoints : 4 points à la bonne distance et hauteur', () => {
  const pts = D.makePatrolWaypoints(v(10, 5, -3));
  assert.equal(pts.length, D.DRONE_N_WAYPOINT_COUNT);
  for (const p of pts) {
    assert.ok(Math.abs(D.horizontalDist(v(10, 5, -3), p) - D.DRONE_N_WAYPOINT_RADIUS) < 1e-9);
    assert.equal(p.y, 5);
  }
});

test('angleDiff : plus court chemin à travers ±PI', () => {
  assert.ok(Math.abs(D.angleDiff(3.0, -3.0) - (2 * Math.PI - 6.0)) < 1e-9);
  assert.ok(Math.abs(D.angleDiff(0, 0.5) - 0.5) < 1e-9);
});

test('yawTo : +Z = 0, +X = PI/2', () => {
  assert.equal(D.yawTo(ORIGIN, v(0, 0, 5)), 0);
  assert.ok(Math.abs(D.yawTo(ORIGIN, v(5, 0, 0)) - Math.PI / 2) < 1e-9);
});

test('senses : vu dans le cône, pas derrière', () => {
  const base = { dronePos: ORIGIN, droneYaw: 0, playerRunning: false, lineClear: true };
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, 6) }), 'seen');
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -6) }), null);
});

test('senses : hors portée ou ligne de vue bloquée', () => {
  const base = { dronePos: ORIGIN, droneYaw: 0, playerRunning: false };
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, D.DRONE_N_VIEW_RADIUS + 1), lineClear: true }), null);
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, D.DRONE_N_VIEW_RADIUS - 1), lineClear: true }), 'seen');
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, 6), lineClear: false }), null);
});

test('senses : un joueur qui court est entendu derrière, mais pas au loin', () => {
  const base = { dronePos: ORIGIN, droneYaw: 0, lineClear: true, playerRunning: true };
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -4) }), 'heard');
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -(D.DRONE_N_HEAR_RADIUS + 2)) }), null);
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -4), playerRunning: false }), null);
});

const ctx = (sensed, dronePos = ORIGIN, playerPos = v(0, 0, 6)) => ({ sensed, dronePos, playerPos });

test('PATROL : avance vers le waypoint puis pause et passe au suivant', () => {
  const wps = D.makePatrolWaypoints(ORIGIN);
  const ai = D.createAI(wps);
  let out = D.stepAI(ai, 0.1, ctx(null));
  assert.equal(out.state, D.AI_PATROL);
  assert.equal(out.moveTarget, wps[0]);
  assert.equal(out.moveSpeed, D.DRONE_N_PATROL_SPEED);
  out = D.stepAI(ai, 0.1, ctx(null, wps[0]));      // arrivé : démarre la pause
  assert.equal(ai.wpIndex, 1);
  out = D.stepAI(ai, 0.1, ctx(null, wps[0]));
  assert.equal(out.scan, true);
  assert.equal(out.mayFire, false);
});

test('PATROL -> ALERT -> ENGAGE : tir autorisé seulement après le délai de réaction', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  let out = D.stepAI(ai, 0.016, ctx('seen'));
  assert.equal(out.state, D.AI_ALERT);
  assert.equal(out.changed, true);
  assert.equal(out.mayFire, false);
  out = D.stepAI(ai, D.DRONE_N_REACTION_TIME / 2, ctx('seen'));
  assert.equal(out.state, D.AI_ALERT);
  out = D.stepAI(ai, D.DRONE_N_REACTION_TIME, ctx('seen'));
  assert.equal(out.state, D.AI_ENGAGE);
  out = D.stepAI(ai, 0.016, ctx('seen'));
  assert.equal(out.mayFire, true);
});

test('ALERT : détection perdue -> SEARCH', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.stepAI(ai, 0.016, ctx('seen'));
  const out = D.stepAI(ai, 0.016, ctx(null));
  assert.equal(out.state, D.AI_SEARCH);
});

test('ENGAGE : tolère une brève perte de vue, puis passe en SEARCH', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 6));
  assert.equal(ai.state, D.AI_ENGAGE);
  let out = D.stepAI(ai, D.DRONE_N_LOSE_TIME / 2, ctx(null));
  assert.equal(out.state, D.AI_ENGAGE);
  assert.equal(out.mayFire, false);
  out = D.stepAI(ai, D.DRONE_N_LOSE_TIME, ctx(null));
  assert.equal(out.state, D.AI_SEARCH);
});

test('ENGAGE : revoir le joueur remet le compteur de perte à zéro', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 6));
  D.stepAI(ai, D.DRONE_N_LOSE_TIME * 0.9, ctx(null));
  D.stepAI(ai, 0.016, ctx('seen'));
  assert.equal(ai.lostT, 0);
});

test('SEARCH : rejoint la dernière position, balaie, puis retourne en PATROL', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 6));
  D.stepAI(ai, D.DRONE_N_LOSE_TIME + 0.1, ctx(null));
  assert.equal(ai.state, D.AI_SEARCH);
  let out = D.stepAI(ai, 0.1, ctx(null, ORIGIN));
  assert.deepEqual(out.moveTarget, v(0, 0, 6));
  assert.equal(out.moveSpeed, D.DRONE_N_CHASE_SPEED);
  out = D.stepAI(ai, 0.1, ctx(null, v(0, 0, 6)));  // sur place : balayage
  assert.equal(out.scan, true);
  out = D.stepAI(ai, D.DRONE_N_SEARCH_TIME + 0.1, ctx(null, v(0, 0, 6)));
  assert.equal(out.state, D.AI_PATROL);
  assert.equal(ai.lastKnown, null);
});

test('SEARCH : joueur retrouvé -> ALERT', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 6));
  D.stepAI(ai, D.DRONE_N_LOSE_TIME + 0.1, ctx(null));
  const out = D.stepAI(ai, 0.016, ctx('heard'));
  assert.equal(out.state, D.AI_ALERT);
});

test('resetAI : retour complet en patrouille', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(1, 0, 1));
  ai.wpIndex = 3;
  D.resetAI(ai);
  assert.equal(ai.state, D.AI_PATROL);
  assert.equal(ai.wpIndex, 0);
  assert.equal(ai.lastKnown, null);
});


// ---------- Version « intelligente » ----------
const rngSeq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('perception : portée 22 m, cône de 140°, sixième sens à 3,5 m', () => {
  assert.equal(D.DRONE_N_VIEW_RADIUS, 22);
  const base = { dronePos: ORIGIN, droneYaw: 0, playerRunning: false, lineClear: true };
  const ang = (deg, d) => v(Math.sin(deg * Math.PI / 180) * d, 0, Math.cos(deg * Math.PI / 180) * d);
  assert.equal(D.senses({ ...base, playerPos: ang(68, 10) }), 'seen');
  assert.equal(D.senses({ ...base, playerPos: ang(100, 10) }), null);
  assert.equal(D.senses({ ...base, playerPos: ang(180, D.DRONE_N_NEAR_RADIUS - 0.1) }), 'seen');
  assert.equal(D.senses({ ...base, playerPos: ang(180, D.DRONE_N_NEAR_RADIUS + 0.5) }), null);
});

test('perception : les pas sont entendus de très près, la course de plus loin', () => {
  const base = { dronePos: ORIGIN, droneYaw: 0, lineClear: true };
  const behind = (d) => v(0, 0, -d);
  assert.equal(D.senses({ ...base, playerPos: behind(4), playerMoving: true, playerRunning: false }), 'heard');
  assert.equal(D.senses({ ...base, playerPos: behind(6), playerMoving: true, playerRunning: false }), null);
  assert.equal(D.senses({ ...base, playerPos: behind(9), playerMoving: true, playerRunning: true }), 'heard');
  assert.equal(D.senses({ ...base, playerPos: behind(4), playerMoving: false, playerRunning: false }), null);
});

test('réactions plus rapides qu’avant : délai de tir 0,25 s, recherche de 8 s, drone plus rapide', () => {
  assert.ok(D.DRONE_N_REACTION_TIME <= 0.25);
  assert.ok(D.DRONE_N_LOSE_TIME >= 3 && D.DRONE_N_SEARCH_TIME >= 8);
  assert.ok(D.DRONE_N_PATROL_SPEED > 3.2 && D.DRONE_N_CHASE_SPEED > 6);
});

test('ENGAGE : le drone se rapproche tant que le joueur est au-delà de sa distance de tir, puis s’arrête pour tirer', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 30));
  let out = D.stepAI(ai, 0.1, { sensed: 'seen', dronePos: ORIGIN, playerPos: v(0, 0, 30) });
  assert.equal(out.state, D.AI_ENGAGE);
  assert.deepEqual(out.moveTarget, v(0, 0, 30));
  assert.equal(out.moveSpeed, D.DRONE_N_CHASE_SPEED);
  assert.equal(out.mayFire, true);
  out = D.stepAI(ai, 0.1, { sensed: 'seen', dronePos: v(0, 0, 30 - D.DRONE_N_ENGAGE_DIST + 1), playerPos: v(0, 0, 30) });
  assert.equal(out.moveTarget, null);
  assert.equal(out.mayFire, true);
});

test('ENGAGE : joueur hors de vue -> le drone fonce vers sa dernière position connue', () => {
  const ai = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.onHit(ai, v(0, 0, 10));
  const out = D.stepAI(ai, 0.1, { sensed: null, dronePos: ORIGIN, playerPos: v(0, 0, 40) });
  assert.equal(out.state, D.AI_ENGAGE);
  assert.deepEqual(out.moveTarget, v(0, 0, 10));
  assert.equal(out.mayFire, false);
});

test('onAlarm : un drone en patrouille vient fouiller la zone, les autres états ne changent pas', () => {
  const a = D.createAI(D.makePatrolWaypoints(ORIGIN));
  assert.equal(D.onAlarm(a, v(5, 0, 7)), true);
  assert.equal(a.state, D.AI_SEARCH);
  assert.deepEqual(a.lastKnown, v(5, 0, 7));
  assert.equal(a.searchT, D.DRONE_N_SEARCH_TIME);
  const out = D.stepAI(a, 0.1, { sensed: null, dronePos: ORIGIN, playerPos: v(0, 0, 50) });
  assert.deepEqual(out.moveTarget, v(5, 0, 7));
  const b = D.createAI(D.makePatrolWaypoints(ORIGIN)); D.onHit(b, v(1, 0, 1));
  assert.equal(D.onAlarm(b, v(9, 0, 9)), false);
  assert.equal(b.state, D.AI_ENGAGE);
  assert.deepEqual(b.lastKnown, v(1, 0, 1));
});

test('pickRoamPoint : dans le disque de patrouille, à hauteur du centre, à distance mini du drone', () => {
  const roam = { center: v(100, 7, -40), radius: 90, minLeg: 14 };
  const rng = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); })();
  const from = v(100, 7, -40);
  const xs = [], zs = [];
  for (let i = 0; i < 400; i++) {
    const p = D.pickRoamPoint(roam, from, rng);
    assert.equal(p.y, 7);
    assert.ok(D.horizontalDist(roam.center, p) <= roam.radius + 1e-9);
    assert.ok(D.horizontalDist(from, p) >= 14 - 1e-9);
    xs.push(p.x); zs.push(p.z);
  }
  assert.ok(Math.max(...xs) - Math.min(...xs) > 120 && Math.max(...zs) - Math.min(...zs) > 120, 'les points doivent couvrir toute la zone');
});

test('pickRoamPoint : tirage déterministe avec un rng fixe, et repli si aucun point assez loin', () => {
  const roam = { center: v(0, 0, 0), radius: 5, minLeg: 100 };
  const p = D.pickRoamPoint(roam, v(0, 0, 0), rngSeq(0.25, 0.5));
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z));
  const q = D.pickRoamPoint({ center: v(0, 0, 0), radius: 50, minLeg: 1 }, v(0, 0, 0), rngSeq(0.25, 1));
  assert.ok(Math.abs(q.x - Math.sin(Math.PI / 2) * 50) < 1e-9 && Math.abs(q.z - Math.cos(Math.PI / 2) * 50) < 1e-9);
});

test('ROAM : le drone tire un point libre, le rejoint, fait une pause puis en choisit un autre loin du précédent', () => {
  const roam = { center: v(0, 3, 0), radius: 80, minLeg: 14 };
  const ai = D.createAI([], roam);
  assert.deepEqual(ai.waypoints, []);
  const rng = rngSeq(0.25, 0.81, 0.6, 0.2);
  let pos = v(0, 3, 0);
  let out = D.stepAI(ai, 0.1, { sensed: null, dronePos: pos, playerPos: v(500, 0, 500), rng });
  assert.equal(out.state, D.AI_PATROL);
  const first = out.moveTarget;
  assert.ok(first && D.horizontalDist(pos, first) >= 14 && D.horizontalDist(roam.center, first) <= 80);
  assert.equal(out.moveSpeed, D.DRONE_N_PATROL_SPEED);
  pos = { ...first };
  out = D.stepAI(ai, 0.1, { sensed: null, dronePos: pos, playerPos: v(500, 0, 500), rng });
  assert.equal(out.moveTarget, null);
  assert.deepEqual(ai.waypoints, []);
  out = D.stepAI(ai, D.DRONE_N_WAYPOINT_PAUSE + 0.1, { sensed: null, dronePos: pos, playerPos: v(500, 0, 500), rng });
  assert.equal(out.scan, true);
  out = D.stepAI(ai, 0.1, { sensed: null, dronePos: pos, playerPos: v(500, 0, 500), rng });
  assert.ok(out.moveTarget && D.horizontalDist(pos, out.moveTarget) >= 14);
  assert.notDeepEqual(out.moveTarget, first);
});

test('skipWaypoint : boucle classique -> point suivant ; patrouille libre -> nouveau tirage', () => {
  const loop = D.createAI(D.makePatrolWaypoints(ORIGIN));
  D.skipWaypoint(loop);
  assert.equal(loop.wpIndex, 1);
  const roamer = D.createAI([], { center: ORIGIN, radius: 50 });
  D.stepAI(roamer, 0.1, { sensed: null, dronePos: ORIGIN, playerPos: v(999, 0, 999), rng: rngSeq(0.3, 0.9) });
  assert.equal(roamer.waypoints.length, 1);
  D.skipWaypoint(roamer);
  assert.deepEqual(roamer.waypoints, []);
});

test('resetAI en mode ROAM : repart sur un nouveau point libre', () => {
  const ai = D.createAI([], { center: ORIGIN, radius: 50 });
  D.stepAI(ai, 0.1, { sensed: null, dronePos: ORIGIN, playerPos: v(999, 0, 999), rng: rngSeq(0.3, 0.9) });
  D.onHit(ai, v(1, 0, 1));
  D.resetAI(ai);
  assert.equal(ai.state, D.AI_PATROL);
  assert.deepEqual(ai.waypoints, []);
  assert.equal(ai.lastKnown, null);
});

test('un drone en ROAM qui voit le joueur passe quand même en ALERT puis ENGAGE', () => {
  const ai = D.createAI([], { center: ORIGIN, radius: 50 });
  let out = D.stepAI(ai, 0.1, { sensed: 'seen', dronePos: ORIGIN, playerPos: v(0, 0, 10) });
  assert.equal(out.state, D.AI_ALERT);
  out = D.stepAI(ai, D.DRONE_N_REACTION_TIME + 0.01, { sensed: 'seen', dronePos: ORIGIN, playerPos: v(0, 0, 10) });
  assert.equal(out.state, D.AI_ENGAGE);
});

console.log('Tous les tests passent.');
