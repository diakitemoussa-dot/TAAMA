/**
 * Tests unitaires de la logique de l'eau (aucune dépendance navigateur).
 * Usage : node tests/water.test.mjs
 */
import assert from 'node:assert/strict';
import * as W from '../app/water-logic.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

test('depth : surface − sol, 0 sans eau ou sans sol', () => {
  assert.equal(W.depth(10, 8.5), 1.5);
  assert.equal(W.depth(null, 5), 0);
  assert.equal(W.depth(10, -Infinity), 0);
  assert.equal(W.depth(10, 12), 0);
});

test('waterState : pataugeage dès 0,15 m, nage dès 0,45 m', () => {
  assert.equal(W.waterState('dry', 0.1), 'dry');
  assert.equal(W.waterState('dry', 0.15), 'wade');
  assert.equal(W.waterState('dry', 0.44), 'wade');
  assert.equal(W.waterState('dry', 0.45), 'swim');
  assert.equal(W.waterState('wade', 2), 'swim');
});

test('waterState : hystérésis de la nage (sortie sous 0,30 m)', () => {
  assert.equal(W.waterState('swim', 0.4), 'swim');
  assert.equal(W.waterState('swim', 0.31), 'swim');
  assert.equal(W.waterState('swim', 0.29), 'wade');
  assert.equal(W.waterState('wade', 0.4), 'wade');
});

test('waterState : hystérésis du pataugeage', () => {
  assert.equal(W.waterState('wade', 0.12), 'wade');
  assert.equal(W.waterState('wade', 0.09), 'dry');
  assert.equal(W.waterState('dry', 0.12), 'dry');
});

test('waterState : pas d\'oscillation autour du seuil de nage', () => {
  let s = 'dry', changes = 0;
  for (let i = 0; i < 100; i++) { const n = W.waterState(s, 0.45 + (i % 2 ? 0.04 : -0.04)); if (n !== s) changes++; s = n; }
  assert.ok(changes <= 2, `bascules : ${changes}`);
});

test('deepPose : vertical dès 1,05 m, repasse à plat sous 0,90 m', () => {
  assert.equal(W.deepPose(false, 1.0), false);
  assert.equal(W.deepPose(false, 1.05), true);
  assert.equal(W.deepPose(true, 0.95), true);
  assert.equal(W.deepPose(true, 0.89), false);
});

test('swimPose : à plat en mouvement ou en eau peu profonde, vertical à l\'arrêt en eau profonde', () => {
  assert.equal(W.swimPose(false, false), 'prone');
  assert.equal(W.swimPose(true, false), 'prone');
  assert.equal(W.swimPose(true, true), 'prone');
  assert.equal(W.swimPose(false, true), 'upright');
});

test('swimFeetY : vertical = surface − 1,15 m, à plat = surface − 0,6 m, à ±3 cm', () => {
  for (let t = 0; t < 10; t += 0.1) {
    assert.ok(Math.abs(W.swimFeetY(100, t, 50, false) - (100 - 1.15)) <= 0.0301);
    assert.ok(Math.abs(W.swimFeetY(100, t, 50, true) - (100 - 0.6)) <= 0.0301);
  }
});

test('swimFeetY : jamais sous le sol + 5 cm (eau peu profonde)', () => {
  for (let t = 0; t < 10; t += 0.1) for (const d of [0.3, 0.45, 0.5, 0.9, 1.2]) for (const prone of [true, false]) {
    const g = 100 - d;
    assert.ok(W.swimFeetY(100, t, g, prone) >= g + W.SWIM_CLEAR - 1e-9);
  }
  assert.ok(Math.abs(W.swimFeetY(100, 0, -Infinity, false) - 98.85) < 1e-9);
});

test('swimSpeedMul : ×0,6 / ×0,75 en eau peu profonde, ×0,55 / ×0,7 en eau profonde', () => {
  assert.equal(W.swimSpeedMul(false, 0.5), 0.6);
  assert.equal(W.swimSpeedMul(true, 0.5), 0.75);
  assert.equal(W.swimSpeedMul(false, 1.5), 0.55);
  assert.equal(W.swimSpeedMul(true, 1.5), 0.7);
  assert.equal(W.swimSpeedMul(false), 0.55);
});

test('carSpeedCap : libre à sec, ~6 m/s à 0,5 m, ~3 m/s au-delà de 1 m', () => {
  assert.equal(W.carSpeedCap(0, 34), 34);
  assert.equal(W.carSpeedCap(0.1, 34), 34);
  assert.equal(W.carSpeedCap(0.5, 34), 6);
  assert.equal(W.carSpeedCap(1.0, 34), 3);
  assert.equal(W.carSpeedCap(1.5, 34), 3);
  assert.ok(W.carSpeedCap(0.375, 34) < 34 && W.carSpeedCap(0.375, 34) > 6);
});

test('carSpeedCap : décroissant avec la profondeur', () => {
  let prev = Infinity;
  for (let d = 0; d <= 2; d += 0.05) { const c = W.carSpeedCap(d, 34); assert.ok(c <= prev + 1e-9); prev = c; }
});

test('carDrowned : cale à 1,6 m, repart sous 1,4 m (hystérésis)', () => {
  assert.equal(W.carDrowned(false, 1.5), false);
  assert.equal(W.carDrowned(false, 1.6), true);
  assert.equal(W.carDrowned(true, 1.5), true);
  assert.equal(W.carDrowned(true, 1.39), false);
});

test('budgets de particules par palier', () => {
  assert.equal(W.particleBudget('low'), 40);
  assert.equal(W.particleBudget('mid'), 90);
  assert.equal(W.particleBudget('high'), 160);
  assert.equal(W.particleBudget('?'), 90);
  assert.ok(W.ringBudget('low') < W.ringBudget('high'));
});

console.log(`\n${passed} tests passés`);
