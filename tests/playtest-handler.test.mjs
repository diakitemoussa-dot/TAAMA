import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { saveSession, listSessions, isLocal } from '../server/playtest-handler.mjs';

const base = { format: 'taama-playtest', v: 1, id: 'abcd1234-0001-0002', startedAt: '2026-11-13T14:32:00', events: [{ t: 0, k: 'debut' }] };

test('enregistre une session puis la remplace quand le prénom arrive', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pt-'));
  try {
    let r = await saveSession(JSON.stringify(base), { dir });
    assert.equal(r.status, 200);
    r = await saveSession(JSON.stringify({ ...base, player: { name: 'Awa' } }), { dir });
    assert.equal(r.status, 200);
    const files = await readdir(path.join(dir, '2026-11-13'));
    assert.deepEqual(files, ['2026-11-13_1432_Awa_abcd1234.json']);
    const all = await listSessions({ dir });
    assert.equal(all.length, 1);
    assert.equal(all[0].player.name, 'Awa');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('refuse ce qui n’est pas une session (chemins piégés compris)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'pt-'));
  try {
    assert.equal((await saveSession('pas du json', { dir })).status, 400);
    assert.equal((await saveSession(JSON.stringify({ ...base, id: '../../x' }), { dir })).status, 400);
    assert.equal((await saveSession(JSON.stringify({ ...base, player: { name: '../../etc/passwd' } }), { dir })).status, 200);
    const days = await readdir(dir);
    assert.deepEqual(days, ['2026-11-13']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('lecture réservée au PC lui-même', () => {
  assert.ok(isLocal('127.0.0.1'));
  assert.ok(isLocal('::ffff:127.0.0.1'));
  assert.ok(!isLocal('192.168.1.20'));
});
