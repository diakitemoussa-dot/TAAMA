/**
 * Allège la maquette pour mobile : simplifie la géométrie de chaque mesh (meshoptimizer),
 * sans toucher aux noms de nœuds ni aux matériaux. Écrit un GLB intermédiaire qu'on passe
 * ensuite à tools/split-tiles.mjs pour produire le jeu de tuiles mobile.
 *
 * Usage : node tools/simplify-for-mobile.mjs [--src assets/models/djenne-ar.glb] [--out <fichier.glb>]
 *         puis : node tools/split-tiles.mjs --src <fichier.glb> --out assets/models/tiles-mobile
 */
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3d';

const argv = process.argv.slice(2);
const arg = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const SRC = arg('src', 'assets/models/djenne-ar.glb');
const OUT = arg('out', 'mosquee-mobile.glb');

/** Part de triangles conservée par mesh (1 = intact). Défaut : DEFAULT_RATIO. */
const RATIOS = {
  arbre: 0.16,
  Canaris: 0.45,
  Mosquee_Base: 0.60,
  Porte_Cour: 0.45,
  Minarets: 0.65,
  Porte_Principale: 0.45,
  Mosquee_Cloture: 0.50,
  Portes_Exterieures: 0.45,
  Torons_Externes: 0.60,
};
const DEFAULT_RATIO = 1;
const SLOPPY = new Set(['arbre']);
/** Erreur max tolérée, relative à la taille du mesh (0.01 = 1 %). Plus bas = plus fidèle. */
const ERROR = { arbre: 0.08 };
const DEFAULT_ERROR = Number(process.env.ERR ?? 0.002);
/** Réduction visée pour les bâtiments : volontairement basse, l'erreur max est la vraie limite. */
const BUILDING_RATIO = Number(process.env.BRATIO ?? 0.2);

/** Poids des attributs dans l'erreur de simplification (plus haut = plus fidèle, moins réduit). */
const ATTR_W_NORMAL = 0.5;
const ATTR_W_UV = 2.0;

/** Simplifie en pesant normales + UV : évite l'étirement des textures et le lissage du relief. */
function simplifyKeepingLook(prim, indices, pos, target, error) {
  const n = prim.getAttribute('NORMAL'), uv = prim.getAttribute('TEXCOORD_0');
  if (!n || !uv) return MeshoptSimplifier.simplify(indices, pos, 3, target, error, ['Permissive']);
  const count = pos.length / 3;
  const attrs = new Float32Array(count * 5);
  const na = n.getArray(), ua = uv.getArray();
  for (let i = 0; i < count; i++) {
    attrs.set([na[i * 3], na[i * 3 + 1], na[i * 3 + 2], ua[i * 2], ua[i * 2 + 1]], i * 5);
  }
  return MeshoptSimplifier.simplifyWithAttributes(indices, pos, 3, attrs, 5, [ATTR_W_NORMAL, ATTR_W_NORMAL, ATTR_W_NORMAL, ATTR_W_UV, ATTR_W_UV], null, target, error, ['Permissive']);
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(SRC);

let before = 0, after = 0;
console.log('mesh'.padEnd(22), 'avant'.padStart(8), 'après'.padStart(8), ' cible');
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const name = [node.getName(), mesh.getName()].find((n) => n in RATIOS) || mesh.getName() || node.getName();
  const ratio = name === 'arbre' ? RATIOS.arbre : (name in RATIOS && BUILDING_RATIO ? BUILDING_RATIO : (RATIOS[name] ?? DEFAULT_RATIO));
  let b = 0, a = 0;
  for (const prim of mesh.listPrimitives()) {
    const posAcc = prim.getAttribute('POSITION');
    const idxAcc = prim.getIndices();
    if (!posAcc || !idxAcc) continue;
    const idx = Uint32Array.from(idxAcc.getArray());
    b += idx.length / 3;
    if (ratio >= 1) { a += idx.length / 3; continue; }
    const pos = Float32Array.from(posAcc.getArray());
    // Sommets de même position fusionnés : évite les fissures aux coutures UV / normales.
    const remap = MeshoptSimplifier.generatePositionRemap(pos, 3);
    const welded = idx.map((i) => remap[i]);
    const target = Math.max(3, Math.floor((idx.length * ratio) / 3) * 3);
    // Feuillage : des milliers de feuilles disjointes, la simplification classique cale ; le mode
    // « sloppy » ignore la topologie. Bâtiments : mode permissif (coutures UV / normales).
    const [out] = SLOPPY.has(name)
      ? MeshoptSimplifier.simplifySloppy(welded, pos, 3, null, target, ERROR[name] ?? DEFAULT_ERROR)
      : simplifyKeepingLook(prim, idx, pos, target, ERROR[name] ?? DEFAULT_ERROR); // sommets d'origine : pas de fusion, sinon normales / UV d'un voisin
    idxAcc.setArray(out.length > 65535 * 3 || posAcc.getCount() > 65535 ? out : Uint16Array.from(out));
    a += out.length / 3;
  }
  before += b; after += a;
  console.log(name.padEnd(22), String(Math.round(b)).padStart(8), String(Math.round(a)).padStart(8), ratio < 1 ? ` x${ratio}` : '');
}
console.log(`TOTAL ${Math.round(before)} -> ${Math.round(after)} triangles (${(100 * after / before).toFixed(0)} %)`);

// GLB intermédiaire non compressé : split-tiles recompresse en Draco.
for (const ext of doc.getRoot().listExtensionsUsed()) if (ext instanceof KHRDracoMeshCompression) ext.dispose();
await io.write(OUT, doc);
console.log(`écrit : ${OUT} (${(fs.statSync(OUT).size / 1048576).toFixed(1)} Mo)`);
