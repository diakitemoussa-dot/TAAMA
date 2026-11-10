/**
 * VERSIONS ANTI-CACHE (?v=N) — incrémente la version de chaque module modifié, en cascade vers ses importeurs.
 * Pourquoi : index.html et les modules chargent leurs dépendances avec « fichier.js?v=N ». Un fichier modifié sans nouveau N est servi depuis le
 * cache du navigateur ; un fichier référencé sous DEUX N différents est chargé deux fois (deux instances : états incohérents, tests cassés).
 * Règles appliquées :
 *   • pour chaque fichier modifié, toutes ses références (index.html, app/*.js, tests/*.mjs, tools/*.mjs) passent au même N = (plus grand N actuel) + 1 ;
 *   • un module dont une chaîne d'import a changé est lui-même modifié : il est incrémenté à son tour (cascade jusqu'au point fixe) ;
 *   • les fichiers du guide (app/guide*.js, styles/guide*.css) partagent un build unique : ils passent par tools/bump-guide.mjs ;
 *   • les tests qui importent un module avec ?v= suivent le même N que l'application (une seule instance sous Node).
 * Usage : node tools/bump-versions.mjs app/vehicle.js styles/tapama.css        fichiers donnés explicitement
 *         node tools/bump-versions.mjs --since <dossier>                       tout fichier différent de la copie de référence <dossier> (même arborescence)
 *         option --dry : affiche sans écrire.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const sinceIdx = argv.indexOf('--since');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');
const listFiles = (dir, ext) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => ext.test(f)).map((f) => path.join(dir, f)) : []);

/* 1. fichiers modifiés */
let changed = [];
if (sinceIdx >= 0) {
  const snap = path.resolve(argv[sinceIdx + 1] || '');
  if (!fs.existsSync(snap)) { console.error('copie de référence introuvable :', snap); process.exit(2); }
  const norm = (p) => read(p).replace(/\r\n/g, '\n');
  const scan = (sub, ext) => { for (const f of listFiles(path.join(ROOT, sub), ext)) { const s = path.join(snap, sub, path.basename(f)); if (!fs.existsSync(s) || norm(s) !== norm(f)) changed.push(rel(f)); } };
  scan('app', /\.js$/); scan('styles', /\.css$/); scan('server', /\.mjs$/);
  for (const f of ['index.html', '_serve.cjs']) { const s = path.join(snap, f), r = path.join(ROOT, f); if (fs.existsSync(r) && (!fs.existsSync(s) || norm(s) !== norm(r))) changed.push(f); }
} else changed = argv.filter((a) => !a.startsWith('--')).map((a) => a.replace(/\\/g, '/').replace(/^\.\//, ''));
changed = [...new Set(changed)];
if (!changed.length) { console.log('aucun fichier modifié : rien à faire'); process.exit(0); }

/* 2. sites de référence : { file, name, n } pour chaque « nom.ext?v=N » */
const SITES_FILES = [path.join(ROOT, 'index.html'), ...listFiles(path.join(ROOT, 'app'), /\.js$/), ...listFiles(path.join(ROOT, 'tests'), /\.mjs$/), ...listFiles(path.join(ROOT, 'tools'), /\.mjs$/)];
const RE = /([a-z0-9][a-z0-9-]*\.(?:js|css))\?v=(\d+)/g;
const isGuide = (name) => /^guide(-[a-z]+)?\.(js|css)$/.test(name);
const texts = new Map(SITES_FILES.map((f) => [f, read(f)]));
const sitesOf = (name) => { const out = []; for (const [f, t] of texts) { let m; RE.lastIndex = 0; while ((m = RE.exec(t))) if (m[1] === name) out.push({ file: f, n: Number(m[2]) }); } return out; };

/* 3. cascade */
const queue = changed.map((f) => path.basename(f)).filter((n) => /\.(js|css)$/.test(n));
const done = new Set(), bumped = [];
let guideTouched = changed.some((f) => isGuide(path.basename(f)));
while (queue.length) {
  const name = queue.shift();
  if (done.has(name)) continue; done.add(name);
  if (isGuide(name)) { guideTouched = true; continue; }                       // build commun : tools/bump-guide.mjs
  const sites = sitesOf(name);
  if (!sites.length) continue;                                               // module chargé sans version (ou jamais référencé) : rien à incrémenter
  const next = Math.max(...sites.map((s) => s.n)) + 1;
  const re = new RegExp(name.replace(/[.]/g, '\\.') + '\\?v=\\d+', 'g');
  const touched = new Set();
  for (const s of sites) { texts.set(s.file, texts.get(s.file).replace(re, `${name}?v=${next}`)); touched.add(s.file); }
  bumped.push({ name, from: [...new Set(sites.map((s) => s.n))].join('/'), to: next, in: [...touched].map(rel) });
  for (const f of touched) { const b = path.basename(f); if (/^app[\\/]/.test(rel(f)) && !done.has(b)) queue.push(b); }   // un importeur dont le texte change doit être rechargé lui aussi
}

/* 4. écriture */
for (const b of bumped) console.log(`${b.name} : v${b.from} → v${b.to}  (${b.in.join(', ')})`);
if (!dry) for (const [f, t] of texts) if (t !== read(f)) fs.writeFileSync(f, t);
if (guideTouched) {
  console.log('fichiers du guide modifiés → tools/bump-guide.mjs');
  if (!dry) { const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'bump-guide.mjs')], { encoding: 'utf8' }); process.stdout.write(r.stdout || ''); if (r.status) { process.stderr.write(r.stderr || ''); process.exit(r.status); } }
}
console.log(`${bumped.length} module(s) incrémenté(s)${dry ? ' (simulation)' : ''} ; fichiers modifiés détectés : ${changed.length}`);
