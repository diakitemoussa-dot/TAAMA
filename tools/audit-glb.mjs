/**
 * Audit mobile des GLB : triangles, matériaux, textures (taille, mémoire GPU estimée).
 * Lecture seule. Usage : node tools/audit-glb.mjs [fichier.glb ...]
 * Sans argument : tous les .glb de assets/models (hors tuiles).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';
import path from 'node:path';

import draco3d from 'draco3d';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'meshopt.decoder': MeshoptDecoder });
const dir = 'assets/models';
const files = process.argv.length > 2
  ? process.argv.slice(2)
  : fs.readdirSync(dir).filter((f) => f.endsWith('.glb')).map((f) => path.join(dir, f));

const mo = (n) => (n / 1048576).toFixed(1);
for (const file of files) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const pos = prim.getAttribute('POSITION');
      tris += idx ? idx.getCount() / 3 : (pos ? pos.getCount() / 3 : 0);
    }
  }
  let gpu = 0;
  const texLines = [];
  for (const t of root.listTextures()) {
    const [w, h] = t.getSize() || [0, 0];
    const bytes = w * h * 4 * 1.33; // RGBA + mipmaps, décompressé en mémoire GPU
    gpu += bytes;
    texLines.push(`    ${t.getName() || t.getURI() || '(sans nom)'} ${w}x${h} ${t.getMimeType()} disque ${mo(t.getImage()?.byteLength || 0)} Mo, GPU ~${mo(bytes)} Mo`);
  }
  console.log(`${path.basename(file)} | disque ${mo(fs.statSync(file).size)} Mo | triangles ${Math.round(tris)} | matériaux ${root.listMaterials().length} | textures ${root.listTextures().length} | GPU ~${mo(gpu)} Mo | ext: ${doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(',') || '-'}`);
  for (const l of texLines) console.log(l);
}
