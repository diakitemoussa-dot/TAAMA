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
import { t } from './i18n.js?v=1';
import { BOOKS } from './bibliotheque-textes.js?v=1';

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

const state = { books: [], loaded: false, near: null, open: false, lock: 0, prompt: null, marks: [], fini: false };
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

/* ---------- lecteur ---------- */
function openReader(book) {
  if (state.open) return; state.open = true;
  window.__storyFreeze = true; window.GamepadKit?.capture?.(true);
  try { window.DroneGame?.setTouchAxes?.(0, 0, 0, 0); } catch (_) {}
  const css = document.createElement('style');
  css.textContent = '#bqReader{position:fixed;inset:0;z-index:9000;background:rgba(10,6,14,.82);display:flex;align-items:center;justify-content:center;font-family:system-ui,"Segoe UI",sans-serif}#bqReader .bq-box{width:min(720px,92vw);max-height:88vh;overflow:auto;background:#f6ead2;color:#2a1d15;border-radius:18px;padding:26px 30px;box-shadow:0 12px 50px rgba(0,0,0,.6)}#bqReader h2{margin:0 0 4px;font-size:26px}#bqReader .bq-sub{margin:0 0 12px;color:#6f5f52}#bqReader .bq-ph{display:block;width:100%;text-align:left;padding:12px 14px;margin:8px 0;border:2px solid #d8c7a3;border-radius:12px;background:#fffaf1;color:#2a1d15;font:inherit;font-size:17px;line-height:1.35;cursor:pointer}#bqReader .bq-ph.sel{border-color:#b8741a;background:#fde7b0;font-weight:700}#bqReader .bq-ph.foc,#bqReader .bq-btn.foc{outline:3px solid #b8741a;outline-offset:2px}#bqReader .bq-row{display:flex;gap:12px;align-items:center;justify-content:space-between;margin-top:18px;flex-wrap:wrap}#bqReader .bq-btn{padding:11px 20px;border-radius:12px;border:0;background:#2a1d15;color:#f9d58b;font:inherit;font-weight:700;cursor:pointer}#bqReader .bq-btn.sec{background:#d8c7a3;color:#2a1d15}';
  const readerEl = document.createElement('div'); readerEl.id = 'bqReader';
  const sel = new Set(), already = DroneBase.phrases().map((p) => p.id);
  const box = document.createElement('div'); box.className = 'bq-box';
  box.innerHTML = '<h2>' + t('Livre n°') + ' ' + book.id + ' · ' + t(book.data.titre) + '</h2><p class="bq-sub">' + t(book.data.sujet) + '</p><p class="bq-sub">' + t('Sélectionne les phrases à retenir (une ou plusieurs), puis valide.') + '</p>';
  const items = [];
  let info = null;
  const count = () => { info.textContent = sel.size + ' ' + t('phrase(s) sélectionnée(s)'); };
  book.data.phrases.forEach((txt, i) => {
    const id = book.id + ':' + i, b = document.createElement('button'); b.type = 'button'; b.className = 'bq-ph'; b.textContent = t(txt);
    if (already.includes(id)) { sel.add(id); b.classList.add('sel'); }
    b.addEventListener('click', () => { if (sel.has(id)) sel.delete(id); else sel.add(id); b.classList.toggle('sel', sel.has(id)); count(); });
    box.appendChild(b); items.push({ el: b, act: () => b.click() });
  });
  const row = document.createElement('div'); row.className = 'bq-row';
  info = document.createElement('span'); row.appendChild(info);
  const bV = document.createElement('button'); bV.type = 'button'; bV.className = 'bq-btn'; bV.textContent = t('Valider la sélection');
  const bC = document.createElement('button'); bC.type = 'button'; bC.className = 'bq-btn sec'; bC.textContent = t('Fermer');
  row.append(bC, bV); box.appendChild(row); readerEl.appendChild(box); document.body.appendChild(readerEl); document.head.appendChild(css);
  count();
  let cur = 0;
  const focus = (i) => { cur = (i + items.length + 2) % (items.length + 2); const all = [...items.map((x) => x.el), bC, bV]; all.forEach((el, k) => el.classList.toggle('foc', k === cur)); all[cur].scrollIntoView({ block: 'nearest' }); };
  const act = () => { if (cur < items.length) items[cur].act(); else if (cur === items.length) close(); else validate(); };
  focus(0);
  let raf = 0;
  const t0 = performance.now();
  function close() {
    if (!state.open) return;
    cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); readerEl.remove(); css.remove();
    state.open = false; state.lock = 0.8; window.__storyFreeze = false; window.GamepadKit?.capture?.(false);
  }
  function validate() {
    const picked = [...sel].map((id) => { const [bk, i] = id.split(':').map(Number); return { id, livre: bk, texte: BOOKS.find((x) => x.id === bk).phrases[i] }; });
    const n = DroneBase.add(picked);
    const l = lus(); if (!l.includes(book.id)) { l.push(book.id); store.set(KEY_LUS, l); }
    window.GamepadKit?.toast?.(t('Phrases enregistrées dans la base du drone') + ' : ' + n);
    window.dispatchEvent(new CustomEvent('bibliotheque:valide', { detail: { livre: book.id, nouvelles: n } }));
    close(); checkFini();
  }
  bC.addEventListener('click', close); bV.addEventListener('click', validate);
  function onKey(e) {
    if (performance.now() - t0 < 300) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    if (e.code === 'Escape') close();
    else if (e.code === 'ArrowDown') focus(cur + 1);
    else if (e.code === 'ArrowUp') focus(cur - 1);
    else if (e.code === 'Enter' || e.code === 'Space') act();
    else return;
    e.preventDefault(); e.stopImmediatePropagation();
  }
  window.addEventListener('keydown', onKey, true);
  const poll = () => {
    const R = window.GamepadKit?.raw;
    if (R && performance.now() - t0 > 400) {
      if (R.justPressed('B')) { close(); return; }
      if (R.justPressed('DOWN')) focus(cur + 1);
      if (R.justPressed('UP')) focus(cur - 1);
      if (R.justPressed('A')) act();
    }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);
}

function checkFini() {
  if (state.fini || lus().length < BOOKS.length) return;
  state.fini = true;
  window.GamepadKit?.toast?.(t('Tous les livres sont lus. Tapama t’attend à son laboratoire.'));
  try { localStorage.setItem('taama.dispositif2', '1'); } catch (_) {}
  try { window.GameUI?.completeSequence?.(9); window.GameUI?.completeSequence?.(10); } catch (_) {}
  // Tapama : « Rejoins-moi » ; à la fin de la bulle, la carte s'ouvre sur le labo (le stade 2 du labo décortique les phrases)
  const call = { text: 'Tu as tout lu, {nom} ! Rejoins-moi à mon laboratoire avec les phrases que tu as retenues : on va les décortiquer ensemble.', mood: 'souriante', duration: 9 };
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

M?.addFrameHook((dt) => {
  if (state.lock > 0) state.lock -= dt;
  if (!unlocked()) { if (state.prompt) state.prompt.style.display = 'none'; updateMarks(false); return; }
  if (!state.loaded && !collect()) return;
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
};
