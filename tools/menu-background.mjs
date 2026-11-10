/**
 * Photographie la vraie scène de Djenné du jeu (ciel, nuages, brume, ombres) pour en faire
 * l'image de fond du menu principal.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/menu-background.mjs probe
 *         node tools/menu-background.mjs shot <sortie.png> [heure] [cx,cy,cz] [tx,ty,tz] [fov] [largeur] [hauteur]
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [mode = 'probe', out = 'menu-bg.png', hourArg = '17.4', posArg, tgtArg, fovArg, wArg, hArg] = process.argv.slice(2);
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const HIDE = process.env.HIDE || '';   // motif des objets à masquer (ex. arbres devant la caméra)
const W = Number(wArg) || 1920;
const H = Number(hArg) || 1080;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction(
  `!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`,
  { timeout: 180000 },
);
await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot', 'tapHint', 'mosqueLoading']) {
    const el = document.getElementById(id);
    if (el) el.style.setProperty('display', 'none', 'important');
  }
  const gm = document.getElementById('gmRoot');
  if (gm) gm.style.setProperty('display', 'none', 'important');
  const v = document.getElementById('introVideo');
  if (v) { try { v.pause(); } catch (e) {} }
  window.startMosqueScene();
});
await new Promise((r) => setTimeout(r, 8000));   // laisse charger la maquette et les tuiles

if (mode === 'names') {
  const rx = new RegExp(out, 'i');   // 2e argument = motif de recherche
  const names = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const out = [];
    window.MosqueScene.scene.traverse((o) => { if (o.name && re.test(o.name)) out.push(`${o.type}:${o.name}`); });
    return out.slice(0, 80);
  }, rx.source);
  console.log(names.join('\n'));
} else if (mode === 'probe') {
  const info = await page.evaluate(() => {
    const M = window.MosqueScene;
    const v3 = (v) => v && [v.x, v.y, v.z].map((n) => +n.toFixed(2));
    const box = M.mosqueBox;
    return {
      box: box && { min: v3(box.min), max: v3(box.max) },
      facadeTarget: v3(M.facadeTarget), facadeNormal: v3(M.facadeNormal), facadeDist: M.facadeDist,
      camera: v3(M.camera.position), target: v3(M.controls.target), fov: M.camera.fov,
      hour: window.DayCycle?.now(),
    };
  });
  console.log(JSON.stringify(info, null, 1));
} else {
  const parse = (s, d) => (s ? s.split(',').map(Number) : d);
  const cam = parse(posArg, null);
  const tgt = parse(tgtArg, null);
  await page.evaluate(({ hour, cam, tgt, fov }) => {
    const M = window.MosqueScene;
    window.DayCycle.pause();
    window.DayCycle.setTime(hour);
    window.DayCycle.setClockVisible(false);
    M.controls.autoRotate = false;
    M.controls.enabled = false;
    M.pauseLoop?.();
    if (cam) M.camera.position.set(...cam);
    if (tgt) M.controls.target.set(...tgt);
    if (fov) { M.camera.fov = fov; M.camera.updateProjectionMatrix(); }
    M.camera.lookAt(M.controls.target);
    M.camera.updateMatrixWorld(true);
  }, { hour: Number(hourArg), cam, tgt, fov: Number(fovArg) || 0 });
  await new Promise((r) => setTimeout(r, 1500));
  // Capture directe du canvas (sans les boutons du jeu). Le masquage se fait ici, une fois les tuiles chargées.
  const dataUrl = await page.evaluate((hide, asJpeg) => {
    const M = window.MosqueScene;
    if (hide) {
      const re = new RegExp(hide, 'i');
      M.scene.traverse((o) => { if (o.name && re.test(o.name)) o.visible = false; });
    }
    M.renderer.render(M.scene, M.camera);
    return M.renderer.domElement.toDataURL(asJpeg ? 'image/jpeg' : 'image/png', 0.92);
  }, HIDE, /\.jpe?g$/i.test(out));
  fs.writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('image :', out);
}
if (pageErrors.length) console.log('ERREURS JS :', pageErrors.slice(0, 5));
await browser.close();
