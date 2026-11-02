import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[err]', m.text()); });
await page.goto('http://localhost:8123/?streaming=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('window.MosqueScene?.tileStreamer?.tiles.length > 0', { timeout: 120000 });
await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot']) document.getElementById(id)?.style.setProperty('display', 'none', 'important');
  document.getElementById('gmRoot')?.style.setProperty('display', 'none', 'important');
  document.getElementById('mosqueLoading')?.style.setProperty('display', 'none', 'important');
  window.startMosqueScene();
});
await new Promise((r) => setTimeout(r, 6000));

const info = await page.evaluate(() => {
  const stage = document.getElementById('mosqueStage');
  const cs = getComputedStyle(stage);
  const top = document.elementFromPoint(500, 320);
  const canvas = document.getElementById('mosqueCanvas');
  const ccs = getComputedStyle(canvas);
  const r = canvas.getBoundingClientRect();
  return {
    stageClass: stage.className, stageOpacity: cs.opacity, stageDisplay: cs.display, stageZ: cs.zIndex,
    canvas: { w: canvas.width, h: canvas.height, rect: [r.x, r.y, r.width, r.height], opacity: ccs.opacity, display: ccs.display },
    topAtCenter: top ? (top.id || top.className || top.tagName) : null,
    bodyClass: document.body.className,
    hud: document.getElementById('streamingHud')?.textContent,
    renderer: (() => { const r = window.MosqueScene?.renderer; return r ? { w: r.domElement.width, h: r.domElement.height, pr: r.getPixelRatio() } : null; })(),
    sceneChildren: window.MosqueScene?.scene.children.map((o) => `${o.name || o.type}(${o.visible})`),
  };
});
console.log(JSON.stringify(info, null, 2));

const canvas = await page.$('#mosqueCanvas');
await canvas.screenshot({ path: path.join(process.env.TEMP, 'canvas-only.png') });
await page.screenshot({ path: path.join(process.env.TEMP, 'page-full.png') });
await browser.close();
console.log('captures ok');
