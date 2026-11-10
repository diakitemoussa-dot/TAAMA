/**
 * Tests unitaires du mode tireur d'élite (logique pure).
 * Usage : node tests/sniper-cam.test.mjs
 */
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as S from '../app/sniper-cam.js';
import * as A from '../app/aim-system.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** Calcul de référence : CameraRig.update de Sahel Game (client/src/camera.js), recopié avec Three.js. Renvoie { pos, tgt }. */
function sahelRigBoth(ground, yaw, pitch, c) {
  const UP = new THREE.Vector3(0, 1, 0);
  const f = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const r = new THREE.Vector3().crossVectors(f, UP);
  const g = new THREE.Vector3(ground.x, ground.y, ground.z);
  const pos = g.clone().addScaledVector(r, c.side).addScaledVector(f, -c.dist).addScaledVector(UP, c.h);
  const tgt = g.clone().addScaledVector(r, c.look[0]).addScaledVector(f, c.look[1]).addScaledVector(UP, c.look[2]);
  const pivot = g.clone().addScaledVector(UP, 1.5);
  const q = new THREE.Quaternion().setFromAxisAngle(r, pitch);
  pos.sub(pivot).applyQuaternion(q).add(pivot);
  tgt.sub(pivot).applyQuaternion(q).add(pivot);
  return { pos, tgt };
}
const sahelRig = (g, y, p, c) => sahelRigBoth(g, y, p, c).pos;

test('presets de Sahel Game : lunette 25° à l’épaule droite, visée 45°', () => {
  assert.equal(S.SAHEL_CAM_SNIPER.fov, 25);
  assert.equal(S.SAHEL_CAM_VISEE.fov, 45);
  assert.ok(S.SAHEL_CAM_SNIPER.side > 0.4 && S.SAHEL_CAM_SNIPER.dist > 0 && S.SAHEL_CAM_SNIPER.h > 1.5);
});

test('sniperCameraPosition : identique au CameraRig de Sahel Game, pour des cas variés', () => {
  const cases = [
    [{ x: 0, y: 0, z: 0 }, 0, 0], [{ x: 3, y: 1.2, z: -7 }, 1.1, 0.3], [{ x: -12, y: 4, z: 55 }, -2.4, -0.6],
    [{ x: 0.5, y: 0, z: 0.5 }, Math.PI, 0.9], [{ x: 10, y: 2, z: 10 }, 0.7, -0.8],
  ];
  for (const [g, yaw, pitch] of cases) {
    const ref = sahelRig(g, yaw, pitch, S.SAHEL_CAM_SNIPER), got = S.sniperCameraPosition(g, yaw, pitch);
    assert.ok(Math.hypot(got.x - ref.x, got.y - ref.y, got.z - ref.z) < 1e-9, `écart ${got.x - ref.x}, ${got.y - ref.y}, ${got.z - ref.z}`);
  }
});

test('sniperLookTarget : identique au point regardé par CameraRig de Sahel Game', () => {
  const cases = [[{ x: 0, y: 0, z: 0 }, 0, 0], [{ x: 3, y: 1.2, z: -7 }, 1.1, 0.3], [{ x: -12, y: 4, z: 55 }, -2.4, -0.6], [{ x: 10, y: 2, z: 10 }, 0.7, -0.8]];
  for (const [g, yaw, pitch] of cases) {
    const ref = sahelRigBoth(g, yaw, pitch, S.SAHEL_CAM_SNIPER).tgt, got = S.sniperLookTarget(g, yaw, pitch);
    assert.ok(Math.hypot(got.x - ref.x, got.y - ref.y, got.z - ref.z) < 1e-9, `écart ${got.x - ref.x}, ${got.y - ref.y}, ${got.z - ref.z}`);
  }
});

test('la caméra de lunette regarde ≈ 13,6° à gauche et 6,7° sous l’axe du corps (à plat)', () => {
  const g = { x: 0, y: 0, z: 0 }, p = S.sniperCameraPosition(g, 0, 0), t = S.sniperLookTarget(g, 0, 0);
  const dx = t.x - p.x, dy = t.y - p.y, dz = t.z - p.z;                 // le joueur regarde vers +z : sa gauche est +x
  const yawLeft = Math.atan2(dx, dz) * 180 / Math.PI, down = -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI;
  assert.ok(yawLeft > 13 && yawLeft < 14.2, `lacet ${yawLeft}`);
  assert.ok(down > 6.4 && down < 7, `inclinaison ${down}`);
});

test('sniperCameraPosition : à plat, la caméra est à droite et derrière la tête, à 1,57 m', () => {
  const p = S.sniperCameraPosition({ x: 0, y: 0, z: 0 }, 0, 0);          // le joueur regarde vers +z
  close(p.y, 1.569); close(p.z, -0.488); close(p.x, -0.528);              // sa droite est -x quand il regarde +z
  const q = S.sniperCameraPosition({ x: 0, y: 0, z: 0 }, Math.PI / 2, 0); // il regarde vers +x : sa droite est +z
  close(q.x, -0.488); close(q.z, 0.528);
});

test('sniperCameraPosition : le tangage vers le haut descend la caméra, vers le bas la monte', () => {
  const flat = S.sniperCameraPosition({ x: 0, y: 0, z: 0 }, 0, 0);
  assert.ok(S.sniperCameraPosition({ x: 0, y: 0, z: 0 }, 0, 0.5).y < flat.y);
  assert.ok(S.sniperCameraPosition({ x: 0, y: 0, z: 0 }, 0, -0.5).y > flat.y);
});

test('sniperVFov : 25° en paysage ; en portrait, angle horizontal du 16:9 conservé', () => {
  close(S.sniperVFov(16 / 9), 25); close(S.sniperVFov(1), 25);
  const v = S.sniperVFov(0.5), h = 2 * Math.atan(Math.tan(v * Math.PI / 360) * 0.5) * 180 / Math.PI;
  close(h, 2 * Math.atan(Math.tan(12.5 * Math.PI / 180) * 16 / 9) * 180 / Math.PI, 1e-6);
});

test('sniperFov : blend 0 = inchangé, blend 1 = FOV de la lunette, bornes respectées', () => {
  close(S.sniperFov(31, 0, 1.6), 31);
  close(S.sniperFov(31, 1, 1.6), 25);
  close(S.sniperFov(31, -4, 1.6), 31); close(S.sniperFov(31, 9, 1.6), 25);
  close(S.sniperFov(31, 0.5, 1.6), 28);
});

test('lookMultiplier : 1 hors visée, AIM en visée, plus lent en lunette (rapports de Sahel)', () => {
  assert.equal(S.lookMultiplier(false), 1);
  assert.equal(S.lookMultiplier(false, true), 1);                 // la lunette ne compte que si on vise
  assert.equal(S.lookMultiplier(true), A.AIM_LOOK_MULT);
  assert.ok(S.lookMultiplier(true, true) < S.lookMultiplier(true, false));
  close(S.lookMultiplier(true, true) / S.lookMultiplier(true, false), 0.45 / 0.65);
});

test('sniperWanted : bascule active seulement si la visée est possible', () => {
  assert.equal(S.sniperWanted({ toggled: true, canAim: true }), true);
  assert.equal(S.sniperWanted({ toggled: true, canAim: false }), false);
  assert.equal(S.sniperWanted({ toggled: false, canAim: true }), false);
});

console.log(`\n${passed} tests OK`);
