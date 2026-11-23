/**
 * Affiche la pose d'un os (translation/rotation) à l'image donnée, pour plusieurs clips d'un GLB.
 * Usage : node tools/glb-bone-pose.mjs <fichier.glb> <os> <clip1,clip2,...> [temps=0]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [, , file, bone, clips, t0] = process.argv;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const t = Number(t0 || 0);
const at = (ch) => {
  const s = ch.getSampler(), times = s.getInput().getArray(), out = s.getOutput().getArray();
  const n = ch.getTargetPath() === 'rotation' ? 4 : 3;
  let i = 0; while (i < times.length - 1 && times[i + 1] <= t) i++;
  return Array.from(out.slice(i * n, i * n + n)).map((v) => +v.toFixed(4));
};
for (const a of doc.getRoot().listAnimations()) {
  if (!clips.split(',').includes(a.getName())) continue;
  const row = {};
  for (const c of a.listChannels()) if (c.getTargetNode()?.getName() === bone) row[c.getTargetPath()] = at(c);
  console.log(`${a.getName().padEnd(22)} t=${t}  T=${JSON.stringify(row.translation)}  R=${JSON.stringify(row.rotation)}`);
}
