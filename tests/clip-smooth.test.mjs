/**
 * Tests unitaires du lissage des animations de repos (logique pure).
 * Usage : node tests/clip-smooth.test.mjs
 */
import assert from 'node:assert/strict';
import { gaussianKernel, smoothValues, highFrequencyNoise, dampValues } from '../app/clip-smooth.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const rng = (() => { let s = 7; return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296); })();

test('gaussianKernel : somme 1, symétrique, maximum au centre', () => {
  const k = gaussianKernel(6, 2.5);
  assert.equal(k.length, 13);
  close(k.reduce((a, b) => a + b, 0), 1);
  for (let i = 0; i < 6; i++) close(k[i], k[12 - i]);
  assert.ok(k[6] > k[5] && k[5] > k[0]);
});

test('smoothValues : une valeur constante reste constante', () => {
  const v = new Float32Array(3 * 40).fill(2.5);
  const o = smoothValues(v, 3, { loop: true });
  for (const x of o) close(x, 2.5, 1e-5);
});

test('smoothValues : retire le bruit haute fréquence et garde la respiration lente (clip bouclé)', () => {
  const n = 301, slow = [], noisy = [];
  for (let i = 0; i < n; i++) {
    const s = Math.sin((2 * Math.PI * i) / (n - 1)) * 0.05;                      // un cycle de respiration sur tout le clip
    slow.push(s); noisy.push(s + (rng() - 0.5) * 0.02);                          // + tremblement ±1 cm
  }
  noisy[n - 1] = noisy[0];                                                       // clip bouclé : la dernière clé duplique la première
  const out = smoothValues(Float32Array.from(noisy), 1, { loop: true });
  const err = (arr) => Math.sqrt(arr.reduce((a, x, i) => a + (x - slow[i]) ** 2, 0) / n);
  assert.ok(err(out) < 0.4 * err(noisy), `erreur ${err(out)} vs ${err(noisy)}`);
  assert.ok(highFrequencyNoise(out, 1) < 0.2 * highFrequencyNoise(Float32Array.from(noisy), 1));
  const amp = (arr) => Math.max(...arr) - Math.min(...arr);
  assert.ok(amp(out) > 0.9 * amp(slow), 'la respiration lente est conservée');
  close(out[n - 1], out[0], 1e-6);                                               // la boucle reste fermée
});

test('smoothValues : quaternions unitaires, boucle fermée, bruit de rotation réduit', () => {
  const n = 120, q = [];
  for (let i = 0; i < n; i++) {
    const a = Math.sin((2 * Math.PI * i) / (n - 1)) * 0.08 + (rng() - 0.5) * 0.02;   // angle autour de X (rad)
    q.push(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
  }
  for (let c = 0; c < 4; c++) q[(n - 1) * 4 + c] = q[c];
  const src = Float32Array.from(q);
  const out = smoothValues(src, 4, { loop: true, quaternion: true });
  for (let i = 0; i < n; i++) close(Math.hypot(out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]), 1, 1e-5);
  assert.ok(highFrequencyNoise(out, 4, true) < 0.25 * highFrequencyNoise(src, 4, true));
  for (let c = 0; c < 4; c++) close(out[(n - 1) * 4 + c], out[c], 1e-6);
});

test('smoothValues : quaternions de signe opposé (même rotation) sont moyennés sans s’annuler', () => {
  const base = [0.1, 0.2, 0.3, 0.9273618]; const l = Math.hypot(...base); const u = base.map((x) => x / l);
  const v = []; for (let i = 0; i < 30; i++) { const sg = i % 2 ? -1 : 1; v.push(...u.map((x) => sg * x)); }
  const out = smoothValues(Float32Array.from(v), 4, { loop: false, quaternion: true });
  for (let i = 0; i < 30; i++) {
    close(Math.hypot(out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]), 1, 1e-5);
    assert.ok(Math.abs(out[i * 4] * u[0] + out[i * 4 + 1] * u[1] + out[i * 4 + 2] * u[2] + out[i * 4 + 3] * u[3]) > 0.9999);
  }
});

test('smoothValues : clip non bouclé -> les bords sont répétés (pas de dérive vers zéro)', () => {
  const v = Float32Array.from({ length: 50 }, (_, i) => i);                         // rampe 0..49
  const out = smoothValues(v, 1, { loop: false });
  assert.ok(out[0] >= 0 && out[0] < 3 && out[49] <= 49 && out[49] > 46);
  for (let i = 8; i < 42; i++) close(out[i], i, 1e-4);                              // une rampe est conservée à l'intérieur
});

test('smoothValues : trop peu de clés -> copie', () => {
  const v = Float32Array.from([1, 2, 3, 4]);
  assert.deepEqual(Array.from(smoothValues(v, 4)), [1, 2, 3, 4]);
});

test('dampValues : factor 1 ne change rien, 0 fige sur la moyenne, 0,5 divise l’amplitude par deux', () => {
  const v = Float32Array.from({ length: 60 }, (_, i) => 1 + Math.sin(i / 5));
  const same = dampValues(v, 1, 1);
  for (let i = 0; i < v.length; i++) close(same[i], v[i], 1e-6);
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  for (const x of dampValues(v, 1, 0)) close(x, mean, 1e-5);
  const half = dampValues(v, 1, 0.5);
  const amp = (a) => Math.max(...a) - Math.min(...a);
  close(amp(half), 0.5 * amp(v), 1e-4);
});

test('dampValues : rotations — unitaires, amplitude réduite', () => {
  const n = 80, q = [];
  for (let i = 0; i < n; i++) { const a = Math.sin(i / 6) * 0.2; q.push(0, Math.sin(a / 2), 0, Math.cos(a / 2)); }
  const src = Float32Array.from(q);
  const out = dampValues(src, 4, 0.3, true);
  const angle = (arr, i) => 2 * Math.asin(Math.min(1, Math.abs(arr[i * 4 + 1]))) * Math.sign(arr[i * 4 + 1] * arr[i * 4 + 3]);
  let maxS = 0, maxO = 0;
  for (let i = 0; i < n; i++) {
    close(Math.hypot(out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]), 1, 1e-5);
    maxS = Math.max(maxS, Math.abs(angle(src, i))); maxO = Math.max(maxO, Math.abs(angle(out, i)));
  }
  assert.ok(maxO < 0.4 * maxS, `${maxO} vs ${maxS}`);
});

test('dampValues : quaternions de signe opposé (même rotation) -> aucune explosion', () => {
  const u = [0, 0.1, 0, Math.sqrt(1 - 0.01)]; const v = [];
  for (let i = 0; i < 20; i++) { const s = i % 2 ? -1 : 1; v.push(...u.map((x) => s * x)); }
  const out = dampValues(Float32Array.from(v), 4, 0.3, true);
  for (let i = 0; i < 20; i++) assert.ok(Math.abs(out[i * 4 + 1]) > 0.099 && Math.abs(out[i * 4 + 1]) < 0.101);
});

console.log(`\n${passed} tests OK`);
