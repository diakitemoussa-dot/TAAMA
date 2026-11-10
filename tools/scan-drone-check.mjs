/**
 * Vérifie que les zones de scan du sanctuaire ne se déclenchent plus à pied,
 * mais seulement quand le joueur les survole avec son drone.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/scan-drone-check.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const S_FPS = 3;
const ENTREE_POS = [22.411, 6.2587, 9.3035];   // même point que ENTREE_POS de sanctuary-mode.js

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640 });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const dbg = () => page.evaluate(() => window.SanctuaryMode.debug());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const frames = (n) => page.evaluate((k) => new Promise((res) => {
  let i = 0;
  const f = () => (++i >= k ? res() : requestAnimationFrame(f));
  requestAnimationFrame(f);
}), n);

await page.goto('http://localhost:8123/?tiles=0', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(
  `!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`,
  { timeout: 120000 },
);
await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot', 'tapHint']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const gm = document.getElementById('gmRoot');
  if (gm) gm.style.setProperty('display', 'none', 'important');
  const lo = document.getElementById('mosqueLoading');
  if (lo) lo.style.setProperty('display', 'none', 'important');
  const v = document.getElementById('introVideo');
  if (v) { try { v.pause(); } catch (e) {} }
  window.startMosqueScene();
});
await sleep(3000);
await page.evaluate(() => window.SanctuaryMode.enter());
await page.waitForFunction(
  `(() => { const d = window.SanctuaryMode.debug(); return d.state === ${S_FPS} && d.ready; })()`,
  { timeout: 180000 },
);

// À pied, dans la zone de l'entrée : aucune analyse ne démarre.
await page.evaluate((p) => window.SanctuaryMode.debugTeleport(p[0], p[1], p[2]), ENTREE_POS);
await frames(90);
const walk = await dbg();
check('à pied dans la zone : aucun scan ne se déclenche', Object.values(walk.scans).every((s) => s === 'idle'),
  JSON.stringify(walk.scans));

// Avec le drone : le décollage depuis cette position survole la zone et lance l'analyse.
await page.evaluate(() => window.SanctuaryMode.takeoffDrone());
await page.waitForFunction('window.SanctuaryMode.debug().pilotHold === true', { timeout: 180000 });
await page.waitForFunction(
  `['scanning', 'result'].includes(window.SanctuaryMode.debug().scans.entree)`,
  { timeout: 180000 },
);
const fly = await dbg();
check('avec le drone au-dessus de la zone : le scan démarre', ['scanning', 'result'].includes(fly.scans.entree), fly.scans.entree);
await page.waitForFunction(`window.SanctuaryMode.debug().scans.entree === 'result'`, { timeout: 180000 });
check('avec le drone : l\'analyse va jusqu\'au résultat', true);

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
await browser.close();
if (failures.length) { console.log(`\n${failures.length} vérification(s) en échec`); process.exit(1); }
console.log('\nToutes les vérifications passent.');
