/**
 * Tests unitaires de la logique de Tapama (aucune dépendance navigateur).
 * Usage : node tests/tapama-core.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import * as T from '../app/tapama-core.js';
import { fillName } from '../app/player-profile.js';

const test = (name, fn) => { fn(); console.log(`ok - ${name}`); };

test('portraitUrl : chaque expression a son fichier, repli sur neutre', () => {
  for (const m of T.MOODS) {
    assert.ok(existsSync(new URL('../' + T.portraitUrl(m), import.meta.url)), `portrait manquant : ${m}`);
  }
  assert.equal(T.safeMood('inconnue'), 'neutre');
  assert.equal(T.portraitUrl(undefined), 'assets/images/tapama/tapama-neutre.webp');
});

test('SEQUENCES : répliques valides, expressions connues, Tapama ouvre ou répond', () => {
  for (const seq of Object.values(T.SEQUENCES)) {
    assert.ok(seq.lines.length >= 2, seq.id);
    assert.ok(seq.lines.some(l => l.who === 'tapama'), `${seq.id} sans Tapama`);
    for (const l of seq.lines) {
      assert.ok(l.who === 'tapama' || l.who === 'player');
      assert.ok(l.text.length > 0);
      if (l.who === 'tapama') assert.ok(T.MOODS.includes(l.mood), `${seq.id} : ${l.mood}`);
    }
  }
});

test('createSequence : parcours complet, upcoming et historique', () => {
  const s = T.createSequence(T.SEQUENCES.appel);
  assert.equal(s.total, 3);
  assert.equal(s.current().who, 'tapama');
  assert.equal(s.upcoming().who, 'player');
  assert.deepEqual(s.history().length, 1);
  assert.equal(s.next(), true);
  assert.equal(s.current().who, 'player');
  assert.equal(s.next(), true);
  assert.equal(s.upcoming(), null);
  assert.equal(s.history().length, 3);
  assert.equal(s.next(), false);
  assert.equal(s.done, true);
  assert.equal(s.skipped, false);
  assert.equal(s.current(), null);
  assert.equal(s.history().length, 3);
});

test('createSequence : passer termine tout de suite', () => {
  const s = T.createSequence(T.SEQUENCES.appel);
  s.skip();
  assert.equal(s.done, true);
  assert.equal(s.skipped, true);
  assert.equal(s.next(), false);
});

test('createSequence : séquence vide déjà terminée', () => {
  const s = T.createSequence({ id: 'x', lines: [] });
  assert.equal(s.done, true);
  assert.equal(s.current(), null);
});

test('radioDuration : bornée entre 3,5 s et 9 s', () => {
  assert.equal(T.radioDuration('Ok'), 3.5);
  assert.equal(T.radioDuration('x'.repeat(500)), 9);
  const mid = T.radioDuration('x'.repeat(60));
  assert.ok(mid > 3.5 && mid < 9);
});

test('createRadioQueue : un appel à la fois, les suivants attendent', () => {
  const q = T.createRadioQueue(2);
  assert.equal(q.push({ text: 'Un', mood: 'neutre', duration: 2 }), true);
  assert.equal(q.current().text, 'Un');
  assert.equal(q.push({ text: 'Deux', duration: 2 }), true);
  assert.equal(q.push({ text: 'Trois', duration: 2 }), true);
  assert.equal(q.push({ text: 'Quatre', duration: 2 }), false, 'file pleine');
  assert.equal(q.pending(), 2);
  assert.equal(q.tick(1), null);
  assert.ok(Math.abs(q.progress() - 0.5) < 1e-9);
  assert.equal(q.tick(1.1), 'start');
  assert.equal(q.current().text, 'Deux');
  assert.equal(q.dismiss(), true);
  assert.equal(q.current().text, 'Trois');
  assert.equal(q.tick(5), 'end');
  assert.equal(q.current(), null);
  assert.equal(q.tick(1), null);
});

test('createRadioQueue : expression inconnue → neutre, texte vide refusé', () => {
  const q = T.createRadioQueue();
  assert.equal(q.push({ text: '' }), false);
  q.push({ text: 'Salut', mood: 'bizarre' });
  assert.equal(q.current().mood, 'neutre');
  q.clear();
  assert.equal(q.current(), null);
});

test('helpFor : 3 niveaux, bornés, repli sur l’exploration générale', () => {
  for (const id of Object.keys(T.PUZZLES)) {
    for (const lv of [1, 2, 3]) {
      const h = T.helpFor(id, lv);
      assert.equal(h.level, lv);
      assert.ok(h.text.length > 0);
      assert.ok(T.MOODS.includes(h.mood));
    }
  }
  assert.equal(T.helpFor('dispositif1', 9).level, 3);
  assert.equal(T.helpFor('dispositif1', 0).level, 1);
  assert.equal(T.helpFor('inconnu', 1).puzzle.id, 'general');
  assert.equal(T.HELP_LEVELS.length, 3);
});

test('le prénom du joueur : chaque phrase de Tapama reste correcte avec et sans prénom', () => {
  const all = [];
  for (const seq of Object.values(T.SEQUENCES)) for (const l of seq.lines) all.push(l.text);
  for (const r of Object.values(T.RADIO)) all.push(r.text);
  for (const p of Object.values(T.PUZZLES)) { all.push(p.prompt); for (const lv of Object.values(p.levels)) all.push(lv.text); }
  all.push(T.ANALYSES.projection.quote);

  let withName = 0;
  for (const t of all) {
    const named = fillName(t, 'Moussa');
    const plain = fillName(t, '');
    assert.ok(!named.includes('{') && !plain.includes('{'), `accolade restante : ${t}`);
    assert.ok(!/ ,|,,|\s{2,}|^[,.\s]/.test(plain), `ponctuation cassée sans prénom : « ${plain} »`);
    assert.ok(/^[A-ZÀ-Ý«]/.test(plain), `majuscule perdue sans prénom : « ${plain} »`);
    if (named.includes('Moussa')) withName++;
  }
  assert.ok(withName >= 6, `Tapama doit appeler le joueur par son nom (${withName} phrases)`);
  assert.equal(fillName(T.SEQUENCES.appel.lines[0].text, 'Moussa').slice(0, 29), 'Moussa, j’ai découvert quelqu');
  assert.ok(fillName(T.SEQUENCES.appel.lines[0].text, '').startsWith('J’ai découvert'));
});

test('analysisSummary : compte les hypothèses confirmées et ouvertes', () => {
  assert.deepEqual(T.analysisSummary(T.ANALYSES.projection), { confirmed: 2, open: 1 });
  assert.deepEqual(T.analysisSummary(null), { confirmed: 0, open: 0 });
});

test('createRadioQueue : le drapeau quiet (relecture : pas de notification sonore) traverse la file', () => {
  const q = T.createRadioQueue();
  q.push({ text: 'Premier appel' });
  assert.equal(q.current().quiet, false);
  q.push({ text: 'Relecture', quiet: true });
  q.dismiss();
  assert.equal(q.current().quiet, true);
});
