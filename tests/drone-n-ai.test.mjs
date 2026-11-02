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
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, 13), lineClear: true }), null);
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, 6), lineClear: false }), null);
});

test('senses : un joueur qui court est entendu derrière, mais pas au loin', () => {
  const base = { dronePos: ORIGIN, droneYaw: 0, lineClear: true, playerRunning: true };
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -4) }), 'heard');
  assert.equal(D.senses({ ...base, playerPos: v(0, 0, -8) }), null);
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

console.log('Tous les tests passent.');
