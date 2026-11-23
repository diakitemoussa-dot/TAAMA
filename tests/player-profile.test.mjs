/**
 * Tests unitaires du profil joueur (aucune dépendance navigateur).
 * Usage : node tests/player-profile.test.mjs
 */
import assert from 'node:assert/strict';
import * as P from '../app/player-profile.js';

const test = (name, fn) => { fn(); console.log(`ok - ${name}`); };
const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const NOW = '2026-10-30T18:42:00.000Z';
const ID = '123e4567-e89b-42d3-a456-426614174000';

test('prénoms valides : accents, tiret, apostrophe, chiffres', () => {
  for (const n of ['Moussa', 'Aïcha', 'Mamadou-Lamine', 'N\'Golo', 'Kéba 7', 'Taama_92']) {
    assert.equal(P.validateProfileInput({ name: n, age: 14 }).ok, true, n);
  }
});

test('l’apostrophe droite devient courbe, les espaces sont nettoyés', () => {
  assert.equal(P.cleanName("  N'Golo   Kanté "), 'N’Golo Kanté');
});

test('prénoms refusés : trop court, trop long, caractères interdits', () => {
  assert.equal(P.validateProfileInput({ name: 'A', age: 14 }).error, 'name_short');
  assert.equal(P.validateProfileInput({ name: '   ', age: 14 }).error, 'name_short');
  assert.equal(P.validateProfileInput({ name: 'x'.repeat(21), age: 14 }).error, 'name_long');
  assert.equal(P.validateProfileInput({ name: '<script>', age: 14 }).error, 'name_chars');
  assert.equal(P.validateProfileInput({ name: '-Moussa', age: 14 }).error, 'name_chars');
  assert.equal(P.validateProfileInput({ name: 'Moussa😀', age: 14 }).error, 'name_chars');
  assert.equal(P.validateProfileInput({ age: 14 }).error, 'name_short');
});

test('âge : entier entre 6 et 99, texte accepté', () => {
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: '15' }).age, 15);
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 6 }).ok, true);
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 99 }).ok, true);
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 5 }).error, 'age_range');
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 100 }).error, 'age_range');
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: '14.5' }).error, 'age_invalid');
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 'quinze' }).error, 'age_invalid');
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: '' }).error, 'age_invalid');
  assert.equal(P.validateProfileInput({ name: 'Moussa', age: 14.5 }).error, 'age_invalid');
  assert.equal(P.validateProfileInput({ name: 'Moussa' }).error, 'age_invalid');
  assert.equal(P.validateProfileInput(null).ok, false);
});

test('chaque erreur a un message en français', () => {
  for (const c of ['name_short', 'name_long', 'name_chars', 'age_invalid', 'age_range']) assert.ok(P.errorMessage(c).length > 10, c);
  assert.ok(P.errorMessage('inconnue').length > 0);
});

test('appareil : ordinateur, tablette, téléphone', () => {
  assert.equal(P.pickDevice({ coarsePointer: false }), 'Ordinateur');
  assert.equal(P.pickDevice({ coarsePointer: true, width: 820, height: 1180 }), 'Tablette');
  assert.equal(P.pickDevice({ coarsePointer: true, width: 844, height: 390 }), 'Téléphone');
});

test('identifiant anonyme : format UUID, sans crypto aussi', () => {
  assert.ok(P.isValidId(P.newId()));
  assert.ok(P.isValidId(P.newId(Math.random, null)));
  assert.equal(P.isValidId('pas-un-id'), false);
  assert.equal(P.isValidId(12), false);
});

test('création, mise à jour et stockage du profil', () => {
  const st = fakeStorage();
  assert.equal(P.loadProfile(st), null);
  const p = P.createProfile({ name: 'Moussa', age: 14 }, { id: ID, device: 'Téléphone', lang: 'fr', nowIso: NOW });
  assert.equal(p.synced, false);
  assert.equal(P.saveProfile(st, p), true);
  assert.deepEqual(P.loadProfile(st), p);
  const u = P.updateProfile({ ...p, synced: true }, { name: 'Moussa K', age: 15 }, '2026-11-01T10:00:00.000Z');
  assert.equal(u.synced, false);
  assert.equal(u.createdAt, NOW);
  assert.equal(u.updatedAt, '2026-11-01T10:00:00.000Z');
});

test('profil enregistré corrompu ou invalide → ignoré', () => {
  const st = fakeStorage();
  st.setItem(P.PROFILE_KEY, 'pas du json');
  assert.equal(P.loadProfile(st), null);
  st.setItem(P.PROFILE_KEY, JSON.stringify({ version: 1, id: 'x', name: 'Moussa', age: 14 }));
  assert.equal(P.loadProfile(st), null);
  st.setItem(P.PROFILE_KEY, JSON.stringify({ version: 1, id: ID, name: '<b>', age: 14 }));
  assert.equal(P.loadProfile(st), null);
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  assert.equal(P.loadProfile(broken), null);
  assert.equal(P.saveProfile(broken, {}), false);
});

test('ce qui part au serveur : strict nécessaire, rien d’autre', () => {
  const p = { ...P.createProfile({ name: 'Moussa', age: 14 }, { id: ID, device: 'Ordinateur', lang: 'en', nowIso: NOW }), synced: true, secret: 'x' };
  assert.deepEqual(Object.keys(P.toPayload(p)).sort(), ['age', 'createdAt', 'device', 'id', 'lang', 'name']);
});

test('le serveur revalide tout : id, nom, âge, valeurs inconnues ramenées au défaut', () => {
  const ok = P.validatePayload({ id: ID, name: ' Moussa ', age: 14, device: 'Console', lang: 'de', createdAt: NOW });
  assert.equal(ok.ok, true);
  assert.equal(ok.name, 'Moussa');
  assert.equal(ok.device, 'Ordinateur');
  assert.equal(ok.lang, 'fr');
  assert.equal(ok.createdAt, NOW);
  assert.equal(P.validatePayload({ id: 'nimporte', name: 'Moussa', age: 14 }).error, 'id_invalid');
  assert.equal(P.validatePayload({ id: ID, name: 'M', age: 14 }).error, 'name_short');
  assert.equal(P.validatePayload({ id: ID, name: 'Moussa', age: 3 }).error, 'age_range');
  assert.equal(P.validatePayload({ id: ID, name: 'Moussa', age: 14, createdAt: 'hier' }).createdAt, null);
});

test('fillName : le prénom dans les phrases', () => {
  assert.equal(P.fillName('{nom}, j’ai trouvé quelque chose.', 'Moussa'), 'Moussa, j’ai trouvé quelque chose.');
  assert.equal(P.fillName('Viens, {nom}.', 'Moussa'), 'Viens, Moussa.');
  assert.equal(P.fillName('Pas de nom ici.', 'Moussa'), 'Pas de nom ici.');
  assert.equal(P.fillName('{nom} et {nom}', 'Aïcha'), 'Aïcha et Aïcha');
});

test('fillName sans prénom : la phrase reste correcte', () => {
  assert.equal(P.fillName('{nom}, j’ai trouvé quelque chose.', ''), 'J’ai trouvé quelque chose.');
  assert.equal(P.fillName('Viens, {nom}.', null), 'Viens.');
  assert.equal(P.fillName('Regarde {nom} !', undefined), 'Regarde !');
  assert.equal(P.fillName('Bonjour', ''), 'Bonjour');
});
