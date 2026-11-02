/**
 * Analyse spatiale de la maquette (djenne-ar.glb)
 * Objectif : mesurer la répartition des triangles pour choisir la taille des tuiles.
 * Usage : node tools/analyze-scene.mjs [fichier.glb]
 */
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const FILE = process.argv[2] || 'assets/models/djenne-ar.glb';

const decoderModule = await draco3d.createDecoderModule({});
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression, EXTTextureWebP])
  .registerDependencies({ 'draco3d.decoder': decoderModule });

const doc = await io.read(FILE);
const scene = doc.getRoot().listScenes()[0];
const root = doc.getRoot();

function worldMatrix(node) {
  const m = node.getWorldMatrix().slice(); // column-major
  return m;
}

function applyMat(m, x, y, z) {
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

const rows = [];
let grandTris = 0;

for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = worldMatrix(node);
  let tris = 0;
  const cells = new Map(); // "x,z" -> count  (cellules de 25 m)
  const CELL = 25;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    if (!pos) continue;
    const n = pos.getCount();
    const arr = pos.getArray();
    // positions monde
    const wpos = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      const [x, y, z] = applyMat(M, arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
      wpos[i * 3] = x; wpos[i * 3 + 1] = y; wpos[i * 3 + 2] = z;
    }
    const count = idx ? idx.getCount() : n;
    const ia = idx ? idx.getArray() : null;
    for (let t = 0; t < count; t += 3) {
      let cx = 0, cz = 0;
      for (let k = 0; k < 3; k++) {
        const vi = ia ? ia[t + k] : t + k;
        cx += wpos[vi * 3];
        cz += wpos[vi * 3 + 2];
      }
      cx /= 3; cz /= 3;
      tris++;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cz < minZ) minZ = cz; if (cz > maxZ) maxZ = cz;
      const key = Math.floor(cx / CELL) + ',' + Math.floor(cz / CELL);
      cells.set(key, (cells.get(key) || 0) + 1);
    }
  }
  if (!tris) continue;
  grandTris += tris;

  // répartition par distance à l'origine (le centre de la mosquée est proche de 0)
  const dist = new Map();
  for (const [key, count] of cells) {
    const [gx, gz] = key.split(',').map(Number);
    const cx = (gx + 0.5) * CELL, cz = (gz + 0.5) * CELL;
    const d = Math.hypot(cx, cz);
    const bucket = d < 60 ? '<60' : d < 120 ? '60-120' : d < 200 ? '120-200' : d < 300 ? '200-300' : '>300';
    dist.set(bucket, (dist.get(bucket) || 0) + count);
  }
  rows.push({
    name: mesh.getName() || node.getName(),
    tris,
    cells: cells.size,
    span: `${Math.round(maxX - minX)}×${Math.round(maxZ - minZ)} m`,
    near: Math.round((dist.get('<60') || 0) / tris * 100),
    d120: Math.round(((dist.get('<60') || 0) + (dist.get('60-120') || 0)) / tris * 100),
    d200: Math.round(((dist.get('<60') || 0) + (dist.get('60-120') || 0) + (dist.get('120-200') || 0)) / tris * 100),
    d300: Math.round(((dist.get('<60') || 0) + (dist.get('60-120') || 0) + (dist.get('120-200') || 0) + (dist.get('200-300') || 0)) / tris * 100),
  });
}

rows.sort((a, b) => b.tris - a.tris);
console.log(`Fichier : ${FILE}  —  ${grandTris} triangles\n`);
console.log('mesh'.padEnd(28), 'tris'.padStart(8), 'cellules'.padStart(9), 'étendue'.padStart(14), '% <60m'.padStart(7), '% <120'.padStart(7), '% <200'.padStart(7), '% <300'.padStart(7));
for (const r of rows) {
  console.log(
    r.name.padEnd(28),
    String(r.tris).padStart(8),
    String(r.cells).padStart(9),
    r.span.padStart(14),
    (r.near + '%').padStart(7),
    (r.d120 + '%').padStart(7),
    (r.d200 + '%').padStart(7),
    (r.d300 + '%').padStart(7),
  );
}
