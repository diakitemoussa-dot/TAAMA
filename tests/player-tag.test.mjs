/**
 * Tests unitaires du repère du joueur (nom + barre de vie jaune) — logique pure.
 * Usage : node tests/player-tag.test.mjs
 */
import assert from 'node:assert/strict';
import { barFraction, tagOpacity, tagVisible, TAG_MAX_DIST, TAG_COLOR } from '../app/player-tag.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('barFraction : vie pleine, moitié, vide, bornes et maximum invalide', () => {
  assert.equal(barFraction(6, 6), 1);
  close(barFraction(3, 6), 0.5);
  assert.equal(barFraction(0, 6), 0);
  assert.equal(barFraction(-2, 6), 0);
  assert.equal(barFraction(9, 6), 1);
  assert.equal(barFraction(3, 0), 0);
});

test('tagOpacity : pleine de près, décroît, plancher à 0,35', () => {
  assert.equal(tagOpacity(0), 1);
  assert.equal(tagOpacity(20), 1);
  assert.ok(tagOpacity(40) < 1 && tagOpacity(40) > 0.35);
  assert.equal(tagOpacity(500), 0.35);
  assert.ok(tagOpacity(30) >= tagOpacity(50));
});

test('tagVisible : devant la caméra et à l’écran seulement', () => {
  assert.equal(tagVisible({ x: 0, y: 0, z: 0.5 }, 5), true);
  assert.equal(tagVisible({ x: 0, y: 0, z: 1.2 }, 5), false);          // derrière la caméra
  assert.equal(tagVisible({ x: 1.5, y: 0, z: 0.5 }, 5), false);        // hors écran à droite
  assert.equal(tagVisible({ x: 0, y: -1.3, z: 0.5 }, 5), false);       // hors écran en bas
  assert.equal(tagVisible({ x: 1.05, y: 0, z: 0.5 }, 5), true);        // juste au bord : encore affiché
});

test('tagVisible : trop loin ou caché sur demande', () => {
  assert.equal(tagVisible({ x: 0, y: 0, z: 0.5 }, TAG_MAX_DIST + 1), false);
  assert.equal(tagVisible({ x: 0, y: 0, z: 0.5 }, 5, true), false);
});

test('la barre est jaune, celui de la charte du jeu (#f9d58b)', () => {
  assert.equal(TAG_COLOR.toLowerCase(), '#f9d58b');
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(TAG_COLOR.slice(i, i + 2), 16));
  assert.ok(r > 200 && g > 180 && b < g && b < r, `${TAG_COLOR} n'est pas jaune`);
});

console.log(`\n${passed} tests OK`);
