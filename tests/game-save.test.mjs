/**
 * Tests unitaires de la sauvegarde et des réglages (aucune dépendance navigateur).
 * Usage : node tests/game-save.test.mjs
 */
import assert from 'node:assert/strict';
import * as G from '../app/game-save.js';

const test = (name, fn) => { fn(); console.log(`ok - ${name}`); };

const fakeStorage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _m: m,
  };
};
const NOW = '2026-10-30T18:42:00';

test('13 séquences numérotées de 1 à 13, titres non vides', () => {
  assert.equal(G.SEQUENCE_COUNT, 13);
  G.SEQUENCES_LIST.forEach((s, i) => { assert.equal(s.n, i + 1); assert.ok(s.title.length > 0); });
  assert.equal(G.sequenceLabel(4), 'Séquence 4 · Le premier repérage');
});

test('réglages : défauts, valeurs invalides ignorées, bornes 0–100', () => {
  assert.deepEqual(G.sanitizeSettings(null), { ...G.DEFAULT_SETTINGS });
  const s = G.sanitizeSettings({ volume: 250, music: -5, lang: 'zz', timeSpeed: 4, textSize: 'L', showFps: 'oui', inconnu: 1 });
  assert.equal(s.volume, 100);
  assert.equal(s.music, 0);
  assert.equal(s.lang, 'fr');
  assert.equal(s.timeSpeed, 4);
  assert.equal(s.textSize, 'L');
  assert.equal(s.showFps, false);
  assert.ok(!('inconnu' in s));
});

test('réglages : enregistrement puis lecture, JSON corrompu → défauts', () => {
  const st = fakeStorage();
  assert.deepEqual(G.loadSettings(st), { ...G.DEFAULT_SETTINGS });
  G.saveSettings(st, { ...G.DEFAULT_SETTINGS, volume: 33, quality: 'low' });
  const back = G.loadSettings(st);
  assert.equal(back.volume, 33);
  assert.equal(back.quality, 'low');
  st.setItem(G.SETTINGS_KEY, '{pas du json');
  assert.deepEqual(G.loadSettings(st), { ...G.DEFAULT_SETTINGS });
});

test('nouvelle partie : séquence 3, séquences 1 et 2 faites', () => {
  const s = G.newSave(NOW);
  assert.equal(s.sequence, 3);
  assert.deepEqual(s.done, [1, 2]);
  assert.deepEqual(s.discoveries, []);
  assert.equal(s.playMs, 0);
});

test('terminer l’appel (séquence 3) fait passer à la séquence 4', () => {
  const s = G.completeSequence(G.newSave(NOW), 3, NOW);
  assert.equal(s.sequence, 4);
  assert.deepEqual(s.done, [1, 2, 3]);
  assert.equal(G.sequenceLabel(s.sequence), 'Séquence 4 · Le premier repérage');
});

test('revoir une séquence passée ne fait pas reculer la progression', () => {
  let s = G.completeSequence(G.newSave(NOW), 3, NOW);
  s = G.completeSequence(s, 4, NOW);
  s = G.completeSequence(s, 3, NOW);
  assert.equal(s.sequence, 5);
  assert.deepEqual(s.done, [1, 2, 3, 4]);
});

test('la progression est bornée à la séquence 13', () => {
  const s = G.completeSequence({ ...G.newSave(NOW), sequence: 13 }, 13, NOW);
  assert.equal(s.sequence, 13);
});

test('découvertes : ajout unique, identifiants inconnus refusés', () => {
  let s = G.newSave(NOW);
  s = G.addDiscovery(s, 'indice');
  s = G.addDiscovery(s, 'indice');
  s = G.addDiscovery(s, 'tresor');
  assert.deepEqual(s.discoveries, ['indice']);
});

test('temps de jeu cumulé, jamais négatif', () => {
  let s = G.addPlayTime(G.newSave(NOW), 60000, NOW);
  s = G.addPlayTime(s, -5000, NOW);
  assert.equal(s.playMs, 60000);
});

test('sauvegarde : écriture, lecture, suppression', () => {
  const st = fakeStorage();
  assert.equal(G.loadSave(st), null);
  const s = G.completeSequence(G.newSave(NOW), 3, NOW);
  assert.equal(G.writeSave(st, s), true);
  assert.deepEqual(G.loadSave(st), s);
  assert.equal(G.deleteSave(st), true);
  assert.equal(G.loadSave(st), null);
});

test('sauvegarde illisible ou d’une autre version → ignorée', () => {
  const st = fakeStorage();
  st.setItem(G.SAVE_KEY, 'n’importe quoi');
  assert.equal(G.loadSave(st), null);
  st.setItem(G.SAVE_KEY, JSON.stringify({ version: 2, sequence: 4 }));
  assert.equal(G.loadSave(st), null);
  st.setItem(G.SAVE_KEY, JSON.stringify({ version: 1, sequence: 'quatre' }));
  assert.equal(G.loadSave(st), null);
});

test('sauvegarde : valeurs hors bornes nettoyées', () => {
  const s = G.sanitizeSave({ version: 1, sequence: 99, done: [1, 1, 2, 77, 'x'], discoveries: ['cle', 'zzz'], playMs: -4 });
  assert.equal(s.sequence, 13);
  assert.deepEqual(s.done, [1, 2]);
  assert.deepEqual(s.discoveries, ['cle']);
  assert.equal(s.playMs, 0);
});

test('stockage qui plante (mode privé) : aucune exception', () => {
  const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
  assert.equal(G.loadSave(broken), null);
  assert.deepEqual(G.loadSettings(broken), { ...G.DEFAULT_SETTINGS });
  assert.equal(G.writeSave(broken, G.newSave(NOW)), false);
  assert.equal(G.saveSettings(broken, G.DEFAULT_SETTINGS), false);
  assert.equal(G.deleteSave(broken), false);
});

test('formatLastPlayed : aujourd’hui, hier, date', () => {
  const now = new Date('2026-10-30T20:00:00');
  assert.equal(G.formatLastPlayed('2026-10-30T18:42:00', now), 'Aujourd’hui · 18:42');
  assert.equal(G.formatLastPlayed('2026-10-29T09:05:00', now), 'Hier · 09:05');
  assert.equal(G.formatLastPlayed('2026-10-12T09:05:00', now), '12 oct. · 09:05');
  assert.equal(G.formatLastPlayed(null, now), '—');
  assert.equal(G.formatLastPlayed('pas une date', now), '—');
});

test('formatPlaytime : minutes, heures', () => {
  assert.equal(G.formatPlaytime(0), 'Moins d’une minute');
  assert.equal(G.formatPlaytime(60000), '1 minute');
  assert.equal(G.formatPlaytime(47 * 60000), '47 minutes');
  assert.equal(G.formatPlaytime(65 * 60000), '1 h 05');
});

test('objectifs et pourcentage de progression', () => {
  assert.ok(G.sequenceObjective(4).startsWith('Examiner l’emplacement'));
  for (let n = 1; n <= 13; n++) assert.ok(G.sequenceObjective(n).length > 0);
  assert.equal(G.progressPercent(4), 31);
  assert.equal(G.progressPercent(13), 100);
  assert.equal(G.progressPercent(0), 8);
  assert.equal(G.progressPercent(99), 100);
});

test('destinations : 1 sur 5, Djenné seule ouverte', () => {
  assert.deepEqual(G.destinationsProgress(), { open: 1, total: 5 });
  assert.equal(G.DESTINATIONS[0].id, 'djenne');
});
