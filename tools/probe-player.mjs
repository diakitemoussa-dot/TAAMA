/**
 * Diagnostic : échelle du modèle du joueur et position de la tête dans le jeu (mode Sanctuaire).
 * Prérequis : `npm run serve`. Usage : node tools/probe-player.mjs
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640 });
await page.goto('http://localhost:8123/?tiles=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(`!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`, { timeout: 120000 });
await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  const gm = document.getElementById('gmRoot'); if (gm) gm.style.setProperty('display', 'none', 'important');
  const lo = document.getElementById('mosqueLoading'); if (lo) lo.style.setProperty('display', 'none', 'important');
  window.startMosqueScene();
});
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.SanctuaryMode.enter());
await page.waitForFunction(`(() => { const d = window.SanctuaryMode.debug(); return d.state === 3 && d.ready; })()`, { timeout: 180000 });
const d = await page.evaluate(() => window.SanctuaryMode.debug());
const feet = d.rootPos;
const r = (a) => a.map((v) => +v.toFixed(3));
console.log('modelScale', d.modelScale, '| rootPos', r(feet), '| rootYaw', +d.rootYaw.toFixed(3));
console.log('tête (monde)', r(d.headPos), '| tête relative aux pieds', r(d.headPos.map((v, i) => v - feet[i])));
await browser.close();
