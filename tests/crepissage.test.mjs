/* Crépissage : couverture du panneau, vitesse du viseur, bras à deux os. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../app/crepissage-logic.js';

test('un panneau vierge est à 0 %, une pose de terre couvre quelques cases', () => {
  const c = L.createCoverage();
  assert.equal(L.percent(c), 0);
  L.stamp(c, 0.5, 0.5);
  assert.equal(L.percent(c), 0, "une seule pose ne suffit pas : il faut repasser la main");
  assert.ok(L.stamp(c, 0.5, 0.5) > 0);
  assert.ok(L.percent(c) > 0 && L.percent(c) < 0.1);
});
test('balayer tout le panneau le termine, et la fin est détectée', () => {
  const c = L.createCoverage();
  for (let v = 0; v <= 1.0001; v += 0.04) for (let u = 0; u <= 1.0001; u += 0.025) { L.stamp(c, u, v); L.stamp(c, u, v); }
  assert.ok(L.percent(c) >= L.DONE_AT);
  assert.equal(L.isDone(c), true);
});
test('poser la terre au même endroit ne fait pas monter le pourcentage indéfiniment', () => {
  const c = L.createCoverage();
  for (let i = 0; i < 50; i++) L.stamp(c, 0.2, 0.2);
  const p = L.percent(c);
  for (let i = 0; i < 50; i++) L.stamp(c, 0.2, 0.2);
  assert.equal(L.percent(c), p);
  assert.ok(p < 0.1);
});
test('le stick a une zone morte et une vitesse croissante', () => {
  assert.equal(L.stickVelocity(0.1, 0.1).mag, 0);
  const a = L.stickVelocity(0.4, 0), b = L.stickVelocity(1, 0);
  assert.ok(a.vx > 0 && b.vx > a.vx);
  assert.ok(Math.abs(b.vx - 0.9) < 1e-6);
});
test('le bras atteint une cible à sa portée, avec des os de bonne longueur', () => {
  const sh = [0, 1.4, 0], l1 = 0.3, l2 = 0.28;
  const r = L.solveTwoBone(sh, [0.1, 1.3, 0.5], l1, l2, [0.3, -1, -0.2]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  assert.ok(d(r.hand, [0.1, 1.3, 0.5]) < 1e-9);
  assert.ok(Math.abs(d(sh, r.elbow) - l1) < 1e-6);
  assert.ok(Math.abs(d(r.elbow, r.hand) - l2) < 1e-6);
  assert.ok(r.elbow[1] < sh[1], 'le coude se plie vers le bas');
});
test('une cible trop loin est ramenée à la portée du bras (bras tendu)', () => {
  const sh = [0, 1.4, 0], r = L.solveTwoBone(sh, [0, 1.4, 3], 0.3, 0.28);
  assert.ok(Math.hypot(r.hand[0] - sh[0], r.hand[1] - sh[1], r.hand[2] - sh[2]) <= 0.58);
});
