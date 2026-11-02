/* ==========================================================
   COMMANDES TACTILES — mobile / tablette (window.TouchControls)
   ----------------------------------------------------------
   Stick flottant + boutons contextuels + zone caméra (glisser à droite),
   par mode : à pied · visée du gadget · voiture · drone.
   Le moteur ÉMET les mêmes entrées que le clavier (KeyboardEvent / MouseEvent
   synthétiques sur window) ou appelle de petites API publiques
   (SanctuaryMode.vehicle.joy / .look, DroneGame.setTouchAxes) : aucun
   module de jeu n'a besoin de connaître le tactile.

   Affichage : auto (pointer: coarse + maxTouchPoints) · toujours · jamais ;
   ?touch=1 force, ?touch=0 masque. Éditeur plein écran : déplacer, taille,
   opacité, masquer, remplacer l'action, préréglages, réinitialisation.
   Stockage : localStorage « taama.touch.v1 ». Logique pure : touch-layout.js.

   API : TouchControls.visible() · .mode() · .openSettings() · .openEditor()
         .state() · .set(patch) · .refresh()
   ========================================================== */

import * as L from './touch-layout.js';

if (!document.getElementById('tcCss')) {
  const l = document.createElement('link');
  l.id = 'tcCss'; l.rel = 'stylesheet'; l.href = 'styles/touch-controls.css?v=3';
  document.head.appendChild(l);
}

/* ---------- Réglages (persistés) ---------- */
let state = (() => { try { return L.parse(localStorage.getItem(L.STORAGE_KEY)); } catch (_) { return L.defaultState(); } })();
function save() { try { localStorage.setItem(L.STORAGE_KEY, L.serialize(state)); } catch (_) {} }
function commit(next, { rerender = true } = {}) { state = L.migrate(next); save(); if (rerender) { render(); if (editorOn) renderEditor(); } paintSettings(); }

const lang = () => ((window.GameSettings && window.GameSettings.lang) || document.documentElement.lang || 'fr').startsWith('en') ? 'en' : 'fr';
const UI = {
  tabs: { fr: 'Commandes tactiles', en: 'Touch controls' },
  show: { fr: 'Afficher', en: 'Show' }, auto: { fr: 'Auto', en: 'Auto' }, always: { fr: 'Toujours', en: 'Always' }, never: { fr: 'Jamais', en: 'Never' },
  custom: { fr: 'Personnaliser les commandes', en: 'Customize controls' },
  size: { fr: 'Taille globale', en: 'Global size' }, opacity: { fr: 'Opacité globale', en: 'Global opacity' },
  lefty: { fr: 'Mode gaucher', en: 'Left-handed' }, look: { fr: 'Sensibilité de la caméra', en: 'Camera sensitivity' },
  haptics: { fr: 'Vibrations tactiles', en: 'Touch vibration' }, presets: { fr: 'Préréglages', en: 'Presets' },
  close: { fr: 'Fermer', en: 'Close' }, done: { fr: 'Terminé', en: 'Done' }, grid: { fr: 'Grille', en: 'Grid' },
  resetMode: { fr: 'Réinit. ce mode', en: 'Reset mode' }, resetAll: { fr: 'Tout réinit.', en: 'Reset all' },
  resetCtl: { fr: 'Remettre ce bouton', en: 'Reset this button' }, hide: { fr: 'Masquer', en: 'Hide' }, unhide: { fr: 'Afficher', en: 'Show' },
  action: { fr: 'Action', en: 'Action' }, sizeOne: { fr: 'Taille', en: 'Size' }, opOne: { fr: 'Opacité', en: 'Opacity' },
  copy: { fr: 'Copier', en: 'Copy' }, paste: { fr: 'Coller', en: 'Paste' }, title: { fr: 'Personnaliser les commandes', en: 'Customize controls' },
  hint: { fr: 'Touche un bouton pour le régler, glisse-le pour le déplacer.', en: 'Tap a button to adjust it, drag to move it.' },
  rotate: { fr: 'Tourne ton téléphone en mode paysage pour jouer', en: 'Rotate your phone to landscape to play' },
  rotateEdit: { fr: 'Tourne ton téléphone en paysage pour personnaliser', en: 'Rotate your phone to landscape to customize' },
  stickMove: { fr: 'Stick : se déplacer', en: 'Stick: move' }, stickL: { fr: 'Stick gauche : altitude et rotation', en: 'Left stick: altitude and turn' },
  stickR: { fr: 'Stick droit : direction', en: 'Right stick: direction' }, lookZone: { fr: 'Glisse ici : caméra', en: 'Drag here: camera' },
  pasteAsk: { fr: 'Colle ici la disposition (JSON) :', en: 'Paste the layout (JSON) here:' }, copied: { fr: 'Disposition copiée', en: 'Layout copied' },
  bad: { fr: 'Disposition invalide', en: 'Invalid layout' }, openBtn: { fr: 'Commandes tactiles', en: 'Touch controls' },
  gear: { fr: 'Réglages des commandes tactiles', en: 'Touch controls settings' },
};
const u = (k) => (UI[k] ? UI[k][lang()] : k);
const aLabel = (id) => L.actionLabel(id, lang());

/* ---------- Icônes SVG (24 × 24, trait) ---------- */
const ICO = {
  jump: '<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>',
  run: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  aim: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  fire: '<path d="M13.5 2L5 13.5h6L10 22l9-12h-6.5z" fill="currentColor"/>',
  fireSide: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
  kneel: '<path d="M6 8l6 6 6-6M7 19h10"/>',
  interact: '<path d="M9 11V6.5a1.8 1.8 0 013.6 0V11m0-1.2a1.8 1.8 0 013.6 0v2.2a6 6 0 01-6 6h-.8a5 5 0 01-4-2l-2-3a1.8 1.8 0 012.8-2.2L9 13"/>',
  drone: '<circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5"/>',
  map: '<path d="M12 21s-7-5.7-7-11a7 7 0 0114 0c0 5.3-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  photo: '<path d="M4 8h3l1.8-2.6h6.4L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/>',
  video: '<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M15 11l6-3v8l-6-3"/>',
  places: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>',
  gas: '<path d="M12 4l7.5 15h-15z" fill="currentColor"/>',
  brake: '<rect x="7" y="4" width="10" height="16" rx="3"/><path d="M10 9h4M10 12h4M10 15h4"/>',
  left: '<path d="M15 5l-7 7 7 7" stroke-width="3"/>',
  right: '<path d="M9 5l7 7-7 7" stroke-width="3"/>',
  handbrake: '<circle cx="12" cy="12" r="9"/><path d="M10 17V7h3a3 3 0 010 6h-3"/>',
  lights: '<path d="M10 6a6 6 0 100 12z"/><path d="M14 8h7M14 12h7M14 16h7"/>',
  hazard: '<path d="M12 3l10 18H2z"/><path d="M12 10v4.5M12 17.6v.1"/>',
  view: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  exit: '<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>',
  back: '<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[name] || ''}</svg>`;

/* ---------- Environnement ---------- */
const params = new URLSearchParams(location.search);
const urlParam = L.touchParam(location.search);
const mq = window.matchMedia ? window.matchMedia('(pointer: coarse)') : { matches: false };
const isDeviceTouch = () => L.isTouchDevice({ coarse: mq.matches, maxTouchPoints: navigator.maxTouchPoints || 0 });
const enabled = () => L.shouldShow({ show: state.show, param: urlParam, coarse: mq.matches, maxTouchPoints: navigator.maxTouchPoints || 0 });
const gadgetOn = () => { try { return localStorage.getItem('taama.gadget') === '1'; } catch (_) { return false; } };
const portrait = () => window.innerHeight > window.innerWidth * 1.05;
const devScale = () => Math.max(1, Math.min(1.5, Math.min(window.innerWidth, window.innerHeight) / 390));
const $ = (s, r = document) => r.querySelector(s);

/* ---------- Émission d'entrées ---------- */
function key(type, k, code) {
  window.dispatchEvent(new KeyboardEvent(type, { key: k, code, bubbles: true, cancelable: true }));
}
function mouse(type, button) {
  window.dispatchEvent(new MouseEvent(type, { button, bubbles: true, cancelable: true }));
}
function haptic(ms = 12) {
  if (!state.haptics) return;
  if (window.GameSettings && window.GameSettings.rumble === false) return;     // Options › Vibrations
  try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {}
}
const click = (id) => { const e = document.getElementById(id); if (e) e.click(); };
const SM = () => window.SanctuaryMode;
const DG = () => window.DroneGame;

/* prompts « E / F » existants : divs fixes ajoutés par vehicle.js, dispositif1.js, neantis-base.js, drone-game.js */
function findPrompt() {
  let found = null;
  for (const el of document.body.children) {
    if (el.id === 'tcRoot' || (el.closest && el.closest('#tcRoot'))) continue;
    const st = el.style;
    if (!st || st.display === 'none' || st.display === '') continue;
    const k = el.querySelector && el.querySelector('kbd, span');
    if (!k) continue;
    const kt = (k.textContent || '').trim();
    if (!(el.querySelector('kbd') || /^(E|F|E \/ ▲|▲|R3)$/.test(kt))) continue;
    el.classList.add('tc-prompt');          // les rappels de touches clavier (E, F, V, L, H…) sont masqués en mode tactile
    if (found || !/^(E|F|E \/ ▲|▲|R3)$/.test(kt)) continue;
    const label = (el.textContent || '').replace(kt, '').trim();
    if (label) found = { el, key: /F/.test(kt) && !/E/.test(kt) ? 'F' : 'E', label };
  }
  return found;
}

/* ---------- Actions ---------- */
const KEYMAP = {
  jump: ['x', 'KeyX'], kneel: ['k', 'KeyK'], fire: ['f', 'KeyF'], fireSide: ['v', 'KeyV'], run: ['Shift', 'ShiftLeft'],
  gas: ['w', 'KeyW'], brake: ['s', 'KeyS'], steerL: ['a', 'KeyA'], steerR: ['d', 'KeyD'], handbrake: [' ', 'Space'],
  lights: ['l', 'KeyL'], hazard: ['h', 'KeyH'], view: ['v', 'KeyV'], exitCar: ['f', 'KeyF'],
};
const live = new Map();            // action → Set(pointerId) : appuis en cours
const pendingKey = new Map();      // action → touche émise (interagir : E ou F figé à l'appui)

function actionDown(id, ev) {
  const a = L.ACTIONS[id]; if (!a) return;
  if (a.kind === 'hold' || a.kind === 'latch') {
    const s = live.get(id) || new Set();
    const first = s.size === 0;
    s.add(ev); live.set(id, s);
    if (!first) return;
  }
  haptic(a.kind === 'tap' ? 14 : 10);
  switch (id) {
    case 'aim': mouse('mousedown', 2); break;
    case 'interact': {
      const p = findPrompt();
      const k = p ? p.key : 'E';
      pendingKey.set(id, k);
      key('keydown', k.toLowerCase(), 'Key' + k); setTimeout(() => key('keyup', k.toLowerCase(), 'Key' + k), 90);
      break;
    }
    case 'photo': click(DG() && DG().isActive() ? 'dgPhoto' : 'snPhoto'); break;
    case 'video': click(DG() && DG().isActive() ? 'dgVideo' : 'snVideo'); break;
    case 'places': click(DG() && DG().isActive() ? 'dgList' : 'snMenu'); break;
    case 'pause': try { window.GameUI && window.GameUI.openPause && window.GameUI.openPause(); } catch (_) {} break;
    case 'map': try { window.CityMap && window.CityMap.toggle(); } catch (_) {} break;
    case 'droneOn': try { SM() && SM().takeoffDrone && SM().takeoffDrone(); } catch (_) {} break;
    case 'backChar': try { if (DG() && DG().launched && DG().launched()) DG().returnToCharacter(); else click('dgQuit'); } catch (_) {} break;
    case 'quitDrone': click('dgQuit'); break;
    case 'fire': case 'fireSide': case 'jump': case 'kneel': case 'lights': case 'hazard': case 'view': case 'exitCar':
    case 'run': case 'gas': case 'brake': case 'steerL': case 'steerR': case 'handbrake': {
      const m = KEYMAP[id];
      key('keydown', m[0], m[1]);
      if (a.kind === 'tap') setTimeout(() => key('keyup', m[0], m[1]), 60);
      break;
    }
    default: break;
  }
}
function actionUp(id, ev) {
  const a = L.ACTIONS[id]; if (!a) return;
  if (a.kind !== 'hold' && a.kind !== 'latch') return;
  const s = live.get(id); if (!s) return;
  s.delete(ev);
  if (s.size) return;
  live.delete(id);
  if (id === 'aim') mouse('mouseup', 2);
  else if (KEYMAP[id]) key('keyup', KEYMAP[id][0], KEYMAP[id][1]);
}
function releaseAll() {
  for (const id of [...live.keys()]) { const s = live.get(id); for (const ev of [...s]) actionUp(id, ev); }
  latched.clear();
  axes.mx = axes.my = axes.lx = axes.ly = axes.rx = axes.ry = 0; pushAxes();
  for (const s of stickState.values()) s.reset && s.reset();
}

/* ---------- Axes (sticks) ---------- */
const axes = { mx: 0, my: 0, lx: 0, ly: 0, rx: 0, ry: 0 };
function pushAxes() {
  try {
    const sm = SM();
    if (sm && sm.vehicle && sm.vehicle.joy) { sm.vehicle.joy.x = axes.mx; sm.vehicle.joy.y = axes.my; }
    const dg = DG();
    if (dg && dg.setTouchAxes) dg.setTouchAxes(axes.lx, axes.ly, axes.rx, axes.ry);
  } catch (_) {}
}
const stickState = new Map();     // clé du contrôle → { reset }
function shape(v) {               // zone morte + courbe douce (précision au centre)
  const a = Math.abs(v);
  if (a < L.STICK_DEADZONE) return 0;
  const s = (a - L.STICK_DEADZONE) / (1 - L.STICK_DEADZONE);
  return Math.sign(v) * Math.min(1, s * (0.6 + 0.4 * s) * 1.12 + 0.0);
}
const ROLE_OUT = {
  move: (x, y) => { axes.mx = x; axes.my = y; },
  dl: (x, y) => { axes.lx = x; axes.ly = y; },
  dr: (x, y) => { axes.rx = x; axes.ry = y; },
};

/* ---------- Mode courant ---------- */
function currentMode() {
  const gu = window.GameUI;
  if (gu && gu.isOpen && gu.isOpen()) return null;
  if (DG() && DG().isActive()) return 'drone';
  const sm = SM();
  if (sm && sm.isActive && sm.isActive()) {
    if (window.Vehicle && window.Vehicle.state === 'drive') return 'car';
    return sm.isAiming && sm.isAiming() ? 'aim' : 'foot';
  }
  return null;
}
function blockReason() {
  if (window.__storyFreeze) return 'storyFreeze';
  if (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) return 'tapama';
  if (window.CityMap && window.CityMap.isOpen) return 'citymap';
  if (document.querySelector('.sn-scan-result.visible, .dg-scan-result.visible, #dgGalleryPanel:not([hidden])')) return 'scan/galerie';
  if (document.documentElement.classList.contains('gu-paused')) return 'pause';
  return '';
}
function blocked() {
  if (window.__storyFreeze) return true;
  if (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) return true;
  if (window.CityMap && window.CityMap.isOpen) return true;
  if (document.querySelector('.sn-scan-result.visible, .dg-scan-result.visible, #dgGalleryPanel:not([hidden])')) return true;
  if (document.documentElement.classList.contains('gu-paused')) return true;
  return false;
}

/* ---------- Rendu du jeu ---------- */
let root, field, lookEl, gearEl, rotateEl;
let renderedMode = null, renderedSig = '', shownMode = null, ctlEls = new Map();
const latched = new Set();
let activeBtnPointers = 0;
let lookPtr = null, lookLast = null;

function build() {
  root = document.createElement('div');
  root.id = 'tcRoot'; root.hidden = true;
  root.innerHTML = '<div class="tc-field"></div><div class="tc-rotate" hidden><span class="tc-rotate-ico">⟳</span><p></p></div>';
  document.body.appendChild(root);
  field = $('.tc-field', root);
  rotateEl = $('.tc-rotate', root);
  // pas de zoom / défilement accidentel
  root.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => { if (shownMode) e.preventDefault(); }, { passive: false });
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => { const n = Date.now(); if (shownMode && root.contains(e.target) && n - lastEnd < 320) e.preventDefault(); lastEnd = n; }, { passive: false });
}

function pxOf(c) { return Math.round(L.sizePx(c, state.globalSize) * (c.type === 'stick' ? Math.min(devScale(), 1.2) : devScale())); }   // sticks : plafonnés sur tablette (ils couvriraient la moitié de l'écran)

function iconFor(c) { return c.type === 'btn' ? svg(L.ACTIONS[c.action] ? L.ACTIONS[c.action].icon : 'interact') : ''; }

function ctlEl(c, editing) {
  const el = document.createElement('div');
  const d = pxOf(c);
  el.className = `tc-ctl tc-${c.type}` + (c.shape ? ` tc-${c.shape}` : '') + (c.hidden ? ' is-hidden' : '');
  el.dataset.key = c.key;
  if (c.x > 0.9) el.classList.add('edge-r'); else if (c.x < 0.1) el.classList.add('edge-l');
  el.style.cssText = `left:${(c.x * 100).toFixed(2)}%;top:${(c.y * 100).toFixed(2)}%;--d:${d}px;--op:${c.opacityEff}`;
  if (c.type === 'stick') {
    el.innerHTML = '<i class="tc-ring"></i><i class="tc-knob"></i>';
    if (editing) el.insertAdjacentHTML('beforeend', `<span class="tc-lbl">${u(c.role === 'move' ? 'stickMove' : c.role === 'dl' ? 'stickL' : 'stickR')}</span>`);
  } else if (c.type === 'btn') {
    el.innerHTML = `<span class="tc-ico">${iconFor(c)}</span><span class="tc-lbl">${aLabel(c.action)}</span>`;
  }
  return el;
}

function render() {
  if (!root) return;
  const mode = renderedMode;
  field.textContent = ''; ctlEls = new Map(); lookEl = null;
  field.dataset.mode = mode || '';
  stickState.clear();
  if (!mode) return;
  const prof = L.resolveProfile(state, mode);
  const look = prof.find((c) => c.type === 'look');
  if (look && !look.hidden && mode !== 'drone') {
    lookEl = document.createElement('div'); lookEl.className = 'tc-look'; field.appendChild(lookEl);
    bindLook(lookEl);
  }
  for (const c of prof) {
    if (c.type === 'look' || c.hidden) continue;
    const el = ctlEl(c, false);
    field.appendChild(el); ctlEls.set(c.key, { el, c });
    if (c.type === 'btn') bindBtn(el, c); else if (c.type === 'stick') bindStick(el, c);
  }
  // petit bouton ⚙ (réglages) : toujours présent, discret
  gearEl = document.createElement('button');
  gearEl.type = 'button'; gearEl.className = 'tc-gear'; gearEl.setAttribute('aria-label', u('gear')); gearEl.innerHTML = svg('gear');
  gearEl.style.setProperty('--d', Math.round(44 * Math.max(1, devScale() * 0.9)) + 'px');
  gearEl.addEventListener('click', () => openSettings());
  field.appendChild(gearEl);
  syncDynamic(true);
}

function bindBtn(el, c) {
  const act = c.action; const kind = L.ACTIONS[act] && L.ACTIONS[act].kind;
  let t0 = 0, wasLatched = false, pid = null;
  const down = (e) => {
    if (pid !== null) return;
    e.preventDefault(); pid = e.pointerId; activeBtnPointers++;
    try { el.setPointerCapture(pid); } catch (_) {}
    el.classList.add('is-down'); t0 = e.timeStamp;
    if (kind === 'latch') {
      wasLatched = latched.has(act);
      if (wasLatched) { latched.delete(act); actionUp(act, 'latch'); paintLatch(); }
      else actionDown(act, 'p' + pid);
    } else if (kind === 'toggle') {
      actionDown(act, 'p' + pid);
    } else actionDown(act, 'p' + pid);
  };
  const up = (e) => {
    if (e.pointerId !== pid) return;
    activeBtnPointers = Math.max(0, activeBtnPointers - 1);
    el.classList.remove('is-down'); const id = pid; pid = null;
    if (kind === 'latch' && !wasLatched) {
      if (e.timeStamp - t0 < 300 && e.type === 'pointerup') { latched.add(act); actionDown(act, 'latch'); actionUp(act, 'p' + id); paintLatch(); }
      else actionUp(act, 'p' + id);
    } else if (kind === 'hold') actionUp(act, 'p' + id);
    if (!activeBtnPointers) maybeRerender();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}
function paintLatch() { for (const { el, c } of ctlEls.values()) if (c.type === 'btn') el.classList.toggle('is-latched', latched.has(c.action)); }

function bindStick(el, c) {
  let pid = null, cx = 0, cy = 0;
  const d = pxOf(c), R = d * 0.5 * 0.82;
  const out = ROLE_OUT[c.role] || (() => {});
  const knob = $('.tc-knob', el), ring = $('.tc-ring', el);
  const home = () => { el.style.left = (c.x * 100).toFixed(2) + '%'; el.style.top = (c.y * 100).toFixed(2) + '%'; };
  const reset = () => { pid = null; knob.style.transform = ''; el.classList.remove('is-down'); home(); out(0, 0); pushAxes(); };
  stickState.set(c.key, { reset });
  // la zone tactile est plus grande que l'anneau visible (stick flottant : l'anneau suit le doigt)
  el.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    e.preventDefault(); pid = e.pointerId; try { el.setPointerCapture(pid); } catch (_) {}
    const f = field.getBoundingClientRect();
    cx = Math.max(f.left + d * 0.5, Math.min(f.right - d * 0.5, e.clientX));
    cy = Math.max(f.top + d * 0.5, Math.min(f.bottom - d * 0.5, e.clientY));
    el.style.left = (cx - f.left) + 'px'; el.style.top = (cy - f.top) + 'px';
    el.classList.add('is-down'); move(e);
  });
  const move = (e) => {
    let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy);
    if (m > R) { dx = dx / m * R; dy = dy / m * R; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    let nx = dx / R, ny = dy / R; const mag = Math.hypot(nx, ny);
    if (mag > 0) { const s = shape(mag) / mag; nx *= s; ny *= s; }
    out(nx, ny); pushAxes();
  };
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
  const up = (e) => { if (e.pointerId === pid) { haptic(6); reset(); } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}

function bindLook(el) {
  el.addEventListener('pointerdown', (e) => {
    if (lookPtr !== null) return;
    e.preventDefault(); lookPtr = e.pointerId; lookLast = [e.clientX, e.clientY];
    try { el.setPointerCapture(lookPtr); } catch (_) {}
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== lookPtr) return;
    const dx = e.clientX - lookLast[0], dy = e.clientY - lookLast[1];
    lookLast = [e.clientX, e.clientY];
    // 0,9 : le glisser doit être un peu plus doux qu'à la souris (le doigt couvre plus de pixels)
    try { SM() && SM().look && SM().look(dx, dy, state.lookSens * 0.9); } catch (_) {}
  });
  const up = (e) => { if (e.pointerId === lookPtr) lookPtr = null; };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}

/* éléments dynamiques : « Interagir » n'apparaît que si un prompt est visible ; tir seulement si le gadget est débloqué */
function syncDynamic(force) {
  if (!root || shownMode === null) return;
  const p = findPrompt();
  const g = gadgetOn();
  for (const { el, c } of ctlEls.values()) {
    if (c.type !== 'btn') continue;
    const a = L.ACTIONS[c.action];
    let vis = true;
    if (a && a.contextual) vis = !!p;
    if (a && a.needs === 'gadget') vis = g;
    el.classList.toggle('is-off', !vis);
    if (c.action === 'video') el.classList.toggle('is-on', !!document.querySelector('#snVideo.is-active, #dgVideo.is-active'));   // enregistrement en cours
    if (a && a.contextual && p) { const l = $('.tc-lbl', el); if (l && l.textContent !== p.label) l.textContent = p.label; el.classList.add('is-ctx'); }
  }
  void force;
}

function maybeRerender() {
  const want = shownMode;
  if (activeBtnPointers || lookPtr !== null) return;
  if (want !== renderedMode) { releaseAll(); renderedMode = want; render(); }
}

/* L'horloge du jeu (daycycle.js) se range sous le mini-cercle carte quand les commandes sont là : sur tablette elle tomberait sous le stick */
let clockMoved = false;
function placeClock(live) {
  const clk = document.querySelector('.dc-clock');
  if (!clk) return;
  if (live) {
    const cm = document.querySelector('.cm');
    if (!cm || !clk.offsetParent) return;
    const r = cm.getBoundingClientRect(), pr = clk.offsetParent.getBoundingClientRect();
    clk.style.bottom = 'auto'; clk.style.top = Math.round(r.bottom - pr.top + 8) + 'px'; clockMoved = true;
  } else if (clockMoved) { clk.style.bottom = ''; clk.style.top = ''; clockMoved = false; }
}

/* ---------- Boucle de surveillance (~8 Hz) ---------- */
function tick() {
  if (!root) return;
  const on = enabled();
  const mode = on ? currentMode() : null;
  const hide = !mode || blocked() || editorOn;
  const por = !!mode && !hide && portrait();
  const target = hide || por ? null : mode;
  if (target !== shownMode) {
    shownMode = target;
    if (!target) { releaseAll(); renderedMode = null; render(); }
    else if (!activeBtnPointers && lookPtr === null) { releaseAll(); renderedMode = target; render(); }
  } else if (target && target !== renderedMode) maybeRerender();
  root.hidden = !shownMode && !por;
  field.hidden = !shownMode;
  rotateEl.hidden = !por;
  if (por) $('p', rotateEl).textContent = u('rotate');
  document.documentElement.classList.toggle('tc-live', !!shownMode);
  placeClock(!!shownMode);
  if (shownMode) syncDynamic(false);
}

/* ==========================================================
   ÉDITEUR PLEIN ÉCRAN
   ========================================================== */
let ed, edField, edMode = 'foot', edSel = null, editorOn = false;
function openEditor(mode) {
  if (editorOn) return;
  closeSettings();
  editorOn = true; releaseAll(); shownMode = null; renderedMode = null; render(); root.hidden = true;
  document.documentElement.classList.add('tc-editing');
  const cur = mode || currentMode() || 'foot';
  edMode = L.MODES.includes(cur) ? cur : 'foot'; edSel = null;
  if (!ed) buildEditor();
  ed.hidden = false;
  renderEditor();
}
function closeEditor() {
  if (!ed) return;
  editorOn = false; ed.hidden = true; edSel = null;
  document.documentElement.classList.remove('tc-editing');
  tick();
}
function buildEditor() {
  ed = document.createElement('div'); ed.id = 'tcEditor'; ed.hidden = true;
  ed.innerHTML = `
    <div class="tc-ed-field"></div>
    <div class="tc-ed-bar">
      <div class="tc-ed-row1"><div class="tc-ed-tabs"></div><button type="button" class="tc-chip tc-primary" data-ed="done"></button></div>
      <div class="tc-ed-row2">
        <select class="tc-chip" data-ed="preset" aria-label=""></select>
        <button type="button" class="tc-chip" data-ed="grid"></button>
        <button type="button" class="tc-chip" data-ed="resetMode"></button>
        <button type="button" class="tc-chip" data-ed="resetAll"></button>
        <button type="button" class="tc-chip" data-ed="copy"></button>
        <button type="button" class="tc-chip" data-ed="paste"></button>
      </div>
    </div>
    <div class="tc-ed-insp" hidden></div>
    <div class="tc-rotate tc-ed-rotate" hidden><span class="tc-rotate-ico">⟳</span><p></p></div>`;
  document.body.appendChild(ed);
  edField = $('.tc-ed-field', ed);
  ed.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ed]'); if (!b) return;
    const a = b.dataset.ed;
    if (a === 'done') closeEditor();
    else if (a === 'grid') commit({ ...state, grid: !state.grid });
    else if (a === 'resetMode') commit(L.resetMode(state, edMode));
    else if (a === 'resetAll') commit(L.resetAll(state));
    else if (a === 'copy') {
      const txt = L.serialize(state);
      try { navigator.clipboard.writeText(txt).then(() => toast(u('copied')), () => window.prompt('JSON', txt)); } catch (_) { window.prompt('JSON', txt); }
    } else if (a === 'paste') {
      const txt = window.prompt(u('pasteAsk'), '');
      if (txt) { try { JSON.parse(txt); commit({ ...L.migrate(txt), show: state.show }); } catch (_) { toast(u('bad')); } }
    }
  });
  $('[data-ed=preset]', ed).addEventListener('change', (e) => { if (e.target.value) commit(L.applyPreset(state, e.target.value)); e.target.value = ''; });
  window.addEventListener('resize', () => { if (editorOn) renderEditor(); });
}
function renderEditor() {
  if (!ed) return;
  const por = portrait();
  $('.tc-ed-rotate', ed).hidden = !por; $('.tc-ed-rotate p', ed).textContent = u('rotateEdit');
  edField.hidden = por; $('.tc-ed-bar', ed).hidden = por;
  $('[data-ed=done]', ed).textContent = '✓ ' + u('done');
  $('[data-ed=grid]', ed).textContent = u('grid') + ' : ' + (state.grid ? 'ON' : 'OFF');
  $('[data-ed=grid]', ed).classList.toggle('is-on', state.grid);
  $('[data-ed=resetMode]', ed).textContent = u('resetMode');
  $('[data-ed=resetAll]', ed).textContent = u('resetAll');
  $('[data-ed=copy]', ed).textContent = u('copy'); $('[data-ed=paste]', ed).textContent = u('paste');
  const sel = $('[data-ed=preset]', ed);
  sel.setAttribute('aria-label', u('presets'));
  sel.innerHTML = `<option value="">${u('presets')}…</option>` + Object.keys(L.PRESETS).map((k) => `<option value="${k}">${L.PRESETS[k][lang()]}</option>`).join('');
  const tabs = $('.tc-ed-tabs', ed); tabs.textContent = '';
  for (const m of L.MODES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tc-chip' + (m === edMode ? ' is-on' : ''); b.textContent = L.MODE_SHORT[m][lang()];
    b.addEventListener('click', () => { edMode = m; edSel = null; renderEditor(); });
    tabs.appendChild(b);
  }
  // champ + grille
  edField.textContent = '';
  const prof = L.resolveProfile(state, edMode);
  if (state.grid) { const g = document.createElement('div'); g.className = 'tc-grid'; edField.appendChild(g); }
  const lookC = prof.find((c) => c.type === 'look');
  if (edMode !== 'drone' && lookC && !lookC.hidden) {
    const z = document.createElement('div'); z.className = 'tc-look tc-look-ed'; z.innerHTML = `<span class="tc-lbl">${u('lookZone')}</span>`; edField.appendChild(z);
  }
  for (const c of prof) {
    if (c.type === 'look') continue;
    const el = ctlEl(c, true); el.classList.add('tc-edit');
    el.style.setProperty('--op', c.hidden ? 0.5 : Math.max(0.55, c.opacityEff));
    if (c.key === edSel) el.classList.add('is-sel');
    edField.appendChild(el);
    bindDrag(el, c);
  }
  renderInspector(prof);
}
function bindDrag(el, c) {
  let pid = null, moved = false, ox = 0, oy = 0;
  el.addEventListener('pointerdown', (e) => {
    if (pid !== null) return;
    e.preventDefault(); pid = e.pointerId; moved = false;
    try { el.setPointerCapture(pid); } catch (_) {}
    const f = edField.getBoundingClientRect();
    ox = (e.clientX - f.left) / f.width - c.x; oy = (e.clientY - f.top) / f.height - c.y;
    edSel = c.key; edField.querySelectorAll('.tc-edit').forEach((n) => n.classList.toggle('is-sel', n === el));
    el.dataset.sx = e.clientX; el.dataset.sy = e.clientY;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    if (!moved && Math.hypot(e.clientX - el.dataset.sx, e.clientY - el.dataset.sy) < 6) return;
    moved = true;
    const f = edField.getBoundingClientRect();
    const x = L.clampPos((e.clientX - f.left) / f.width - ox), y = L.clampPos((e.clientY - f.top) / f.height - oy);
    el.style.left = (x * 100) + '%'; el.style.top = (y * 100) + '%';
    el._pos = [x, y];
  });
  const up = (e) => {
    if (e.pointerId !== pid) return; pid = null;
    if (moved && el._pos) { commit(L.setControl(state, edMode, c.key, { x: el._pos[0], y: el._pos[1] }), { rerender: false }); el._pos = null; renderEditor(); }
    else renderInspector(L.resolveProfile(state, edMode));
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
function renderInspector(prof) {
  const box = $('.tc-ed-insp', ed);
  const c = prof.find((x) => x.key === edSel);
  if (!c || portrait()) { box.hidden = true; return; }
  box.hidden = false;
  box.classList.toggle('on-left', c.x > 0.5);
  const isBtn = c.type === 'btn';
  const name = isBtn ? aLabel(c.action) : (c.role === 'move' ? u('stickMove') : c.role === 'dl' ? u('stickL') : u('stickR'));
  box.innerHTML = `
    <div class="tc-in-head"><b>${name}</b><button type="button" class="tc-x" data-in="close" aria-label="${u('close')}">✕</button></div>
    <label>${u('sizeOne')}<input type="range" min="${L.LIMITS.size.min * 100}" max="${L.LIMITS.size.max * 100}" step="5" value="${Math.round(c.size * 100)}" data-in="size"><em>${Math.round(c.size * 100)}%</em></label>
    <label>${u('opOne')}<input type="range" min="${L.LIMITS.opacity.min * 100}" max="100" step="5" value="${Math.round(c.opacity * 100)}" data-in="opacity"><em>${Math.round(c.opacity * 100)}%</em></label>
    ${isBtn ? `<label>${u('action')}<select data-in="action">${L.actionsForMode(edMode).map((id) => `<option value="${id}"${id === c.action ? ' selected' : ''}>${aLabel(id)}</option>`).join('')}</select></label>` : ''}
    <div class="tc-in-btns"><button type="button" class="tc-chip" data-in="hide">${c.hidden ? u('unhide') : u('hide')}</button><button type="button" class="tc-chip" data-in="reset">${u('resetCtl')}</button></div>`;
  box.querySelector('[data-in=close]').onclick = () => { edSel = null; renderEditor(); };
  const rs = (name2, fn, fin) => { const i = box.querySelector(`[data-in=${name2}]`); if (!i) return;
    i.addEventListener('input', () => { fn(Number(i.value)); i.nextElementSibling.textContent = i.value + '%'; });
    i.addEventListener('change', fin); };
  const patchLive = (p) => { state = L.setControl(state, edMode, c.key, p); const el = edField.querySelector(`[data-key="${c.key}"]`); const nc = L.resolveProfile(state, edMode).find((x) => x.key === c.key);
    if (el && nc) { el.style.setProperty('--d', pxOf(nc) + 'px'); el.style.setProperty('--op', Math.max(0.55, nc.opacityEff)); } };
  rs('size', (v) => patchLive({ size: v / 100 }), () => { save(); renderEditor(); });
  rs('opacity', (v) => patchLive({ opacity: v / 100 }), () => { save(); renderEditor(); });
  const sa = box.querySelector('[data-in=action]');
  if (sa) sa.addEventListener('change', () => commit(L.setControl(state, edMode, c.key, { action: sa.value })));
  box.querySelector('[data-in=hide]').onclick = () => commit(L.setControl(state, edMode, c.key, { hidden: !c.hidden }));
  box.querySelector('[data-in=reset]').onclick = () => commit(L.resetControl(state, edMode, c.key));
}

/* ==========================================================
   PANNEAU RÉGLAGES (section « Commandes tactiles » des Options)
   ========================================================== */
let panel, panelOn = false;
function buildSettings() {
  panel = document.createElement('div'); panel.id = 'tcSettings'; panel.hidden = true;
  panel.innerHTML = '<div class="tc-set-card" role="dialog" aria-modal="true"></div>';
  panel.addEventListener('click', (e) => { if (e.target === panel) closeSettings(); });
  document.body.appendChild(panel);
}
function paintSettings() {
  if (!panel || !panelOn) return;
  const card = $('.tc-set-card', panel);
  const seg = (name, items, val) => `<div class="tc-seg" data-s="${name}">${items.map(([k, lbl]) => `<button type="button" data-v="${k}" class="${val === k ? 'on' : ''}">${lbl}</button>`).join('')}</div>`;
  const rng = (name, min, max, step, val, fmt) => `<div class="tc-rng"><input type="range" data-s="${name}" min="${min}" max="${max}" step="${step}" value="${val}"><em>${fmt(val)}</em></div>`;
  const sw = (name, val) => `<button type="button" class="tc-sw${val ? ' on' : ''}" role="switch" aria-checked="${val}" data-s="${name}"><i></i></button>`;
  card.innerHTML = `
    <div class="tc-set-head"><h2>${u('tabs')}</h2><button type="button" class="tc-x" data-s="close" aria-label="${u('close')}">✕</button></div>
    <div class="tc-set-body">
      <div class="tc-row"><span>${u('show')}</span>${seg('show', [['auto', u('auto')], ['always', u('always')], ['never', u('never')]], state.show)}</div>
      <div class="tc-row full"><button type="button" class="tc-chip tc-primary tc-wide" data-s="edit">🎮 ${u('custom')}</button></div>
      <div class="tc-row col"><span>${u('presets')}</span><div class="tc-presets">${Object.keys(L.PRESETS).map((k) => `<button type="button" class="tc-chip" data-p="${k}">${L.PRESETS[k][lang()]}</button>`).join('')}</div></div>
      <div class="tc-row"><span>${u('size')}</span>${rng('globalSize', 70, 150, 5, Math.round(state.globalSize * 100), (v) => v + '%')}</div>
      <div class="tc-row"><span>${u('opacity')}</span>${rng('globalOpacity', 20, 100, 5, Math.round(state.globalOpacity * 100), (v) => v + '%')}</div>
      <div class="tc-row"><span>${u('lefty')}</span>${sw('lefty', state.lefty)}</div>
      <div class="tc-row"><span>${u('look')}</span>${rng('lookSens', 40, 220, 10, Math.round(state.lookSens * 100), (v) => v + '%')}</div>
      <div class="tc-row"><span>${u('haptics')}</span>${sw('haptics', state.haptics)}</div>
    </div>`;
}
function openSettings() {
  if (!panel) buildSettings();
  panelOn = true; panel.hidden = false; paintSettings();
  if (!panel._bound) {
    panel._bound = true;
    panel.addEventListener('click', (e) => {
      const sv = e.target.closest('.tc-seg button[data-v]');
      if (sv) return commit({ ...state, show: sv.dataset.v });
      const t = e.target.closest('[data-s],[data-p]'); if (!t) return;
      if (t.dataset.p) return commit(L.applyPreset(state, t.dataset.p));
      const s = t.dataset.s;
      if (s === 'close') closeSettings();
      else if (s === 'edit') openEditor();
      else if (s === 'lefty') commit({ ...state, lefty: !state.lefty });
      else if (s === 'haptics') { commit({ ...state, haptics: !state.haptics }); if (state.haptics) haptic(30); }
    });
    panel.addEventListener('input', (e) => {
      const s = e.target.dataset && e.target.dataset.s; if (!s || e.target.type !== 'range') return;
      const v = Number(e.target.value) / 100;
      e.target.nextElementSibling.textContent = e.target.value + '%';
      const next = L.migrate({ ...state, [s]: v });
      state = next; save(); render();
    });
  }
}
function closeSettings() { if (panel) { panel.hidden = true; panelOn = false; } }

/* ---------- Toast ---------- */
function toast(msg) { if (window.GamepadKit && window.GamepadKit.toast) window.GamepadKit.toast(msg); }

/* ==========================================================
   Accès depuis les écrans du jeu : Options › Commandes, Pause
   ========================================================== */
let guBtn = null;
function syncGuButton() {
  const host = document.getElementById('guRoot');
  const scr = host && !host.hidden ? host.dataset.screen : '';
  const want = scr === 'pause';
  if (!guBtn) {
    guBtn = document.createElement('button'); guBtn.type = 'button'; guBtn.id = 'tcGuBtn';
    guBtn.addEventListener('click', () => openSettings());
    document.body.appendChild(guBtn);
  }
  guBtn.hidden = !want || !!(panelOn || editorOn);
  guBtn.dataset.screen = scr;
  guBtn.innerHTML = `${svg('interact')}<span>${u('openBtn')}</span>`;
}

/* ---------- Démarrage ---------- */
function start() {
  build();
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('blur', releaseAll);
  window.addEventListener('resize', () => { if (renderedMode) render(); if (panelOn) paintSettings(); });
  window.addEventListener('orientationchange', () => setTimeout(tick, 200));
  setInterval(tick, 120);
  setInterval(syncGuButton, 300);
  tick();
}
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

window.TouchControls = {
  visible: () => !!shownMode,
  mode: () => shownMode,
  enabled,
  openSettings, closeSettings, openEditor, closeEditor,
  state: () => JSON.parse(L.serialize(state)),
  set: (patch) => commit({ ...state, ...patch }),
  refresh: () => { tick(); render(); },
  isDevice: isDeviceTouch,
  why: () => ({ on: enabled(), mode: currentMode(), blocked: blockReason(), shown: shownMode, rendered: renderedMode, portrait: portrait(), editor: editorOn }),
  layout: L,
};
void params;
