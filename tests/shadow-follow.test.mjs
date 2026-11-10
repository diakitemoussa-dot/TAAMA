/**
 * Tests unitaires du calage de la carte d'ombre sur la grille de ses pixels.
 * Usage : node --test tests/shadow-follow.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapToTexels } from '../app/shadow-follow.js';

const dir = new THREE.Vector3(334, 77, 95).normalize();
const basis = (d) => { const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize(); return [right, new THREE.Vector3().crossVectors(d, right).normalize()]; };

test('le centre calé a ses coordonnées dans le plan de la lumière multiples du pas', () => {
  const [r, u] = basis(dir), texel = 0.0537;
  for (const c of [new THREE.Vector3(12.3, 2.4, -88.1), new THREE.Vector3(-170.2, 5.9, 220.7), new THREE.Vector3(0.001, 0, 0.002)]) {
    const s = snapToTexels(c, dir, texel);
    assert.ok(Math.abs(s.dot(r) / texel - Math.round(s.dot(r) / texel)) < 1e-6);
    assert.ok(Math.abs(s.dot(u) / texel - Math.round(s.dot(u) / texel)) < 1e-6);
  }
});

test('le calage ne déplace jamais de plus d\'un pixel, et pas du tout le long de la lumière', () => {
  const texel = 0.1, c = new THREE.Vector3(7.77, 3.3, -41.9), s = snapToTexels(c, dir, texel);
  assert.ok(s.distanceTo(c) <= texel * Math.SQRT1_2 * 1.0001 + 1e-9);
  assert.ok(Math.abs(s.dot(dir) - c.dot(dir)) < 1e-9);
});

test('petits déplacements : les coordonnées dans le plan de la lumière ne changent que par sauts d un pixel (pas de scintillement)', () => {
  const [r, u] = basis(dir), texel = 0.1; let last = snapToTexels(new THREE.Vector3(0, 0, 0), dir, texel), jumps = 0;
  for (let i = 1; i <= 200; i++) {
    const s = snapToTexels(new THREE.Vector3(i * 0.01, 0, 0), dir, texel);
    const da = Math.abs(s.dot(r) - last.dot(r)), db = Math.abs(s.dot(u) - last.dot(u));
    if (da > 1e-9 || db > 1e-9) { jumps++; assert.ok(Math.max(da, db) < texel * 1.01, 'un saut = au plus un pixel'); }
    last = s;
  }
  assert.ok(jumps > 0 && jumps < 40, `${jumps} sauts`);
});

test('soleil au zénith : repère de secours, sans NaN', () => {
  const s = snapToTexels(new THREE.Vector3(5, 0, 5), new THREE.Vector3(0, 1, 0), 0.1);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.z));
});
