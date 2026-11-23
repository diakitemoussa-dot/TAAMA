/**
 * Reporte dans le jeu une modification de forme faite dans Blender sur le mesh « Torons_Externes ».
 * ---------------------------------------------------------------------------------------------
 * Blender a importé djenne-mosque-only.glb (même ordre de sommets que dans le jeu). On compare ses positions à celles du fichier d'origine :
 * seuls les sommets déplacés sont réécrits dans les fichiers du jeu (djenne-ar.glb, tiles/core.gltf, djenne-mosque-only.glb). Chaque fichier a sa propre
 * échelle locale : on la retrouve par régression sur les sommets inchangés, puis on convertit les positions et les normales des sommets déplacés.
 *
 * Usage : node tools/apply-blender-torons.mjs <export-blender.json> <reference.glb> <cible> [<cible> ...]
 *   export-blender.json : { n, pos[], nor[] } en repère glTF local (x, z, -y de Blender), produit par Blender (voir docs)
 *   reference.glb       : djenne-mosque-only.glb ORIGINAL (avant modification)
 */
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import draco3d from 'draco3d';
import { Matrix3, Matrix4, Vector3 } from 'three';

const [, , jsonPath, refPath, ...targets] = process.argv;
if (!jsonPath || !refPath || !targets.length) { console.error('usage : node tools/apply-blender-torons.mjs <export.json> <reference.glb> <cible>...'); process.exit(1); }
const NAME = 'Torons_Externes';
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression, EXTTextureWebP])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule({}), 'draco3d.encoder': await draco3d.createEncoderModule({}) });

const B = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const prim = async (file) => {
  const doc = await io.read(file);
  const node = doc.getRoot().listNodes().find((n) => n.getName() === NAME && n.getMesh());
  if (!node) throw new Error(`${file} : pas de ${NAME}`);
  return { doc, node, p: node.getMesh().listPrimitives()[0] };
};

const R = await prim(refPath);
const ref = R.p.getAttribute('POSITION').getArray(), refN = R.p.getAttribute('NORMAL').getArray();
if (ref.length !== B.pos.length) throw new Error(`nombre de sommets différent (réf ${ref.length / 3}, Blender ${B.pos.length / 3})`);
const moved = [];
for (let i = 0; i < B.n; i++) if (Math.hypot(B.pos[i * 3] - ref[i * 3], B.pos[i * 3 + 1] - ref[i * 3 + 1], B.pos[i * 3 + 2] - ref[i * 3 + 2]) > 1e-4) moved.push(i);
console.log(`sommets déplacés dans Blender : ${moved.length} / ${B.n}`);
if (!moved.length) { console.log('aucune modification : rien à reporter'); process.exit(0); }
const Wr = new Matrix4().fromArray(R.node.getWorldMatrix());

/**
 * Les fichiers du jeu ne gardent pas l'ordre des sommets (et djenne-mosque-only.glb est le seul à l'avoir gardé). On retrouve donc chaque sommet déplacé
 * par sa POSITION et sa NORMALE d'origine, exprimées dans le repère monde (les tuiles ont leur repère monde « cuit » dans les sommets).
 */
for (const file of targets) {
  const T = file === refPath ? R : await prim(file);
  const pa = T.p.getAttribute('POSITION'), na = T.p.getAttribute('NORMAL'), cnt = pa.getCount();
  const Wt = new Matrix4().fromArray(T.node.getWorldMatrix());
  const toT = new Matrix4().copy(Wt).invert().multiply(Wr);               // repère local de la référence -> repère local de la cible
  const nm = new Matrix3().getNormalMatrix(toT);
  const e = toT.elements, tol = 0.03 * Math.max(...[0, 1, 2].map((c) => Math.hypot(e[c * 4], e[c * 4 + 1], e[c * 4 + 2])));   // tolérance : quantification Draco
  const pos = pa.getArray().slice(), nor = na.getArray().slice(), tp = pa.getArray();
  // index spatial grossier
  const grid = new Map(), key = (x, y, z) => `${Math.floor(x / (tol * 4))},${Math.floor(y / (tol * 4))},${Math.floor(z / (tol * 4))}`;
  for (let i = 0; i < cnt; i++) { const k = key(tp[i * 3], tp[i * 3 + 1], tp[i * 3 + 2]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
  let done = 0; const used = new Set();
  for (const i of moved) {
    const o = new Vector3(ref[i * 3], ref[i * 3 + 1], ref[i * 3 + 2]).applyMatrix4(toT).toArray();
    const on = new Vector3(refN[i * 3], refN[i * 3 + 1], refN[i * 3 + 2]).applyMatrix3(nm).normalize().toArray();
    const cx = Math.floor(o[0] / (tol * 4)), cy = Math.floor(o[1] / (tol * 4)), cz = Math.floor(o[2] / (tol * 4));
    let best = -1, bd = tol, bestSign = 1;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
      if (used.has(j)) continue;
      const d = Math.hypot(tp[j * 3] - o[0], tp[j * 3 + 1] - o[1], tp[j * 3 + 2] - o[2]);
      if (d >= bd) continue;
      const n2 = [nor[j * 3], nor[j * 3 + 1], nor[j * 3 + 2]];
      const dot = n2[0] * on[0] + n2[1] * on[1] + n2[2] * on[2];
      if (Math.abs(dot) < 0.9) continue;                      // normales parallèles (les tuiles « cuites » peuvent avoir des normales de sens inverse)
      bd = d; best = j; bestSign = dot < 0 ? -1 : 1;
    }
    if (best < 0) {                                           // 2e chance : le point le plus proche, quelle que soit sa normale (sommets soudés dans les tuiles)
      bd = tol; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const j of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) || []) {
        if (used.has(j)) continue; const d = Math.hypot(tp[j * 3] - o[0], tp[j * 3 + 1] - o[1], tp[j * 3 + 2] - o[2]);
        if (d < bd) { bd = d; best = j; bestSign = (nor[j * 3] * on[0] + nor[j * 3 + 1] * on[1] + nor[j * 3 + 2] * on[2]) < 0 ? -1 : 1; }
      }
    }
    if (best < 0) continue;
    used.add(best); done++;
    const np = new Vector3(B.pos[i * 3], B.pos[i * 3 + 1], B.pos[i * 3 + 2]).applyMatrix4(toT).toArray();
    const nn = new Vector3(B.nor[i * 3], B.nor[i * 3 + 1], B.nor[i * 3 + 2]).applyMatrix3(nm).normalize().toArray();
    for (let c = 0; c < 3; c++) { pos[best * 3 + c] = np[c]; nor[best * 3 + c] = nn[c] * bestSign; }
  }
  console.log(`${file} : ${done} / ${moved.length} sommets retrouvés et mis à jour`);
  if (done < moved.length) { console.log('  correspondance incomplète : fichier non modifié (une poutre à moitié déplacée serait pire)'); continue; }
  pa.setArray(pos); na.setArray(nor);
  await io.write(file, T.doc);
}
