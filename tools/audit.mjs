/**
 * AUDIT AUTOMATIQUE DU PROJET — node tools/audit.mjs [--browser]
 * 1. syntaxe de tous les modules app/*.js ;
 * 2. références de index.html (scripts, feuilles de style) : fichiers présents ;
 * 3. fichiers référencés par le code (assets/…) : présents sur le disque ;
 * 4. importations relatives des modules : fichiers présents ;
 * 5. tests unitaires (tests/*.test.mjs) ;
 * 6. (--browser) parcours du jeu dans Chrome headless : erreurs JavaScript, requêtes en échec (404), avertissements, états de base
 *    (maquette chargée, base NÉANTIS, voiture, sentinelles, dispositif, carte, exploration libre, choix du personnage).
 * Sortie : liste des problèmes (rang, fichier, message) + code retour ≠ 0 s'il y en a.
 */
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url'; import os from 'node:os';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const add = (sev, where, msg) => problems.push({ sev, where, msg });
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');

/* 1. syntaxe */
const appDir = path.join(ROOT, 'app');
const files = fs.readdirSync(appDir).filter((f) => f.endsWith('.js'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
for (const f of files) {
  const t = path.join(tmp, f.replace(/\.js$/, '.mjs')); fs.copyFileSync(path.join(appDir, f), t);
  const r = spawnSync(process.execPath, ['--check', t], { encoding: 'utf8' });
  if (r.status !== 0) add('ERREUR', 'app/' + f, 'syntaxe : ' + (r.stderr || '').split('\n').find((l) => /Error/.test(l)));
}
console.log(`1. syntaxe : ${files.length} modules vérifiés`);

/* 2. index.html */
const html = read(path.join(ROOT, 'index.html'));
const refs = [...html.matchAll(/(?:src|href)="([^"#?]+)(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|mailto:|tel:)/.test(u));
let nref = 0;
for (const u of new Set(refs)) { nref++; if (!fs.existsSync(path.join(ROOT, u))) add('ERREUR', 'index.html', 'fichier référencé introuvable : ' + u); }
const scriptSrcs = [...html.matchAll(/<script[^>]+src="app\/([^"?]+)/g)].map((m) => m[1]);
const dup = scriptSrcs.filter((s, i) => scriptSrcs.indexOf(s) !== i);
dup.forEach((d) => add('AVERT.', 'index.html', 'module chargé deux fois : ' + d));
for (const f of files) {
  if (!scriptSrcs.includes(f) && !files.some((g) => g !== f && new RegExp(`['"]\\./${f.replace('.', '\\.')}`).test(read(path.join(appDir, g))))
      && !/^(i18n-en|game-screens|device-quality|aim-system|city-routes|tapama-core|drone-n-ai|game-save|player-profile|head-fade|neantis-base)\.js$/.test(f)) add('INFO', 'app/' + f, 'module jamais chargé (ni dans index.html ni importé)');
}
console.log(`2. index.html : ${nref} références vérifiées`);

/* 3 + 4. assets et imports référencés par le code */
let nasset = 0, nimp = 0;
for (const f of files) {
  const src = read(path.join(appDir, f));
  for (const m of src.matchAll(/['"`](assets\/[A-Za-z0-9_\-./ ]+\.[A-Za-z0-9]+)(?:\?[^'"`]*)?['"`]/g)) {
    nasset++; if (!fs.existsSync(path.join(ROOT, m[1]))) add('ERREUR', 'app/' + f, 'fichier introuvable : ' + m[1]);
  }
  for (const m of src.matchAll(/(?:from\s+|import\()\s*['"](\.\/[^'"?]+)(?:\?[^'"]*)?['"]/g)) {
    nimp++; if (!fs.existsSync(path.join(appDir, m[1]))) add('ERREUR', 'app/' + f, 'import introuvable : ' + m[1]);
  }
}
for (const css of fs.readdirSync(path.join(ROOT, 'styles')).filter((f) => f.endsWith('.css'))) {
  for (const m of read(path.join(ROOT, 'styles', css)).matchAll(/url\(['"]?(\.\.\/[^'")?]+)/g)) { nasset++; if (!fs.existsSync(path.join(ROOT, 'styles', m[1]))) add('ERREUR', 'styles/' + css, 'image introuvable : ' + m[1]); }
}
console.log(`3-4. ${nasset} fichiers d'assets et ${nimp} imports vérifiés`);

/* 4b. versions de scripts : un module importé avec une version différente est chargé deux fois */
const versions = {};
for (const f of [...files, '../index.html']) {
  const src = f === '../index.html' ? html : read(path.join(appDir, f));
  for (const m of src.matchAll(/(?:\.\/|app\/)([A-Za-z0-9\-]+\.js)\?v=(\d+)/g)) (versions[m[1]] = versions[m[1]] || new Set()).add(m[2]);
}
for (const [k, v] of Object.entries(versions)) if (v.size > 1) add('AVERT.', k, 'référencé avec plusieurs versions (' + [...v].join(', ') + ') : le navigateur le charge deux fois');

/* 5. tests */
const testFiles = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join('tests', f));
const tr = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: ROOT, encoding: 'utf8' });
const pass = Number((tr.stdout.match(/ℹ pass (\d+)/) || [])[1] || 0), fail = Number((tr.stdout.match(/ℹ fail (\d+)/) || [])[1] || 0);
if (fail) add('ERREUR', 'tests', `${fail} test(s) en échec`);
console.log(`5. tests unitaires : ${pass} réussis, ${fail} en échec`);

/* 6. navigateur */
if (process.argv.includes('--browser')) {
  const { createRequire } = await import('node:module');
  const require = createRequire(path.join(ROOT, 'package.json'));
  const puppeteer = require('puppeteer-core');
  const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
  const URL = process.env.AUDIT_URL || 'http://localhost:8123/index.html';
  // serveur local : démarré par l'audit s'il ne répond pas (et arrêté à la fin)
  let server = null;
  const up = () => fetch(URL).then((r) => r.ok, () => false);
  if (!(await up())) {
    const { spawn } = await import('node:child_process');
    server = spawn(process.execPath, ['_serve.cjs'], { cwd: ROOT, stdio: 'ignore' });
    for (let i = 0; i < 30 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  }
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell', protocolTimeout: 400000, args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
  const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 720 });
  const seen = new Set(); const note = (sev, w, m) => { const k = sev + w + m; if (!seen.has(k)) { seen.add(k); add(sev, w, m); } };
  page.on('pageerror', (e) => note('ERREUR', 'navigateur', 'exception : ' + String(e.message || e).slice(0, 220)));
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !/ERR_INTERNET|Failed to load resource: net::ERR/.test(t)) note('ERREUR', 'console', t.slice(0, 220)); else if (m.type() === 'warning' && /indisponible|introuvable|impossible|erreur/i.test(t)) note('AVERT.', 'console', t.slice(0, 220)); });
  page.on('response', (r) => { if (r.status() >= 400) note('ERREUR', 'réseau', r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, '')); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.MosqueScene && window.GameUI', { timeout: 300000 });
  await page.evaluate(() => { window.startMosqueScene && window.startMosqueScene(); });
  const ok = await page.waitForFunction('window.MosqueScene.loaded', { timeout: 300000 }).then(() => true, () => false);
  if (!ok) note('ERREUR', 'jeu', 'la maquette 3D ne se charge pas');
  const state = async () => page.evaluate(() => ({
    base: !!(window.NeantisBase && window.NeantisBase.loaded), voiture: !!(window.Vehicle && window.Vehicle.loaded), dispo1: !!(window.Dispositif1 && window.Dispositif1.built),
    carte: !!window.CityMap, explore: !!window.Explore, tapama: !!window.Tapama, hero: window.Hero && window.Hero.get(),
  }));
  await page.waitForFunction('window.NeantisBase && window.NeantisBase.loaded && window.Vehicle && window.Vehicle.loaded && window.Dispositif1 && window.Dispositif1.built', { timeout: 150000, polling: 1000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2000));
  const s = await state();
  for (const [k, v] of Object.entries(s)) if (!v) note('ERREUR', 'jeu', `module non initialisé : ${k}`);
  // menus
  for (const id of ['main', 'nouvelle', 'carte', 'credits', 'pause', 'options-audio', 'options-affichage', 'options-commandes', 'options-jeu', 'profil']) {
    try { await page.evaluate((id) => window.GameUI.show(id), id); await new Promise((r) => setTimeout(r, 500)); } catch (e) { note('ERREUR', 'écran ' + id, String(e.message).slice(0, 160)); }
  }
  await page.evaluate(() => window.GameUI.hide());
  // exploration libre
  try {
    const ex = await page.evaluate(async () => { const m = await import('/app/explore.js?v=2'); const ok = m.start(); await new Promise((r) => setTimeout(r, 2500)); const n = document.querySelectorAll('.xl').length; m.stop(); return { ok, n }; });
    if (!ex.n) note('ERREUR', 'exploration', 'aucune bulle de lieu affichée');
    await page.evaluate(() => window.GameUI.hide());
  } catch (e) { note('ERREUR', 'exploration', String(e.message).slice(0, 160)); }
  // sanctuaire
  try {
    await page.evaluate(async () => { await window.SanctuaryMode.enter(); });
    await page.waitForFunction(() => window.SanctuaryMode.debug().ready, { timeout: 200000, polling: 1000 }).catch(() => note('ERREUR', 'sanctuaire', 'le personnage ne se charge pas'));
    await page.waitForFunction(() => { const c = window.SanctuaryMode.vehicle.colliders(); return c && c.some((o) => /^Sol_/.test(o.name)); }, { timeout: 240000, polling: 1000 }).catch(() => note('ERREUR', 'sanctuaire', 'collisions du sol absentes'));
    await new Promise((r) => setTimeout(r, 5000));
    const d = await page.evaluate(() => { const x = window.SanctuaryMode.debug(), p = window.SanctuaryMode.playerPosition(); return { sent: x.sentinels.length, y: p.y, hp: x.playerHp, principal: x.droneNVisible }; });
    if (d.sent < 13) note('ERREUR', 'sentinelles', `${d.sent} sentinelle(s) au lieu de 13`);
    if (d.y < -2) note('ERREUR', 'sanctuaire', `le joueur est tombé sous le sol (y = ${d.y.toFixed(1)})`);
    if (d.principal) note('ERREUR', 'sanctuaire', 'le drone N d\'origine est encore visible');
    // dispositif 1 : déverrouillage de la voiture / du gadget
    const u = await page.evaluate(() => { localStorage.removeItem('taama.dispositif1'); localStorage.removeItem('taama.vol'); return { car: window.Vehicle.group().visible }; });
    await new Promise((r) => setTimeout(r, 1500));
    const car0 = await page.evaluate(() => window.Vehicle.group().visible);
    if (car0) note('ERREUR', 'voiture', 'visible alors que le premier dispositif n\'est pas récupéré');
    await page.evaluate(() => window.SanctuaryMode.exit());
  } catch (e) { note('ERREUR', 'sanctuaire', String(e.message).slice(0, 200)); }
  await browser.close(); if (server) server.kill();
  console.log(`6. navigateur : parcours terminé (${seen.size} signalement(s))`);
}

/* rapport */
const order = { ERREUR: 0, 'AVERT.': 1, INFO: 2 };
problems.sort((a, b) => order[a.sev] - order[b.sev]);
console.log('\n=== RAPPORT ===');
if (!problems.length) console.log('Aucun problème détecté.');
for (const p of problems) console.log(`[${p.sev}] ${p.where} — ${p.msg}`);
const errors = problems.filter((p) => p.sev === 'ERREUR').length;
console.log(`\n${errors} erreur(s), ${problems.filter((p) => p.sev === 'AVERT.').length} avertissement(s), ${problems.filter((p) => p.sev === 'INFO').length} info(s)`);
fs.writeFileSync(path.join(ROOT, 'tools', 'audit-rapport.json'), JSON.stringify({ date: new Date().toISOString(), problems }, null, 1));
process.exit(errors ? 1 : 0);
