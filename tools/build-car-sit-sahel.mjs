/**
 * Fabrique assets/models/personnage-voiture-anim-sahel.glb : les 3 clips « assis au volant » (car_sit_center / left / right, faits pour l'ancien rig)
 * retargetés sur le squelette du personnage Sahel (tools/retarget-lib.mjs). Le fichier ne contient que le squelette et les clips (pas de maillage).
 * Usage : node tools/build-car-sit-sahel.mjs
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import { retargetAnimation } from './retarget-lib.mjs';

await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const SRC = 'assets/models/personnage-voiture-anim.glb', BODY = 'assets/models/personnage-sahel.glb', OUT = 'assets/models/personnage-voiture-anim-sahel.glb';
const docS = await io.read(SRC), docT = await io.read(BODY);
for (const a of docT.getRoot().listAnimations()) { a.listChannels().forEach((c) => c.dispose()); a.listSamplers().forEach((x) => x.dispose()); a.dispose(); }                       // seuls les clips de conduite restent
for (const n of docT.getRoot().listNodes()) { n.setMesh(null); n.setSkin(null); }  // squelette seul
for (const sk of docT.getRoot().listSkins()) sk.dispose();
for (const name of ['car_sit_center', 'car_sit_left', 'car_sit_right']) {
  const a = docS.getRoot().listAnimations().find((x) => x.getName() === name);
  if (!a) throw new Error('clip introuvable : ' + name);
  const r = retargetAnimation(docS, a, docT, name);
  console.log(`Clip ${name} : ${r.frames} images, ${r.duration.toFixed(3)} s, échelle du bassin ${r.pelvisScale.toFixed(3)}`);
}
for (const sk of docT.getRoot().listSkins()) sk.dispose();
// Les clips d'origine ont 2 images différentes (jusqu'à 52° d'écart) : en boucle, la pose oscillait à ~15 Hz (le conducteur « tremblait »). On fige la pose sur la dernière image.
for (const a of docT.getRoot().listAnimations()) for (const sm of a.listSamplers()) {
  const o = sm.getOutput(), n = o.getCount(); if (n < 2) continue;
  const last = o.getElement(n - 1, []); for (let i = 0; i < n - 1; i++) o.setElement(i, last);
}
await docT.transform(prune({ keepLeaves: true }));
for (const ext of docT.getRoot().listExtensionsUsed()) ext.dispose();            // aucune extension : un GLTFLoader nu doit pouvoir lire le fichier
// pas de compression meshopt : le chargeur de vehicle.js est un GLTFLoader nu (le fichier ne contient aucun maillage)
await io.write(OUT, docT);
console.log(`Écrit ${OUT} : ${(fs.statSync(OUT).size / 1024).toFixed(0)} Ko, ${docT.getRoot().listAnimations().length} clips`);
