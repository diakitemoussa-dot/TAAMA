/**
 * Tests unitaires du placement de la caméra 3e personne (logique pure).
 * Usage : node tests/camera-rig.test.mjs
 */
import assert from 'node:assert/strict';
import * as C from '../app/camera-rig.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('preset choisi selon l\'état : agenouillé avant tir, tir avant exploration', () => {
  assert.equal(C.presetFor({}), 'exploration');
  assert.equal(C.presetFor(), 'exploration');
  assert.equal(C.presetFor({ shooting: true }), 'tir');
  assert.equal(C.presetFor({ kneeling: true }), 'agenouille');
  assert.equal(C.presetFor({ kneeling: true, shooting: true }), 'agenouille');
});

test('valeurs de Sahel Game : épaule à 0,6 m, regard 10 m devant, caméra plus basse et plus proche accroupi', () => {
  assert.equal(C.PRESETS.exploration.side, 0.6);
  assert.equal(C.PRESETS.exploration.ahead, 10);
  assert.ok(C.PRESETS.agenouille.up < C.PRESETS.exploration.up);
  close(C.PRESETS.agenouille.distK, 2.8 / 3.2);
});

test('démarre sur le preset d\'exploration', () => {
  const rig = new C.CameraRig();
  assert.deepEqual(rig.cur, C.PRESETS.exploration);
  assert.notEqual(rig.cur, C.PRESETS.exploration, 'copie : les presets ne sont jamais modifiés');
});

test('lissage exponentiel : s\'approche du preset sans le dépasser, l\'atteint à la longue', () => {
  const rig = new C.CameraRig();
  rig.update(0.016, { kneeling: true });
  const first = rig.cur.up;
  assert.ok(first < C.PRESETS.exploration.up && first > C.PRESETS.agenouille.up, 'en chemin');
  for (let i = 0; i < 300; i++) rig.update(0.016, { kneeling: true });
  close(rig.cur.up, C.PRESETS.agenouille.up, 1e-4);
  close(rig.cur.distK, C.PRESETS.agenouille.distK, 1e-4);
  for (let i = 0; i < 300; i++) rig.update(0.016, {});
  close(rig.cur.up, C.PRESETS.exploration.up, 1e-4);
  assert.equal(rig.name, 'exploration');
});

test('le lissage ne dépend pas de la cadence : 1 s en 60 pas ≈ 1 s en 10 pas', () => {
  const a = new C.CameraRig(), b = new C.CameraRig();
  for (let i = 0; i < 60; i++) a.update(1 / 60, { kneeling: true });
  for (let i = 0; i < 10; i++) b.update(0.1, { kneeling: true });
  close(a.cur.up, b.cur.up, 1e-9);
  close(a.cur.side, b.cur.side, 1e-9);
});

test('snap : rejoint le preset tout de suite ; dt nul ou négatif ne bouge pas', () => {
  const rig = new C.CameraRig();
  rig.snap({ kneeling: true });
  assert.deepEqual(rig.cur, C.PRESETS.agenouille);
  rig.update(0, {});
  assert.deepEqual(rig.cur, C.PRESETS.agenouille, 'dt = 0 : pas de mouvement');
  rig.update(-1, {});
  assert.deepEqual(rig.cur, C.PRESETS.agenouille, 'dt négatif : traité comme 0');
});

test('NO_SHOULDER : réglages neutres (ancien comportement, regard sur la tête)', () => {
  assert.deepEqual(C.NO_SHOULDER, { side: 0, up: 0, ahead: 0, distK: 1 });
  const rig = new C.CameraRig({ exploration: C.NO_SHOULDER, tir: C.NO_SHOULDER, agenouille: C.NO_SHOULDER });
  rig.update(1, { kneeling: true });
  assert.deepEqual(rig.cur, C.NO_SHOULDER);
});

console.log(`\n${passed} tests réussis`);
