/** Le cercle jaune du labo de Tapama : app/labo-position.js doit rester identique au centre du cylindre exporté de Blender (assets/models/maison-tapama.json). */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { LABO, LABO_HAUTEUR } from '../app/labo-position.js';

const info = JSON.parse(fs.readFileSync(new URL('../assets/models/maison-tapama.json', import.meta.url), 'utf8'));

test('LABO = cercle du modèle de la maison de Tapama', () => {
  assert.deepEqual([LABO.x, LABO.y, LABO.z], info.cercle);
  assert.equal(LABO.r, 1.8);
  assert.ok(LABO_HAUTEUR > 2 && LABO_HAUTEUR < 4);
});
test('le cercle est dans la maison (à moins de 25 m de son centre, la maison est grande) et les ampoules sont exportées', () => {
  const [mx, , mz] = info.maison;
  assert.ok(Math.hypot(LABO.x - mx, LABO.z - mz) < 25);
  assert.ok(info.lampes.length >= 20);
  for (const p of info.lampes) assert.ok(p.length === 3 && Math.hypot(p[0] - mx, p[2] - mz) < 60);
});
test('les deux modèles existent et sont en Draco', () => {
  for (const f of ['maison-tapama.glb', 'barrage-djenne.glb']) {
    const b = fs.readFileSync(new URL('../assets/models/' + f, import.meta.url));
    assert.equal(b.toString('utf8', 0, 4), 'glTF'); assert.ok(b.includes('KHR_draco_mesh_compression'));
  }
});
