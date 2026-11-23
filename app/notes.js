/* ==========================================================
   MES NOTES — le carnet du joueur
   ----------------------------------------------------------
   • Notes.add({ texte, source }) : range une note (localStorage « taama.notes ») et l'envoie dans la feuille du jeu (onglet « Notes ») ;
     tant que l'envoi n'a pas réussi, la note reste « en attente » et repart toute seule (retour de la connexion, ouverture du carnet, démarrage).
   • Notes.openPanel() : affiche le carnet (bouton « Mes notes » du menu pause, injecté par app/game-ui.js).
     Clavier : Échap ferme · Manette : B ferme, haut/bas défilent · Tactile : bouton Fermer, défilement au doigt.
   ========================================================== */
import { sendProfile } from './player-sync.js?v=6';
import { t as tr } from './i18n.js?v=3';

const KEY = 'taama.notes';
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
const save = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (_) {} };
const uid = () => (crypto && crypto.randomUUID ? crypto.randomUUID() : 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

let sending = false;
async function flush() {
  if (sending) return;
  const who = window.GameUI && window.GameUI.player && window.GameUI.player();
  if (!who || !who.id || !who.name) return;
  const list = load();
  if (!list.some((n) => !n.sent)) return;
  sending = true;
  try {
    for (const n of list.filter((x) => !x.sent)) {
      const ok = await sendProfile({ id: who.id, name: who.name, age: who.age }, { note: { id: n.id, texte: n.texte, source: n.source } });
      if (!ok) break;                                                       // hors connexion : on réessaiera plus tard
      const fresh = load(); const m = fresh.find((x) => x.id === n.id);
      if (m) { m.sent = true; save(fresh); }
    }
  } finally { sending = false; }
}

function add({ texte, source = 'jeu' } = {}) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) return null;
  const n = { id: uid(), texte: t, source, date: new Date().toISOString(), sent: false };
  const list = load(); list.push(n); save(list);
  window.dispatchEvent(new CustomEvent('notes:changed', { detail: { note: n } }));
  flush();
  return n;
}

/* ---------- carnet ---------- */
let panel = null, raf = 0;
const fmt = (iso) => { try { return new Date(iso).toLocaleString(document.documentElement.lang === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' }); } catch (_) { return ''; } };
const SRC = { labo2: 'Laboratoire de Tapama', labo2q: 'Laboratoire de Tapama · chez moi' };

function closePanel() {
  if (!panel) return;
  panel.remove(); panel = null; cancelAnimationFrame(raf);
  window.removeEventListener('keydown', onKey, true);
  window.GamepadKit?.capture?.(false);
}
function onKey(e) {
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
  else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { const l = panel && panel.querySelector('.nt-list'); if (l) l.scrollTop += (e.code === 'ArrowDown' ? 1 : -1) * 90; e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); closePanel(); }
}

function openPanel() {
  if (panel) return;
  flush();
  const list = load().slice().reverse();
  panel = document.createElement('div');
  panel.id = 'notesPanel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', tr('Mes notes'));
  panel.style.cssText = 'position:fixed;inset:0;z-index:99990;display:flex;align-items:center;justify-content:center;background:rgba(20,12,26,.72);font-family:"Open Sans",system-ui,sans-serif;color:#f8f3ea;padding:16px;box-sizing:border-box';
  const card = document.createElement('div');
  card.style.cssText = 'width:min(720px,100%);max-height:88vh;display:flex;flex-direction:column;gap:14px;padding:26px 28px;border-radius:24px;background:rgba(85,65,93,.97);border:1px solid rgba(248,243,234,.55);box-shadow:0 16px 60px rgba(0,0,0,.6);box-sizing:border-box';
  const h = document.createElement('div'); h.style.cssText = 'font-family:Rubik,sans-serif;font-weight:800;font-size:26px;color:#f9d58b';
  h.textContent = tr('Mes notes');
  const sub = document.createElement('div'); sub.style.cssText = 'font-size:15px;opacity:.85'; sub.textContent = tr('Les phrases que tu as retenues, écrites avec tes mots.');
  const box = document.createElement('div'); box.className = 'nt-list'; box.tabIndex = 0;
  box.style.cssText = 'overflow:auto;display:flex;flex-direction:column;gap:10px;padding-right:6px;min-height:80px;overscroll-behavior:contain';
  if (!list.length) { const e = document.createElement('div'); e.style.cssText = 'font-style:italic;padding:14px 0;opacity:.85'; e.textContent = tr('Aucune note pour l’instant. Tapama t’en fera écrire une dans son laboratoire.'); box.appendChild(e); }
  for (const n of list) {
    const it = document.createElement('div'); it.style.cssText = 'padding:14px 16px;border-radius:16px;background:rgba(248,243,234,.12);border-left:4px solid #f9d58b';
    const t = document.createElement('div'); t.style.cssText = 'font-size:18px;line-height:1.45;font-weight:600;word-break:break-word'; t.textContent = '« ' + n.texte + ' »';
    const m = document.createElement('div'); m.style.cssText = 'margin-top:6px;font-size:13px;opacity:.8;display:flex;gap:12px;flex-wrap:wrap';
    m.textContent = [fmt(n.date), tr(SRC[n.source] || 'Jeu'), n.sent ? '✓ ' + tr('Envoyée') : '⏳ ' + tr('En attente d’envoi')].filter(Boolean).join(' · ');
    it.append(t, m); box.appendChild(it);
  }
  const close = document.createElement('button'); close.type = 'button'; close.textContent = tr('Fermer');
  close.style.cssText = 'align-self:flex-end;min-height:48px;padding:0 28px;border:0;border-radius:14px;background:#f9d58b;color:#55415d;font:700 18px Rubik,sans-serif;cursor:pointer;box-shadow:0 0 0 3px #f8f3ea;touch-action:manipulation';
  close.addEventListener('click', closePanel);
  const hint = document.createElement('div'); hint.style.cssText = 'font-size:13px;opacity:.75'; hint.textContent = window.GamepadKit?.connected?.() ? '↕ ' + tr('défiler') + ' · ○ / ✕ ' + tr('fermer') : '↑ ↓ ' + tr('défiler') + ' · ' + tr('Échap') + ' ' + tr('fermer');
  card.append(h, sub, box, close, hint); panel.appendChild(card); document.body.appendChild(panel);
  panel.addEventListener('pointerdown', (e) => { if (e.target === panel) closePanel(); });
  window.addEventListener('keydown', onKey, true);
  window.GamepadKit?.capture?.(true);
  const t0 = performance.now();
  const poll = () => {
    const R = window.GamepadKit && window.GamepadKit.raw;
    if (R && performance.now() - t0 > 400) {
      if (R.justPressed('B') || R.justPressed('A') || R.justPressed('START')) { closePanel(); return; }
      const st = R.state && R.state(), l = panel.querySelector('.nt-list');
      if (l && st) l.scrollTop += (R.down && R.down('DOWN') ? 1 : R.down && R.down('UP') ? -1 : 0) * 10 + st.ly * 14;
    }
    raf = requestAnimationFrame(poll);
  };
  raf = requestAnimationFrame(poll);
  setTimeout(() => close.focus({ preventScroll: true }), 30);
}

window.addEventListener('online', flush);
setTimeout(flush, 8000);
window.Notes = { add, list: load, openPanel, closePanel, flush, count: () => load().length };
