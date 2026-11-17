/* ==========================================================
   LABO (stade 2) — « Mes phrases » : le joueur montre les phrases retenues dans les livres, Tapama les décortique
   et en fait des phrases fortes à retenir ; c'est ce qui déverrouille le dispositif 2.
   ----------------------------------------------------------
   • l'événement `lab:phrases-demande` (envoyé par app/laboratoire.js, stade 2) ouvre le panneau ; le bouton « Mes phrases » de la barre le rouvre ;
   • étape 1 : les phrases de la base du drone, par livre ; le joueur en coche ou décoche, puis « Décortiquer avec Tapama » ;
     Tapama réagit (« Wow… » / « Pas mal… » / « Tu n'as rien retenu… ») avec sa voix et sa bulle du labo ;
   • étape 2 : une phrase forte par livre, à retenir ; « Continuer » envoie `lab:phrases-fortes` (le labo ouvre alors les verrous) ;
   • résultat enregistré dans taama.phrases.fortes et taama.lab2.phrases = '1'.
   Le panneau ne couvre pas la bulle de Tapama : il est en haut au centre, sans fond assombri.
   ========================================================== */
import { BOOKS } from './bibliotheque-textes.js?v=2';

const KEY_FORTES = 'taama.phrases.fortes', KEY_DONE = 'taama.lab2.phrases';
const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
};
const drone = () => store.get('taama.drone.phrases', []);
const say = (key) => window.Lab?.sayMsg?.(key);

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
function onKey(e) { if (e.code === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); } }   // Échap ne ferme pas le panneau : le labo reste à l'étape
const closePanel = () => { if (panel) { panel.remove(); panel = null; window.removeEventListener('keydown', onKey, true); } };

function shell(title, sub) {
  panel = document.createElement('div');
  panel.id = 'labPhrasesPanel';
  panel.style.cssText = 'position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:9500;width:min(760px,94vw);max-height:52vh;display:flex;flex-direction:column;font-family:system-ui,"Segoe UI",sans-serif';
  const card = document.createElement('div');
  card.style.cssText = 'background:#f6ead2;color:#2a1d15;border-radius:18px;padding:18px 24px;box-shadow:0 12px 50px rgba(0,0,0,.6);overflow:auto;max-height:52vh';
  card.innerHTML = '<h2 style="margin:0 0 4px;font-size:22px">' + title + '</h2><p style="margin:0 0 12px;color:#6f5f52">' + sub + '</p>';
  panel.appendChild(card); document.body.appendChild(panel);
  window.addEventListener('keydown', onKey, true);
  return card;
}
const button = (label, primary, fn) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
  b.style.cssText = 'padding:10px 18px;border-radius:10px;border:0;font:inherit;font-weight:700;cursor:pointer;background:' + (primary ? '#2a1d15;color:#f9d58b' : 'rgba(120,90,50,.28);color:#2a1d15');
  b.addEventListener('click', fn); return b;
};

/* étape 1 : choix des phrases */
function openPanel() {
  if (panel && panel.isConnected) return;
  panel = null;
  const sel = new Set(drone().map((p) => p.id));
  const card = shell('Mes phrases', 'Les phrases retenues dans les livres. Coche celles qui comptent, puis montre-les à Tapama.');
  const list = document.createElement('div');
  BOOKS.forEach((b) => {
    const all = b.phrases.map((txt, i) => ({ id: b.id + ':' + i, txt }));
    if (!all.some((x) => sel.has(x.id))) return;
    const h = document.createElement('h3'); h.textContent = b.id + ' · ' + b.titre; h.style.cssText = 'margin:12px 0 4px;font-size:16px;color:#8a5a14'; list.appendChild(h);
    all.forEach((x) => {
      const row = document.createElement('label'); row.style.cssText = 'display:flex;gap:10px;align-items:flex-start;padding:5px 8px;border-radius:10px;cursor:pointer';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = sel.has(x.id); cb.style.marginTop = '5px';
      cb.addEventListener('change', () => { if (cb.checked) sel.add(x.id); else sel.delete(x.id); });
      const s = document.createElement('span'); s.textContent = x.txt; s.style.lineHeight = '1.35';
      row.append(cb, s); list.appendChild(row);
    });
  });
  if (!list.children.length) { const e = document.createElement('p'); e.textContent = 'Tu n’as encore retenu aucune phrase. Va lire les livres de Barey So.'; e.style.fontStyle = 'italic'; list.appendChild(e); }
  card.appendChild(list);
  const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap';
  row.append(button('Décortiquer avec Tapama', true, () => {
    const picked = BOOKS.flatMap((b) => b.phrases.map((txt, i) => ({ id: b.id + ':' + i, livre: b.id, texte: txt }))).filter((x) => sel.has(x.id));
    decortique(picked);
  }));
  card.appendChild(row);
}

/* Tapama réagit, puis l'étape 2 montre les phrases fortes */
async function decortique(picked) {
  const n = picked.length;
  if (!n) { say('frasesRien'); return; }                                   // rien de coché : le panneau reste ouvert
  closePanel();
  say(n >= 6 ? 'frasesWow' : 'frasesPasMal');
  await (window.Lab?.whenSilent?.() || Promise.resolve());
  await new Promise((r) => setTimeout(r, 600));
  say('frasesFortes');
  const fortes = fortesFrom(picked);
  store.set(KEY_FORTES, fortes);
  try { localStorage.setItem(KEY_DONE, '1'); } catch (_) {}
  showFortes(fortes);
}

/* étape 2 : une phrase forte par livre ; « Continuer » ouvre les verrous du labo */
function showFortes(fortes) {
  closePanel();
  const card = shell('Phrases fortes', 'Une phrase par livre : c’est ce que Tapama veut que tu retiennes.');
  fortes.forEach((f) => {
    const q = document.createElement('div'); q.style.cssText = 'padding:9px 12px;margin:6px 0;border-left:4px solid #b8741a;background:rgba(253,220,140,.55);border-radius:6px';
    const ti = document.createElement('div'); ti.textContent = f.titre; ti.style.cssText = 'font-size:13px;color:#8a5a14;font-weight:700'; q.appendChild(ti);
    const t = document.createElement('div'); t.textContent = f.forte; t.style.cssText = 'font-size:17px;line-height:1.35;font-weight:600'; q.appendChild(t);
    card.appendChild(q);
  });
  const row = document.createElement('div'); row.style.cssText = 'display:flex;justify-content:flex-end;margin-top:14px';
  row.append(button('Continuer', true, () => { closePanel(); window.dispatchEvent(new CustomEvent('lab:phrases-fortes', { detail: { fortes } })); }));
  card.appendChild(row);
}

/* bouton dans la barre du laboratoire (rouvre le panneau d'étape 1) */
function addButton() {
  const root = document.getElementById('labRoot');
  if (!root || document.getElementById('labPhrasesBtn')) return;
  const top = root.querySelector('.lab-top') || root;
  const b = document.createElement('button');
  b.type = 'button'; b.id = 'labPhrasesBtn'; b.className = 'lab-btn lab-glass';
  b.textContent = 'Mes phrases'; b.style.marginLeft = '8px';
  b.addEventListener('click', openPanel);
  top.appendChild(b);
}
window.addEventListener('lab:open', (e) => { if (e.detail && e.detail.stage === 2) setTimeout(addButton, 0); });
window.addEventListener('lab:phrases-demande', () => { addButton(); setTimeout(openPanel, 400); });
window.addEventListener('lab:done', () => { document.getElementById('labPhrasesBtn')?.remove(); closePanel(); });

window.LabPhrases = { open: openPanel, fortes: () => store.get(KEY_FORTES, []), done: () => localStorage.getItem(KEY_DONE) === '1' };
