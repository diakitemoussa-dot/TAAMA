/**
 * Tests de la carte interactive : données réelles et fonctions pures (aucune dépendance navigateur).
 * Usage : node tests/destinations-map.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as M from '../app/destinations-map.js';

const data = JSON.parse(fs.readFileSync(new URL('../assets/data/afrique-ouest.json', import.meta.url), 'utf8'));
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

test('les données couvrent l’Afrique de l’Ouest et restent légères', () => {
  const names = data.countries.features.map((f) => f.properties.name);
  for (const n of ['Mali', 'Senegal', 'Guinea', 'Ghana', 'Togo', 'Burkina Faso', 'Niger', 'Nigeria', 'Mauritania', "Côte d'Ivoire"]) assert.ok(names.includes(n), n);
  assert.ok(data.rivers.features.some((f) => f.properties.name === 'Niger'), 'le fleuve Niger est présent');
  assert.ok(fs.statSync(new URL('../assets/data/afrique-ouest.json', import.meta.url)).size < 300 * 1024, 'moins de 300 Ko');
});

test('Djenné, Bandiagara, Ségou et Bamako sont bien au Mali (coordonnées réelles)', () => {
  for (const id of ['djenne', 'bandiagara', 'segou', 'bamako']) {
    assert.equal(M.countryAt(data.countries, M.GEO[id].lat, M.GEO[id].lng), 'Mali', id);
  }
});

test('Lomé est au Togo', () => {
  assert.equal(M.countryAt(data.countries, M.GEO.lome.lat, M.GEO.lome.lng), 'Togo');
});

test('géographie cohérente : Djenné est entre Ségou et Bandiagara, au nord de Bamako et de Lomé', () => {
  const g = M.GEO;
  assert.ok(g.segou.lng < g.djenne.lng && g.djenne.lng < g.bandiagara.lng, 'ouest → est : Ségou, Djenné, Bandiagara');
  assert.ok(g.djenne.lat > g.bamako.lat && g.djenne.lat > g.lome.lat);
  assert.ok(g.lome.lat < 7 && g.lome.lng > 0, 'Lomé est sur le golfe de Guinée');
});

test('points d’un pays voisin et de la mer', () => {
  assert.equal(M.countryAt(data.countries, 12.37, -1.52), 'Burkina Faso');   // Ouagadougou
  assert.equal(M.countryAt(data.countries, 5.56, -0.2), 'Ghana');            // Accra
  assert.equal(M.countryAt(data.countries, 0, -30), null);                   // océan
});

test('toutes les destinations et pistes sont dans la zone affichée', () => {
  const [[s, w], [n, e]] = M.REGION_BOUNDS;
  for (const [id, p] of Object.entries(M.GEO)) assert.ok(p.lat > s && p.lat < n && p.lng > w && p.lng < e, id);
  for (const u of M.UNKNOWN_SPOTS) assert.ok(u.lat > s && u.lat < n && u.lng > w && u.lng < e, u.id);
  const [[ps, pw], [pn, pe]] = M.PAN_LIMITS;
  assert.ok(ps < s && pw < w && pn > n && pe > e, 'les limites de déplacement contiennent la zone');
});

test('curvePoints : part de A, arrive en B, courbe vers le côté', () => {
  const a = M.GEO.djenne, b = M.GEO.lome;
  const pts = M.curvePoints(a, b, 0.14, 20);
  assert.equal(pts.length, 21);
  assert.deepEqual(pts[0], [a.lat, a.lng]);
  assert.ok(Math.abs(pts[20][0] - b.lat) < 1e-9 && Math.abs(pts[20][1] - b.lng) < 1e-9);
  const straight = M.curvePoints(a, b, 0, 20)[10];
  assert.notDeepEqual(pts[10], straight, 'la courbe s’écarte de la ligne droite');
  const flat = M.curvePoints(a, b, 0, 4);
  assert.ok(flat.every(([la, ln]) => Math.abs((ln - a.lng) * (b.lat - a.lat) - (la - a.lat) * (b.lng - a.lng)) < 1e-9), 'bend 0 = ligne droite');
});

test('libellés : chaque pays étiqueté existe dans les données ou est une mer', () => {
  for (const l of M.COUNTRY_LABELS) assert.ok(l.lat > -4 && l.lat < 38 && l.lng > -32 && l.lng < 34, l.text);
  const land = M.COUNTRY_LABELS.filter((l) => l.cls !== 'gm-sea');
  assert.ok(land.length >= 10);
});

console.log(`\n${passed} tests OK`);
