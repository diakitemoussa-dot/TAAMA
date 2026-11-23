/**
 * Tests unitaires de la logique des commandes tactiles (aucune dépendance navigateur).
 * Usage : node tests/touch-controls.test.mjs
 */
import assert from 'node:assert/strict';
import * as T from '../app/touch-layout.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

test('chaque mode a une disposition avec zone de tir/boutons dans les bornes', () => {
  for (const m of T.MODES) {
    const cs = T.defaultControls(m);
    assert.ok(cs.length > 4, m);
    const keys = new Set();
    for (const c of cs) {
      assert.ok(!keys.has(c.key), `clé en double ${m}/${c.key}`); keys.add(c.key);
      assert.ok(c.x >= T.LIMITS.margin && c.x <= 1 - T.LIMITS.margin, `${m}/${c.key} x`);
      assert.ok(c.y >= T.LIMITS.margin && c.y <= 1 - T.LIMITS.margin, `${m}/${c.key} y`);
      if (c.type === 'btn') assert.ok(T.ACTIONS[c.action] && T.ACTIONS[c.action].modes.includes(m), `${m}/${c.key} action ${c.action}`);
    }
  }
});

test('cibles tactiles : jamais sous 48 px, même à la taille minimale', () => {
  for (const m of T.MODES) for (const c of T.defaultControls(m)) {
    if (c.type === 'look') continue;
    assert.ok(T.sizePx({ ...c, size: T.LIMITS.size.min }, T.LIMITS.global.min) >= T.MIN_TARGET_PX);
  }
  assert.equal(T.sizePx({ type: 'btn', size: 1 }, 1), 64);
});

test('bornes taille / opacité / position', () => {
  assert.equal(T.clampSize(99), T.LIMITS.size.max);
  assert.equal(T.clampSize(0), T.LIMITS.size.min);
  assert.equal(T.clampSize(NaN), 1);
  assert.equal(T.clampOpacity(5), 1);
  assert.equal(T.clampOpacity(-1), T.LIMITS.opacity.min);
  assert.equal(T.clampPos(-3), T.LIMITS.margin);
  assert.equal(T.clampPos(7), 1 - T.LIMITS.margin);
});

test('aimantation légère à la grille', () => {
  assert.equal(T.snap(0.5), 0.5);
  assert.equal(T.snap(0.502), 0.5);          // proche d'une ligne : aimanté
  assert.equal(T.snap(0.5125), 0.5125);      // entre deux lignes : libre
  assert.equal(T.snap(0.2631), 0.2631);
  assert.equal(T.snap(0.2759), 0.275);
});

test('setControl : déplace, redimensionne, masque, remplace l’action (avec bornes)', () => {
  let s = T.defaultState();
  s = T.setControl(s, 'foot', 'jump', { x: 0.7, y: 0.5 });
  s = T.setControl(s, 'foot', 'jump', { size: 5, opacity: 0.05, action: 'kneel' });
  s = T.setControl(s, 'foot', 'photo', { hidden: true });
  const r = T.resolveProfile(s, 'foot');
  const j = r.find((c) => c.key === 'jump');
  assert.equal(j.x, 0.7); assert.equal(j.y, 0.5);
  assert.equal(j.size, T.LIMITS.size.max);
  assert.equal(j.opacity, T.LIMITS.opacity.min);
  assert.equal(j.action, 'kneel'); assert.equal(j.baseAction, 'jump');
  assert.equal(r.find((c) => c.key === 'photo').hidden, true);
  assert.equal(T.hiddenCount(s, 'foot'), 1);
});

test('remplacement refusé si l’action n’existe pas dans ce mode / sur un stick', () => {
  let s = T.setControl(T.defaultState(), 'car', 'photo', { action: 'jump' });   // jump n'existe pas en voiture
  assert.equal(T.resolveProfile(s, 'car').find((c) => c.key === 'photo').action, 'photo');
  s = T.setControl(T.defaultState(), 'foot', 'move', { action: 'fire' });
  assert.equal(T.resolveProfile(s, 'foot').find((c) => c.key === 'move').action, null);
  assert.ok(T.actionsForMode('car').includes('gas') && !T.actionsForMode('car').includes('jump'));
});

test('gaucher : miroir à la résolution, et réécriture inverse dans l’éditeur', () => {
  let s = { ...T.defaultState(), lefty: true };
  const j0 = T.defaultControls('foot').find((c) => c.key === 'jump');
  assert.ok(Math.abs(T.resolveProfile(s, 'foot').find((c) => c.key === 'jump').x - (1 - j0.x)) < 1e-9);
  assert.equal(T.resolveProfile(s, 'foot').find((c) => c.key === 'look').x, 0.7);    // la zone caméra ne se déplace pas
  s = T.setControl({ ...s, grid: false }, 'foot', 'jump', { x: 0.2 });               // position écran 0,2
  assert.equal(s.profiles.foot.jump.x, 0.8);                                          // stockée côté droitier
  assert.equal(T.resolveProfile(s, 'foot').find((c) => c.key === 'jump').x, 0.2);
});

test('réinitialisation par bouton, par mode, totale', () => {
  let s = T.setControl(T.defaultState(), 'foot', 'jump', { size: 1.5 });
  s = T.setControl(s, 'car', 'gas', { size: 1.5 });
  s.show = 'always';
  assert.deepEqual(Object.keys(T.resetControl(s, 'foot', 'jump').profiles), ['car']);
  assert.deepEqual(Object.keys(T.resetMode(s, 'car').profiles), ['foot']);
  const all = T.resetAll(s);
  assert.deepEqual(all.profiles, {}); assert.equal(all.show, 'always');
});

test('préréglages : standard, gaucher, minimaliste, grands', () => {
  const base = T.setControl(T.defaultState(), 'foot', 'jump', { size: 1.7 });
  const std = T.applyPreset(base, 'standard');
  assert.equal(std.lefty, false); assert.deepEqual(std.profiles, {});
  assert.equal(T.applyPreset(base, 'gaucher').lefty, true);
  assert.equal(T.applyPreset(base, 'grands').globalSize, 1.3);
  const min = T.applyPreset(base, 'minimaliste');
  const foot = T.resolveProfile(min, 'foot');
  assert.equal(foot.find((c) => c.key === 'kneel').hidden, true);
  assert.equal(foot.find((c) => c.key === 'jump').hidden, false);
  assert.equal(foot.find((c) => c.key === 'interact').hidden, false);
  assert.equal(foot.find((c) => c.key === 'look').hidden, false);
  assert.equal(T.applyPreset(base, 'inconnu').profiles.foot.jump.size, 1.7);        // préréglage inconnu : inchangé
});

test('sérialisation : aller-retour identique', () => {
  let s = T.setControl(T.defaultState(), 'drone', 'photo', { x: 0.4, y: 0.6, hidden: true });
  s = { ...s, lookSens: 1.5, lefty: true, show: 'never' };
  assert.deepEqual(T.parse(T.serialize(s)), T.migrate(s));
  assert.equal(T.parse(T.serialize(s)).profiles.drone.photo.hidden, true);
});

test('migration : JSON invalide, ancien format, champs hors bornes ou inconnus', () => {
  assert.deepEqual(T.migrate('pas du json'), T.defaultState());
  assert.deepEqual(T.migrate(null), T.defaultState());
  assert.deepEqual(T.migrate(42), T.defaultState());
  const m = T.migrate({ show: 'xx', globalSize: 99, globalOpacity: -2, lookSens: 0, lefty: 1, haptics: false,
    profiles: { foot: { jump: { x: 9, size: 0, evil: 1 }, inconnu: { x: 0.1 } }, mars: { a: {} } }, extra: 'x' });
  assert.equal(m.show, 'auto'); assert.equal(m.globalSize, T.LIMITS.global.max);
  assert.equal(m.globalOpacity, T.LIMITS.opacity.min); assert.equal(m.lookSens, T.LIMITS.look.min);
  assert.equal(m.lefty, true); assert.equal(m.haptics, false);
  assert.equal(m.profiles.foot.jump.x, 1 - T.LIMITS.margin);
  assert.equal(m.profiles.foot.jump.size, T.LIMITS.size.min);
  assert.ok(!('evil' in m.profiles.foot.jump)); assert.ok(!('inconnu' in m.profiles.foot)); assert.ok(!('mars' in m.profiles));
  assert.ok(!('extra' in m));
  assert.equal(T.migrate(JSON.stringify({ v: 0 })).v, T.SCHEMA);
});

test('affichage : auto / toujours / jamais, ?touch=1 / ?touch=0', () => {
  assert.equal(T.touchParam('?touch=1'), true);
  assert.equal(T.touchParam('?a=1&touch=0'), false);
  assert.equal(T.touchParam('?touch=x'), null);
  assert.equal(T.touchParam(''), null);
  const phone = { coarse: true, maxTouchPoints: 5 }, pc = { coarse: false, maxTouchPoints: 0 }, pcTouch = { coarse: false, maxTouchPoints: 10 };
  assert.equal(T.shouldShow(phone), true);
  assert.equal(T.shouldShow(pc), false);
  assert.equal(T.shouldShow(pcTouch), false);                         // PC avec écran tactile : masqué en auto
  assert.equal(T.shouldShow({ ...pcTouch, show: 'always' }), true);   // …sauf si le joueur l'active
  assert.equal(T.shouldShow({ ...phone, show: 'never' }), false);
  assert.equal(T.shouldShow({ ...pc, param: true }), true);
  assert.equal(T.shouldShow({ ...phone, param: false, show: 'always' }), false);
});

test('libellés FR/EN', () => {
  assert.equal(T.actionLabel('jump'), 'Sauter');
  assert.equal(T.actionLabel('jump', 'en'), 'Jump');
  for (const id of Object.keys(T.ACTIONS)) { assert.ok(T.ACTIONS[id].fr && T.ACTIONS[id].en && T.ACTIONS[id].icon); }
});

console.log(`\n${passed} tests passés`);
