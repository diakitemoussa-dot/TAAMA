/**
 * Tests unitaires de la logique de visée (aucune dépendance navigateur).
 * Usage : node tests/aim-system.test.mjs
 */
import assert from 'node:assert/strict';
import * as A from '../app/aim-system.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const v = (x, y, z) => ({ x, y, z });

test('approach : dt = 0 ne bouge pas', () => {
  assert.equal(A.approach(0.3, 1, 9, 0), 0.3);
});

test('approach : converge vers la cible sans la dépasser', () => {
  let x = 0;
  let prev = 0;
  for (let i = 0; i < 60; i++) {
    x = A.approach(x, 1, A.AIM_BLEND_SPEED, 1 / 60);
    assert.ok(x >= prev && x <= 1);
    prev = x;
  }
  assert.ok(x > 0.99);
});

test('approach : revient vers 0', () => {
  let x = 1;
  for (let i = 0; i < 60; i++) x = A.approach(x, 0, A.AIM_BLEND_SPEED, 1 / 60);
  assert.ok(x < 0.01);
});

const near = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('aimVFov : 16/9 -> 27.448, carre et portrait -> 46.938', () => {
  near(A.aimVFov(16 / 9), 27.448);
  near(A.aimVFov(1), 46.938);
  near(A.aimVFov(0.5), 46.938);
});

test('aimFov : blend 0 rend exactement le FOV d origine', () => {
  assert.equal(A.aimFov(55, 0, 16 / 9), 55);
  assert.equal(A.aimFov(72, 0, 1), 72);
});

test('aimFov : blend 1 rend aimVFov(aspect)', () => {
  near(A.aimFov(55, 1, 16 / 9), 27.448);
});

test('aimCameraOffset : lacet 0 = AIM_CAM_LOCAL', () => {
  const o = A.aimCameraOffset(0);
  near(o.x, A.AIM_CAM_LOCAL.x); near(o.y, A.AIM_CAM_LOCAL.y); near(o.z, A.AIM_CAM_LOCAL.z);
});

test('aimCameraOffset : lacet PI/2', () => {
  const o = A.aimCameraOffset(Math.PI / 2);
  near(o.x, -0.1715); near(o.y, 1.5082); near(o.z, -0.0721);
});

test('aimCameraOffset : echelle appliquee (y compris la hauteur)', () => {
  const o = A.aimCameraOffset(0, 0.5);
  near(o.x, A.AIM_CAM_LOCAL.x * 0.5); near(o.y, A.AIM_CAM_LOCAL.y * 0.5); near(o.z, A.AIM_CAM_LOCAL.z * 0.5);
});

test('AIM_CAM_LOCAL : valeurs Blender', () => {
  near(A.AIM_CAM_LOCAL.x, 0.0721, 1e-4); near(A.AIM_CAM_LOCAL.y, 1.5082, 1e-4); near(A.AIM_CAM_LOCAL.z, -0.1715, 1e-4);
});

test('aimCameraOffset : norme horizontale conservee', () => {
  const n0 = Math.hypot(A.AIM_CAM_LOCAL.x, A.AIM_CAM_LOCAL.z);
  for (const yaw of [0.3, 1.7, -2.4, 5]) {
    const o = A.aimCameraOffset(yaw);
    near(Math.hypot(o.x, o.z), n0); near(o.y, A.AIM_CAM_LOCAL.y);
  }
});

test('AIM_BODY_YAW ~ 23,4 degres', () => {
  near(A.AIM_BODY_YAW, 23.4 * Math.PI / 180, 1e-3);
  near(A.AIM_BODY_YAW, 0.4083, 1e-3);
});

test('AIM_PITCH0 ~ 5,1 degres', () => {
  near(A.AIM_PITCH0, 5.1 * Math.PI / 180, 1e-3);
  near(A.AIM_PITCH0, 0.0891, 1e-3);
});

test('lookMultiplier : 1 hors visée, AIM_LOOK_MULT en visée', () => {
  assert.equal(A.lookMultiplier(false), 1);
  assert.equal(A.lookMultiplier(true), A.AIM_LOOK_MULT);
  assert.ok(A.AIM_LOOK_MULT > 0 && A.AIM_LOOK_MULT < 1);
});

test('segmentHitsSphere : segment qui traverse le centre', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 0, 0), 0.6), true);
});

test('segmentHitsSphere : segment qui passe à côté', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 2, 0), 0.6), false);
});

test('segmentHitsSphere : effleure dans le rayon de tolérance', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 0.5, 0), 0.6), true);
});

test('segmentHitsSphere : sphère après la fin du segment (mur avant la cible)', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(4, 0, 0), v(9, 0, 0), 0.6), false);
});

test('segmentHitsSphere : sphère derrière le départ', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(-5, 0, 0), 0.6), false);
});

test('segmentHitsSphere : segment dégénéré (départ = arrivée)', () => {
  assert.equal(A.segmentHitsSphere(v(1, 1, 1), v(1, 1, 1), v(1, 1.2, 1), 0.6), true);
  assert.equal(A.segmentHitsSphere(v(1, 1, 1), v(1, 1, 1), v(5, 5, 5), 0.6), false);
});

test('segmentHitsSphere : segment oblique en 3D', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 10, 10), v(5, 5.3, 4.8), 0.6), true);
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 10, 10), v(5, 9, 1), 0.6), false);
});

test('headFade : bornes, milieu, monotonie', () => {
  const eps = 1e-9;
  assert.ok(A.AIM_HEAD_FADE_FROM < A.AIM_HEAD_FADE_TO);
  assert.ok(Math.abs(A.headFade(0) - 0) < eps);
  assert.ok(Math.abs(A.headFade(A.AIM_HEAD_FADE_FROM) - 0) < eps);
  assert.ok(Math.abs(A.headFade(A.AIM_HEAD_FADE_TO) - 1) < eps);
  assert.ok(Math.abs(A.headFade(1) - 1) < eps);
  assert.ok(Math.abs(A.headFade((A.AIM_HEAD_FADE_FROM + A.AIM_HEAD_FADE_TO) / 2) - 0.5) < eps);
  let prev = -1;
  for (let i = 0; i <= 100; i++) {
    const f = A.headFade(i / 100);
    assert.ok(f >= prev, 'monotone à ' + i / 100);
    prev = f;
  }
});

const nearV = (a, b, tol = 1e-6) => { near(a.x, b.x, tol); near(a.y, b.y, tol); near(a.z, b.z, tol); };

test('aimPoseParams : 0 = debout, 1 = genoux, 0.5 = moyennes', () => {
  near(A.aimPoseParams(0).bodyYaw, A.AIM_POSE_STAND.bodyYaw, 1e-6);
  near(A.aimPoseParams(0).pitch0, A.AIM_POSE_STAND.pitch0, 1e-6);
  near(A.aimPoseParams(1).bodyYaw, A.AIM_POSE_KNEEL.bodyYaw, 1e-6);
  near(A.aimPoseParams(1).pitch0, A.AIM_POSE_KNEEL.pitch0, 1e-6);
  near(A.aimPoseParams(0.5).bodyYaw, (0.4083 + 0.3209) / 2, 1e-6);
  near(A.aimPoseParams(0.5).pitch0, (0.0891 - 0.0560) / 2, 1e-6);
});

test('aimOffsetFromHead : lacet 0, PI/2, echelle, norme', () => {
  nearV(A.aimOffsetFromHead(0), A.AIM_CAM_FROM_HEAD);
  nearV(A.aimOffsetFromHead(Math.PI / 2), { x: -0.1047, y: 0.1174, z: -0.0791 });
  nearV(A.aimOffsetFromHead(0, 0.5), { x: 0.0791 / 2, y: 0.1174 / 2, z: -0.1047 / 2 });
  const n0 = Math.hypot(0.0791, 0.1047);
  for (const yaw of [0.3, 1.7, -2.4, 5]) {
    const o = A.aimOffsetFromHead(yaw);
    near(Math.hypot(o.x, o.z), n0, 1e-6); near(o.y, 0.1174, 1e-6);
  }
});

test('AIM_SPINE_WEIGHTS somme a 1', () => {
  near(A.AIM_SPINE_WEIGHTS.reduce((a, b) => a + b, 0), 1, 1e-9);
});

test('clampAimPitch', () => {
  assert.equal(A.clampAimPitch(-9), A.AIM_PITCH_MIN);
  assert.equal(A.clampAimPitch(9), A.AIM_PITCH_MAX);
  assert.equal(A.clampAimPitch(0.2), 0.2);
});


/* ---------- Plan de coupe proche en visée ---------- */
test('aimNear : blend 0 = base exacte, blend 1 = AIM_NEAR', () => {
  assert.equal(A.aimNear(0.5, 0), 0.5);
  near(A.aimNear(0.5, 1), A.AIM_NEAR, 1e-12);
});
test('aimNear : monotone décroissante sur 0..1', () => {
  let prev = Infinity;
  for (let i = 0; i <= 100; i++) { const n = A.aimNear(0.5, i / 100); assert.ok(n < prev); prev = n; }
});
test('aimNear : interpolation géométrique à mi-chemin', () => {
  near(A.aimNear(0.5, 0.5), Math.sqrt(0.5 * A.AIM_NEAR), 1e-9);
});

/* ---------- Rebond du bassin en marche visée ---------- */
const qdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const qnear = (a, b, tol = 1e-9) => assert.ok(Math.abs(Math.abs(qdot(a, b)) - 1) < tol, `quaternions differents ${a} / ${b}`);
const qAxis = (ax, ay, az, ang) => { const s = Math.sin(ang / 2), n = Math.hypot(ax, ay, az); return [ax / n * s, ay / n * s, az / n * s, Math.cos(ang / 2)]; };
const QS = [qAxis(1, 0, 0, 0.3), qAxis(0.2, 1, 0.1, -0.5), qAxis(0, 0.3, 1, 0.8), qAxis(1, 1, 1, 0.1)];
const IDQ = [0, 0, 0, 1];

test('qMul(q, qConj(q)) = identité', () => {
  for (const q of QS) { const r = A.qMul(q, A.qConj(q)); for (let i = 0; i < 4; i++) near(r[i], IDQ[i], 1e-9); }
});
test('qNormalize : norme 1', () => {
  near(Math.hypot(...A.qNormalize([2, 0, 0, 0])), 1, 1e-12);
});
test('qSlerp : bornes t=0 et t=1', () => {
  qnear(A.qSlerp(QS[0], QS[1], 0), QS[0]);
  qnear(A.qSlerp(QS[0], QS[1], 1), QS[1]);
  qnear(A.qSlerp(QS[2], QS[3], 0), QS[2]);
  qnear(A.qSlerp(QS[2], QS[3], 1), QS[3]);
});
test('qMean de N copies = le quaternion', () => {
  qnear(A.qMean([QS[1], QS[1], QS[1], QS[1]]), QS[1]);
});
test('bobPositions : échantillons identiques -> base', () => {
  const base = [1, 2, 3], s = [0.4, 0.5, 0.6];
  for (const p of A.bobPositions(base, [s, s, s], 1.7)) for (let i = 0; i < 3; i++) near(p[i], base[i], 1e-9);
});
const SAMP = [[0.1, 0.9, -0.2], [0.15, 1.0, 0.1], [0.05, 0.85, 0.3], [0.2, 0.95, 0.0], [0.0, 1.1, -0.1]];
test('bobPositions : moyenne des écarts nulle', () => {
  const base = [5, 6, 7], r = A.bobPositions(base, SAMP, 1.3);
  for (let c = 0; c < 3; c++) near(r.reduce((s, p) => s + (p[c] - base[c]), 0), 0, 1e-9);
});
test('bobPositions : linéarité en k', () => {
  const base = [5, 6, 7], r1 = A.bobPositions(base, SAMP, 1), r2 = A.bobPositions(base, SAMP, 2);
  for (let i = 0; i < SAMP.length; i++) for (let c = 0; c < 3; c++) near(r2[i][c] - base[c], 2 * (r1[i][c] - base[c]), 1e-9);
});
test('bobPositions : k = 0 -> base', () => {
  const base = [5, 6, 7];
  for (const p of A.bobPositions(base, SAMP, 0)) for (let c = 0; c < 3; c++) near(p[c], base[c], 1e-12);
});
test('bobRotations : k = 0 -> qBase', () => {
  for (const r of A.bobRotations(QS[0], QS, 0)) qnear(r, QS[0]);
});
test('bobRotations : échantillons identiques -> qBase', () => {
  for (const r of A.bobRotations(QS[0], [QS[2], QS[2], QS[2]], 0.7)) qnear(r, QS[0]);
});
test('bobRotations : sorties unitaires', () => {
  for (const r of A.bobRotations(QS[0], QS, 0.6)) near(Math.hypot(...r), 1, 1e-9);
});

test('Aide à la visée du gadget : tolérance de touche réduite quand elle est désactivée', () => {
  assert.equal(A.aimHitRadius(true), A.AIM_HIT_RADIUS);
  assert.equal(A.aimHitRadius(undefined), A.AIM_HIT_RADIUS, 'activée par défaut');
  assert.equal(A.aimHitRadius(false), A.AIM_HIT_RADIUS_NO_ASSIST);
  assert.ok(A.AIM_HIT_RADIUS_NO_ASSIST < A.AIM_HIT_RADIUS);
  // un tir qui frôle le drone à 0,45 m : touche avec l'aide, manque sans l'aide
  const a = v(0, 0, 0), b = v(0, 0, 20), c = v(0.45, 0, 10);
  assert.equal(A.segmentHitsSphere(a, b, c, A.aimHitRadius(true)), true);
  assert.equal(A.segmentHitsSphere(a, b, c, A.aimHitRadius(false)), false);
});

console.log(`\n${passed} tests OK`);
