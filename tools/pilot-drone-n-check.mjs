/**
 * Vérifie que le drone N reste visible quand le joueur pilote son drone (mode game).
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/pilot-drone-n-check.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const S_FPS = 3;

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
  `(() => { const d = window.SanctuaryMode.debug(); return d.state === ${S_FPS} && d.ready && d.droneN; })()`,
  { timeout: 180000 },
);
check('sanctuaire : drone N visible', (await dbg()).droneNVisible === true);

// Décollage du drone du sac : on passe en mode pilotage.
await page.evaluate(() => window.SanctuaryMode.takeoffDrone());
await page.waitForFunction('window.SanctuaryMode.debug().pilotHold === true', { timeout: 180000 });
await sleep(2000);
const pilot = await dbg();
check('pilotage : drone N toujours visible', pilot.droneNVisible === true);

// Il continue de patrouiller (sans tirer) pendant le pilotage.
const p0 = pilot.droneNPos;
await page.waitForFunction(
  `(() => { const p = window.SanctuaryMode.debug().droneNPos; return Math.hypot(p[0] - ${p0[0]}, p[2] - ${p0[2]}) > 0.5; })()`,
  { timeout: 120000 },
);
const moved = await dbg();
check('pilotage : drone N en patrouille', moved.droneNAi === 'PATROL', `état ${moved.droneNAi}`);
check('pilotage : aucun tir contre le joueur', moved.playerHp === 6 && moved.droneNBullets === 0, `PV ${moved.playerHp}, balles ${moved.droneNBullets}`);

// Capture du mode pilotage : la taille du drone piloté se juge à l'œil, à côté du personnage.
const shotPath = `${process.env.TEMP || '.'}/pilot-drone.png`;
await page.screenshot({ path: shotPath });
console.log(`  capture : ${shotPath}`);

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
await browser.close();
if (failures.length) { console.log(`\n${failures.length} vérification(s) en échec`); process.exit(1); }
console.log('\nToutes les vérifications passent.');
