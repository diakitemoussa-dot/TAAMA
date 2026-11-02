/**
 * Boîtes englobantes MONDE par mesh + carte de densité de la scène.
 * Usage : node tools/scene-bounds.mjs [fichier.glb]
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
const root = doc.getRoot();

const rows = [];
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const M = node.getWorldMatrix();
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = 0, t = 0;
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    if (!pos) continue;
    const a = pos.getArray();
    v += pos.getCount();
    t += (prim.getIndices()?.getCount() || pos.getCount()) / 3;
    for (let i = 0; i < pos.getCount(); i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      const wx = M[0] * x + M[4] * y + M[8] * z + M[12];
      const wy = M[1] * x + M[5] * y + M[9] * z + M[13];
      const wz = M[2] * x + M[6] * y + M[10] * z + M[14];
      if (wx < min[0]) min[0] = wx; if (wx > max[0]) max[0] = wx;
      if (wy < min[1]) min[1] = wy; if (wy > max[1]) max[1] = wy;
      if (wz < min[2]) min[2] = wz; if (wz > max[2]) max[2] = wz;
    }
  }
  rows.push({ name: mesh.getName() || node.getName(), v, t: Math.round(t), min, max, mesh, M });
}
rows.sort((a, b) => b.t - a.t);

const f = (n) => (n >= 0 ? ' ' : '') + n.toFixed(1);
console.log('mesh'.padEnd(30), 'tri'.padStart(7), '  X'.padStart(16), '  Y'.padStart(16), '  Z'.padStart(16));
for (const r of rows) {
  console.log(r.name.padEnd(30), String(r.t).padStart(7),
    `  ${f(r.min[0])}..${f(r.max[0])}`.padStart(16),
    `  ${f(r.min[1])}..${f(r.max[1])}`.padStart(16),
    `  ${f(r.min[2])}..${f(r.max[2])}`.padStart(16));
}

// Carte de densité (vue de dessus) des 20 plus gros meshes
const CELL = 25, EXT = 320;
const W = Math.ceil((EXT * 2) / CELL);
const grid = Array.from({ length: W }, () => new Float64Array(W));
for (const r of rows) {
  if (r.t < 1000) continue;
  for (const prim of r.mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION');
    const idx = prim.getIndices();
    if (!pos) continue;
    const a = pos.getArray();
    const count = idx ? idx.getCount() : pos.getCount();
    const ia = idx ? idx.getArray() : null;
    for (let k = 0; k < count; k += 3) {
      let cx = 0, cz = 0;
      for (let j = 0; j < 3; j++) {
        const vi = ia ? ia[k + j] : k + j;
        const x = a[vi * 3], y = a[vi * 3 + 1], z = a[vi * 3 + 2];
        cx += r.M[0] * x + r.M[4] * y + r.M[8] * z + r.M[12];
        cz += r.M[2] * x + r.M[6] * y + r.M[10] * z + r.M[14];
      }
      cx /= 3; cz /= 3;
      const gx = Math.floor((cx + EXT) / CELL), gz = Math.floor((cz + EXT) / CELL);
      if (gx >= 0 && gx < W && gz >= 0 && gz < W) grid[gz][gx] += 1;
    }
  }
}
const chars = ' .:-=+*#%@';
let maxV = 0;
for (const row of grid) for (const v of row) if (v > maxV) maxV = v;
console.log(`\nCarte de densité (${CELL} m/cellule, nord = haut, X →, Z ↓) — max ${Math.round(maxV)} tri/cellule`);
for (let z = 0; z < W; z++) {
  let line = '';
  for (let x = 0; x < W; x++) {
    const v = grid[z][x];
    line += v === 0 ? ' ' : chars[Math.min(9, Math.ceil((v / maxV) * 9))];
  }
  if (line.trim()) console.log(String(Math.round(z * CELL - EXT)).padStart(5), '|' + line);
}
