/**
 * Variante MOBILE de la ville : mêmes maillages (Draco conservé), textures réduites de moitié.
 * L'original n'est jamais modifié ; la variante est écrite à côté.
 *   assets/models/djenne-ville-leger.glb  ->  assets/models/djenne-ville-leger-mobile.glb
 * Gain : mémoire GPU ~72 Mo -> ~18 Mo et ~2 Mo de moins à télécharger.
 *
 * Usage : node tools/shrink-city-textures.mjs [--src fichier.glb] [--out fichier.glb] [--factor 0.5] [--quality 78]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import sharp from 'sharp';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const SRC = arg('src', 'assets/models/djenne-ville-leger.glb');
const OUT = arg('out', 'assets/models/djenne-ville-leger-mobile.glb');
const FACTOR = Number(arg('factor', '0.5'));
const QUALITY = Number(arg('quality', '78'));

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});
const doc = await io.read(SRC);
for (const tex of doc.getRoot().listTextures()) {
  const img = tex.getImage(); if (!img) continue;
  const meta = await sharp(img).metadata();
  const w = Math.max(256, Math.round(meta.width * FACTOR)), h = Math.max(256, Math.round(meta.height * FACTOR));
  const out = await sharp(img).resize(w, h, { fit: 'fill' }).jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
  console.log(`${tex.getName()} ${meta.width}x${meta.height} -> ${w}x${h} : ${(img.byteLength / 1e6).toFixed(2)} -> ${(out.byteLength / 1e6).toFixed(2)} Mo`);
  tex.setImage(new Uint8Array(out)).setMimeType('image/jpeg');
}
// Draco quasi sans perte (quantification fine) : la géométrie doit rester celle de l'original (collisions, repères)
const dr = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_draco_mesh_compression');
if (dr) dr.setEncoderOptions({ quantizePosition: 20, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8, quantizeGeneric: 12 });
await io.write(OUT, doc);
console.log(`${OUT} : ${(fs.statSync(SRC).size / 1e6).toFixed(2)} -> ${(fs.statSync(OUT).size / 1e6).toFixed(2)} Mo (original intact)`);
