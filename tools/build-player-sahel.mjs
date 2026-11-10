/**
 * Fabrique assets/models/personnage-sahel.glb : le nouveau personnage (player.glb, 57 clips Mixamo)
 * + le SAC À DOS et le point d'ancrage du DRONE (DroneLandingPad) repris de l'ancien modèle
 * (personnage-joueur-gadget.glb). Les deux fichiers sources ne sont jamais modifiés.
 *
 *  - os renommés `mixamorig4:` -> `mixamorig:` (le code du jeu filtre les couches haut/bas par ces noms) ;
 *  - sac : mesh skinné de l'ancien rig -> mesh rigide fixé sur Spine2 du nouveau rig, remis à l'échelle ;
 *  - DroneLandingPad : même placement relatif sur Spine2, même échelle que le sac (le drone garde sa taille) ;
 *  - fusil / chargeur supprimés (le pistolet remplace le gadget), ancien gadget / ancien corps non repris ;
 *  - clips absents du nouveau modèle (idle_look, control_idle, Swim, Swim_Idle) repris de l'ancien et retargetés (tools/retarget-lib.mjs).
 *
 * Usage : node tools/build-player-sahel.mjs [player.glb] [--dry]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { mergeDocuments, prune, dedup } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';
import fs from 'node:fs';
import { retargetAnimation } from './retarget-lib.mjs';

const argv = process.argv.slice(2);
const SRC_NEW = argv.find((a) => a.endsWith('.glb')) ||
  'C:/Users/Kabakoo Apprenant.e/Desktop/MES PROJETS/projects/active/Sahel-Game/client/assets/player.glb';
const SRC_OLD = 'assets/models/personnage-joueur-gadget.glb';
const OUT = 'assets/models/personnage-sahel.glb';
const DRY = argv.includes('--dry');

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder,
});
const docN = await io.read(SRC_NEW);   // nouveau personnage
const docO = await io.read(SRC_OLD);   // ancien (sac + pad)

const byName = (doc, name) => doc.getRoot().listNodes().find((n) => n.getName() === name);
const W = (node) => new THREE.Matrix4().fromArray(node.getWorldMatrix());
const parts = (m) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, q, s); return { p, q, s }; };
const pathOf = (n) => { const o = []; for (let x = n; x; x = x.getParentNode()) o.push(x.getName()); return o.slice(0, 5).join(' < '); };

/* 1. Os du nouveau rig : mixamorig4: -> mixamorig: */
for (const n of docN.getRoot().listNodes()) n.setName(n.getName().replace(/^mixamorig\d*:/, 'mixamorig:'));

/* 2. Repères */
const spN = byName(docN, 'mixamorig:Spine2'), spO = byName(docO, 'mixamorig:Spine2');
const headN = byName(docN, 'mixamorig:Head'), headO = byName(docO, 'mixamorig:Head');
const bpO = byName(docO, 'BP_Backpack'), padO = byName(docO, 'DroneLandingPad');
if (!spN || !spO || !headN || !headO || !bpO || !padO) throw new Error('repères introuvables (Spine2/Head/BP_Backpack/DroneLandingPad)');

const Wn = W(spN), Wo = W(spO);
const hn = parts(W(headN)).p.y, ho = parts(W(headO)).p.y;
const s = hn / ho;
const pn = parts(Wn), po = parts(Wo);
console.log(`Hauteur tête : nouveau ${hn.toFixed(3)} / ancien ${ho.toFixed(3)} -> échelle ${s.toFixed(3)}`);
console.log(`Spine2 monde : nouveau ${pn.p.toArray().map((v) => v.toFixed(3))} | ancien ${po.p.toArray().map((v) => v.toFixed(3))}`);
console.log('Arme(s) du nouveau modèle :', docN.getRoot().listNodes().filter((n) => /Pistol|Rifle|Weapon|Mag/.test(n.getName())).map((n) => pathOf(n)).join('\n   '));

// A : ancien espace monde (pose de repos) -> nouveau espace monde, en suivant Spine2 (rotation du torse corrigée)
const A = new THREE.Matrix4().multiplyMatrices(
  new THREE.Matrix4().makeTranslation(pn.p.x, pn.p.y, pn.p.z),
  new THREE.Matrix4().multiplyMatrices(
    new THREE.Matrix4().makeRotationFromQuaternion(pn.q),
    new THREE.Matrix4().multiplyMatrices(
      new THREE.Matrix4().makeScale(s, s, s),
      new THREE.Matrix4().multiplyMatrices(
        new THREE.Matrix4().makeRotationFromQuaternion(po.q.clone().invert()),
        new THREE.Matrix4().makeTranslation(-po.p.x, -po.p.y, -po.p.z)))));
const toLocal = new THREE.Matrix4().copy(Wn).invert().multiply(A);

/* 3. Contrôle : les sommets du sac skinné sont-ils bien en espace monde (jointWorld * IBM = identité) ? */
{
  const skin = bpO.getSkin();
  const j = skin.listJoints().indexOf(spO);
  const ibm = new THREE.Matrix4().fromArray(skin.getInverseBindMatrices().getElement(j, []));
  const chk = new THREE.Matrix4().multiplyMatrices(Wo, ibm);
  const dev = chk.elements.reduce((m, v, i) => Math.max(m, Math.abs(v - (i % 5 === 0 ? 1 : 0))), 0);
  console.log(`Contrôle skin sac : écart Spine2*IBM vs identité = ${dev.toExponential(2)} ${dev < 1e-3 ? '(OK)' : '(ATTENTION : espace non monde)'}`);
  // part des poids portée par chaque os (pour juger si un attachement rigide suffit)
  const prim = bpO.getMesh().listPrimitives()[0];
  const J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0'), names = skin.listJoints().map((x) => x.getName());
  const acc = {}; let tot = 0;
  for (let i = 0; i < J.getCount(); i++) { const jj = J.getElement(i, []), ww = Wt.getElement(i, []); for (let k = 0; k < 4; k++) { acc[names[jj[k]]] = (acc[names[jj[k]]] || 0) + ww[k]; tot += ww[k]; } }
  console.log('Poids du sac par os :', Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%`).join(', '));
}
if (DRY) process.exit(0);

/* 4. Fusion : on importe l'ancien document dans le nouveau, puis on ne garde que le sac et le pad */
const map = mergeDocuments(docN, docO);
const bp = map.get(bpO), pad = map.get(padO);
const padWorldOld = W(padO);

bp.setSkin(null);
for (const prim of bp.getMesh().listPrimitives()) { prim.setAttribute('JOINTS_0', null); prim.setAttribute('WEIGHTS_0', null); }
bp.setMatrix(toLocal.toArray());
spN.addChild(bp);

pad.setMatrix(new THREE.Matrix4().copy(toLocal).multiply(padWorldOld).toArray());
spN.addChild(pad);

// retire tout ce qui vient de l'ancien modèle sauf le sac et le pad
for (const n of docO.getRoot().listNodes()) { const m = map.get(n); if (m && m !== bp && m !== pad) m.dispose(); }
for (const a of docO.getRoot().listAnimations()) map.get(a)?.dispose();
for (const sc of docO.getRoot().listScenes()) map.get(sc)?.dispose();
for (const sk of docO.getRoot().listSkins()) map.get(sk)?.dispose();

// retire le fusil et le chargeur : le pistolet remplace le gadget
for (const n of docN.getRoot().listNodes()) {
  if (/^(Rifle|Rifle_Mag|Mag|Weapon)$/.test(n.getName())) n.dispose();
}

await docN.transform(prune({ keepLeaves: true }), dedup());
{ // le merge a ajouté le buffer de l'ancien modèle : un GLB n'en admet qu'un seul
  const buffers = docN.getRoot().listBuffers();
  for (const b of buffers.slice(1)) {
    for (const acc of docN.getRoot().listAccessors()) if (acc.getBuffer() === b) acc.setBuffer(buffers[0]);
    b.dispose();
  }
}
/* 5. Clips absents du nouveau modèle, repris de l'ancien et retargetés (pose de repos différente : voir tools/retarget-lib.mjs) */
const NEEDED = [['idle_look', 'idle_look'], ['control_idle', 'control_idle'], ['Swim', 'Swim'], ['Swim_Idle', 'Swim_Idle']];   // [clip source, nom dans le nouveau GLB]
for (const [src, dst] of NEEDED) {
  const a = docO.getRoot().listAnimations().find((x) => x.getName() === src);
  if (!a) throw new Error(`clip introuvable dans l'ancien modèle : ${src}`);
  const r = retargetAnimation(docO, a, docN, dst);
  console.log(`Clip ${dst} : ${r.frames} images, ${r.duration.toFixed(2)} s, ${r.bones} os, échelle du bassin ${r.pelvisScale.toFixed(3)}`);
}

docN.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await io.write(OUT, docN);
console.log(`Écrit ${OUT} : ${(fs.statSync(OUT).size / 1048576).toFixed(2)} Mo, ${docN.getRoot().listAnimations().length} clips`);
