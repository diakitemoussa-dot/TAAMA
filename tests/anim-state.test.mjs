/**
 * Tests unitaires du choix des animations du joueur (logique pure).
 * Usage : node tests/anim-state.test.mjs
 */
import assert from 'node:assert/strict';
import * as S from '../app/anim-state.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const dirOf = (yaw) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });           // devant le personnage
const rightOf = (yaw) => ({ x: -Math.cos(yaw), z: Math.sin(yaw) });         // sa droite

test('base : marche, course, arrêt, puis idle_look après 7 s d\'immobilité', () => {
  assert.equal(S.pickBaseClip({ moving: true, running: false }), 'walk');
  assert.equal(S.pickBaseClip({ moving: true, running: true }), 'run');
  assert.equal(S.pickBaseClip({ moving: false, idleTime: 0 }), 'idle');
  assert.equal(S.pickBaseClip({ moving: false, idleTime: 6.99 }), 'idle');
  assert.equal(S.pickBaseClip({ moving: false, idleTime: 7 }), 'idle_look');
  assert.equal(S.pickBaseClip({ moving: false, idleTime: 3, idleLookDelay: 2 }), 'idle_look', 'délai réglable');
});

test('jambes : avant = marche ou course, arrière = marche arrière, côtés = pas de côté', () => {
  for (const yaw of [0, 1.2, -2.5, Math.PI]) {
    const base = { moving: true, bodyYaw: yaw };
    assert.equal(S.pickLowerClip({ ...base, move: dirOf(yaw), running: false }), 'walk', `avant, cap ${yaw}`);
    assert.equal(S.pickLowerClip({ ...base, move: dirOf(yaw), running: true }), 'run');
    const back = dirOf(yaw); back.x = -back.x; back.z = -back.z;
    assert.equal(S.pickLowerClip({ ...base, move: back }), 'pistol walk backward', `arrière, cap ${yaw}`);
    assert.equal(S.pickLowerClip({ ...base, move: rightOf(yaw) }), 'pistol strafe right', `droite, cap ${yaw}`);
    const left = rightOf(yaw); left.x = -left.x; left.z = -left.z;
    assert.equal(S.pickLowerClip({ ...base, move: left }), 'pistol strafe left', `gauche, cap ${yaw}`);
  }
});

test('jambes : diagonale avant-droite = marche ; arrêt = idle ; agenouillé à l\'arrêt = pose agenouillée', () => {
  const yaw = 0.7, f = dirOf(yaw), r = rightOf(yaw);
  const diag = { x: f.x + r.x * 0.6, z: f.z + r.z * 0.6 };
  assert.equal(S.pickLowerClip({ moving: true, move: diag, bodyYaw: yaw }), 'walk');
  assert.equal(S.pickLowerClip({ moving: false, move: null }), 'idle');
  assert.equal(S.pickLowerClip({ moving: true, move: { x: 0, z: 0 } }), 'idle', 'déplacement nul : idle');
  assert.equal(S.pickLowerClip({ kneeling: true, moving: false }), 'pistol kneeling idle');
  assert.equal(S.pickLowerClip({ kneeling: true, moving: true, move: dirOf(0), bodyYaw: 0 }), 'walk', 'agenouillé en marche : jambes qui marchent');
});

test('seuil : un déplacement presque en diagonale (axe < 0,55) ne déclenche ni recul ni pas de côté', () => {
  const yaw = 0;
  const m = { x: -Math.sin(0.9), z: Math.cos(0.9) };    // ≈ 52° vers la droite (cap 0 : la droite est -x) : côté 0,78 > 0,55 → pas de côté
  assert.equal(S.pickLowerClip({ moving: true, move: m, bodyYaw: yaw }), 'pistol strafe right');
  const n = { x: -Math.sin(0.5), z: Math.cos(0.5) };    // ≈ 29° : côté 0,48 < 0,55 → marche
  assert.equal(S.pickLowerClip({ moving: true, move: n, bodyYaw: yaw }), 'walk');
});

test('fondu : long autour de l\'arrêt, court entre déplacements', () => {
  assert.equal(S.fadeTime('idle', 'walk'), S.FADE_SOFT);
  assert.equal(S.fadeTime('run', 'idle_look'), S.FADE_SOFT);
  assert.equal(S.fadeTime('walk', 'pistol kneeling idle'), S.FADE_SOFT);
  assert.equal(S.fadeTime('walk', 'run'), S.FADE_FAST);
  assert.ok(S.FADE_SOFT > S.FADE_FAST);
});

console.log(`\n${passed} tests réussis`);
