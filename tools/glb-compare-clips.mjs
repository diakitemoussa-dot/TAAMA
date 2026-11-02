/**
 * Compare les clips d'animation de deux GLB (mêmes noms de nœuds attendus).
 * Usage : node tools/glb-compare-clips.mjs <ancien.glb> <nouveau.glb>
 * Pour chaque clip commun : écart max sur les valeurs (translation, rotation, échelle) et sur les temps.
 */
import { NodeIO } from '@gltf-transform/core';

const [, , fa, fb] = process.argv;
const io = new NodeIO();
const [A, B] = await Promise.all([io.read(fa), io.read(fb)]);
const byName = (doc) => Object.fromEntries(doc.getRoot().listAnimations().map((a) => [a.getName(), a]));
const a = byName(A), b = byName(B);

// 1) Pose de repos des nœuds communs
const nodesA = Object.fromEntries(A.getRoot().listNodes().map((n) => [n.getName(), n]));
let restDiff = 0, common = 0, missing = [];
for (const n of B.getRoot().listNodes()) {
  const m = nodesA[n.getName()];
  if (!m) { missing.push(n.getName()); continue; }
  common++;
  const ta = [...m.getTranslation(), ...m.getRotation(), ...m.getScale()];
  const tb = [...n.getTranslation(), ...n.getRotation(), ...n.getScale()];
  ta.forEach((v, i) => { restDiff = Math.max(restDiff, Math.abs(v - tb[i])); });
}
console.log(`Nœuds communs: ${common} | seulement dans le nouveau: ${missing.length} ${missing.slice(0, 5)} | écart max pose de repos: ${restDiff.toExponential(2)}`);

// 2) Clips
const key = (c) => `${c.getTargetNode()?.getName()}|${c.getTargetPath()}`;
for (const name of Object.keys(a)) {
  if (!b[name]) { console.log(`  ${name.padEnd(24)} absent du nouveau fichier`); continue; }
  const ca = Object.fromEntries(a[name].listChannels().map((c) => [key(c), c]));
  let dv = 0, dt = 0, n = 0, miss = 0, lenDiff = 0;
  for (const c of b[name].listChannels()) {
    const o = ca[key(c)];
    if (!o) { miss++; continue; }
    const [ia, ib] = [o.getSampler().getInput().getArray(), c.getSampler().getInput().getArray()];
    const [va, vb] = [o.getSampler().getOutput().getArray(), c.getSampler().getOutput().getArray()];
    if (ia.length !== ib.length || va.length !== vb.length) { lenDiff++; continue; }
    ia.forEach((v, i) => { dt = Math.max(dt, Math.abs(v - ib[i])); });
    va.forEach((v, i) => { dv = Math.max(dv, Math.abs(v - vb[i])); });
    n++;
  }
  console.log(`  ${name.padEnd(24)} canaux comparés ${String(n).padStart(3)} | sans équivalent ${miss} | longueurs ≠ ${lenDiff} | écart max valeurs ${dv.toExponential(2)} | temps ${dt.toExponential(2)}`);
}
