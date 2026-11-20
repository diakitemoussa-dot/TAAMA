import { NodeIO } from '@gltf-transform/core';
import { EXTTextureWebP, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { statSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INPUT  = resolve(__dirname, '../assets/models/djenne-ar.glb');
const OUTPUT = resolve(__dirname, '../assets/models/djenne-mosque-only.glb');

try {
  if (!existsSync(INPUT)) throw new Error(`Fichier introuvable : ${INPUT}`);

  const io = new NodeIO()
    .registerExtensions([EXTTextureWebP, KHRDracoMeshCompression])
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });

  const doc = await io.read(INPUT);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];

  const mosqueNode = root.listNodes().find(n => n.getName().trim() === 'la mosque en globale');
  if (!mosqueNode) throw new Error('Node "la mosque en globale" introuvable dans le GLB');

  const removed = scene.listChildren().filter(n => n !== mosqueNode);
  removed.forEach(n => { console.log('  supprime :', n.getName()); n.dispose(); });

  await io.write(OUTPUT, doc);
  const mb = (statSync(OUTPUT).size / 1024 / 1024).toFixed(2);
  console.log(`✓ djenne-mosque-only.glb écrit — ${mb} MB (${removed.length} nodes env. supprimés)`);
} catch (err) {
  console.error('❌ Erreur extraction :', err.message);
  process.exit(1);
}
