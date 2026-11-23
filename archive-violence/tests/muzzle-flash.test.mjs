/**
 * Tests unitaires de la flamme de canon (logique pure, aucune dépendance navigateur).
 * Usage : node tests/muzzle-flash.test.mjs
 */
import assert from 'node:assert/strict';
import { mulberry32, ParticlePool, heatColor, flashLevel, burstSpecs, impactSpecs, FLAME_SIZE } from '../app/muzzle-flash.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

test('mulberry32 : même graine, même suite ; valeurs dans [0, 1[', () => {
  const a = mulberry32(3), b = mulberry32(3);
  for (let i = 0; i < 50; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('heatColor : braise rouge à 0, cœur blanc-jaune à 1, bornes respectées', () => {
  assert.deepEqual(heatColor(0), [0.34, 0.07, 0.02]);
  assert.deepEqual(heatColor(1), [1.0, 0.96, 0.75]);
  assert.deepEqual(heatColor(-5), heatColor(0));
  assert.deepEqual(heatColor(9), heatColor(1));
  const mid = heatColor(0.35);
  assert.ok(Math.abs(mid[0] - 1) < 1e-9 && Math.abs(mid[1] - 0.38) < 1e-9);   // orange franc à 0,35
});

test('flashLevel : maximal à 0, décroît, éteint à la fin de sa durée', () => {
  assert.equal(flashLevel(0), 1);
  assert.ok(flashLevel(0.03) < flashLevel(0.01));
  assert.equal(flashLevel(0.07), 0);
  assert.equal(flashLevel(-1), 0);
  assert.equal(flashLevel(0.05, 0.09) > 0, true);
});

test('burstSpecs : 9 flammes, 5 étincelles, 2 fumées ; la flamme part surtout vers l’avant', () => {
  const s = burstSpecs(mulberry32(3), 1);
  assert.equal(s.fire.length, 9); assert.equal(s.sparks.length, 5); assert.equal(s.smoke.length, 2);
  assert.ok(s.fire.filter((f) => f.v[0] > 0).length >= 7);
  for (const p of [...s.fire, ...s.sparks, ...s.smoke]) assert.ok(p.life > 0 && p.size0 > 0 && p.alpha > 0 && p.alpha <= 1);
});

test('burstSpecs : reproductible, et l’échelle du pistolet donne une flamme plus petite', () => {
  assert.deepEqual(burstSpecs(mulberry32(7), 1), burstSpecs(mulberry32(7), 1));
  const big = burstSpecs(mulberry32(7), 1), small = burstSpecs(mulberry32(7), 0.7 * FLAME_SIZE);
  assert.ok(small.fire[3].size1 < big.fire[3].size1);
  assert.ok(small.fire[3].v[0] < big.fire[3].v[0]);
});

test('impactSpecs : étincelles qui jaillissent vers le haut, poussière qui s’élève doucement', () => {
  const s = impactSpecs(mulberry32(5));
  assert.equal(s.sparks.length, 5); assert.equal(s.dust.length, 3);
  for (const p of s.sparks) assert.ok(p.v[1] > 0 && p.life > 0);
  for (const d of s.dust) assert.ok(d.v[1] > 0 && d.size1 > d.size0 && d.alpha <= 0.4);
  assert.deepEqual(impactSpecs(mulberry32(5)), impactSpecs(mulberry32(5)));
});

test('ParticlePool : une particule vit puis disparaît ; la réserve pleine remplace la plus ancienne', () => {
  const p = new ParticlePool(3);
  p.spawn(0, 0, 0, 1, 0, 0, 0.5, 0.1, 0.2, 1);
  assert.equal(p.alive, 1);
  p.update(0.3, 0, 0, 0, 0); assert.equal(p.alive, 1); assert.ok(p.pos[0] > 0);
  p.update(0.3, 0, 0, 0, 0); assert.equal(p.alive, 0);
  for (let i = 0; i < 5; i++) p.spawn(i, 0, 0, 0, 0, 0, 1, 0.1, 0.1, 1);
  assert.equal(p.alive, 3);
  assert.deepEqual([p.pos[0], p.pos[3], p.pos[6]], [2, 3, 4]);                    // les deux plus anciennes (0 et 1) ont été remplacées
});

test('ParticlePool.look : invisible si morte, s’efface vers la fin de vie', () => {
  const p = new ParticlePool(1);
  assert.deepEqual(p.look(0), { size: 0, alpha: 0 });
  p.spawn(0, 0, 0, 0, 0, 0, 1, 0.1, 0.5, 0.8);
  p.update(0.2, 0, 0, 0, 0); const early = p.look(0);
  p.update(0.7, 0, 0, 0, 0); const late = p.look(0);
  assert.ok(late.alpha < early.alpha && late.size > early.size);
});

console.log(`\n${passed} tests OK`);
