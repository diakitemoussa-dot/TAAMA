/**
 * Vérification de l'IA de la Sentinelle NEXUS (drone N) dans Chrome.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/drone-n-ai-check.mjs
 * Sortie : code 1 si une vérification échoue.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
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
page.on('console', (m) => { if (m.type() === 'warning' && /Sanctuaire/.test(m.text())) console.log(`  [warn] ${m.text()}`); });

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const dbg = () => page.evaluate(() => window.SanctuaryMode.debug());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Le temps de jeu avance par image (dt plafonné) : on attend un état, pas une durée.
const waitAi = (state, timeout = 120000) =>
  page.waitForFunction(`window.SanctuaryMode.debug().droneNAi === '${state}'`, { timeout });

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

// Joueur loin de la Sentinelle : elle patrouille sans le voir.
const d0 = await dbg();
await page.evaluate((p) => window.SanctuaryMode.debugTeleport(p[0] + 40, p[1], p[2] + 40), d0.pos);
const floorY = d0.pos[1];   // hauteur de la plateforme de départ
await waitAi('PATROL');
const p1 = (await dbg()).droneNPos;
await page.waitForFunction(
  `(() => { const p = window.SanctuaryMode.debug().droneNPos; return Math.hypot(p[0] - ${p1[0]}, p[2] - ${p1[2]}) > 1.0; })()`,
  { timeout: 120000 },
);
const dPat = await dbg();
check('patrouille : la Sentinelle se déplace sans voir le joueur', dPat.droneNAi === 'PATROL');
check('patrouille : aucun tir (joueur vivant)', dPat.dying === false);

// Joueur 3 m devant la Sentinelle (dans son cône) : elle doit quitter la patrouille.
// La plateforme de départ est limitée : si le point visé est au-delà du bord, le joueur
// retombe plus bas (hors de vue) et on réessaie quand le drone a changé de cap.
let dSeen = null;
for (let i = 0; i < 12; i++) {
  const d = await dbg();
  if (d.droneNAi !== 'PATROL') { dSeen = d; break; }
  if (d.pos[1] > floorY - 0.5) {
    await page.evaluate((a) => {
      window.SanctuaryMode.debugTeleport(a.p[0] + Math.sin(a.y) * 3, a.f, a.p[2] + Math.cos(a.y) * 3);
    }, { p: d.droneNPos, y: d.droneNYaw, f: floorY });
  } else {
    await page.evaluate((a) => window.SanctuaryMode.debugTeleport(a.p[0], a.f, a.p[2] - 3), { p: d.droneNPos, f: floorY });
  }
  await sleep(4000);
}
check('détection : la Sentinelle quitte la patrouille quand le joueur est dans son cône',
  !!dSeen, dSeen ? `état ${dSeen.droneNAi}` : 'toujours en PATROL');
if (!dSeen) { await browser.close(); process.exit(1); }

// En engagement, la Sentinelle tire des balles traçantes (projectiles, pas un rayon instantané).
await page.waitForFunction('window.SanctuaryMode.debug().droneNShots >= 1', { timeout: 120000 });
const dShot = await dbg();
check('tir : au moins une balle traçante tirée', dShot.droneNShots >= 1, `${dShot.droneNShots} tir(s)`);

// Une balle ne tue plus : le joueur perd des points de vie et n'est neutralisé qu'à zéro.
await page.waitForFunction('window.SanctuaryMode.debug().playerHp < 6', { timeout: 180000 });
const dHit = await dbg();
check('dégâts : une balle retire des points de vie sans tuer', dHit.playerHp >= 1 ? dHit.dying === false : true,
  `PV ${dHit.playerHp}/6, neutralisé ${dHit.dying}`);

// Tir du gadget : impulsion d'énergie, dégâts à l'arrivée (aucune erreur attendue).
await page.evaluate(() => { try { window.SanctuaryMode.shoot(false); } catch (e) { console.error(e); } });
await sleep(1500);

// Joueur à nouveau hors de portée : recherche puis retour à la patrouille.
await page.evaluate(() => {
  const d = window.SanctuaryMode.debug();
  window.SanctuaryMode.debugTeleport(d.pos[0] + 60, d.pos[1], d.pos[2] + 60);
});
await waitAi('SEARCH');
check('perte de vue : état SEARCH', true);
await waitAi('PATROL');
check('recherche épuisée : retour en PATROL', true);

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.join(' | ').slice(0, 300));
await browser.close();
if (failures.length) { console.log(`\n${failures.length} vérification(s) en échec`); process.exit(1); }
console.log('\nToutes les vérifications passent.');
