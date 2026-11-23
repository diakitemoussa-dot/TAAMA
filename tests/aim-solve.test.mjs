/**
 * Tests unitaires du solveur de visée du canon (repris de Sahel Game).
 * Usage : node tests/aim-solve.test.mjs
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveAim, blendWeight, blendRotation, limitRotation, AIM_SOLVE_MAX_DEG } from '../app/aim-solve.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angleBetween = (a, b) => a.angleTo(b);

/** Direction du canon après rotation R autour de pivot, vue depuis la bouche tournée : écart (rad) avec la ligne bouche -> cible. */
function residual(R, pivot, mp, md, target) {
  const mp2 = mp.clone().sub(pivot).applyQuaternion(R).add(pivot);
  const md2 = md.clone().applyQuaternion(R).normalize();
  return angleBetween(md2, target.clone().sub(mp2).normalize());
}

test('solveAim : le canon décalé de la caméra finit pointé sur la cible', () => {
  const pivot = V(0, 1.3, 0), mp = V(0.35, 1.35, 0.55), md = V(0.1, 0, 1).normalize();
  for (const t of [V(2, 1.6, 30), V(-6, 1.2, 25), V(0, 4, 12), V(10, 0.5, 8)]) {
    const R = solveAim(pivot, mp, md, t, 5);
    assert.ok(residual(R, pivot, mp, md, t) < 0.005, `écart ${residual(R, pivot, mp, md, t)}`);
  }
});

test('solveAim : canon déjà sur la cible -> rotation (quasi) nulle', () => {
  const pivot = V(0, 1.3, 0), mp = V(0, 1.4, 0.5), md = V(0, 0, 1), t = V(0, 1.4, 30);
  const R = solveAim(pivot, mp, md, t, 5);
  assert.ok(2 * Math.acos(Math.min(1, Math.abs(R.w))) < 1e-6);
});

test('limitRotation : angle borné à 60°, axe conservé, rotation plus petite inchangée', () => {
  const big = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), THREE.MathUtils.degToRad(100));
  const lim = limitRotation(big, THREE.MathUtils.degToRad(AIM_SOLVE_MAX_DEG));
  assert.ok(Math.abs(2 * Math.acos(lim.w) - THREE.MathUtils.degToRad(60)) < 1e-6);
  assert.ok(Math.abs(lim.y) > 0 && Math.abs(lim.x) < 1e-9 && Math.abs(lim.z) < 1e-9);
  const small = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), 0.2);
  assert.equal(limitRotation(small, 1), small);
});

test('limitRotation : rotation « négative » (w < 0) : même résultat', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), THREE.MathUtils.degToRad(120));
  const neg = new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w);
  const a = limitRotation(q, 1), b = limitRotation(neg, 1);
  assert.ok(Math.abs(Math.abs(a.dot(b)) - 1) < 1e-9);
});

test('blendRotation : poids 0 = identité, poids 1 = rotation entière', () => {
  const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), 0.8);
  assert.ok(blendRotation(q, 0).angleTo(new THREE.Quaternion()) < 1e-9);
  assert.ok(blendRotation(q, 1).angleTo(q) < 1e-9);
  assert.ok(Math.abs(blendRotation(q, 0.5).angleTo(new THREE.Quaternion()) - 0.4) < 1e-6);
});

test('blendWeight : dt = 0 ne bouge pas ; converge sans dépasser', () => {
  assert.equal(blendWeight(0.3, 1, 0), 0.3);
  let w = 0;
  for (let i = 0; i < 90; i++) { const n = blendWeight(w, 1, 1 / 60); assert.ok(n >= w && n <= 1); w = n; }
  assert.ok(w > 0.99);
});

console.log(`\n${passed} tests OK`);
