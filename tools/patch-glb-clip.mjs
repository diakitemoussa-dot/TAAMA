/**
 * Remplace UN clip d'animation d'un GLB par le clip du même nom d'un autre GLB
 * (export Blender), sans toucher aux autres clips, aux maillages ni aux matériaux.
 *
 * Usage : node tools/patch-glb-clip.mjs <cible.glb> <source.glb> <nomDuClip> <sortie.glb>
 * Les canaux sont rattachés aux nœuds de la cible par NOM de nœud.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const [, , targetFile, sourceFile, clip, outFile] = process.argv;
if (!outFile) {
  console.error('Usage : node tools/patch-glb-clip.mjs <cible.glb> <source.glb> <nomDuClip> <sortie.glb>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [target, source] = await Promise.all([io.read(targetFile), io.read(sourceFile)]);

const dst = target.getRoot().listAnimations().find((a) => a.getName() === clip);
const src = source.getRoot().listAnimations().find((a) => a.getName() === clip);
if (!dst) throw new Error(`Clip "${clip}" introuvable dans ${targetFile}`);
if (!src) throw new Error(`Clip "${clip}" introuvable dans ${sourceFile}`);

const nodes = Object.fromEntries(target.getRoot().listNodes().map((n) => [n.getName(), n]));

// 1) Retire les anciens canaux / échantillonneurs et libère leurs accessors devenus orphelins
const oldAccessors = new Set();
for (const s of dst.listSamplers()) { oldAccessors.add(s.getInput()); oldAccessors.add(s.getOutput()); }
for (const c of dst.listChannels()) c.dispose();
for (const s of dst.listSamplers()) s.dispose();
let freed = 0;
for (const acc of oldAccessors) {
  if (acc && acc.listParents().every((p) => p.propertyType === 'Root')) { acc.dispose(); freed++; }
}

// 2) Recopie les canaux du clip source, rattachés aux nœuds de la cible par nom
const copyAccessor = (a) => target.createAccessor().setType(a.getType()).setArray(a.getArray().slice());
let added = 0;
for (const ch of src.listChannels()) {
  const node = nodes[ch.getTargetNode()?.getName()];
  if (!node) throw new Error(`Nœud "${ch.getTargetNode()?.getName()}" introuvable dans la cible`);
  const sp = ch.getSampler();
  const sampler = target.createAnimationSampler()
    .setInput(copyAccessor(sp.getInput()))
    .setOutput(copyAccessor(sp.getOutput()))
    .setInterpolation(sp.getInterpolation());
  const channel = target.createAnimationChannel()
    .setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(sampler);
  dst.addSampler(sampler);
  dst.addChannel(channel);
  added++;
}
await io.write(outFile, target);
console.log(`Clip "${clip}" remplacé : ${added} canaux ajoutés, ${freed} accessors libérés → ${outFile}`);
