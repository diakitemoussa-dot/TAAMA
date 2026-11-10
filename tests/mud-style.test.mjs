/**
 * Tests unitaires de l'adoucissement des normales des maisons (fonction pure).
 * Usage : node --test tests/mud-style.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothNormals } from '../app/mud-style.js';

// deux faces d'un angle droit, sommets dupliqués par face (ombrage à plat) : mur (normale +x) et toit (normale +y), arête commune en (0,0,0)-(0,0,1)
const pos = () => new Float32Array([0, 0, 0, 0, 0, 1, 0, -1, 0,   0, 0, 0, 0, 0, 1, -1, 0, 0]);
const nor = () => new Float32Array([1, 0, 0, 1, 0, 0, 1, 0, 0,   0, 1, 0, 0, 1, 0, 0, 1, 0]);
const len = (n, i) => Math.hypot(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);

test('poids 0 : rien ne change', () => {
  const n = nor(); smoothNormals(pos(), n, 0);
  assert.deepEqual(Array.from(n), Array.from(nor()));
});

test('sommets d\'arête : les deux faces se rapprochent de la diagonale ; sommets libres : seulement normalisés, inchangés', () => {
  const n = nor(); smoothNormals(pos(), n, 0.4);
  assert.ok(n[0] < 1 && n[1] > 0.1, `arête, face +x : ${[n[0], n[1], n[2]]}`);      // sommet 0 (arête) : légèrement vers +y
  assert.ok(n[9 + 0] > 0.1 && n[9 + 1] < 1, `arête, face +y : ${[n[9], n[10], n[11]]}`);
  assert.deepEqual([n[6], n[7], n[8]], [1, 0, 0]);                                    // sommet libre de la face +x
  assert.deepEqual([n[15], n[16], n[17]], [0, 1, 0]);
  for (let i = 0; i < 6; i++) assert.ok(Math.abs(len(n, i) - 1) < 1e-6);
});

test('plus le poids est grand, plus l\'arête s\'arrondit (les normales des deux faces convergent)', () => {
  const a = nor(), b = nor(); smoothNormals(pos(), a, 0.2); smoothNormals(pos(), b, 0.6);
  const ang = (n) => Math.acos(Math.min(1, n[0] * n[9] + n[1] * n[10] + n[2] * n[11]));
  assert.ok(ang(b) < ang(a) && ang(a) < Math.PI / 2);
});

test('une face plane (normales identiques) reste intacte', () => {
  const p = new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]), n = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
  smoothNormals(p, n, 0.5); assert.deepEqual(Array.from(n), [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]);
});

test('tableau vide ou poids nul : sans erreur', () => { smoothNormals(new Float32Array(0), new Float32Array(0), 0.3); smoothNormals(new Float32Array(3), new Float32Array(3), 0); });
