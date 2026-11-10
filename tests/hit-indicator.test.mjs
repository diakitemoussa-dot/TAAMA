/**
 * Tests unitaires des repères de direction des tirs reçus (logique pure, repris de Sahel Game).
 * Usage : node tests/hit-indicator.test.mjs
 */
import assert from 'node:assert/strict';
import { headingTo, indicatorAngle, indicatorAlpha, crescent, arrowhead } from '../app/hit-indicator.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const P = (x, z) => ({ x, z });

test('headingTo : 0 vers +z, +90° vers +x, 180° vers -z', () => {
  close(headingTo(P(0, 0), P(0, 5)), 0);
  close(headingTo(P(0, 0), P(5, 0)), Math.PI / 2);
  close(Math.abs(headingTo(P(0, 0), P(0, -5))), Math.PI);
});

test('indicatorAngle : tireur devant = 0°, derrière = 180°', () => {
  close(indicatorAngle(0, P(0, 0), P(0, 10)), 0);
  close(Math.abs(indicatorAngle(0, P(0, 0), P(0, -10))), 180);
});

test('indicatorAngle : la caméra regarde +z, le tireur est à sa droite (-x) -> +90°, à sa gauche (+x) -> -90°', () => {
  close(indicatorAngle(0, P(0, 0), P(-10, 0)), 90);
  close(indicatorAngle(0, P(0, 0), P(10, 0)), -90);
});

test('indicatorAngle : tourne avec la caméra (le tireur ne bouge pas)', () => {
  const shooter = P(0, 10);
  // la caméra regarde +x (cap 90°) : sa droite est +z, donc le tireur (+z) est à sa droite -> +90° ; en tournant vers lui, l'arc revient devant
  close(indicatorAngle(Math.PI / 2, P(0, 0), shooter), 90);
  assert.ok(Math.abs(indicatorAngle(0, P(0, 0), shooter)) < 1e-9);
  assert.ok(Math.abs(indicatorAngle(Math.PI / 4, P(0, 0), shooter) - 45) < 1e-6);
  assert.ok(Math.abs(indicatorAngle(-Math.PI / 4, P(0, 0), shooter) + 45) < 1e-6);
});

test('indicatorAngle : toujours entre -180° et 180°', () => {
  for (let h = -7; h <= 7; h += 0.37) for (const to of [P(3, 4), P(-6, 2), P(0, -9), P(-2, -2)]) {
    const a = indicatorAngle(h, P(1, 1), to);
    assert.ok(a >= -180 - 1e-9 && a <= 180 + 1e-9, `${a}`);
  }
});

test('indicatorAlpha : pleine un instant, décroît, éteinte après 2,2 s', () => {
  assert.equal(indicatorAlpha(0), 1);
  assert.equal(indicatorAlpha(0.5), 1);
  assert.ok(indicatorAlpha(1.2) < 1 && indicatorAlpha(1.2) > 0);
  assert.ok(indicatorAlpha(2.0) < indicatorAlpha(1.2));
  assert.equal(indicatorAlpha(2.2), 0);
  assert.equal(indicatorAlpha(-1), 0);
});

test('crescent : contour fermé, épais au milieu et effilé aux bouts', () => {
  const pts = crescent(78, 9, 42, 20);
  assert.equal(pts.length, 2 * 21);
  const mid = Math.hypot(...pts[10]) - Math.hypot(...pts[pts.length - 1 - 10]);   // bord extérieur - bord intérieur au milieu
  const end = Math.hypot(...pts[0]) - Math.hypot(...pts[pts.length - 1]);
  assert.ok(mid > 8.5 && mid < 9.5, `épaisseur milieu ${mid}`);
  assert.ok(Math.abs(end) < 1e-9, `épaisseur au bout ${end}`);
  assert.ok(pts[10][1] < 0 && Math.abs(pts[10][0]) < 1e-9);                          // le milieu est tout en haut (angle 0)
});

test('arrowhead : pointe vers l’extérieur (en haut), symétrique, 4 points', () => {
  const a = arrowhead();
  assert.equal(a.length, 4);
  assert.ok(a[0][1] < a[1][1] && a[0][1] < a[3][1]);                                 // la pointe est plus haute que les ailes
  close(a[1][0], -a[3][0]); close(a[1][1], a[3][1]); close(a[0][0], 0);
});

console.log(`\n${passed} tests OK`);
