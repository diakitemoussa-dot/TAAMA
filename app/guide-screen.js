/* ==========================================================
   GUIDE « COMMENT JOUER » — l'écran (une page par sujet, animation, phrase courte)
   Chargé à l'ouverture seulement (import dynamique depuis guide-ui.js).
   ========================================================== */

import { PAGES, UI } from './guide-content.js?v=35';
import * as A from './guide-art.js?v=35';
import { t, getLang, onLangChange } from './i18n.js?v=1';
import { core as K } from './guide-ui.js?v=35';

if (!document.getElementById('gdCss2')) {
  const l = document.createElement('link');
  l.id = 'gdCss2'; l.rel = 'stylesheet'; l.href = 'styles/guide-screen.css?v=35';
  document.head.appendChild(l);
  await new Promise((r) => { l.onload = r; l.onerror = r; setTimeout(r, 3500); });
}
const { $, esc, emit, look, saveS, flags, hideHint, closeHelp, reset, padOn, still, isTouchUi, paintHelpBtn, coachRoot } = K;
let root = null, isOpen = false, idx = 0, pop = null, speakOn = false, padRun = false, padNav = false, viewMode = null;
import * as LG from './guide-logic.js?v=35';

/* ==========================================================
   ÉCRAN « COMMENT JOUER »
   ========================================================== */
const hasTTS = () => typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';

const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="gdSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#55415d"/><stop offset=".62" stop-color="#b8664a"/><stop offset="1" stop-color="#e8a04d"/></linearGradient></defs></svg>';

function build() {
  root = document.createElement('div');
  root.className = 'gd'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.hidden = true;
  root.innerHTML = DEFS +
    '<div class="gd-card">' +
    '<header class="gd-top"><button type="button" class="gd-btn gd-x" data-a="close"></button><h2 class="gd-h"></h2>' +
    '<div class="gd-modes" role="group"></div><div class="gd-tools"><button type="button" class="gd-btn" data-a="topics"></button><button type="button" class="gd-btn" data-a="settings"></button></div></header>' +
    '<main class="gd-body"><div class="gd-stage"><div class="gd-sc"></div><div class="gd-dv"></div></div>' +
    '<div class="gd-txt"><div class="gd-n"></div><h3 class="gd-t"></h3><p class="gd-l" aria-live="polite"></p></div></main>' +
    '<footer class="gd-nav"><button type="button" class="gd-btn gd-big-b" data-a="prev"></button><button type="button" class="gd-btn" data-a="listen"></button><div class="gd-dots"></div><button type="button" class="gd-btn gd-big-b pri" data-a="next"></button></footer>' +
    '<div class="gd-pop gd-topics" hidden></div><div class="gd-pop gd-sets" hidden></div></div>' +
    '<div class="gd-rot"><span>⟳</span><p></p></div>';
  document.body.appendChild(root);
  for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'contextmenu', 'wheel']) root.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
  root.addEventListener('click', onClick);
  onLangChange(() => { if (root) { staticText(); if (isOpen) render(); } });
  window.addEventListener('resize', fitRot);
  window.addEventListener('settings:changed', () => { if (root) look(root); look(coachRoot()); });
}

function staticText() {
  const set = (sel, html) => { const e = $(sel, root); if (e) e.innerHTML = html; };
  root.setAttribute('aria-label', t(UI.how));
  set('.gd-x', `${A.icon('x')}<span>${esc(t(UI.close))}</span>`);
  set('.gd-h', `<span class="gd-hi">${A.icon('help')}</span><span class="gd-ht">${esc(t(UI.how))}</span>`);
  set('.gd-modes', ['kbd', 'pad', 'touch'].map((m) => `<button type="button" class="gd-btn gd-mode" data-m="${m}" aria-label="${esc(t(UI[m + 'Long']))}"><i>${modeIcon(m)}</i><span>${esc(t(UI[m]))}</span></button>`).join(''));
  set('[data-a="topics"]', `${A.icon('list')}<span>${esc(t(UI.topics))}</span>`);
  set('[data-a="settings"]', `${A.icon('gear')}<span>${esc(t(UI.settings))}</span>`);
  set('[data-a="listen"]', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg><span>${esc(t(UI.listen))}</span>`);
  $('[data-a="listen"]', root).hidden = !hasTTS();
  $('.gd-rot p', root).textContent = t(UI.portrait);
}
const modeIcon = (m) => (m === 'kbd'
  ? '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="1" y="3" width="30" height="14" rx="3"/><path d="M6 8h2M11 8h2M16 8h2M21 8h2M7 12.5h18"/><rect x="11" y="19" width="10" height="4" rx="2"/></svg>'
  : m === 'pad'
    ? '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5h14c4 0 6 3 7 8l1 5c.5 3-2 4-4 2l-3-3H8l-3 3c-2 2-4.500 1-4-2l1-5c1-5 3-8 7-8z"/><path d="M9 10v4M7 12h4M22 10.500h.1M24.500 13h.1"/></svg>'
    : '<svg viewBox="0 0 32 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="28" height="18" rx="4"/><circle cx="9" cy="13" r="3"/><circle cx="23" cy="9" r="2"/><circle cx="23" cy="16" r="2"/></svg>');

function fitRot() {
  if (!root) return;
  const w = window.innerWidth, h = window.innerHeight;
  root.classList.toggle('gd-portrait', isTouchUi() && h > w * 1.05 && Math.min(w, h) < 600);
}

/** Le film (GIF) est sauté en économie de données, réseau lent ou « animations réduites » : on garde alors le dessin léger. */
function filmOk() {
  const c = navigator.connection || {};
  return !still() && !c.saveData && !/(^|-)2g$/.test(c.effectiveType || '');
}

function render() {
  if (!root) return;
  const p = PAGES[idx], m = viewMode || K.mode;
  look(root); fitRot();
  const card = $('.gd-card', root);
  $('.gd-sc', root).innerHTML = idx === 0 && filmOk() ? '<img class="gd-film" src="assets/images/guide-comment-jouer.gif?v=1" alt="" decoding="async">' : A.scene(p.scene || p.id);   // page 1 : le film Motion « Comment jouer » (GIF léger) ; sinon le petit dessin animé
  $('.gd-dv', root).innerHTML = A.device(p, m);
  $('.gd-t', root).innerHTML = `<span class="gd-ti">${A.icon(p.ico)}</span>${esc(t(p.title))}`;
  $('.gd-l', root).textContent = t(p.line[m]);
  $('.gd-n', root).textContent = `${idx + 1} / ${PAGES.length}`;
  $('.gd-dots', root).innerHTML = PAGES.map((_, i) => `<i${i === idx ? ' class="on"' : ''}></i>`).join('');
  const prev = $('[data-a="prev"]', root), next = $('[data-a="next"]', root), lastPage = idx === PAGES.length - 1;
  prev.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg><span>${esc(t(UI.prev))}</span>`;
  next.innerHTML = `<span>${esc(t(lastPage ? UI.done : UI.next))}</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${lastPage ? 'M5 12l5 5 9-10' : 'M9 5l7 7-7 7'}"/></svg>`;
  prev.disabled = idx === 0;
  $('.gd-modes', root).querySelectorAll('[data-m]').forEach((b) => { const on = b.dataset.m === m; b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); });
  card.classList.remove('gd-in'); void card.offsetWidth; card.classList.add('gd-in');
  if (K.S.prefs.speak) speak(); else stopSpeak();
}

function go(d, quiet) {
  const n = idx + d;
  if (n < 0) return;
  if (n >= PAGES.length) { close(); return; }
  idx = n; render(); padNav = false;
  if (!pop && !quiet) $(`[data-a="${d > 0 ? 'next' : 'prev'}"]`, root).focus({ preventScroll: true });
}

function speak() {
  if (!hasTTS()) return;
  stopSpeak();
  const p = PAGES[idx], m = viewMode || K.mode;
  const u = new window.SpeechSynthesisUtterance(`${t(p.title)}. ${t(p.line[m])}`);
  u.lang = getLang() === 'en' ? 'en-US' : 'fr-FR'; u.rate = 0.92;
  try { const v = window.speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2))); if (v) u.voice = v; } catch (_) {}
  speakOn = true; window.speechSynthesis.speak(u);
}
function stopSpeak() { if (speakOn && hasTTS()) { try { window.speechSynthesis.cancel(); } catch (_) {} } speakOn = false; }

/* ---------- fenêtres : sujets, réglages ---------- */
function openPop(name) {
  closePop();
  const el = $(`.gd-${name}`, root);
  if (name === 'topics') {
    el.innerHTML = `<h3>${esc(t(UI.topics))}</h3><div class="gd-grid">${PAGES.map((p, i) => `<button type="button" class="gd-btn gd-tp${i === idx ? ' on' : ''}" data-go="${i}">${A.icon(p.ico)}<span>${esc(t(p.title))}</span></button>`).join('')}</div><button type="button" class="gd-btn gd-big-b" data-a="closepop">${esc(t(UI.close))}</button>`;
  } else {
    const row = (k, label, on) => `<button type="button" class="gd-btn gd-sw${on ? ' on' : ''}" role="switch" aria-checked="${on}" data-set="${k}"><span>${esc(t(label))}</span><i></i></button>`;
    el.innerHTML = `<h3>${esc(t(UI.settings))}</h3>${row('large', UI.large, K.S.prefs.large)}${row('motion', UI.motion, !still())}${hasTTS() ? row('speak', UI.speak, K.S.prefs.speak) : ''}${row('tips', UI.tips, !K.S.prefs.off)}` +
      `<button type="button" class="gd-btn" data-a="replay">${esc(t(UI.replay))}</button><button type="button" class="gd-btn gd-big-b" data-a="closepop">${esc(t(UI.close))}</button>`;
  }
  el.hidden = false; pop = name;
  const f = $('button', el); if (f) f.focus({ preventScroll: true });
}
function closePop() {
  if (!pop) return;
  $(`.gd-${pop}`, root).hidden = true; pop = null;
  $('[data-a="next"]', root).focus({ preventScroll: true });
}

function onClick(e) {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  const m = b.dataset.m;
  if (m) { viewMode = m; render(); return; }
  if (b.dataset.go != null) { idx = +b.dataset.go; closePop(); render(); return; }
  if (b.dataset.set) { toggleSet(b.dataset.set); const on = b.dataset.set === 'motion' ? !still() : b.dataset.set === 'tips' ? !K.S.prefs.off : K.S.prefs[b.dataset.set]; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); return; }
  switch (b.dataset.a) {
    case 'close': close(); break;
    case 'prev': go(-1); break;
    case 'next': go(1); break;
    case 'listen': speak(); break;
    case 'topics': case 'settings': openPop(b.dataset.a); break;
    case 'closepop': closePop(); break;
    case 'replay': reset(); closePop(); break;
    default: break;
  }
}
function toggleSet(k) {
  if (k === 'motion') K.S.prefs.reduce = !still();
  else if (k === 'tips') { K.S.prefs.off = !K.S.prefs.off; if (K.S.prefs.off) hideHint(); }
  else if (k === 'speak') { K.S.prefs.speak = !K.S.prefs.speak; if (K.S.prefs.speak) speak(); else stopSpeak(); }
  else if (k === 'large') K.S.prefs.large = !K.S.prefs.large;
  saveS(); look(root); look(coachRoot());
}

/* ---------- ouverture / fermeture ---------- */
function open(topic) {
  if (!root) { build(); staticText(); }
  if (isOpen) { if (topic) { const i = PAGES.findIndex((p) => p.id === topic); if (i >= 0) { idx = i; render(); } } return true; }
  const f = flags();
  const want = topic === 'auto' ? LG.suggestTopic(f) : topic;
  const i = PAGES.findIndex((p) => p.id === want);
  idx = i >= 0 ? i : 0; viewMode = null; pop = null; padNav = false;
  $('.gd-topics', root).hidden = true; $('.gd-sets', root).hidden = true;
  hideHint(); closeHelp();
  isOpen = true; K.setOpen(true); root.hidden = false;
  try { window.GamepadKit && window.GamepadKit.capture && window.GamepadKit.capture(true); } catch (_) {}   // la manette ne commande plus le jeu : le guide la lit en direct
  render();
  requestAnimationFrame(() => { root.classList.add('on'); const nx = $('[data-a="next"]', root); if (nx) nx.focus({ preventScroll: true }); });
  emit('guide:open', { topic: PAGES[idx].id });
  padLoop();
  return true;
}
const start = () => open(PAGES[0].id);
function close() {
  if (!isOpen) return;
  isOpen = false; K.setOpen(false); root.classList.remove('on'); root.hidden = true; pop = null; stopSpeak();
  try { window.GamepadKit && window.GamepadKit.capture && window.GamepadKit.capture(false); } catch (_) {}
  emit('guide:close', {});
  paintHelpBtn();
}

/* ---------- clavier (appelé par guide.js avant le jeu) ---------- */
const vis = (e) => e.offsetParent !== null || e.getClientRects().length;
const focusables = () => [...(pop ? $(`.gd-${pop}`, root) : root).querySelectorAll('button:not([disabled])')].filter(vis);
function moveFocus(d) {
  const f = focusables(); if (!f.length) return;
  const i = f.indexOf(document.activeElement);
  f[(i + d + f.length) % f.length].focus({ preventScroll: true });
}
function onKey(e) {
  if (e.ctrlKey || e.metaKey || /^F\d+$/.test(e.key)) return;
  e.stopImmediatePropagation();                                   // le jeu, Tapama et les menus ne voient pas ces touches
  const k = e.key;
  if (k === 'Escape') { e.preventDefault(); if (pop) closePop(); else close(); }
  else if (k === 'Tab') { e.preventDefault(); moveFocus(e.shiftKey ? -1 : 1); }
  else if (k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); if (pop) moveFocus(1); else if (k === 'ArrowRight') go(1); else moveFocus(1); }
  else if (k === 'ArrowLeft' || k === 'ArrowUp') { e.preventDefault(); if (pop) moveFocus(-1); else if (k === 'ArrowLeft') go(-1); else moveFocus(-1); }
  else if ((k === 'Enter' || k === ' ') && !(document.activeElement && root.contains(document.activeElement) && document.activeElement.tagName === 'BUTTON')) { e.preventDefault(); if (!pop) go(1); }
}

/* ---------- manette : lecture directe (le jeu est « capturé » tant que l'écran est ouvert) ---------- */
function padLoop() {
  if (padRun) return;
  padRun = true;
  const tick = () => {
    if (!isOpen) { padRun = false; return; }
    requestAnimationFrame(tick);
    const R = window.GamepadKit && window.GamepadKit.raw;
    if (!R || !padOn()) return;
    const jp = (n) => R.justPressed(n);
    if (jp('B') || jp('START')) { if (pop) closePop(); else close(); }
    else if (jp('A')) { const a = document.activeElement; if ((pop || padNav) && a && root.contains(a) && a.tagName === 'BUTTON') a.click(); else go(1, true); }   // A = suivant, sauf si on a choisi un bouton avec la croix
    else if (jp('LB')) go(-1, true);
    else if (jp('RB')) go(1, true);
    else if (jp('RIGHT') || jp('DOWN')) { if (pop || jp('DOWN')) { padNav = true; moveFocus(1); } else go(1, true); }
    else if (jp('LEFT') || jp('UP')) { if (pop || jp('UP')) { padNav = true; moveFocus(-1); } else go(-1, true); }
    else if (jp('X')) speak();
    else if (jp('Y')) { if (pop) closePop(); else openPop('topics'); }
  };
  requestAnimationFrame(tick);
}

export default { open, start, close, isOpen: () => isOpen, onKey, idx: () => idx, view: () => viewMode, refresh: () => { if (isOpen && !viewMode) render(); } };
