/**
 * Tests unitaires de la vue du pilote (télécommande + téléphone) : fonctions pures.
 * Usage : node --test tests/drone-remote.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fovFor, aimDrop, formatTelemetry, stickOffset } from '../app/drone-remote.js';

test('fovFor : champ large de près, serré de loin, borné ; décroît avec la distance', () => {
  assert.equal(fovFor(1), 62);                                  // tout près : plafonné
  assert.equal(fovFor(1000), 16);                               // très loin : plancher
  assert.ok(fovFor(12) < fovFor(6) && fovFor(30) < fovFor(12));
  const f = fovFor(12), h = 2 * 12 * Math.tan(f * Math.PI / 360);
  assert.ok(Math.abs(0.9 / h - 0.11) < 0.01, 'le drone occupe ~11 % de la hauteur de l\'écran');
});

test('aimDrop : le point visé descend avec la distance et le champ ; jamais négatif', () => {
  assert.ok(aimDrop(10, 40) > 0);
  assert.ok(aimDrop(20, 40) > aimDrop(10, 40));
  assert.equal(aimDrop(-5, 40), 0);
});

test('formatTelemetry : hauteur, vitesse en km/h, cap normalisé, batterie bornée', () => {
  assert.deepEqual(formatTelemetry({ altM: 17.6, speedMs: 5, headingDeg: -10, battery: 97.4 }), { alt: 'H:18M', speed: '18 KM/H', heading: '350.0°', battery: '97%' });
  assert.deepEqual(formatTelemetry(), { alt: 'H:0M', speed: '0 KM/H', heading: '0.0°', battery: '100%' });
  assert.equal(formatTelemetry({ altM: -3, battery: 140 }).alt, 'H:0M');
  assert.equal(formatTelemetry({ battery: -5 }).battery, '0%');
});

test('stickOffset : proportionnel, borné à un disque de rayon r', () => {
  assert.deepEqual(stickOffset(0, 0), [0, 0]);
  assert.deepEqual(stickOffset(1, 0, 9), [9, 0]);
  const [x, y] = stickOffset(1, 1, 9);
  assert.ok(Math.abs(Math.hypot(x, y) - 9) < 1e-9);
  assert.deepEqual(stickOffset(0.5, -0.5, 10), [5, -5]);
});
