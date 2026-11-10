/** Tests de tapama-face.js : placement du calque, clignement, ouverture de bouche. Usage : node tests/tapama-face.test.mjs */
import assert from 'node:assert/strict';
import { FACE, moodOf, drawnRect, objPosFrac, nextBlinkDelay, blinkAmount, smoothMouth, openingFromLevel } from '../app/tapama-face.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
t('humeur lue dans l\'adresse de l\'image', () => { assert.equal(moodOf('assets/images/tapama/tapama-souriante.webp'), 'souriante'); assert.equal(moodOf('x.png'), 'neutre'); });
t('chaque humeur a bouche et deux yeux dans l\'image', () => {
  for (const [m, f] of Object.entries(FACE)) { assert.equal(f.eyes.length, 2, m); for (const v of [...f.mouth.slice(0, 2), ...f.eyes.flat()]) assert.ok(v > 0 && v < 1, m); assert.ok(f.eyes[0][0] < f.mouth[0] && f.mouth[0] < f.eyes[1][0], m + ' : bouche entre les yeux'); assert.ok(f.eyes[0][1] < f.mouth[1], m + ' : yeux au-dessus de la bouche'); }
});
t('rectangle dessiné : image plus haute que large (contain, en bas à gauche)', () => {
  const r = drawnRect({ left: 10, top: 20, width: 1000, height: 745 }); assert.equal(Math.round(r.w), 600); assert.equal(Math.round(r.h), 745); assert.equal(r.x, 10); assert.equal(Math.round(r.y), 20);
  const r2 = drawnRect({ left: 0, top: 0, width: 300, height: 1000 }); assert.equal(Math.round(r2.w), 300); assert.ok(r2.y > 0 && Math.abs(r2.y + r2.h - 1000) < 1, 'collée en bas');
});
t('position objet : mots-clés et pourcentages', () => {
  assert.deepEqual(objPosFrac('bottom left'), [0, 1]); assert.deepEqual(objPosFrac('0% 100%'), [0, 1]); assert.deepEqual(objPosFrac('50% 50%'), [0.5, 0.5]); assert.deepEqual(objPosFrac('center top'), [0.5, 0]);
});
t('médaillon (cover) : le portrait remplit la boîte', () => {
  const r = drawnRect({ left: 0, top: 0, width: 100, height: 100 }, '50% 20%', 'cover'); assert.ok(r.w >= 100 && r.h >= 100); assert.ok(r.y <= 0);
});
t('clignements plus fréquents quand elle parle', () => { assert.ok(nextBlinkDelay(true, 1) <= 3.0 && nextBlinkDelay(false, 0) >= 2.5); });
t('paupière : ouverte → fermée → ouverte', () => { assert.equal(blinkAmount(-1), 0); assert.ok(blinkAmount(0.07) > 0.95); assert.equal(blinkAmount(0.2), 0); assert.ok(blinkAmount(0.12) < blinkAmount(0.07)); });
t('bouche : souffle ignoré, voix forte = grande ouverture, ouverture plus rapide que fermeture', () => {
  assert.equal(openingFromLevel(0.03), 0); assert.ok(openingFromLevel(0.6) > 0.9);
  assert.ok(smoothMouth(0, 1, 0.03) - 0 > 1 - smoothMouth(1, 0, 0.03));
});
console.log(`${n} tests OK`);
