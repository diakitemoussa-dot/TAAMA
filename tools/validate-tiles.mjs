/**
 * Vérifie l'intégrité des tuiles générées par split-tiles.mjs :
 * nombre de triangles, boîte englobante monde, nœuds attendus.
 * Usage : node tools/validate-tiles.mjs [dossier]
 */
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] || 'assets/models/tiles';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

let tris = 0, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
const names = new Set();
let files = 0, bytes = 0;

for (const t of index.tiles) {
  const json = JSON.parse(fs.readFileSync(path.join(DIR, t.file), 'utf8'));
  let tt = 0;
  for (const mesh of json.meshes || []) {
    for (const p of mesh.primitives) {
      const idx = p.indices != null ? json.accessors[p.indices].count : json.accessors[p.attributes.POSITION].count;
      tt += idx / 3;
    }
  }
  for (const n of json.nodes || []) if (n.name) names.add(n.name);
  for (const b of Object.values(t.box)) { /* noop */ }
  tris += tt;
  files++;
  bytes += t.bytes;
  const bin = path.join(DIR, t.file.replace(/\.gltf$/, '.bin'));
  if (json.buffers?.some((b) => b.uri) && !fs.existsSync(bin)) {
    console.log(`  ⚠ binaire manquant pour ${t.id}`);
  }
  if (Math.abs(tt - t.tris) > 0) console.log(`  ⚠ ${t.id}: ${tt} tri dans le fichier vs ${t.tris} annoncés`);
  min = [Math.min(min[0], t.box.min[0]), Math.min(min[1], t.box.min[1]), Math.min(min[2], t.box.min[2])];
  max = [Math.max(max[0], t.box.max[0]), Math.max(max[1], t.box.max[1]), Math.max(max[2], t.box.max[2])];
}

const texDir = path.join(DIR, 'textures');
const nTex = fs.existsSync(texDir) ? fs.readdirSync(texDir).length : 0;

console.log(`\n${files} tuiles, ${tris.toLocaleString('fr-FR')} triangles, ${(bytes / 1048576).toFixed(2)} Mo (+ ${nTex} textures)`);
console.log(`boîte monde : [${min.map((v) => v.toFixed(1))}] → [${max.map((v) => v.toFixed(1))}]`);
const expected = ['Mosquee_Base', 'Minarets', 'Porte_Principale', 'Poteaux', 'Torons_Externes', 'Canaris', 'Sphere.001', 'WEB_Cloud3D_4.002'];
const missing = expected.filter((n) => !names.has(n));
console.log(missing.length ? `⚠ nœuds manquants : ${missing.join(', ')}` : '✔ tous les nœuds attendus sont présents');
console.log(min[0] > -10 && max[0] < 10 ? '⚠ étendue X suspecte' : '✔ étendue cohérente');
