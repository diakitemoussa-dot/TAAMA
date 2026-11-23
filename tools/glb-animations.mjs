/**
 * Liste les animations d'un GLB (nom, durée, nombre de canaux, interpolation, images).
 * Usage : node tools/glb-animations.mjs <fichier.glb> [nomDeClip]
 */
import { NodeIO } from '@gltf-transform/core';

const [, , file, only] = process.argv;
const doc = await new NodeIO().read(file);
const root = doc.getRoot();
console.log(`${file}\n  nœuds: ${root.listNodes().length} | skins: ${root.listSkins().length} | meshes: ${root.listMeshes().length} | animations: ${root.listAnimations().length}`);
for (const a of root.listAnimations()) {
  if (only && a.getName() !== only) continue;
  const chans = a.listChannels();
  const paths = {};
  let tmax = 0, keys = 0;
  for (const c of chans) {
    paths[c.getTargetPath()] = (paths[c.getTargetPath()] || 0) + 1;
    const t = c.getSampler().getInput();
    keys = Math.max(keys, t.getCount());
    tmax = Math.max(tmax, t.getMax([])[0]);
  }
  const interp = [...new Set(a.listSamplers().map((s) => s.getInterpolation()))].join('/');
  console.log(`  - ${a.getName().padEnd(24)} ${tmax.toFixed(3)} s | ${chans.length} canaux ${JSON.stringify(paths)} | ${keys} clés | ${interp}`);
}
