/**
 * Analyse des routes de Djenné pour la VOITURE du jeu.
 *
 * Le graphe routier de la carte (assets/data/routes-djenne.json) vient d'OpenStreetMap : il contient aussi des ruelles et des sentiers
 * que la voiture ne peut pas prendre dans le jeu (maison du modèle 3D en travers, fleuve, impasse). On confronte donc chaque tronçon
 * à la géométrie réelle du modèle (assets/models/djenne-ville-leger.glb) :
 *   - passage libre : aucune maison (Bat_*) à moins de CLEAR m de l'axe, à hauteur de caisse (comme vehicle.js : blockedAhead) ;
 *   - eau : profondeur < MAX_WATER m (moteur noyé à 1,6 m, ralenti dès 0,5 m) ;
 *   - pente : < MAX_SLOPE (rad).
 * Ensuite : composantes connexes, accessibilité de chaque lieu depuis la voiture, et écriture d'un graphe « voiture ».
 *
 * Usage : node tools/analyze-roads.mjs [--write] [--clear 1.1] [--water 0.8]
 *   sans --write : rapport seulement ; avec --write : écrit assets/data/routes-djenne-voiture.json (+ rapport JSON à côté).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? Number(argv[i + 1]) : d; };
const WRITE = argv.includes('--write');
const CLEAR = arg('clear', 1.1);            // m : demi-largeur de la voiture (0,85) + marge
const MAX_WATER = arg('water', 1.3);        // m d'eau maximum : le moteur se noie à 1,6 m (water-logic.js : CAR_DROWN_IN), on garde une marge
// classes d'un tronçon selon l'eau : 0 sec (< 0,25 m), 1 gué peu profond (< 0,8 m, voiture ralentie), 2 gué profond (jusqu'à MAX_WATER, 3 à 6 m/s)
const wetClass = (w) => (w < 0.25 ? 0 : w < 0.8 ? 1 : 2);
const WET_COST = [0, 0.6, 2.0];            // surcoût de l'itinéraire par classe (fois la longueur) : on préfère toujours les routes sèches
const MAX_SLOPE = 0.6;                      // rad (~34°)
const STEP = 1.5;                           // m : pas d'échantillonnage le long d'un tronçon
const K = 0.84, CB_X = -12.0, CB_Y = 5.2;   // mêmes constantes que app/city-map.js
const realToGame = (e, n) => ({ x: n / K + CB_X, z: e / K - CB_Y });   // (est, nord) m réels -> repère du jeu (x = nord, z = est)

/* ---------- 1. géométrie du jeu ---------- */
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read('assets/models/djenne-ville-leger.glb');
const tri = { bat: [], sol: [] };
let waterY = -12;
for (const n of doc.getRoot().listNodes()) {
  const m = n.getMesh(); if (!m) continue;
  const name = n.getName();
  const kind = /^Bat_/.test(name) ? 'bat' : /^Sol_/.test(name) ? 'sol' : /^Fleuve_Eau/.test(name) ? 'eau' : null;
  if (!kind) continue;
  const W = n.getWorldMatrix();
  for (const p of m.listPrimitives()) {
    const pos = p.getAttribute('POSITION'), idx = p.getIndices();
    const V = new Float32Array(pos.getCount() * 3);
    for (let i = 0; i < pos.getCount(); i++) {
      const v = pos.getElement(i, []);
      V[i * 3] = W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12];
      V[i * 3 + 1] = W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13];
      V[i * 3 + 2] = W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14];
    }
    if (kind === 'eau') { waterY = V[1]; continue; }
    const n3 = idx ? idx.getCount() : pos.getCount();
    for (let t = 0; t < n3; t += 3) {
      const a = idx ? idx.getScalar(t) : t, b = idx ? idx.getScalar(t + 1) : t + 1, c = idx ? idx.getScalar(t + 2) : t + 2;
      tri[kind].push([V[a * 3], V[a * 3 + 1], V[a * 3 + 2], V[b * 3], V[b * 3 + 1], V[b * 3 + 2], V[c * 3], V[c * 3 + 1], V[c * 3 + 2]]);
    }
  }
}
console.log(`triangles : maisons ${tri.bat.length}, sol ${tri.sol.length} ; niveau de l'eau y = ${waterY.toFixed(2)}`);

/* ---------- 2. index spatial ---------- */
const CELL = 8;
const mkGrid = (list) => {
  const g = new Map();
  list.forEach((t, i) => {
    const x0 = Math.floor(Math.min(t[0], t[3], t[6]) / CELL), x1 = Math.floor(Math.max(t[0], t[3], t[6]) / CELL);
    const z0 = Math.floor(Math.min(t[2], t[5], t[8]) / CELL), z1 = Math.floor(Math.max(t[2], t[5], t[8]) / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) { const k = x * 100003 + z; (g.get(k) || g.set(k, []).get(k)).push(i); }
  });
  return g;
};
const gBat = mkGrid(tri.bat), gSol = mkGrid(tri.sol);

/** hauteur du sol en (x, z) : plus haut triangle du terrain qui contient le point (comme le rayon vertical du jeu) */
function groundAt(x, z) {
  const l = gSol.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)); if (!l) return null;
  let best = null;
  for (const i of l) {
    const t = tri.sol[i];
    const d = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]);
    if (Math.abs(d) < 1e-9) continue;
    const a = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / d;
    const b = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / d;
    const c = 1 - a - b;
    if (a < -1e-6 || b < -1e-6 || c < -1e-6) continue;
    const y = a * t[1] + b * t[4] + c * t[7];
    if (best === null || y > best) best = y;
  }
  return best;
}
const slopeAt = (x, z) => { const h = 2; const gx = (groundAt(x + h, z) - groundAt(x - h, z)) / (2 * h), gz = (groundAt(x, z + h) - groundAt(x, z - h)) / (2 * h); return Number.isFinite(gx + gz) ? Math.atan(Math.hypot(gx, gz)) : 0; };

/** distance 2D d'un point à un triangle projeté (0 si dedans ; segments dégénérés gérés : murs verticaux) */
function dist2Tri(px, pz, t) {
  const ax = t[0], az = t[2], bx = t[3], bz = t[5], cx = t[6], cz = t[8];
  const seg = (x1, z1, x2, z2) => { const dx = x2 - x1, dz = z2 - z1, L = dx * dx + dz * dz; let u = L > 1e-12 ? ((px - x1) * dx + (pz - z1) * dz) / L : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(px - (x1 + u * dx), pz - (z1 + u * dz)); };
  const s = (x1, z1, x2, z2) => (px - x2) * (z1 - z2) - (x1 - x2) * (pz - z2);
  const d1 = s(ax, az, bx, bz), d2 = s(bx, bz, cx, cz), d3 = s(cx, cz, ax, az);
  if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) return 0;
  return Math.min(seg(ax, az, bx, bz), seg(bx, bz, cx, cz), seg(cx, cz, ax, az));
}

/** plus petit écart entre (x, z) et une maison dont la hauteur recoupe celle de la caisse (g+0.3 .. g+2.0) */
function buildingClearance(x, z, g, cap = 6) {
  let best = cap;
  const r = Math.ceil(cap / CELL), cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) {
    const l = gBat.get((cx + i) * 100003 + (cz + j)); if (!l) continue;
    for (const k of l) {
      const t = tri.bat[k];
      const lo = Math.min(t[1], t[4], t[7]), hi = Math.max(t[1], t[4], t[7]);
      if (hi < g + 0.3 || lo > g + 2.0) continue;
      const d = dist2Tri(x, z, t);
      if (d < best) best = d;
    }
  }
  return best;
}

/** test d'un point de l'axe : { ok, clearance, water, slope } */
function samplePoint(x, z) {
  const g = groundAt(x, z);
  if (g === null) return { ok: false, why: 'hors-modèle', clearance: 0, water: 0, slope: 0 };
  const water = Math.max(0, waterY - g);
  const clearance = buildingClearance(x, z, g);
  const slope = slopeAt(x, z);
  const why = water > MAX_WATER ? 'eau' : clearance < CLEAR ? 'maison' : slope > MAX_SLOPE ? 'pente' : null;
  return { ok: !why, why, clearance, water, slope };
}

/* ---------- 3. graphe OSM ---------- */
const data = JSON.parse(fs.readFileSync('assets/data/routes-djenne.json', 'utf8'));
const N = data.n.map(([e, n]) => realToGame(e, n)), E = data.e;
const edgeInfo = [];       // { a, b, len, ok, why, worst }
let tested = 0;
for (const [a, b] of E) {
  const A = N[a], B = N[b], len = Math.hypot(B.x - A.x, B.z - A.z);
  const steps = Math.max(1, Math.ceil(len / STEP));
  let ok = true, why = null, worstClear = 99, maxWater = 0, maxSlope = 0;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps, q = samplePoint(A.x + (B.x - A.x) * u, A.z + (B.z - A.z) * u);
    worstClear = Math.min(worstClear, q.clearance); maxWater = Math.max(maxWater, q.water); maxSlope = Math.max(maxSlope, q.slope);
    if (!q.ok && ok) { ok = false; why = q.why; }
    tested++;
  }
  edgeInfo.push({ a, b, len, ok, why, cls: wetClass(maxWater), worstClear: +worstClear.toFixed(2), maxWater: +maxWater.toFixed(2), maxSlope: +maxSlope.toFixed(2) });
}
const bad = edgeInfo.filter((e) => !e.ok);
const byWhy = {}; for (const e of bad) byWhy[e.why] = (byWhy[e.why] || 0) + 1;
console.log(`${E.length} tronçons testés (${tested} points) : ${edgeInfo.length - bad.length} carrossables, ${bad.length} refusés`, JSON.stringify(byWhy));
const totalKm = edgeInfo.reduce((s, e) => s + e.len, 0) * K / 1000, okKm = edgeInfo.filter((e) => e.ok).reduce((s, e) => s + e.len, 0) * K / 1000;
console.log(`longueur : ${totalKm.toFixed(1)} km au total, ${okKm.toFixed(1)} km carrossables`);

/* ---------- 3b. sensibilité aux seuils (mêmes mesures, autres critères) ---------- */
const reach = (clear, water) => {
  const ok = edgeInfo.filter((e) => e.worstClear >= clear && e.maxWater <= water && e.maxSlope <= MAX_SLOPE && e.why !== 'hors-modèle');
  const adj = Array.from({ length: N.length }, () => []); for (const e of ok) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  return { ok, adj };
};
console.log('\nSensibilité (jusqu’où la voiture peut aller depuis son départ selon les seuils) :');
// départ de la voiture (repère du jeu, vehicle.js : PARK)
const startNodeAll = (() => { const g = { x: -21.5, z: 47.0 }; let best = -1, bd = Infinity; for (let i = 0; i < N.length; i++) { if (!data.n[i]) continue; const d = Math.hypot(N[i].x - g.x, N[i].z - g.z); if (d < bd) { bd = d; best = i; } } return best; })();
for (const [clear, water] of [[0.9, 0.8], [1.1, 0.8], [1.3, 0.8], [1.1, 1.2], [0.9, 1.2]]) {
  const { ok, adj } = reach(clear, water);
  const seen = new Uint8Array(N.length); const st = [startNodeAll]; seen[startNodeAll] = 1; let cnt = 0; while (st.length) { const u = st.pop(); cnt++; for (const v of adj[u]) if (!seen[v]) { seen[v] = 1; st.push(v); } }
  const km = ok.filter((e) => seen[e.a]).reduce((a, e) => a + e.len * K, 0) / 1000;
  console.log(`  dégagement ≥ ${clear} m, eau ≤ ${water} m : ${ok.length} tronçons, ${cnt} nœuds et ${km.toFixed(1)} km joignables depuis la voiture`);
}

/* ---------- 3c. profondeur d'eau des tronçons refusés pour l'eau ---------- */
{
  const wet = edgeInfo.filter((e) => e.maxWater > 0.25);
  const bins = [[0.25, 0.5], [0.5, 0.8], [0.8, 1.0], [1.0, 1.3], [1.3, 1.6], [1.6, 2.5], [2.5, 99]];
  console.log('\nTronçons qui touchent l’eau (profondeur max le long du tronçon) :');
  for (const [a, b] of bins) { const l = wet.filter((e) => e.maxWater > a && e.maxWater <= b); console.log(`  ${String(a).padStart(4)} - ${String(b).padStart(4)} m : ${String(l.length).padStart(4)} tronçons, ${(l.reduce((x, e) => x + e.len * K, 0) / 1000).toFixed(1)} km`); }
}

/* ---------- 4. composantes connexes ---------- */
function components(edges) {
  const adj = Array.from({ length: N.length }, () => []);
  for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const comp = new Int32Array(N.length).fill(-1); const sizes = [];
  for (let s = 0; s < N.length; s++) {
    if (comp[s] !== -1 || !adj[s].length) continue;
    const id = sizes.length; let cnt = 0; const stack = [s]; comp[s] = id;
    while (stack.length) { const u = stack.pop(); cnt++; for (const v of adj[u]) if (comp[v] === -1) { comp[v] = id; stack.push(v); } }
    sizes.push(cnt);
  }
  return { comp, sizes, adj };
}
const all = components(edgeInfo), drv = components(edgeInfo.filter((e) => e.ok));
console.log(`graphe OSM complet : ${all.sizes.length} composantes (la plus grande : ${Math.max(...all.sizes)} nœuds)`);
console.log(`graphe carrossable : ${drv.sizes.length} composantes (la plus grande : ${Math.max(...drv.sizes)} nœuds)`);

/* ---------- 5. accessibilité des lieux ---------- */
// lieux : ceux de app/city-routes.js + base NÉANTIS et labo (repère du jeu) + départ de la voiture
const src = fs.readFileSync('app/city-routes.js', 'utf8');
const places = [...src.matchAll(/\{ id: '([^']+)', name: '([^']+)'[^}]*?e: (-?\d+), n: (-?\d+)/g)].map((m) => ({ id: m[1], name: m[2], e: +m[3], n: +m[4] }));
const toReal = (gx, gz) => ({ e: K * (gz + CB_Y), n: K * (gx - CB_X) });
const nb = toReal(313, -366);   // base NÉANTIS (centre approximatif, voir city-map.js : NeantisBase.center)
places.push({ id: 'neantis', name: 'Base NÉANTIS (approx.)', e: nb.e, n: nb.n });
const lab = toReal(-175.012, -219.890); places.push({ id: 'labo', name: 'Laboratoire de Tapama', e: lab.e, n: lab.n });
const START = { id: 'depart', name: 'Départ de la voiture', ...toReal(-21.5, 47.0) };
const nearestNode = (e, n, comps, pred = () => true) => {
  const g = realToGame(e, n); let best = -1, bd = Infinity;
  for (let i = 0; i < N.length; i++) { if (comps.comp[i] === -1 || !pred(i)) continue; const d = Math.hypot(N[i].x - g.x, N[i].z - g.z); if (d < bd) { bd = d; best = i; } }
  return { i: best, d: bd * K };
};
function dijkstra(adjW, s) {
  const dist = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1); dist[s] = 0;
  const h = [[0, s]];
  while (h.length) { h.sort((a, b) => a[0] - b[0]); const [d, u] = h.shift(); if (d > dist[u]) continue; for (const [v, w] of adjW[u] || []) if (d + w < dist[v]) { dist[v] = d + w; prev[v] = u; h.push([dist[v], v]); } }
  return { dist, prev };
}
const wAdj = (edges, penalty = true) => { const a = Array.from({ length: N.length }, () => []); for (const e of edges) { const w = e.len * K * (1 + (penalty && e.ok ? WET_COST[e.cls] : 0)); a[e.a].push([e.b, w]); a[e.b].push([e.a, w]); } return a; };
const adjAll = wAdj(edgeInfo, false), adjDrv = wAdj(edgeInfo.filter((e) => e.ok));   // OSM : longueur brute ; voiture : longueur + surcoût des gués
const s0 = nearestNode(START.e, START.n, drv);
const mainComp = drv.comp[s0.i];
console.log(`\nDépart de la voiture : nœud ${s0.i} à ${s0.d.toFixed(0)} m de la voiture, composante ${mainComp} (${drv.sizes[mainComp]} nœuds)`);
const dA = dijkstra(adjAll, nearestNode(START.e, START.n, all).i), dD = dijkstra(adjDrv, s0.i);
const edgeKey = (a, b) => (a < b ? a + '-' + b : b + '-' + a);
const edgeMap = new Map(edgeInfo.map((e) => [edgeKey(e.a, e.b), e]));
/** statistiques réelles d'un itinéraire (sans pondération) : longueur, mètres dans l'eau, eau max, plus petit dégagement */
const pathStats = (prev, to) => { let len = 0, wet = 0, deep = 0, maxW = 0, minC = 99; for (let v = to; prev[v] !== -1; v = prev[v]) { const e = edgeMap.get(edgeKey(v, prev[v])); const l = e.len * K; len += l; if (e.cls > 0) wet += l; if (e.cls === 2) deep += l; maxW = Math.max(maxW, e.maxWater); minC = Math.min(minC, e.worstClear); } return { len: Math.round(len), wet: Math.round(wet), deep: Math.round(deep), maxW: +maxW.toFixed(2), minC: +minC.toFixed(2) }; };
const report = { départ: { ...START, snapM: +s0.d.toFixed(0) }, lieux: [] };
console.log('\nlieu'.padEnd(34), 'accès OSM'.padEnd(12), 'accès voiture'.padEnd(15), 'écart au réseau carrossable');
for (const p of places) {
  const nA = nearestNode(p.e, p.n, all), nD = nearestNode(p.e, p.n, drv, (i) => drv.comp[i] === mainComp);
  const osm = dA.dist[nA.i], car = dD.dist[nD.i];
  // l'ancien itinéraire (OSM brut) : combien de tronçons impraticables pour la voiture, et pour quelle raison ?
  const oldBlocked = {}; let oldBlockedM = 0;
  if (isFinite(osm)) for (let v = nA.i; dA.prev[v] !== -1; v = dA.prev[v]) { const e = edgeMap.get(edgeKey(v, dA.prev[v])); if (!e.ok) { oldBlocked[e.why] = (oldBlocked[e.why] || 0) + 1; oldBlockedM += e.len * K; } }
  const st = isFinite(car) ? pathStats(dD.prev, nD.i) : null;
  const row = { id: p.id, nom: p.name, osm_m: isFinite(osm) ? Math.round(osm) : null, voiture_m: st ? st.len : null, dont_dans_leau_m: st ? st.wet : null, dont_gue_profond_m: st ? st.deep : null, eau_max_m: st ? st.maxW : null, plus_petit_degagement_m: st ? st.minC : null, écart_au_réseau_m: Math.round(nD.d), ancien_itineraire_bloque: oldBlocked, ancien_itineraire_bloque_m: Math.round(oldBlockedM), noeud_voiture: nD.i };
  report.lieux.push(row);
  console.log(`${p.name}`.padEnd(34), (isFinite(osm) ? Math.round(osm) + ' m' : 'inaccessible').padEnd(12), (st ? st.len + ' m' : 'INACCESSIBLE').padEnd(15), `ancien itinéraire : ${Object.keys(oldBlocked).length ? JSON.stringify(oldBlocked) + ' = ' + Math.round(oldBlockedM) + ' m bloqués' : 'libre'} | ${Math.round(nD.d)} m du dernier nœud | eau ${st ? st.wet : '-'} m (profonde ${st ? st.deep : '-'} m, max ${st ? st.maxW : '-'} m) | dégagement mini ${st ? st.minC : '-'} m`);
}

/* ---------- 6. graphe voiture : composante principale seulement, nœuds renumérotés ---------- */
const keepEdges = edgeInfo.filter((e) => e.ok && drv.comp[e.a] === mainComp);
const remap = new Map(); const outN = [];
const idOf = (i) => { if (!remap.has(i)) { remap.set(i, outN.length); outN.push(data.n[i]); } return remap.get(i); };
const outE = keepEdges.map((e) => (e.cls ? [idOf(e.a), idOf(e.b), e.cls] : [idOf(e.a), idOf(e.b)]));   // [a, b] ou [a, b, 1|2] : 1 gué peu profond, 2 gué profond
report.graphe = { noeuds_osm: N.length, aretes_osm: E.length, aretes_voiture: outE.length, noeuds_voiture: outN.length, km_osm: +totalKm.toFixed(1), km_voiture: +keepEdges.reduce((s, e) => s + e.len * K, 0).toFixed(0) / 1000, refus: byWhy, parametres: { CLEAR, MAX_WATER, MAX_SLOPE } };
console.log('\ngraphe voiture :', JSON.stringify(report.graphe));
if (WRITE) {
  fs.writeFileSync('assets/data/routes-djenne-voiture.json', JSON.stringify({ n: outN, e: outE }));
  fs.writeFileSync('assets/data/routes-djenne-voiture.rapport.json', JSON.stringify(report, null, 1));
  console.log('écrit : assets/data/routes-djenne-voiture.json (+ .rapport.json)');
}
