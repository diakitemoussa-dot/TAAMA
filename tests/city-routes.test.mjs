import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { createRouter, PLACES, WET_COST, formatDistance, etaMinutes } from '../app/city-routes.js';

// graphe « voiture » : routes d'OpenStreetMap filtrées par tools/analyze-roads.mjs (maisons du modèle 3D, eau profonde, pente)
const data = JSON.parse(fs.readFileSync(new URL('../assets/data/routes-djenne-voiture.json', import.meta.url)));
const R = createRouter(data);
const K = 0.84;
const START = { e: K * (47.0 + 5.2), n: K * (-21.5 + 12.0) };      // départ de la voiture (vehicle.js : PARK), en mètres réels
const dist = (a, b) => Math.hypot(a.e - b.e, a.n - b.n);

test('graphe chargé', () => { assert.ok(R.nodes > 1000); });

test('le graphe voiture est cohérent : indices valides, classes 1 ou 2, une seule composante connexe', () => {
  const n = data.n.length;
  for (const [a, b, c = 0] of data.e) { assert.ok(a >= 0 && a < n && b >= 0 && b < n && a !== b); assert.ok(c === 0 || c === 1 || c === 2); }
  const adj = Array.from({ length: n }, () => []);
  for (const [a, b] of data.e) { adj[a].push(b); adj[b].push(a); }
  const seen = new Uint8Array(n); const st = [0]; seen[0] = 1; let cnt = 0;
  while (st.length) { const u = st.pop(); cnt++; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } }
  assert.equal(cnt, n, `${n - cnt} nœuds isolés : un itinéraire pourrait mener dans une impasse`);
});

test('itinéraire mosquée -> école suit des routes et est plus long que la ligne droite', () => {
  const s = PLACES.find((p) => p.id === 'ecole'); const r = R.route(0, 0, s.e, s.n);
  assert.ok(r.pts.length >= 3); assert.ok(r.length >= Math.hypot(s.e, s.n) - 1); assert.ok(r.length < Math.hypot(s.e, s.n) * 3);
});

test('tous les lieux ont un itinéraire fini', () => { for (const p of PLACES) { const r = R.route(-300, 200, p.e, p.n); assert.ok(Number.isFinite(r.length) && r.length > 0, p.id); } });

test('depuis la voiture, chaque lieu est joignable PAR LA ROUTE (pas à vol d’oiseau) sans détour excessif', () => {
  for (const p of PLACES) {
    const r = R.route(START.e, START.n, p.e, p.n);
    assert.equal(r.roads, true, `${p.id} : seule une ligne droite est possible (aucune route carrossable)`);
    assert.ok(r.length < dist(START, p) * 1.8 + 350, `${p.id} : ${Math.round(r.length)} m pour ${Math.round(dist(START, p))} m à vol d'oiseau`);
  }
});

test('les traversées du fleuve restent courtes et peu profondes : au plus un gué d’environ 100 m, aucune eau profonde', () => {
  for (const p of PLACES) {
    const r = R.route(START.e, START.n, p.e, p.n);
    assert.ok(r.wet <= 220, `${p.id} : ${Math.round(r.wet)} m dans l'eau`);
    assert.ok(r.deep <= 120, `${p.id} : ${Math.round(r.deep)} m de gué profond`);
  }
});

test('le routeur préfère la route sèche à un gué plus court, sauf détour énorme', () => {
  // A (0,0) -> B (100,0) : un gué direct de 100 m (classe 1) ou un détour sec par C (50,40) de ~128 m
  const mk = (cls) => createRouter({ n: [[0, 0], [100, 0], [50, 40]], e: [[0, 1, cls], [0, 2], [2, 1]] });
  const dry = mk(1).route(0, 0, 100, 0);
  assert.equal(dry.wet, 0, 'le détour sec (128 m) coûte moins que le gué (100 m × 1,6)');
  assert.ok(dry.length > 120 && dry.length < 135);
  // détour sec ~ 2,4 fois plus long : le gué (classe 1) redevient préférable
  const far = createRouter({ n: [[0, 0], [100, 0], [50, 150]], e: [[0, 1, 1], [0, 2], [2, 1]] }).route(0, 0, 100, 0);
  assert.ok(far.wet >= 99 && far.wet <= 101, 'le gué est pris quand le détour est beaucoup trop long');
  assert.ok(Math.abs(far.length - 100) < 1);
});

test('statistiques de gué : wet = mètres dans l’eau, deep = dont gué profond', () => {
  const r = createRouter({ n: [[0, 0], [30, 0], [80, 0], [130, 0]], e: [[0, 1], [1, 2, 1], [2, 3, 2]] }).route(0, 0, 130, 0);
  assert.equal(r.roads, true);
  assert.ok(Math.abs(r.wet - 100) < 1, `wet ${r.wet}`);
  assert.ok(Math.abs(r.deep - 50) < 1, `deep ${r.deep}`);
});

test('WET_COST : sec 0, puis croissant', () => { assert.equal(WET_COST[0], 0); assert.ok(WET_COST[1] > 0 && WET_COST[2] > WET_COST[1]); });

test('formats', () => { assert.equal(formatDistance(640), '640 m'); assert.equal(formatDistance(1250), '1,3 km'); assert.equal(etaMinutes(600, 8), 1); });
