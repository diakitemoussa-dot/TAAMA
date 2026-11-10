/**
 * Tests du guide « Comment jouer » : logique pure (mode, objectif, état mémorisé) et textes (10 mots, anglais).
 * Usage : node tests/guide.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as I from '../app/i18n.js?v=1';          // mêmes URL que l'app : une seule instance du dictionnaire
import * as L from '../app/guide-logic.js';
import * as C from '../app/guide-content.js';
import * as TL from '../app/touch-layout.js';

let passed = 0;
const test = (name, fn) => { try { fn(); } finally { I.setLang('fr'); } passed++; console.log(`ok - ${name}`); };

test('mode de commande : tactile, manette, clavier', () => {
  assert.equal(L.pickMode({}), 'kbd');
  assert.equal(L.pickMode({ pad: true }), 'kbd', 'manette branchée mais jamais utilisée : clavier');
  assert.equal(L.pickMode({ pad: true, last: 'pad' }), 'pad', 'manette réellement utilisée');
  assert.equal(L.pickMode({ coarse: true, maxTouchPoints: 5 }), 'touch');
  assert.equal(L.pickMode({ coarse: true, maxTouchPoints: 0 }), 'kbd', 'pointeur grossier sans écran tactile');
  assert.equal(L.pickMode({ touchParam: '1' }), 'touch');
  assert.equal(L.pickMode({ touchParam: '0', coarse: true, maxTouchPoints: 5 }), 'kbd');
  assert.equal(L.pickMode({ touchParam: '1', pad: true }), 'touch', 'tactile par défaut sur téléphone, même avec manette branchée');
});

test('mode de commande : la dernière entrée du joueur prime', () => {
  assert.equal(L.pickMode({ pad: true, last: 'kbd' }), 'kbd', 'premier appui clavier');
  assert.equal(L.pickMode({ pad: true, last: 'pad' }), 'pad');
  assert.equal(L.pickMode({ last: 'pad' }), 'kbd', 'manette débranchée : retour au clavier');
  assert.equal(L.pickMode({ last: 'touch' }), 'kbd', 'pas d’écran tactile');
  assert.equal(L.pickMode({ coarse: true, maxTouchPoints: 3, pad: true, last: 'pad' }), 'pad');
  assert.equal(L.pickMode({ coarse: true, maxTouchPoints: 3, pad: true, last: 'touch' }), 'touch');
});

test('objectif selon l’avancement de l’histoire', () => {
  const id = (f) => L.chooseObjective(f).id;
  assert.equal(id({}), 'start');
  assert.equal(id({ acte: '0:done' }), 'start', 'drone pas encore lancé');
  assert.equal(id({ acte: '0:done', drone: true }), 'spot');
  assert.equal(id({ acte: '1:vol', drone: true }), 'spot');
  assert.equal(id({ acte: '1:vol', spotted: '1' }), 'ramasser');
  assert.equal(id({ acte: '1:d1', spotted: '1', dispositif1: '1' }), 'labo');
  assert.equal(id({ dispositif1: '1', lab1: 'open' }), 'labo', 'labo commencé mais pas fini');
  assert.equal(id({ dispositif1: '1', lab1: 'done', vol: null }), 'devant');
  assert.equal(id({ dispositif1: '1', lab1: 'done', vol: '1', gadget: '1' }), 'base');
  assert.equal(id({ dispositif1: '1', lab1: 'done', vol: '1', gadget: '1', dispositif2: '1' }), 'retour');
  assert.equal(id({ dispositif2: '1', lab2: 'done', chapitre1: 'done' }), 'fin');
  assert.equal(id({ chapitre1: 'done' }), 'fin');
});

test('sujet proposé selon l’avancement : il existe dans le guide', () => {
  const topics = new Set(C.PAGES.map((p) => p.id));
  for (const o of Object.values(L.OBJ)) { assert.ok(topics.has(o.topic), `${o.id} → ${o.topic}`); assert.ok(C.OBJECTIVES[o.id], `texte de ${o.id}`); }
  assert.equal(L.suggestTopic({}), 'drone');
  assert.equal(L.suggestTopic({ gadget: '1' }), 'gadget');
});

test('état mémorisé : vu, passé, rejouer, données abîmées', () => {
  let s = L.defaultState();
  assert.ok(L.canHint(s, 'drone'));
  s = L.markSeen(s, 'drone');
  assert.ok(L.hasSeen(s, 'drone') && !L.canHint(s, 'drone') && L.canHint(s, 'move'));
  const back = L.parseState(L.serializeState(s));
  assert.ok(L.hasSeen(back, 'drone'), 'aller-retour localStorage');
  s = { ...s, prefs: { ...s.prefs, off: true } };
  assert.ok(!L.canHint(s, 'move'), 'guide passé : plus de conseils');
  s = L.resetSeen(s);
  assert.ok(L.canHint(s, 'drone') && !s.prefs.off, 'rejouer le guide');
  for (const bad of [null, '', '{', '[]', '42', '{"seen":5,"prefs":"x"}']) assert.deepEqual(L.parseState(bad), L.defaultState(), String(bad));
  assert.equal(L.parseState({ prefs: { large: 'oui', speak: true } }).prefs.large, false);
  assert.equal(L.parseState({ prefs: { speak: true } }).prefs.speak, true);
});

test('animations réduites : choix du joueur ou préférence du système', () => {
  const s = L.defaultState();
  assert.equal(L.reducedMotion(s, true), true);
  assert.equal(L.reducedMotion(s, false), false);
  assert.equal(L.reducedMotion({ ...s, prefs: { ...s.prefs, reduce: false } }, true), false);
  assert.equal(L.reducedMotion({ ...s, prefs: { ...s.prefs, reduce: true } }, false), true);
});

test('comptage de mots', () => {
  assert.equal(L.wordCount('Appuie sur Z, Q, S, D pour marcher.'), 8);
  assert.equal(L.wordCount('Rapproche-toi : ça marche !'), 3);
  assert.equal(L.wordCount(''), 0);
});

test('chaque texte français du guide tient en 10 mots', () => {
  const bad = C.allTexts().filter(([, t]) => L.wordCount(t) > L.MAX_WORDS).map(([w, t]) => `${w} : ${t} (${L.wordCount(t)})`);
  assert.deepEqual(bad, []);
});

test('chaque texte du guide a sa traduction anglaise', () => {
  const missing = C.allTexts().filter(([, t]) => !I.has(t)).map(([w, t]) => `${w} : ${t}`);
  assert.deepEqual(missing, []);
  I.setLang('en');
  assert.equal(I.t(C.PAGES[0].line.kbd), 'Press W, A, S, D to walk.');
  assert.equal(I.t(C.OBJECTIVES.start, { nom: 'Awa' }), 'Launch your drone and explore the city, Awa!');
});

test('pages : trois modes complets, gestes valides, boutons tactiles qui existent', () => {
  const ids = new Set();
  for (const p of C.PAGES) {
    assert.ok(!ids.has(p.id), 'id en double ' + p.id); ids.add(p.id);
    for (const m of L.MODES) { assert.ok(p.line[m], `${p.id}/${m} phrase`); assert.ok(p.g[m], `${p.id}/${m} geste`); }
    assert.ok(TL.MODES.includes(p.tm), `${p.id} mode tactile`);
    for (const a of p.g.touch.b || []) {
      assert.ok(TL.ACTIONS[a], `${p.id} action ${a}`);
      assert.ok(TL.defaultControls(p.tm).some((c) => (c.action || '') === a), `${p.id} : bouton ${a} absent du mode ${p.tm}`);
    }
    const kc = p.g.kbd.kc, k = p.g.kbd.k;
    if (kc) assert.equal(kc.length, k.length, `${p.id} légendes clavier`);
    if (p.g.pad.bc) assert.equal(p.g.pad.bc.length, p.g.pad.b.length, `${p.id} légendes manette`);
  }
  assert.ok(C.PAGES.length >= 18);
});

test('état d’une ancienne version : conseils « vus » et « Passer » oubliés, préférences gardées', () => {
  const old = JSON.stringify({ v: 1, seen: { drone: 1, fly: 1 }, prefs: { large: true, reduce: null, speak: false, off: true } });
  const s = L.parseState(old);
  assert.deepEqual(s.seen, {}, 'le drone doit pouvoir se réafficher');
  assert.equal(s.prefs.off, false);
  assert.equal(s.prefs.large, true, 'préférence conservée');
  assert.deepEqual(L.parseState('{"seen":{"drone":1}}').seen, {}, 'sans version : ancien');
  assert.ok(L.hasSeen(L.parseState(L.serializeState(L.markSeen(L.defaultState(), 'drone'))), 'drone'), 'état courant relu');
  assert.equal(L.defaultState().v, L.STATE_VERSION);
});

test('build du guide : tous les fichiers sont chargés avec le même numéro (aucun ancien fichier en cache)', () => {
  const rd = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const build = (rd('app/guide.js').match(/GUIDE_BUILD = '(\d+)'/) || [])[1];
  assert.ok(build, 'GUIDE_BUILD défini dans guide.js');
  const refs = [];
  for (const f of fs.readdirSync(new URL('../app/', import.meta.url)).filter((x) => /^guide.*\.js$/.test(x))) {
    for (const m of rd('app/' + f).matchAll(/(guide[a-z-]*\.(?:js|css))\?v=(\d+)/g)) refs.push([f, m[1], m[2]]);
  }
  for (const m of rd('index.html').matchAll(/(app\/guide\.js)\?v=(\d+)/g)) refs.push(['index.html', m[1], m[2]]);
  assert.ok(refs.length >= 8, 'imports trouvés : ' + refs.length);
  const bad = refs.filter((r) => r[2] !== build).map((r) => r.join(' '));
  assert.deepEqual(bad, [], 'build attendu ' + build);
  for (const name of ['guide-ui.js', 'guide-screen.js', 'guide-art.js', 'guide-content.js', 'guide-logic.js', 'guide-icons.js', 'guide.css', 'guide-screen.css']) assert.ok(refs.some((r) => r[1].endsWith(name)), name + ' non référencé');
});

console.log(`\n${passed} tests OK`);
