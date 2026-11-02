import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { createRouter, PLACES, formatDistance, etaMinutes } from '../app/city-routes.js';
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/routes-djenne.json', import.meta.url)));
const R = createRouter(data);
test('graphe chargé', () => { assert.ok(R.nodes > 1000); });
test('itinéraire mosquée -> école suit des routes et est plus long que la ligne droite', () => {
  const s = PLACES.find((p) => p.id === 'ecole'); const r = R.route(0, 0, s.e, s.n);
  assert.ok(r.pts.length >= 3); assert.ok(r.length >= Math.hypot(s.e, s.n) - 1); assert.ok(r.length < Math.hypot(s.e, s.n) * 3);
});
test('tous les lieux ont un itinéraire fini', () => { for (const p of PLACES) { const r = R.route(-300, 200, p.e, p.n); assert.ok(Number.isFinite(r.length) && r.length > 0, p.id); } });
test('formats', () => { assert.equal(formatDistance(640), '640 m'); assert.equal(formatDistance(1250), '1,3 km'); assert.equal(etaMinutes(600, 8), 1); });
