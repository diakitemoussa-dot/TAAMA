// Effets d'écran : durées du flyer et des écrans noirs, menus qui passent par l'écran noir. Lancer : node --test tests/screen-fx.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMenuScreen, MENU_SCREENS, FLYER_HOLD_MS, FADE_MS, BLACK_IN_MS, BLACK_OUT_MS, BLACK_MS } from '../app/screen-fx.js';

test('durées : flyer 4 s, fondu de fin 1 s, écran noir 1 s + 1 s = 2 s', () => {
  assert.equal(FLYER_HOLD_MS, 4000);
  assert.equal(FADE_MS, 1000);
  assert.equal(BLACK_IN_MS, 1000);
  assert.equal(BLACK_OUT_MS, 1000);
  assert.equal(BLACK_MS, 2000);
});

test('isMenuScreen : les menus oui ; titre, chargement, cinématique, pause et lancement non', () => {
  for (const id of ['main', 'nouvelle', 'continuer', 'carte', 'options-audio', 'options-commandes', 'options-affichage', 'options-jeu', 'credits', 'profil']) {
    assert.equal(isMenuScreen(id), true, id);
  }
  for (const id of ['pause', 'lancement', 'chargement', 'cinematique']) {
    assert.equal(isMenuScreen(id), false, id);
  }
  assert.equal(isMenuScreen('inconnu'), false);
  assert.equal(MENU_SCREENS.length, 10);
});
