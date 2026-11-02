/* ==========================================================
   INTERFACE DU JEU « TAAMA » — écrans du canvas, en jeu
   ----------------------------------------------------------
   Remplace l'ancienne intro (texte d'entrée, tablette « Décolle le
   drone », compte à rebours, vidéo) par :

     Lancement → Chargement → Cinématique → Menu principal
        ├─ Nouvelle partie → (cinématique) → appel de Tapama → jeu
        ├─ Continuer       → jeu
        ├─ Destinations    (carte de l'Afrique de l'Ouest)
        ├─ Options         (audio · commandes · affichage · jeu et langue)
        └─ Crédits
     Pause (⌂ MENU, Échap, P ou START dans la maquette)

   Les écrans sont générés depuis design/ecrans par
   tools/build-game-ui.mjs (app/game-screens.js) et vivent dans des
   Shadow DOM. Réglages et sauvegarde : app/game-save.js.

   ?legacy=1 dans l'URL rétablit l'ancienne intro.

   API : window.GameUI = { show, isOpen, openPause, settings, save, … }
   ========================================================== */

import { SCREENS } from './game-screens.js?v=9';
import * as G from './game-save.js';
import { detectQuality, mediaUrl } from './device-quality.js?v=5';
import * as P from './player-profile.js';
import * as I18n from './i18n.js';
import { t, translateTree } from './i18n.js';
import { sendProfile } from './player-sync.js';
import { SEQUENCES } from './tapama-core.js';
import { attachCharacter, rotateCharacter, releaseCharacter } from './character-viewer.js?v=4';

const NEW_UI = window.__NEW_UI !== false;
const STAGE_W = 1440;
const STAGE_H = 810;
const INPUT_LOCK_MS = 250;
const CINE_CUT = 10;                    // la vidéo d'intro est coupée à 10 s (comme l'ancienne intro)
const CINE_VIDEO = 'assets/videos/intro-drone format pc.mp4';   // toujours 16:9 : l'écran est en 16:9
const LOAD_MIN_MS = 2400;               // temps minimal d'affichage du chargement (le temps de lire une astuce)
const LOAD_TIMEOUT_MS = 90000;
const PLAYCLOCK_MS = 15000;
const QUALITY_KEY = 'taama.quality';
const INTRO_KEY = 'taama.seenIntro';

/* ---------------- Stockage ---------------- */

const store = (() => {
  try { const s = window.localStorage; s.getItem('x'); return s; } catch (_) { return null; }
})();
const iso = () => new Date().toISOString();

let settings = G.loadSettings(store);
let save = G.loadSave(store);
let profile = P.loadProfile(store);           // prénom + âge du joueur (créé à la toute première partie)

function persistSave() { if (save) G.writeSave(store, save); }
function persistProfile() { if (profile) P.saveProfile(store, profile); }
function persistSettings() { G.saveSettings(store, settings); window.GameSettings = settings; window.GameAudio?.set(settings); }

/* ---------------- Utilitaires ---------------- */

const norm = (s) => String(s || '').replace(/\s+/g, ' ').replace(/'/g, '’').trim();
const $ = (root, sel) => root.querySelector(sel);
const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function toast(msg) {
  const k = window.GamepadKit;
  if (k && k.toast) k.toast(msg);
}

/* ==========================================================
   HÔTE + MISE À L'ÉCHELLE
   ========================================================== */

const host = document.createElement('div');
host.id = 'guRoot';
host.hidden = true;
host.innerHTML = '<div class="gu-bg"></div><div class="gu-stage"></div>';
const stageEl = host.querySelector('.gu-stage');
const fpsEl = document.createElement('div');
fpsEl.className = 'gu-fps';
fpsEl.hidden = true;

function fit() {
  // zone réellement occupée par l'interface (et non la taille supposée de la fenêtre)
  const vv = window.visualViewport;
  const w = host.clientWidth || (vv && vv.width) || window.innerWidth;
  const h = host.clientHeight || (vv && vv.height) || window.innerHeight;
  const s = Math.min(w / STAGE_W, h / STAGE_H);
  stageEl.style.transform = `translate(-50%, -50%) scale(${s})`;
  host.style.setProperty('--gm-s', String(Math.max(0.8, s)));              // les noms sur la carte grandissent avec l'écran
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);       // la page ne doit jamais être décalée
}

const BASE_CSS = `
:host([data-contrast]) *{text-shadow:0 0 2px rgba(0,0,0,.95),0 0 9px rgba(0,0,0,.65)}
:host{display:block}
[data-act],[tabindex],label[data-confirm]{cursor:pointer}
button:focus-visible,[tabindex]:focus-visible{outline:3px solid #F8F3EA;outline-offset:3px}
.gu-focus{outline:3px solid #F8F3EA!important;outline-offset:3px!important}
[aria-disabled="true"]{opacity:.5;cursor:not-allowed}
.sw{cursor:pointer}
.sw.off{background:rgba(248,243,234,.3)}
.sw.off i{right:auto;left:4px;background:#F8F3EA}
.seg span,.trk,.q,.lang{cursor:pointer}
`;

/* ==========================================================
   ÉCRANS : montage, navigation
   ========================================================== */

let current = null;                      // { id, el, root, cleanup }
const stack = [];                        // écrans précédents (bouton « Menu principal » = retour)
let open = false;
let inGame = false;                      // une partie est en cours (pause possible)
let lockUntil = 0;
let kbIndex = -1;
let ng = { cine: true, tuto: true };     // options de « Nouvelle partie »
let newGameConfirmed = false;
let cineThen = null;                     // que faire quand la cinématique se termine

const locked = () => performance.now() < lockUntil;

/* Fond « vivant » : lent zoom/dérive de l'image, soleil qui pulse, voile de brume qui glisse (équivalent d'un GIF, sans poids) */
const BG_ANIM_CSS = `:host{display:block}
img{transform-origin:62% 55%;animation:bgdrift 38s ease-in-out infinite alternate;will-change:transform}
.bg-glow,.bg-haze{position:absolute;pointer-events:none}
.bg-glow{inset:0;background:radial-gradient(ellipse 38% 34% at 72% 12%,rgba(255,196,130,.55) 0%,rgba(255,170,100,.18) 55%,rgba(255,160,90,0) 100%);mix-blend-mode:screen;animation:bgglow 9s ease-in-out infinite alternate}
.bg-haze{left:-30%;top:46%;width:160%;height:34%;background:linear-gradient(90deg,rgba(255,214,170,0) 0%,rgba(255,214,170,.22) 35%,rgba(255,214,170,.12) 60%,rgba(255,214,170,0) 100%);filter:blur(26px);animation:bghaze 46s linear infinite alternate}
@keyframes bgdrift{from{transform:scale(1.04) translate3d(1.2%,0,0)}to{transform:scale(1.16) translate3d(-2.2%,-1.2%,0)}}
@keyframes bgglow{from{opacity:.55;transform:translate3d(-2%,0,0) scale(1)}to{opacity:1;transform:translate3d(2%,1%,0) scale(1.12)}}
@keyframes bghaze{from{transform:translate3d(-8%,0,0)}to{transform:translate3d(8%,-4%,0)}}
@media (prefers-reduced-motion:reduce){img,.bg-glow,.bg-haze{animation:none}}`;

function mount(id) {
  const def = SCREENS[id];
  if (!def) throw new Error(`Écran inconnu : ${id}`);
  const el = document.createElement('div');
  el.className = 'gu-screen';
  el.dataset.screen = id;
  el.toggleAttribute('data-contrast', !!settings.highContrast);
  const root = el.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${BASE_CSS}${def.css}</style>${def.html}`;
  stageEl.appendChild(el);
  // fond plein cadre : couvre toute la fenêtre, derrière l'interface centrée
  let bgEl = null;
  let bgRoot = null;
  if (def.bg) {
    bgEl = document.createElement('div');
    bgEl.className = 'gu-bgl';
    bgRoot = bgEl.attachShadow({ mode: 'open' });
    bgRoot.innerHTML = `<style>${BG_ANIM_CSS}</style>${def.bg}`;
    const bgImg = bgRoot.querySelector('img');
    if (bgImg) bgImg.insertAdjacentHTML('afterend', '<div class="bg-glow"></div><div class="bg-haze"></div>');
    host.insertBefore(bgEl, stageEl);
  }
  return { id, el, root, bgEl, bgRoot, cleanup: null };
}

function show(id, { push = false } = {}) {
  if (!NEW_UI) return;
  if (current && push) stack.push(current.id);
  const prev = current;
  if (prev && prev.cleanup) { try { prev.cleanup(); } catch (_) {} }
  const scr = mount(id);
  current = scr;
  open = true;
  host.hidden = false;
  host.classList.toggle('is-pause', id === 'pause');
  host.dataset.screen = id;                       // les marges autour de l'écran prennent l'ambiance de l'écran affiché
  document.documentElement.classList.toggle('gu-paused', id === 'pause');   // masque l'appel radio de Tapama pendant la pause
  fit();
  lockUntil = performance.now() + INPUT_LOCK_MS;
  kbIndex = -1;
  setupScreen(scr);
  requestAnimationFrame(() => { scr.el.classList.add('on'); if (scr.bgEl) scr.bgEl.classList.add('on'); });
  if (prev) {
    prev.el.classList.remove('on');
    if (prev.bgEl) prev.bgEl.classList.remove('on');
    setTimeout(() => { prev.el.remove(); if (prev.bgEl) prev.bgEl.remove(); }, 300);
  }
}

function back() {
  const id = stack.pop();
  if (id) show(id);
  else if (current && current.id !== 'main') { if (inGame) openPause(); else show('main'); }
}

function hideUI() {
  open = false;
  host.hidden = true;
  releaseCharacter();
  document.documentElement.classList.remove('gu-paused');
  if (current) { if (current.cleanup) { try { current.cleanup(); } catch (_) {} } current.el.remove(); if (current.bgEl) current.bgEl.remove(); }
  current = null;
  stack.length = 0;
}

/* ---------- Liaisons de texte (data-bind) ---------- */

function bindAll(root, map) {
  $$(root, '[data-bind]').forEach((el) => {
    const v = map[el.dataset.bind];
    if (v == null) return;
    if (typeof v === 'object' && v.html != null) el.innerHTML = v.html;
    else el.textContent = v;
  });
  $$(root, '[data-bind-width]').forEach((el) => { const v = map[el.dataset.bindWidth]; if (v != null) el.style.width = v; });
  $$(root, '[data-bind-left]').forEach((el) => { const v = map[el.dataset.bindLeft]; if (v != null) el.style.left = v; });
}

function saveBinds() {
  const n = save ? save.sequence : 3;
  return {
    playerName: profile ? profile.name : 'À définir',
    tapamaQuote: `« ${P.fillName(t(SEQUENCES.appel.lines[0].text), profile ? profile.name : '')} »`,
    seqLabel: G.sequenceLabel(n),
    seqTwoLines: { html: `Séquence ${n}<br>${G.sequenceTitle(n)}` },
    progress: `${n} sur ${G.SEQUENCE_COUNT}`,
    progressLong: `Séquence ${n} sur ${G.SEQUENCE_COUNT}`,
    progressPct: `${G.progressPercent(n)}%`,
    objective: G.sequenceObjective(n),
    lastPlayed: save ? G.formatLastPlayed(save.lastPlayed) : '—',
    playtime: save ? G.formatPlaytime(save.playMs) : '—',
    destProgress: (() => { const d = G.destinationsProgress(); return `${d.open} sur ${d.total}`; })(),
  };
}

/* ---------- Découvertes (puces du journal) ---------- */

function fillDiscoveries(root) {
  const chips = $$(root, '.chip').filter((c) => G.DISCOVERIES.some((d) => norm(c.textContent) === d.label));
  if (chips.length < 2) return;
  const found = chips.find((c) => c.style.border && /solid/.test(c.style.border) && c.querySelector('polyline'));
  const locked = chips.find((c) => c !== found);
  if (!found || !locked) return;
  const tplFound = found.cloneNode(true);
  const tplLocked = locked.cloneNode(true);
  const parent = chips[0].parentElement;
  const have = save ? save.discoveries : [];
  parent.replaceChildren(...G.DISCOVERIES.map((d) => {
    const c = (have.includes(d.id) ? tplFound : tplLocked).cloneNode(true);
    const svg = c.querySelector('svg');
    c.replaceChildren(...(svg ? [svg] : []), document.createTextNode(d.label));
    return c;
  }));
}

/* ==========================================================
   COMMANDES : clavier + manette
   ========================================================== */

const FOCUS_SEL = '[data-act]:not([aria-disabled="true"]), .sw[tabindex], .trk[tabindex], .seg[tabindex], .q[tabindex], .lang[tabindex], [data-confirm], [data-dest][tabindex]';

function focusables() {
  if (!current) return [];
  const extra = current.bgRoot ? $$(current.bgRoot, '[data-dest][tabindex]') : [];       // marqueurs de la carte (dans le fond)
  return [...$$(current.root, FOCUS_SEL), ...extra].filter((el) => el.offsetParent !== null || el.getClientRects().length);
}

function paintFocus() {
  if (!current) return;
  const items = focusables();
  $$(current.root, '.gu-focus').forEach((e) => e.classList.remove('gu-focus'));
  if (current.bgRoot) $$(current.bgRoot, '.gu-focus').forEach((e) => e.classList.remove('gu-focus'));
  const el = items[kbIndex];
  if (el) el.classList.add('gu-focus');
}

function moveFocus(step) {
  const items = focusables();
  if (!items.length) return;
  if (kbIndex < 0) kbIndex = step > 0 ? 0 : items.length - 1;
  else kbIndex = (kbIndex + step + items.length) % items.length;
  paintFocus();
}

function adjustFocused(dir) {
  const items = focusables();
  const el = items[kbIndex];
  if (!el) return false;
  if (el.matches('.trk')) { setSlider(el, Number(el.dataset.value) + dir * 5); return true; }
  if (el.matches('.seg')) { stepSeg(el, dir); return true; }
  return false;
}

function activateFocused() {
  const items = focusables();
  if (kbIndex < 0) {
    if (current && current.id === 'lancement') { act('start'); return; }
    kbIndex = 0; paintFocus(); return;
  }
  const el = items[kbIndex];
  if (!el) return;
  if (el.matches('[data-dest]')) {                   // Entrée sur la destination déjà choisie et ouverte : on y va
    const id = el.dataset.dest;
    if (mapApi && mapApi.sel() === id && mapApi.isOpen(id)) act('resume'); else el.click();
    return;
  }
  if (el.matches('.seg')) stepSeg(el, 1);
  else if (!el.matches('.trk')) el.click();
}

function goBackKey() {
  if (!current) return;
  const id = current.id;
  if (id === 'cinematique') act('cine-skip');
  else if (id === 'pause') act('resume-game');
  else if (id === 'main' || id === 'lancement' || id === 'chargement') return;
  else back();
}

window.addEventListener('keydown', (e) => {
  // e.target est l'hôte du Shadow DOM : le vrai champ de saisie est en tête du chemin de l'événement
  const t = (e.composedPath && e.composedPath()[0]) || e.target;
  if (t && t.nodeType === 1 && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;
  const k = e.key;
  if (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) return;   // un dialogue de Tapama a la priorité

  if (!open) {
    // Pause : Échap ou P, seulement dans la maquette (pas dans le drone ni le sanctuaire)
    if (inGame && !e.ctrlKey && !e.metaKey && !e.altKey && !e.repeat && (k === 'Escape' || k === 'p' || k === 'P') && overview() && !window.Tapama?.isBusy?.()) {
      e.preventDefault(); e.stopPropagation(); openPause();
    }
    return;
  }

  if (e.ctrlKey || e.metaKey || /^F\d+$/.test(k)) return;
  e.preventDefault(); e.stopPropagation();
  if (locked()) return;

  if (k === 'ArrowDown') moveFocus(1);
  else if (k === 'ArrowUp') moveFocus(-1);
  else if (k === 'ArrowRight') { navLR(1); }
  else if (k === 'ArrowLeft') { navLR(-1); }
  else if (!e.repeat && (k === 'Enter' || k === ' ' || k === 'x' || k === 'X')) activateFocused();
  else if (!e.repeat && k === 'Escape') goBackKey();
}, true);

/* Manette */
let padOn = false, padLast = 0, padZoomT = 0;
/* Carte « Destinations » : stick gauche = déplacer la carte, stick droit haut/bas = zoom */
function padMapSticks(p) {
  const now = performance.now(), dt = Math.min(0.05, (now - (padLast || now)) / 1000); padLast = now;
  const g = mapApi && mapApi.geo && mapApi.geo(); if (!g || !g.map) return;
  const st = p.state();
  if (Math.abs(st.lx) > 0.12 || Math.abs(st.ly) > 0.12) g.map.panBy([st.lx * 760 * dt, st.ly * 760 * dt], { animate: false });
  padZoomT -= dt;
  if (Math.abs(st.ry) > 0.5 && padZoomT <= 0) { padZoomT = 0.38; if (st.ry < 0) g.zoomIn(); else g.zoomOut(); }
}
function padLoop() {
  requestAnimationFrame(padLoop);
  const p = window.GamepadKit;
  if (!open || !p || !p.connected() || locked()) { padLast = 0; return; }
  if (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) return;
  if (current && current.id === 'carte') padMapSticks(p); else padLast = 0;
  if (p.justPressed('UP')) moveFocus(-1);
  else if (p.justPressed('DOWN')) moveFocus(1);
  else if (p.justPressed('RIGHT')) { navLR(1); }
  else if (p.justPressed('LEFT')) { navLR(-1); }
  else if (p.justPressed('A')) activateFocused();
  else if (p.justPressed('B')) goBackKey();
  else if (p.justPressed('START') && current && current.id === 'pause') act('resume-game');
}
function startPad() { if (!padOn) { padOn = true; requestAnimationFrame(padLoop); } }

/* ==========================================================
   RÉGLAGES : contrôles génériques des écrans d'options
   ========================================================== */

const SLIDER_KEYS = {
  'Volume général': 'volume', 'Musique': 'music', 'Effets (pas, gadget, tirs)': 'effects',
  'Drone (hélices, scan)': 'drone', 'Ambiance (vent, ville)': 'ambience',
};
const SWITCH_KEYS = {
  'Couper le son quand le jeu passe en arrière-plan': 'muteBackground',
  'Couper tous les sons': 'muteAll',
  'Plein écran': 'fullscreen',
  'Ombres portées': 'shadows',
  'Adapter selon la connexion': 'netAdapt',
  'Économiser mes données': 'saveData',
  'Afficher l’horloge du jeu (cycle jour et nuit)': 'showClock',
  'Afficher les aides de commandes à l’écran': 'showHints',
  'Afficher le compteur d’images par seconde': 'showFps',
  'Cinématiques passables': 'skippableCutscenes',
  'Rappel de l’objectif en cours': 'objectiveReminder',
  'Aide à la visée du gadget': 'aimAssist',
  'Sous-titres': 'subtitles',
  'Réduire les secousses de la caméra': 'reduceShake',
  'Contraste renforcé des textes': 'highContrast',
  'Vibrations de la manette': 'rumble',
};
const NG_KEYS = { 'Voir la cinématique d’introduction': 'cine', 'Tutoriel des commandes avec Tapama': 'tuto' };
const SEG_KEYS = { 'Vitesse du temps (jour et nuit)': 'timeSpeed', 'Taille du texte': 'textSize' };
const QUALITY_ORDER = ['auto', 'low', 'mid', 'high'];
const QUALITY_NAMES = { low: 'Économie', mid: 'Équilibrée', high: 'Élevée' };

const CHECK_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F9D58B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-chk style="vertical-align:-3px;margin-left:8px"><polyline points="4,12 10,18 20,6"/></svg>';

function paintSlider(trk, v) {
  const val = clamp(Math.round(v), 0, 100);
  trk.dataset.value = String(val);
  const fil = $(trk, '.fil'), knob = $(trk, '.knob'), num = trk.parentElement.querySelector('.val');
  if (fil) fil.style.width = val + '%';
  if (knob) knob.style.left = val + '%';
  if (num) num.textContent = String(val);
  trk.setAttribute('aria-valuenow', String(val));
}

function setSlider(trk, v) {
  const val = clamp(Math.round(v), 0, 100);
  paintSlider(trk, val);
  setSetting(trk.dataset.key, val);
}

function segValue(span) {
  const t = norm(span.textContent);
  return /^×\d+$/.test(t) ? Number(t.slice(1)) : t;
}

function paintSeg(seg, value) {
  $$(seg, 'span').forEach((s) => s.classList.toggle('on', segValue(s) === value));
}

function stepSeg(seg, dir) {
  const spans = $$(seg, 'span');
  const i = spans.findIndex((s) => s.classList.contains('on'));
  const next = spans[(i + dir + spans.length) % spans.length];
  if (next) pickSeg(seg, next);
}

function pickSeg(seg, span) {
  const v = segValue(span);
  paintSeg(seg, v);
  setSetting(seg.dataset.key, v);
}

function paintQuality(root) {
  $$(root, '.q[data-q]').forEach((q) => {
    const on = q.dataset.q === settings.quality;
    q.classList.toggle('on', on);
    q.querySelectorAll('[data-chk]').forEach((c) => c.remove());
    if (on) { const b = q.querySelector('b'); if (b) b.insertAdjacentHTML('beforeend', CHECK_SVG); }
    q.setAttribute('aria-pressed', String(on));
  });
}

function paintLangCards(root) {
  $$(root, '.lang[data-lang]').forEach((c) => {
    const on = c.dataset.lang === settings.lang;
    c.classList.toggle('on', on);
    c.querySelectorAll('[data-chk]').forEach((x) => x.remove());
    const badge = c.firstElementChild;
    if (badge) badge.style.background = on ? '#F9D58B' : 'rgba(248,243,234,.9)';
    if (on) c.insertAdjacentHTML('beforeend', CHECK_SVG.replace('margin-left:8px', 'margin-left:auto'));
  });
}

/* Options › Affichage : deux réglages réseau ajoutés sous « Ombres portées » (clonés de la ligne existante, sans toucher au design) */
function injectNetRows(root) {
  const rows = $$(root, '.row');
  const sh = rows.find((r) => r.firstElementChild && norm(r.firstElementChild.textContent) === 'Ombres portées');
  if (!sh || root.querySelector('[data-net-row]')) return;
  let after = sh;
  for (const label of ['Adapter selon la connexion', 'Économiser mes données']) {
    const r = sh.cloneNode(true);
    r.dataset.netRow = '1';
    r.firstElementChild.textContent = label;
    after.insertAdjacentElement('afterend', r);
    after = r;
  }
}

function initControls(root) {
  injectNetRows(root);
  $$(root, '.trk').forEach((trk) => {
    const lab = trk.parentElement.querySelector('.lab');
    const key = lab && SLIDER_KEYS[norm(lab.textContent)];
    if (!key) return;
    trk.dataset.key = key;
    trk.tabIndex = 0;
    trk.setAttribute('role', 'slider');
    trk.setAttribute('aria-label', norm(lab.textContent));
    paintSlider(trk, settings[key]);
  });
  $$(root, '.sw').forEach((sw) => {
    const label = norm(sw.parentElement.firstElementChild.textContent);
    if (SWITCH_KEYS[label]) { sw.dataset.key = SWITCH_KEYS[label]; sw.classList.toggle('off', !settings[sw.dataset.key]); }
    else if (NG_KEYS[label]) { sw.dataset.ng = NG_KEYS[label]; sw.classList.toggle('off', !ng[sw.dataset.ng]); }
    else return;
    sw.tabIndex = 0;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-label', label);
    sw.setAttribute('aria-checked', String(!sw.classList.contains('off')));
  });
  $$(root, '.seg').forEach((seg) => {
    const key = SEG_KEYS[norm(seg.parentElement.firstElementChild.textContent)];
    if (!key) return;
    seg.dataset.key = key;
    seg.tabIndex = 0;
    paintSeg(seg, settings[key]);
  });
  $$(root, '.q').forEach((q, i) => {
    if (!QUALITY_ORDER[i]) return;
    q.dataset.q = QUALITY_ORDER[i];
    q.tabIndex = 0;
    q.setAttribute('role', 'button');
    q.querySelectorAll('svg').forEach((s) => s.remove());
  });
  paintQuality(root);
  $$(root, '.lang').forEach((c) => {
    const badge = c.firstElementChild && norm(c.firstElementChild.textContent);
    if (badge === 'FR' || badge === 'EN') { c.dataset.lang = badge.toLowerCase(); c.tabIndex = 0; c.setAttribute('role', 'button'); c.querySelectorAll('svg').forEach((s) => s.remove()); }
  });
  paintLangCards(root);
}

function setSetting(key, value) {
  settings = { ...settings, [key]: value };
  persistSettings();
  applyOne(key);
}

/* ---------- Application des réglages au jeu ---------- */

let fpsRaf = 0;
function fpsLoop(t0 = performance.now(), n = 0) {
  fpsRaf = requestAnimationFrame(() => {
    const t = performance.now();
    if (t - t0 >= 500) { fpsEl.textContent = `${Math.round((n * 1000) / (t - t0))} images/s`; fpsLoop(t, 0); }
    else fpsLoop(t0, n + 1);
  });
}

function syncSoundButton() {
  const btn = document.getElementById('soundToggle');
  const lbl = document.getElementById('soundLabel');
  if (!btn || !lbl) return;
  const isOn = /ON/.test(lbl.textContent);
  if (isOn === settings.muteAll) btn.click();      // l'état du bouton doit être l'inverse de « tout couper »
}

function applyOne(key) {
  switch (key) {
    case 'volume': case 'music': case 'effects': case 'drone': case 'ambience': case 'muteBackground':
      window.GameAudio?.set(settings);               // volumes par catégorie (game-audio.js)
      break;
    case 'muteAll': window.GameAudio?.set(settings); syncSoundButton(); break;
    case 'shadows': window.MosqueScene?.setShadows?.(settings.shadows); break;
    case 'netAdapt': window.Quality?.adapt?.(settings.netAdapt); break;          // Adapter selon la connexion (réseau lent = moins d'octets)
    case 'saveData': window.Quality?.saveData?.(settings.saveData); break;       // Économiser mes données : force le palier réseau lent
    case 'showHints': document.body.classList.toggle('gu-nohints', !settings.showHints); break;
    case 'textSize': applyTextSize(); break;
    case 'timeSpeed': window.DayCycle?.setSpeed?.(settings.timeSpeed); break;
    case 'showClock': window.DayCycle?.setClockVisible?.(settings.showClock); break;
    case 'fullscreen':
      try {
        if (settings.fullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen?.();
        else if (!settings.fullscreen && document.fullscreenElement) document.exitFullscreen?.();
      } catch (_) {}
      break;
    case 'showFps':
      fpsEl.hidden = !settings.showFps;
      cancelAnimationFrame(fpsRaf);
      if (settings.showFps) fpsLoop();
      break;
    case 'lang': applyLanguage(); break;
    case 'highContrast':
      document.body.classList.toggle('gu-contrast', settings.highContrast);
      if (current) current.el.toggleAttribute('data-contrast', !!settings.highContrast);
      break;
    case 'quality':
      try {
        if (settings.quality === 'auto') store && store.removeItem(QUALITY_KEY);
        else store && store.setItem(QUALITY_KEY, settings.quality);
      } catch (_) {}
      {
        // la résolution et les ombres changent tout de suite ; le jeu de tuiles (détail du quartier) au prochain lancement
        const preset = window.MosqueScene?.applyQuality?.(detectQuality());
        if (preset) window.MosqueScene?.setShadows?.(settings.shadows && preset.shadows);
      }
      toast('Qualité enregistrée : elle s’appliquera au prochain lancement du jeu.');
      break;
    default: break;
  }
  window.dispatchEvent(new CustomEvent('settings:changed', { detail: { key, value: settings[key], settings } }));
}

function applyAll() {
  window.GameSettings = settings;
  document.documentElement.lang = settings.lang;
  // l'horloge et la vitesse du temps (DayCycle) sont appliquées au début de la partie
  ['volume', 'showFps', 'highContrast', 'showHints', 'textSize', 'netAdapt', 'saveData'].forEach(applyOne);
  if (settings.muteAll) setTimeout(syncSoundButton, 0);
}

/** Options › Taille du texte : petit, moyen, grand (textes des écrans via --ts, textes en rem via la taille de base). */
const TEXT_SCALE = { S: 0.9, M: 1, L: 1.18 };
function applyTextSize() {
  const k = TEXT_SCALE[settings.textSize] || 1;
  const root = document.documentElement;
  root.style.setProperty('--ts', String(k));
  root.style.fontSize = k === 1 ? '' : `${16 * k}px`;
}

function applyGameSettings() {
  window.DayCycle?.setSpeed?.(settings.timeSpeed);
  window.DayCycle?.setClockVisible?.(settings.showClock);
  if (!settings.shadows) window.MosqueScene?.setShadows?.(false);
}

/* Bip de test (réglage du volume) */
function testSound() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'sine'; o.frequency.value = 660;
    const vol = settings.muteAll ? 0 : (settings.volume / 100) * 0.25;
    g.gain.setValueAtTime(vol, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.5);
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + 0.5);
    setTimeout(() => ac.close(), 700);
  } catch (_) {}
}

/* ==========================================================
   ACTIONS
   ========================================================== */

function act(name) {
  if (!name) return;
  if (name.startsWith('options:')) return show('options-' + name.slice(8), { push: true });
  if (name.startsWith('lang:')) return setLang(name.slice(5));
  switch (name) {
    case 'start': return startLoading();
    case 'sound': return toggleMute();
    case 'back': return back();
    case 'new': return show('nouvelle', { push: true });
    case 'profile-save': return saveProfileFromScreen();
    case 'profile-edit': return showProfile({ first: false });
    case 'begin': return beginGame();
    case 'continue': case 'resume': return save ? resumeGame() : show('nouvelle', { push: true });
    case 'map': return show('carte', { push: true });
    case 'explore': return startExplore();
    case 'credits': return show('credits', { push: true });
    case 'journal': return openJournal();
    case 'delete-save': return deleteSave();
    case 'cine-skip': return skipCinematic();
    case 'cine-pause': return toggleCinePause();
    case 'cine-subs': return toggleSubtitles();
    case 'cine-replay': return playCinematic(() => show('carte'));
    case 'resume-game': return closePause();
    case 'to-main': return toMain();
    case 'test-sound': return testSound();
    case 'touch-settings': return window.TouchControls && window.TouchControls.openSettings();   // Options › Commandes : panneau des commandes tactiles (app/touch-controls.js)
    case 'reset-settings':
      settings = { ...G.DEFAULT_SETTINGS };
      persistSettings();
      ['volume', 'muteAll', 'timeSpeed', 'showClock', 'showFps', 'highContrast', 'quality', 'lang', 'netAdapt', 'saveData'].forEach(applyOne);
      return show(current.id);
    default: return undefined;
  }
}

function setLang(lang) {
  if (!['fr', 'en'].includes(lang)) return;
  setSetting('lang', lang);
  if (current) paintLangButtons(current.root);
}

/** Change la langue de tout le jeu : écrans, Tapama, interface de la maquette, messages. */
function applyLanguage() {
  I18n.setLang(settings.lang);
  document.documentElement.lang = settings.lang;
  if (settings.lang === 'en') I18n.observeDocument(); else I18n.stopObserving();
  I18n.applyToDocument();                          // fiches et boutons de la maquette (index.html)
  if (current) show(current.id);                   // l'écran affiché est reconstruit dans la nouvelle langue
}

function paintLangButtons(root) {
  const fr = $(root, '[data-act="lang:fr"]'), en = $(root, '[data-act="lang:en"]');
  if (!fr || !en) return;
  const activeStyle = root.__langActive || (root.__langActive = fr.getAttribute('style'));
  const idleStyle = root.__langIdle || (root.__langIdle = en.getAttribute('style'));
  fr.setAttribute('style', settings.lang === 'fr' ? activeStyle : idleStyle);
  en.setAttribute('style', settings.lang === 'en' ? activeStyle : idleStyle);
  fr.setAttribute('aria-pressed', String(settings.lang === 'fr'));
  en.setAttribute('aria-pressed', String(settings.lang === 'en'));
}

function toggleMute() {
  setSetting('muteAll', !settings.muteAll);
  paintSoundButton();
}

function paintSoundButton() {
  if (!current) return;
  const b = $(current.root, '[data-act="sound"]');
  if (!b) return;
  b.style.opacity = settings.muteAll ? '.55' : '';
  b.setAttribute('aria-label', t(settings.muteAll ? 'Son coupé' : 'Son activé'));
}

function deleteSave() {
  const b = current && $(current.root, '[data-act="delete-save"]');
  if (!b) return;
  if (b.dataset.armed !== '1') {
    b.dataset.armed = '1';
    b.dataset.label = b.textContent;
    b.textContent = t('Confirmer ?');
    setTimeout(() => { if (b.isConnected && b.dataset.armed === '1') { b.dataset.armed = ''; b.textContent = b.dataset.label; } }, 4000);
    return;
  }
  G.deleteSave(store);
  save = null;
  inGame = false;
  toast('Sauvegarde supprimée.');
  stack.length = 0;
  show('main');
}

/* ==========================================================
   LANCEMENT → CHARGEMENT → CINÉMATIQUE → MENU
   ========================================================== */

const TIPS = [
  'Maintiens le clic droit pour viser avec précision, puis clique pour tirer avec ton gadget.',
  'Appuie sur H à tout moment pour demander de l’aide à Tapama.',
  'Maj pour courir, X pour sauter, K pour t’agenouiller et te cacher.',
  'À la manette, A prend une photo avec le drone et RB filme.',
];
const FACTS = [
  'La Grande Mosquée de Djenné est construite en banco, une brique de terre crue.',
  'Le banco est un mélange de terre crue et de paille, refait chaque année par les habitants lors d’une grande fête.',
  'Les poutres de bois qui dépassent des murs servent d’échafaudage déjà en place pour réparer le bâtiment.',
];

function startLoading() {
  show('chargement');
  const scr = current;
  const r = scr.root;
  const t0 = performance.now();
  let pct = 0;
  let finished = false;
  let tipIdx = 0;

  const steps = $$(r, '.step');
  const tpl = steps.length === 4
    ? { done: steps[0].cloneNode(true), active: steps[2].cloneNode(true), wait: steps[3].cloneNode(true) }
    : null;
  const NAMES = ['Personnage et drone', 'Grande Mosquée', 'Rues et quartier voisin', 'Sons et ambiance'];

  function paintSteps() {
    if (!tpl) return;
    const tiles = window.MosqueScene && window.MosqueScene.tileStreamer && window.MosqueScene.tileStreamer.stats && window.MosqueScene.tileStreamer.stats();
    steps.forEach((old, i) => {
      const lo = i * 25;
      const state = pct >= lo + 25 ? 'done' : (pct >= lo ? 'active' : 'wait');
      const n = tpl[state].cloneNode(true);
      const spans = $$(n, ':scope > span');
      if (spans[0]) spans[0].textContent = t(NAMES[i]);
      if (spans[1]) {
        if (state === 'done') spans[1].textContent = t('Prêt');
        else if (state === 'wait') spans[1].textContent = t('En attente');
        else spans[1].textContent = (i === 2 && tiles && tiles.total) ? t('{n} sur {total}', { n: tiles.loaded, total: tiles.total }) : `${Math.round(((pct - lo) / 25) * 100)} %`;
      }
      old.replaceWith(n);
      steps[i] = n;
    });
  }

  function paint() {
    bindAll(r, {
      loadPct: `${Math.round(pct)} %`,
      loadLabel: t(pct >= 100 ? 'Prêt !' : 'Chargement de la maquette de Djenné…'),
    });
    $$(r, '[data-bind-width="loadPct"]').forEach((e) => { e.style.width = `${pct}%`; });
    paintSteps();
  }

  const cards = $$(r, '.card').filter((c) => /Astuce|savais/.test(c.textContent));
  function rotateTips() {
    tipIdx += 1;
    const [tip, fact] = cards;
    if (tip) tip.lastElementChild.textContent = t(TIPS[tipIdx % TIPS.length]);
    if (fact) fact.lastElementChild.textContent = t(FACTS[tipIdx % FACTS.length]);
  }
  if (cards[0]) cards[0].lastElementChild.textContent = t(TIPS[0]);
  if (cards[1]) cards[1].lastElementChild.textContent = t(FACTS[0]);
  const tipTimer = setInterval(rotateTips, 5000);

  // deux illustrations qui alternent en fondu, avec leurs points
  const slides = $$(r, '[data-slide]');
  const dots = $$(r, '[data-dot]');
  const dotOn = dots[0] && dots[0].getAttribute('style');
  const dotOff = dots[1] && dots[1].getAttribute('style');
  let slide = 0;
  const paintSlides = () => {
    slides.forEach((s, i) => { s.style.opacity = i === slide ? '1' : '0'; });
    dots.forEach((d, i) => d.setAttribute('style', i === slide ? dotOn : dotOff));
    bindAll(r, { slideLabel: t('Illustration {n} sur {total}', { n: slide + 1, total: slides.length }) });
  };
  const slideTimer = slides.length > 1 ? setInterval(() => { slide = (slide + 1) % slides.length; paintSlides(); }, 4200) : 0;

  const onPct = (e) => { pct = Math.max(pct, e.detail.pct); };
  window.addEventListener('mosque:loading', onPct);

  scr.cleanup = () => { finished = true; clearInterval(tipTimer); clearInterval(slideTimer); window.removeEventListener('mosque:loading', onPct); };

  // Démarre la maquette 3D (derrière l'interface) : même appel que l'ancienne intro
  try { window.startMosqueScene?.(); } catch (e) { console.error(e); }
  paint();

  (async function loop() {
    while (!finished) {
      const elapsed = performance.now() - t0;
      const ready = window.MosqueScene && window.MosqueScene.loaded;
      if (ready) pct = Math.max(pct, 100);
      paint();
      if (ready && elapsed >= LOAD_MIN_MS) break;
      if (elapsed > LOAD_TIMEOUT_MS) { toast('Le chargement est long : on continue.'); break; }
      await wait(160);
    }
    if (finished) return;
    pct = 100; paint();
    await wait(450);
    if (finished || current !== scr) return;
    afterLoading();
  })();
}

function afterLoading() {
  const seen = store && store.getItem(INTRO_KEY) === '1';
  // Première partie : le joueur donne son nom avant d'arriver au menu (Tapama l'appellera par son prénom)
  const next = () => (profile ? showMainMenu() : showProfile({ first: true }));
  if (!seen) playCinematic(() => { try { store && store.setItem(INTRO_KEY, '1'); } catch (_) {} next(); });
  else next();
}

function showMainMenu() {
  inGame = false;
  stack.length = 0;
  window.MosqueScene?.pauseLoop?.();            // la maquette ne tourne pas derrière le menu (batterie)
  show('main');
}

/* ---------- Cinématique ---------- */

const CAPTIONS = [
  { t: 0, text: 'Djenné. Un lieu où la terre garde la mémoire.' },
  { t: 5, text: 'Au cœur du Mali, la Grande Mosquée veille depuis des siècles.' },   // proposition : à valider
];
let cine = null;

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function playCinematic(then) {
  cineThen = then || null;
  show('cinematique');
  const scr = current;
  const r = scr.root;
  const bg = $(scr.bgRoot || r, '[data-cine-bg]');
  const v = document.createElement('video');
  v.playsInline = true;
  v.preload = 'auto';
  v.src = mediaUrl('introVideo');   // mobile / réseau lent : version 960 px (2,3 Mo au lieu de 18,8 Mo)
  v.style.cssText = bg ? bg.getAttribute('style') : 'position:absolute;left:0;top:0;width:1440px;height:810px;object-fit:cover';
  v.volume = clamp((settings.muteAll ? 0 : settings.volume / 100), 0, 1);
  if (bg) bg.replaceWith(v); else r.firstElementChild.prepend(v);
  const capEl = $(r, '[data-bind="caption"]');
  const capBox = capEl && capEl.parentElement;
  const skipBtn = $(r, '[data-act="cine-skip"]');
  if (skipBtn && !settings.skippableCutscenes) skipBtn.style.display = 'none';      // Options › Cinématiques passables
  cine = { v, scr, r, ended: false };

  const total = () => Math.min(CINE_CUT, v.duration || CINE_CUT);
  const paint = () => {
    const cur = Math.min(v.currentTime, total());
    const p = (cur / total()) * 100;
    let cap = CAPTIONS[0].text;
    for (const c of CAPTIONS) if (cur >= c.t) cap = c.text;
    bindAll(r, { cineTime: fmtTime(cur), cineTotal: fmtTime(total()), cinePct: `${p}%`, caption: t(cap) });
    if (capBox) capBox.style.display = settings.subtitles ? '' : 'none';
    if (cur >= CINE_CUT && !cine.ended) finishCinematic();
  };
  v.addEventListener('timeupdate', paint);
  v.addEventListener('ended', () => finishCinematic());
  v.addEventListener('error', () => finishCinematic());
  paint();
  scr.cleanup = () => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (_) {} if (cine && cine.scr === scr) cine = null; };
  v.play().catch(() => { v.muted = true; v.play().catch(() => finishCinematic()); });
}

function skipCinematic() {
  if (!settings.skippableCutscenes) { toast('Cette cinématique ne peut pas être passée (Options › Jeu et langue).'); return; }
  finishCinematic();
}

function finishCinematic() {
  if (!cine || cine.ended) return;
  cine.ended = true;
  const then = cineThen;
  cineThen = null;
  if (then) then(); else showMainMenu();
}

function toggleCinePause() {
  if (!cine) return;
  if (cine.v.paused) cine.v.play().catch(() => {}); else cine.v.pause();
}

function toggleSubtitles() {
  setSetting('subtitles', !settings.subtitles);
  if (!cine) return;
  const capEl = $(cine.r, '[data-bind="caption"]');
  if (capEl && capEl.parentElement) capEl.parentElement.style.display = settings.subtitles ? '' : 'none';
}

/* ==========================================================
   PARTIE : nouvelle partie, reprise, pause
   ========================================================== */

/* Nouvelle partie : clés de progression de l'histoire à effacer (hors profil joueur taama.player.v1) */
const NEW_GAME_KEYS = ['taama.dispositif1', 'taama.dispositif2', 'taama.vol', 'taama.piste', 'taama.revelation', 'taama.acte', 'taama.d1.spotted',
  'taama.lab1', 'taama.lab1.q', 'taama.lab2', 'taama.lab2.q', 'taama.dossier', 'taama.gadget', 'taama.chapitre1', 'taama.next'];

let playClock = 0;
let remindClock = 0;
const REMIND_MS = 4 * 60 * 1000;

/** Options › Rappel de l'objectif en cours : au début, à la reprise, puis toutes les 4 minutes de jeu. */
function remindObjective() {
  if (!settings.objectiveReminder || !save) return;
  toast(t('Objectif · {x}', { x: G.sequenceObjective(save.sequence) }));
}

function startPlayClock() {
  clearInterval(playClock);
  clearInterval(remindClock);
  remindClock = setInterval(() => { if (inGame && !open && !document.hidden) remindObjective(); }, REMIND_MS);
  playClock = setInterval(() => {
    if (!inGame || open || document.hidden || !save) return;
    save = G.addPlayTime(save, PLAYCLOCK_MS, iso());
    persistSave();
  }, PLAYCLOCK_MS);
}

function enterGame(opts = {}) {
  inGame = true;
  hideUI();
  // Partie (Nouvelle partie / Continuer) : on entre directement dans le sanctuaire ; la vue d'ensemble (boutons GAME / SANCTUAIRE / MENU)
  // n'existe plus qu'en « Exploration libre ». Quitter le sanctuaire ouvre la pause.
  document.body.classList.add('mode-campaign');
  const goSanctuary = () => {
    if (!inGame) return;
    if (window.MosqueScene && window.MosqueScene.loaded && window.SanctuaryMode) {
      document.querySelector('[data-action="interior"]')?.click();
      if (opts.takeoff) hintDroneLaunch();
    }
    else setTimeout(goSanctuary, 400);
  };
  setTimeout(goSanctuary, 150);
  resumeClock();
  window.MosqueScene?.resumeLoop?.();
  window.playModelWind?.();
  applyGameSettings();
  startPlayClock();
}

/* Scène 1 : le personnage est dans le sanctuaire (devant la mosquée). Le drone NE décolle PAS tout seul : le joueur le lance lui-même
   (R au clavier, LB à la manette, bouton Drone sur mobile) ; une aide discrète le lui rappelle une fois la scène prête. */
function hintDroneLaunch(tries = 0) {
  if (!inGame || window.__storyFreeze) return;
  const sm = window.SanctuaryMode, d = sm && sm.debug ? sm.debug() : null;
  if (d && d.active && d.ready && d.state === 3 && !window.Tapama?.isBusy?.()) { window.GamepadKit?.toast?.('🚁 Lance ton drone : touche R · LB à la manette · bouton Drone sur mobile'); return; }
  if (tries < 120) setTimeout(() => hintDroneLaunch(tries + 1), 500);
}
function takeoffWhenReady(tries = 0) {
  if (!inGame || window.__storyFreeze || window.Dispositif1?.busy) return;
  try { const ac = localStorage.getItem('taama.acte'); if (ac && ac !== '0:done') return; } catch (_) {}
  const sm = window.SanctuaryMode;
  const d = sm && sm.debug ? sm.debug() : null;
  const busy = window.Tapama?.isBusy?.();
  if (d && d.active && d.ready && d.state === 3 && !busy && sm.takeoffDrone()) return;
  if (tries < 120) setTimeout(() => takeoffWhenReady(tries + 1), 500);
  else { window.GamepadKit?.toast?.('Lance ton drone depuis la maquette pour inspecter la mosquée'); }
}

/* Scène 0 : dialogue d'ouverture de Tapama, plein écran sur un fond sable assombri, AVANT que le personnage ne soit affiché. */
function playOpening() {
  hideUI();
  const veil = document.createElement('div');
  veil.id = 'guOpeningVeil';
  veil.style.cssText = 'position:fixed;inset:0;z-index:8990;background:radial-gradient(ellipse at 50% 40%,#8a6a45 0%,#4a3826 62%,#251a12 100%);opacity:0;transition:opacity .5s ease';
  document.body.appendChild(veil);
  requestAnimationFrame(() => { veil.style.opacity = '1'; });
  const finish = () => {
    veil.style.opacity = '0';
    setTimeout(() => veil.remove(), 600);
    save = G.completeSequence(save, 3, iso());
    persistSave();
    try { localStorage.setItem('taama.acte', '0:done'); } catch (_) {}
    window.dispatchEvent(new CustomEvent('taama:ouverture-fin'));
    enterGame({ takeoff: true });               // le jeu commence : le drone décolle (objectif et radio : drone-game.js)
  };
  if (!(window.Tapama && window.Tapama.play('ouverture', { onEnd: finish }))) finish();
}

function beginGame() {
  if (locked()) return;
  if (save && !newGameConfirmed) {
    const c = current && $(current.root, '[data-confirm]');
    if (c) { c.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }], { duration: 260 }); }
    toast('Coche « J’ai compris » pour remplacer ta partie.');
    return;
  }
  save = G.newSave(iso());
  persistSave();
  // Nouvelle partie : on repart de zéro — ni voiture ni gadget (débloqués au premier dispositif), dispositifs à retrouver, questions de Tapama remises à zéro
  try { window.Dispositif1?.reset?.(); window.NeantisBase?.resetDevice?.(); } catch (_) {}
  try { NEW_GAME_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (_) {}
  const launch = () => playOpening();
  if (ng.cine) playCinematic(launch); else launch();
}

function resumeGame() {
  if (!save) return;
  enterGame();
  remindObjective();
}

function openJournal() {
  if (inGame) { if (current && current.id === 'pause') pulseJournal(); else openPause(); return; }
  if (save) { enterGame(); openPause(); }
}

function pulseJournal() {
  const panel = current && $(current.root, 'section[aria-label^="Journal"]');
  if (panel) panel.animate([{ boxShadow: '0 0 0 0 rgba(249,213,139,0)' }, { boxShadow: '0 0 0 8px rgba(249,213,139,.7)' }, { boxShadow: '0 0 0 0 rgba(249,213,139,0)' }], { duration: 700 });
}

/* Exploration libre : la maquette 3D (ville + mosquée) avec bulles de lieux, sans les boutons GAME / SANCTUAIRE / MENU (app/explore.js) */
function startExplore() {
  if (locked()) return;
  const go = () => { hideUI(); window.MosqueScene?.resumeLoop?.(); import('./explore.js?v=2').then((m) => m.start()); };
  if (window.MosqueScene && window.MosqueScene.loaded) go(); else { window.startMosqueScene?.(); toast('La maquette se charge…'); const t = setInterval(() => { if (window.MosqueScene && window.MosqueScene.loaded) { clearInterval(t); go(); } }, 400); }
}

function overview() {
  const stage = document.getElementById('mosqueStage');
  if (!stage || !stage.classList.contains('on')) return false;
  const ui = document.querySelector('.mq-ui');
  if (ui && ui.classList.contains('dg-hidden')) return false;
  if (window.SanctuaryMode?.isActive?.()) return false;
  return true;
}

let clockWasRunning = false;

function openPause() {
  if (!NEW_UI || open || !inGame) return;
  // La maquette reste affichée derrière le voile ; seule l'horloge jour/nuit s'arrête.
  clockWasRunning = !!(window.DayCycle && window.DayCycle.running);
  window.DayCycle?.pause?.();
  stack.length = 0;
  show('pause');
}

function resumeClock() {
  if (clockWasRunning) window.DayCycle?.resume?.();
  clockWasRunning = false;
}

function closePause() {
  if (!inGame) return;
  hideUI();
  resumeClock();
}

window.addEventListener('sanctuary:exit', () => {
  if (!inGame || open || window.Explore?.active) return;
  if (window.DroneGame?.isActive?.()) return;
  openPause();
});

function toMain() {
  if (save) { save = G.addPlayTime(save, 0, iso()); persistSave(); }
  inGame = false;
  document.body.classList.remove('mode-campaign');
  window.SanctuaryMode?.isActive?.() && window.SanctuaryMode.exit();
  clearInterval(playClock);
  clearInterval(remindClock);
  resumeClock();
  showMainMenu();
}

/* ==========================================================
   MISE EN PLACE PAR ÉCRAN
   ========================================================== */

const INITIAL_FOCUS = {
  main: () => (save ? '[data-act="continue"]' : '[data-act="new"]'),
  pause: () => '[data-act="resume-game"]',
  continuer: () => '[data-act="resume"]',
  nouvelle: () => '[data-act="begin"]',
  carte: () => '[data-act="resume"]',
};

function setupScreen(scr) {
  const { id, root } = scr;
  const map = saveBinds();

  // zones cliquables non-boutons
  root.addEventListener('click', (e) => {
    if (locked()) return;
    const t = e.target;
    const actEl = t.closest('[data-act]');
    if (actEl) { if (actEl.getAttribute('aria-disabled') === 'true') return; act(actEl.dataset.act); return; }
    const dest = t.closest('[data-dest]');
    if (dest) { if (mapApi) mapApi.select(dest.dataset.dest, { fly: !t.closest('.leaflet-container') }); return; }
    const sw = t.closest('.sw[tabindex]');
    if (sw) {
      const on = sw.classList.contains('off');           // on bascule : off → on
      sw.classList.toggle('off', !on);
      sw.setAttribute('aria-checked', String(on));
      if (sw.dataset.key) setSetting(sw.dataset.key, on);
      else if (sw.dataset.ng) ng = { ...ng, [sw.dataset.ng]: on };
      return;
    }
    const seg = t.closest('.seg[tabindex]');
    if (seg) { const span = t.closest('.seg span'); if (span) pickSeg(seg, span); return; }
    const q = t.closest('.q[data-q]');
    if (q) { setSetting('quality', q.dataset.q); paintQuality(root); return; }
    const lang = t.closest('.lang[data-lang]');
    if (lang) { setSetting('lang', lang.dataset.lang); paintLangCards(root); return; }
    const conf = t.closest('[data-confirm]');
    if (conf) { e.preventDefault(); newGameConfirmed = !newGameConfirmed; paintConfirm(root); return; }
    if (id === 'lancement' && !t.closest('button')) act('start');
  });

  if (scr.bgRoot) {
    scr.bgRoot.addEventListener('click', (e) => {
      const d = e.target.closest('[data-dest]');
      if (d && mapApi && !locked()) mapApi.select(d.dataset.dest, { fly: false });
    });
  }

  // curseurs : clic / glisser
  $$(root, '.trk').forEach((trk) => {
    trk.addEventListener('pointerdown', (e) => {
      if (!trk.dataset.key) return;
      e.preventDefault();
      const move = (ev) => {
        const r = trk.getBoundingClientRect();
        setSlider(trk, ((ev.clientX - r.left) / r.width) * 100);
      };
      move(e);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  });

  // le survol souris remplace la sélection clavier
  root.addEventListener('pointermove', () => { if (kbIndex >= 0) { kbIndex = -1; paintFocus(); } });

  bindAll(root, map);

  // Personnage en vrai 3D (plateau tournant à 360°) ; sans cadre 3D dans l'écran, on libère le rendu
  const frames = $$(root, '[data-char3d]');
  if (frames.length) frames.forEach((f) => attachCharacter(f, { interactive: id === 'nouvelle' || id === 'profil' }));
  else releaseCharacter();

  // « Menu principal » = retour : devient « Pause » si on vient de la pause
  const prev = stack[stack.length - 1];
  if (prev === 'pause') $$(root, '[data-act="back"]').forEach((b) => { if (/Menu principal/.test(b.textContent)) b.lastChild.textContent = ' Pause'; });

  if (id === 'lancement') { paintLangButtons(root); paintSoundButton(); startPad(); }
  if (id === 'main') { paintLangButtons(root); setupMain(root); }
  if (id === 'nouvelle') setupNewGame(root);
  if (id === 'profil') setupProfile(root);
  if (id === 'continuer' || id === 'pause') fillDiscoveries(root);
  if (id === 'carte') setupMap(root, scr);
  if (id.startsWith('options-')) { initControls(root); if (id === 'options-affichage') setupDisplay(root); }

  if (scr.bgRoot) translateTree(scr.bgRoot);
  translateTree(root);                    // dernier : les repérages par texte français ci-dessus sont déjà faits

  const init = INITIAL_FOCUS[id];
  if (init) {
    const items = focusables();
    const el = $(root, init());
    const i = items.indexOf(el);
    if (i >= 0) { kbIndex = i; paintFocus(); }
  }
}

function setupMain(root) {
  const cont = $(root, '[data-act="continue"]');
  if (cont && !save) {
    cont.setAttribute('aria-disabled', 'true');
    const sub = $(cont, '[data-bind="seqLabel"]');
    if (sub) sub.textContent = t('Aucune sauvegarde');
  }
  // carte « Ton équipe » : affiche le personnage jouable
  const line = $$(root, 'div').find((d) => d.firstElementChild && d.firstElementChild.tagName === 'SPAN' && d.firstElementChild.textContent.trim() === 'Personnage');
  if (line) line.lastChild.textContent = ' · ' + t('Homme');
}

function setupNewGame(root) {
  newGameConfirmed = false;
  ng = { cine: true, tuto: true };
  initControls(root);
  const warn = $(root, '[data-warn]');
  if (warn && !save) warn.style.display = 'none';
  paintConfirm(root);
}

function paintConfirm(root) {
  const c = $(root, '[data-confirm]');
  if (!c) return;
  const box = c.firstElementChild;
  const svg = box && box.querySelector('svg');
  if (box) {
    box.style.background = newGameConfirmed ? '#F9D58B' : 'transparent';
    box.style.border = newGameConfirmed ? '0' : '2px solid #F8F3EA';
  }
  if (svg) svg.style.display = newGameConfirmed ? '' : 'none';
  c.setAttribute('role', 'checkbox');
  c.setAttribute('aria-checked', String(newGameConfirmed));
  c.tabIndex = 0;
  const btn = $(root, '[data-act="begin"]');
  if (btn) btn.style.opacity = (save && !newGameConfirmed) ? '.6' : '';
}

/* ---------- Carte des destinations : navigable ---------- */

const DEST_ORDER = ['djenne', 'bandiagara', 'segou', 'bamako', 'lome'];
const DEST_INFO = {
  djenne: { name: 'Djenné', chapter: 'Chapitre 1', desc: 'Une enquête autour de la Grande Mosquée et de deux dispositifs mystérieux.' },
  bandiagara: { name: 'Bandiagara', chapter: 'Chapitre 2', desc: 'Piste possible : un environnement rocheux et des paysages de falaise, avec des défis d’exploration.', hint: 'Termine le chapitre 1 pour ouvrir cette destination.' },
  segou: { name: 'Ségou', chapter: 'Chapitre 3', desc: 'Piste possible : une enquête autour d’un autre emplacement, avec de nouvelles énigmes.', hint: 'Termine le chapitre 2 pour ouvrir cette destination.' },
  bamako: { name: 'Bamako', chapter: 'Plus tard', desc: 'Destination envisagée pour la suite de la saga, selon les ressources et la direction narrative.', hint: 'Pas encore prévue : elle viendra après les premiers chapitres.' },
  lome: { name: 'Lomé', chapter: 'Plus tard', desc: 'Une piste de la carte mène vers Lomé, hors du Mali : elle ouvre la possibilité de futurs chapitres.', hint: 'Pas encore prévue : elle viendra après les premiers chapitres.' },
};
const NAME_TO_DEST = Object.fromEntries(DEST_ORDER.map((id) => [DEST_INFO[id].name, id]));

let mapApi = null;      // { select(id), step(dir), sel(), isOpen(id) } pour la carte affichée

function destUnlocked(id) {
  const d = G.DESTINATIONS.find((x) => x.id === id);
  return !!(d && d.unlocked);
}

function setupMap(root, scr) {
  mapApi = null;
  const holder = scr.bgRoot ? $(scr.bgRoot, '[data-leaflet]') : null;
  const aside = $(root, 'aside[aria-label^="Détail"]');
  const primary = $(root, '[data-act="resume"]');
  const secondary = $(root, '[data-act="cine-replay"]');
  if (!holder || !aside || !primary) return;

  const primaryLabel = Array.from(primary.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim());
  const openLabel = save ? primaryLabel.textContent : 'Commencer le chapitre';

  // Panneau de droite
  const head = aside.children[0];
  const kicker = head.children[0], badge = head.children[1];
  const title = $(aside, 'h2'), desc = $(aside, 'p');
  // bloc « Progression » = ligne de titre + barre (le texte lié est dans un <span> dans un <span> dans la ligne)
  const progWrap = $(aside, '[data-bind="progressLong"]').parentElement.parentElement.parentElement;
  const rows = $$(aside, 'div').filter((d) => d.style.height === '38px');
  const rowBase = rows.map((r) => ({ border: r.style.border, background: r.style.background }));
  rows.forEach((r) => {
    const id = NAME_TO_DEST[norm(r.querySelector('span').textContent)];
    if (!id) return;
    r.dataset.dest = id;
    r.style.cursor = 'pointer';
  });
  const badgeStyle = badge.getAttribute('style');
  const hint = document.createElement('div');
  hint.style.cssText = 'padding:12px 16px;border-radius:14px;background:rgba(248,243,234,.1);border:1px solid rgba(248,243,234,.4);font-size:calc(14px * var(--ts,1));line-height:1.45;font-weight:600';
  progWrap.after(hint);

  let sel = 'djenne';
  let geo = null;                                   // la vraie carte (Leaflet), prête après chargement

  function select(id, { fly = false } = {}) {
    if (!DEST_INFO[id]) return;
    sel = id;
    const info = DEST_INFO[id];
    const open = destUnlocked(id);
    kicker.textContent = info.chapter;
    title.textContent = info.name;
    desc.textContent = info.desc;
    badge.textContent = open ? 'Disponible' : 'Verrouillée';
    badge.setAttribute('style', open ? badgeStyle : 'font-size:13px;font-weight:700;padding:4px 14px;border-radius:999px;border:1px solid rgba(248,243,234,.7);color:#F8F3EA');
    progWrap.style.display = open ? '' : 'none';
    hint.style.display = open ? 'none' : '';
    hint.textContent = info.hint || '';
    rows.forEach((r, i) => {
      const on = r.dataset.dest === id;
      r.style.border = on ? '2px solid #F9D58B' : rowBase[i].border;
      r.style.background = on ? 'rgba(249,213,139,.2)' : rowBase[i].background;
    });
    // actions : le chapitre ne se lance que sur une destination ouverte
    primaryLabel.textContent = open ? openLabel : `Verrouillée · ${info.chapter}`;
    primary.setAttribute('aria-disabled', open ? 'false' : 'true');
    if (secondary) secondary.setAttribute('aria-disabled', open ? 'false' : 'true');
    translateTree(aside);                           // la fiche vient d'être réécrite en français : on la traduit
    if (geo) geo.select(id, { fly });
  }

  // Commandes de la carte : zoom, recentrer, vue satellite
  const zoomBar = document.createElement('div');
  zoomBar.style.cssText = 'position:absolute;z-index:5;left:896px;top:40px;pointer-events:auto;display:flex;flex-direction:column;gap:8px';
  const mk = (content, aria, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    if (content.startsWith('<')) b.innerHTML = content; else b.textContent = content;
    b.setAttribute('aria-label', aria);
    b.style.cssText = 'width:44px;height:44px;border-radius:14px;border:1px solid rgba(248,243,234,.6);background:rgba(85,65,93,.92);color:#F8F3EA;font:700 22px/1 "Open Sans",sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center';
    b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(b); });
    return b;
  };
  const GLOBE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>';
  zoomBar.append(
    mk('+', 'Zoom avant', () => geo && geo.zoomIn()),
    mk('−', 'Zoom arrière', () => geo && geo.zoomOut()),
    mk('⟲', 'Recentrer la carte', () => geo && geo.reset()),
    mk(GLOBE, 'Vue satellite', (b) => {
      if (!geo) return;
      const on = geo.toggleSatellite();
      b.setAttribute('aria-pressed', String(on));
      b.style.background = on ? '#F9D58B' : 'rgba(85,65,93,.92)';
      b.style.color = on ? '#55415D' : '#F8F3EA';
    }),
  );
  Array.from(root.children).find((n) => n.tagName === 'DIV').appendChild(zoomBar);

  mapApi = {
    select,
    sel: () => sel,
    isOpen: destUnlocked,
    step(dir) { select(DEST_ORDER[(DEST_ORDER.indexOf(sel) + dir + DEST_ORDER.length) % DEST_ORDER.length], { fly: true }); },
    info: () => (geo ? geo.info() : null),
    geo: () => geo,
  };
  select('djenne');

  // La carte (bibliothèque + données) se charge à la demande : l'écran s'affiche tout de suite.
  import('./destinations-map.js?v=2').then((m) => m.createDestinationsMap(holder, {
    t,
    insets: mapInsets,
    destinations: DEST_ORDER.map((id) => ({
      id, name: DEST_INFO[id].name, open: destUnlocked(id),
      sub: t(id === 'djenne' ? 'CHAPITRE 1' : DEST_INFO[id].chapter),
    })),
  })).then((g) => {
    if (current !== scr) { g.destroy(); return; }   // l'écran a été quitté pendant le chargement
    geo = g;
    scr.cleanup = () => { try { g.destroy(); } catch (_) { /* déjà retirée */ } };
    g.select(sel, { fly: false });
  }).catch((err) => {
    console.warn('[Carte] chargement impossible :', err);
    holder.style.cssText += ';display:flex;align-items:center;justify-content:center;color:#F8F3EA;font-weight:700;text-align:center;padding:40px';
    holder.textContent = t('La carte n’a pas pu être chargée.');
  });
}

/** Zone de la fenêtre cachée par l'interface (titre, légende, panneau) : la carte s'y cadre à côté. */
function mapInsets() {
  const r = stageEl.getBoundingClientRect();
  const s = r.width / STAGE_W || 1;
  const vw = host.clientWidth || window.innerWidth;
  const vh = host.clientHeight || window.innerHeight;
  return {
    left: r.left + 40 * s,
    top: r.top + 120 * s,
    right: Math.max(0, vw - (r.left + 880 * s)),
    bottom: Math.max(0, vh - (r.top + 690 * s)),
  };
}

/* ← → : changer de destination sur la carte, sinon régler / naviguer */
function navLR(dir) {
  if (adjustFocused(dir)) return;
  if (current && current.id === 'carte' && mapApi) { mapApi.step(dir); return; }
  if (current && current.id === 'nouvelle') { rotateCharacter(dir); return; }     // « ← → Tourner le personnage »
  moveFocus(dir);
}

function setupDisplay(root) {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const lvl = detectQuality();
  bindAll(root, {
    deviceLabel: `Appareil détecté : ${coarse ? 'téléphone ou tablette' : 'ordinateur'}`,
    autoQuality: { html: `<b style="font-family:inherit">${QUALITY_NAMES[lvl] || QUALITY_NAMES.high}</b>` },
  });
}

/* ==========================================================
   PROFIL DU JOUEUR : prénom + âge, envoyés dans Notion
   ========================================================== */

let profileFirst = false;

function showProfile({ first }) {
  profileFirst = !!first;
  window.MosqueScene?.pauseLoop?.();
  show('profil', { push: !first });
}

function setupProfile(root) {
  const name = $(root, '[data-field="name"]');
  const age = $(root, '[data-field="age"]');
  const err = $(root, '[data-error]');
  const edit = $(root, '[data-edit-only]');
  const submit = $(root, '[data-act="profile-save"]');
  if (profileFirst && edit) edit.style.display = 'none';
  if (!profileFirst && submit) { const t = Array.from(submit.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = ' Enregistrer'; }
  if (profile) { name.value = profile.name; age.value = String(profile.age); }

  const preview = () => {
    const n = P.cleanName(name.value);
    bindAll(root, { preview: n.length >= P.NAME_MIN ? t('« Ravie de te rencontrer, {nom}. »', { nom: n }) : t('« Ravie de te rencontrer ! »') });
  };
  const clearErr = () => { err.textContent = ''; name.classList.remove('bad'); age.classList.remove('bad'); };
  name.addEventListener('input', () => { clearErr(); preview(); });
  age.addEventListener('input', () => { age.value = age.value.replace(/\D/g, '').slice(0, 2); clearErr(); });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); age.focus(); } });
  age.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveProfileFromScreen(); } });
  preview();
  setTimeout(() => { if (current && current.root === root) (name.value ? age : name).focus(); }, 380);
}

function saveProfileFromScreen() {
  if (!current || current.id !== 'profil') return;
  const root = current.root;
  const name = $(root, '[data-field="name"]');
  const age = $(root, '[data-field="age"]');
  const err = $(root, '[data-error]');
  const v = P.validateProfileInput({ name: name.value, age: age.value });
  if (!v.ok) {
    err.textContent = P.errorMessage(v.error);
    const field = v.error.startsWith('age') ? age : name;
    field.classList.add('bad');
    field.focus();
    return;
  }
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const ctx = {
    id: profile ? profile.id : P.newId(),
    device: P.pickDevice({ coarsePointer: coarse, width: window.innerWidth, height: window.innerHeight }),
    lang: settings.lang,
    nowIso: iso(),
  };
  profile = profile ? P.updateProfile({ ...profile, device: ctx.device, lang: ctx.lang }, v, ctx.nowIso) : P.createProfile(v, ctx);
  persistProfile();
  syncProfile();
  toast(t('Bienvenue, {nom} !', { nom: profile.name }));
  if (profileFirst) { profileFirst = false; showMainMenu(); } else back();
}

let syncing = false;
/** Envoie le profil à la base Notion (via le serveur). En cas d'échec, il reste en attente et sera renvoyé plus tard. */
async function syncProfile() {
  if (!profile || profile.synced || syncing) return;
  syncing = true;
  const sent = profile;
  try {
    const ok = await sendProfile(sent);
    if (ok && profile && profile.id === sent.id && profile.updatedAt === sent.updatedAt) {
      profile = { ...profile, synced: true };
      persistProfile();
    }
  } finally { syncing = false; }
}
window.addEventListener('online', () => { syncProfile(); });

/* ==========================================================
   DÉMARRAGE
   ========================================================== */

function boot() {
  document.body.appendChild(host);
  document.body.appendChild(fpsEl);
  window.addEventListener('resize', fit);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(host);
  fit();
  document.addEventListener('fullscreenchange', () => {
    const on = !!document.fullscreenElement;
    if (on === settings.fullscreen) return;
    settings = { ...settings, fullscreen: on };
    persistSettings();
    const sw = current && current.root.querySelector('.sw[data-key="fullscreen"]');
    if (sw) { sw.classList.toggle('off', !on); sw.setAttribute('aria-checked', String(on)); }
  });
  I18n.setLang(settings.lang);
  if (settings.lang === 'en') { I18n.observeDocument(); I18n.applyToDocument(); }
  applyAll();
  startPad();
  show('lancement');
  syncProfile();                       // profil créé hors connexion : on le renvoie maintenant
}

window.GameUI = {
  managed: NEW_UI,
  show: (id) => show(id),
  isOpen: () => open,
  hide: hideUI,
  isInGame: () => inGame,
  openPause,
  closePause,
  settings: () => ({ ...settings }),
  player: () => (profile ? { name: profile.name, age: profile.age, id: profile.id, synced: profile.synced } : null),
  save: () => (save ? { ...save } : null),
  completeSequence(n) {
    if (!save) return;
    save = G.completeSequence(save, n, iso());
    persistSave();
  },
  addDiscovery(id) {
    if (!save) return;
    save = G.addDiscovery(save, id);
    persistSave();
  },
  screens: Object.keys(SCREENS),
  map: () => (mapApi && mapApi.geo ? mapApi.geo() : null),             // la carte Leaflet affichée (tests, débogage)
};

if (NEW_UI) {
  document.documentElement.classList.add('gu');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
