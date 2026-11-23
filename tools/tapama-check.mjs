/**
 * Vérifie dans Chrome les écrans de Tapama (dialogue, radio, analyse, aide).
 * Prérequis : npm run serve (port 8123).
 * Usage : node tools/tapama-check.mjs [dossier-captures]
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const OUT = process.argv[2] || process.env.TEMP;
const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  protocolTimeout: 240000,   // la scène 3D en rendu logiciel peut saturer le navigateur
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const logs = [];
// Les écrans de Tapama ne dépendent pas de la scène 3D : on bloque les modèles
// (gros, rendu logiciel) pour un test rapide et déterministe.
const BLOCKED = /\/assets\/models\/|\.(glb|gltf|bin)(\?|$)/;
await page.setRequestInterception(true);
page.on('request', (r) => (BLOCKED.test(r.url()) ? r.abort() : r.continue()));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource|ERR_FAILED|net::/.test(m.text())) return;   // modèles bloqués
  logs.push(`[error] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !BLOCKED.test(r.url())) logs.push(`[http ${r.status()}] ${r.url()}`); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => {
  const p = path.join(OUT, `tapama-${name}.png`);
  await page.screenshot({ path: p });
  console.log('  capture', p);
};
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('ok -', msg); };

async function run(label, w, h) {
  console.log(`\n=== ${label} (${w}×${h}) ===`);
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.Tapama', { timeout: 60000 });
  await page.evaluate(() => {
    for (const id of ['videoOverlay', 'boot']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    // Tapama est testé seul : on ferme l'écran de lancement (qui garderait le clavier)
    if (window.GameUI && window.GameUI.hide) window.GameUI.hide();
  });

  // --- dialogue ---
  await page.evaluate(() => window.Tapama.play('appel'));
  await wait(700);
  ok(await page.evaluate(() => window.Tapama.isBusy()), 'le dialogue bloque le jeu');
  ok(await page.evaluate(() => document.querySelector('.tp-d-text').textContent.includes('J’ai découvert')), 'première réplique affichée');
  ok(await page.evaluate(() => document.querySelector('.tp-d-portrait').src.endsWith('tapama-neutre.webp')), 'portrait neutre');
  ok(await page.evaluate(() => document.querySelector('.tp-d-portrait').complete && document.querySelector('.tp-d-portrait').naturalWidth > 0), 'portrait chargé');
  await shot(`${label}-1-dialogue`);

  await wait(300);
  await page.keyboard.press('Enter');
  await wait(300);
  ok(await page.evaluate(() => document.querySelector('.tp-dialogue').classList.contains('is-player')), 'réplique du joueur (portrait atténué)');
  await shot(`${label}-2-reponse`);

  await page.keyboard.press('h');
  await wait(200);
  ok(await page.evaluate(() => !!document.querySelector('.tp-history')), 'historique ouvert avec H');
  await shot(`${label}-3-historique`);
  await page.keyboard.press('h');
  await wait(150);
  await page.keyboard.press('Enter');
  await wait(300);
  ok(await page.evaluate(() => document.querySelector('.tp-d-portrait').src.endsWith('tapama-inquiete.webp')), 'portrait inquiète sur la 3e réplique');
  ok(await page.evaluate(() => document.querySelector('.tp-d-next .tp-lbl').textContent === 'Terminer'), 'bouton « Terminer » à la dernière réplique');

  const ended = page.evaluate(() => new Promise((res) => window.addEventListener('tapama:dialogue-end', (e) => res(e.detail), { once: true })));
  await page.keyboard.press('Enter');
  const detail = await ended;
  ok(detail.id === 'appel' && detail.skipped === false, 'fin de dialogue signalée (non passée)');
  await wait(500);
  ok(!(await page.evaluate(() => window.Tapama.isBusy())), 'le jeu est débloqué');

  // passer avec Échap
  await page.evaluate(() => window.Tapama.play('vol'));
  await wait(500);
  const skipped = page.evaluate(() => new Promise((res) => window.addEventListener('tapama:dialogue-end', (e) => res(e.detail), { once: true })));
  await page.keyboard.press('Escape');
  ok((await skipped).skipped === true, 'Échap passe le dialogue');
  await wait(450);

  // --- radio ---
  await page.evaluate(() => window.Tapama.radio(window.Tapama.RADIO.suivre));
  await wait(500);
  ok(await page.evaluate(() => document.querySelector('.tp-radio').classList.contains('on')), 'appel radio affiché');
  ok(!(await page.evaluate(() => window.Tapama.isBusy())), 'la radio ne bloque pas le jeu');
  await wait(1200);
  ok(await page.evaluate(() => parseFloat(document.querySelector('.tp-r-bar span').style.width) > 0), 'barre de durée qui avance');
  await shot(`${label}-4-radio`);

  // --- analyse ---
  await page.evaluate(() => window.Tapama.analyse('projection'));
  await wait(500);
  await shot(`${label}-5-analyse`);
  await page.keyboard.press('Enter');
  await wait(400);
  ok(await page.evaluate(() => window.Tapama.journal().length === 1), 'indice ajouté au journal');
  await page.evaluate(() => window.Tapama.analyse('projection'));
  await wait(400);
  await page.keyboard.press('Enter');
  await wait(300);
  ok(await page.evaluate(() => window.Tapama.journal().length === 1), 'pas de doublon dans le journal');

  // --- aide ---
  await page.keyboard.press('h');
  await wait(500);
  ok(await page.evaluate(() => !!document.querySelector('.tp-help.on')), 'aide ouverte avec H');
  await shot(`${label}-6-aide`);
  await page.keyboard.press('2');
  await wait(300);
  ok(await page.evaluate(() => document.querySelector('.tp-h-img').src.endsWith('tapama-attentive.webp')), 'niveau 2 : portrait attentif');
  await page.keyboard.press('3');
  await wait(300);
  ok(await page.evaluate(() => document.querySelector('.tp-h-img').src.endsWith('tapama-curieuse.webp')), 'niveau 3 : portrait curieux');
  await shot(`${label}-7-aide-niveau3`);
  await page.keyboard.press('Escape');
  await wait(450);
  ok(!(await page.evaluate(() => window.Tapama.isBusy())), 'aide fermée avec Échap');

  // --- menu : entrée « appel de Tapama » ---
  ok(await page.evaluate(() => !!document.getElementById('gmTapama')), 'entrée « L’appel de Tapama » dans le menu');
}

try {
  await run('pc', 1280, 720);
  await run('tel', 390, 844);
} finally {
  await browser.close();
}
console.log('\n--- console (erreurs) ---');
console.log(logs.join('\n') || '(aucune)');
