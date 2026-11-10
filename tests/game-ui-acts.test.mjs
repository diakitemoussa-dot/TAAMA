/* Chaque zone cliquable (data-act) des écrans générés a un gestionnaire dans game-ui.js (et inversement). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCREENS } from '../app/game-screens.js';

const ui = fs.readFileSync(new URL('../app/game-ui.js', import.meta.url), 'utf8');
const body = ui.slice(ui.indexOf('function act(name)'), ui.indexOf('function setLang('));
const handled = new Set([...body.matchAll(/case '([^']+)'/g)].map((m) => m[1]));
const used = new Set();
for (const s of Object.values(SCREENS)) for (const m of s.html.matchAll(/data-act="([^"]+)"/g)) used.add(m[1]);
const INJECTED = new Set(['guide']);        // bouton « Comment jouer ? » ajouté par game-ui.js (injectGuideButton), absent des écrans générés
const isPrefix = (a) => a.startsWith('options:') || a.startsWith('lang:');

test('toute action d’écran a un case dans act()', () => {
  const missing = [...used].filter((a) => !isPrefix(a) && !handled.has(a));
  assert.deepEqual(missing, []);
});
test('tout case de act() est utilisé par un écran (ou déclenché par le code)', () => {
  const dead = [...handled].filter((a) => !used.has(a) && !INJECTED.has(a));
  assert.deepEqual(dead, []);
});
