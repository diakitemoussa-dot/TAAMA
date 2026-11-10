/**
 * Tests du serveur d'enregistrement des joueurs (faux Notion, aucun appel réseau).
 * Usage : node tests/players-handler.test.mjs
 */
import assert from 'node:assert/strict';
import { upsertPlayer, toNotionProperties } from '../server/players-handler.mjs';

let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log(`ok - ${name}`); };

const ID = '123e4567-e89b-42d3-a456-426614174000';
const ENV = { NOTION_TOKEN: 'secret_x', NOTION_PLAYERS_DB: 'db123' };
const NOW = () => new Date('2026-10-30T20:00:00.000Z');
const body = (o = {}) => ({ id: ID, name: 'Moussa', age: 14, device: 'Téléphone', lang: 'fr', createdAt: '2026-10-30T18:00:00.000Z', ...o });

/** Faux fetch : enregistre les appels, réponses programmables. */
function fakeNotion({ existing = false, failAt = null } = {}) {
  const calls = [];
  const fn = async (url, opts) => {
    calls.push({ url, method: opts.method, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
    const step = calls.length;
    if (failAt === step) return { ok: false, status: 500, json: async () => ({}) };
    if (url.endsWith('/query')) return { ok: true, status: 200, json: async () => ({ results: existing ? [{ id: 'page-1' }] : [] }) };
    return { ok: true, status: 200, json: async () => ({ id: 'page-1' }) };
  };
  fn.calls = calls;
  return fn;
}

await test('nouveau joueur : recherche par identifiant puis création', async () => {
  const f = fakeNotion();
  const r = await upsertPlayer(body(), ENV, f, NOW);
  assert.deepEqual(r, { status: 200, json: { ok: true, created: true } });
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls[0].url.endsWith('/databases/db123/query'));
  assert.deepEqual(f.calls[0].body.filter, { property: 'Identifiant', rich_text: { equals: ID } });
  assert.equal(f.calls[1].method, 'POST');
  assert.ok(f.calls[1].url.endsWith('/pages'));
  assert.equal(f.calls[1].body.parent.database_id, 'db123');
  const p = f.calls[1].body.properties;
  assert.equal(p['Prénom ou pseudo'].title[0].text.content, 'Moussa');
  assert.equal(p['Âge'].number, 14);
  assert.equal(p['Appareil'].select.name, 'Téléphone');
  assert.equal(p['Langue'].select.name, 'Français');
  assert.equal(p['Première connexion'].date.start, '2026-10-30T18:00:00.000Z');
  assert.equal(p['Dernière mise à jour'].date.start, '2026-10-30T20:00:00.000Z');
});

await test('joueur déjà connu : mise à jour de sa ligne, pas de doublon', async () => {
  const f = fakeNotion({ existing: true });
  const r = await upsertPlayer(body({ name: 'Moussa K', age: 15 }), ENV, f, NOW);
  assert.deepEqual(r, { status: 200, json: { ok: true, created: false } });
  assert.equal(f.calls[1].method, 'PATCH');
  assert.ok(f.calls[1].url.endsWith('/pages/page-1'));
  assert.equal(f.calls[1].body.properties['Prénom ou pseudo'].title[0].text.content, 'Moussa K');
  assert.ok(!('Première connexion' in f.calls[1].body.properties), 'la date de première connexion ne change jamais');
});

await test('la clé Notion et la version de l’API sont envoyées côté serveur', async () => {
  const f = fakeNotion();
  await upsertPlayer(body(), ENV, f, NOW);
  assert.equal(f.calls[0].headers.Authorization, 'Bearer secret_x');
  assert.equal(f.calls[0].headers['Notion-Version'], '2022-06-28');
});

await test('langue anglaise → « English »', () => {
  const p = toNotionProperties({ ...body({ lang: 'en' }), age: 14 }, { nowIso: NOW().toISOString(), creating: true });
  assert.equal(p['Langue'].select.name, 'English');
});

await test('données invalides : refusées avant tout appel à Notion', async () => {
  const f = fakeNotion();
  for (const [b, err] of [[body({ name: 'A' }), 'name_short'], [body({ name: '<img>' }), 'name_chars'], [body({ age: 2 }), 'age_range'], [body({ id: 'x' }), 'id_invalid']]) {
    const r = await upsertPlayer(b, ENV, f, NOW);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, err);
  }
  assert.equal(f.calls.length, 0);
});

await test('JSON illisible ou trop gros : refusé', async () => {
  const f = fakeNotion();
  assert.equal((await upsertPlayer('{pas du json', ENV, f, NOW)).status, 400);
  assert.equal((await upsertPlayer('x'.repeat(5000), ENV, f, NOW)).status, 413);
  assert.equal(f.calls.length, 0);
});

await test('non configuré : 503, aucun appel réseau', async () => {
  const f = fakeNotion();
  assert.equal((await upsertPlayer(body(), {}, f, NOW)).status, 503);
  assert.equal((await upsertPlayer(body(), { NOTION_TOKEN: 'x' }, f, NOW)).status, 503);
  assert.equal(f.calls.length, 0);
});

await test('Notion en panne : 502 sans détail (le jeu réessaiera)', async () => {
  for (const failAt of [1, 2]) {
    const r = await upsertPlayer(body(), ENV, fakeNotion({ failAt }), NOW);
    assert.equal(r.status, 502);
    assert.deepEqual(r.json, { ok: false, error: 'notion_error' });
  }
  const throwing = async () => { throw new Error('réseau coupé'); };
  assert.equal((await upsertPlayer(body(), ENV, throwing, NOW)).status, 502);
});

await test('le corps peut être du texte JSON', async () => {
  const f = fakeNotion();
  const r = await upsertPlayer(JSON.stringify(body()), ENV, f, NOW);
  assert.equal(r.status, 200);
});

console.log(`\n${passed} tests OK`);
