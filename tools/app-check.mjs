/**
 * Test de l'expérience réelle (streaming spatial) dans Chrome.
 * Usage : node tools/app-check.mjs [options] → captures + stats
 *   --tiles=0   pour comparer avec l'ancien chargement monolithique
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const TILES = process.argv.includes('--tiles=0') ? '0' : '1';
const SUFFIX = TILES === '0' ? 'mono' : 'stream';
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

const logs = [];
const requests = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });
page.on('request', (r) => {
  const u = r.url();
  if (/\.(gltf|bin|glb|webp)(\?|$)/.test(u)) requests.push(u.replace(/^.*\/mosquee-djenne-copie\//, ''));
});

await page.goto(`http://localhost:8123/?tiles=${TILES}${TILES === '0' ? '' : '&streaming=1'}`, { waitUntil: 'domcontentloaded' });

// attendre l'init du module + le chargement du cœur
await page.waitForFunction(
  `(() => {
     if (${TILES === '0'}) return !!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'));
     const s = window.MosqueScene && window.MosqueScene.tileStreamer;
     return s && s.tiles.length > 0 && s.stats().loaded > 0;
   })()`,
  { timeout: 120000 },
);

// masquer les overlays d'intro + le menu, démarrer la scène
await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  // masquer tout le contenu du menu sauf le canvas de la maquette
  const stageUi = document.getElementById('stage');
  if (stageUi) {
    for (const el of stageUi.children) {
      if (el.id !== 'mosqueStage') el.style.setProperty('display', 'none', 'important');
    }
  }
  const gm = document.getElementById('gmRoot');
  if (gm) gm.style.setProperty('display', 'none', 'important');
  const lo = document.getElementById('mosqueLoading');
  if (lo) lo.style.setProperty('display', 'none', 'important');
  const v = document.getElementById('introVideo');
  if (v) { try { v.pause(); } catch (e) {} }
  window.startMosqueScene();
});

const stats = async (label) => {
  const s = await page.evaluate(() => {
    const st = window.MosqueScene?.tileStreamer;
    const info = window.MosqueScene?.renderer?.info?.render;
    return {
      tile: st ? st.stats() : null,
      cam: window.MosqueScene?.camera.position.toArray().map((v) => Math.round(v)),
      tris: info ? info.triangles : null,
      calls: info ? info.calls : null,
      loadedNames: st ? st.tiles.filter((t) => t.state === 'loaded').map((t) => t.id) : [],
    };
  });
  console.log(`\n[${label}] caméra ${s.cam} · ${s.tris?.toLocaleString('fr-FR')} tris dessinés · ${s.calls} draw calls`);
  if (s.tile) console.log(`  tuiles ${s.tile.loaded}/${s.tile.total} · ${(s.tile.bytes / 1048576).toFixed(2)} Mo · requêtes ${s.tile.requests}`);
  return s;
};

await new Promise((r) => setTimeout(r, 8000));
let s = await stats('vue initiale');
const shot1 = path.join(process.env.TEMP, `app-${SUFFIX}-1.png`);
await page.screenshot({ path: shot1 });

// animation des nuages : la position doit évoluer (clip du cœur)
const cloud = await page.evaluate(async () => {
  const M = window.MosqueScene;
  let c = null;
  M.scene.traverse((o) => { if (!c && /Cloud/i.test(o.name)) c = o; });
  if (!c) return null;
  const before = c.position.clone();
  await new Promise((r) => setTimeout(r, 1200));
  return { name: c.name, delta: +before.distanceTo(c.position).toFixed(3) };
});
console.log('  nuage :', cloud ? `${cloud.name} · déplacement ${cloud.delta}` : 'introuvable');

// déplacement volontaire de la caméra dans un coin éloigné : de nouvelles tuiles
// doivent être demandées, les plus lointaines libérées.
const before = s.loadedNames;
await page.evaluate(() => {
  const M = window.MosqueScene;
  M.camera.position.set(-170, 55, -190);
  M.controls.target.set(0, 10, 0);
  M.controls.update();
  M.tileStreamer?.refresh();
});
await new Promise((r) => setTimeout(r, 6000));
s = await stats('après déplacement');
const unloaded = before.filter((id) => !s.loadedNames.includes(id));
console.log(`  tuiles déchargées depuis la vue initiale : ${unloaded.length ? unloaded.join(', ') : 'aucune'}`);
const shot2 = path.join(process.env.TEMP, `app-${SUFFIX}-2.png`);
await page.screenshot({ path: shot2 });

// tester un retour (déchargement des tuiles lointaines)
await page.evaluate(() => {
  const M = window.MosqueScene;
  M.camera.position.set(280, 90, 300);
  M.controls.target.set(0, 10, 0);
  M.controls.update();
  M.tileStreamer?.refresh();
});
await new Promise((r) => setTimeout(r, 6000));
s = await stats('retour vue large');
const shot3 = path.join(process.env.TEMP, `app-${SUFFIX}-3.png`);
await page.screenshot({ path: shot3 });

if (s.tile) {
  const idle = s.loadedNames.length;
  console.log(`  tuiles encore en mémoire : ${idle} (libérées : ${s.tile.total - idle})`);
}

await browser.close();

console.log('\n--- requêtes tuiles/modèles (ordre) ---');
console.log(requests.join('\n'));
console.log('\n--- console ---');
console.log(logs.slice(-25).join('\n') || '(rien)');
console.log(`\ncaptures : ${shot1} · ${shot2} · ${shot3}`);
