/**
 * Tests unitaires des énigmes du laboratoire (aucune dépendance navigateur).
 * Usage : node --test tests/   (ou node tests/lab-enigmes.test.mjs)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, motsEnNombre, lireNombre, verifier, ENIGMES, enigmesDuStade } from '../app/laboratoire.js';

test('normaliser : minuscules, accents et ponctuation retirés', () => {
  assert.equal(normaliser('  Quatre-Vingt-DIX ! '), 'quatre vingt dix');
  assert.equal(normaliser('Écrêté, œuf'), 'ecrete oeuf');
});

test('motsEnNombre : nombres en lettres', () => {
  const cas = {
    'quatre-vingt-dix': 90, 'quatre vingts': 80, 'quatre-vingt-dix-sept': 97, 'cent quatre': 104,
    'cent': 100, 'mille neuf cent sept': 1907, 'dix-neuf cent sept': 1907, 'soixante-dix': 70,
    'quatre-vingt-un': 81, 'quatre-vingt et un': 81, 'trois': 3, 'trois tours': 3, 'cent quatre-vingt': 180,
    'deux cent quatre': 204, 'vingt': 20, 'seize': 16,
  };
  for (const [txt, n] of Object.entries(cas)) assert.equal(motsEnNombre(txt), n, txt);
  assert.equal(motsEnNombre('bonjour'), null);
  assert.equal(motsEnNombre(''), null);
});

test('lireNombre : chiffres, espaces, texte autour', () => {
  assert.equal(lireNombre('90'), 90);
  assert.equal(lireNombre(' 90 piliers '), 90);
  assert.equal(lireNombre('1 907'), 1907);
  assert.equal(lireNombre('1907 !'), 1907);
  assert.equal(lireNombre('en 1907'), 1907);
  assert.equal(lireNombre('Cent quatre'), 104);
  assert.equal(lireNombre('90 ou 100'), null);          // ambigu
  assert.equal(lireNombre('abc'), null);
});

test('E1 piliers : 90 accepté, 100 = presque, reste faux', () => {
  assert.equal(verifier('E1', '90').statut, 'ok');
  assert.equal(verifier('E1', 'quatre-vingt-dix').statut, 'ok');
  assert.equal(verifier('E1', '90 piliers').statut, 'ok');
  assert.equal(verifier('E1', '100').statut, 'proche');
  assert.equal(verifier('E1', 'cent').statut, 'proche');
  assert.equal(verifier('E1', '89').statut, 'faux');
  assert.equal(verifier('E1', '').statut, 'vide');
  assert.equal(verifier('E1', '   ').statut, 'vide');
});

test('E2 canaris et E3 reconstruction', () => {
  assert.equal(verifier('E2', '104').statut, 'ok');
  assert.equal(verifier('E2', 'cent quatre').statut, 'ok');
  assert.equal(verifier('E2', '105').statut, 'faux');
  assert.equal(verifier('E3', '1907').statut, 'ok');
  assert.equal(verifier('E3', 'en 1907').statut, 'ok');
  assert.equal(verifier('E3', 'mille neuf cent sept').statut, 'ok');
  assert.equal(verifier('E3', '1909').statut, 'faux');
  assert.equal(verifier('E3', '1906').statut, 'faux');
});

test('E4 torons : singulier, pluriel, accents, une faute de frappe', () => {
  for (const ok of ['toron', 'torons', 'Les Torons', 'TORONS', 'un toron', 'torrons', 'on les appelle torons'])
    assert.equal(verifier('E4', ok).statut, 'ok', ok);
  for (const ko of ['poutre', 'tour', 'brique', 'torche', '90']) assert.equal(verifier('E4', ko).statut, 'faux', ko);
});

test('E5 tours et E6 calcul', () => {
  assert.equal(verifier('E5', '3').statut, 'ok');
  assert.equal(verifier('E5', 'trois').statut, 'ok');
  assert.equal(verifier('E5', '2').statut, 'faux');
  assert.equal(verifier('E6', '81').statut, 'ok');
  assert.equal(verifier('E6', '81 ans').statut, 'ok');
  assert.equal(verifier('E6', 'quatre-vingt-un').statut, 'ok');
  assert.equal(verifier('E6', '80').statut, 'faux');
  assert.equal(verifier('E6', '1988').statut, 'faux');
});

test('structure : 3 énigmes par stade, 2 indices, réponse révélable valide', () => {
  assert.equal(ENIGMES.length, 6);
  for (const stage of [1, 2]) {
    const l = enigmesDuStade(stage);
    assert.equal(l.length, 3);
    assert.deepEqual(l.map((e) => e.index), [0, 1, 2]);
  }
  for (const e of ENIGMES) {
    assert.equal(e.indices.length, 2, e.id);
    assert.equal(verifier(e, e.affichee).statut, 'ok', `${e.id} : la réponse révélée doit être valide`);
    for (const txt of [e.question, e.succes, e.erreur, ...e.indices]) assert.ok(txt.length <= 220, `${e.id} : texte trop long`);
  }
});

test('verifier : énigme inconnue → faux', () => {
  assert.equal(verifier('E99', '1').statut, 'faux');
});
