/* ==========================================================
   GUIDE « COMMENT JOUER » — écran, conseils en jeu, bouton « ? »
   ----------------------------------------------------------
   • Écran « Comment jouer » : une page par sujet, une animation (le geste selon
     le mode de commande), une phrase très courte, gros boutons.
   • Conseils en jeu (coach marks) : une bulle à la fois, la première fois, avec une flèche
     animée ; jamais pendant un dialogue, le labo, le dossier, la carte ou la pause.
   • Bouton « ? » : « Que faire maintenant ? » dans la voix de Tapama (portrait 2D).
   Rien ici ne modifie le jeu : on lit ses API (SanctuaryMode, DroneGame, Vehicle, CityMap,
   GameUI, Tapama…) et ses clés taama.*. État mémorisé : localStorage « taama.guide.v1 ».
   Chargé à la demande par app/guide.js.
   ========================================================== */

import * as LG from './guide-logic.js?v=35';
import { PAGES, OBJECTIVES, UI } from './guide-content.js?v=35';
import * as A from './guide-icons.js?v=35';
import { t, getLang, onLangChange } from './i18n.js?v=1';
import { fillName } from './player-profile.js?v=1';

/* ---------- feuille de style (chargée avec le module) ---------- */
if (!document.getElementById('gdCss')) {
  const l = document.createElement('link');
  l.id = 'gdCss'; l.rel = 'stylesheet'; l.href = 'styles/guide.css?v=35';
  document.head.appendChild(l);
  await new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 3500); });
}

const $ = (s, r = document) => r.querySelector(s);
const vis = (e) => e.offsetParent !== null || e.getClientRects().length;
const emit = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ls = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

/* ---------- variables du module (déclarées en tête : detect() tourne dès le chargement) ---------- */
let isOpen = false, screenMod = null;                                                                                          // écran
let cRoot = null, toastT = 0, helpOpen = false, helpT = 0, helpPad = false, lastW = null;                                  // conseils et bouton « ? »
let moved = false, looked = false, droneUsed = false, droneSeen = false, droneAt = 0, cur = null, curId = null, lastEnd = 0;  // conseils

/* ---------- état mémorisé ---------- */
let S = LG.parseState(ls(LG.STORE_KEY));
const saveS = () => { try { localStorage.setItem(LG.STORE_KEY, LG.serializeState(S)); } catch (_) {} };
const sysReduce = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const still = () => LG.reducedMotion(S, sysReduce());
const gs = () => window.GameSettings || {};
const flags = () => ({ drone: droneSeen, acte: ls('taama.acte'), spotted: ls('taama.d1.spotted'), dispositif1: ls('taama.dispositif1'), lab1: ls('taama.lab1'), vol: ls('taama.vol'),
  gadget: ls('taama.gadget'), dispositif2: ls('taama.dispositif2'), lab2: ls('taama.lab2'), chapitre1: ls('taama.chapitre1') });

/** Classes d'apparence communes : animations réduites, grand texte, contraste renforcé (réglages du jeu inclus). */
function look(el) {
  el.classList.toggle('gd-still', still());
  el.classList.toggle('gd-big', S.prefs.large || gs().textSize === 'L');
  el.classList.toggle('gd-hc', !!gs().highContrast);
}

/* ==========================================================
   MODE DE COMMANDE : tactile · manette · clavier-souris
   ========================================================== */
let last = null, mode = 'kbd';
const touchParam = new URLSearchParams(location.search).get('touch');
const coarse = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
const padOn = () => !!(window.GamepadKit && window.GamepadKit.connected && window.GamepadKit.connected());
const isTouchUi = () => LG.isTouch({ touchParam, coarse: coarse.matches, maxTouchPoints: navigator.maxTouchPoints || 0 });
/* Appareil = le DERNIER périphérique réellement utilisé (touche, souris, doigt, bouton ou stick de manette réellement bougé).
   Départ : tactile si écran tactile, sinon clavier + souris : une manette simplement branchée ne change rien. */
function detect() {
  const m = LG.pickMode({ touchParam, coarse: coarse.matches, maxTouchPoints: navigator.maxTouchPoints || 0, pad: padOn(), last });
  if (m === mode) return;
  mode = m;
  emit('guide:mode', { mode });
  if (screenMod) screenMod.refresh();
  if (cur) renderStep();                                        // la bulle affichée suit le changement d'appareil en direct
  paintHelpBtn();
}
const setLast = (v) => { if (last !== v) { last = v; detect(); } };
window.addEventListener('keydown', (e) => { if (e.isTrusted) setLast('kbd'); }, true);          // les touches fabriquées par les commandes tactiles ne comptent pas
const padFirst = () => padOn() && last === 'pad';              // manette branchée et déjà choisie : la souris qui bouge ne ramène pas les images clavier (seule une vraie touche le fait)
window.addEventListener('pointerdown', (e) => { if (e.isTrusted && !(padFirst() && e.pointerType === 'mouse')) setLast(e.pointerType === 'mouse' ? 'kbd' : 'touch'); }, true);
window.addEventListener('pointermove', (e) => { if (e.isTrusted && e.pointerType === 'mouse' && !padFirst()) setLast('kbd'); }, true);
window.addEventListener('wheel', (e) => { if (e.isTrusted && !padFirst()) setLast('kbd'); }, { passive: true, capture: true });
window.addEventListener('gamepadconnected', () => { setLast('pad'); });      // manette branchée (ou détectée au lancement) : ses images, rien d'autre
window.addEventListener('gamepaddisconnected', () => { if (last === 'pad') { last = null; detect(); } });
const PADS = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'START', 'BACK', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'L3', 'R3'];
let padBase = null;
/** Activité réelle de la manette : bouton enfoncé, gâchette, ou stick qui s'écarte de sa position de repos (un stick qui dérive ne compte pas). */
function padActive(R) {
  const s = R.state();
  if (!padBase) padBase = { ...s };
  const dv = Math.max(Math.abs(s.lx - padBase.lx), Math.abs(s.ly - padBase.ly), Math.abs(s.rx - padBase.rx), Math.abs(s.ry - padBase.ry));
  return dv > 0.5 || PADS.some((n) => R.down(n)) || R.trigger(6) > 0.5 || R.trigger(7) > 0.5;
}
detect();

/* ==========================================================
   ÉCRAN « COMMENT JOUER » : module séparé (guide-screen.js), chargé seulement à l'ouverture
   ========================================================== */
let scr = null;
const loadScreen = () => scr || (scr = import('./guide-screen.js?v=35').then((m) => (scr = Promise.resolve(m.default), (screenMod = m.default))));
const setOpen = (b) => { isOpen = b; };
const open = (topic) => loadScreen().then((s) => s.open(topic));
const start = () => loadScreen().then((s) => s.start());
const close = () => { if (screenMod) screenMod.close(); };
const onKey = (e) => { if (screenMod) screenMod.onKey(e); };

function reset() {
  S = LG.resetSeen(S); saveS();
  hideHint(); curId = null; moved = false; looked = false; droneUsed = false; droneSeen = false; acts.clear();
  toast(t(UI.replayed));
  emit('guide:reset', {});
}

/* ==========================================================
   DÉMOS EN JEU : à la PREMIÈRE apparition de chaque interface, une bulle avec une flèche animée,
   le pictogramme animé de la bonne touche / du bon bouton (selon l'appareil réellement utilisé)
   et UNE phrase courte. Une démo peut avoir plusieurs étapes (« Suivant » ou action du joueur).
   Une seule bulle à la fois ; jamais par-dessus un dialogue, le labo, le dossier, la carte ou la pause,
   SAUF pour la démo de cette interface elle-même ; la radio de Tapama passe d'abord.
   ========================================================== */
let artMod = null, artP = null;
const screenCss = () => {
  if (document.getElementById('gdCss2')) return Promise.resolve();
  const l = document.createElement('link');
  l.id = 'gdCss2'; l.rel = 'stylesheet'; l.href = 'styles/guide-screen.css?v=35';
  document.head.appendChild(l);
  return new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 3500); });
};
/** Images animées : chargées à la première bulle seulement (démarrage léger). */
/** Économie de données / 2G : les conseils essentiels s'affichent quand même (texte + flèche) ; seuls les dessins animés (gros fichiers) sont sautés. */
const lowData = () => {
  try {
    const c = navigator.connection || {}, g = window.GameSettings || {};
    return !!(g.saveData || c.saveData || /^(slow-)?2g$/.test(c.effectiveType || '') || ls('taama.saveData') === '1');
  } catch (_) { return false; }
};
const loadArt = () => artP || (artP = Promise.all([import('./guide-art.js?v=35'), screenCss()]).then(([m]) => (artMod = m)));

const coachRoot = () => {
  if (cRoot) return cRoot;
  cRoot = document.createElement('div');
  cRoot.className = 'gc'; cRoot.hidden = true;
  cRoot.innerHTML = '<svg class="gc-arrow" aria-hidden="true"><path/><path class="head"/></svg><i class="gc-ring"></i>' +
    '<div class="gc-bub" role="status" aria-live="polite"><div class="gc-demo gd-dv"></div><p></p><div class="gc-dots"></div>' +
    '<div class="gc-btns"><button type="button" class="gd-btn pri gc-ok"></button><button type="button" class="gd-btn gc-skip"></button></div></div>' +
    '<button type="button" class="gh-btn" aria-haspopup="dialog"></button><div class="gh-bub" role="dialog" hidden></div><div class="gh-toast" role="status"></div>';
  document.body.appendChild(cRoot);
  const stop = (e) => e.stopPropagation();
  for (const el of [$('.gh-btn', cRoot), $('.gh-bub', cRoot), $('.gc-btns', cRoot)]) for (const ev of ['pointerdown', 'mousedown', 'touchstart']) el.addEventListener(ev, stop);
  $('.gc-skip', cRoot).addEventListener('click', () => { S.prefs.off = true; saveS(); hideHint(); toast(t(UI.skipped)); });
  $('.gc-ok', cRoot).addEventListener('click', () => nextStep(true));
  $('.gh-btn', cRoot).addEventListener('click', () => (helpOpen ? closeHelp() : openHelp()));
  look(cRoot);
  onLangChange(() => { paintHelpBtn(); if (cur) renderStep(); });
  return cRoot;
};
function toast(msg) {
  const e = $('.gh-toast', coachRoot()); e.textContent = msg; e.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 3200);
}

/* ---- ce que le jeu fait en ce moment (lecture seule) ---- */
function findPrompt() {
  const dp = document.getElementById('dgTakePrompt');
  if (dp && dp.style.display && dp.style.display !== 'none') return { el: dp, car: false };
  for (const el of document.body.children) {
    if (el === cRoot || el.id === 'tcRoot' || el.classList.contains('gd')) continue;
    const st = el.style;
    if (!st || st.display === 'none' || st.display === '') continue;
    const k = el.querySelector && el.querySelector('kbd');
    if (!k || !/^(E|F|E \/ ▲|▲)$/.test((k.textContent || '').trim())) continue;
    return { el, car: !!(window.Vehicle && window.Vehicle.state === 'parked' && /Monter|Get in|voiture|car/i.test(el.textContent || '')) };
  }
  return null;
}
const frontLive = () => document.querySelector('.sn-scan-result.visible, .dg-scan-result.visible, #dgGalleryPanel:not([hidden])');
function world() {
  const gu = window.GameUI, SM = window.SanctuaryMode, DG = window.DroneGame, V = window.Vehicle;
  const inGame = !!(gu && gu.isInGame && gu.isInGame());
  const ui = !!(gu && gu.isOpen && gu.isOpen());
  const scr = ui && document.querySelector('.gu-screen.on'), scrId = scr ? scr.dataset.screen : '';
  const dlg = !!document.querySelector('.tp-dialogue.on');
  // interface plein écran affichée par-dessus le jeu (une seule à la fois) : sa démo a le droit de s'afficher
  const ctx = isOpen ? 'guide' : dlg ? 'dialogue' : (window.CityMap && window.CityMap.isOpen) ? 'map' : (window.Lab && window.Lab.isOpen) ? 'lab' : (window.Dossier && window.Dossier.isOpen) ? 'dossier'
    : ui ? (scrId === 'pause' ? 'pause' : scrId === 'carte' ? 'carte' : scrId === 'main' ? 'main' : scrId === 'nouvelle' ? 'nouvelle' : 'ui') : '';
  const blocked = !inGame || !!ctx || !!(window.__storyFreeze || (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) || document.documentElement.classList.contains('gu-paused') || frontLive());
  const drone = !!(DG && DG.isActive && DG.isActive());
  if (drone) { droneSeen = true; droneUsed = true; }
  const car = !!(V && V.state === 'drive');
  const swim = !!(SM && SM.swimming);
  const sm = !!(SM && SM.isActive && SM.isActive());
  return { inGame, ctx, blocked, drone, car, swim, foot: sm && !drone && !car && !swim, radio: !!document.querySelector('.tp-radio.on'),
    aiming: !!(SM && SM.isAiming && SM.isAiming()), prompt: blocked ? null : findPrompt(), pos: sm && SM.playerPosition ? SM.playerPosition() : null };
}

/* ---- gestes faits par le joueur (une étape de démo avance quand il fait le geste) ---- */
const acts = new Set();
const mark = (a) => { acts.add(a); if (a === 'move') moved = true; else if (a === 'look') looked = true; };
const MOVE_KEYS = /^(z|q|s|d|w|a|arrowup|arrowdown|arrowleft|arrowright)$/i;
window.addEventListener('keydown', (e) => {
  if (isOpen) return;
  if (MOVE_KEYS.test(e.key)) { mark('move'); acts.add('L'); }
  if (e.key === 'Enter' || e.key === ' ') acts.add('next');         // dialogue : phrase suivante
  if (e.key === 'Escape') acts.add('skip');                         // dialogue : passer
  if (/^r$/i.test(e.key)) droneAt = Date.now();               // essai de décollage : « utilisé » seulement quand le drone vole VRAIMENT (R ne fait rien tant que le drone du sac n'est pas chargé)
  if (e.key === '+' || e.key === '-' || e.key === '−') acts.add('R');
  if (/^(l|h)$/i.test(e.key)) acts.add('lights');
}, true);
window.addEventListener('wheel', () => acts.add('R'), { passive: true, capture: true });
let lastDown = null;
window.addEventListener('pointerdown', (e) => {
  if (!(cRoot && cRoot.contains(e.target))) lastDown = { el: e.target, t: performance.now() };   // dernier appui du joueur (hors bulle) : sert à ranger la bulle quand il agit dessus
  const c = e.target && e.target.closest ? e.target.closest.bind(e.target) : () => null;
  if (c('.tc-stick, [data-key="move"], #snStick')) mark('move');
  if (c('.tc-look')) mark('look');
  if (c('.tp-d-next, .tp-dialogue')) acts.add('next');
  if (c('.tp-d-skip')) acts.add('skip');
  if (c('[data-key="drone"]')) droneAt = Date.now();
  if (c('[data-key="left"], #dgStickL')) acts.add('L');
  if (c('[data-key="right"], #dgStickR')) acts.add('R');
  if (c('[data-key="photo"], #dgPhoto')) acts.add('photo');
  if (c('[data-key="back"], #dgQuit')) acts.add('back');
}, true);
window.addEventListener('mousemove', (e) => { if (e.buttons && !isOpen && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) { mark('look'); acts.add('L'); } }, true);

/* ---- premier geste sur la cible montrée = on ferme seulement le guide ; le deuxième geste fait vraiment l'action ----
   (le joueur peut ainsi lire l'interface sans la bulle avant d'agir). Souris/toucher : capture des événements sur la cible ; clavier et manette : gate() appelée par les écrans. */
function gateTarget() {
  if (!cur || !cur.ready || cur.paused || cur.force) return null;
  const s = cur.h.steps[cur.i]; if (s.act) return null;                   // gestes continus (sticks, déplacement…) : jamais bloqués
  const tg = s.t ? s.t(lastW || world(), mode) : null;
  return tg && tg.getClientRects && vis(tg) ? tg : null;
}
function gateDismiss() {
  const h = cur.h;
  if (cur.i + 1 < h.steps.length) nextStep(); else { hideHint(!!h.ctx); lastEnd = h.ctx ? 0 : performance.now(); }
}
let gateSwallow = null;                                              // { tg, until } : le reste du geste (relâchement, clic) est avalé lui aussi
const GATE_EVS = ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'click'];
for (const ev of GATE_EVS) window.addEventListener(ev, (e) => {
  const path = e.composedPath ? e.composedPath() : [e.target];
  if (cRoot && path.includes(cRoot)) return;
  if (gateSwallow) {
    if (performance.now() > gateSwallow.until) gateSwallow = null;
    else if (path.includes(gateSwallow.tg)) { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); if (ev === 'click') gateSwallow = null; return; }
  }
  if (ev !== 'pointerdown' && ev !== 'mousedown' && ev !== 'touchstart') return;
  const tg = gateTarget(); if (!tg || !path.includes(tg)) return;
  gateSwallow = { tg, until: performance.now() + 1500 };
  e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault();
  gateDismiss();
}, { capture: true, passive: false });
/** Entrée / A pressées pendant qu'un conseil montre un bouton ou un écran : renvoie true (et ferme le guide) ; l'écran n'agit pas, il le fera au geste suivant. */
function gate() {
  if (!cur || !cur.h.ctx || !gateTarget()) return false;
  gateDismiss(); return true;
}

/* ---- les démos : une par interface ----
   steps = pages du guide (phrase et geste réutilisés) avec, pour chaque étape, la cible à montrer par la flèche et l'action qui la valide ;
   ctx = interface qui doit être affichée ; place = côté de la bulle (top : en haut au centre, right : à droite) */
const q = (sel) => document.querySelector(sel);
const tcEl = (key) => $(`#tcRoot [data-key="${key}"]`);
const shEl = (sel) => { const s = document.querySelector('.gu-screen.on'); return s && s.shadowRoot ? s.shadowRoot.querySelector(sel) : null; };
const st = (p, t, act, done) => ({ p, t, act, done });   // done(w) : le geste est fait (ouvrir la carte, viser…) → la bulle s'efface aussitôt
const HINTS = [
  { id: 'begin', ctx: 'nouvelle', place: 'top', when: (w) => w.ctx === 'nouvelle', steps: [st('begin', () => shEl('[data-act="begin"]'))] },
  { id: 'dialogue', ctx: 'dialogue', place: 'top', when: (w) => w.ctx === 'dialogue', steps: [st('dnext', () => q('.tp-d-next'), null, () => acts.has('next'))] },
  { id: 'bigmap', ctx: 'map', place: 'right', when: (w) => w.ctx === 'map', steps: [st('mpan', null, 'L'), st('mzoom', null, 'R'), st('mclose', () => q('.cm-close'))] },
  { id: 'pause', ctx: 'pause', place: 'right', when: (w) => w.ctx === 'pause', steps: [st('nav', () => shEl('[data-act="resume-game"]')), st('nback')] },
  { id: 'carte', ctx: 'carte', place: 'right', when: (w) => w.ctx === 'carte', steps: [st('nav', () => shEl('[data-act="resume"]'))] },
  { id: 'menu', ctx: 'main', place: 'right', when: (w) => w.ctx === 'main' && !w.inGame, steps: [st('nav', () => shEl('[data-act="new"]'))] },
  { id: 'lab', ctx: 'lab', place: 'right', when: (w) => w.ctx === 'lab', steps: [st('lplace', () => q('#labRoot .lab-big')), st('lab', () => q('#labInput')), st('labhint', () => { const b = q('#labRoot .lab-l-short'); return b && b.closest('button'); }), st('lreread', () => q('#labRelire'))] },
  { id: 'dossier', ctx: 'dossier', place: 'right', when: (w) => w.ctx === 'dossier', steps: [st('dossier', () => q('.ds-btn:not(.ds-back)')), st('dosprev', () => q('.ds-back'))] },
  { id: 'interact', when: (w) => w.prompt && !w.prompt.car && !w.car, steps: [st('interact', (w, m) => (m === 'touch' ? tcEl('interact') : w.prompt && w.prompt.el))] },
  { id: 'carin', when: (w) => w.prompt && w.prompt.car, steps: [st('carin', (w, m) => (m === 'touch' ? tcEl('interact') : w.prompt && w.prompt.el), null, (w) => w.car || !!(window.Vehicle && window.Vehicle.state && window.Vehicle.state !== 'parked'))] },
  { id: 'fly', essential: 1, when: (w) => w.drone, steps: [
    st('dclimb', (w, m) => (m === 'touch' ? tcEl('left') : q('#dgStickL')), 'L'), st('dturn', (w, m) => (m === 'touch' ? tcEl('left') : q('#dgStickL')), 'L'),
    st('dmove', (w, m) => (m === 'touch' ? tcEl('right') : q('#dgStickR')), 'R'), st('dside', (w, m) => (m === 'touch' ? tcEl('right') : q('#dgStickR')), 'R'),
    st('photo', (w, m) => (m === 'touch' ? tcEl('photo') : q('#dgPhoto')), 'photo'), st('dback', (w, m) => (m === 'touch' ? tcEl('back') : q('#dgQuit')), 'back')] },
  { id: 'car', when: (w) => w.car, steps: [st('car', (w, m) => (m === 'touch' ? tcEl('gas') : null), null, () => acts.has('move')), st('caraux', (w, m) => (m === 'touch' ? tcEl('lights') : null), null, () => acts.has('lights'))] },
  { id: 'swim', when: (w) => w.swim, steps: [st('swim', null, null, () => acts.has('move'))] },
  { id: 'circle', when: (w) => w.foot && ls('taama.dispositif1') === '1' && ls('taama.lab1') !== 'done' && near(w.pos, -175, -220, 70), steps: [st('circle', null, null, (w) => w.ctx === 'lab' || !!window.__storyFreeze || near(w.pos, -175.012, -219.890, 2.8) || !!(window.Vehicle && window.Vehicle.state === 'drive' && near(w.pos, -175.012, -219.890, 4)))] },
  { id: 'gadget', when: (w) => w.foot && ls('taama.gadget') === '1', steps: [st('gadget', (w, m) => (m === 'touch' ? tcEl('aim') : null), null, (w) => w.aiming)] },
  { id: 'drone', essential: 1, fast: 1, when: (w) => w.foot && ls('taama.dispositif1') !== '1' && !droneUsed && !takingOff(), steps: [st('drone', (w, m) => (m === 'touch' ? tcEl('drone') : null))] },
  { id: 'walk', essential: 1, when: (w) => w.foot && (has('drone') || droneUsed) && !takingOff(), steps: [st('move', (w, m) => (m === 'touch' ? tcEl('move') : null), 'move'), st('look', (w, m) => (m === 'touch' ? q('#tcRoot .tc-look') : null), 'look')] },
  { id: 'map', when: (w) => w.foot && has('walk') && !takingOff() && $('#cityMap.is-on'), steps: [st('map', () => $('#cityMap'), null, (w) => w.ctx === 'map')] },
];
const has = (id) => LG.hasSeen(S, id);
const takingOff = () => !droneSeen && Date.now() - droneAt < 8000;   // le drone décolle : pas d'autre conseil
const near = (p, x, z, r) => !!p && Math.hypot(p.x - x, p.z - z) < r;
/** Démos essentielles (drone, pilotage, marche) : sur un écran large la bulle s'affiche À DROITE même pendant la radio de Tapama (elle ne la recouvre pas) ; sur petit écran la radio passe d'abord. */
const radioOk = (h, w) => !!(h.essential && (window.innerWidth >= 1000 || (w && w.radioMs > 12000)));   // petit écran : la radio (pleine largeur) passe d'abord, mais jamais plus de 12 s
const eligible = (h, w) => h.when(w) && (h.ctx ? w.ctx === h.ctx : !w.blocked && (!w.radio || radioOk(h, w)));

function silentDone() {                                   // geste déjà fait avant la démo : on la range sans l'afficher
  for (const h of HINTS) if (!has(h.id) && ((h.id === 'drone' && (droneUsed || ls('taama.dispositif1') === '1')))) { S = LG.markSeen(S, h.id); saveS(); }
}
function hideHint(ctxEnd) {
  cur = null; curId = null; acts.clear();
  if (ctxEnd) lastEnd = 0;
  if (cRoot) { cRoot.classList.remove('hint'); $('.gc-bub', cRoot).classList.remove('on'); }
}
const stepPage = () => PAGES.find((x) => x.id === cur.h.steps[cur.i].p);
function showHint(h) {
  const c = coachRoot();
  look(c);
  cur = { h, i: 0, t: 0, last: 0, ready: false, t0: performance.now() }; curId = h.id;
  S = LG.markSeen(S, h.id); saveS(); acts.clear();
  emit('guide:hint', { id: h.id });
  $('.gc-ring', c).style.opacity = 0; $('.gc-arrow', c).style.opacity = 0;
  renderStep();
}
/** Dessine l'étape courante : phrase, pictogramme animé de l'appareil, boutons. La bulle n'apparaît qu'une fois prête (jamais à moitié affichée). */
const KEYMAP = { 'Entrée': ['Enter', 'Enter'], 'Échap': ['Escape', 'Escape'], 'Espace': [' ', 'Space'], 'Maj': ['Shift', 'ShiftLeft'] };
function pressKey(label) {
  const [key, code] = KEYMAP[label] || (label.length === 1 && /[a-z]/i.test(label) ? [label.toLowerCase(), 'Key' + label.toUpperCase()] : []);
  if (!key) return;
  for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }));
}
function renderStep() {
  if (!cur) return;
  const c = coachRoot(), h = cur.h, i = cur.i, p = stepPage(), m = mode, last = i === h.steps.length - 1;
  { const pe = $('.gc-bub p', c); pe.textContent = t(p.line[m]);
    if (last) { const sp = document.createElement('span'); sp.className = 'gc-cheer'; sp.textContent = t(UI['cheer' + ((h.id.length + h.steps.length) % 3)]); pe.append(sp); } }
  $('.gc-ok', c).textContent = t(last ? UI.gotit : UI.next);
  $('.gc-skip', c).textContent = t(UI.skip);
  $('.gc-dots', c).innerHTML = h.steps.length > 1 ? h.steps.map((_, n) => `<i${n === i ? ' class="on"' : ''}></i>`).join('') : '';
  const bub = $('.gc-bub', c);
  bub.dataset.place = h.place || (lastW && lastW.radio ? 'right' : 'top');
  (lowData() ? Promise.resolve(null) : loadArt()).then((A) => {
    if (!cur || cur.h !== h || cur.i !== i) return;
    const w = lastW || world(), tg = h.steps[i].t ? h.steps[i].t(w, m) : null;
    const demo = $('.gc-demo', c);
    demo.hidden = !A || (m === 'touch' && !!tg && vis(tg));         // tactile : la flèche montre le vrai bouton, pas besoin de dessin ; économie de données : pas de dessin
    if (!demo.hidden) demo.innerHTML = A.device(p, m);
    demo.onclick = (e) => { const k = e.target.closest && e.target.closest('.gd-cap'); if (k) pressKey(k.textContent.trim()); };   // cliquer sur la touche dessinée = appuyer sur cette touche
    c.dataset.mode = m; look(c);
    c.classList.add('hint'); c.hidden = false;
    cur.ready = true;
    if (!cur.paused) bub.classList.add('on');
  });
}
function nextStep(byButton) {
  if (!cur) return;
  acts.clear(); cur.t = 0; cur.last = 0; cur.t0 = performance.now();
  if (cur.i + 1 >= cur.h.steps.length) { const ctx = !!cur.h.ctx; hideHint(); lastEnd = performance.now(); if (ctx) lastEnd = 0; return; }
  cur.i++; cur.ready = false;
  $('.gc-bub', cRoot).classList.remove('on');
  renderStep();
}
function aim(w) {                                          // flèche animée + cercle autour de la cible
  const c = cRoot, s = cur.h.steps[cur.i], tg = s.t ? s.t(w, mode) : null, bub = $('.gc-bub', c), ring = $('.gc-ring', c), svg = $('.gc-arrow', c);
  const r = tg && tg.getBoundingClientRect && tg.getBoundingClientRect();
  if (!r || !r.width || !vis(tg)) { ring.style.opacity = 0; svg.style.opacity = 0; return; }
  const b = bub.getBoundingClientRect(), tx = r.left + r.width / 2, ty = r.top + r.height / 2;
  const below = ty > b.bottom, above = ty < b.top, side = !below && !above;
  const fx = side ? (tx < b.left ? b.left : b.right) : b.left + b.width / 2, fy = side ? b.top + b.height / 2 : below ? b.bottom : b.top;
  const rad = Math.min(Math.max(r.width, r.height) / 2 + 8, 90), dx = tx - fx, dy = ty - fy, len = Math.hypot(dx, dy) || 1;
  const ex = tx - (dx / len) * rad, ey = ty - (dy / len) * rad, mx = (fx + ex) / 2 + (below ? 30 : -30), my = (fy + ey) / 2;
  ring.style.cssText = `opacity:1;left:${tx - rad}px;top:${ty - rad}px;width:${rad * 2}px;height:${rad * 2}px`;
  svg.style.opacity = 1;
  const [pa, pb] = svg.querySelectorAll('path'), ang = Math.atan2(ey - my, ex - mx), hs = 12;
  pa.setAttribute('d', `M${fx} ${fy} Q${mx} ${my} ${ex} ${ey}`);
  pb.setAttribute('d', `M${ex} ${ey} L${ex - hs * Math.cos(ang - 0.5)} ${ey - hs * Math.sin(ang - 0.5)} M${ex} ${ey} L${ex - hs * Math.cos(ang + 0.5)} ${ey - hs * Math.sin(ang + 0.5)}`);
}

const TICK = 250, STEP_TTL = 20;
let radioSince = 0, radioOffAt = 0, lastReason = '';
function diagnose(w) {
  const r = [];
  if (S.prefs.off) r.push('conseils désactivés (Passer le guide)');
  if (isOpen) r.push('écran « Comment jouer » ouvert');
  if (!w.inGame && w.ctx !== 'main' && w.ctx !== 'nouvelle' && w.ctx !== 'dialogue') r.push('état jeu non prêt (pas en partie)');
  if (w.ctx) r.push('écran plein cadre : ' + w.ctx);
  else if (w.inGame && w.blocked) r.push(window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy() ? 'tapama occupé' : window.__storyFreeze ? 'histoire figée (labo/dossier)' : 'pause ou fiche de scan affichée');
  if (w.radio) r.push('radio de Tapama affichée depuis ' + Math.round(w.radioMs / 1000) + ' s');
  if (w.inGame && !w.foot && !w.drone && !w.car && !w.swim) r.push('personnage pas prêt (sanctuaire non actif)');
  const cand = HINTS.filter((h) => h.when(w)).map((h) => h.id + (has(h.id) ? ' (déjà vu)' : ''));
  return { reasons: r, candidates: cand };
}
function debugInfo() {
  const w = lastW || world(), d = diagnose(w);
  const next = HINTS.find((h) => LG.canHint(S, h.id) && h.when(w));
  return { build: (window.Guide && window.Guide.build) || '?', engineLoaded: true, device: mode, lastInput: last, pad: padOn(), lowData: lowData(), seen: Object.keys(S.seen), prefsOff: S.prefs.off,
    current: curId, step: cur ? cur.i : -1, ready: !!(cur && cur.ready), waiting: next ? next.id : null,
    reason: cur ? 'démo affichée : ' + curId : (next ? (d.reasons.join(' ; ') || 'va s\'afficher') : (d.reasons.join(' ; ') || 'aucune situation de démo en ce moment') + ' | situations vraies : ' + (d.candidates.join(', ') || 'aucune')),
    world: { ctx: w.ctx, inGame: w.inGame, blocked: w.blocked, radio: w.radio, foot: w.foot, drone: w.drone, car: w.car, swim: w.swim } };
}
const DBG = /[?&]guidedebug=1/.test(location.search);
function tick() {
  const c = cRoot, w = world();
  lastW = w;
  { const now = performance.now();                                  // durée d'affichage de la radio (les coupures de moins de 1,5 s entre deux messages ne comptent pas)
    if (w.radio) { radioOffAt = 0; if (!radioSince) radioSince = now; } else { if (!radioOffAt) radioOffAt = now; if (now - radioOffAt > 1500) radioSince = 0; }
    w.radioMs = radioSince ? now - radioSince : 0; }
  { const di = debugInfo(), rs = cur ? 'affichée:' + curId : di.waiting ? di.waiting + ' → ' + di.reason : ''; if (rs !== lastReason) { lastReason = rs; if (rs) console.info('[guide]', rs); } if (DBG) { let e = $('.gc-dbg', c); if (!e) { e = document.createElement('div'); e.className = 'gc-dbg'; c.appendChild(e); } e.textContent = `build ${di.build} · appareil ${di.device}${di.pad ? ' (manette branchée)' : ''} · vus : ${di.seen.join(',') || '—'} · ${di.reason}`; } }
  placeHelpBtn(w);
  if (cur) {
    const h = cur.h, s = h.steps[cur.i];
    { // règle générale : le joueur agit sur la cible (clic/toucher) ou valide dans l'écran affiché (Entrée, ✕, clic) → la bulle disparaît tout de suite
      const tg0 = s.t ? s.t(w, mode) : null;
      const hit = !!(lastDown && cur.t0 && lastDown.t > cur.t0 && ((tg0 && tg0.contains && tg0.contains(lastDown.el)) || (h.ctx && w.ctx === h.ctx)));
      if (!s.act && !s.done && !cur.force && (hit || (h.ctx && acts.has('next') && cur.t > 0.6))) { if (cur.i + 1 < h.steps.length) nextStep(); else { hideHint(!!h.ctx); lastEnd = h.ctx ? 0 : performance.now(); } return; } }
    if (s.done && s.done(w)) { if (cur.i + 1 < h.steps.length) nextStep(); else { hideHint(); lastEnd = performance.now(); } return; }
    cur.off = h.when(w) || cur.force ? 0 : (cur.off || 0) + 1;                            // l'interface a disparu (ex. le dialogue est fini) : la démo s'efface aussitôt
    if (cur.off >= (h.ctx ? 1 : 3)) { hideHint(!!h.ctx); lastEnd = h.ctx ? 0 : performance.now(); return; }
    const hold = h.ctx || cur.force ? false : (w.blocked || (w.radio && !radioOk(h, w)));      // la radio de Tapama et les écrans plein cadre passent avant (démos essentielles : bulle à droite)
    if (!h.ctx) $('.gc-bub', c).dataset.place = h.place || (w.radio ? 'right' : 'top');
    if (hold || w.ctx === 'guide') { c.classList.remove('hint'); $('.gc-bub', c).classList.remove('on'); cur.paused = true; cur.last = 0; return; }
    if (cur.paused) { cur.paused = false; if (cur.ready) { c.classList.add('hint'); $('.gc-bub', c).classList.add('on'); } }
    if (!cur.ready) return;
    const now = performance.now();
    cur.t += Math.min(1.5, (now - (cur.last || now)) / 1000); cur.last = now;      // durée réelle (même si le jeu est très lent)
    if (cur.t > STEP_TTL && !h.essential) { nextStep(); return; }                   // démos essentielles : la bulle reste jusqu'au geste ou « Compris ! »
    if (cur.t > 1.2 && s.act && acts.has(s.act) && cur.i < h.steps.length - 1) { nextStep(); return; }
    if (cur.t > 1.5 && cur.i === h.steps.length - 1 && s.act && acts.has(s.act)) { hideHint(); lastEnd = performance.now(); return; }
    aim(w);
    return;
  }
  if (S.prefs.off) return;
  if (!w.inGame && w.ctx !== 'main' && w.ctx !== 'nouvelle' && w.ctx !== 'dialogue') return;     // menu principal et dialogue d'ouverture : avant l'entrée en jeu
  silentDone();
  const h = HINTS.find((x) => LG.canHint(S, x.id) && eligible(x, w));
  if (!h) { for (const o of HINTS) o.pending = 0; return; }
  if (!h.ctx && performance.now() - lastEnd < 700) return;
  h.pending = (h.pending || 0) + 1;                                          // la situation doit durer un instant (évite les clignotements)
  for (const o of HINTS) if (o !== h) o.pending = 0;
  if (h.pending >= (h.ctx || h.fast ? 1 : 2)) { h.pending = 0; showHint(h); }
}
setInterval(() => {
  if (cRoot || (window.GameUI && window.GameUI.isInGame && window.GameUI.isInGame()) || (window.GameUI && window.GameUI.isOpen && window.GameUI.isOpen())) {
    try { coachRoot(); tick(); } catch (e) { console.warn('[guide] erreur, conseil rangé', e); try { hideHint(); lastEnd = performance.now(); } catch (_) {} }   // une erreur ne doit jamais laisser une bulle bloquée à l'écran
  }
}, TICK);
/* filet de sécurité indépendant du reste : un conseil de situation (hors écrans plein cadre et démos essentielles) ne reste jamais plus de 30 s */
setInterval(() => { if (cur && !cur.force && !cur.h.ctx && !cur.h.essential && cur.t0 && performance.now() - cur.t0 > 30000) { hideHint(); lastEnd = performance.now(); } }, 1000);

/* ---- bouton « ? » et « Que faire maintenant ? » ---- */
function paintHelpBtn() {
  if (!cRoot) return;
  const b = $('.gh-btn', cRoot);
  b.textContent = '?'; b.setAttribute('aria-label', t(UI.help)); b.title = t(UI.help);
}
function placeHelpBtn(w) {
  const c = cRoot, b = $('.gh-btn', c);
  const show = w.inGame && !w.blocked && !w.drone;
  const gear = $('#tcRoot .tc-gear');
  c.hidden = false;
  b.classList.toggle('on', show || (helpOpen && w.inGame && !isOpen));
  if (!show && helpOpen && (w.blocked)) closeHelp();
  if (gear && mode === 'touch' && gear.offsetParent !== null) {
    const r = gear.getBoundingClientRect();
    b.style.cssText = `left:${Math.round(r.left + r.width / 2 - 24)}px;top:${Math.round(r.bottom + 8)}px;right:auto;bottom:auto`;
    c.classList.add('tc');
  } else { b.style.cssText = ''; c.classList.remove('tc'); }
  paintHelpBtn();
}
function openHelp() {
  const f = flags(), o = LG.chooseObjective(f), c = coachRoot(), bub = $('.gh-bub', c);
  const nm = (window.GameUI && window.GameUI.player && window.GameUI.player()) || {};
  hideHint();
  bub.innerHTML = `<div class="gh-who"><img src="assets/images/tapama/tapama-souriante.webp" alt="" width="56" height="56"><b>Tapama</b></div>` +
    `<h3>${esc(t(UI.whatNow))}</h3><div class="gh-q">${A.chip(o.action, mode)}<p>${esc(fillName(t(OBJECTIVES[o.id]), nm.name))}</p></div>` +
    `<div class="gh-act"><button type="button" class="gd-btn" data-h="how">${esc(t(UI.how))}</button><button type="button" class="gd-btn" data-h="ask">${esc(t(UI.ask))}</button><button type="button" class="gd-btn pri" data-h="ok">${esc(t(UI.gotit))}</button></div>`;
  bub.hidden = false; helpOpen = true; look(c);
  try { window.TapamaVoice && window.TapamaVoice.line(OBJECTIVES[o.id], 'souriante', fillName(t(OBJECTIVES[o.id]), nm.name)); } catch (_) {}   // elle lit l'objectif à voix haute
  bub.onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.h === 'how') { closeHelp(); try { window.GameUI && window.GameUI.openPause && window.GameUI.openPause(); } catch (_) {} setTimeout(() => open(o.topic), 60); }
    else if (b.dataset.h === 'ask') { closeHelp(); try { window.Tapama && window.Tapama.help && window.Tapama.help('general'); } catch (_) {} }
    else closeHelp();
  };
  clearTimeout(helpT); helpT = setTimeout(closeHelp, 20000);
  if (padOn() && mode === 'pad') { helpPad = true; try { window.GamepadKit.capture(true); } catch (_) {} }   // la manette ne commande plus le jeu tant que la bulle est ouverte
  const first = $('button', bub); if (first) first.focus({ preventScroll: true });
}
function closeHelp() {
  helpOpen = false; clearTimeout(helpT); try { window.TapamaVoice && window.TapamaVoice.stop(); } catch (_) {}
  if (cRoot) $('.gh-bub', cRoot).hidden = true;
  if (helpPad) { helpPad = false; try { window.GamepadKit.capture(false); } catch (_) {} }
}

/* manette : BACK ouvre / ferme « Que faire maintenant ? » (BACK est libre à pied et en voiture) ; croix = choisir, A = valider, B = fermer */
function padHelp() {
  requestAnimationFrame(padHelp);
  const R = window.GamepadKit && window.GamepadKit.raw;
  if (!R || !padOn()) return;
  if (last === null) setLast('pad');                                // manette présente dès le lancement : c'est elle qui sert d'appareil de départ
  if (padActive(R)) setLast('pad');                                 // le dernier périphérique réellement utilisé
  const s = R.state(), b = padBase || s;
  if (Math.hypot(s.lx - b.lx, s.ly - b.ly) > 0.5) { mark('move'); acts.add('L'); }
  if (Math.hypot(s.rx - b.rx, s.ry - b.ry) > 0.5) { mark('look'); acts.add('R'); }
  if (R.justPressed('A')) { acts.add('photo'); acts.add('next'); }
  if (R.justPressed('RB')) acts.add('lights');
  if (R.justPressed('B')) acts.add('skip');
  if (R.down('LB')) { acts.add('back'); droneAt = Date.now(); }
  if (isOpen) return;
  const jp = (n) => R.justPressed(n);
  if (helpOpen) {
    const bs = [...cRoot.querySelectorAll('.gh-bub button')], i = bs.indexOf(document.activeElement);
    if (jp('BACK') || jp('B')) closeHelp();
    else if (jp('RIGHT') || jp('DOWN')) bs[(i + 1) % bs.length].focus({ preventScroll: true });
    else if (jp('LEFT') || jp('UP')) bs[(i - 1 + bs.length) % bs.length].focus({ preventScroll: true });
    else if (jp('A') && i >= 0) bs[i].click();
  } else if (jp('BACK') && lastW && lastW.inGame && !lastW.blocked && !lastW.drone) { setLast('pad'); openHelp(); }
}
requestAnimationFrame(padHelp);

/* ---- API ---- */
function hint(id) {
  const h = HINTS.find((x) => x.id === id); if (!h) return false;
  coachRoot(); showHint(h); cur.force = true; return true;       // démonstration à la demande (tests, « Rejouer ») : affichée même si la situation n'existe pas
}

coachRoot(); paintHelpBtn();
look(cRoot);
window.addEventListener('guide:reset', () => { cur = null; });
export const core = { get S() { return S; }, get mode() { return mode; }, $, esc, emit, look, saveS, flags, hideHint, closeHelp, reset, padOn, still, isTouchUi, paintHelpBtn, coachRoot, setOpen };
export default { gate, debug: debugInfo, open, start, close, hint, reset, step: (i) => { if (cur && i >= 0 && i < cur.h.steps.length) { cur.i = i; cur.ready = false; cur.t = 0; acts.clear(); renderStep(); } }, isOpen: () => isOpen, onKey, state: () => { const w = world(); return { idx: screenMod ? screenMod.idx() : 0, mode, viewMode: screenMod ? screenMod.view() : null, hint: curId, step: cur ? cur.i : -1, ready: !!(cur && cur.ready), seen: { ...S.seen }, prefs: { ...S.prefs }, world: { ctx: w.ctx, inGame: w.inGame, blocked: w.blocked, radio: w.radio, foot: w.foot, drone: w.drone, car: w.car, swim: w.swim, prompt: !!w.prompt, moved, looked, droneUsed, droneSeen } }; } };
