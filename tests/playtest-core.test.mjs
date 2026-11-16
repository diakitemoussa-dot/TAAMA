import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../app/playtest-core.js';

const sess = (events, extra = {}) => ({
  ...T.newSession({ id: 'abcd1234-0001-0002', nowIso: '2026-11-13T14:32:00.000Z', device: { type: 'Tablette', os: 'Android', browser: 'Chrome', screen: '1280×800' } }),
  player: { name: 'Awa', age: 15 },
  events,
  ...extra,
});

test('remise à zéro : seules les clés du jeu sont effacées', () => {
  const keys = ['taama.save.v1', 'taama.player.v1', 'djenne.missions.v2', 'taamaTest.current', 'taamaTest.archive', 'autre-site', 'taama'];
  assert.deepEqual(T.gameKeysToWipe(keys), ['taama.save.v1', 'taama.player.v1', 'djenne.missions.v2']);
});

test('mode test : ?test=1 active, ?test=0 coupe, sinon on garde le choix enregistré', () => {
  assert.equal(T.testModeFromUrl('?test=1', null), true);
  assert.equal(T.testModeFromUrl('?a=2&test=0', '1'), false);
  assert.equal(T.testModeFromUrl('', '1'), true);
  assert.equal(T.testModeFromUrl('?x=1', null), false);
});

test('appareil : ordinateur, tablette, téléphone', () => {
  assert.equal(T.deviceType({ coarse: false }), 'Ordinateur');
  assert.equal(T.deviceType({ coarse: true, width: 1280, height: 800 }), 'Tablette');
  assert.equal(T.deviceType({ coarse: true, width: 800, height: 390 }), 'Téléphone');
  assert.equal(T.osName('Mozilla/5.0 (Linux; Android 13; SM-X200)'), 'Android');
  assert.equal(T.osName('Mozilla/5.0 (Windows NT 10.0; Win64; x64)'), 'Windows');
  assert.equal(T.browserName('Mozilla/5.0 (Windows NT 10.0) AppleWebKit Chrome/120 Safari/537 Edg/120'), 'Edge');
});

test('résumé : étapes, temps par écran, erreurs et aides', () => {
  const s = summarize([
    { t: 0, k: 'ecran', d: { id: 'lancement' } },
    { t: 5000, k: 'ecran', d: { id: 'profil' } },
    { t: 20000, k: 'profil', d: { name: 'Awa' } },
    { t: 21000, k: 'ecran', d: { id: 'main' } },
    { t: 25000, k: 'nouvelle-partie' },
    { t: 26000, k: 'dialogue', d: { id: 'ouverture', phase: 'debut' } },
    { t: 40000, k: 'dialogue', d: { id: 'ouverture', phase: 'fin', skipped: true } },
    { t: 40000, k: 'evt', d: { n: 'taama:ouverture-fin' } },
    { t: 40000, k: 'jeu' },
    { t: 41000, k: 'sequence', d: { n: 3 } },
    { t: 60000, k: 'evt', d: { n: 'lab:open' } },
    { t: 61000, k: 'evt', d: { n: 'lab:enigme-erreur' } },
    { t: 62000, k: 'evt', d: { n: 'lab:enigme-erreur' } },
    { t: 63000, k: 'evt', d: { n: 'lab:indice' } },
    { t: 64000, k: 'aide', d: { id: 'general' } },
    { t: 70000, k: 'inactif', d: { ms: 35000 } },
    { t: 80000, k: 'erreur', d: { msg: 'boom' } },
  ]);
  assert.equal(s.name, 'Awa');
  assert.equal(s.device, 'Tablette');
  assert.equal(s.durationMs, 80000);
  assert.deepEqual(Object.keys(s.milestones), ['profil', 'nouvelle', 'ouverture', 'labo']);
  assert.equal(s.lastMilestone, 'Laboratoire ouvert');
  assert.equal(s.maxSequence, 3);
  assert.equal(s.screens['écran : profil'], 16000);
  assert.equal(s.screens['en jeu'], 20000);
  assert.equal(s.screens['laboratoire'], 20000);
  assert.equal(s.dialoguesSkipped, 1);
  assert.equal(s.dialogueReadMedianMs, 14000);
  assert.equal(s.labWrong, 2);
  assert.equal(s.labHints, 1);
  assert.equal(s.helpRequests, 1);
  assert.equal(s.idleMs, 35000);
  assert.equal(s.activeMs, 45000);
  assert.deepEqual(s.errorMessages, ['boom']);
  // 4/12 étapes → 23,3 pts ; autonomie 30 − 6 − 4 − 3 = 17
  assert.equal(s.score, 40);
  function summarize(ev) { return T.summarize(sess(ev)); }
});

test('clics d’agacement : 4 clics rapides au même endroit', () => {
  const clic = (t, x = 0.5, y = 0.5) => ({ t, k: 'clic', d: { x, y } });
  const s = T.summarize(sess([clic(0), clic(300), clic(600), clic(900), clic(5000, 0.1, 0.1)]));
  assert.equal(s.clicks, 5);
  assert.equal(s.rageClicks, 1);
  const calm = T.summarize(sess([clic(0), clic(2000), clic(4000), clic(6000)]));
  assert.equal(calm.rageClicks, 0);
});

test('temps caché (onglet en arrière-plan) retiré du temps actif', () => {
  const s = T.summarize(sess([{ t: 0, k: 'ecran', d: { id: 'main' } }, { t: 10000, k: 'cache' }, { t: 30000, k: 'visible' }, { t: 40000, k: 'action', d: { name: 'new' } }]));
  assert.equal(s.hiddenMs, 20000);
  assert.equal(s.activeMs, 20000);
});

test('noms identiques : libellés distincts par heure', () => {
  const a = sess([], { startedAt: '2026-11-13T14:32:00' });
  const b = sess([], { id: 'zzzz9999-0001-0002', startedAt: '2026-11-13T15:10:00' });
  const c = { ...sess([]), player: { name: 'Moussa' } };
  assert.deepEqual(T.uniqueLabels([a, b, c]), ['Awa (14:32)', 'Awa (15:10)', 'Moussa']);
  assert.deepEqual(T.uniqueLabels([a, { ...a, id: 'x' }]), ['Awa (14:32) #1', 'Awa (14:32) #2']);
});

test('fichier et validation de session', () => {
  const s = sess([]);
  assert.ok(T.isSession(s));
  assert.ok(!T.isSession({ ...s, id: '../../etc' }));
  assert.ok(!T.isSession({ format: 'x' }));
  assert.match(T.sessionFileName({ ...s, player: { name: 'Aïcha Koné' } }), /^\d{4}-\d{2}-\d{2}_\d{4}_Aicha-Kone_abcd1234\.json$/);
});

test('CSV pour Notion : une ligne par joueur, virgules protégées', () => {
  const s = T.summarize(sess([{ t: 1000, k: 'profil' }]));
  const csv = T.toCSV([s], ['Awa, la rapide']).split('\n');
  assert.equal(csv.length, 2);
  assert.ok(csv[0].startsWith('Joueur,Âge,Appareil'));
  assert.ok(csv[1].startsWith('"Awa, la rapide",15,Tablette'));
  assert.ok(csv[0].endsWith('Notes de l’animateur'));
  const withNotes = T.summarize({ ...sess([{ t: 1000, k: 'profil' }]), notes: ' A hésité devant le drone.\nTrès motivée. ' });
  assert.equal(withNotes.notes, 'A hésité devant le drone.\nTrès motivée.');
  assert.ok(T.toCSV([withNotes]).split('\n').slice(1).join('\n').endsWith('"A hésité devant le drone.\nTrès motivée."'));
});

test('séance : entonnoir, appareils et constats', () => {
  const mk = (name, device, evs) => ({ ...sess(evs), id: `${name}0000-0000-0000`.slice(0, 18), player: { name }, device: { type: device } });
  const a = mk('Awa', 'Ordinateur', [{ t: 0, k: 'profil' }, { t: 10, k: 'nouvelle-partie' }, { t: 20, k: 'evt', d: { n: 'taama:ouverture-fin' } }]);
  const b = mk('Issa', 'Téléphone', [{ t: 0, k: 'profil' }, { t: 50, k: 'dialogue', d: { id: 'x', phase: 'debut' } }, { t: 60, k: 'dialogue', d: { id: 'x', phase: 'fin', skipped: true } }]);
  const sessions = [a, b];
  const sums = sessions.map(T.summarize);
  const f = T.funnel(sums);
  assert.equal(f[0].pct, 100);
  assert.equal(f[1].count, 1);
  const d = T.byDevice(sums);
  assert.equal(d.length, 2);
  const ins = T.insights(sessions, sums, T.uniqueLabels(sessions)).map((x) => x.text).join('\n');
  assert.doesNotMatch(ins, /point d’arrêt/);   // un seul joueur arrêté à chaque endroit : pas de constat
  assert.match(ins, /Meilleur indice de jeu : Awa/);
  assert.match(ins, /Écart selon l’appareil/);
});

test('point d’arrêt : là où plusieurs joueurs s’arrêtent', () => {
  const mk = (id, evs) => ({ ...sess(evs), id });
  const stuck = [{ t: 0, k: 'profil' }, { t: 10, k: 'nouvelle-partie' }];
  const sessions = [mk('aaaa1', stuck), mk('bbbb2', stuck), mk('cccc3', [...stuck, { t: 20, k: 'evt', d: { n: 'taama:ouverture-fin' } }])];
  const sums = sessions.map(T.summarize);
  const ins = T.insights(sessions, sums, T.uniqueLabels(sessions)).map((x) => x.text).join('\n');
  assert.match(ins, /2 joueur\(s\) sur 3 se sont arrêtés après « Nouvelle partie lancée », sans atteindre « Appel de Tapama terminé »/);
});

test('inactivité pendant que l’appli est quittée : pas comptée deux fois', () => {
  const s = T.summarize(sess([{ t: 0, k: 'ecran', d: { id: 'pause' } }, { t: 10000, k: 'cache' }, { t: 70000, k: 'visible' }, { t: 100000, k: 'inactif', d: { ms: 90000 } }]));
  assert.equal(s.hiddenMs, 60000);
  assert.equal(s.idleMs, 30000);
  assert.equal(s.activeMs, 10000);
});

test('même bouton en boucle (manette comprise) : constat', () => {
  const evs = Array.from({ length: 8 }, (_, i) => ({ t: 1000 + i * 500, k: 'action', d: { name: 'back', ecran: 'carte' } }));
  const ss = [sess(evs)];
  const ins = T.insights(ss, ss.map(T.summarize), ['ISMA']).map((x) => x.text).join('\n');
  assert.match(ins, /Bouton actionné en boucle : « back » sur l’écran carte, jusqu’à 8 fois en 10 s \(ISMA\)/);
});
