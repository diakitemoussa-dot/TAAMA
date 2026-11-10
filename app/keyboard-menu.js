/* ==========================================================
   NAVIGATION CLAVIER DES MENUS — flèches + X / Entrée
   ----------------------------------------------------------
   • Flèches (↑ ↓ ← →) : parcourir les éléments du menu ouvert
   • X ou Entrée        : valider l'élément sélectionné
   • Le menu actif est automatiquement le premier menu visible
     (analyse, ☰ du sanctuaire, menu principal, missions, drone).

   Ne s'active QUE lorsqu'un menu est affiché : le reste du
   temps, les touches continuent d'aller au jeu (déplacement,
   saut avec X…). En phase de capture, l'événement est stoppé
   pour que le jeu ne reçoive pas la touche en double.
   ========================================================== */

const MENUS = [
  { name: 'analyse-sanctuaire', sel: '.sn-scan-result.visible' },
  { name: 'lieux-sanctuaire',   sel: '#snPoiPanel' },
  { name: 'engins',             sel: '#gmModelsPane' },
  { name: 'menu-principal',     sel: '#gmMenu' },
  { name: 'missions-choix',     sel: '#msChoice' },
  { name: 'missions-brief',     sel: '#msBrief' },
  { name: 'missions-debrief',   sel: '#msDebrief' },
  { name: 'missions-carnet',    sel: '#msLog' },
  { name: 'drone-lieux',        sel: '#dgPoi' },
  { name: 'drone-galerie',      sel: '#dgGalleryPanel' },
];

const ITEM_SELECTOR = 'button, a[href], [role="button"]';

/* ---------- Style de la sélection (injecté, aucune CSS externe) ---------- */
const _kbdStyle = document.createElement('style');
_kbdStyle.textContent =
  '.kbd-focus{outline:2px solid #f9d58b !important;outline-offset:3px;' +
  'box-shadow:0 0 0 4px rgba(249,213,139,.18),0 0 18px rgba(249,213,139,.35) !important;}';
document.head.appendChild(_kbdStyle);

let _kbdRoot  = null;
let _kbdItems = [];
let _kbdIdx   = -1;

/* Visible « pour de vrai » : display/visibilité/opacité de tous les ancêtres + taille. */
function _kbdShown(el) {
  if (!el || el.hidden) return false;
  let n = el;
  while (n && n.nodeType === 1) {
    let cs;
    try { cs = getComputedStyle(n); } catch (_) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return false;
    n = n.parentElement;
  }
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2;
}

function _kbdFindMenu() {
  for (const m of MENUS) {
    let rootEl = null;
    try { rootEl = document.querySelector(m.sel); } catch (_) { continue; }
    if (!_kbdShown(rootEl)) continue;
    const items = Array.from(rootEl.querySelectorAll(ITEM_SELECTOR)).filter(_kbdShown);
    if (items.length) return { rootEl, items };
  }
  return null;
}

function _kbdClear() {
  for (const el of _kbdItems) el.classList.remove('kbd-focus');
  _kbdRoot = null; _kbdItems = []; _kbdIdx = -1;
}

function _kbdPaint() {
  _kbdItems.forEach((el, i) => el.classList.toggle('kbd-focus', i === _kbdIdx));
  const sel = _kbdItems[_kbdIdx];
  if (sel) { try { sel.scrollIntoView({ block: 'nearest' }); } catch (_) {} }
}

function _kbdSync() {
  const menu = _kbdFindMenu();
  if (!menu) { _kbdClear(); return null; }
  const changed = menu.rootEl !== _kbdRoot ||
    menu.items.length !== _kbdItems.length ||
    menu.items.some((el, i) => el !== _kbdItems[i]);
  if (changed) {
    _kbdClear();
    _kbdRoot  = menu.rootEl;
    _kbdItems = menu.items;
    _kbdIdx   = -1;
  }
  return menu;
}

function _kbdMove(step) {
  if (!_kbdItems.length) return;
  if (_kbdIdx < 0) _kbdIdx = step > 0 ? 0 : _kbdItems.length - 1;
  else _kbdIdx = (_kbdIdx + step + _kbdItems.length) % _kbdItems.length;
  _kbdPaint();
}

function _kbdActivate() {
  if (!_kbdItems.length) return;
  if (_kbdIdx < 0) { _kbdIdx = 0; _kbdPaint(); }
  const el = _kbdItems[_kbdIdx];
  if (el) el.click();
}

/* Capture : le jeu (écouteurs « bubble ») ne reçoit pas ces touches quand un menu est ouvert. */
window.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && t.nodeType === 1 && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable)) return;

  const menu = _kbdSync();
  if (!menu) return;

  const k = e.key;

  if (k === 'ArrowDown' || k === 'ArrowRight') {
    e.preventDefault(); e.stopPropagation();
    _kbdMove(1);
    return;
  }
  if (k === 'ArrowUp' || k === 'ArrowLeft') {
    e.preventDefault(); e.stopPropagation();
    _kbdMove(-1);
    return;
  }
  if (k === 'x' || k === 'X' || k === 'Enter') {
    e.preventDefault(); e.stopPropagation();
    if (!e.repeat) _kbdActivate();
  }
}, true);

/* ---------- API manette : navigation dans le menu visible ---------- */
window.KeyboardMenu = {
  hasMenu() { return !!_kbdSync(); },
  current() {
    const menu = _kbdSync();
    return menu ? (menu.rootEl.id || menu.rootEl.className || '') : '';
  },
  move(step) {
    if (!_kbdSync()) return false;
    _kbdMove(step > 0 ? 1 : -1);
    return true;
  },
  activate() {
    if (!_kbdSync()) return false;
    _kbdActivate();
    return true;
  },
};
