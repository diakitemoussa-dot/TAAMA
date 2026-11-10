/**
 * Compare la structure de deux GLB (extensions, maillages, matériaux, textures, nœuds, skins, tailles).
 * Usage : node tools/glb-diff-structure.mjs <a.glb> <b.glb>
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const info = async (f) => {
  const d = await io.read(f); const r = d.getRoot();
  const json = (await io.readAsJSON(f)).json;
  return {
    taille: fs.statSync(f).size,
    extensionsUsed: (json.extensionsUsed || []).slice().sort().join(','),
    nœuds: r.listNodes().length, meshes: r.listMeshes().length, matériaux: r.listMaterials().length,
    textures: r.listTextures().length, skins: r.listSkins().length, scènes: r.listScenes().length,
    animations: r.listAnimations().map((a) => a.getName()).sort().join(' | '),
    sommets: r.listMeshes().reduce((s, m) => s + m.listPrimitives().reduce((t, p) => t + (p.getAttribute('POSITION')?.getCount() || 0), 0), 0),
  };
};
const [, , fa, fb] = process.argv;
const [a, b] = [await info(fa), await info(fb)];
for (const k of Object.keys(a)) {
  const same = String(a[k]) === String(b[k]);
  console.log(`${same ? '=' : '≠'} ${k.padEnd(15)} ${same ? a[k] : `${a[k]}  →  ${b[k]}`}`);
}
