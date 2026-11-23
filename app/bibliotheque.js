/* ==========================================================
   BAREY SO — bibliothèque : livres à ouvrir, phrases à retenir
   ----------------------------------------------------------
   Après la tombe de Tapama (taama.tombe = '1') :
   • le drone en vol affiche les livres numérotés (repères dorés = pas encore lus, gris = lus) ;
   • à pied (< 2,5 m) ou en drone (< 3 m), un bouton « Ouvrir » apparaît : E, ○/△ à la manette, ou le bouton tactile « Interagir » ;
   • le lecteur affiche les phrases du livre ; le joueur en sélectionne une ou plusieurs puis valide : elles sont enregistrées dans la
     base de données du drone (taama.drone.phrases, un identifiant livre:index par phrase) ;
   • quand tous les livres sont lus : événement `bibliotheque:fini` (Tapama enverra ensuite le joueur à son laboratoire).
   API : window.Bibliotheque { loaded, lus, phrases, promptVisible(), reset(), debug(), open(id) } et window.DroneBase { phrases(), add(), clear() }.
   Textes : app/bibliotheque-textes.js (provisoires).
   ========================================================== */
import * as THREE from 'three';
import { t } from './i18n.js?v=3';
import { BOOKS } from './bibliotheque-textes.js?v=2';
import { Book3D } from './livre-3d.js?v=7';

const M = window.MosqueScene;
const KEY_LUS = 'taama.biblio.lus', KEY_PH = 'taama.drone.phrases';
const REACH_FOOT = 2.5, REACH_DRONE = 3.0, MARK_RANGE = 60;
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};

/* ---------- base de données du drone ---------- */
const DroneBase = {
  phrases: () => store.get(KEY_PH, []),                                   // [{ id:'3:1', livre:3, texte }]
  add(list) {
    const all = DroneBase.phrases(); let n = 0;
    for (const p of list) if (!all.some((x) => x.id === p.id)) { all.push(p); n++; }
    store.set(KEY_PH, all); return n;
  },
  clear() { store.set(KEY_PH, []); },
};
window.DroneBase = DroneBase;

const state = { reader: null, books: [], loaded: false, near: null, open: false, lock: 0, prompt: null, marks: [], fini: false };
const unlocked = () => { try { return localStorage.getItem('taama.tombe') === '1'; } catch (_) { return false; } };
const lus = () => store.get(KEY_LUS, []);

/* ---------- livres de la maison (nœuds Livre_Interactif_NN) ---------- */
function collect() {
  const mt = window.MaisonTerre; if (!mt || !mt.loaded || !mt.root) return false;
  mt.root.updateMatrixWorld(true);
  state.books = [];
  mt.root.traverse((o) => {
    const m = /^Livre_Interactif_(\d+)$/.exec(o.name || ''); if (!m) return;
    const id = +m[1], data = BOOKS.find((b) => b.id === id); if (!data) return;
    const pos = new THREE.Vector3(); o.getWorldPosition(pos);
    state.books.push({ id, node: o, pos, data });
  });
  state.books.sort((a, b) => a.id - b.id);
  state.loaded = state.books.length > 0;
  return state.loaded;
}

/* ---------- invite « Ouvrir » ---------- */
function ensurePrompt() {
  if (state.prompt) return state.prompt;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;background:rgba(20,14,24,.85);border:1px solid #f9d58b;color:#f9d58b;font:700 16px system-ui,"Segoe UI",sans-serif;z-index:60;pointer-events:none;display:none';
  document.body.appendChild(d); state.prompt = d; return d;
}
function setPrompt(book) {
  const p = ensurePrompt();
  if (!book) { p.style.display = 'none'; return; }
  const pad = !!window.GamepadKit?.connected?.();
  // contrat tactile (touch-controls.js findPrompt) : un <kbd>E</kbd> dans un div enfant direct de body ; la manette affiche ○ à la place
  p.innerHTML = '<kbd style="border:1px solid #f9d58b;border-radius:8px;padding:2px 9px;margin-right:8px">' + (pad ? '○' : 'E') + '</kbd>' + t('Ouvrir') + ' · ' + t('Livre n°') + ' ' + book.id;
  p.style.display = 'block';
}

/* ---------- repères numérotés (drone) ---------- */
const _v = new THREE.Vector3();
function ensureMarks() {
  if (state.marks.length) return;
  const css = document.createElement('style');
  css.textContent = '.bq-mark{position:fixed;left:0;top:0;z-index:55;pointer-events:none;display:none;width:38px;height:38px;border-radius:50%;background:#f9d58b;color:#2a1d15;font:800 18px system-ui,sans-serif;line-height:38px;text-align:center;border:2px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.45)}.bq-mark.lu{background:#9a9189;color:#fff}.bq-mark small{position:absolute;left:44px;top:6px;white-space:nowrap;font:700 12px system-ui,sans-serif;color:#fff;background:rgba(20,14,24,.7);padding:2px 8px;border-radius:10px;line-height:1.3;text-align:left}';
  document.head.appendChild(css);
  for (const b of state.books) {
    const d = document.createElement('div'); d.className = 'bq-mark'; d.textContent = b.id;
    const s = document.createElement('small'); s.textContent = t(b.data.titre); d.appendChild(s);
    document.body.appendChild(d); state.marks.push(d);
  }
}
function updateMarks(show) {
  if (!show && !state.marks.length) return;
  ensureMarks();
  const done = lus(), W = innerWidth, H = innerHeight, placed = [];
  const order = state.books.map((b, i) => ({ b, d: state.marks[i], dist: M.camera.position.distanceTo(b.pos) })).sort((x, y) => x.dist - y.dist);
  for (const { b, d, dist } of order) {
    if (!show) { d.style.display = 'none'; continue; }
    _v.copy(b.pos).project(M.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.05 || Math.abs(_v.y) > 1.05) { d.style.display = 'none'; continue; }
    const x = (_v.x * 0.5 + 0.5) * W - 19; let y = (-_v.y * 0.5 + 0.5) * H - 19;
    for (let k = 0; k < 8 && placed.some((p) => Math.abs(p.x - x) < 44 && Math.abs(p.y - y) < 44); k++) y -= 46;    // étalement : on remonte le repère tant qu'il en chevauche un autre
    placed.push({ x, y });
    d.style.display = 'block'; d.style.transform = 'translate(' + x + 'px,' + y + 'px)'; d.classList.toggle('lu', done.includes(b.id));
    d.style.opacity = String(Math.max(0.55, Math.min(1, 1.3 - dist / 90)));
  }
}

/* ---------- lecteur : le texte est ÉCRIT sur les vraies pages du livre 3D (app/livre-3d.js) ----------
   Page de gauche : titre, sujet, consigne, boutons dessinés. Page de droite : les phrases, avec une pastille à cocher.
   Sélection : clic / toucher sur la page, ↑ ↓ + Entrée au clavier, croix directionnelle + ✕ à la manette ; Échap ou ○ pour fermer. */
const INK = '#2a1d15', INK2 = '#6f5f52', GOLD = '#b8741a';
function wrapLines(g, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { const tryL = line ? line + ' ' + w : w; if (g.measureText(tryL).width > maxW && line) { out.push(line); line = w; } else line = tryL; }
  if (line) out.push(line); return out;
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

function openReader(book) {
  if (state.open) return; state.open = true;
  window.__storyFreeze = true; window.GamepadKit?.capture?.(true);
  try { window.DroneGame?.setTouchAxes?.(0, 0, 0, 0); } catch (_) {}
  // fond assombri qui s'installe pendant que le livre sort de l'étagère
  const dim = document.createElement('div'); dim.style.cssText = 'position:fixed;inset:0;z-index:8980;background:rgba(10,6,14,.62);opacity:0;transition:opacity .5s ease;pointer-events:none';
  document.body.appendChild(dim); requestAnimationFrame(() => { dim.style.opacity = '1'; });
  // le livre quitte son étagère : écran (position projetée) → devant la caméra, ouverture en 3D
  const pv = book.pos.clone().project(M.camera), onScr = pv.z < 1;
  const b3 = Book3D.open(onScr ? Math.max(-1, Math.min(1, pv.x)) : 0, onScr ? Math.max(-1, Math.min(1, pv.y)) : -0.4);
  if (book.node) book.node.visible = false;
  let ready = false, closing = false, raf = 0, cur = 0, regions = [];
  const sel = new Set(), already = DroneBase.phrases().map((p) => p.id);
  const phr = book.data.phrases.map((txt, i) => ({ id: book.id + ':' + i, text: t(txt) }));
  phr.forEach((p) => { if (already.includes(p.id)) sel.add(p.id); });
  const NF = phr.length + 2;                                  // phrases + Valider + Fermer (ordre du focus)

  /* ----- dessin des deux pages ----- */
  function draw() {
    if (!b3.pages) return;
    const L = b3.pages.left.cv, R = b3.pages.right.cv, gl = L.getContext('2d'), gr = R.getContext('2d'), W = L.width, H = L.height;
    gl.clearRect(0, 0, W, H); gr.clearRect(0, 0, W, H); regions = [];
    const padX = 62;
    // page de gauche
    gl.fillStyle = INK; gl.textBaseline = 'alphabetic';
    gl.font = 'bold 50px Georgia, serif'; let y = 120;
    for (const ln of wrapLines(gl, t('Livre n°') + ' ' + book.id, W - 2 * padX)) { gl.fillText(ln, padX, y); y += 58; }
    gl.font = 'bold 44px Georgia, serif';
    for (const ln of wrapLines(gl, t(book.data.titre), W - 2 * padX)) { gl.fillText(ln, padX, y); y += 52; }
    y += 6; gl.strokeStyle = GOLD; gl.lineWidth = 3; gl.beginPath(); gl.moveTo(padX, y); gl.lineTo(W - padX, y); gl.stroke(); y += 46;
    gl.fillStyle = INK2; gl.font = 'italic 32px Georgia, serif';
    for (const ln of wrapLines(gl, t(book.data.sujet), W - 2 * padX)) { gl.fillText(ln, padX, y); y += 40; }
    y += 24; gl.font = '29px Georgia, serif';
    for (const ln of wrapLines(gl, t('Sélectionne les phrases à retenir (une ou plusieurs), puis valide.'), W - 2 * padX)) { gl.fillText(ln, padX, y); y += 37; }
    y += 18; gl.fillStyle = GOLD; gl.font = 'bold 32px Georgia, serif'; gl.fillText(sel.size + ' ' + t('phrase(s) sélectionnée(s)'), padX, y);
    // boutons dessinés
    const btn = (label, by, primary, idx) => {
      const bw = W - 2 * padX, bh = 88;
      rrect(gl, padX, by, bw, bh, 20); gl.fillStyle = primary ? INK : 'rgba(120,90,50,.28)'; gl.fill();
      if (cur === idx) { rrect(gl, padX - 5, by - 5, bw + 10, bh + 10, 24); gl.strokeStyle = GOLD; gl.lineWidth = 6; gl.stroke(); }
      gl.fillStyle = primary ? '#f9d58b' : INK; gl.font = 'bold 36px Georgia, serif'; gl.textAlign = 'center'; gl.fillText(label, W / 2, by + 57); gl.textAlign = 'left';
      regions.push({ page: 'left', x: padX, y: by, w: bw, h: bh, idx });
    };
    btn(t('Valider la sélection'), H - 290, true, phr.length);
    btn(t('Fermer'), H - 184, false, phr.length + 1);
    gl.fillStyle = INK2; gl.font = 'italic 25px Georgia, serif';
    gl.fillText(window.GamepadKit?.connected?.() ? '↕ ' + t('choisir') + ' · ✕ ' + t('cocher') + ' · ○ ' + t('fermer') : '↑ ↓ ' + t('choisir') + ' · ' + t('Entrée') + ' ' + t('cocher') + ' · ' + t('Échap') + ' ' + t('fermer'), padX, H - 52);
    // page de droite : les phrases (la taille du texte s'ajuste pour que tout tienne)
    let fs = 38, lines;
    const layout = (size) => { gr.font = 'bold ' + size + 'px Georgia, serif'; return phr.map((p) => wrapLines(gr, p.text, W - 2 * padX - 70)); };
    for (; fs > 22; fs -= 2) { lines = layout(fs); const tot = lines.reduce((a, l) => a + l.length * (fs * 1.28) + 38, 0); if (tot < H - 150) break; }
    lines = layout(fs);
    let ry = 78;
    phr.forEach((p, i) => {
      const lh = fs * 1.28, bh = lines[i].length * lh + 26, on = sel.has(p.id);
      if (on) { rrect(gr, padX - 18, ry, W - 2 * padX + 36, bh, 16); gr.fillStyle = 'rgba(253,214,120,.75)'; gr.fill(); }
      if (cur === i) { rrect(gr, padX - 18, ry, W - 2 * padX + 36, bh, 16); gr.strokeStyle = GOLD; gr.lineWidth = 5; gr.stroke(); }
      const cy = ry + bh / 2;
      gr.beginPath(); gr.arc(padX + 18, cy, 17, 0, Math.PI * 2); gr.strokeStyle = on ? GOLD : INK2; gr.lineWidth = 4; gr.stroke();
      if (on) { gr.beginPath(); gr.arc(padX + 18, cy, 9, 0, Math.PI * 2); gr.fillStyle = GOLD; gr.fill(); }
      gr.fillStyle = INK; gr.font = (on ? 'bold ' : '') + fs + 'px Georgia, serif'; gr.textBaseline = 'alphabetic';
      lines[i].forEach((ln, k) => gr.fillText(ln, padX + 70, ry + 13 + lh * (k + 0.8)));
      regions.push({ page: 'right', x: padX - 18, y: ry, w: W - 2 * padX + 36, h: bh, idx: i });
      ry += bh + 22;
    });
    b3.refresh();
  }
  const toggle = (i) => { const id = phr[i].id; if (sel.has(id)) sel.delete(id); else sel.add(id); draw(); };
  const act = (idx) => { cur = idx; if (idx < phr.length) toggle(idx); else if (idx === phr.length) validate(); else close(); };

  function close() {
    if (!state.open || closing) return; closing = true;
    dim.style.opacity = '0'; cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPtr, true);
    b3.close().then(() => {                                                      // le livre se referme et retourne à l'étagère, puis le jeu reprend
      dim.remove(); if (book.node) book.node.visible = true; state.reader = null;
      state.open = false; state.lock = 0.8; window.__storyFreeze = false; window.GamepadKit?.capture?.(false);
    });
  }
  function validate() {
    const picked = [...sel].map((id) => { const [bk, i] = id.split(':').map(Number); return { id, livre: bk, texte: BOOKS.find((x) => x.id === bk).phrases[i] }; });
    const n = DroneBase.add(picked);
    const l = lus(); if (!l.includes(book.id)) { l.push(book.id); store.set(KEY_LUS, l); }
    window.GamepadKit?.toast?.(t('Phrases enregistrées dans la base du drone') + ' : ' + n);
    window.dispatchEvent(new CustomEvent('bibliotheque:valide', { detail: { livre: book.id, nouvelles: n } }));
    close(); unlockLab(); checkFini();
  }
  function onKey(e) {
    if (e.code === 'Escape') close();
    else if (!ready) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    else if (e.code === 'ArrowDown') { cur = (cur + 1) % NF; draw(); }
    else if (e.code === 'ArrowUp') { cur = (cur + NF - 1) % NF; draw(); }
    else if (e.code === 'Enter' || e.code === 'Space') act(cur);
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }
  function onPtr(e) {                                                            // clic / toucher directement sur la page du livre
    if (!ready || closing) return;
    const h = b3.pick(e.clientX, e.clientY); if (!h) return;
    const r = regions.find((q) => q.page === h.page && h.x >= q.x && h.x <= q.x + q.w && h.y >= q.y && h.y <= q.y + q.h);
    if (r) { e.preventDefault(); e.stopImmediatePropagation(); act(r.idx); }
  }
  window.addEventListener('keydown', onKey, true); window.addEventListener('pointerdown', onPtr, true);
  const poll = () => {
    const R = window.GamepadKit?.raw;
    if (R && ready) {
      if (R.justPressed('B')) { close(); return; }
      if (R.justPressed('DOWN')) { cur = (cur + 1) % NF; draw(); }
      if (R.justPressed('UP')) { cur = (cur + NF - 1) % NF; draw(); }
      if (R.justPressed('A')) act(cur);
    }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);
  b3.opened.then(() => { ready = true; draw(); });
  state.reader = { toggle, validate, close, focus: (i) => { cur = i; draw(); }, selected: () => [...sel], count: phr.length, ready: () => ready };
}

/* Dès que le joueur a lu et validé LIVRES_MIN livres (avec au moins une phrase dans la base du drone), Tapama l'appelle (« Bien joué ») et le labo s'ouvre (cercle jaune actif) : il peut y retourner sans avoir lu tous les livres. */
const LIVRES_MIN = 4;
function unlockLab() {
  let done = false; try { done = localStorage.getItem('taama.dispositif2') === '1'; } catch (_) {}
  if (done || lus().length < LIVRES_MIN || DroneBase.phrases().length < 1) return;
  try { localStorage.setItem('taama.dispositif2', '1'); localStorage.setItem('taama.acte', '3:retour'); } catch (_) {}
  try { window.GameUI?.completeSequence?.(9); window.GameUI?.completeSequence?.(10); } catch (_) {}
  window.GamepadKit?.toast?.(t('Le laboratoire de Tapama est ouvert : rejoins le cercle jaune.'));
  const call = { text: 'Bien joué, {nom} ! Tu as déjà de quoi travailler. Rejoins-moi à mon laboratoire avec tes phrases : on va déverrouiller le dispositif 2.', mood: 'souriante', duration: 8 };
  const go = () => { try { window.CityMap?.openTo?.('deuxieme'); } catch (_) {} };
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go); else { window.Tapama?.radio?.(call); setTimeout(go, 9000); }
  window.dispatchEvent(new CustomEvent('bibliotheque:fini', { detail: { phrases: DroneBase.phrases().length, anticipe: true } }));
}

function checkFini() {
  if (state.fini || lus().length < BOOKS.length) return;
  state.fini = true;
  let ouvert = false; try { ouvert = localStorage.getItem('taama.dispositif2') === '1'; } catch (_) {}
  if (ouvert) return;                                                  // le labo a déjà été ouvert (et Tapama déjà appelée) dès les premières phrases
  window.GamepadKit?.toast?.(t('Tous les livres sont lus. Tapama t’attend à son laboratoire.'));
  try { localStorage.setItem('taama.dispositif2', '1'); } catch (_) {}
  try { window.GameUI?.completeSequence?.(9); window.GameUI?.completeSequence?.(10); } catch (_) {}
  // Tapama : « Rejoins-moi » ; à la fin de la bulle, la carte s'ouvre sur le labo (le stade 2 du labo décortique les phrases)
  const call = { text: 'Tu as récolté toutes les informations, {nom} ! Rejoins-moi à mon laboratoire avec les phrases que tu as retenues : on va déverrouiller le dispositif 2.', mood: 'souriante', duration: 9 };
  const go = () => { try { localStorage.setItem('taama.acte', '3:retour'); window.CityMap?.openTo?.('deuxieme'); } catch (_) {} };
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go); else { window.Tapama?.radio?.(call); setTimeout(go, 10000); }
  window.dispatchEvent(new CustomEvent('bibliotheque:fini', { detail: { phrases: DroneBase.phrases().length } }));
}

/* ---------- boucle ---------- */
function nearest() {
  const D = window.DroneGame, droneOn = !!(D && D.isActive && D.isActive());
  const p = droneOn ? D.getPosition?.() : window.SanctuaryMode?.playerPosition?.();
  if (!p) return null;
  let best = null, bd = Infinity;
  for (const b of state.books) {
    const dx = p.x - b.pos.x, dz = p.z - b.pos.z, dy = Math.abs(p.y - b.pos.y);
    const d = droneOn ? Math.hypot(dx, dy, dz) : (dy < 2.5 ? Math.hypot(dx, dz) : Infinity);
    if (d < (droneOn ? REACH_DRONE : REACH_FOOT) && d < bd) { best = b; bd = d; }
  }
  return best;
}
const wantOpen = () => { if (!state.near || state.open || state.lock > 0) return; openReader(state.near); };

/* Entrée dans Barey So : le joueur entre dans l'emprise du bâtiment (28,5 × 20,5 m dans le repère de la maison) → Tapama lui parle une seule fois */
const KEY_ENTREE = 'taama.biblio.entree';
let entreeT = 0;
function checkEntree(dt) {
  entreeT += dt; if (entreeT < 0.3) return; entreeT = 0;
  try { if (localStorage.getItem(KEY_ENTREE) === '1') return; } catch (_) {}
  const mt = window.MaisonTerre, pp = window.SanctuaryMode?.playerPosition?.();
  if (!mt || !mt.loaded || !mt.root || !pp || window.Tapama?.isBusy?.() || window.__storyFreeze) return;
  const l = mt.root.worldToLocal(new THREE.Vector3(pp.x, pp.y, pp.z));
  if (Math.abs(l.x) > 14.25 || Math.abs(l.z) > 10.25) return;
  try { localStorage.setItem(KEY_ENTREE, '1'); } catch (_) {}
  const call = { text: 'Te voilà à Barey So, {nom} ! Récolte le plus d’informations que tu peux. Juste après, je t’affiche le chemin de retour vers mon laboratoire, puis tu pourras lire les livres.', mood: 'attentive', duration: 11 };
  // l'itinéraire de retour vers le labo ne s'affiche qu'APRÈS le message de Tapama (1 s après la disparition de la bulle)
  const go = () => setTimeout(() => { try { window.CityMap?.openTo?.('deuxieme'); } catch (_) {} }, 1000);
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go);
  else { window.Tapama?.radio?.(call); setTimeout(go, (call.duration || 11) * 1000 + 1000); }
}

M?.addFrameHook((dt) => {
  if (state.lock > 0) state.lock -= dt;
  if (!unlocked()) { if (state.prompt) state.prompt.style.display = 'none'; updateMarks(false); return; }
  if (!state.loaded && !collect()) return;
  checkEntree(dt);
  const near = state.open ? null : nearest();
  if (near !== state.near) { state.near = near; setPrompt(near); }
  const droneOn = !!(window.DroneGame?.isActive?.());
  const mp = window.MaisonTerre?.position;
  updateMarks(droneOn && !state.open && !!mp && M.camera.position.distanceTo(mp) < MARK_RANGE + 40);
  const GP = window.GamepadKit;
  if (state.near && GP?.connected?.() && (GP.justPressed('B') || GP.justPressed('Y'))) wantOpen();
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyE' || e.repeat || !state.near || state.open) return;
  e.preventDefault(); e.stopImmediatePropagation(); wantOpen();
}, true);

window.Bibliotheque = {
  get loaded() { return state.loaded; }, get lus() { return lus(); }, get phrases() { return DroneBase.phrases(); },
  promptVisible: () => !!(state.prompt && state.prompt.style.display === 'block'),
  reset() { store.set(KEY_LUS, []); DroneBase.clear(); state.fini = false; },
  debug: () => ({ books: state.books.map((b) => ({ id: b.id, pos: b.pos.toArray().map((v) => Math.round(v * 10) / 10) })), near: state.near && state.near.id, open: state.open }),
  open: (id) => { const b = state.books.find((x) => x.id === id); if (b) openReader(b); },
  reader: () => state.reader,                                                   // contrôle du lecteur (tests) : toggle(i), validate(), close()
};
