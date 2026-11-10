/**
 * Tests unitaires de la cargaison de la benne (physique pure).
 * Usage : node --test tests/car-cargo.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCargo, BED, MU, G } from '../app/car-cargo.js';

const seeded = (s = 7) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const ITEMS = () => [
  { id: 'a', cx: 0.35, cz: -1.78, hx: 0.3, hz: 0.4 }, { id: 'b', cx: -0.4, cz: -1.55, hx: 0.3, hz: 0.44 },
  { id: 'c', cx: 0.6, cz: -1.15, hx: 0.15, hz: 0.11 }, { id: 'roue', cx: -0.58, cz: -2.05, hx: 0.38, hz: 0.14 },
];
const run = (c, secs, inputs, dt = 1 / 60) => { for (let t = 0; t < secs; t += dt) c.step(dt, typeof inputs === 'function' ? inputs(t) : inputs); };
const inside = (c) => c.items.every((it) => { const ex = it.hx * Math.abs(Math.cos(it.yaw)) + it.hz * Math.abs(Math.sin(it.yaw)), ez = it.hx * Math.abs(Math.sin(it.yaw)) + it.hz * Math.abs(Math.cos(it.yaw)); const X = it.cx + it.x, Z = it.cz + it.z; return X >= Math.min(BED.x0 + ex, it.cx) - 0.02 && X <= Math.max(BED.x1 - ex, it.cx) + 0.02 && Z >= Math.min(BED.z0 + ez, it.cz) - 0.02 && Z <= Math.max(BED.z1 - ez, it.cz) + 0.02; });

test('à l\'arrêt ou à vitesse constante : rien ne bouge', () => {
  const c = createCargo(ITEMS(), seeded());
  run(c, 3, { aLong: 0, aLat: 0, speed: 0 });
  assert.ok(c.items.every((it) => it.x === 0 && it.z === 0 && it.y === 0));
  run(c, 3, { aLong: 0, aLat: 0, speed: 3 });                       // lent : pas de cahots
  assert.ok(c.items.every((it) => it.y === 0 && it.x === 0 && it.z === 0));
});

test('accélération forte : les objets glissent vers le hayon (z diminue) ; accélération douce : ils tiennent par frottement', () => {
  const soft = createCargo(ITEMS(), seeded());
  run(soft, 2, { aLong: MU * G * 0.8, speed: 3 });
  assert.ok(soft.items.every((it) => Math.abs(it.z) < 1e-9), 'sous le seuil de frottement rien ne glisse');
  const hard = createCargo(ITEMS(), seeded());
  run(hard, 1.5, { aLong: 13, speed: 3 });
  assert.ok(hard.items.every((it) => it.z < -0.05), 'ils reculent');
  assert.ok(inside(hard));
});

test('freinage : ils glissent vers la cabine (z augmente) sans traverser la paroi avant', () => {
  const c = createCargo(ITEMS(), seeded());
  run(c, 2.5, { aLong: -22, speed: 3 });
  assert.ok(c.items.every((it) => it.z > 0.05));
  assert.ok(inside(c));
});

test('virage : ils glissent vers l\'extérieur du virage', () => {
  const c = createCargo(ITEMS(), seeded());
  run(c, 1.5, { aLat: 9, speed: 3 });                               // la voiture tourne vers +x : les objets partent vers -x
  assert.ok(c.items.filter((it) => (it.cx - it.hx) - BED.x0 > 0.15).every((it) => it.x < -0.03));
  const d = createCargo(ITEMS(), seeded());
  run(d, 1.5, { aLat: -9, speed: 3 });
  assert.ok(d.items.filter((it) => BED.x1 - (it.cx + it.hx) > 0.15).every((it) => it.x > 0.03));
  assert.ok(inside(c) && inside(d));
});

test('vitesse élevée : cahots (sauts) de plus en plus hauts, tous les objets restent dans la benne', () => {
  const slow = createCargo(ITEMS(), seeded()), fast = createCargo(ITEMS(), seeded());
  let maxSlow = 0, maxFast = 0;
  run(slow, 6, (t) => ({ aLong: 0, speed: 8 })); run(fast, 6, () => ({ aLong: 0, speed: 20 }));
  for (let t = 0; t < 6; t += 1 / 60) { slow.step(1 / 60, { speed: 8 }); fast.step(1 / 60, { speed: 20 }); maxSlow = Math.max(maxSlow, ...slow.items.map((i) => i.y)); maxFast = Math.max(maxFast, ...fast.items.map((i) => i.y)); }
  assert.ok(maxFast > 0.05, `saut max à 20 m/s : ${maxFast}`);
  assert.ok(maxFast > maxSlow);
  assert.ok(maxFast < 0.5, 'jamais plus de 50 cm');
  assert.ok(inside(fast) && inside(slow));
  assert.ok(fast.items.some((it) => Math.abs(it.yaw) > 0.05 || Math.abs(it.x) > 0.02 || Math.abs(it.z) > 0.02), 'ils bougent de partout');
});

test('après l\'arrêt : tout retombe et se calme', () => {
  const c = createCargo(ITEMS(), seeded());
  run(c, 4, { speed: 20 });
  run(c, 4, { speed: 0 });
  assert.ok(c.items.every((it) => it.y === 0 && Math.hypot(it.vx, it.vz) < 1e-6));
});

test('pas de NaN ni de dépassement sur un trajet agité', () => {
  const c = createCargo(ITEMS(), seeded(3));
  run(c, 30, (t) => ({ aLong: 14 * Math.sin(t * 1.3), aLat: 10 * Math.sin(t * 0.7), speed: 6 + 14 * Math.abs(Math.sin(t * 0.3)) }));
  for (const it of c.items) for (const k of ['x', 'z', 'y', 'yaw', 'rx', 'rz', 'vx', 'vz']) assert.ok(Number.isFinite(it[k]), `${it.id}.${k}`);
  assert.ok(inside(c));
});

test('reset : tout revient au repos', () => {
  const c = createCargo(ITEMS(), seeded());
  run(c, 2, { aLong: 13, speed: 20 }); c.reset();
  assert.ok(c.items.every((it) => it.x === 0 && it.z === 0 && it.y === 0 && it.yaw === 0));
});

test('hayon : aucun objet ne traverse la paroi arrière, même incliné, en rotation ou poussé par les autres', () => {
  const items = [
    { id: 'a', cx: 0.35, cz: -1.78, hx: 0.3, hz: 0.4, hy: 0.16 }, { id: 'b', cx: -0.4, cz: -1.55, hx: 0.3, hz: 0.44, hy: 0.2 },
    { id: 'c', cx: 0.6, cz: -1.62, hx: 0.15, hz: 0.11, hy: 0.21 }, { id: 'd', cx: 0.62, cz: -1.38, hx: 0.15, hz: 0.11, hy: 0.21 },
    { id: 'roue', cx: -0.58, cz: -2.05, hx: 0.38, hz: 0.14, hy: 0.38 }, { id: 'e', cx: 0.0, cz: -2.25, hx: 0.7, hz: 0.17, hy: 0.17 },
  ];
  const c = createCargo(items, seeded(11));
  let worstBack = Infinity, worstFront = Infinity, worstSide = Infinity;
  for (let t = 0; t < 40; t += 1 / 60) {
    const ph = Math.sin(t * 0.9);
    c.step(1 / 60, { aLong: ph > 0 ? 14 : -24, aLat: 9 * Math.sin(t * 1.7), speed: 8 + 14 * Math.abs(Math.sin(t * 0.3)) });
    for (const it of c.items) {
      const ex = it.hx * Math.abs(Math.cos(it.yaw)) + it.hz * Math.abs(Math.sin(it.yaw)) + it.hy * Math.abs(Math.sin(it.rz));
      const ez = it.hx * Math.abs(Math.sin(it.yaw)) + it.hz * Math.abs(Math.cos(it.yaw)) + it.hy * Math.abs(Math.sin(it.rx));
      worstBack = Math.min(worstBack, it.cz + it.z - ez - BED.z0);
      worstFront = Math.min(worstFront, BED.z1 - (it.cz + it.z + ez));
      if (it.id !== 'roue') worstSide = Math.min(worstSide, it.cx + it.x - ex - BED.x0, BED.x1 - (it.cx + it.x + ex));
    }
  }
  assert.ok(worstBack > -0.002, `un objet dépasse le hayon de ${(-worstBack * 100).toFixed(1)} cm`);
  assert.ok(worstFront > -0.002, `un objet dépasse la paroi avant de ${(-worstFront * 100).toFixed(1)} cm`);
  assert.ok(worstSide > -0.002, `un objet dépasse une paroi latérale de ${(-worstSide * 100).toFixed(1)} cm`);
});
