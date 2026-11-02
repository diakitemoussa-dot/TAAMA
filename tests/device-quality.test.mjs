/**
 * Tests de la détection de qualité (logique pure).
 * Usage : node tests/device-quality.test.mjs
 */
import assert from 'node:assert/strict';
import { pickQuality, detectQuality, storedQuality, QUALITY_PRESETS } from '../app/device-quality.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

test('ordinateur (pointeur précis) : high', () => {
  assert.equal(pickQuality({ coarsePointer: false, memoryGB: 8, cores: 8 }), 'high');
});
test('mobile 2 Go : low', () => {
  assert.equal(pickQuality({ coarsePointer: true, memoryGB: 2, cores: 8 }), 'low');
});
test('mobile 4 cœurs : low', () => {
  assert.equal(pickQuality({ coarsePointer: true, memoryGB: 4, cores: 4 }), 'low');
});
test('mobile 6 Go / 8 cœurs : mid', () => {
  assert.equal(pickQuality({ coarsePointer: true, memoryGB: 6, cores: 8 }), 'mid');
});
test('iPhone (pas de deviceMemory, 6 cœurs, grand écran) : mid', () => {
  assert.equal(pickQuality({ coarsePointer: true, cores: 6 }), 'mid');
});
test('mémoire inconnue et 6+ cœurs (iPhone) : mid, jamais low', () => {
  assert.equal(pickQuality({ coarsePointer: true, cores: 6 }), 'mid');
});
test('forcé dans l\'URL : prioritaire', () => {
  assert.equal(pickQuality({ forced: 'low', coarsePointer: false }), 'low');
  assert.equal(pickQuality({ forced: 'high', coarsePointer: true, memoryGB: 1 }), 'high');
});
test('valeur forcée inconnue : ignorée', () => {
  assert.equal(pickQuality({ forced: 'ultra', coarsePointer: false }), 'high');
});
test('réglages : le mobile ne charge jamais le jeu de tuiles complet', () => {
  assert.equal(QUALITY_PRESETS.low.tilesDir, 'tiles-mobile');
  assert.equal(QUALITY_PRESETS.mid.tilesDir, 'tiles-mobile');
  assert.equal(QUALITY_PRESETS.high.tilesDir, 'tiles');
  assert.ok(QUALITY_PRESETS.low.maxPixelRatio <= QUALITY_PRESETS.mid.maxPixelRatio);
});

const fakeWin = (search, stored) => ({
  navigator: { hardwareConcurrency: 8 },
  location: { search },
  matchMedia: () => ({ matches: false }),
  localStorage: { getItem: () => stored },
});
test('Options › Affichage : la qualité enregistrée est utilisée', () => {
  assert.equal(storedQuality(fakeWin('', 'low')), 'low');
  assert.equal(detectQuality(fakeWin('', 'low')), 'low');
  assert.equal(detectQuality(fakeWin('', null)), 'high');
});
test('l\'URL reste prioritaire sur la qualité enregistrée', () => {
  assert.equal(detectQuality(fakeWin('?q=mid', 'low')), 'mid');
});
test('stockage indisponible (mode privé) : aucune exception', () => {
  const w = fakeWin('', null);
  w.localStorage = { getItem() { throw new Error('bloqué'); } };
  assert.equal(storedQuality(w), null);
  assert.equal(detectQuality(w), 'high');
});

console.log(`\n${passed} tests OK`);
