/**
 * Tests des volumes par catégorie (aucune dépendance navigateur : faux <audio> et faux AudioContext).
 * Usage : node tests/game-audio.test.mjs
 */
import assert from 'node:assert/strict';

// faux HTMLMediaElement : volume natif avec accesseur sur le prototype, comme dans un navigateur
class FakeMedia {
  constructor() { this._v = 1; }
  get volume() { return this._v; }
  set volume(v) { this._v = v; }
}
globalThis.HTMLMediaElement = FakeMedia;
await import('../app/game-audio.js');
const GA = globalThis.GameAudio;

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} ≠ ${b}`);
const reset = () => GA.set({ volume: 80, music: 60, effects: 85, drone: 70, ambience: 55, muteAll: false, muteBackground: true });

test('réglages par défaut : facteur 1 pour toutes les catégories (rien ne change)', () => {
  reset();
  for (const c of ['master', 'music', 'effects', 'drone', 'ambience']) near(GA.gain(c), 1, c);
});

test('curseur d’une catégorie : proportionnel, à 0 = silence', () => {
  reset();
  GA.set({ effects: 0 });  near(GA.gain('effects'), 0);  near(GA.gain('music'), 1);
  GA.set({ effects: 85 / 2 }); near(GA.gain('effects'), 0.5);
  reset();
});

test('volume général : multiplie toutes les catégories', () => {
  reset();
  GA.set({ volume: 40 });
  for (const c of ['music', 'effects', 'drone', 'ambience']) near(GA.gain(c), 0.5, c);
  GA.set({ volume: 0 });
  near(GA.gain('master'), 0);
  reset();
});

test('couper tous les sons, couper en arrière-plan', () => {
  reset();
  GA.set({ muteAll: true }); near(GA.gain('effects'), 0);
  GA.set({ muteAll: false }); near(GA.gain('effects'), 1);
  GA._setHidden(true); near(GA.gain('effects'), 0, 'arrière-plan coupé');
  GA.set({ muteBackground: false }); near(GA.gain('effects'), 1, 'arrière-plan autorisé');
  GA._setHidden(false);
  reset();
});

test('track : le volume d’un <audio> suit le réglage, même si le jeu le modifie ensuite', () => {
  reset();
  const a = new FakeMedia();
  a.volume = 0.8;
  GA.track(a, 'effects');
  near(a._v, 0.8, 'inchangé par défaut');
  GA.set({ effects: 85 / 2 });
  near(a._v, 0.4, 'moitié');
  a.volume = 0.5;                       // le module change le volume (fondu…)
  near(a.volume, 0.5, 'le jeu relit sa propre valeur');
  near(a._v, 0.25, 'valeur réelle réduite');
  GA.set({ muteAll: true });
  near(a._v, 0, 'coupé');
  reset();
  near(a._v, 0.5, 'rétabli');
});

test('track : le volume ne dépasse jamais 1 (volume général > 80)', () => {
  reset();
  const a = new FakeMedia();
  a.volume = 0.9;
  GA.track(a, 'master');
  GA.set({ volume: 100 });
  assert.ok(a._v <= 1);
  reset();
});

test('ctx : la sortie WebAudio passe par un gain de catégorie', () => {
  reset();
  const real = { id: 'destination' };
  const nodes = [];
  const fakeCtx = {
    destination: real,
    createGain() { const n = { gain: { value: 1 }, connected: null, connect(t) { this.connected = t; } }; nodes.push(n); return n; },
  };
  GA.ctx(fakeCtx, 'drone');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].connected, real, 'le gain est relié à la vraie sortie');
  assert.equal(fakeCtx.destination, nodes[0], 'le jeu se connecte maintenant au gain');
  near(nodes[0].gain.value, 1);
  GA.set({ drone: 35 });  near(nodes[0].gain.value, 0.5);
  GA.set({ muteAll: true }); near(nodes[0].gain.value, 0);
  GA.ctx(fakeCtx, 'drone');
  assert.equal(nodes.length, 1, 'un contexte n’est enveloppé qu’une fois');
  reset();
});

test('valeurs invalides ignorées', () => {
  reset();
  GA.set({ volume: 'fort', effects: NaN, music: 500, drone: -5 });
  near(GA.settings().volume, 80);
  near(GA.settings().music, 100);
  near(GA.settings().drone, 0);
  reset();
});

console.log(`\n${passed} tests OK`);
