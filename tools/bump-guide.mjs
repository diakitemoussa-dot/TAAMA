/**
 * Numéro de build UNIQUE du guide « Comment jouer ».
 * Tous les fichiers du guide (app/guide*.js, styles/guide*.css) sont chargés avec ?v=<build> : après une modification,
 * un navigateur qui a déjà chargé une ancienne version recharge TOUT le guide (jamais un mélange d'anciens et de nouveaux fichiers).
 *
 * Usage : node tools/bump-guide.mjs          incrémente le build et le propage
 *         node tools/bump-guide.mjs 12       fixe le build à 12
 * Propagé dans : app/guide.js (GUIDE_BUILD + import dynamique), imports internes app/guide-*.js, liens CSS, index.html.
 * Vérifié par tests/guide.test.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const write = (f, s) => fs.writeFileSync(path.join(ROOT, f), s);

const stub = read('app/guide.js');
const cur = Number((stub.match(/GUIDE_BUILD = '(\d+)'/) || [])[1] || 0);
const build = process.argv[2] ? Number(process.argv[2]) : cur + 1;
if (!Number.isInteger(build) || build < 1) throw new Error('build invalide');

const files = fs.readdirSync(path.join(ROOT, 'app')).filter((f) => /^guide.*\.js$/.test(f)).map((f) => 'app/' + f);
let n = 0;
for (const f of files) {
  let s = read(f);
  const o = s;
  s = s.replace(/(guide[a-z-]*\.js)\?v=\d+/g, `$1?v=${build}`).replace(/(styles\/guide[a-z-]*\.css)\?v=\d+/g, `$1?v=${build}`);
  if (f === 'app/guide.js') s = s.replace(/GUIDE_BUILD = '\d+'/, `GUIDE_BUILD = '${build}'`);
  if (s !== o) { write(f, s); n++; }
}
let html = read('index.html');
const h2 = html.replace(/(app\/guide\.js)\?v=\d+/, `$1?v=${build}`);
if (h2 !== html) { write('index.html', h2); n++; }
console.log(`guide : build ${cur} -> ${build} (${n} fichier(s) modifié(s))`);
