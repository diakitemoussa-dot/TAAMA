import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { prune, dedup, draco } from '@gltf-transform/functions';
import draco3d from 'draco3d';
import { statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, '../assets/models/djenne-mosque-only.glb');

const before = (statSync(FILE).size / 1024 / 1024).toFixed(2);
console.log(`Avant : ${before} MB`);

const io = new NodeIO()
  .registerExtensions([EXTTextureWebP, KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

console.log('Lecture...');
const doc = await io.read(FILE);

console.log('Prune + dedup...');
await doc.transform(prune(), dedup());

console.log('Re-compression Draco...');
await doc.transform(
  draco({
    quantizePosition: 10,
    quantizeNormal:   8,
    quantizeTexcoord: 10,
    quantizeColor:    8,
    quantizeGeneric:  8,
    compressionLevel: 10,
  })
);

await io.write(FILE, doc);
const after = (statSync(FILE).size / 1024 / 1024).toFixed(2);
console.log(`Après  : ${after} MB`);
console.log(`Gain   : ${(before - after).toFixed(2)} MB (-${Math.round((1 - after/before)*100)}%)`);
