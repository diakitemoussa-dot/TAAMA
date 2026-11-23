/**
 * Le GLB du personnage doit contenir tous les clips que le jeu attend (repos long, pose de pilotage du drone, nage, conduite).
 * Usage : node --test tests/player-clips.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const clips = async (f) => {
  const d = await io.read(new URL(`../assets/models/${f}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' '));
  return new Map(d.getRoot().listAnimations().map((a) => [a.getName(), a]));
};
const dur = (a) => Math.max(...a.listSamplers().map((s) => s.getInput().getMax([])[0]));

test('personnage-sahel.glb : clips de repos long, pilotage du drone et nage présents, avec leur durée', async () => {
  const c = await clips('personnage-sahel.glb');
  for (const [name, d] of [['idle_look', 10.6], ['control_idle', 3.37], ['Swim', 4.53], ['Swim_Idle', 3.0]]) {
    assert.ok(c.has(name), `clip manquant : ${name}`);
    assert.ok(Math.abs(dur(c.get(name)) - d) < 0.05, `${name} : ${dur(c.get(name))} s au lieu de ${d} s`);
  }
  for (const name of ['Idle', 'Walk', 'Run', 'Jump', 'Death', 'Pistol Kneel', 'Pistol Strafe', 'Pistol Strafe Right', 'Pistol Walk Backward', 'Pistol Idle Tir']) assert.ok(c.has(name), `clip manquant : ${name}`);
});

test('chaque clip retargeté anime les 65 os (rotations) et déplace le bassin', async () => {
  const c = await clips('personnage-sahel.glb');
  for (const name of ['idle_look', 'control_idle', 'Swim', 'Swim_Idle']) {
    const a = c.get(name), ch = a.listChannels();
    assert.equal(ch.filter((x) => x.getTargetPath() === 'rotation').length, 65, `${name} : rotations`);
    assert.ok(ch.some((x) => x.getTargetPath() === 'translation' && x.getTargetNode().getName() === 'mixamorig:Hips'), `${name} : bassin`);
  }
});

test('personnage-voiture-anim-sahel.glb : les 3 clips de conduite, sans extension obligatoire (chargeur nu de vehicle.js)', async () => {
  const c = await clips('personnage-voiture-anim-sahel.glb');
  for (const n of ['car_sit_center', 'car_sit_left', 'car_sit_right']) assert.ok(c.has(n), n);
  const fs = await import('node:fs');
  const b = fs.readFileSync(new URL('../assets/models/personnage-voiture-anim-sahel.glb', import.meta.url));
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  assert.equal(j.extensionsRequired, undefined);
});
