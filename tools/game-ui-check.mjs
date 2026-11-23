/**
 * Vérifie dans Chrome la nouvelle interface : les 13 écrans (captures) puis le
 * parcours complet lancement → chargement → cinématique → menu → partie → pause.
 * Prérequis : npm run serve (port 8123).
 * Usage : node tools/game-ui-check.mjs [dossier-captures]
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
  protocolTimeout: 240000,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
const logs = [];
// La scène 3D n'est pas l'objet du test : on bloque les gros modèles (rendu logiciel lent).
const BLOCKED = /\/assets\/models\/|\.(glb|gltf|bin)(\?|$)/;
let allowChar = false;               // laisse charger le personnage 3D (et son drone) pour le test du rendu
let apiMode = 'ok';                  // 'ok' | 'down' : état simulé de /api/players (serveur Notion)
const apiCalls = [];
await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.endsWith('/api/players')) {
    apiCalls.push(JSON.parse(r.postData() || '{}'));
    const ok = apiMode === 'ok';
    return r.respond({ status: ok ? 200 : 503, contentType: 'application/json', body: JSON.stringify(ok ? { ok: true, created: true } : { ok: false, error: 'not_configured' }) });
  }
  if (/arcgisonline\.com/.test(u)) return r.respond({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  if (BLOCKED.test(u) && !(allowChar && /personnage-joueur-gadget|\/drone\.glb/.test(u))) return r.abort();
  return r.continue();
});
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (/Failed to load resource|ERR_FAILED|net::|Failed to fetch|Erreur chargement/.test(m.text())) return;
  logs.push(`[error] ${m.text()}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('response', (r) => { if (r.status() >= 400 && !BLOCKED.test(r.url()) && !/favicon|api\/players/.test(r.url())) logs.push(`[http ${r.status()}] ${r.url()}`); });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// Une vraie manette branchée sur la machine de test fausserait les résultats (dérive des sticks, croix directionnelle)
await page.evaluateOnNewDocument(() => { navigator.getGamepads = () => []; });
const ok = (cond, msg) => { assert.ok(cond, msg); console.log('ok -', msg); };
const shot = (name) => page.screenshot({ path: path.join(OUT, `ui-${name}.png`) });

/** Évalue dans le Shadow DOM de l'écran affiché. */
const inScreen = (fn, ...args) => page.evaluate((src, a) => {
  const el = document.querySelector('.gu-screen.on') || document.querySelector('.gu-screen');
  if (!el) return null;
  // eslint-disable-next-line no-new-func
  return new Function('root', 'args', `return (${src})(root, ...args)`)(el.shadowRoot, a);
}, fn.toString(), args);
const screenId = () => page.evaluate(() => { const e = document.querySelector('.gu-screen.on'); return e ? e.dataset.screen : null; });
const press = async (k, ms = 330) => { await page.keyboard.press(k); await wait(ms); };

async function load(w = 1280, h = 720) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction('!!window.GameUI && !!window.Tapama', { timeout: 60000 });
  await wait(500);
}

/* ===== 1. Les 13 écrans ===== */
console.log('\n=== Les 14 écrans (1280×720) ===');
await load();
ok((await screenId()) === 'lancement', 'l’écran de lancement s’affiche au démarrage');
ok(await page.evaluate(() => getComputedStyle(document.getElementById('boot') || document.body).display === 'none' || !document.getElementById('boot')), 'l’ancienne intro (texte d’entrée) est masquée');
ok(await page.evaluate(() => !document.querySelector('.panel') || getComputedStyle(document.querySelector('.panel')).display === 'none'), 'la tablette « Décolle le drone » est masquée');

const ids = await page.evaluate(() => window.GameUI.screens);
ok(ids.length === 14, `14 écrans disponibles (${ids.join(', ')})`);
for (const id of ids) {
  await page.evaluate((i) => window.GameUI.show(i), id);
  await wait(550);
  ok((await screenId()) === id, `écran « ${id} » affiché`);
  const unresolved = await inScreen(() => Array.from(root.querySelectorAll('img')).filter((i) => i.complete && i.naturalWidth === 0).length);
  ok(unresolved === 0, `« ${id} » : toutes les images sont chargées`);
  await shot(id);
}

/* ===== 1 bis. Carte interactive (vraie carte Leaflet, plein écran) ===== */
console.log('\n=== Carte interactive ===');
const inBg = (fn, ...args) => page.evaluate((src, a) => {
  const el = document.querySelector('.gu-bgl.on') || document.querySelector('.gu-bgl');
  if (!el) return null;
  // eslint-disable-next-line no-new-func
  return new Function('root', 'args', `return (${src})(root, ...args)`)(el.shadowRoot, a);
}, fn.toString(), args);
await page.evaluate(() => window.GameUI.show('carte'));
await page.waitForFunction('!!window.GameUI.map()', { timeout: 30000 });
await wait(900);
const panel = () => inScreen(() => {
  const a = root.querySelector('aside[aria-label^="Détail"]');
  const btn = root.querySelector('[data-act="resume"]');
  return { title: a.querySelector('h2').textContent, badge: a.children[0].children[1].textContent, locked: btn.getAttribute('aria-disabled') === 'true', btn: btn.textContent.trim() };
});
const mapInfo = () => page.evaluate(() => { const i = window.GameUI.map().info(); return { zoom: i.zoom, satellite: i.satellite, maxZoom: i.maxZoom, size: i.size }; });
const pointOf = (id) => page.evaluate((i) => window.GameUI.map().pointOf(i), id);
let pn = await panel();
ok(pn.title === 'Djenné' && pn.badge === 'Disponible' && !pn.locked, 'la carte s’ouvre sur Djenné (disponible) ' + JSON.stringify(pn));
const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
const m0 = await mapInfo();
ok(m0.size.x === vp.w && m0.size.y === vp.h, `la carte occupe toute la fenêtre (${m0.size.x}×${m0.size.y} px)`);
ok(await inBg(() => root.querySelectorAll('.leaflet-container').length === 1 && root.querySelectorAll('.leaflet-marker-icon').length >= 5), 'c’est une vraie carte Leaflet avec ses marqueurs');
ok(await inBg(() => root.querySelectorAll('[data-dest][tabindex]').length === 5), 'les 5 destinations sont des marqueurs cliquables et accessibles au clavier');
ok(await inBg(() => root.querySelectorAll('.leaflet-overlay-pane path').length > 20), 'frontières et fleuves réels dessinés');
const pDj = await pointOf('djenne');
ok(pDj.x > 0 && pDj.x < vp.w * 0.62 && pDj.y > 100 && pDj.y < vp.h - 80, 'Djenné est visible dans la zone libre, à gauche du panneau');
const lome0 = await pointOf('lome');
ok(lome0.x > 0 && lome0.x < vp.w * 0.62 && lome0.y < vp.h - 60, 'toute la région est visible, Lomé comprise');
await shot('carte-plein-ecran');

// un geste sur la carte (en dehors des cartes de l'interface) déplace bien la carte
const before = await pointOf('djenne');
await page.mouse.move(vp.w * 0.3, vp.h * 0.55);
await page.mouse.down();
await page.mouse.move(vp.w * 0.3 + 120, vp.h * 0.55 + 60, { steps: 6 });
await page.mouse.up();
await wait(500);
const after = await pointOf('djenne');
ok(after.x - before.x > 80 && after.y - before.y > 30, `glisser sur la carte la déplace (les gestes traversent l’interface) : décalage ${Math.round(after.x - before.x)}, ${Math.round(after.y - before.y)} px`);
await inScreen(() => root.querySelector('button[aria-label="Recentrer la carte"]').click());
await wait(1500);

await inBg(() => root.querySelector('[data-dest="bandiagara"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await wait(250);
pn = await panel();
ok(pn.title === 'Bandiagara' && pn.badge === 'Verrouillée', 'un clic sur le marqueur de Bandiagara affiche sa fiche (verrouillée)');
ok(pn.locked && /Verrouillée/.test(pn.btn), 'le bouton du chapitre est verrouillé pour une destination fermée');
await press('ArrowRight', 1300);
pn = await panel();
const pSe = await pointOf('segou');
ok(pn.title === 'Ségou', '→ passe à la destination suivante (Ségou)');
ok(pSe.x > 80 && pSe.x < vp.w * 0.6 && pSe.y > 120 && pSe.y < vp.h - 100, 'la carte place Ségou au milieu de la zone libre');
await press('ArrowRight', 300); await press('ArrowRight', 300); await press('ArrowRight', 1300);
ok((await panel()).title === 'Djenné', 'la sélection boucle : Ségou → Bamako → Lomé → Djenné');
await press('ArrowLeft', 1400);
const pLo = await pointOf('lome');
ok((await panel()).title === 'Lomé' && pLo.x > 80 && pLo.x < vp.w * 0.6, '← revient sur Lomé et la carte s’y déplace');
await inScreen(() => {
  const row = Array.from(root.querySelectorAll('aside [data-dest]')).find((r) => r.dataset.dest === 'bamako');
  row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await wait(1300);
ok((await panel()).title === 'Bamako', 'un clic dans la liste « À débloquer » sélectionne aussi la destination');
await inBg(() => root.querySelector('[data-dest="djenne"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await wait(300);
pn = await panel();
ok(pn.title === 'Djenné' && !pn.locked, 'retour sur Djenné : le bouton du chapitre se déverrouille');

// zoom : boutons, molette, recentrer
const z0 = (await mapInfo()).zoom;
await inScreen(() => root.querySelector('button[aria-label="Zoom avant"]').click());
await wait(700);
const z1 = (await mapInfo()).zoom;
ok(z1 > z0 + 0.5, `le bouton + zoome sur la carte (${z0} → ${z1})`);
await page.mouse.move(vp.w * 0.3, vp.h * 0.5);
await page.mouse.wheel({ deltaY: 400 });
await wait(900);
const z2 = (await mapInfo()).zoom;
ok(z2 < z1, `la molette dézoome (${z1} → ${z2})`);
await inScreen(() => root.querySelector('button[aria-label="Zoom avant"]').click());
await inScreen(() => root.querySelector('button[aria-label="Zoom avant"]').click());
await wait(900);
await inScreen(() => root.querySelector('button[aria-label="Recentrer la carte"]').click());
await wait(1600);
const zr = await mapInfo();
ok(Math.abs(zr.zoom - m0.zoom) < 0.3, '⟲ recentre la carte sur l’Afrique de l’Ouest');

// vue satellite
ok(!zr.satellite && zr.maxZoom === 8, 'carte du jeu : zoom limité à 8 (données simplifiées)');
await inScreen(() => root.querySelector('button[aria-label="Vue satellite"]').click());
await wait(500);
const sat = await mapInfo();
ok(sat.satellite && sat.maxZoom === 18, 'le bouton globe active la vue satellite (zoom jusqu’à 18)');
ok(await inScreen(() => root.querySelector('button[aria-label="Vue satellite"]').getAttribute('aria-pressed') === 'true') && await inBg(() => getComputedStyle(root.querySelector('.gm-credit')).display === 'block'), 'la source des images satellite est créditée');
await inScreen(() => root.querySelector('button[aria-label="Vue satellite"]').click());
await wait(400);
ok(!(await mapInfo()).satellite && (await mapInfo()).maxZoom === 8, 'on repasse à la carte du jeu');

/* ===== 2. Parcours complet ===== */
console.log('\n=== Parcours complet ===');
await load();
// la maquette 3D est bloquée dans ce test : on la déclare chargée pour passer l'étape de chargement
await page.evaluate(() => { Object.defineProperty(window.MosqueScene, 'loaded', { get: () => true, configurable: true }); });
await press('Enter', 600);
ok((await screenId()) === 'chargement', 'Entrée sur le lancement → chargement');
await wait(500);
await shot('flux-chargement');
ok(await inScreen(() => /100 %/.test(root.querySelector('[data-bind="loadPct"]').textContent)), 'le chargement affiche 100 % quand la maquette est prête');
await page.waitForFunction("(document.querySelector('.gu-screen.on')||{dataset:{}}).dataset.screen !== 'chargement'", { timeout: 15000 });
await wait(400);
let s = await screenId();
ok(s === 'cinematique' || s === 'main', `le chargement se termine (écran : ${s})`);
if (s === 'cinematique') {
  await shot('flux-cinematique');
  await press('Escape', 600);
}
ok((await screenId()) === 'profil', 'à la première partie, on demande le nom avant le menu');
await shot('flux-profil');

// validation : nom vide
await inScreen(() => root.querySelector('[data-act="profile-save"]').click());
await wait(200);
ok(await inScreen(() => root.querySelector('[data-error]').textContent.length > 5), 'nom vide : message d’erreur');
ok((await screenId()) === 'profil', 'le profil ne se valide pas sans nom');

// saisie réelle au clavier (le moteur ne doit pas avaler les touches)
await page.keyboard.type('Moussa', { delay: 30 });
ok(await inScreen(() => root.querySelector('[data-field="name"]').value === 'Moussa'), 'on peut taper son prénom au clavier');
ok(await inScreen(() => root.querySelector('[data-bind="preview"]').textContent.includes('Moussa')), 'Tapama montre en direct comment elle l’appellera');
await page.keyboard.press('Enter');
await wait(150);
await page.keyboard.type('3x', { delay: 30 });
ok(await inScreen(() => root.querySelector('[data-field="age"]').value === '3'), 'l’âge n’accepte que des chiffres');
await page.keyboard.press('Enter');
await wait(250);
ok(await inScreen(() => /âge/.test(root.querySelector('[data-error]').textContent)), 'âge hors limites : message d’erreur');
await page.keyboard.press('Backspace');
await page.keyboard.type('14', { delay: 30 });
await page.keyboard.press('Enter');
await wait(900);
ok((await screenId()) === 'main', 'profil validé → menu principal');
ok(await page.evaluate(() => { const p = JSON.parse(localStorage.getItem('taama.player.v1')); return p.name === 'Moussa' && p.age === 14; }), 'le profil est enregistré sur l’appareil');
ok(apiCalls.length === 1 && apiCalls[0].name === 'Moussa' && apiCalls[0].age === 14, 'le profil est envoyé au serveur (Notion)');
ok(JSON.stringify(Object.keys(apiCalls[0]).sort()) === JSON.stringify(['age', 'createdAt', 'device', 'id', 'lang', 'name']), 'seules les données nécessaires sont envoyées');
ok(/^[0-9a-f-]{36}$/.test(apiCalls[0].id), 'identifiant anonyme (UUID) généré pour l’appareil');
ok(await page.evaluate(() => window.GameUI.player().synced === true), 'profil marqué « synchronisé » après la réponse du serveur');
ok(await inScreen(() => /Personnage\s*·\s*Moussa/.test(root.textContent)), '« Ton équipe » affiche le prénom du joueur');
await shot('flux-menu-moussa');
ok(await page.evaluate(() => localStorage.getItem('taama.seenIntro') === '1'), 'la cinématique est mémorisée comme vue');

// Menu principal : pas de sauvegarde → « Continuer » désactivé
ok(await inScreen(() => root.querySelector('[data-act="continue"]').getAttribute('aria-disabled') === 'true'), '« Continuer » est désactivé sans sauvegarde');
await shot('flux-menu-sans-sauvegarde');

// Options : un réglage persiste
await inScreen(() => root.querySelector('[data-act="options:audio"]').click());
await wait(600);
ok((await screenId()) === 'options-audio', 'Options › Audio');
await inScreen(() => {
  const trk = root.querySelector('.trk[data-key="volume"]');
  const r = trk.getBoundingClientRect();
  trk.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width * 0.3, clientY: r.top + 2, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
await wait(200);
ok(await page.evaluate(() => JSON.parse(localStorage.getItem('taama.settings.v1')).volume === 30), 'le curseur « Volume général » règle 30 et l’enregistre');
await inScreen(() => root.querySelector('[data-act="options:jeu"]').click());
await wait(600);
await inScreen(() => root.querySelectorAll('.seg')[0].querySelectorAll('span')[2].click());   // ×4
await wait(200);
ok(await page.evaluate(() => window.GameUI.settings().timeSpeed === 4), 'Options › Jeu : vitesse du temps ×4');
await shot('flux-options-jeu');
await press('Escape', 600);                                  // retour
ok((await screenId()) === 'options-audio', 'Échap revient à l’écran précédent');
await press('Escape', 600);
ok((await screenId()) === 'main', 'Échap revient au menu principal');

// Nouvelle partie
await inScreen(() => root.querySelector('[data-act="new"]').click());
await wait(600);
ok((await screenId()) === 'nouvelle', 'Nouvelle partie');
ok(await inScreen(() => getComputedStyle(root.querySelector('[data-warn]')).display === 'none'), 'pas d’avertissement « partie existante » sans sauvegarde');
await inScreen(() => root.querySelectorAll('.sw[data-ng]')[0].click());     // désactive la cinématique
await wait(150);
await shot('flux-nouvelle-partie');
await inScreen(() => root.querySelector('[data-act="begin"]').click());
await wait(900);
ok(await page.evaluate(() => window.GameUI.isInGame() && !window.GameUI.isOpen()), 'la partie démarre, l’interface se ferme');
ok(await page.evaluate(() => window.Tapama.isBusy()), 'l’appel de Tapama (dialogue) démarre');
ok(await page.evaluate(() => document.querySelector('.tp-d-text').textContent.startsWith('« Moussa, j’ai découvert')), 'Tapama appelle le joueur par son prénom');
ok(await page.evaluate(() => window.GameUI.save().sequence === 3), 'sauvegarde créée : séquence 3');
await shot('flux-appel-tapama');
for (let i = 0; i < 3; i++) await press('Enter', 420);
await wait(500);
ok(!(await page.evaluate(() => window.Tapama.isBusy())), 'le dialogue se termine');
ok(await page.evaluate(() => window.GameUI.save().sequence === 4), 'séquence 4 : « Le premier repérage » (sauvegarde automatique)');

// Pause
await page.evaluate(() => { document.getElementById('mosqueStage').classList.add('on'); });
await press('p', 700);
ok((await screenId()) === 'pause', 'P ouvre la pause');
ok(await inScreen(() => root.textContent.includes('Séquence 4 · Le premier repérage')), 'la pause affiche la séquence en cours');
await shot('flux-pause');
await press('Escape', 600);
ok(!(await page.evaluate(() => window.GameUI.isOpen())), 'Échap referme la pause');

// Continuer après rechargement
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI', { timeout: 60000 });
await wait(500);
await page.evaluate(() => { Object.defineProperty(window.MosqueScene, 'loaded', { get: () => true, configurable: true }); });
await press('Enter', 600);
await wait(5400);
ok((await screenId()) === 'main', 'au 2e lancement, la cinématique déjà vue est sautée');
ok(await inScreen(() => root.querySelector('[data-act="continue"]').getAttribute('aria-disabled') !== 'true'), '« Continuer » est actif avec une sauvegarde');
ok(await inScreen(() => root.textContent.includes('Séquence 4 · Le premier repérage')), '« Continuer » indique la séquence 4');
await shot('flux-menu-avec-sauvegarde');
await inScreen(() => root.querySelector('[data-act="new"]').click());
await wait(600);
ok(await inScreen(() => getComputedStyle(root.querySelector('[data-warn]')).display !== 'none'), 'avertissement « une partie existe déjà »');
await inScreen(() => root.querySelector('[data-act="begin"]').click());
await wait(300);
ok((await screenId()) === 'nouvelle', 'sans « J’ai compris », la nouvelle partie ne démarre pas');
await shot('flux-nouvelle-avec-sauvegarde');

/* ===== 3. Ancienne intro toujours disponible ===== */
console.log('\n=== ?legacy=1 : ancienne intro ===');
await page.goto('http://localhost:8123/?legacy=1', { waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!document.getElementById("boot")', { timeout: 60000 });
await wait(800);
ok(await page.evaluate(() => !document.getElementById('guRoot') && !document.documentElement.classList.contains('gu')), 'en mode legacy, la nouvelle interface ne se monte pas');
ok(await page.evaluate(() => getComputedStyle(document.getElementById('boot')).display !== 'none'), 'en mode legacy, l’ancienne intro est affichée');

/* ===== 4. Envoi en attente puis réussi ===== */
console.log('\n=== Envoi à Notion : panne puis reprise ===');
apiMode = 'down';
apiCalls.length = 0;
await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('taama.player.v1', JSON.stringify({ version: 1, id: '123e4567-e89b-42d3-a456-426614174000', name: 'Aïcha', age: 12, device: 'Ordinateur', lang: 'fr', createdAt: '2026-10-30T18:00:00.000Z', updatedAt: '2026-10-30T18:00:00.000Z', synced: false }));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI', { timeout: 60000 });
await wait(1500);
ok(apiCalls.length >= 1 && apiCalls[0].name === 'Aïcha', 'au lancement, le profil en attente est renvoyé');
ok(await page.evaluate(() => window.GameUI.player().synced === false), 'serveur indisponible : le profil reste « en attente » (le jeu fonctionne quand même)');
ok((await screenId()) === 'lancement', 'une panne du serveur ne bloque pas le jeu');
apiMode = 'ok';
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await wait(800);
ok(await page.evaluate(() => window.GameUI.player().synced === true), 'connexion rétablie : le profil est enregistré');

/* ===== 5. Personnage en vrai 3D ===== */
console.log('\n=== Personnage en 3D (modèle réel) ===');
allowChar = true;
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI', { timeout: 60000 });
await wait(500);
await page.evaluate(() => window.GameUI.show('main'));
const charInfo = () => page.evaluate(async () => (await import('/app/character-viewer.js')).characterInfo());
let ready = false;
for (let i = 0; i < 90 && !ready; i++) { await wait(1000); ready = (await charInfo()).ready; }
ok(ready, 'le modèle du personnage est chargé');
ok(await inScreen(() => { const f = root.querySelector('[data-char3d]'); const c = f.querySelector('canvas'); return !!c && c.style.opacity === '1' && c.width > 100; }), 'un canevas 3D remplace l’image du personnage');
ok(await inScreen(() => root.querySelector('[data-char3d] > img').style.opacity === '0'), 'l’image de secours est masquée');
await wait(800);
await shot('3d-menu-1');
const a1 = (await charInfo()).angle;
await wait(1500);
const a2 = (await charInfo()).angle;
ok(a2 - a1 > 0.4, `le personnage tourne tout seul (${((a2 - a1) * 180 / Math.PI).toFixed(0)}° en 1,5 s)`);
await shot('3d-menu-2');
await page.evaluate(() => window.GameUI.show('nouvelle'));
await wait(900);
const b1 = (await charInfo()).angle;
await press('ArrowRight', 200);
const b2 = (await charInfo()).angle;
ok(b2 - b1 > 0.3, '→ fait tourner le personnage dans « Nouvelle partie »');
await shot('3d-nouvelle');
await inScreen(() => root.querySelector('[data-char3d] canvas').dispatchEvent(new PointerEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1, bubbles: true })));
await page.evaluate(() => { const c = document.querySelector('.gu-screen.on').shadowRoot.querySelector('[data-char3d] canvas'); c.dispatchEvent(new PointerEvent('pointermove', { clientX: 220, clientY: 100, pointerId: 1, bubbles: true })); });
const c1 = (await charInfo()).angle;
ok(c1 - (await charInfo()).angle < 0.2 && c1 > b2 + 0.8, 'glisser à la souris fait tourner le personnage');
await inScreen(() => root.querySelector('[data-char3d] canvas').dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, bubbles: true })));
await page.evaluate(() => window.GameUI.show('profil'));
await wait(1200);
ok(await inScreen(() => !!root.querySelector('[data-char3d] canvas')), 'le personnage 3D est aussi dans l’écran du profil');
await shot('3d-profil');
await page.evaluate(() => window.GameUI.show('credits'));
await wait(500);
ok(await page.evaluate(() => !document.querySelector('.gu-screen.on').shadowRoot.querySelector('canvas')), 'sans cadre 3D, le rendu est libéré (économie de batterie)');
allowChar = false;

/* ===== 6. Options réelles : langue, taille du texte, aides, etc. ===== */
console.log('\n=== Options : chaque réglage agit vraiment ===');
apiMode = 'ok';
await page.goto('http://localhost:8123/', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('taama.player.v1', JSON.stringify({ version: 1, id: '123e4567-e89b-42d3-a456-426614174000', name: 'Moussa', age: 14, device: 'Ordinateur', lang: 'fr', createdAt: '2026-10-30T18:00:00.000Z', updatedAt: '2026-10-30T18:00:00.000Z', synced: true }));
  localStorage.setItem('taama.save.v1', JSON.stringify({ version: 1, chapter: 1, sequence: 4, done: [1, 2, 3], discoveries: [], playMs: 600000, lastPlayed: new Date().toISOString(), seenIntro: true }));
  localStorage.setItem('taama.seenIntro', '1');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI && !!window.Tapama', { timeout: 60000 });
await wait(600);
const textOf = () => inScreen(() => root.textContent.replace(/\s+/g, ' '));
const fontPx = () => inScreen((r, sel) => parseFloat(getComputedStyle(r.querySelector(sel)).fontSize), 'h1');
const setOpt = (screen, sel) => page.evaluate((s, q) => { window.GameUI.show(s); }, screen, sel);

// --- Langue
await page.evaluate(() => window.GameUI.show('options-jeu'));
await wait(600);
ok((await textOf()).includes('Langue du jeu'), 'avant : l’écran Options est en français');
await inScreen(() => root.querySelector('.lang[data-lang="en"]').click());
await wait(700);
let tx = await textOf();
ok(tx.includes('Game language') && tx.includes('Skippable cutscenes') && tx.includes('Text size'), 'passer en English traduit l’écran des options');
ok(!tx.includes('Langue du jeu'), 'plus de français sur cet écran');
ok(await page.evaluate(() => document.documentElement.lang === 'en' && JSON.parse(localStorage.getItem('taama.settings.v1')).lang === 'en'), 'la langue est enregistrée');
await shot('options-english');
await page.evaluate(() => window.GameUI.show('main'));
await wait(600);
tx = await textOf();
ok(tx.includes('New game') && tx.includes('Continue') && tx.includes('Destinations') && tx.includes('Credits'), 'le menu principal est en anglais');
ok(tx.includes('Sequence 4 · The first reconnaissance'), 'la séquence en cours est traduite (« Sequence 4 · The first reconnaissance »)');
ok(tx.includes('Character · Moussa'), 'le prénom du joueur reste affiché');
await shot('main-english');
await page.evaluate(() => window.GameUI.show('carte'));
await page.waitForFunction('!!window.GameUI.map()', { timeout: 30000 });
await wait(700);
tx = (await textOf()) + ' ' + (await page.evaluate(() => document.querySelector('.gu-bgl.on').shadowRoot.textContent.replace(/\s+/g, ' ')));
ok(tx.includes('Destinations') && tx.includes('To unlock') && tx.includes('MAURITANIA') && !tx.includes('Verrouillée'), 'la carte est en anglais (pays, « To unlock »)');
await inScreen(() => root.querySelector('[data-dest="bandiagara"]').dispatchEvent(new MouseEvent('click', { bubbles: true })));
await wait(250);
tx = await textOf();
ok(tx.includes('Locked') && tx.includes('Finish chapter 1 to open this destination.'), 'la fiche d’une destination verrouillée s’affiche en anglais');
await page.evaluate(() => window.GameUI.show('pause'));
await wait(500);
ok((await textOf()).includes('Moussa, I found something near the mosque'), 'le journal de la pause cite Tapama en anglais, avec le prénom');
await page.evaluate(() => window.GameUI.show('profil'));
await wait(500);
ok((await textOf()).includes('What’s your name?'), 'l’écran du profil est en anglais');
const maquette = await page.evaluate(() => document.querySelector('#mosqueInfo') ? document.querySelector('#mosqueInfo').textContent : '');
ok(maquette.includes('THE FAÇADE') && !maquette.includes('LA FAÇADE'), 'les fiches de la maquette (index.html) sont traduites aussi');
ok(await page.evaluate(() => /Menu|Sanctuary|SANCTUARY/i.test(document.querySelector('[data-action="interior"]')?.textContent || '')), 'les boutons de la maquette suivent la langue');

// dialogue de Tapama en anglais, avec le prénom
await page.evaluate(() => window.GameUI.hide());
await page.evaluate(() => window.Tapama.play('appel'));
await wait(600);
ok(await page.evaluate(() => document.querySelector('.tp-d-text').textContent.startsWith('« Moussa, I found something near the mosque.')), 'Tapama parle anglais et appelle le joueur par son prénom');
ok(await page.evaluate(() => /Next|Finish/.test(document.querySelector('.tp-d-next').textContent) && /Skip the dialogue/.test(document.querySelector('.tp-d-skip').textContent)), 'les boutons du dialogue sont en anglais');
await page.keyboard.press('Enter'); await wait(380);
ok(await page.evaluate(() => document.querySelector('.tp-d-tab .tp-d-name').textContent === 'Moussa'), 'la réplique du joueur porte son prénom');
await page.evaluate(() => window.Tapama.radio({ mood: 'neutre', text: 'Tu as trouvé quelque chose, {nom} ? Montre-moi.' }));
await page.keyboard.press('Escape'); await wait(400);
ok(await page.evaluate(() => document.querySelector('.tp-r-text').textContent.includes('Did you find something, Moussa?')), 'les appels radio sont traduits');

// retour au français : rien ne reste en anglais
await page.evaluate(() => window.GameUI.show('options-jeu'));
await wait(600);
await inScreen(() => root.querySelector('.lang[data-lang="fr"]').click());
await wait(700);
ok((await textOf()).includes('Langue du jeu'), 'retour en français : l’écran des options est de nouveau en français');
const maq2 = await page.evaluate(() => document.querySelector('#mosqueInfo').textContent);
ok(maq2.includes('LA FAÇADE') && !maq2.includes('THE FAÇADE'), 'retour en français : la maquette aussi (sans recharger)');

// --- Taille du texte
await page.evaluate(() => window.GameUI.show('options-jeu'));
await wait(600);
const sizeM = await fontPx();
const pickSize = (label) => inScreen((r, lab) => {
  const row = Array.from(r.querySelectorAll('.seg')).filter((s) => ['S', 'M', 'L'].every((x) => s.textContent.includes(x)))[0];
  Array.from(row.querySelectorAll('span')).find((sp) => sp.textContent.trim() === lab).click();
}, label);
await pickSize('L');
await wait(700);
const sizeL = await fontPx();
ok(sizeL > sizeM * 1.1 && sizeL < sizeM * 1.3, `taille du texte L : titres ${sizeM.toFixed(0)} → ${sizeL.toFixed(0)} px (+${((sizeL / sizeM - 1) * 100).toFixed(0)} %)`);
ok(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize) > 17.5), 'les textes de la maquette et de Tapama grandissent aussi');
await shot('texte-grand');
await pickSize('S');
await wait(700);
const sizeS = await fontPx();
ok(sizeS < sizeM * 0.95, `taille du texte S : titres ${sizeM.toFixed(0)} → ${sizeS.toFixed(0)} px`);
await pickSize('M');
await wait(500);
ok(Math.abs((await fontPx()) - sizeM) < 0.5, 'taille M : retour à la taille d’origine');

// --- Autres réglages
const toggle = (key) => page.evaluate((k) => {
  const e = document.querySelector('.gu-screen.on').shadowRoot.querySelector(`.sw[data-key="${k}"]`);
  e.click();
  return window.GameUI.settings()[k];
}, key);
await page.evaluate(() => window.GameUI.show('options-affichage'));
await wait(600);
ok((await toggle('showHints')) === false && await page.evaluate(() => document.body.classList.contains('gu-nohints')), 'aides de commandes désactivées : bulles d’aide masquées');
await page.evaluate(() => window.Tapama.play('vol'));
await wait(500);
ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tp-d-hints')).display === 'none'), 'les aides de touches du dialogue sont masquées');
await page.evaluate(() => { window.GameUI.hide(); window.Tapama.play('vol'); });
await page.keyboard.press('Escape'); await wait(300);
await page.evaluate(() => window.GameUI.show('options-affichage'));
await wait(500);
ok((await toggle('shadows')) === false && await page.evaluate(() => window.MosqueScene.renderer.shadowMap.enabled === false), 'ombres portées désactivées : le rendu n’utilise plus d’ombres');
ok((await toggle('shadows')) === true && await page.evaluate(() => window.MosqueScene.renderer.shadowMap.enabled === true), 'ombres portées réactivées');
await inScreen(() => root.querySelectorAll('.q')[1].click());
await wait(300);
ok(await page.evaluate(() => localStorage.getItem('taama.quality') === 'low' && window.MosqueScene.renderer.getPixelRatio() <= 1), 'qualité « Économie » : résolution réduite tout de suite');
await inScreen(() => root.querySelectorAll('.q')[0].click());
await wait(300);
ok(await page.evaluate(() => localStorage.getItem('taama.quality') === null), 'qualité « Auto » : réglage forcé retiré');
await page.evaluate(() => window.GameUI.show('options-jeu'));
await wait(600);
ok((await toggle('highContrast')) === true && await page.evaluate(() => document.querySelector('.gu-screen.on').hasAttribute('data-contrast')), 'contraste renforcé : appliqué à l’écran affiché');
ok((await toggle('reduceShake')) === true && await page.evaluate(() => window.GameSettings.reduceShake === true), 'secousses de caméra réduites : réglage lu par le jeu');
ok((await toggle('aimAssist')) === false && await page.evaluate(() => window.GameSettings.aimAssist === false), 'aide à la visée désactivée : réglage lu par le jeu');
ok((await toggle('rumble')) === false && await page.evaluate(() => window.GameSettings.rumble === false), 'vibrations désactivées : réglage lu par la manette');
await toggle('aimAssist'); await toggle('rumble'); await toggle('reduceShake'); await toggle('highContrast');

// cinématiques passables
ok((await toggle('skippableCutscenes')) === false, 'cinématiques non passables');
await page.evaluate(() => { window.GameUI.hide(); window.Tapama.play('appel'); });
await wait(500);
ok(await page.evaluate(() => getComputedStyle(document.querySelector('.tp-d-skip')).display === 'none'), 'le bouton « Passer le dialogue » disparaît');
await page.keyboard.press('Escape'); await wait(300);
ok(await page.evaluate(() => window.Tapama.isBusy()), 'Échap ne passe plus le dialogue');
await page.evaluate(() => window.GameUI.show('carte'));
await wait(500);
await inScreen(() => root.querySelector('[data-act="cine-replay"]').click());
await wait(700);
await page.keyboard.press('Escape'); await wait(400);
ok((await screenId()) === 'cinematique', 'Échap ne passe plus la cinématique');
ok(await inScreen(() => getComputedStyle(root.querySelector('[data-act="cine-skip"]')).display === 'none'), 'le bouton « Passer la cinématique » disparaît');
await page.evaluate(() => { window.Tapama.isBusy() && window.GameUI.show('main'); });

// volumes
await page.evaluate(() => window.GameUI.show('options-audio'));
await wait(600);
await inScreen(() => {
  const trk = root.querySelector('.trk[data-key="effects"]');
  const r = trk.getBoundingClientRect();
  trk.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 2, clientY: r.top + 2, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
await wait(200);
ok(await page.evaluate(() => window.GameAudio.gain('effects') === 0 && window.GameAudio.gain('music') > 0.9), 'le curseur « Effets » à 0 coupe les effets sans toucher la musique');
await inScreen(() => {
  const trk = root.querySelector('.trk[data-key="volume"]');
  const r = trk.getBoundingClientRect();
  trk.dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + 2, clientY: r.top + 2, bubbles: true }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
});
await wait(200);
ok(await page.evaluate(() => window.GameAudio.gain('music') === 0 && window.GameAudio.gain('ambience') === 0), 'le volume général à 0 coupe tout');
ok(await page.evaluate(() => { const a = new Audio(); a.volume = 0.8; window.GameAudio.track(a, 'ambience'); const v = a.volume; return v === 0.8; }), 'un son suivi garde son volume d’origine en lecture');

/* ===== 7. Rappel de l'objectif ===== */
console.log('\n=== Rappel de l’objectif ===');
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI', { timeout: 60000 });
await wait(500);
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('taama.settings.v1')); s.objectiveReminder = false; localStorage.setItem('taama.settings.v1', JSON.stringify(s)); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction('!!window.GameUI', { timeout: 60000 });
await wait(500);
await page.evaluate(() => { document.querySelector('.gp-toast')?.remove(); window.GameUI.show('main'); });
await wait(500);
await inScreen(() => root.querySelector('[data-act="continue"]').click());
await wait(700);
ok(await page.evaluate(() => { const t = document.querySelector('.gp-toast'); return !t || !t.classList.contains('is-on') || !/Objectif|Objective/.test(t.textContent); }), 'rappel désactivé : aucun message d’objectif à la reprise');

await browser.close();
console.log('\n--- console (erreurs) ---');
console.log(logs.join('\n') || '(aucune)');
