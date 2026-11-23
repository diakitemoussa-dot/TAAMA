/* Contrôle de la note du labo : refuse le charabia, accepte une vraie phrase et repère un mot à citer. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../app/laboratoire.js', import.meta.url), 'utf8');
const a = src.indexOf('const NOTE_MIN_CARS'), b = src.indexOf('const KEYPAD_NOTE');
const c = src.indexOf('const NOTE_RANGEES'), d = src.indexOf('function submitNote');
const analyse = new Function(src.slice(a, b) + src.slice(c, d) + '; return analyseNote;')();

test('une vraie phrase passe et cite un mot utile', () => {
  const r = analyse('Le toron sert d’appui pour grimper sur la mosquée');
  assert.equal(r.ok, true);
  assert.ok(r.mot.length >= 4);
});
test('le charabia est refusé', () => {
  for (const t of ['aaaa aaaa aaaa', 'qsdfgh jklmpo wxcvbn', 'azerty azerty azerty', 'hhhhh bbbbb ccccc ddd', 'xkcd zzzz brrrr tgvb']) assert.equal(analyse(t).ok, false, t);
});
test('une réponse courte ou avec des fautes est acceptée', () => {
  for (const t of ['Notre maison', 'mezon en tere', 'bambou', 'Le mur']) assert.equal(analyse(t).ok, true, t);
});
test('vide ou une seule lettre est refusé', () => {
  for (const t of ['', 'a', '??']) assert.equal(analyse(t).ok, false, t);
});
