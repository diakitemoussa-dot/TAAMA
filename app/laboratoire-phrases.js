/* ==========================================================
   LABO (stade 2) — « Mes phrases » : le joueur montre les phrases retenues dans les livres,
   Tapama les décortique et en fait des phrases fortes à retenir.
   ----------------------------------------------------------
   • bouton « Mes phrases » ajouté dans la barre du laboratoire quand le stade 2 s'ouvre (événement lab:open) ;
   • interface : phrases de la base du drone, groupées par livre ; le joueur peut en cocher d'autres ;
   • « Décortiquer avec Tapama » : Tapama réagit selon le nombre de phrases, puis rassemble une phrase forte par livre ;
   • résultat enregistré dans taama.phrases.fortes et taama.lab2.phrases = '1'.
   ========================================================== */
import { BOOKS } from './bibliotheque-textes.js?v=2';

const KEY_FORTES = 'taama.phrases.fortes', KEY_DONE = 'taama.lab2.phrases';
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};
const drone = () => store.get('taama.drone.phrases', []);

function say(text, mood = 'attentive', duration = 9) {
  window.Tapama?.radio?.({ text, mood, duration });
}

/* phrase forte : la phrase la plus marquante du livre (la première retenue) ; Tapama la garde telle quelle */
function fortesFrom(selected) {
  const par = {};
  for (const p of selected) (par[p.livre] = par[p.livre] || []).push(p);
  return Object.keys(par).map(Number).sort((a, b) => a - b).map((id) => {
    const book = BOOKS.find((b) => b.id === id);
    return { livre: id, titre: book ? book.titre : 'Livre ' + id, forte: par[id][0].texte, nb: par[id].length };
  });
}

let panel = null;
function openPanel() {
  if (panel) return;
  const sel = new Set(drone().map((p) => p.id));
  panel = document.createElement('div');
  panel.id = 'labPhrasesPanel';
  panel.style.cssText = 'position:fixed;inset:0;z-index:9500;background:rgba(10,6,14,.82);display:flex;align-items:center;justify-content:center;font-family:system-ui,"Segoe UI",sans-serif';
  const card = document.createElement('div');
  card.style.cssText = 'width:min(760px,94vw);max-height:88vh;overflow:auto;background:#f6ead2;color:#2a1d15;border-radius:18px;padding:22px 26px;box-shadow:0 12px 50px rgba(0,0,0,.6)';
  card.innerHTML = '<h2 style="margin:0 0 4px;font-size:24px">Mes phrases</h2><p style="margin:0 0 14px;color:#6f5f52">Les phrases retenues dans les livres. Tu peux en cocher ou décocher avant de les montrer à Tapama.</p>';
  const list = document.createElement('div');
  BOOKS.forEach((b) => {
    const all = b.phrases.map((txt, i) => ({ id: b.id + ':' + i, txt }));
    const has = all.filter((x) => sel.has(x.id));
    if (!has.length) return;
    const h = document.createElement('h3'); h.textContent = b.id + ' · ' + b.titre; h.style.cssText = 'margin:14px 0 4px;font-size:17px;color:#8a5a14'; list.appendChild(h);
    all.forEach((x) => {
      const row = document.createElement('label'); row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:6px 8px;border-radius:10px;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.has(x.id); cb.style.marginTop = '5px';
      cb.addEventListener('change', () => { cb.checked ? sel.add(x.id) : sel.delete(x.id); });
      const s = document.createElement('span'); s.textContent = x.txt; s.style.lineHeight = '1.35';
      row.append(cb, s); list.appendChild(row);
    });
  });
  if (!list.children.length) {
    const e = document.createElement('p'); e.textContent = 'Tu n’as encore retenu aucune phrase. Va lire les livres de Barey So.'; e.style.fontStyle = 'italic'; list.appendChild(e);
  }
  card.appendChild(list);
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap';
  const btn = (label, primary, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'padding:10px 18px;border-radius:10px;border:0;font:inherit;font-weight:700;cursor:pointer;background:' + (primary ? '#2a1d15;color:#f9d58b' : 'rgba(120,90,50,.28);color:#2a1d15'); b.addEventListener('click', fn); return b; };
  const close = () => { panel && panel.remove(); panel = null; window.removeEventListener('keydown', onKey, true); };
  const decortiquer = () => {
    const picked = BOOKS.flatMap((b) => b.phrases.map((txt, i) => ({ id: b.id + ':' + i, livre: b.id, texte: txt }))).filter((x) => sel.has(x.id));
    close(); decortiqueAvecTapama(picked);
  };
  row.append(btn('Fermer', false, close), btn('Décortiquer avec Tapama', true, decortiquer));
  card.appendChild(row); panel.appendChild(card); document.body.appendChild(panel);
  const onKey = (e) => { if (e.code === 'Escape') { close(); e.stopImmediatePropagation(); e.preventDefault(); } };
  window.addEventListener('keydown', onKey, true);
}

/* Tapama : réaction, décortication, phrases fortes */
function decortiqueAvecTapama(picked) {
  const n = picked.length, livres = new Set(picked.map((p) => p.livre)).size;
  if (!n) { say('Tu n’as rien retenu pour l’instant. Repasse à la bibliothèque, {nom}, et choisis les phrases qui comptent.', 'inquiete'); return; }
  say(n >= 6 ? 'Wow, {nom} ! Tu as choisi pas mal de phrases. J’espère que ça t’a appris quelque chose : on va tout décortiquer.' : 'Pas mal, {nom} ! Tu as retenu ' + n + ' phrases. On va les décortiquer ensemble.', 'souriante', 10);
  const fortes = fortesFrom(picked);
  setTimeout(() => {
    say('Regarde : je rassemble tes phrases en phrases fortes, une par livre. C’est ce qui doit te rester en tête.', 'attentive', 10);
    store.set(KEY_FORTES, fortes);
    try { localStorage.setItem(KEY_DONE, '1'); } catch (_) {}
    window.dispatchEvent(new CustomEvent('lab:phrases-fortes', { detail: { fortes, livres } }));
  }, 10500);
}

/* bouton dans la barre du laboratoire */
function addButton() {
  const root = document.getElementById('labRoot');
  if (!root || document.getElementById('labPhrasesBtn')) return;
  const top = root.querySelector('.lab-top') || root;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'labPhrasesBtn'; b.className = 'lab-btn lab-glass';
  b.textContent = 'Mes phrases';
  b.style.marginLeft = '8px';
  b.addEventListener('click', openPanel);
  top.appendChild(b);
}
window.addEventListener('lab:open', (e) => { if (e.detail && e.detail.stage === 2) setTimeout(addButton, 0); });
window.addEventListener('lab:done', () => { document.getElementById('labPhrasesBtn')?.remove(); });

window.LabPhrases = { open: openPanel, fortes: () => store.get(KEY_FORTES, []), done: () => localStorage.getItem(KEY_DONE) === '1' };
