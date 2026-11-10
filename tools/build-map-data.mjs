/**
 * Prépare la carte interactive de l'Afrique de l'Ouest (écran « Destinations »).
 *
 *   • assets/data/afrique-ouest.json   frontières (Natural Earth 50 m, via world-atlas) et
 *                                      fleuves (Natural Earth 10 m), simplifiés et arrondis
 *   • assets/vendor/leaflet/           bibliothèque de cartographie Leaflet (copie locale :
 *                                      le jeu ne dépend d'aucun CDN pour sa carte)
 *
 * Usage : node tools/build-map-data.mjs [chemin/vers/rivers-10m.geojson]
 *   Sans argument, les fleuves sont téléchargés depuis le dépôt Natural Earth.
 * Données : Natural Earth, domaine public (naturalearthdata.com).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { feature } from 'topojson-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DATA = path.join(ROOT, 'assets', 'data', 'afrique-ouest.json');
const OUT_LEAFLET = path.join(ROOT, 'assets', 'vendor', 'leaflet');
const RIVERS_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_rivers_lake_centerlines.geojson';

/** Pays affichés : l'Afrique de l'Ouest et ses voisins immédiats. */
const COUNTRIES = [
  'Mali', 'Mauritania', 'Senegal', 'Gambia', 'Guinea', 'Guinea-Bissau', 'Sierra Leone', 'Liberia',
  "Côte d'Ivoire", 'Burkina Faso', 'Ghana', 'Togo', 'Benin', 'Niger', 'Nigeria',
  'Algeria', 'Morocco', 'W. Sahara', 'Libya', 'Chad', 'Cameroon', 'Eq. Guinea', 'Central African Rep.',
];
/** Fleuves conservés (noms Natural Earth). */
const RIVERS = ['Niger', 'Bani', 'Sénégal', 'Bafing', 'Baoulé', 'Gambia', 'Volta', 'Mouhoun', 'Nakanbé', 'Oti',
  'Bénoué', 'Benue', 'Bandama', 'Sassandra', 'Komoé', 'Sokoto', 'Kaduna'];

const round = (n) => Math.round(n * 1000) / 1000;

/* Douglas-Peucker (ligne ouverte) */
function simplifyLine(pts, tol) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const sqSeg = (p, a, b) => {
    let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
    if (dx || dy) {
      const t = Math.max(0, Math.min(1, ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)));
      x += dx * t; y += dy * t;
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  while (stack.length) {
    const [i, j] = stack.pop();
    let max = 0, idx = -1;
    for (let k = i + 1; k < j; k++) { const d = sqSeg(pts[k], pts[i], pts[j]); if (d > max) { max = d; idx = k; } }
    if (max > tol * tol) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}

/* Un anneau fermé : on le coupe au point le plus éloigné pour que la simplification ne l'effondre pas */
function simplifyRing(ring, tol) {
  const pts = ring.slice(0, -1);
  if (pts.length < 8) return ring.map((p) => [round(p[0]), round(p[1])]);
  let far = 0, best = -1;
  for (let i = 0; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > best) { best = d; far = i; } }
  const a = simplifyLine(pts.slice(0, far + 1), tol);
  const b = simplifyLine([...pts.slice(far), pts[0]], tol);
  const out = [...a, ...b.slice(1, -1)];
  if (out.length < 4) return ring.map((p) => [round(p[0]), round(p[1])]);
  out.push(out[0]);
  return out.map((p) => [round(p[0]), round(p[1])]);
}

const bboxOf = (rings) => {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
const area = (r) => Math.abs(r.slice(0, -1).reduce((s, p, i) => { const q = r[(i + 1) % (r.length - 1)]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2);

function polygonsOf(g) { return g.type === 'Polygon' ? [g.coordinates] : g.coordinates; }

/* ---------------- pays ---------------- */
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', 'world-atlas', 'countries-50m.json'), 'utf8'));
const all = feature(topo, topo.objects.countries).features;
const found = new Set(all.map((f) => f.properties.name));
const missing = COUNTRIES.filter((n) => !found.has(n));
if (missing.length) throw new Error(`pays introuvables dans world-atlas : ${missing.join(', ')}`);

const countries = {
  type: 'FeatureCollection',
  features: COUNTRIES.map((name) => {
    const f = all.find((x) => x.properties.name === name);
    const polys = polygonsOf(f.geometry)
      .map((poly) => poly.map((ring) => simplifyRing(ring, 0.012)))
      .filter((poly) => area(poly[0]) > 0.02);                       // petites îles retirées
    return { type: 'Feature', properties: { name }, geometry: { type: 'MultiPolygon', coordinates: polys } };
  }),
};

/* ---------------- fleuves ---------------- */
const riversPath = process.argv[2];
const riversRaw = riversPath
  ? JSON.parse(fs.readFileSync(riversPath, 'utf8'))
  : await (await fetch(RIVERS_URL)).json();
const BOX = [-22, 2, 16, 26];
const inBox = (pts) => pts.some(([x, y]) => x > BOX[0] && x < BOX[2] && y > BOX[1] && y < BOX[3]);
const riverFeatures = [];
for (const f of riversRaw.features) {
  const name = f.properties && f.properties.name;
  if (!RIVERS.includes(name)) continue;
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const kept = lines.filter(inBox).map((l) => simplifyLine(l, 0.01).map((p) => [round(p[0]), round(p[1])]));
  if (kept.length) riverFeatures.push({ type: 'Feature', properties: { name }, geometry: { type: 'MultiLineString', coordinates: kept } });
}
const rivers = { type: 'FeatureCollection', features: riverFeatures };

fs.mkdirSync(path.dirname(OUT_DATA), { recursive: true });
fs.writeFileSync(OUT_DATA, JSON.stringify({ source: 'Natural Earth (domaine public)', countries, rivers }));

/* ---------------- Leaflet (copie locale) ---------------- */
fs.mkdirSync(OUT_LEAFLET, { recursive: true });
const dist = path.join(ROOT, 'node_modules', 'leaflet', 'dist');
fs.copyFileSync(path.join(dist, 'leaflet-src.esm.js'), path.join(OUT_LEAFLET, 'leaflet.esm.js'));
fs.copyFileSync(path.join(dist, 'leaflet.css'), path.join(OUT_LEAFLET, 'leaflet.css'));
fs.copyFileSync(path.join(ROOT, 'node_modules', 'leaflet', 'LICENSE'), path.join(OUT_LEAFLET, 'LICENSE'));

const kb = (p) => (fs.statSync(p).size / 1024).toFixed(0);
console.log(`carte : ${countries.features.length} pays, ${riverFeatures.length} fleuves → ${path.relative(ROOT, OUT_DATA)} (${kb(OUT_DATA)} Ko)`);
console.log(`Leaflet copié dans ${path.relative(ROOT, OUT_LEAFLET)} (${kb(path.join(OUT_LEAFLET, 'leaflet.esm.js'))} Ko)`);
