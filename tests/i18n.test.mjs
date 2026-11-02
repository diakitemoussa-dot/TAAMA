/**
 * Tests de la traduction FR / EN : moteur + couverture du dictionnaire.
 * Usage : node tests/i18n.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as I from '../app/i18n.js';
import * as G from '../app/game-save.js';
import * as P from '../app/player-profile.js';
import * as T from '../app/tapama-core.js';
import { SCREENS } from '../app/game-screens.js';

let passed = 0;
const test = (name, fn) => { try { fn(); } finally { I.setLang('fr'); } passed++; console.log(`ok - ${name}`); };

const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const hasWords = (s) => /[A-Za-zÀ-ÿ]{2,}/.test(s);

function texts(html) {
  html = html.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Set();
  for (const part of html.split(/<[^>]*>/)) { const t = I.norm(decode(part)); if (t && hasWords(t)) out.add(t); }
  for (const m of html.matchAll(/\b(aria-label|alt|placeholder|title)="([^"]*)"/g)) { const t = I.norm(decode(m[2])); if (t && hasWords(t)) out.add(t); }
  return out;
}

test('en français : t() ne fait que remplir les valeurs', () => {
  assert.equal(I.t('Ton âge doit être entre {a} et {b} ans.', { a: 6, b: 99 }), 'Ton âge doit être entre 6 et 99 ans.');
  assert.equal(I.t('Texte inconnu'), 'Texte inconnu');
});

test('en anglais : traduction, valeurs insérées, texte inconnu laissé tel quel', () => {
  I.setLang('en');
  assert.equal(I.t('Nouvelle partie'), 'New game');
  assert.equal(I.t('Ton âge doit être entre {a} et {b} ans.', { a: 6, b: 99 }), 'Your age must be between 6 and 99.');
  assert.equal(I.t('Un texte que personne n’a traduit'), 'Un texte que personne n’a traduit');
  assert.equal(I.t('  Nouvelle   partie '), 'New game', 'espaces normalisés');
  assert.equal(I.t("Choix de l'équipe"), 'Team selection', 'apostrophe droite ou courbe');
});

test('on revient en français sans rien perdre', () => {
  I.setLang('en'); I.setLang('fr');
  assert.equal(I.t('Nouvelle partie'), 'Nouvelle partie');
  assert.equal(I.getLang(), 'fr');
  assert.equal(I.setLang('de'), 'fr', 'langue inconnue → français');
});

test('textes à trous : séquences, progression, dates, verrouillage', () => {
  I.setLang('en');
  assert.equal(I.t('Séquence 4 · Le premier repérage'), 'Sequence 4 · The first reconnaissance');
  assert.equal(I.t('Séquence 4 sur 13'), 'Sequence 4 of 13');
  assert.equal(I.t('4 sur 13'), '4 of 13');
  assert.equal(I.t('Aujourd’hui · 18:42'), 'Today · 18:42');
  assert.equal(I.t('12 oct. · 09:05'), 'Oct 12 · 09:05');
  assert.equal(I.t('Verrouillée · Chapitre 2'), 'Locked · Chapter 2');
  assert.equal(I.t('Objectif · Écouter l’appel de Tapama.'), 'Objective · Listen to Tapama’s call.');
});

test('les modules du jeu suivent la langue : séquences, objectifs, dates, durées, erreurs', () => {
  I.setLang('en');
  assert.equal(G.sequenceLabel(4), 'Sequence 4 · The first reconnaissance');
  assert.equal(G.sequenceObjective(3), 'Listen to Tapama’s call.');
  assert.equal(G.discoveryLabel(G.DISCOVERIES[1]), 'Memory fragment');
  assert.equal(G.formatPlaytime(47 * 60000), '47 minutes');
  assert.equal(G.formatPlaytime(60000), '1 minute');
  assert.equal(G.formatPlaytime(10), 'Less than a minute');
  const now = new Date('2026-10-30T20:00:00');
  assert.equal(G.formatLastPlayed('2026-10-30T18:42:00', now), 'Today · 18:42');
  assert.equal(G.formatLastPlayed('2026-10-29T09:05:00', now), 'Yesterday · 09:05');
  assert.equal(G.formatLastPlayed('2026-10-12T09:05:00', now), '12 Oct · 09:05');
  assert.equal(P.errorMessage('age_range'), 'Your age must be between 6 and 99.');
  assert.equal(P.errorMessage('name_short'), 'Your name must have at least 2 letters.');
  I.setLang('fr');
  assert.equal(G.sequenceLabel(4), 'Séquence 4 · Le premier repérage');
  assert.equal(P.errorMessage('name_short'), 'Ton nom doit avoir au moins 2 lettres.');
});

test('couverture : chaque texte de chaque écran est traduit', () => {
  const missing = [];
  for (const [id, s] of Object.entries(SCREENS)) for (const t of texts(s.html + (s.bg || ''))) if (!I.has(t)) missing.push(`[${id}] ${t}`);
  assert.deepEqual(missing, [], `textes sans traduction :\n${missing.join('\n')}`);
});

test('couverture : dialogues, appels radio, aides et analyses de Tapama', () => {
  const all = [];
  for (const seq of Object.values(T.SEQUENCES)) { all.push(seq.title, seq.chapter); for (const l of seq.lines) all.push(l.text); }
  for (const r of Object.values(T.RADIO)) all.push(r.text);
  for (const p of Object.values(T.PUZZLES)) { all.push(p.title, p.chapter, p.prompt); for (const lv of Object.values(p.levels)) all.push(lv.text); }
  for (const l of T.HELP_LEVELS) all.push(l.title, l.desc);
  const a = T.ANALYSES.projection;
  all.push(a.quote, ...a.hypotheses.map((h) => h.text));
  all.push(T.TAPAMA_NAME, T.PLAYER_NAME);
  const missing = all.filter((x) => hasWords(x) && !I.has(x));
  assert.deepEqual(missing, [], `Tapama sans traduction :\n${missing.join('\n')}`);
});

test('couverture : libellés de la carte interactive', async () => {
  const M = await import('../app/destinations-map.js');
  const missing = M.COUNTRY_LABELS.map((l) => l.text).filter((x) => !I.has(x));
  assert.deepEqual(missing, [], `carte sans traduction :\n${missing.join('\n')}`);
});

test('couverture : séquences, objectifs, découvertes et textes du journal', () => {
  const all = [...G.SEQUENCES_LIST.map((s) => s.title), ...G.DISCOVERIES.map((d) => d.label)];
  for (let n = 1; n <= 13; n++) all.push(G.sequenceObjective(n)); // en français : texte source
  const missing = all.filter((x) => !I.has(x));
  // les objectifs des séquences 1 et 2 ne sont pas affichés (aucun objectif défini : texte par défaut)
  assert.deepEqual([...new Set(missing)], [], `sans traduction :\n${missing.join('\n')}`);
});

test('couverture : interface de la maquette (fiches, boutons, aides)', () => {
  const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const stage = index.slice(index.indexOf('<div id="mosqueStage"'));
  const missing = [...texts(stage)].filter((x) => !I.has(x));
  assert.deepEqual(missing, [], `maquette sans traduction :\n${missing.join('\n')}`);
});

console.log(`\n${passed} tests OK`);
