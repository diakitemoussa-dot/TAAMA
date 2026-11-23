/** Tests de wet-look.js : séchage et valeurs des matériaux. Usage : node tests/wet-look.test.mjs */
import assert from 'node:assert/strict';
import { wetLevel, wetValues, WET_HOLD, WET_FADE, DARKEN } from '../app/wet-look.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
t('plein effet pendant WET_HOLD puis séchage progressif', () => {
  const s = { level: 1, hold: WET_HOLD };
  wetLevel(s, WET_HOLD - 0.1); assert.equal(s.level, 1);
  wetLevel(s, 0.2); assert.equal(s.level, 1, 'le temps de pause est épuisé mais pas encore de séchage');
  wetLevel(s, WET_FADE / 2); assert.ok(Math.abs(s.level - 0.5) < 1e-9);
  wetLevel(s, WET_FADE); assert.equal(s.level, 0);
});
t('à sec : valeurs d\'origine inchangées', () => {
  const v = wetValues({ rough: 0.8 }, 0); assert.equal(v.k, 1); assert.equal(v.rough, 0.8);
});
t('mouillé : plus sombre et moins rugueux, sans passer sous le plancher', () => {
  const v = wetValues({ rough: 0.8 }, 1); assert.ok(Math.abs(v.k - (1 - DARKEN)) < 1e-9); assert.ok(v.rough < 0.8 && v.rough >= 0.12);
  assert.equal(wetValues({ rough: 0.05 }, 1).rough, 0.05, 'un matériau déjà lisse n\'est pas durci');
});
console.log(`${n} tests OK`);
