/**
 * Vérifie le rendu des tuiles dans un vrai Chrome (WebGL SwiftShader).
 * - capture les logs console + erreurs de page
 * - attend window.__done (ou un délai max)
 * - écrit une capture d'écran
 *
 * Usage : node tools/browser-check.mjs [url] [capture.png]
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const URL_ = process.argv[2] || 'http://localhost:8123/tests/tiles-check.html';
const SHOT = process.argv[3] || path.join(process.env.TEMP, 'tiles-check.png');

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: [
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--no-sandbox',
    '--window-size=900,620',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 });

const lines = [];
page.on('console', (m) => { lines.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => { lines.push(`[pageerror] ${e.message}`); });
page.on('requestfailed', (r) => {
  const f = r.failure();
  lines.push(`[requestfailed] ${r.url()} — ${f ? f.errorText : '?'}`);
});

const t0 = Date.now();
try {
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction('window.__done === true', { timeout: 120000 });
} catch (e) {
  lines.push(`[timeout] ${e.message} après ${Math.round((Date.now() - t0) / 1000)} s`);
}

const text = await page.evaluate(() => document.getElementById('out')?.textContent || '');
const title = await page.title();
await page.screenshot({ path: SHOT });
await browser.close();

console.log(text.trim());
console.log('--- console ---');
console.log(lines.join('\n') || '(rien)');
console.log(`--- titre : ${title} · capture : ${SHOT} · ${Math.round((Date.now() - t0) / 1000)} s`);
