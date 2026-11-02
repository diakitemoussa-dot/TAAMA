/**
 * Compare le rendu de la maquette en qualité haute (PC) et basse (mobile) :
 * captures aux mêmes points de vue + triangles réellement dessinés.
 * Prérequis : `npm run serve`. Usage : node tools/quality-compare.mjs
 * Sorties : %TEMP%\quality-<niveau>-<vue>.png
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const VIEWS = {
  ensemble: { pos: [0, 140, 230], target: [0, 10, 0] },
  arbre: { pos: [30, 28, 40], target: [33, 14, 105] },
  facade: { pos: [0, 12, 60], target: [0, 10, 0] },
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});

for (const q of (process.argv[2] ? [process.argv[2]] : ['high', 'low'])) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 640 });
  await page.goto(`http://localhost:8123/?q=${q}`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(`!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`, { timeout: 180000 });
  await page.evaluate(() => {
    for (const id of ['videoOverlay', 'boot']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    const gm = document.getElementById('gmRoot'); if (gm) gm.style.setProperty('display', 'none', 'important');
    const lo = document.getElementById('mosqueLoading'); if (lo) lo.style.setProperty('display', 'none', 'important');
    window.startMosqueScene();
    const M = window.MosqueScene; M.controls.autoRotate = false; M.controls.enabled = false;
  });
  for (const [name, v] of Object.entries(VIEWS)) {
    await page.evaluate((v) => {
      const M = window.MosqueScene;
      M.camera.position.set(...v.pos); M.controls.target.set(...v.target); M.controls.update();
      M.camera.lookAt(...v.target);
      if (M.tileStreamer) M.tileStreamer.refresh();
    }, v);
    await new Promise((r) => setTimeout(r, 6000));
    const info = await page.evaluate(() => {
      const M = window.MosqueScene; const i = M.renderer.info.render;
      return { tris: i.triangles, calls: i.calls, pr: M.renderer.getPixelRatio(), shadows: M.renderer.shadowMap.enabled };
    });
    const file = path.join(os.tmpdir(), `quality-${q}-${name}.png`);
    await page.screenshot({ path: file });
    console.log(`${q.padEnd(5)} ${name.padEnd(9)} triangles ${String(info.tris).padStart(7)}  appels ${String(info.calls).padStart(4)}  pixelRatio ${info.pr}  ombres ${info.shadows}  -> ${file}`);
  }
  await page.close();
}
await browser.close();
