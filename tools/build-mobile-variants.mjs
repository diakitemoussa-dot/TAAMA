/**
 * Variantes MOBILES des GLB (les originaux ne sont jamais modifiés ; chaque variante est écrite à côté).
 *
 *   ville    djenne-ville-leger.glb  ->  djenne-ville-leger-mobile-ktx2.glb
 *            textures re-encodées en KTX2/Basis (ETC1S), transcodées par le GPU du téléphone en ASTC/ETC2/BC7
 *            (≈ 1 octet/pixel en mémoire vidéo au lieu de 4), géométrie Draco inchangée (Sol_* = colliders),
 *            maisons Bat_* NON simplifiées par défaut (--bat-error > 0 pour essayer : gain mesuré ≤ 13 %, risque de fissures), noms inchangés.
 *   joueur   personnage-joueur-gadget.glb -> personnage-joueur-gadget-mobile.glb   (Meshopt, 14 clips conservés)
 *   drone-n  droneN.glb -> droneN-mobile.glb                                       (Meshopt)
 *   voiture-anim personnage-voiture-anim.glb -> personnage-voiture-anim-mobile.glb (Meshopt, animations seules)
 *
 * Outil de build uniquement : l'encodeur KTX2 n'est PAS une dépendance du projet. Installer hors dépôt :
 *   mkdir <dossier> && cd <dossier> && npm init -y && npm i ktx2-encoder
 *   KTX2_ENCODER=<dossier>/node_modules/ktx2-encoder/dist/node/index.js node tools/build-mobile-variants.mjs ville
 *
 * Usage : node tools/build-mobile-variants.mjs <ville|joueur|drone-n|voiture-anim|all> [--quality 160] [--sol 1536] [--sat 1280] [--bat-error 0]
 */
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, dedup, prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d';
import sharp from 'sharp';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const what = argv[0] || 'all';
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const M = 'assets/models/';
const mo = (n) => (n / 1048576).toFixed(2) + ' Mo';

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});

/* ---------- Ville : KTX2 + maisons simplifiées ---------- */
async function ville() {
  const encPath = process.env.KTX2_ENCODER;
  if (!encPath) throw new Error('KTX2_ENCODER manquant (voir l\'en-tête du fichier)');
  const { encodeToKTX2 } = await import(pathToFileURL(encPath).href);
  const SRC = M + 'djenne-ville-leger.glb', OUT = M + 'djenne-ville-leger-mobile-ktx2.glb';
  const SIZES = { sol_z18_propre_2560: +arg('sol', 1536), sat_z18_ville_2048: +arg('sat', 1280), sol_z16_propre_1536: 768, sat_z16_large_1024: 512 };
  const QL = +arg('quality', 160);
  const doc = await io.read(SRC);
  for (const tex of doc.getRoot().listTextures()) {
    const img = tex.getImage(); const side = SIZES[tex.getName()];
    if (!img || !side) continue;
    const { data, info } = await sharp(img).resize(side, side, { fit: 'fill', kernel: 'lanczos3' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const t0 = Date.now();
    const ktx = await encodeToKTX2(new Uint8Array(img), {
      isUASTC: false, generateMipmap: true, qualityLevel: QL, compressionLevel: 2, isPerceptual: true, isSetKTX2SRGBTransferFunc: true,
      imageDecoder: async () => ({ data: new Uint8Array(data), width: info.width, height: info.height }),
    });
    console.log(`  ${tex.getName()} ${info.width}x${info.height} : JPEG ${mo(img.byteLength)} -> KTX2 ${mo(ktx.byteLength)} (${Math.round((Date.now() - t0) / 1000)} s)`);
    tex.setImage(new Uint8Array(ktx)).setMimeType('image/ktx2');
  }
  doc.createExtension(KHRTextureBasisu).setRequired(true);

  // Maisons : simplification quasi sans perte visible (détails < bat-error × taille du mesh). Les Sol_* ne sont pas touchés.
  const ERR = +arg('bat-error', 0);
  let b = 0, a = 0;
  if (ERR > 0) for (const node of doc.getRoot().listNodes()) {
    if (!/^Bat_/.test(node.getName()) || !node.getMesh()) continue;
    for (const prim of node.getMesh().listPrimitives()) {
      const posA = prim.getAttribute('POSITION'), idxA = prim.getIndices(); if (!posA || !idxA) continue;
      const idx = Uint32Array.from(idxA.getArray()); const pos = Float32Array.from(posA.getArray());
      b += idx.length / 3;
      const col = prim.getAttribute('COLOR_0'), uv = prim.getAttribute('TEXCOORD_0');
      const n = pos.length / 3; const stride = 4 + 2; const attrs = new Float32Array(n * stride); const w = [1, 1, 1, 1, 2, 2];
      for (let i = 0; i < n; i++) {
        const c = col ? col.getElement(i, []) : [0, 0, 0, 1], u = uv ? uv.getElement(i, []) : [0, 0];
        attrs.set([c[0], c[1], c[2], c[3] ?? 1, u[0], u[1]], i * stride);
      }
      const [out] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attrs, stride, w, null, 3, ERR, ['LockBorder']);
      a += out.length / 3;
      idxA.setArray(new Uint32Array(out));
    }
  }
  console.log(`  Bat_* : ${Math.round(b)} -> ${Math.round(a)} triangles`);
  await doc.transform(prune());
  const dr = doc.getRoot().listExtensionsUsed().find((e) => e.extensionName === 'KHR_draco_mesh_compression');
  if (dr) dr.setEncoderOptions({ quantizePosition: 20, quantizeNormal: 10, quantizeTexcoord: 14, quantizeColor: 8, quantizeGeneric: 12 });
  await io.write(OUT, doc);
  console.log(`${OUT} : ${mo(fs.statSync(SRC).size)} -> ${mo(fs.statSync(OUT).size)}`);
}

/* ---------- Modèles animés : Meshopt (pas de position quantifiée sur peau : les clips restent identiques) ---------- */
async function meshopt(src, out, opts = {}) {
  const doc = await io.read(M + src);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_draco_mesh_compression') e.dispose();
  // on garde nœuds vides (ancres lues par nom dans le code) et peaux : seuls les accessoires orphelins partent
  await doc.transform(dedup(), prune({ keepLeaves: true, propertyTypes: [PropertyType.ACCESSOR, PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.BUFFER] }));
  // Positions gardées en float : la quantification positionnelle réécrit la transformation des nœuds (écrasée par les clips, ignorée par les peaux).
  // Normales / UV / couleurs / poids quantifiés ; les clips d'animation restent bit à bit identiques (Meshopt sans filtre).
  await doc.transform(quantize({ quantizeNormal: 10, quantizeTexcoord: 12, quantizeColor: 8, quantizeWeight: 8, quantizeGeneric: 12, pattern: /^(NORMAL|TANGENT|TEXCOORD_\d|COLOR_\d|WEIGHTS_\d)$/ }));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  await io.write(M + out, doc);
  console.log(`${M + out} : ${mo(fs.statSync(M + src).size)} -> ${mo(fs.statSync(M + out).size)}`);
}

const jobs = {
  ville,
  joueur: () => meshopt('personnage-joueur-gadget.glb', 'personnage-joueur-gadget-mobile.glb'),
  'drone-n': () => meshopt('droneN.glb', 'droneN-mobile.glb'),
  'voiture-anim': () => meshopt('personnage-voiture-anim.glb', 'personnage-voiture-anim-mobile.glb'),
};
for (const k of what === 'all' ? Object.keys(jobs) : [what]) { if (!jobs[k]) throw new Error('cible inconnue : ' + k); console.log('> ' + k); await jobs[k](); }
