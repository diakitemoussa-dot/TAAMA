// Joueurs dans Google Sheets (format « Bamako Drive joueur ») : jeton signé, ligne, création / mise à jour, progression.
// Faux Google, aucun réseau. Lancer : node --test tests/sheets-sync.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { signServiceJwt, toSheetRow, upsertSheetRow, formatSheetDate, COLUMNS } from '../server/sheets-sync.mjs';
import { sanitizeProgress } from '../server/players-handler.mjs';

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bot@projet.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
const ENV = { GOOGLE_SHEETS_ID: 'SHEET1', GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SA), GOOGLE_SHEETS_TAB: 'Joueurs' };
const NOW = () => new Date('2026-11-16T09:00:00.000Z');
const P = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'Moussa', age: 14, device: 'Téléphone', lang: 'fr', createdAt: '2026-11-10T08:00:00.000Z' };
const PROG = { playMs: 25 * 60000 + 30000, chapter: 1, sequence: 5, discoveries: ['a', 'b', 'c'], lastPlayed: '2026-11-16T08:59:00.000Z', deviceLabel: 'Windows · souris' };

test('colonnes A à F : mêmes noms et même ordre que « Bamako Drive joueur »', () => {
  assert.deepEqual(COLUMNS.slice(0, 6), ['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil']);
});

test('date au format de la feuille, heure du Mali (UTC) : « 16/11/2026 09:00:00 »', () => {
  assert.equal(formatSheetDate('2026-11-16T09:00:00.000Z'), '16/11/2026 09:00:00');
  assert.equal(formatSheetDate('pas une date'), '');
});

test('jeton : JWT RS256 signé par la clé du compte de service, claims corrects', () => {
  const jwt = signServiceJwt(SA, 1_800_000_000);
  const [h, c, s] = jwt.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'RS256', typ: 'JWT' });
  const claims = JSON.parse(Buffer.from(c, 'base64url'));
  assert.equal(claims.iss, SA.client_email);
  assert.equal(claims.scope, 'https://www.googleapis.com/auth/spreadsheets');
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.exp - claims.iat, 3600);
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(s, 'base64url')), 'signature valide');
});

test('nouvelle ligne : colonnes A à F comme Bamako Drive, puis profil et progression', () => {
  const row = toSheetRow(P, PROG, '2026-11-16T09:00:00.000Z');
  assert.equal(row.length, COLUMNS.length);
  assert.equal(row[0], 'Moussa');
  assert.equal(row[1], P.id);
  assert.equal(row[2], 1, 'première connexion = 1');
  assert.equal(row[3], '16/11/2026 09:00:00');
  assert.equal(row[4], '16/11/2026 09:00:00');
  assert.equal(row[5], 'Windows · souris');
  assert.equal(row[6], 14);
  assert.equal(row[7], 'Français');
  assert.equal(row[8], 26, 'temps de jeu arrondi en minutes');
  assert.equal(row[9], 1);
  assert.equal(row[10], 5);
  assert.equal(row[11], 3, 'nombre de découvertes');
});

test('mise à jour : le compteur augmente seulement à une nouvelle connexion, la première visite ne bouge pas', () => {
  const existing = ['Moussa', P.id, '4', '10/11/2026 08:00:00', '15/11/2026 20:00:00', 'iOS · tactile'];
  const sansNouvelleVisite = toSheetRow(P, PROG, '2026-11-16T09:00:00.000Z', { existing, newVisit: false });
  assert.equal(sansNouvelleVisite[2], 4);
  const nouvelleVisite = toSheetRow(P, PROG, '2026-11-16T09:00:00.000Z', { existing, newVisit: true });
  assert.equal(nouvelleVisite[2], 5);
  assert.equal(nouvelleVisite[3], '10/11/2026 08:00:00', 'première visite conservée');
  assert.equal(nouvelleVisite[4], '16/11/2026 09:00:00', 'dernière visite mise à jour');
});

test('ligne sans progression : cases vides, pas d\'erreur', () => {
  const row = toSheetRow({ ...P, lang: 'en' }, null, '2026-11-16T09:00:00.000Z');
  assert.equal(row[7], 'English');
  assert.equal(row[8], '');
  assert.equal(row[11], '');
});

/** Faux Google : colonne B = identifiants, lignes lues et écrites en mémoire. */
function fakeGoogle({ rows = [] } = {}) {
  const calls = [];
  const sheet = rows.map((r) => r.slice());
  const fn = async (url, opts = {}) => {
    const method = opts.method || 'GET';
    calls.push({ url, method, body: opts.body });
    const ok = (data) => ({ ok: true, status: 200, json: async () => data });
    if (url === 'https://oauth2.googleapis.com/token') return ok({ access_token: 'tok' });
    const dec = decodeURIComponent(url);
    if (dec.includes('!B:B') && method === 'GET') return ok({ values: sheet.map((r) => [r[1]]) });
    const m = dec.match(/!A(\d+):L\d+/);
    if (m && method === 'GET') return ok({ values: [sheet[Number(m[1]) - 1] || []] });
    if (m && method === 'PUT') { sheet[Number(m[1]) - 1] = JSON.parse(opts.body).values[0]; return ok({}); }
    return ok({});
  };
  fn.calls = calls;
  fn.sheet = sheet;
  return fn;
}

test('nouveau joueur : en-tête puis ajout en fin de feuille', async () => {
  const f = fakeGoogle({ rows: [] });
  const r = await upsertSheetRow(ENV, P, PROG, '2026-11-16T09:00:00.000Z', f, NOW, { newVisit: true });
  assert.deepEqual(r, { created: true });
  const writes = f.calls.filter((c) => c.method !== 'GET' && !c.url.includes('oauth'));
  assert.ok(writes.some((c) => c.url.includes('A1%3AL1')), 'en-tête écrit');
  const app = writes.find((c) => c.url.includes(':append'));
  assert.ok(app, 'ligne ajoutée');
  assert.equal(JSON.parse(app.body).values[0][1], P.id);
});

test('joueur connu : sa ligne est mise à jour, première visite et pas de doublon', async () => {
  const old = ['Moussa', P.id, '4', '10/11/2026 08:00:00', '15/11/2026 20:00:00', 'iOS · tactile'];
  const f = fakeGoogle({ rows: [COLUMNS, old] });
  const r = await upsertSheetRow(ENV, { ...P, name: 'Moussa K' }, PROG, '2026-11-16T09:00:00.000Z', f, NOW, { newVisit: true });
  assert.deepEqual(r, { created: false });
  const put = f.calls.find((c) => c.method === 'PUT' && !c.url.includes('oauth'));
  assert.ok(put && (put.url.includes('A2%3AL2')), 'écrit la ligne 2');
  const vals = JSON.parse(put.body).values[0];
  assert.equal(vals[0], 'Moussa K');
  assert.equal(vals[2], 5, 'une visite de plus');
  assert.equal(vals[3], '10/11/2026 08:00:00', 'première visite jamais réécrite');
  assert.equal(f.calls.filter((c) => c.url.includes(':append')).length, 0);
});

test('sans configuration Google : ignoré sans erreur', async () => {
  const r = await upsertSheetRow({}, P, PROG, '2026-11-16T09:00:00.000Z', fakeGoogle(), NOW);
  assert.deepEqual(r, { skipped: true });
});

test('progression : bornes, valeurs absentes ou fausses écartées', () => {
  assert.equal(sanitizeProgress(null), null);
  const s = sanitizeProgress({ playMs: 1234.9, chapter: -3, sequence: 'x', discoveries: ['a', 'b'], lastPlayed: 'pas une date', extra: 'ignoré', newVisit: true, deviceLabel: 'Windows · souris' });
  assert.equal(s.playMs, 1234);
  assert.equal(s.chapter, null);
  assert.equal(s.sequence, null);
  assert.equal(s.discoveries, 2);
  assert.equal(s.lastPlayed, null);
  assert.equal(s.newVisit, true);
  assert.equal(s.deviceLabel, 'Windows · souris');
  assert.equal(sanitizeProgress({ deviceLabel: 'Windows · souris<script>' }).deviceLabel, '', 'libellé inconnu refusé');
  assert.equal('extra' in s, false);
});
