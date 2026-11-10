import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEndpoint, PLAYERS_ENDPOINT } from '../app/player-sync.js';

const meta = (content) => ({ querySelector: (s) => (s.includes('taama-players-endpoint') ? { content } : null) });

test('adresse par défaut : relative (jamais absolue à la racine du domaine)', () => {
  assert.equal(PLAYERS_ENDPOINT, 'api/players');
  assert.equal(resolveEndpoint({}, { querySelector: () => null }), 'api/players');
  assert.ok(!resolveEndpoint({}, {}).startsWith('/'));
});
test('adresse configurable : variable globale puis balise meta', () => {
  assert.equal(resolveEndpoint({ TAAMA_PLAYERS_ENDPOINT: ' https://x.example/api/players ' }, meta('autre')), 'https://x.example/api/players');
  assert.equal(resolveEndpoint({}, meta(' https://m.example/p ')), 'https://m.example/p');
});
