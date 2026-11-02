/**
 * Vérification de la visée précise (mode Sanctuaire) dans Chrome.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/aim-check.mjs
 * Sortie : captures dans %TEMP% (aim-off-0.png, aim-on.png, aim-off-1.png), code 1 si une vérification échoue.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';
import * as Aim from '../app/aim-system.js';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const TMP = process.env.TEMP || '.';
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
page.on('console', (m) => { if (m.type() === 'error' && /THREE.WebGLProgram|Shader Error/.test(m.text())) pageErrors.push(`[shader] ${m.text().slice(0, 300)}`); });
page.on('console', (m) => { if (m.type() === 'warning' && /Sanctuaire/.test(m.text())) console.log(`  [warn] ${m.text()}`); });

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = () => page.evaluate(() => window.SanctuaryMode.debug());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const shot = async (name) => {
  const p = path.join(TMP, name);
  await page.screenshot({ path: p });
  console.log(`  capture : ${p}`);
};

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
  `(() => { const d = window.SanctuaryMode.debug(); return d.state === ${S_FPS} && d.ready; })()`,
  { timeout: 180000 },
);
await sleep(1500);

// --- Hors visée -----------------------------------------------------------
let d0 = await dbg();
check('hors visée : aiming = false', d0.aiming === false);
check('hors visée : caméra en 3e personne (> 2,5 m du joueur)', dist(d0.camPos, d0.pos) > 2.5, `distance ${dist(d0.camPos, d0.pos).toFixed(2)} m`);
const baseFov = d0.fov;
const baseNear = d0.near;
check('hors visée : plan de coupe proche = valeur de base (0,5 ±1e-3)', Math.abs(d0.near - 0.5) < 1e-3, `near ${d0.near}`);
check('hors visée : headFade = 0', d0.headFade === 0, `headFade ${d0.headFade}`);
check('dissolution tête : os de la tête trouvés (headFadeOk)', d0.headFadeOk === true);
check('headFade(0.575) ≈ 0,5 (cohérence du fondu intermédiaire)', Math.abs(Aim.headFade(0.575) - 0.5) < 1e-9, `${Aim.headFade(0.575)}`);
await shot('aim-off-0.png');
// Preuve visuelle de la dissolution : fondu forcé hors visée (3e personne)
const twoFrames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await page.evaluate(() => window.SanctuaryMode.debugForceHeadFade(0));
await twoFrames();
await shot('head-fade-0.png');
await page.evaluate(() => window.SanctuaryMode.debugForceHeadFade(1));
await twoFrames();
await shot('head-fade-1.png');
await page.evaluate(() => window.SanctuaryMode.debugForceHeadFade(0.5));
await twoFrames();
await shot('head-fade-half.png');
await page.evaluate(() => window.SanctuaryMode.debugForceHeadFade(null));
await twoFrames();

// --- Visée (clic droit maintenu) ------------------------------------------
await page.mouse.move(500, 320);
await page.mouse.down({ button: 'right' });
// Le temps de jeu avance par image (dt plafonné à 0,05 s) : en rendu logiciel
// il passe plus lentement que le temps réel, donc on attend l'état, pas une durée.
await page.waitForFunction('window.SanctuaryMode.debug().aimBlend === 1', { timeout: 120000 });
// Le corps lisse sa rotation vers camYaw + 23,4° : on attend qu'il ait fini de tourner.
await page.waitForFunction(
  `(() => { const d = window.SanctuaryMode.debug(); const e = d.rootYaw - (d.camYaw + 0.4083); return Math.abs(Math.atan2(Math.sin(e), Math.cos(e))) < 0.02; })()`,
  { timeout: 120000 },
);
await sleep(1500);
const d1 = await dbg();
check('visée : aiming = true', d1.aiming === true);
check('visée : fondu terminé', d1.aimBlend === 1, `aimBlend ${d1.aimBlend}`);
check('visée : plan de coupe proche = 0,06 (±1e-3)', Math.abs(d1.near - Aim.AIM_NEAR) < 1e-3, `near ${d1.near}`);
check('visée : plan de coupe proche = 0,06 (constante AIM_NEAR)', Aim.AIM_NEAR === 0.06);
check('visée : tête dissoute (headFade = 1)', d1.headFade === 1 && d1.headFadeOk === true, `headFade ${d1.headFade}, ok ${d1.headFadeOk}`);
const aspect = 1000 / 640;
const expFov = 2 * Math.atan(Math.tan((46.938 * Math.PI / 180) / 2) / aspect) * 180 / Math.PI;
check('visée : FOV de la caméra Blender (46,938° horizontal)', Math.abs(d1.fov - expFov) < 0.3, `fov ${d1.fov?.toFixed(2)} (attendu ${expFov.toFixed(2)}, base ${baseFov})`);
const dx = d1.camPos[0] - d1.rootPos[0], dy = d1.camPos[1] - d1.rootPos[1], dz = d1.camPos[2] - d1.rootPos[2];
const cy = Math.cos(d1.rootYaw), sy = Math.sin(d1.rootYaw);
const lx = dx * cy - dz * sy, lz = dx * sy + dz * cy, ly = dy;
const ms = d1.modelScale || 1;
const expCam = [0.0721 * ms, 1.5082 * ms, -0.1715 * ms];
check('visée : caméra rigide à AIM_CAM_LOCAL x échelle du modèle (±0,05 m)',
  Math.abs(lx - expCam[0]) < 0.05 && Math.abs(ly - expCam[1]) < 0.05 && Math.abs(lz - expCam[2]) < 0.05,
  `local (${lx.toFixed(3)}, ${ly.toFixed(3)}, ${lz.toFixed(3)}) attendu (${expCam.map((v) => v.toFixed(3)).join(', ')}), échelle ${ms.toFixed(3)}`);
const ey = d1.rootYaw - d1.camYaw;
const bodyYaw = Math.atan2(Math.sin(ey), Math.cos(ey));
check('visée : le corps est tourné de 23,4° par rapport à la visée', Math.abs(bodyYaw - 0.4083) < 0.03, `${(bodyYaw * 180 / Math.PI).toFixed(2)}°`);
check('visée : aucun tir latéral parasite', d1.shooting === false && d1.sideShot === false);
const reticleVisible = await page.evaluate(() => getComputedStyle(document.getElementById('snAimReticle')).display !== 'none');
check('visée : réticule affiché', reticleVisible);
check('visée : posture tenue (couche haute figée)', d1.aimHold === true && d1.upperPaused === true && d1.shooting === false,
  `aimHold ${d1.aimHold}, upperPaused ${d1.upperPaused}, shooting ${d1.shooting}`);
check("visée : jambes à l'arrêt = idle", d1.lower === 'idle', `lower ${d1.lower}`);
// Position des mains et de la bouche du gadget dans le repère de la caméra (x droite, y haut, -z devant),
// valeurs de référence mesurées dans Blender à l'image 1 (mètres Blender) x échelle du modèle.
// ATTENTION : l'objet Camera de Blender a une échelle de 1,4819 ; les valeurs brutes (matrix_world.inverted())
// sont divisées par cette échelle. On les ramène donc en mètres réels (x CAM_BLENDER_SCALE).
const CAM_BLENDER_SCALE = 1.4819;
for (const [label, got, ref, tol] of [
  ['main droite', d1.rightHandCam, [0.002, -0.118, -0.517], 0.05],
  ['main gauche', d1.leftHandCam, [-0.032, -0.119, -0.501], 0.05],
  ['bouche du gadget', d1.muzzleCam, [-0.020, -0.080, -0.672], 0.07],
]) {
  const exp = ref.map((v) => v * CAM_BLENDER_SCALE * ms);
  const err = got ? Math.hypot(got[0] - exp[0], got[1] - exp[1], got[2] - exp[2]) : Infinity;
  check(`visée : ${label} dans le repère caméra (±${tol} m)`, err <= tol,
    got ? `mesuré (${got.map((v) => v.toFixed(3)).join(', ')}) attendu (${exp.map((v) => v.toFixed(3)).join(', ')}) écart ${err.toFixed(3)} m` : 'indisponible');
}
await shot('aim-on.png');

// --- Le canon suit le viseur (souris vers le haut puis vers le bas, clic droit maintenu) -----
const settle = async () => {
  let prev = (await dbg()).camPitch;
  for (let i = 0; i < 600; i++) {
    await twoFrames();
    const cur = (await dbg()).camPitch;
    if (Math.abs(cur - prev) < 1e-4) {
      // un second relevé espacé d'une image confirme la stabilité
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      const cur2 = (await dbg()).camPitch;
      if (Math.abs(cur2 - cur) < 1e-4) return;
    }
    prev = cur;
  }
};
const p0 = await dbg();
const handsDrift = (a, b) => ['rightHandCam', 'leftHandCam', 'muzzleCam'].map((k) => (a[k] && b[k] ? dist(a[k], b[k]) : Infinity));
let pPrev = p0;
for (const [name, y, file, sign] of [['haut', 230, 'aim-pitch-up.png', 1], ['bas', 410, 'aim-pitch-down.png', -1]]) {
  if (sign === -1) { await page.mouse.move(500, 320); }
  await page.mouse.move(500, y, { steps: 5 });
  await page.waitForFunction(`window.SanctuaryMode.debug().camPitch ${sign > 0 ? '>=' : '<='} ${pPrev.camPitch + sign * 0.15}`, { timeout: 120000 });
  await settle();
  const pn = await dbg();
  const dCam = pn.camPitch - p0.camPitch, dBar = pn.barrelPitch - p0.barrelPitch;
  check(`canon suit le viseur (${name}) : |Δ tangage canon - Δ tangage caméra| < 0,06 rad`, Math.abs(dBar - dCam) < 0.06,
    `Δcaméra ${dCam.toFixed(3)} rad, Δcanon ${dBar.toFixed(3)} rad (tangage canon ${p0.barrelPitch.toFixed(3)} -> ${pn.barrelPitch.toFixed(3)})`);
  const dr = handsDrift(p0, pn);
  check(`gadget fixe à l'écran (${name}) : mains et bouche bougent de < 0,04 m`, dr.every((v) => v < 0.04),
    `main droite ${dr[0].toFixed(3)} m, main gauche ${dr[1].toFixed(3)} m, bouche ${dr[2].toFixed(3)} m`);
  await shot(file);
  pPrev = pn;
  if (sign === 1) pPrev = { camPitch: pn.camPitch };
}
await page.mouse.move(500, 320);
await settle();

// --- Capture large (2000x660) : bras et mains ne doivent plus être tranchés ---------------
{
  const fovBefore = (await dbg()).fov;
  await page.setViewport({ width: 2000, height: 660 });
  await page.waitForFunction(`Math.abs(window.SanctuaryMode.debug().fov - ${fovBefore}) > 0.5`, { timeout: 120000 });
  const pitchBefore = (await dbg()).camPitch;
  await page.mouse.move(500, 320);
  await page.mouse.move(500, 410, { steps: 5 });
  await page.waitForFunction('window.SanctuaryMode.debug().camPitch <= ' + (pitchBefore - 0.15), { timeout: 120000 });
  await settle();
  const dwd = await dbg();
  check('capture large : plan de coupe proche toujours à 0,06', Math.abs(dwd.near - Aim.AIM_NEAR) < 1e-3, `near ${dwd.near}`);
  await shot('aim-wide.png');
  await page.setViewport({ width: 1000, height: 640 });
  await page.waitForFunction(`Math.abs(window.SanctuaryMode.debug().fov - ${fovBefore}) < 0.05`, { timeout: 120000 });
  await page.mouse.move(500, 410);
  await page.mouse.move(500, 320, { steps: 5 });
  await settle();
}

// --- Impression de marche : rebond vertical de la caméra (échantillonné image par image) ---
const sampleFrames = (n) => page.evaluate((count) => new Promise((resolve) => {
  const out = [];
  const step = () => {
    const d = window.SanctuaryMode.debug();
    out.push({ y: d.camPos[1] - d.rootPos[1], m: d.muzzleCam });
    if (out.length >= count) resolve(out); else requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}), n);
const p2p = (a) => Math.max(...a) - Math.min(...a);
const countMinima = (a) => {
  const mean = a.reduce((s, v) => s + v, 0) / a.length;
  let c = 0;
  for (let i = 2; i < a.length - 2; i++) {
    if (a[i] < mean && a[i] < a[i - 1] && a[i] <= a[i + 1] && a[i] < a[i - 2] && a[i] <= a[i + 2]) c++;
  }
  return c;
};
const stillCheck = async (label) => {
  await sampleFrames(40);   // laisse finir fondus et lissage de caméra
  const s = await sampleFrames(60);
  const v = p2p(s.map((e) => e.y));
  check(label, v < 0.002, `crête à crête ${(v * 1000).toFixed(2)} mm`);
};
await stillCheck('visée immobile : caméra stable (crête à crête < 0,002 m)');

// --- Marche en visée (clic droit toujours maintenu) -------------------------
// 's' échantillonne 90 images : le terrain descend de ~0,2 m au-delà de x = -37 (artefact de hauteur de caméra, hors sujet ici).
// Le couloir de départ est étroit : les déplacements latéraux se testent plus à l'ouest (x < -44), en terrain dégagé.
for (const [key, expected] of [['w', 'walk'], ['s', 'pistol walk backward'], ['a', 'pistol strafe left'], ['d', 'pistol strafe right']]) {
  if (key === 'a') {
    await page.keyboard.down('s');
    await page.waitForFunction('window.SanctuaryMode.debug().pos[0] < -44', { timeout: 180000, polling: 'raf' });
    await page.keyboard.up('s');
    await page.waitForFunction('window.SanctuaryMode.debug().lower === "idle"', { timeout: 120000 });
  }
  const start = (await dbg()).pos;
  await page.keyboard.down(key);
  await page.waitForFunction(
    `(() => { const d = window.SanctuaryMode.debug(); const s = ${JSON.stringify(start)};
      return d.lower === ${JSON.stringify(expected)} && Math.hypot(d.pos[0]-s[0], d.pos[1]-s[1], d.pos[2]-s[2]) >= 0.25; })()`,
    { timeout: 120000 },
  );
  const dw = await dbg();
  if (key === 'w') await shot('aim-walk.png');
  {
    await sampleFrames(15);   // laisse finir le fondu idle -> marche avant de mesurer
    const sm = await sampleFrames(key === 'a' || key === 'd' ? 60 : key === 's' ? 90 : 120);
    const ys = sm.map((e) => e.y);
    const amp = p2p(ys);
    const lo = key === 'w' ? 0.03 : 0.01, hi = key === 'w' ? 0.06 : Infinity;
    check(`marche en visée (${key}) : rebond vertical caméra ${key === 'w' ? '0,03-0,06' : '>= 0,01'} m crête à crête`,
      amp >= lo && amp <= hi, `${(amp * 100).toFixed(2)} cm`);
    const nm = countMinima(ys);
    check(`marche en visée (${key}) : le rebond se répète (>= 2 minima locaux)`, nm >= 2, `${nm} minima`);
    const ms2 = sm.filter((e) => e.m);
    const dX = p2p(ms2.map((e) => e.m[0])), dY = p2p(ms2.map((e) => e.m[1]));
    check(`marche en visée (${key}) : dérive de la bouche < 0,10 m`, ms2.length > 0 && dX < 0.10 && dY < 0.10,
      `dx ${dX.toFixed(3)} m, dy ${dY.toFixed(3)} m`);
  }
  await page.keyboard.up(key);
  check(`marche en visée (${key}) : visée + posture tenue`, dw.aiming === true && dw.aimHold === true, `aiming ${dw.aiming}, aimHold ${dw.aimHold}`);
  check(`marche en visée (${key}) : jambes = ${expected}`, dw.lower === expected, `lower ${dw.lower}`);
  check(`marche en visée (${key}) : déplacement >= 0,25 m`, dist(dw.pos, start) >= 0.25, `${dist(dw.pos, start).toFixed(2)} m`);
  check(`marche en visée (${key}) : pas d'animation plein-corps walk/idle`, dw.current !== 'walk' && dw.current !== 'idle', `current ${dw.current}`);
  await page.waitForFunction('window.SanctuaryMode.debug().lower === "idle"', { timeout: 120000 });
}

await stillCheck("touches relâchées : retour à l'immobilité (crête à crête < 0,002 m)");

// --- Tir en marchant ----------------------------------------------------------
await page.keyboard.down('w');
await page.waitForFunction('window.SanctuaryMode.debug().lower === "walk"', { timeout: 120000 });
await page.evaluate(() => window.SanctuaryMode.shoot(false));
await sleep(300);
const dws = await dbg();
check('tir en marchant : la rafale démarre', dws.shooting === true);
await page.waitForFunction('!window.SanctuaryMode.debug().shooting', { timeout: 120000 });
const dwe = await dbg();
check('tir en marchant : pose reprise (aimHold)', dwe.aimHold === true, `aimHold ${dwe.aimHold}`);
check('tir en marchant : jambes ont continué (walk)', dwe.lower === 'walk', `lower ${dwe.lower}`);
await page.keyboard.up('w');
await page.waitForFunction('window.SanctuaryMode.debug().lower === "idle"', { timeout: 120000 });

// --- Tir en visée ---------------------------------------------------------
// Anti-rebond du tir précédent (tir en marchant) : on attend qu'il soit écoulé.
await page.waitForFunction('window.SanctuaryMode.debug().cooldown === 0', { timeout: 120000 });
await page.evaluate(() => window.SanctuaryMode.shoot(false));
await sleep(300);
const d2 = await dbg();
check('tir en visée : la rafale démarre', d2.shooting === true);
check('tir en visée : jamais de tir latéral', d2.sideShot === false);
check('tir : clip Shoot_Gadget de 0,87 s (nouvelle animation)', Math.abs(d2.shootDur - 0.867) < 0.02, `durée ${d2.shootDur}`);
await shot('aim-shot.png');
await sleep(2000);

// --- Relâchement ----------------------------------------------------------
await page.mouse.up({ button: 'right' });
await page.waitForFunction('window.SanctuaryMode.debug().aimBlend === 0', { timeout: 120000 });
// Pendant une rafale, le zoom de tir existant rapproche la caméra (PLAYER_CAM_SHOOT_DIST) :
// on attend la fin du tir avant de vérifier le retour à la distance normale.
await page.waitForFunction('!window.SanctuaryMode.debug().shooting', { timeout: 120000 });
await sleep(2500);
const d3 = await dbg();
check('relâché : aiming = false', d3.aiming === false);
check('relâché : plus de pose de visée', d3.aimHold === false && (d3.current === 'idle' || d3.current === 'walk'), `aimHold ${d3.aimHold}, current ${d3.current}`);
check('relâché : aimBlend = 0', d3.aimBlend === 0, `aimBlend ${d3.aimBlend}`);
check('relâché : headFade = 0', d3.headFade === 0, `headFade ${d3.headFade}`);
check('relâché : plan de coupe proche restitué (0,5 ±1e-3)', Math.abs(d3.near - baseNear) < 1e-3 && Math.abs(d3.near - 0.5) < 1e-3, `near ${d3.near}`);
check('relâché : FOV identique à l\'origine', Math.abs(d3.fov - baseFov) < 0.05, `fov ${d3.fov?.toFixed(2)} vs ${baseFov}`);
check('relâché : caméra de retour en 3e personne', dist(d3.camPos, d3.pos) > 2.5, `distance ${dist(d3.camPos, d3.pos).toFixed(2)} m`);
await shot('aim-off-1.png');

// --- À genoux : la caméra de visée est au niveau de la tête ----------------------------
await page.keyboard.press('k');
await page.waitForFunction('window.SanctuaryMode.debug().kneeling === true', { timeout: 120000 });
await page.waitForFunction('window.SanctuaryMode.debug().current === "pistol kneeling idle"', { timeout: 120000 });
await twoFrames();
await page.mouse.move(500, 320);
await page.mouse.down({ button: 'right' });
await page.waitForFunction('(() => { const d = window.SanctuaryMode.debug(); return d.aimBlend === 1 && Math.abs(d.aimPoseMix - 1) < 0.01; })()', { timeout: 120000 });
await settle();
const dk = await dbg();
const kHead = dk.headPos[1] - dk.rootPos[1] + 0.1174 * dk.modelScale;
const kCam = dk.camPos[1] - dk.rootPos[1];
check('à genoux : caméra à la hauteur de la tête + 0,1174 x échelle (±0,04 m)', Math.abs(kCam - kHead) < 0.04,
  `caméra ${kCam.toFixed(3)} m, attendu ${kHead.toFixed(3)} m`);
check('à genoux : caméra plus basse que la hauteur debout (< 1,3 m)', kCam < 1.3, `${kCam.toFixed(3)} m`);
await shot('aim-kneel.png');
await page.mouse.up({ button: 'right' });
await page.waitForFunction('window.SanctuaryMode.debug().aimBlend === 0', { timeout: 120000 });
await page.keyboard.press('k');
await page.waitForFunction('window.SanctuaryMode.debug().kneeling === false', { timeout: 120000 });

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} vérification(s) en échec` : '\nToutes les vérifications passent');
process.exit(failures.length ? 1 : 0);
