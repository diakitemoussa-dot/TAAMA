/**
 * Image du personnage du menu (fond transparent) : personnage + drone sur le sac, animation idle_look.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/menu-character.mjs <sortie.png> [angle°] [t en s] [largeur] [hauteur]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [out = 'menu-character.png', angle = '20', t = '2', w = '900', h = '1200'] = process.argv.slice(2);
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: Number(w), height: Number(h) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:8123/tools/menu-character.html?angle=${angle}&t=${t}&w=${w}&h=${h}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.__ready === true', { timeout: 180000 });
console.log(JSON.stringify(await page.evaluate(() => window.__info)));
await page.screenshot({ path: out, omitBackground: true });
console.log('image :', out);
if (errors.length) console.log('ERREURS :', errors.slice(0, 5));
await browser.close();
