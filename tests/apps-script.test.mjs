// Script de la feuille (apps-script/Code.gs) exécuté sous Node avec une fausse feuille. Lancer : node --test tests/apps-script.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'apps-script', 'Code.gs'), 'utf8');
const ID = '123e4567-e89b-42d3-a456-426614174000';
const ID2 = '223e4567-e89b-42d3-a456-426614174000';

/** Utilities.formatDate : Mali = UTC+0, format dd/MM/yyyy HH:mm:ss. */
const pad = (n) => String(n).padStart(2, '0');
function formatDate(d) {
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/** Fausse feuille : rows = tableau de lignes (index 0 = ligne 1). */
function makeEnv(initialRows = []) {
  const sheet = { rows: initialRows.map((r) => r.slice()) };
  const wrap = () => ({
    getLastRow: () => sheet.rows.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = sheet.rows[r - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(line);
          }
          return out;
        },
        setValues(vals) {
          vals.forEach((line, i) => {
            const idx = r - 1 + i;
            while (sheet.rows.length <= idx) sheet.rows.push([]);
            line.forEach((v, j) => { sheet.rows[idx][c - 1 + j] = v; });
          });
        },
      };
    },
  });
  const ss = {
    getSheetByName: (n) => (n === 'Joueurs' && sheet.rows.length >= 0 && initialRows !== null ? wrap() : null),
    insertSheet: () => wrap(),
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    Utilities: { formatDate: (d) => formatDate(d) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(s) { return { content: s, setMimeType() { return this; } }; },
    },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { ctx, sheet };
}

const payload = (o = {}) => JSON.stringify({
  id: ID, name: 'Moussa', age: 14, device: 'Téléphone', lang: 'fr',
  progress: { playMs: 25 * 60000 + 30000, chapter: 1, sequence: 5, discoveries: ['a', 'b', 'c'], newVisit: true, deviceLabel: 'Windows · souris' },
  ...o,
});

test('validation : identifiant, prénom, âge', () => {
  const { ctx } = makeEnv([]);
  assert.equal(ctx.parsePayload(payload()).ok, true);
  assert.equal(ctx.parsePayload(payload({ id: 'pas-un-uuid' })).error, 'id_invalid');
  assert.equal(ctx.parsePayload(payload({ name: '<script>' })).error, 'name_invalid');
  assert.equal(ctx.parsePayload(payload({ name: 'x'.repeat(41) })).error, 'name_invalid');
  assert.equal(ctx.parsePayload(payload({ age: 0 })).error, 'age_invalid');
  assert.equal(ctx.parsePayload(payload({ age: 14.5 })).error, 'age_invalid');
  assert.equal(ctx.parsePayload('pas du json').error, 'bad_json');
});

test('progression : libellé d\'appareil inconnu refusé, minutes arrondies', () => {
  const { ctx } = makeEnv([]);
  const d = ctx.parsePayload(payload({ progress: { playMs: 25 * 60000 + 30000, deviceLabel: 'Windows · souris<b>' } })).data;
  assert.equal(d.progress.deviceLabel, '');
  assert.equal(d.progress.minutes, 26);
});

test('nouveau joueur sur feuille vide : en-tête A à L, puis une ligne', () => {
  const { ctx, sheet } = makeEnv([]);
  const res = ctx.doPost({ postData: { contents: payload() } });
  assert.equal(JSON.parse(res.content).ok, true);
  assert.equal(sheet.rows[0][0], 'Nom');
  assert.equal(sheet.rows[0][11], 'Découvertes');
  const r = sheet.rows[1];
  assert.equal(r[0], 'Moussa');
  assert.equal(r[1], ID);
  assert.equal(r[2], 1, 'première connexion = 1');
  assert.equal(r[5], 'Windows · souris');
  assert.equal(r[6], 14);
  assert.equal(r[7], 'Français');
  assert.equal(r[8], 26);
  assert.equal(r[9], 1);
  assert.equal(r[10], 5);
  assert.equal(r[11], 3);
  assert.match(r[3], /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/);
});

test('même joueur : pas de doublon, compteur +1 seulement avec newVisit, première visite conservée', () => {
  const { ctx, sheet } = makeEnv([]);
  ctx.doPost({ postData: { contents: payload() } });
  const first = sheet.rows[1][3];
  // deuxième envoi (même chargement de page) : pas de nouvelle visite
  ctx.doPost({ postData: { contents: payload({ progress: { playMs: 60 * 60000, newVisit: false, deviceLabel: 'Windows · souris' } }) } });
  assert.equal(sheet.rows.length, 2, 'toujours une seule ligne de joueur');
  assert.equal(sheet.rows[1][2], 1, 'compteur inchangé');
  assert.equal(sheet.rows[1][8], 60, 'temps de jeu mis à jour');
  // nouvelle connexion
  ctx.doPost({ postData: { contents: payload() } });
  assert.equal(sheet.rows[1][2], 2, 'compteur +1 à la nouvelle connexion');
  assert.equal(sheet.rows[1][3], first, 'première visite jamais réécrite');
});

test('un autre joueur : nouvelle ligne en dessous, feuille Bamako Drive existante conservée', () => {
  const existing = [
    ['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil'],
    ['Moussa', ID2, 7, '30/10/2026 17:16:45', '13/11/2026 15:52:11', 'iOS · tactile'],
  ];
  const { ctx, sheet } = makeEnv(existing);
  ctx.doPost({ postData: { contents: payload() } });
  assert.equal(sheet.rows.length, 3);
  assert.equal(sheet.rows[1][1], ID2, 'ligne existante intacte');
  assert.equal(sheet.rows[1][2], 7);
  assert.equal(sheet.rows[1][5], 'iOS · tactile');
  assert.equal(sheet.rows[2][1], ID);
  // colonnes G à L ajoutées à l'en-tête
  assert.equal(sheet.rows[0][6], 'Âge');
  assert.equal(sheet.rows[0][11], 'Découvertes');
});

test('cellule jamais lue comme formule', () => {
  const { ctx } = makeEnv([]);
  assert.equal(ctx.safeCell('=SOMME(1;2)'), "'=SOMME(1;2)");
  assert.equal(ctx.safeCell('+1'), "'+1");
  assert.equal(ctx.safeCell('Moussa'), 'Moussa');
});

test('réponse d\'erreur propre pour une charge invalide', () => {
  const { ctx } = makeEnv([]);
  const res = ctx.doPost({ postData: { contents: payload({ id: 'x' }) } });
  assert.deepEqual(JSON.parse(res.content), { ok: false, error: 'id_invalid' });
});

test('note du joueur : onglet « Notes », une ligne, renvoi ignoré, joueur non modifié', () => {
  const { ctx, sheet } = makeEnv([]);
  const body = payload({ progress: undefined, note: { id: 'n-1', texte: '  Le toron sert d’appui  ', source: 'labo2' } });
  const r1 = JSON.parse(ctx.doPost({ postData: { contents: body } }).content);
  assert.equal(r1.ok, true); assert.equal(r1.note, true); assert.equal(r1.duplicate, false);
  assert.equal(sheet.rows[0][4], 'Note');
  assert.equal(sheet.rows[1][1], 'Moussa');
  assert.equal(sheet.rows[1][3], 'labo2');
  assert.equal(sheet.rows[1][4], 'Le toron sert d’appui');
  const r2 = JSON.parse(ctx.doPost({ postData: { contents: body } }).content);
  assert.equal(r2.duplicate, true);
  assert.equal(sheet.rows.length, 2, 'pas de doublon');
  assert.equal(ctx.parsePayload(payload({ note: { texte: '' } })).error, 'note_invalid');
  assert.equal(ctx.parsePayload(payload({ note: { texte: 'x'.repeat(301) } })).error, 'note_invalid');
  const inj = ctx.parsePayload(payload({ note: { id: 'n-2', texte: '=SOMME(A1)', source: 'x y' } })).data.note;
  assert.equal(inj.source, 'jeu');
});
