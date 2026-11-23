/**
 * Preuve par la conduite : la voiture du jeu peut-elle SUIVRE l'itinéraire de la carte jusqu'au lieu choisi ?
 * Un pilote automatique conduit la vraie voiture (vraies collisions, vrai fleuve) le long de la ligne calculée par le routeur du jeu
 * (app/city-routes.js) et signale si elle arrive ou à quel endroit elle reste coincée.
 *
 * Prérequis : `npm run serve` (http://localhost:8123) et Chrome.
 * Usage : node tools/drive-route-check.mjs <lieu> <voiture|osm> [vitesse m/s]
 *   voiture : graphe filtré (assets/data/routes-djenne-voiture.json, celui du jeu)
 *   osm     : ancien graphe OpenStreetMap brut (assets/data/routes-djenne.json) pour comparer
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { createRouter, PLACES } from '../app/city-routes.js';

const [placeId = 'barrage', which = 'voiture', speedArg = '4.5'] = process.argv.slice(2);
const K = 0.84, CB_X = -12.0, CB_Y = 5.2;
const toGame = ([e, n]) => ({ x: n / K + CB_X, z: e / K - CB_Y });
const toReal = (x, z) => ({ e: K * (z + CB_Y), n: K * (x - CB_X) });

const file = which === 'osm' ? 'assets/data/routes-djenne.json' : 'assets/data/routes-djenne-voiture.json';
const router = createRouter(JSON.parse(fs.readFileSync(file, 'utf8')));
const place = PLACES.find((p) => p.id === placeId);
if (!place) throw new Error('lieu inconnu : ' + placeId + ' (' + PLACES.map((p) => p.id).join(', ') + ')');
const START = { x: -21.5, z: 47.0 };            // départ de la voiture (vehicle.js : PARK)
const me = toReal(START.x, START.z);
const route = router.route(me.e, me.n, place.e, place.n);
// on s'arrête au dernier nœud du réseau : le dernier tronçon (nœud -> lieu) est à pied, hors route
const pts = route.pts.slice(0, -1).map(toGame);
// rééchantillonnage tous les ~3 m
const path = [pts[0]];
for (let i = 1; i < pts.length; i++) {
  const a = pts[i - 1], b = pts[i], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.round(L / 3));
  for (let k = 1; k <= n; k++) path.push({ x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n });
}
console.log(`Itinéraire ${which} -> ${place.name} : ${Math.round(route.length)} m, ${path.length} points, gué ${Math.round(route.wet || 0)} m`);

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'shell', protocolTimeout: 1500000,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await page.evaluateOnNewDocument(() => { try { localStorage.setItem('taama.gadget', '1'); localStorage.setItem('taama.dispositif1', '1'); } catch (_) {} });
await page.setViewport({ width: 240, height: 150 });
await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded', timeout: 240000 });
await page.waitForFunction(`!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`, { timeout: 240000 });
await page.evaluate(() => { window.startMosqueScene(); });
await new Promise((r) => setTimeout(r, 3000));
await page.evaluate(() => window.SanctuaryMode.enter());
await page.waitForFunction(`(() => { const d = window.SanctuaryMode.debug(); return d.state === 3 && d.ready; })()`, { timeout: 300000 });
await page.evaluate(() => window.GameUI?.hide?.());
await page.waitForFunction(`window.Vehicle && window.Vehicle.loaded`, { timeout: 300000 });
await page.evaluate(() => { window.MosqueScene.scene.visible = false; });            // pas de rendu : la logique et les collisions continuent à pleine vitesse
await new Promise((r) => setTimeout(r, 2000));
// la voiture à son point de départ, le personnage devant sa portière, puis on monte
await page.evaluate((s) => { window.Vehicle.park(s.x, s.z, Math.PI * 0.5); }, START);
await page.evaluate((s) => window.SanctuaryMode.debugTeleport(s.x + 1.5, window.SanctuaryMode.debug().pos[1], s.z + 2.5), START);
await new Promise((r) => setTimeout(r, 1500));
await page.evaluate(() => window.Vehicle.enter());
await page.waitForFunction(`window.Vehicle.state === 'drive'`, { timeout: 120000 }).catch(() => console.log('la voiture n’est jamais passée en conduite'));

const result = await page.evaluate((path, vTarget) => new Promise((resolve) => {
  const held = {};
  const key = (code, down) => { if (!!held[code] === down) return; held[code] = down; window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code, bubbles: true, cancelable: true })); };
  const release = () => { for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS']) key(c, false); };
  const V = window.Vehicle, wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  let idx = 0, frames = 0, bestIdx = 0, lastProgFrame = 0, stillFrames = 0, reverseLeft = 0, reverseSteer = 0, recoveries = 0;
  window.__trace = []; window.__recov = [];
  const f = () => {
    frames++;
    const p = V.position, yaw = V.yaw, sp = V.speed;
    // progression : le plus proche point en avant, dans une fenêtre
    let bd = Infinity, bi = idx;
    for (let i = idx; i < Math.min(path.length, idx + 40); i++) { const d = Math.hypot(path[i].x - p.x, path[i].z - p.z); if (d < bd) { bd = d; bi = i; } }
    idx = bi;
    if (idx > bestIdx + 1) { bestIdx = idx; lastProgFrame = frames; }
    const last = path[path.length - 1];
    if (Math.hypot(last.x - p.x, last.z - p.z) < 12 || idx >= path.length - 2) { release(); return resolve({ ok: true, frames, idx, total: path.length, pos: [p.x, p.z], recoveries }); }
    if (frames - lastProgFrame > 1200 || recoveries > 25) {   // ~24 s sans avancer le long de l'itinéraire, ou trop de manœuvres : coincée
      release(); return resolve({ ok: false, why: 'bloquée', frames, idx, total: path.length, pos: [p.x, p.z], dev: bd, speed: sp, recoveries });
    }
    // point visé : en avant sur la ligne (conduite prudente : peu d'avance pour ne pas couper les virages)
    const look = 4 + 0.4 * Math.abs(sp); let acc = 0, ti = idx;
    while (ti < path.length - 1 && acc < look) { acc += Math.hypot(path[ti + 1].x - path[ti].x, path[ti + 1].z - path[ti].z); ti++; }
    const err = wrap(Math.atan2(path[ti].x - p.x, path[ti].z - p.z) - yaw);
    if (frames % 25 === 1) window.__trace.push([frames, +p.x.toFixed(1), +p.z.toFixed(1), +yaw.toFixed(2), +sp.toFixed(1), +err.toFixed(2), idx, Object.keys(held).filter((c) => held[c]).join('')]);
    if (reverseLeft > 0) {                                   // manœuvre de dégagement : marche arrière en braquant à l'opposé
      reverseLeft--; key('KeyW', false); key('KeyS', true); key('KeyA', reverseSteer > 0); key('KeyD', reverseSteer < 0);
      return requestAnimationFrame(f);
    }
    key('KeyS', sp > vTarget + 2.5);
    // coincée : on pousse sans avancer depuis ~1,2 s -> on recule en braquant du côté opposé à l'erreur de cap
    if (Math.abs(sp) < 0.6) stillFrames++; else stillFrames = 0;
    if (stillFrames > 60) { stillFrames = 0; recoveries++; reverseLeft = 90; reverseSteer = err > 0 ? -1 : 1; window.__recov.push([+p.x.toFixed(1), +p.z.toFixed(1), idx]); return requestAnimationFrame(f); }
    key('KeyA', err > 0.04); key('KeyD', err < -0.04);
    const vt = Math.abs(err) > 0.5 ? vTarget * 0.5 : vTarget;
    key('KeyW', sp < vt);
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}), path, Number(speedArg));
if (process.env.TRACE) {
  const tr = await page.evaluate(() => window.__trace.slice(0, 40));
  console.log('trace [image, x, z, cap, vitesse, erreur de cap, point, touches] :');
  for (const row of tr) console.log(JSON.stringify(row));
}
const recov = await page.evaluate(() => window.__recov);
await browser.close();
const tot = result.total || path.length;
const at = toReal(result.pos[0], result.pos[1]);
if (result.ok) console.log(`✅ ARRIVÉE à ${place.name} (réseau) — ${result.frames} images (${(result.frames / 50).toFixed(0)} s de conduite), ${result.recoveries} marche(s) arrière de dégagement`);
else console.log(`❌ ${result.why.toUpperCase()} après ${(result.idx / tot * 100).toFixed(0)} % de l'itinéraire (point ${result.idx}/${tot}) à (est ${at.e.toFixed(0)} m, nord ${at.n.toFixed(0)} m) | jeu x ${result.pos[0].toFixed(1)} z ${result.pos[1].toFixed(1)} | écart à la ligne ${result.dev.toFixed(1)} m | ${result.recoveries} marche(s) arrière tentée(s)`);
if (!result.ok && recov.length) console.log('dernières manœuvres de dégagement (x, z, point) :', JSON.stringify(recov.slice(-4)));
if (errs.length) console.log('erreurs :', errs.join(' | '));
