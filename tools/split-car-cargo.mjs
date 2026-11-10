/**
 * Sépare les objets de la benne (roue de secours, caisses, bidons) du maillage fusionné « Carrosserie » de assets/models/voiture-djenne.glb
 * pour que le jeu puisse les faire glisser et rebondir quand on roule vite (app/vehicle.js, cargoTick).
 *
 * Méthode : composantes connexes (sommets soudés par position) de chaque primitive ; celles qui forment un objet de la benne
 * (voir ITEMS) deviennent un nœud `Cargo_<id>` (maillage recentré, nœud placé au centre de l'objet) ; leurs triangles sont retirés de la carrosserie.
 * L'original est sauvegardé dans backups/voiture-djenne-avant-cargo.glb (une seule fois). Idempotent : refuse de repartir d'un fichier déjà découpé.
 *
 * Usage : node tools/split-car-cargo.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

const FILE = 'assets/models/voiture-djenne.glb', BACKUP = 'backups/voiture-djenne-avant-cargo.glb';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule(), 'meshopt.decoder': MeshoptDecoder,
});
if (!fs.existsSync(BACKUP)) { fs.mkdirSync('backups', { recursive: true }); fs.copyFileSync(FILE, BACKUP); console.log('sauvegarde :', BACKUP); }
const doc = await io.read(BACKUP);                       // on repart toujours de l'original
const root = doc.getRoot();
const carro = root.listNodes().find((n) => n.getName() === 'Carrosserie');
const mesh = carro.getMesh();
const T = carro.getTranslation();
const prims = mesh.listPrimitives();
const byMat = (name) => prims.find((p) => p.getMaterial() && p.getMaterial().getName() === name);

/* composantes connexes d'une primitive : [{ tris: [indices de triangles], min, max }] */
function components(prim) {
  const pos = prim.getAttribute('POSITION'), idx = prim.getIndices(), n = pos.getCount(), nt = idx.getCount() / 3;
  const rep = new Map(), parent = new Array(n);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let i = 0; i < n; i++) { const k = pos.getElement(i, []).map((x) => Math.round(x * 1000)).join(','); if (rep.has(k)) parent[i] = rep.get(k); else { rep.set(k, i); parent[i] = i; } }
  const tv = []; for (let t = 0; t < nt; t++) tv.push([idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2)]);
  for (const [a, b, c] of tv) { const ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra; }
  const comps = new Map();
  tv.forEach((v, t) => {
    const r = find(v[0]); let c = comps.get(r); if (!c) comps.set(r, c = { tris: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
    c.tris.push(t);
    for (const vi of v) { const p = pos.getElement(vi, []); for (let j = 0; j < 3; j++) { c.min[j] = Math.min(c.min[j], p[j]); c.max[j] = Math.max(c.max[j], p[j]); } }
  });
  return [...comps.values()];
}
const near = (a, b, e = 0.04) => Math.abs(a - b) < e;
const box = (c, x0, x1, y0, y1, z0, z1) => near(c.min[0], x0) && near(c.max[0], x1) && near(c.min[1], y0) && near(c.max[1], y1) && near(c.min[2], z0) && near(c.max[2], z1);

/* objets de la benne : [matériau, test sur la composante] — mesures faites sur le modèle (repère de la carrosserie) */
const ITEMS = [
  { id: 'roue',  parts: [['V_Caoutchouc', (c) => box(c, -0.96, -0.2, 0.64, 1.4, -2.18, -1.92)], ['V_Acier', (c) => box(c, -0.78, -0.38, 0.82, 1.22, -2.19, -1.91)]] },
  { id: 'caisse1', parts: [['V_Toile', (c) => box(c, -0.7, 0.7, 0.79, 1.13, -2.42, -2.08)], ['V_Noir', (c) => box(c, -0.02, 0.02, 0.79, 1.13, -2.42, -2.08)]] },
  { id: 'caisse2', parts: [['V_Toile', (c) => box(c, 0.05, 0.65, 0.74, 1.06, -2.19, -1.37)]] },
  { id: 'caisse3', parts: [['V_Toile', (c) => box(c, 0.01, 0.59, 0.74, 1.1, -1.41, -0.79)]] },
  { id: 'caisse4', parts: [['V_Toile', (c) => box(c, -0.7, -0.1, 0.74, 1.14, -1.99, -1.11)]] },
  { id: 'bidon1', parts: [['V_Bidon', (c) => box(c, 0.45, 0.75, 0.74, 1.12, -1.73, -1.51)], ['V_Noir', (c) => box(c, 0.54, 0.66, 1.12, 1.17, -1.65, -1.6)]] },
  { id: 'bidon2', parts: [['V_BidonBleu', (c) => box(c, 0.47, 0.77, 0.74, 1.12, -1.49, -1.27)], ['V_Noir', (c) => box(c, 0.56, 0.68, 1.12, 1.17, -1.4, -1.35)]] },
  { id: 'bidon3', parts: [['V_Bidon', (c) => box(c, 0.47, 0.77, 0.74, 1.12, -1.26, -1.04)], ['V_Noir', (c) => box(c, 0.56, 0.68, 1.12, 1.17, -1.17, -1.12)]] },
];

const compCache = new Map(); const compsOf = (p) => { if (!compCache.has(p)) compCache.set(p, components(p)); return compCache.get(p); };
const removed = new Map();                                // prim -> Set(triangles retirés)
const found = [];
for (const it of ITEMS) {
  const parts = [];
  for (const [mat, test] of it.parts) {
    const prim = byMat(mat); if (!prim) throw new Error('matériau absent : ' + mat);
    const hit = compsOf(prim).filter((c) => !removed.get(prim)?.has(c.tris[0]) && test(c));
    if (hit.length !== 1) throw new Error(`${it.id} / ${mat} : ${hit.length} composante(s) trouvée(s) au lieu d'une (modèle modifié ?)`);
    parts.push({ prim, comp: hit[0] });
    if (!removed.has(prim)) removed.set(prim, new Set()); for (const t of hit[0].tris) removed.get(prim).add(t);
    removed.get(prim).add(hit[0].tris[0]);
  }
  found.push({ it, parts });
}

/* reconstruit une primitive avec un sous-ensemble de triangles (sommets re-numérotés), positions décalées de -centre */
function subPrim(src, triList, center) {
  const idx = src.getIndices(), remap = new Map(), order = [];
  const ni = []; for (const t of triList) for (let k = 0; k < 3; k++) { const v = idx.getScalar(t * 3 + k); if (!remap.has(v)) { remap.set(v, order.length); order.push(v); } ni.push(remap.get(v)); }
  const p = doc.createPrimitive().setMaterial(src.getMaterial()).setMode(src.getMode());
  for (const sem of src.listSemantics()) {
    const a = src.getAttribute(sem), n = a.getElementSize(), arr = new Float32Array(order.length * n);
    order.forEach((v, i) => { const e = a.getElement(v, []); for (let j = 0; j < n; j++) arr[i * n + j] = e[j] - (sem === 'POSITION' && center ? center[j] : 0); });
    p.setAttribute(sem, doc.createAccessor().setType(a.getType()).setArray(arr).setBuffer(a.getBuffer()));
  }
  p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(ni)).setBuffer(idx.getBuffer()));
  return p;
}

const parentNode = carro.getParentNode(), scene = root.listScenes()[0];
const report = [];
for (const { it, parts } of found) {
  const min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  for (const { comp } of parts) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], comp.min[j]); max[j] = Math.max(max[j], comp.max[j]); }
  const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const m = doc.createMesh('Cargo_' + it.id);
  for (const { prim, comp } of parts) m.addPrimitive(subPrim(prim, comp.tris, center));
  const node = doc.createNode('Cargo_' + it.id).setMesh(m).setTranslation([T[0] + center[0], T[1] + center[1], T[2] + center[2]]);
  (parentNode || scene).addChild(node);
  report.push(`${it.id}: centre ${center.map((v) => v.toFixed(2))} taille ${(max[0] - min[0]).toFixed(2)}×${(max[1] - min[1]).toFixed(2)}×${(max[2] - min[2]).toFixed(2)}`);
}
/* retire les triangles déplacés de la carrosserie */
for (const [prim, set] of removed) {
  const idx = prim.getIndices(), keep = [];
  const dead = new Set(); for (const c of compsOf(prim)) if (set.has(c.tris[0])) for (const t of c.tris) dead.add(t);
  for (let t = 0; t < idx.getCount() / 3; t++) if (!dead.has(t)) keep.push(idx.getScalar(t * 3), idx.getScalar(t * 3 + 1), idx.getScalar(t * 3 + 2));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(keep)).setBuffer(idx.getBuffer()));
}
doc.createExtension(KHRDracoMeshCompression).setRequired(true).setEncoderOptions({ method: KHRDracoMeshCompression.EncoderMethod.EDGEBREAKER, encodeSpeed: 5, decodeSpeed: 5 });
await io.write(FILE, doc);
console.log(report.join('\n'));
console.log(`Écrit ${FILE} : ${(fs.statSync(FILE).size / 1024).toFixed(0)} Ko (avant : ${(fs.statSync(BACKUP).size / 1024).toFixed(0)} Ko)`);
