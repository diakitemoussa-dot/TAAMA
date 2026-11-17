/* ==========================================================
   MODE TEST — enregistrement automatique des actions du joueur
   ----------------------------------------------------------
   Actif seulement avec ?test=1 (voir app/playtest-boot.js).
   Sans le mode test, ce module ne fait RIEN.

   Ce qui est enregistré pour chaque joueur :
     • le prénom et l'âge saisis sur l'écran « Profil » du jeu
     • l'appareil (ordinateur / tablette / téléphone), le système, l'écran
     • les écrans visités, les boutons utilisés, les séquences et étapes du chapitre
     • les dialogues de Tapama (lus ou passés), les demandes d'aide, les astuces
     • les mauvaises réponses et indices du laboratoire
     • les clics / touches (position, sans contenu tapé), l'inactivité, les erreurs, les FPS
   Rien de ce que le joueur tape au clavier n'est enregistré (seulement le nombre de touches).

   Où vont les données :
     1. sur l'appareil (localStorage, toutes les 3 s) : rien n'est perdu si la page se recharge
     2. au serveur du PC (POST api/playtest → dossier playtests/), toutes les minutes et à la fin
     3. si le serveur n'est pas joignable : fichier .json téléchargé à la fin de la session

   Panneau de l'animateur : APPUI LONG (1 s) sur la pastille « TEST » en haut à gauche.
     → « Joueur suivant » termine la session, l'envoie, remet le jeu à zéro.
   ========================================================== */

import * as T from './playtest-core.js?v=3';

const ON = !!window.__TAAMA_TEST;
const SEND_EVERY_MS = 60000;
const SAVE_EVERY_MS = 3000;
const FPS_EVERY_MS = 10000;
const ENDPOINT = (window.TAAMA_PLAYTEST_ENDPOINT || 'api/playtest');
const ARCHIVE_MAX = 12;

/* Événements que le jeu émet déjà (window) : étapes, laboratoire, dispositifs… */
const GAME_EVENTS = [
  'taama:ouverture-fin', 'taama:carte-labo', 'taama:reset', 'taama:chapitre1-fin',
  'dispositif1:spotted', 'dispositif1:active', 'dispositif1:taken',
  'lab:open', 'lab:enigme-resolue', 'lab:enigme-erreur', 'lab:indice', 'lab:done',
  'dossier:open', 'dossier:done', 'neantis:dispositif',
  'explore:start', 'explore:stop', 'sanctuary:exit', 'player:swim',
  'mosque:loaded', 'tapama:journal', 'settings:changed',
];

const store = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch (_) { return null; } })();
const readJSON = (k) => { try { const r = store && store.getItem(k); return r ? JSON.parse(r) : null; } catch (_) { return null; } };
const writeJSON = (k, v) => { try { store.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

let session = null;
let t0 = 0;
let dirty = false;
let lastSentCount = -1;
let sending = false;
let storageFull = false;
let lastInput = 0;
let idleFrom = null;
let place = 'démarrage';
let ui = null;

const now = () => Date.now() - t0;
const iso = () => new Date().toISOString();

function log(k, d) {
  if (!session) return;
  const e = { t: now(), k };
  if (d && typeof d === 'object' && Object.keys(d).length) e.d = d;
  session.events.push(e);
  dirty = true;
  if (k === 'ecran') place = `écran : ${d && d.id}`;
  else if (k === 'jeu' || k === 'reprise') place = 'en jeu';
  else if (k === 'pause') place = 'écran : pause';
}

let userActed = false;        // les réglages appliqués au démarrage du jeu ne sont pas des choix du joueur
function input() {
  userActed = true;
  const t = now();
  if (idleFrom != null) { log('inactif', { ms: t - idleFrom, lieu: place }); idleFrom = null; }
  lastInput = t;
}

/* ---------------- Session ---------------- */

function detectDevice() {
  const coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const dev = T.describeDevice({ coarse, width: window.screen?.width || innerWidth, height: window.screen?.height || innerHeight, ua: navigator.userAgent, dpr: window.devicePixelRatio });
  try { dev.quality = localStorage.getItem('taama.quality') || 'auto'; } catch (_) {}
  dev.window = `${innerWidth}×${innerHeight}`;
  return dev;
}

function loadSession() {
  let s = readJSON(T.CURRENT_KEY);
  if (!T.isSession(s)) {
    s = T.newSession({ id: T.newSessionId(), nowIso: iso(), url: location.pathname });
    writeJSON(T.CURRENT_KEY, s);
  }
  if (!s.device) s.device = detectDevice();
  return s;
}

function persist(force) {
  if (!session || (!dirty && !force)) return;
  dirty = false;
  if (!writeJSON(T.CURRENT_KEY, session)) {
    // stockage plein : on allège (positions des clics et FPS), le reste est gardé
    if (!storageFull) { storageFull = true; console.warn('[Test] stockage plein : la session est allégée'); }
    session.events = session.events.filter((e) => e.k !== 'fps' && e.k !== 'touches');
    writeJSON(T.CURRENT_KEY, session);
  }
}

async function send(final = false) {
  if (!session || sending || !/^https?:$/.test(location.protocol)) return false;
  if (!final && session.events.length === lastSentCount) return !!session.sentAt;
  sending = true;
  const count = session.events.length;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), final ? 8000 : 15000) : null;
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...session, sentAt: iso() }),
      signal: ctrl ? ctrl.signal : undefined,
      keepalive: final && JSON.stringify(session).length < 60000,
    });
    const data = res.ok ? await res.json().catch(() => ({})) : {};
    if (data.ok) { session.sentAt = iso(); lastSentCount = count; dirty = true; paintPanel(); return true; }
    return false;
  } catch (_) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
    sending = false;
  }
}

function download(data, name) {
  try {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  } catch (_) { return false; }
}

function archive(s) {
  let list = readJSON(T.ARCHIVE_KEY);
  if (!Array.isArray(list)) list = [];
  list = list.filter((x) => x && x.id !== s.id);
  list.push(s);
  while (list.length > ARCHIVE_MAX) list.shift();
  while (list.length && !writeJSON(T.ARCHIVE_KEY, list)) list.shift();   // trop gros : on garde les plus récentes
}

async function finish() {
  if (!session) return;
  if (idleFrom != null) input();
  const notesEl = ui && ui.panel.querySelector('[data-f="notes"]');
  if (notesEl) session.notes = notesEl.value.slice(0, 5000);     // dernière version des notes, même si la frappe vient de finir
  log('fin', { lieu: place });
  session.endedAt = iso();
  persist(true);
  paintPanel('Envoi en cours…');
  const ok = await send(true);
  if (!ok) download(session, T.sessionFileName(session));
  archive(session);
  try { store.removeItem(T.CURRENT_KEY); } catch (_) {}
  session = null;
  paintPanel(ok ? 'Session envoyée au PC ✓ — nouveau joueur…' : 'PC injoignable : fichier téléchargé ✓ — nouveau joueur…');
  setTimeout(() => {
    const u = new URL(location.href);
    u.searchParams.set('test', '1');
    location.replace(u.toString());
  }, ok ? 900 : 2200);
}

function stopTestMode() {
  try { store.removeItem(T.FLAG_KEY); } catch (_) {}
  const u = new URL(location.href);
  u.searchParams.set('test', '0');
  location.replace(u.toString());
}

/* ---------------- Capture ---------------- */

function describeTarget(e) {
  const path = e.composedPath ? e.composedPath() : [e.target];
  for (const n of path) {
    if (!n || n.nodeType !== 1) continue;
    const a = n.getAttribute('data-act');
    if (a) return `bouton:${a}`;
    const lab = n.getAttribute('aria-label');
    if (lab) return lab.slice(0, 40);
    if (n.id && n.id !== 'guRoot') return `#${n.id}`;
    if (n.tagName === 'BUTTON') return `bouton:${(n.textContent || '').trim().slice(0, 30)}`;
    if (n.tagName === 'CANVAS') return 'scène 3D';
    if (n.tagName === 'INPUT') return `champ:${n.getAttribute('data-field') || n.type}`;
  }
  const t = path[0];
  return t && t.tagName ? t.tagName.toLowerCase() : '?';
}

function inPanel(e) {
  const path = e.composedPath ? e.composedPath() : [e.target];
  return ui && path.some((n) => n === ui.badge || n === ui.panel);
}

function bindCapture() {
  window.addEventListener('pointerdown', (e) => {
    if (inPanel(e)) return;
    input();
    const w = innerWidth || 1, h = innerHeight || 1;
    log('clic', { x: Math.round((e.clientX / w) * 1000) / 1000, y: Math.round((e.clientY / h) * 1000) / 1000, c: describeTarget(e), p: e.pointerType || '' });
  }, { capture: true, passive: true });

  let keyCount = 0;
  const keyNames = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input();
    keyCount++;
    // jamais le texte tapé dans un champ (prénom…) : seulement les touches de jeu
    const typing = e.composedPath && e.composedPath().some((n) => n && (n.tagName === 'INPUT' || n.tagName === 'TEXTAREA'));
    const k = typing ? 'saisie' : (e.code || e.key || '?');
    keyNames[k] = (keyNames[k] || 0) + 1;
  }, { capture: true, passive: true });
  setInterval(() => {
    if (!keyCount) return;
    log('touches', { n: keyCount, k: { ...keyNames } });
    keyCount = 0;
    for (const k of Object.keys(keyNames)) delete keyNames[k];
  }, 5000);

  // manette : une activité compte comme une action (pas d'inactivité)
  let padActive = false;
  let lastPadLog = -Infinity;
  setInterval(() => {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    const active = pads.some((p) => p.buttons.some((b) => b.pressed) || p.axes.some((a) => Math.abs(a) > 0.35));
    if (active) input();
    if (active && !padActive && now() - lastPadLog > 60000) { log('manette'); lastPadLog = now(); }   // une mention par minute suffit
    padActive = active;
  }, 1000);

  window.addEventListener('wheel', () => input(), { capture: true, passive: true });
  window.addEventListener('touchmove', () => { if (now() - lastInput > 1000) input(); }, { capture: true, passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (idleFrom != null) { log('inactif', { ms: now() - idleFrom, lieu: place }); idleFrom = null; }   // l'inactivité s'arrête quand on quitte l'appli
      log('cache'); persist(true); send();
    }
    else { log('visible'); input(); }
  });
  window.addEventListener('pagehide', () => persist(true));

  window.addEventListener('error', (e) => { log('erreur', { msg: String(e.message || 'erreur').slice(0, 200), src: String(e.filename || '').split('/').pop().split('?')[0], l: e.lineno || 0 }); });
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason; log('erreur', { msg: String((r && r.message) || r || 'promesse rejetée').slice(0, 200) }); });

  let rt = 0;
  const orient = () => { clearTimeout(rt); rt = setTimeout(() => log('orientation', { w: innerWidth, h: innerHeight, portrait: innerHeight > innerWidth }), 600); };
  window.addEventListener('resize', orient);

  // inactivité
  setInterval(() => {
    if (idleFrom == null && now() - lastInput > T.IDLE_MS && !document.hidden) idleFrom = lastInput;
  }, 1000);

  // FPS (images par seconde) : une mesure toutes les 10 s
  let frames = 0, since = performance.now();
  const loop = (ts) => {
    frames++;
    if (ts - since >= FPS_EVERY_MS) {
      if (!document.hidden) log('fps', { v: Math.round((frames * 1000) / (ts - since)), lieu: place });
      frames = 0; since = ts;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function bindGame() {
  // le jeu (game-ui.js) envoie ses propres repères : écrans, actions, profil, séquences…
  window.addEventListener('taama:track', (e) => {
    const { k, d } = e.detail || {};
    if (!k) return;
    if (k === 'profil' && d) {
      session.player = { name: d.name, age: d.age };
      log('profil', { name: d.name, age: d.age, edit: !!d.edit });
      paintPanel();
      return;
    }
    log(k, d);
  });

  GAME_EVENTS.forEach((n) => window.addEventListener(n, (e) => {
    const d = { n };
    const det = e.detail;
    if (det && typeof det === 'object') {
      ['stage', 'index', 'id', 'skipped', 'key', 'value', 'statut', 'auto', 'on'].forEach((k) => {
        const v = det[k];
        if (v != null && (typeof v !== 'object')) d[k] = v;
      });
    }
    if (n === 'settings:changed') return userActed ? log('reglage', { key: d.key, value: d.value }) : undefined;
    log('evt', d);
  }));

  window.addEventListener('tapama:dialogue-end', (e) => {
    const d = e.detail || {};
    log('dialogue', { id: d.id || '?', phase: 'fin', skipped: !!d.skipped });
  });

  // fonctions de Tapama, des astuces et du guide : enveloppées sans changer leur comportement
  let tries = 0;
  const wrapAll = () => {
    let done = true;
    done = wrap(window.Tapama, 'play', (args) => {
      const a = args[0];
      log('dialogue', { id: typeof a === 'string' ? a : (a && a.id) || '?', phase: 'debut' });
    }) && done;
    done = wrap(window.Tapama, 'help', (args) => log('aide', { id: String(args[0] || 'general') })) && done;
    done = wrap(window.Tapama, 'radio', (args) => {
      const a = args[0];
      const txt = typeof a === 'string' ? a : (a && (a.text || a.id)) || '';
      log('radio', { txt: String(txt).slice(0, 80) });
    }) && done;
    done = wrap(window.Tapama, 'analyse', (args) => log('analyse', { id: String(args[0] || '') })) && done;
    done = wrap(window.GamepadKit, 'toast', (args) => log('astuce', { txt: String(args[0] || '').slice(0, 100) })) && done;
    done = wrap(window.Guide, 'open', (args) => log('guide', { via: String(args[0] || '') })) && done;
    done = wrap(window.Guide, 'start', () => log('guide', { via: 'menu' })) && done;
    if (!done && ++tries < 60) setTimeout(wrapAll, 500);
  };
  wrapAll();
}

function wrap(obj, fn, before) {
  if (!obj || typeof obj[fn] !== 'function') return false;
  if (obj[fn].__playtest) return true;
  const orig = obj[fn];
  const w = function (...args) {
    try { before(args); } catch (_) {}
    return orig.apply(this, args);
  };
  w.__playtest = true;
  obj[fn] = w;
  return true;
}

/* ---------------- Panneau de l'animateur ---------------- */

const CSS = `
#ptBadge{position:fixed;top:6px;left:6px;z-index:2147483646;font:600 11px/1 system-ui,sans-serif;letter-spacing:.08em;color:#fff;
  background:rgba(180,30,30,.55);padding:5px 8px;border-radius:999px;user-select:none;-webkit-user-select:none;touch-action:none;cursor:pointer;opacity:.6}
#ptBadge.hold{background:rgba(220,40,40,.95);opacity:1}
#ptBadge i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff6b6b;margin-right:5px;animation:ptb 1.6s infinite}
@keyframes ptb{50%{opacity:.25}}
#ptPanel{position:fixed;top:40px;left:6px;z-index:2147483647;width:min(340px,calc(100vw - 12px));max-height:calc(100vh - 50px);overflow:auto;
  font:14px/1.4 system-ui,sans-serif;color:#f8f3ea;background:rgba(20,14,10,.96);border:1px solid #7a5a3a;border-radius:12px;padding:14px;box-shadow:0 10px 40px rgba(0,0,0,.6)}
#ptPanel h3{margin:0 0 8px;font-size:15px;color:#f9d58b}
#ptPanel dl{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin:0 0 12px;font-size:13px}
#ptPanel dt{color:#c9b89f}#ptPanel dd{margin:0}
#ptPanel button{display:block;width:100%;margin:6px 0 0;padding:10px;border:0;border-radius:8px;font:600 14px system-ui,sans-serif;cursor:pointer;background:#3a2b1f;color:#f8f3ea}
#ptPanel button.main{background:#c8892e;color:#1b130c}
#ptPanel button.warn{background:#5a1f1f}
#ptPanel .notes{display:block;margin:0 0 4px;font-size:13px;color:#c9b89f}
#ptPanel .notes small{color:#8f7d66}
#ptPanel textarea{display:block;width:100%;margin-top:4px;padding:8px;border:1px solid #7a5a3a;border-radius:8px;background:#2a1f16;color:#f8f3ea;font:14px/1.4 system-ui,sans-serif;resize:vertical}
#ptPanel .msg{margin-top:8px;font-size:13px;color:#9fe0a8;min-height:1em}
`;

function buildUI() {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const badge = document.createElement('div');
  badge.id = 'ptBadge';
  badge.innerHTML = '<i></i>TEST';
  badge.title = 'Mode test — appui long pour ouvrir le panneau';
  const panel = document.createElement('div');
  panel.id = 'ptPanel';
  panel.hidden = true;
  panel.innerHTML = `
    <h3>Séance de test — TAAMA</h3>
    <dl>
      <dt>Joueur</dt><dd data-f="name"></dd>
      <dt>Appareil</dt><dd data-f="device"></dd>
      <dt>Durée</dt><dd data-f="dur"></dd>
      <dt>Étapes</dt><dd data-f="steps"></dd>
      <dt>Actions</dt><dd data-f="events"></dd>
      <dt>Envoi au PC</dt><dd data-f="sent"></dd>
      <dt>Sur l’appareil</dt><dd data-f="arch"></dd>
    </dl>
    <label class="notes">Notes de l’animateur <small>(gardées avec la session de ce joueur)</small>
      <textarea data-f="notes" rows="4" placeholder="Ce que tu observes : hésitations, réactions, phrases dites…"></textarea></label>
    <button class="main" data-b="next">Terminer → joueur suivant</button>
    <button data-b="dl">Télécharger cette session (.json)</button>
    <button data-b="dlall">Télécharger toutes les sessions de l’appareil</button>
    <button data-b="close">Fermer</button>
    <button class="warn" data-b="off">Quitter le mode test</button>
    <div class="msg" data-f="msg"></div>`;
  document.body.append(badge, panel);

  // appui long (1 s) : évite qu'un joueur l'ouvre par accident
  let holdT = 0;
  const cancel = () => { clearTimeout(holdT); badge.classList.remove('hold'); };
  badge.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    badge.classList.add('hold');
    holdT = setTimeout(() => { badge.classList.remove('hold'); togglePanel(true); }, 1000);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((n) => badge.addEventListener(n, cancel));
  badge.addEventListener('contextmenu', (e) => e.preventDefault());

  let armed = false;
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    e.stopPropagation();
    const k = b.dataset.b;
    if (k === 'close') togglePanel(false);
    else if (k === 'dl') { persist(true); download(session, T.sessionFileName(session)); paintPanel('Fichier téléchargé ✓'); }
    else if (k === 'dlall') {
      const list = (readJSON(T.ARCHIVE_KEY) || []).concat(session ? [session] : []);
      download(list, `sessions-taama-${new Date().toISOString().slice(0, 10)}.json`);
      paintPanel(`${list.length} session(s) téléchargée(s) ✓`);
    } else if (k === 'next') {
      if (!armed) { armed = true; b.textContent = 'Confirmer : terminer la session de ce joueur ?'; setTimeout(() => { armed = false; b.textContent = 'Terminer → joueur suivant'; }, 4000); return; }
      b.disabled = true;
      finish();
    } else if (k === 'off') {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirmer (la session reste sur l’appareil)'; return; }
      persist(true); send(true).finally(stopTestMode);
    }
  });
  // les touches tapées dans le panneau ne vont pas au jeu
  ['keydown', 'keyup', 'keypress'].forEach((n) => panel.addEventListener(n, (e) => e.stopPropagation()));

  // notes de l'animateur : enregistrées dans la session (sur l'appareil) à chaque frappe
  const notes = panel.querySelector('[data-f="notes"]');
  notes.value = (session && session.notes) || '';
  notes.addEventListener('input', () => {
    if (!session) return;
    session.notes = notes.value.slice(0, 5000);
    dirty = true;
    clearTimeout(notes._t);
    notes._t = setTimeout(() => persist(true), 400);
  });

  ui = { badge, panel };
  setInterval(() => { if (!panel.hidden) paintPanel(); }, 1000);
}

function togglePanel(open) {
  if (!ui) return;
  ui.panel.hidden = !open;
  if (open) { try { document.exitPointerLock?.(); } catch (_) {} paintPanel(); }
}

function paintPanel(msg) {
  if (!ui) return;
  const f = (k) => ui.panel.querySelector(`[data-f="${k}"]`);
  if (msg != null) f('msg').textContent = msg;
  if (!session) return;
  const s = T.summarize(session);
  f('name').textContent = s.name ? `${s.name}${s.age ? ` (${s.age} ans)` : ''}` : 'pas encore saisi';
  f('device').textContent = `${s.device} · ${s.os} · ${s.browser}`;
  f('dur').textContent = T.fmtDuration(s.durationMs);
  f('steps').textContent = `${s.milestonesReached}/${T.MILESTONES.length}${s.lastMilestone ? ` — ${s.lastMilestone}` : ''}`;
  f('events').textContent = String(session.events.length);
  f('sent').textContent = session.sentAt ? `✓ ${new Date(session.sentAt).toLocaleTimeString().slice(0, 5)}` : 'pas encore (fichier à la fin si besoin)';
  const arch = readJSON(T.ARCHIVE_KEY);
  f('arch').textContent = `${Array.isArray(arch) ? arch.length : 0} session(s) terminée(s)`;
}

/* ---------------- Démarrage ---------------- */

function start() {
  session = loadSession();
  t0 = Date.parse(session.startedAt) || Date.now();
  lastInput = now();
  log(window.__TAAMA_TEST_RELOAD ? 'rechargement' : 'debut', { url: location.pathname, lang: document.documentElement.lang || '' });
  persist(true);
  bindCapture();
  bindGame();
  const ready = () => buildUI();
  if (document.body) ready(); else document.addEventListener('DOMContentLoaded', ready);
  setInterval(() => persist(), SAVE_EVERY_MS);
  setInterval(() => send(), SEND_EVERY_MS);
  setTimeout(() => send(), 5000);
  window.Playtest = { session: () => session, summary: () => (session ? T.summarize(session) : null), finish, open: () => togglePanel(true) };
}

if (ON) start();
