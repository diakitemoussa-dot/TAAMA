/** Tests de tapama-voice.js : clé des répliques (liée aux fichiers audio du manifeste). Usage : node tests/tapama-voice.test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lineKey } from '../app/tapama-voice.js';
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
t('clé stable : espaces ignorés, texte différent = clé différente', () => {
  assert.equal(lineKey('Salut  {nom} !'), lineKey(' Salut {nom} !')); assert.notEqual(lineKey('Salut'), lineKey('Salut !')); assert.match(lineKey('x'), /^[0-9a-f]{8}$/);
});
t('toutes les clés du manifeste ont leurs fichiers audio', () => {
  const dir = new URL('../assets/audio/tapama/', import.meta.url);
  const m = JSON.parse(fs.readFileSync(new URL('manifest.json', dir), 'utf8'));
  for (const [k, segs] of Object.entries(m)) { assert.ok(segs.length > 0, k); for (const s of segs) assert.ok(fs.existsSync(new URL(s.f, dir)), s.f); }
});
console.log(`${n} tests OK`);
