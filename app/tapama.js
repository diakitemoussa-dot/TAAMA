/* ==========================================================
   TAPAMA — interface 2D (portrait + bulles de texte)
   ----------------------------------------------------------
   Tapama n'est jamais en 3D : portrait illustré et bulles.

   API (window.Tapama) :
     play('appel' | séquence, { onEnd })  dialogue plein écran avant/entre les scènes
     radio('texte' | RADIO.x, { mood })   bulle courte pendant la partie (le jeu continue)
     analyse('projection')                analyse d'un indice + « Ajouter au journal »
     help('dispositif1')                  aide facultative en 3 niveaux
     journal()                            indices ajoutés au journal
     isBusy()                             un écran Tapama bloque-t-il le jeu ?

   Touches : Entrée / Espace / X = suivant · Échap = passer ·
             H = aide (ou historique dans un dialogue) · T = relire le dernier appel
   Manette : A = suivant · B = passer · Y = historique
             (aide : X / Y / A = niveau 1 / 2 / 3, B = fermer)
   Événements : 'tapama:dialogue-end' {id, skipped} · 'tapama:journal' {id}
   ========================================================== */

import {
  SEQUENCES, RADIO, HELP_LEVELS, PUZZLES, ANALYSES,
  PLAYER_NAME, TAPAMA_NAME,
  createSequence, createRadioQueue, helpFor, portraitUrl, safeMood, analysisSummary,
} from './tapama-core.js?v=2';
import { fillName } from './player-profile.js?v=1';
import { t, translateTree } from './i18n.js?v=1';
import './tapama-voice.js?v=5';
import { attachTapamaFace } from './tapama-face.js?v=5';   // bouche animée au rythme de la voix + clignements des yeux                       // voix féminine de Tapama (synthèse vocale du navigateur, provisoire)

const INPUT_LOCK_MS = 280;   // ignore l'appui qui vient d'ouvrir l'écran

/* ---------------- Petits utilitaires DOM ---------------- */

function h(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = t(text);
  return n;
}

function icon(path, size = 18) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('width', size); s.setAttribute('height', size);
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2');
  s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = path;
  return s;
}
const ICON_BOOK = '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><line x1="9" y1="9" x2="15" y2="9"/>';
const ICON_BOOK_PLUS = '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/>';
const ICON_SKIP = '<polygon points="4,5 13,12 4,19"/><polygon points="12,5 21,12 12,19"/>';
const ICON_NEXT = '<polygon points="7,4 20,12 7,20"/>';

function btn(label, cls, key) {
  const b = h('button', 'tp-btn ' + cls);
  b.type = 'button';
  b.append(h('span', 'tp-lbl', label));
  if (key) b.append(h('kbd', 'tp-k', key));
  return b;
}

function portrait(mood, cls, alt) {
  const i = h('img', cls);
  i.src = portraitUrl(mood);
  i.alt = alt || `${t('Tapama')}, ${t(safeMood(mood))}`;
  i.draggable = false;
  return i;
}

// lecture DIRECTE de la manette (`raw`) : le monde 3D est « capturé » (labo, carte…) pendant les dialogues, mais A / B / Y doivent continuer à faire avancer les bulles
const _padFacade = { connected: () => !!(window.GamepadKit && window.GamepadKit.connected()), justPressed: (n) => { const k = window.GamepadKit; return !!(k && (k.raw || k).justPressed(n)); } };
function pad() { return window.GamepadKit ? _padFacade : null; }

/* Options › Cinématiques passables : si désactivé, le dialogue doit être lu en entier */
const canSkip = () => !(window.GameSettings && window.GameSettings.skippableCutscenes === false);

/* Prénom du joueur (saisi à sa première partie) et texte personnalisé */
function playerName() {
  const p = window.GameUI && window.GameUI.player && window.GameUI.player();
  return p ? p.name : '';
}
const nm = (t) => fillName(t, playerName());

/* ---------------- État ---------------- */

let root = null;
let dialogue = null;     // { seq, onEnd, el, ... }
let helpPane = null;
let analysisPane = null;
let lockUntil = 0;
const journalEntries = [];
let lastRadio = null;

const radioQueue = createRadioQueue();
let radioEl = null;
let radioShown = false;

function ensureRoot() {
  if (root) return root;
  root = h('div');
  root.id = 'tpRoot';
  document.body.appendChild(root);
  return root;
}

function isBusy() { return !!(dialogue || helpPane || analysisPane); }

function lock() { lockUntil = performance.now() + INPUT_LOCK_MS; }
function locked() { return performance.now() < lockUntil; }

/* ==========================================================
   DIALOGUE (avant la partie)
   ========================================================== */

function play(seqOrId, opts = {}) {
  const data = typeof seqOrId === 'string' ? SEQUENCES[seqOrId] : seqOrId;
  if (!data || !data.lines || !data.lines.length) return false;
  if (dialogue) closeDialogue(true);
  closeHelp(); closeAnalysis();

  const el = h('section', 'tp-dialogue');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('Dialogue : {x}', { x: t(data.title) }));

  const head = h('div', 'tp-d-head');
  const kick = h('span', 'tp-kicker', data.chapter || '');
  head.append(kick, h('span', 'tp-d-title', data.title || ''));
  const skip = btn('Passer le dialogue', 'tp-glass tp-d-skip', 'Échap');
  skip.prepend(icon(ICON_SKIP));
  skip.addEventListener('click', () => skipDialogue());
  if (!canSkip()) skip.style.display = 'none';

  const face = portrait('neutre', 'tp-d-portrait');
  const shadow = h('div', 'tp-d-shadow');
  const glow = h('div', 'tp-d-glow');                       // lueur de lumière derrière Tapama (respire doucement, s'intensifie quand elle parle)

  const stack = h('div', 'tp-d-stack');
  const tab = h('div', 'tp-d-tab');
  const tabName = h('span', 'tp-d-name');
  const tabRole = h('span', 'tp-d-role');
  tab.append(tabName, tabRole);
  const bubble = h('div', 'tp-d-bubble');
  const text = h('p', 'tp-d-text');
  const foot = h('div', 'tp-d-foot');
  const dots = h('div', 'tp-dots');
  const hist = btn('Historique', 'tp-glass tp-d-hist', 'H');
  hist.prepend(icon(ICON_BOOK));
  hist.addEventListener('click', () => toggleHistory());
  const next = btn('Suivant', 'tp-gold tp-d-next', 'Entrée');
  next.insertBefore(icon(ICON_NEXT), next.querySelector('.tp-k'));
  next.addEventListener('click', () => nextLine());
  foot.append(dots, hist, next);
  bubble.append(text, foot);
  const upcoming = h('div', 'tp-d-upcoming');
  stack.append(tab, bubble, upcoming);

  const hints = h('div', 'tp-d-hints');
  hints.innerHTML = '<span><kbd class="tp-k">Entrée</kbd>Suivant</span>' +
    '<span><kbd class="tp-k">✕</kbd>Manette</span>' +
    '<span><kbd class="tp-k">Touche</kbd>Écran tactile</span>' +
    '<span><kbd class="tp-k">Échap</kbd>Passer</span>';

  el.append(head, skip, shadow, glow, face, stack, hints);
  ensureRoot().appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));

  dialogue = {
    seq: createSequence(data), data, onEnd: opts.onEnd, el, face, tab, tabName, tabRole,
    text, dots, upcoming, next, histEl: null,
  };
  bubble.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    nextLine();
  });
  dialogue.faceFx = attachTapamaFace(face);
  lock();
  renderLine();
  startPadLoop();
  return true;
}

function renderLine() {
  const d = dialogue;
  if (!d) return;
  const line = d.seq.current();
  if (!line) return;
  const isT = line.who === 'tapama';
  d.el.classList.toggle('is-player', !isT);
  d.tabName.textContent = isT ? TAPAMA_NAME : (playerName() || t(PLAYER_NAME));
  d.tabRole.textContent = isT ? t('Chercheuse · par téléphone') : t('Toi · réponse');
  d.text.textContent = `« ${nm(t(line.text))} »`;
  if (isT) { window.TapamaVoice?.line(line.text, line.mood, nm(t(line.text))); d.faceFx && d.faceFx.blink(); } else window.TapamaVoice?.stop();      // Tapama parle ; la réplique du joueur reste silencieuse

  if (isT) {
    d.face.src = portraitUrl(line.mood);
    d.face.alt = `${t('Tapama')}, ${t(safeMood(line.mood))}`;
  }

  d.dots.replaceChildren();
  for (let i = 0; i < d.seq.total; i++) {
    d.dots.appendChild(h('span', 'tp-dot' + (i === d.seq.index ? ' is-on' : '')));
  }
  d.dots.appendChild(h('span', 'tp-dots-n', t('{n} sur {total}', { n: d.seq.index + 1, total: d.seq.total })));

  const up = d.seq.upcoming();
  d.upcoming.replaceChildren();
  if (up && up.who === 'player') {
    d.upcoming.append(h('span', 'tp-kicker', 'Ensuite · toi'), h('span', null, `« ${nm(t(up.text))} »`));
    d.upcoming.hidden = false;
  } else {
    d.upcoming.hidden = true;
  }
  const last = d.seq.index >= d.seq.total - 1;
  d.next.querySelector('.tp-lbl').textContent = t(last ? 'Terminer' : 'Suivant');
}

function nextLine() {
  if (!dialogue || locked()) return;
  if (dialogue.histEl) { toggleHistory(); return; }
  if (dialogue.seq.next()) renderLine();
  else closeDialogue(false);
}

function skipDialogue() {
  if (!dialogue || !canSkip()) return;
  dialogue.seq.skip();
  closeDialogue(true);
}

function closeDialogue(skipped) {
  const d = dialogue;
  if (!d) return;
  dialogue = null;
  window.TapamaVoice?.stop(); try { d.faceFx && d.faceFx.detach(); } catch (_) {}
  d.el.classList.remove('on');
  setTimeout(() => d.el.remove(), 360);
  lock();
  window.dispatchEvent(new CustomEvent('tapama:dialogue-end', { detail: { id: d.data.id, skipped: !!skipped } }));
  try { d.onEnd && d.onEnd({ skipped: !!skipped }); } catch (e) { console.error(e); }
}

function toggleHistory() {
  const d = dialogue;
  if (!d) return;
  if (d.histEl) { d.histEl.remove(); d.histEl = null; return; }
  const box = h('div', 'tp-history');
  box.setAttribute('role', 'log');
  box.append(h('div', 'tp-kicker', 'Historique'));
  for (const l of d.seq.history()) {
    const row = h('div', 'tp-h-row' + (l.who === 'player' ? ' is-player' : ''));
    row.append(h('b', null, l.who === 'tapama' ? TAPAMA_NAME : (playerName() || t(PLAYER_NAME))), h('span', null, `« ${nm(t(l.text))} »`));
    box.appendChild(row);
  }
  box.append(h('div', 'tp-h-close', 'Entrée ou H pour refermer'));
  d.el.appendChild(box);
  d.histEl = box;
}

/* ==========================================================
   APPEL RADIO (pendant la partie, sans bloquer le jeu)
   ========================================================== */

function buildRadio() {
  if (radioEl) return radioEl;
  const el = h('section', 'tp-radio');
  el.setAttribute('aria-label', 'Appel de Tapama');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML =
    '<div class="tp-r-card">' +
      '<div class="tp-r-av"><img alt="" draggable="false"></div>' +
      '<div class="tp-r-body">' +
        '<div class="tp-r-top"><span class="tp-r-name">Tapama</span><span class="tp-chip">par radio</span>' +
          '<svg class="tp-r-sig" width="26" height="20" viewBox="0 0 26 20" role="img" aria-label="Signal fort">' +
          '<rect x="1" y="12" width="4" height="7" rx="2"/><rect x="8" y="8" width="4" height="11" rx="2"/>' +
          '<rect x="15" y="4" width="4" height="15" rx="2"/><rect class="off" x="22" y="0" width="3" height="19" rx="1.5"/></svg></div>' +
        '<div class="tp-r-text"></div>' +
        '<div class="tp-r-bar"><span></span></div>' +
      '</div>' +
    '</div>' +
    '<div class="tp-r-hint"><kbd class="tp-k">T</kbd>Relire<span>Le jeu continue pendant l’appel.</span></div>';
  ensureRoot().appendChild(el);
  radioEl = el;
  return el;
}

/* Notification sonore : deux notes de clochette dès que Tapama envoie un appel radio (synthétisée, aucun fichier ; volume « effets » du jeu).
   Pas de son quand le joueur relit l'appel (touche T) ni pour un appel déjà annoncé. */
let _chimeCtx = null, _chimedFor = null;
function chime() {
  try {
    if (!_chimeCtx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      _chimeCtx = new AC(); window.GameAudio?.ctx?.(_chimeCtx, 'effects');
    }
    const ac = _chimeCtx; if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime + 0.02;
    [[1318.5, 0], [1760, 0.14]].forEach(([f, dt]) => {
      const o = ac.createOscillator(), g = ac.createGain(), o2 = ac.createOscillator();
      o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;          // fondamentale + harmonique : timbre de cloche
      const g2 = ac.createGain(); g2.gain.value = 0.25;
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.3, t0 + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.55);
      o.connect(g); o2.connect(g2); g2.connect(g); g.connect(ac.destination);
      o.start(t0 + dt); o2.start(t0 + dt); o.stop(t0 + dt + 0.6); o2.stop(t0 + dt + 0.6);
    });
  } catch (_) { /* pas d'audio : tant pis */ }
}

let _spokenFor = null;
function paintRadio() {
  const cur = radioQueue.current();
  const el = buildRadio();
  if (!cur) {
    if (radioShown) { el.classList.remove('on'); radioShown = false; }
    _spokenFor = null; window.TapamaVoice?.stop();
    return;
  }
  if (cur !== _spokenFor) { _spokenFor = cur; window.TapamaVoice?.line(cur.text, cur.mood, nm(t(cur.text))); }
  if (cur !== _chimedFor) { _chimedFor = cur; if (!cur.quiet) chime(); }
  el.querySelector('img').src = portraitUrl(cur.mood);
  el.querySelector('.tp-r-text').textContent = `« ${nm(t(cur.text))} »`;
  el.querySelector('.tp-r-bar span').style.width = '0%';
  el.classList.add('on');
  radioShown = true;
  translateTree(el);                      // libellés fixes de la bulle (Relire, par radio…)
}

function radio(callOrText, opts = {}) {
  const call = typeof callOrText === 'string' ? { text: callOrText, ...opts } : { ...callOrText, ...opts };
  if (!call.text) return false;
  lastRadio = call;
  const ok = radioQueue.push(call);
  if (ok) paintRadio();
  return ok;
}

let _radioLast = performance.now();
function radioLoop(now) {
  requestAnimationFrame(radioLoop);
  const dt = Math.min(0.1, (now - _radioLast) / 1000);
  _radioLast = now;
  if (!radioQueue.current()) return;
  const ev = radioQueue.tick(dt);
  if (ev) paintRadio();
  else if (radioEl) radioEl.querySelector('.tp-r-bar span').style.width = (radioQueue.progress() * 100).toFixed(1) + '%';
}
requestAnimationFrame(radioLoop);

/* ==========================================================
   ANALYSE D'UN INDICE
   ========================================================== */

function addToJournal(a) {
  if (journalEntries.some(e => e.id === a.id)) return false;
  journalEntries.push({ id: a.id, title: a.title, quote: a.quote, hypotheses: a.hypotheses.map(x => ({ ...x })) });
  window.dispatchEvent(new CustomEvent('tapama:journal', { detail: { id: a.id } }));
  return true;
}

function analyse(idOrData) {
  const a = typeof idOrData === 'string' ? ANALYSES[idOrData] : idOrData;
  if (!a) return false;
  closeAnalysis(); closeHelp();
  if (dialogue) closeDialogue(true);

  const el = h('section', 'tp-panel tp-analysis');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('Analyse de Tapama : {x}', { x: t(a.title) }));

  const top = h('div', 'tp-a-top');
  const av = h('div', 'tp-a-av');
  av.appendChild(portrait(a.mood, 'tp-a-img'));
  const who = h('div');
  who.append(h('div', 'tp-kicker', 'Analyse de l’indice'), h('div', 'tp-a-name', `${t('Tapama')} · ${t(safeMood(a.mood))}`));
  top.append(av, who, h('span', 'tp-chip tp-a-chip', 'par radio'));

  const quote = h('div', 'tp-quote', `« ${nm(t(a.quote))} »`);
  const hy = h('div');
  hy.appendChild(h('div', 'tp-kicker tp-a-kick', 'Hypothèses de Tapama'));
  const list = h('div', 'tp-hyps');
  for (const x of a.hypotheses) {
    const row = h('div', 'tp-hyp ' + (x.state === 'ok' ? 'is-ok' : 'is-open'));
    row.append(h('span', 'tp-hyp-mark', x.state === 'ok' ? '✓' : '?'), document.createTextNode(t(x.text)));
    list.appendChild(row);
  }
  hy.appendChild(list);
  const sum = analysisSummary(a);
  const note = h('div', 'tp-a-note', `${t(sum.confirmed > 1 ? '{n} confirmées' : '{n} confirmée', { n: sum.confirmed })} · ${t(sum.open > 1 ? '{n} questions ouvertes' : '{n} question ouverte', { n: sum.open })}. ${t('Elle peut se corriger quand tu trouves de nouveaux indices.')}`);

  const add = btn('Ajouter au journal', 'tp-gold tp-a-add', 'Entrée');
  add.prepend(icon(ICON_BOOK_PLUS, 20));
  const close = btn('Continuer l’exploration', 'tp-glass tp-a-close', 'Échap');
  const actions = h('div', 'tp-a-actions');
  actions.append(note, add, close);
  el.append(top, quote, hy, actions);
  ensureRoot().appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));

  analysisPane = { el, data: a, add };
  add.addEventListener('click', () => confirmJournal());
  close.addEventListener('click', () => closeAnalysis());
  lock(); startPadLoop();
  return true;
}

function confirmJournal() {
  const p = analysisPane;
  if (!p || locked()) return;
  const added = addToJournal(p.data);
  toast(added ? 'Journal mis à jour · nouvel indice de Tapama' : 'Déjà dans ton journal');
  closeAnalysis();
}

function closeAnalysis() {
  const p = analysisPane;
  if (!p) return;
  analysisPane = null;
  p.el.classList.remove('on');
  setTimeout(() => p.el.remove(), 320);
  lock();
}

/* ==========================================================
   AIDE (facultative, 3 niveaux)
   ========================================================== */

function help(puzzleId = 'general') {
  const puzzle = PUZZLES[puzzleId] || PUZZLES.general;
  closeHelp(); closeAnalysis();
  if (dialogue) closeDialogue(true);

  const backdrop = h('div', 'tp-backdrop');
  const el = h('section', 'tp-panel tp-help');
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', t('Demander de l’aide à Tapama'));

  const side = h('div', 'tp-h-side');
  const circle = h('div', 'tp-h-circle');
  const face = portrait('attentive', 'tp-h-img');
  circle.appendChild(face);
  side.append(circle, h('div', 'tp-h-who', TAPAMA_NAME), h('span', 'tp-chip', 'par radio · attentive'),
    h('div', 'tp-h-promise', 'Son aide est facultative. Elle ne donne jamais la solution complète de l’énigme.'));

  const main = h('div', 'tp-h-main');
  const meta = h('div', 'tp-h-meta');
  meta.append(h('span', 'tp-kicker', 'Énigme en cours'), h('span', 'tp-chip', `${t(puzzle.chapter)} · ${t(puzzle.title)}`));
  const title = h('h2', 'tp-h-title', 'Besoin d’un coup de main ?');
  const quote = h('div', 'tp-quote', `« ${nm(t(puzzle.prompt))} »`);
  const pick = h('div', 'tp-kicker tp-h-pick', 'Choisis le niveau d’aide');
  const levels = h('div', 'tp-levels');
  const buttons = HELP_LEVELS.map((lv) => {
    const b = h('button', 'tp-lv');
    b.type = 'button';
    b.append(h('span', 'tp-lv-n', String(lv.level)));
    const t = h('span', 'tp-lv-t');
    t.append(h('b', null, lv.title), h('span', null, lv.desc));
    b.append(t, h('kbd', 'tp-k', String(lv.level)));
    b.addEventListener('click', () => choose(lv.level));
    levels.appendChild(b);
    return b;
  });
  const foot = h('div', 'tp-h-foot');
  foot.append(h('span', 'tp-h-tip', 'Ouvre ce menu à tout moment avec la touche H.'));
  const alone = btn('Je continue seul', 'tp-glass tp-h-alone', 'Échap');
  alone.addEventListener('click', () => closeHelp());
  foot.appendChild(alone);
  main.append(meta, title, quote, pick, levels, foot);
  el.append(side, main);

  ensureRoot().append(backdrop, el);
  backdrop.addEventListener('click', () => closeHelp());
  requestAnimationFrame(() => { backdrop.classList.add('on'); el.classList.add('on'); });

  helpPane = { el, backdrop, puzzleId: puzzle.id, face, quote, buttons, faceFx: attachTapamaFace(face) };
  window.TapamaVoice?.line(puzzle.prompt, 'attentive', nm(t(puzzle.prompt)));      // elle lit la question, puis la réponse du niveau choisi
  lock(); startPadLoop();
  return true;

  function choose(level) {
    if (locked()) return;
    const a = helpFor(puzzle.id, level);
    face.src = portraitUrl(a.mood);
    quote.textContent = `« ${nm(t(a.text))} »`;
    window.TapamaVoice?.line(a.text, a.mood, nm(t(a.text)));
    buttons.forEach((b, i) => b.classList.toggle('is-on', i + 1 === level));
  }
}

function chooseHelp(level) {
  const p = helpPane;
  if (p && p.buttons[level - 1]) p.buttons[level - 1].click();
}

function closeHelp() {
  const p = helpPane;
  if (!p) return;
  helpPane = null;
  window.TapamaVoice?.stop(); try { p.faceFx && p.faceFx.detach(); } catch (_) {}
  p.el.classList.remove('on'); p.backdrop.classList.remove('on');
  setTimeout(() => { p.el.remove(); p.backdrop.remove(); }, 320);
  lock();
}

/* ---------------- Toast ---------------- */

let toastEl = null, toastTimer = 0;
function toast(msg) {
  if (!toastEl) { toastEl = h('div', 'tp-toast'); ensureRoot().appendChild(toastEl); }
  toastEl.textContent = t(msg);
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 3200);
}

/* ==========================================================
   ENTRÉES : clavier + manette
   ========================================================== */

function typing(e) {
  const t = e.target;
  return t && t.nodeType === 1 && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
}

window.addEventListener('keydown', (e) => {
  if (typing(e)) return;
  const k = e.key;
  const busy = isBusy();

  if (!busy) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (window.GameUI && window.GameUI.isOpen && window.GameUI.isOpen()) return;   // un menu du jeu est ouvert : il garde le clavier
    // H / T ne sont utilisées par aucun mode de jeu : aide et relecture de l'appel radio
    if ((k === 'h' || k === 'H') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); help('general'); return; }
    if ((k === 't' || k === 'T') && !e.repeat && lastRadio) { e.preventDefault(); e.stopImmediatePropagation(); radio({ ...lastRadio, quiet: true }); }
    return;
  }

  // Un écran Tapama est ouvert : il garde le clavier (sauf raccourcis du navigateur).
  // stopImmediatePropagation : la même touche ne doit pas aussi agir sur les menus du jeu.
  if (e.ctrlKey || e.metaKey || /^F\d+$/.test(k)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;

  if (dialogue) {
    if (k === 'Enter' || k === ' ' || k === 'x' || k === 'X' || k === 'ArrowRight') { if (!(window.Guide && window.Guide.gate && window.Guide.gate())) nextLine(); }
    else if (k === 'Escape') (dialogue.histEl ? toggleHistory() : skipDialogue());
    else if (k === 'h' || k === 'H') toggleHistory();
  } else if (analysisPane) {
    if (k === 'Enter') confirmJournal();
    else if (k === 'Escape') closeAnalysis();
  } else if (helpPane) {
    if (k === '1' || k === '2' || k === '3') chooseHelp(Number(k));
    else if (k === 'Escape' || k === 'h' || k === 'H') closeHelp();
  }
}, true);

let padLoopOn = false;
function startPadLoop() {
  if (padLoopOn) return;
  padLoopOn = true;
  const loop = () => {
    if (!isBusy()) { padLoopOn = false; return; }
    requestAnimationFrame(loop);
    const p = pad();
    if (!p || !p.connected() || locked()) return;
    if (dialogue) {
      if (p.justPressed('A')) { if (!(window.Guide && window.Guide.gate && window.Guide.gate())) nextLine(); }
      else if (p.justPressed('B')) (dialogue.histEl ? toggleHistory() : skipDialogue());
      else if (p.justPressed('Y')) toggleHistory();
    } else if (analysisPane) {
      if (p.justPressed('A')) confirmJournal();
      else if (p.justPressed('B')) closeAnalysis();
    } else if (helpPane) {
      if (p.justPressed('X')) chooseHelp(1);
      else if (p.justPressed('Y')) chooseHelp(2);
      else if (p.justPressed('A')) chooseHelp(3);
      else if (p.justPressed('B')) closeHelp();
    }
  };
  requestAnimationFrame(loop);
}

window.Tapama = {
  play, radio, analyse, help, chime,
  journal: () => journalEntries.map(e => ({ ...e })),
  isBusy,
  RADIO,
};
