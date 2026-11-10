/* ==========================================================
   DOSSIER NÉANTIS — scène S8 : écran de PC de Tapama
   Tapama transfère au joueur ses recherches sur NÉANTIS
   (NÉANTIS.pdf : 4 pages) pendant que ses bulles arrivent une
   à une dans la messagerie. Tapama reste en 2D (portrait + bulles).

   API : window.Dossier = { open({ onDone }), close(), isOpen }
   Événements window : dossier:open, dossier:done
   Sauvegarde : taama.dossier = '1' (à la fin uniquement)
   Commandes : clic / Entrée / Espace / → = suivant · ← = retour
               manette : A, Y ou croix droite = suivant, B ou croix gauche = retour
   ========================================================== */
import { t } from './i18n.js?v=1';
import { fillName } from './player-profile.js?v=1';

const CSS_URL = new URL('../styles/dossier.css', import.meta.url).href + '?v=4';
const IMG = (p) => new URL('../assets/images/' + p, import.meta.url).href;
const SAVE_KEY = 'taama.dossier';

/* ---------- Données ---------- */
const MOODS = ['neutre', 'curieuse', 'inquiete', 'surprise', 'attentive', 'souriante'];
const MOOD_LABEL = { neutre: 'neutre', curieuse: 'curieuse', inquiete: 'inquiète', surprise: 'surprise', attentive: 'attentive', souriante: 'souriante' };

const PAGES = [
  { id: 'qui', tab: 'Qui sont-ils ?' },
  { id: 'pdg', tab: 'Le PDG' },
  { id: 'intentions', tab: 'Leurs intentions' },
  { id: 'robots', tab: 'Robots & base' },
];

/* Chaque étape : une page + les bulles de Tapama (texte de la bible, scène S8) */
const STEPS = [
  { page: 0, msgs: [
    { mood: 'attentive', text: 'Je te transfère tout ce que j’ai sur eux. Ça s’appelle NÉANTIS. Voilà leur logo…' } ] },
  { page: 1, msgs: [
    { mood: 'attentive', text: '… et leur patron, Adrian Voss.' } ] },
  { page: 2, msgs: [
    { mood: 'neutre', text: 'Leur devise : « Tout voir. Tout garder. Rien rendre. » Ils veulent surtout contrôler ce que ces objets montrent, pas les vendre.' } ] },
  { page: 3, msgs: [
    { mood: 'inquiete', text: 'Leurs robots patrouillent partout. Mais je ne t’envoie pas sans rien : il y a un gadget dans la voiture. Avec lui, tu pourras te défendre.' } ] },
  { page: 3, last: true, msgs: [
    { mood: 'attentive', text: 'Je t’affiche l’itinéraire de leur base. Regarde bien, et reviens-moi en un seul morceau.' } ] },
];

/* ---------- État ---------- */
let root = null, cssReady = null;
let opened = false;
let step = -1, maxSeen = -1, curPage = -1;
let runId = 0, skipping = false, busy = false;
const pend = new Set();
let onDoneCb = null;
let openedAt = 0, rafId = 0, keyHandler = null;
let actx = null;
const E = {};   // éléments

const playerName = () => {
  try { const p = window.GameUI && window.GameUI.player && window.GameUI.player(); if (p && p.name) return p.name; } catch (_) {}
  try { const p = JSON.parse(localStorage.getItem('taama.player.v1') || 'null'); if (p && p.name) return p.name; } catch (_) {}
  return '';
};
const tx = (s) => fillName(t(s), playerName());

function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

/* ---------- Son (WebAudio, facultatif et discret) ---------- */
function blip(freq = 880, dur = 0.05, vol = 0.025, type = 'square') {
  try {
    if (window.GameSettings && (window.GameSettings.effects === 0 || window.GameSettings.muteAll)) return;   // Options › Effets à 0 ou son coupé
    if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); window.GameAudio?.ctx?.(actx, 'effects'); }
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + dur + 0.02);
  } catch (_) {}
}
const sndPing = () => { blip(660, 0.09, 0.04, 'sine'); setTimeout(() => blip(990, 0.12, 0.035, 'sine'), 90); };
const sndKey = () => blip(1200 + Math.random() * 500, 0.02, 0.012);
const sndPage = () => { blip(300, 0.08, 0.03, 'triangle'); setTimeout(() => blip(520, 0.1, 0.03, 'triangle'), 70); };

/* ---------- Temporisation interruptible ---------- */
function wait(ms) {
  return new Promise((res) => {
    if (skipping) return res();
    let id;
    const done = () => { clearTimeout(id); pend.delete(done); res(); };
    id = setTimeout(done, ms);
    pend.add(done);
  });
}
function flush() { skipping = true; [...pend].forEach((f) => f()); }
function cancelRun() { runId++; skipping = false; [...pend].forEach((f) => f()); }

/* ---------- Construction du DOM ---------- */
function build() {
  root = el('div', 'ds-root');
  root.id = 'dsRoot';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', t('Dossier NÉANTIS'));
  root.innerHTML = `
  <div class="ds-desk">
    <div class="ds-win">
      <header class="ds-title">
        <span class="ds-dots" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="ds-path"><b>TAPAMA</b> › RECHERCHES › <em>NÉANTIS.pdf</em></span>
        <span class="ds-secure" aria-hidden="true">● ${t('transfert sécurisé')}</span>
      </header>
      <nav class="ds-tabs" role="tablist"></nav>
      <div class="ds-body">
        <section class="ds-doc" aria-live="polite">
          <div class="ds-load"><div class="ds-load-bar"><i></i></div><span class="ds-load-txt"></span></div>
          <div class="ds-pages"></div>
          <div class="ds-transfer" hidden>
            <img class="ds-tr-logo" src="${IMG('neantis-logo.svg')}" alt="" />
            <div class="ds-tr-file">NÉANTIS.pdf</div>
            <div class="ds-tr-bar"><i></i></div>
            <div class="ds-tr-line"></div>
          </div>
        </section>
        <aside class="ds-chat">
          <div class="ds-chat-head">
            <div class="ds-av"><img alt="" /></div>
            <div class="ds-who"><b>Tapama Traoré</b><span><i class="ds-live"></i>${t('en ligne')} · <em class="ds-mood"></em></span></div>
          </div>
          <div class="ds-msgs" aria-live="polite"></div>
          <div class="ds-actions">
            <button type="button" class="ds-btn ds-back" aria-label="${t('Retour')}">◀ ${t('Retour')}</button>
            <button type="button" class="ds-btn ds-next ds-primary"><span class="ds-next-l">${t('Continuer')}</span> ▶</button>
          </div>
          <div class="ds-hint">${t('Clic · Entrée · ✕ manette pour avancer')}</div>
        </aside>
      </div>
    </div>
    <footer class="ds-task"><span class="ds-start">◆</span><span class="ds-task-app">NÉANTIS.pdf</span><span class="ds-clock"></span></footer>
  </div>`;

  E.tabs = root.querySelector('.ds-tabs');
  E.pages = root.querySelector('.ds-pages');
  E.msgs = root.querySelector('.ds-msgs');
  E.av = root.querySelector('.ds-av img');
  try { E.faceFx = window.TapamaFace && window.TapamaFace.attach(E.av); } catch (_) {}      // visage animé (tapama-face.js)
  E.mood = root.querySelector('.ds-mood');
  E.next = root.querySelector('.ds-next');
  E.nextL = root.querySelector('.ds-next-l');
  E.back = root.querySelector('.ds-back');
  E.load = root.querySelector('.ds-load');
  E.loadBar = root.querySelector('.ds-load-bar i');
  E.loadTxt = root.querySelector('.ds-load-txt');
  E.transfer = root.querySelector('.ds-transfer');
  E.trBar = root.querySelector('.ds-tr-bar i');
  E.trLine = root.querySelector('.ds-tr-line');
  E.clock = root.querySelector('.ds-clock');

  PAGES.forEach((p, i) => {
    const b = el('button', 'ds-tab');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.innerHTML = `<span class="ds-tab-n">${i + 1}</span><span class="ds-tab-t">${t(p.tab)}</span>`;
    b.addEventListener('click', () => tabClick(i));
    E.tabs.appendChild(b);
  });

  E.pages.append(pageQui(), pagePdg(), pageIntentions(), pageRobots());
  E.next.addEventListener('click', () => { sndKey(); advance(); });
  E.back.addEventListener('click', () => { back(); });
  root.querySelector('.ds-chat').addEventListener('click', (e) => { if (!e.target.closest('button')) advance(); });
  E.pages.addEventListener('click', () => { if (busy) flush(); });

  MOODS.forEach((m) => { const i = new Image(); i.src = IMG('tapama/tapama-' + m + '.webp'); });
}

const rv = (i) => `style="--i:${i}"`;

function pageQui() {
  const p = el('article', 'ds-page ds-p-qui');
  p.dataset.page = '0';
  p.innerHTML = `
    <div class="ds-hero">
      <div class="ds-logo-wrap ds-rv" ${rv(0)}><img src="${IMG('neantis-logo.svg')}" alt="${t('Logo NÉANTIS : un N géométrique argent et bleu électrique dans un anneau')}" /></div>
      <div class="ds-hero-txt">
        <div class="ds-kick ds-rv" ${rv(1)}>${t('Dossier 01 · Organisation')}</div>
        <h2 class="ds-h ds-rv" ${rv(2)}>NÉANTIS</h2>
        <p class="ds-lead ds-rv" ${rv(3)}>${t('Organisation privée internationale. Officiellement : technologies avancées, analyse de données, recherche d’objets rares.')}</p>
        <blockquote class="ds-motto ds-rv" ${rv(4)}><span class="ds-type" data-full="${t('Tout voir. Tout garder. Rien rendre.')}"></span></blockquote>
      </div>
    </div>
    <div class="ds-cols">
      <div class="ds-card ds-rv" ${rv(5)}>
        <h3>${t('Ce qu’elle dit être')}</h3>
        <p>${t('Un centre de recherche scientifique. Sites propres, rapports polis, partenariats discrets.')}</p>
        <h3>${t('Ce qu’elle semble être')}</h3>
        <p>${t('Une direction qui veut s’approprier les informations révélées par les dispositifs. Le nom dit tout : le néant, ce qui tombe entre leurs mains disparaît des regards.')}</p>
      </div>
      <div class="ds-card ds-rv" ${rv(6)}>
        <h3>${t('Organisation')}</h3>
        <ol class="ds-org">
          <li><b>${t('Le PDG')}</b><span>${t('décide des objectifs, supervise')}</span></li>
          <li><b>${t('Le responsable d’opération')}</b><span>${t('dirige les équipes sur le terrain')}</span></li>
          <li><b>${t('Les agents')}</b><span>${t('robots : surveillent, interviennent, sécurisent')}</span></li>
          <li><b>${t('Les techniciens')}</b><span>${t('analysent les dispositifs et les données')}</span></li>
        </ol>
      </div>
    </div>`;
  return p;
}

function pagePdg() {
  const p = el('article', 'ds-page ds-p-pdg');
  p.dataset.page = '1';
  p.innerHTML = `
    <div class="ds-pdg">
      <figure class="ds-portrait ds-rv" ${rv(0)}>
        <img src="${IMG('neantis-pdg.webp')}" alt="${t('Portrait d’Adrian Voss, PDG de NÉANTIS : costume noir, détails bleu électrique')}" />
        <span class="ds-stamp">${t('CONFIDENTIEL')}</span>
        <figcaption>ADRIAN VOSS</figcaption>
      </figure>
      <div class="ds-sheet">
        <div class="ds-kick ds-rv" ${rv(1)}>${t('Dossier 02 · Directeur général')}</div>
        <h2 class="ds-h ds-rv" ${rv(2)}><span class="ds-type" data-full="Adrian Voss"></span></h2>
        <dl class="ds-dl ds-rv" ${rv(3)}>
          <div><dt>${t('Âge')}</dt><dd>48 ${t('ans')}</dd></div>
          <div><dt>${t('Fonction')}</dt><dd>${t('Directeur général de NÉANTIS')}</dd></div>
          <div><dt>${t('Signes')}</dt><dd>${t('costume noir, détails bleu électrique, touches dorées, posture droite')}</dd></div>
          <div><dt>${t('Caractère')}</dt><dd>${t('calme, stratège, très sûr de lui. Il donne des ordres précis, jamais de gestes inutiles.')}</dd></div>
          <div><dt>${t('Conviction')}</dt><dd>${t('les technologies et les informations rares doivent être contrôlées par ceux qui en ont les moyens.')}</dd></div>
        </dl>
        <blockquote class="ds-quote ds-rv" ${rv(4)}>« ${t('Une histoire que personne ne raconte n’appartient à personne. À celui qui la garde.')} »<cite>${t('citation attribuée, non vérifiée')}</cite></blockquote>
        <div class="ds-note ds-rv" ${rv(5)}><b>Tapama</b> ${t('Il ne se croit pas criminel. C’est ce qui le rend dangereux.')}</div>
      </div>
    </div>`;
  return p;
}

function pageIntentions() {
  const p = el('article', 'ds-page ds-p-int');
  p.dataset.page = '2';
  p.innerHTML = `
    <div class="ds-kick ds-rv" ${rv(0)}>${t('Dossier 03 · Intentions')}</div>
    <h2 class="ds-h ds-rv" ${rv(1)}>${t('Ce qu’ils veulent vraiment')}</h2>
    <p class="ds-lead ds-rv" ${rv(2)}>${t('Je n’ai pas tout. Voilà ce que je sais, et ce que je soupçonne, couche par couche.')}</p>
    <div class="ds-layers">
      <div class="ds-layer" data-l="1">
        <div class="ds-layer-h"><span class="ds-l-n">${t('COUCHE')} 1</span><span class="ds-l-s ok">${t('CONFIRMÉ')}</span></div>
        <div class="ds-layer-b"><b>${t('Récupérer les objets.')}</b> ${t('Ils sont arrivés avant toi au second emplacement. Ce n’est pas un hasard.')}</div>
      </div>
      <div class="ds-layer" data-l="2">
        <div class="ds-layer-h"><span class="ds-l-n">${t('COUCHE')} 2</span><span class="ds-l-s warn">${t('SOUPÇONNÉ')}</span></div>
        <div class="ds-layer-b"><b>${t('Ils savent déjà qu’il en existe d’autres.')}</b> ${t('Leurs requêtes visent des lieux que je n’ai jamais publiés. Il faudra des preuves dans leur base.')}</div>
      </div>
      <div class="ds-layer" data-l="3">
        <div class="ds-layer-h"><span class="ds-l-n">${t('COUCHE')} 3</span><span class="ds-l-s hyp">${t('HYPOTHÈSE')}</span></div>
        <div class="ds-layer-b"><b>${t('Contrôler les informations révélées.')}</b> ${t('Pas vendre : décider qui a le droit de savoir. Pourquoi ?')} <span class="ds-redact">██████ ███████ ████</span></div>
      </div>
    </div>`;
  return p;
}

function pageRobots() {
  const p = el('article', 'ds-page ds-p-rob');
  p.dataset.page = '3';
  p.innerHTML = `
    <div class="ds-kick ds-rv" ${rv(0)}>${t('Dossier 04 · Terrain')}</div>
    <h2 class="ds-h ds-rv" ${rv(1)}>${t('Robots & méthodes')}</h2>
    <div class="ds-cols ds-cols-rob">
      <div class="ds-rob-l">
        <img class="ds-robots-img ds-rv" ${rv(2)} src="${IMG('neantis-robots.svg')}" alt="${t('Trois types de robots NÉANTIS : surveillance, intervention, technique')}" />
        <ul class="ds-meth ds-rv" ${rv(3)}>
          <li><b>${t('Surveillance')}</b> ${t('scanne, alerte. Drones N : ils balaient la zone.')}</li>
          <li><b>${t('Intervention')}</b> ${t('rapide, bloque, te devance (ils arrivent toujours juste avant toi).')}</li>
          <li><b>${t('Technique')}</b> ${t('verrouille les accès, protège les données.')}</li>
        </ul>
      </div>
      <div class="ds-rob-r ds-rv" ${rv(4)}>
        <img class="ds-base-img" src="${IMG('neantis-base.svg')}" alt="${t('Schéma de la base NÉANTIS au nord-ouest de Djenné')}" />
        <div class="ds-note"><b>Tapama</b> ${t('Leur base est au nord-ouest de la ville, à l’écart du quartier historique. Un portail, des drones N, une chambre forte au fond.')}</div>
        <div class="ds-gadget"><span>🎒</span><div><b>${t('Gadget de neutralisation')}</b><small>${t('Dans la voiture. Vise un drone N, tire : il se met en veille quelques secondes.')}</small></div></div>
      </div>
    </div>`;
  return p;
}

/* ---------- Affichage des pages ---------- */
function setTabs(page) {
  [...E.tabs.children].forEach((b, i) => {
    b.classList.toggle('on', i === page);
    b.classList.toggle('seen', i <= Math.max(page, STEPS.slice(0, maxSeen + 1).reduce((m, s) => Math.max(m, s.page), 0)));
    b.setAttribute('aria-selected', i === page ? 'true' : 'false');
  });
}

async function typeEl(node, myRun, speed = 24) {
  const full = node.dataset.full || '';
  node.textContent = '';
  node.classList.add('typing');
  for (let i = 0; i < full.length; i += 2) {
    if (myRun !== runId) return;
    node.textContent = full.slice(0, i + 2);
    if (!skipping && i % 4 === 0) sndKey();
    await wait(speed);
  }
  node.textContent = full;
  node.classList.remove('typing');
}

function showPageStatic(i) {
  curPage = i;
  [...E.pages.children].forEach((p, k) => {
    const on = k === i;
    p.classList.toggle('on', on);
    p.classList.toggle('static', on);
    if (on) {
      p.querySelectorAll('.ds-type').forEach((n) => { n.textContent = n.dataset.full; n.classList.remove('typing'); });
      p.querySelectorAll('.ds-layer').forEach((l) => l.classList.add('on'));
    }
  });
  E.pages.scrollTop = 0;
  setTabs(i);
}

async function showPageAnimated(i, myRun) {
  curPage = i;
  setTabs(i);
  // barre de chargement fine
  E.load.classList.add('on');
  E.loadTxt.textContent = `${t('Ouverture page')} ${i + 1}/${PAGES.length}…`;
  sndPage();
  for (let k = 0; k <= 10; k++) {
    if (myRun !== runId) return;
    E.loadBar.style.width = (k * 10) + '%';
    await wait(40);
  }
  E.load.classList.remove('on');
  E.loadBar.style.width = '0%';
  [...E.pages.children].forEach((p, k) => {
    p.classList.toggle('on', k === i);
    p.classList.remove('static');
    if (k === i) {
      p.classList.remove('play'); void p.offsetWidth; p.classList.add('play');
      p.querySelectorAll('.ds-type').forEach((n) => { n.textContent = ''; });
      p.querySelectorAll('.ds-layer').forEach((l) => l.classList.remove('on'));
    }
  });
  E.pages.scrollTop = 0;
  const cur = E.pages.children[i];
  const tasks = [...cur.querySelectorAll('.ds-type')].map((n) => typeEl(n, myRun));
  await Promise.all(tasks);
  if (cur.classList.contains('ds-p-int')) {
    const ls = [...cur.querySelectorAll('.ds-layer')];
    for (const l of ls) {
      await wait(900);
      if (myRun !== runId) return;
      l.classList.add('on'); sndPing();
    }
  }
}

/* ---------- Messagerie ---------- */
function setMood(m) {
  const mood = MOODS.includes(m) ? m : 'neutre';
  E.av.src = IMG('tapama/tapama-' + mood + '.webp');
  E.mood.textContent = t(MOOD_LABEL[mood]);
}

function bubbleStatic(msg) {
  const b = el('div', 'ds-msg in');
  b.textContent = tx(msg.text);
  E.msgs.appendChild(b);
  return b;
}

async function sendMsg(msg, myRun) {
  setMood(msg.mood);
  const b = el('div', 'ds-msg in typing-dots');
  b.innerHTML = '<i></i><i></i><i></i>';
  E.msgs.appendChild(b);
  E.msgs.scrollTop = E.msgs.scrollHeight;
  await wait(650);
  if (myRun !== runId) return;
  const full = tx(msg.text);
  window.TapamaVoice?.line(msg.text, msg.mood, full);        // elle dit le message au moment où il s'écrit
  b.classList.remove('typing-dots');
  b.textContent = '';
  sndPing();
  for (let i = 0; i < full.length; i += 2) {
    if (myRun !== runId) return;
    b.textContent = full.slice(0, i + 2);
    E.msgs.scrollTop = E.msgs.scrollHeight;
    if (!skipping && i % 6 === 0) sndKey();
    await wait(22);
  }
  b.textContent = full;
  E.msgs.scrollTop = E.msgs.scrollHeight;
}

function renderChatUpTo(idx) {
  E.msgs.textContent = '';
  for (let s = 0; s <= idx; s++) STEPS[s].msgs.forEach(bubbleStatic);
  const last = STEPS[Math.max(0, idx)].msgs.slice(-1)[0];
  setMood(last ? last.mood : 'neutre');
  E.msgs.scrollTop = E.msgs.scrollHeight;
}

function refreshButtons() {
  const last = STEPS[step] && STEPS[step].last;
  E.nextL.textContent = last ? t('Voir l’itinéraire') : t('Continuer');
  E.next.classList.toggle('final', !!last);
  E.back.disabled = step <= 0;
}

/* ---------- Déroulé ---------- */
async function playStep(i) {
  cancelRun();
  const myRun = runId;
  step = i;
  const first = i > maxSeen;
  maxSeen = Math.max(maxSeen, i);
  refreshButtons();
  busy = true;
  E.next.classList.add('busy');
  // état précédent : on garde les bulles des étapes précédentes, on anime la nouvelle
  renderChatUpTo(i - 1 >= 0 ? i - 1 : -1 + 0);
  if (i === 0) E.msgs.textContent = '';
  const needPage = STEPS[i].page !== curPage;
  const tasks = [];
  if (needPage) tasks.push(showPageAnimated(STEPS[i].page, myRun));
  const chat = (async () => {
    await wait(needPage ? 500 : 150);
    for (const m of STEPS[i].msgs) { if (myRun !== runId) return; await sendMsg(m, myRun); }
  })();
  tasks.push(chat);
  await Promise.all(tasks);
  if (myRun !== runId) return;
  skipping = false;
  busy = false;
  E.next.classList.remove('busy');
  if (!first) return;
}

function goStatic(i) {
  cancelRun();
  step = i; maxSeen = Math.max(maxSeen, i);
  busy = false; E.next.classList.remove('busy');
  showPageStatic(STEPS[i].page);
  renderChatUpTo(i);
  refreshButtons();
}

function advance() {
  if (!opened) return;
  if (busy) { flush(); return; }
  if (step >= STEPS.length - 1) { finish(); return; }
  playStep(step + 1);
}

function back() {
  if (!opened || step <= 0) return;
  goStatic(step - 1);
}

function tabClick(pageIdx) {
  if (!opened) return;
  const idx = STEPS.findIndex((s) => s.page === pageIdx);
  if (idx < 0) return;
  // si la page n'a pas encore été racontée, on la joue ; sinon affichage immédiat (dernière étape de cette page)
  if (idx > maxSeen) { playStep(idx); return; }
  let target = idx;
  for (let k = idx; k < STEPS.length && STEPS[k].page === pageIdx && k <= maxSeen; k++) target = k;
  goStatic(target);
}

/* ---------- Transfert initial ---------- */
async function transfer(myRun) {
  E.transfer.hidden = false;
  E.transfer.classList.remove('out');
  const lines = [
    'Connexion à la messagerie de Tapama…', 'Chiffrement de bout en bout : OK',
    'Réception : NÉANTIS.pdf (4 pages)', 'Analyse du contenu…', 'Transfert terminé.'];
  sndPage();
  for (let k = 0; k <= 20; k++) {
    if (myRun !== runId) return;
    E.trBar.style.width = (k * 5) + '%';
    const li = Math.min(lines.length - 1, Math.floor(k / 4.2));
    E.trLine.textContent = '› ' + t(lines[li]);
    await wait(85);
  }
  E.transfer.classList.add('out');
  await wait(350);
  E.transfer.hidden = true;
}

async function intro() {
  cancelRun();
  const myRun = runId;
  busy = true; E.next.classList.add('busy');
  E.back.disabled = true;
  await transfer(myRun);
  if (myRun !== runId) return;
  skipping = false;
  playStep(0);
}

/* ---------- Fin ---------- */
function finish() {
  if (!opened) return;
  try { localStorage.setItem(SAVE_KEY, '1'); } catch (_) {}
  const cb = onDoneCb;
  sndPing();
  teardown();
  try { window.dispatchEvent(new CustomEvent('dossier:done')); } catch (_) {}
  if (typeof cb === 'function') { try { cb(); } catch (e) { console.error('[Dossier] onDone', e); } }
}

function teardown() {
  opened = false;
  cancelRun();
  try { window.TapamaVoice?.stop(); if (E.faceFx) E.faceFx.detach(); } catch (_) {}
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (keyHandler) { window.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
  try { window.GamepadKit && window.GamepadKit.capture(false); } catch (_) {}
  if (root) { const r = root; r.classList.add('out'); setTimeout(() => r.remove(), 300); root = null; }
  document.body.classList.remove('ds-open');
  onDoneCb = null;
}

/* ---------- Entrées ---------- */
function pollPad() {
  rafId = requestAnimationFrame(pollPad);
  const g = window.GamepadKit && window.GamepadKit.raw;
  if (!g || performance.now() - openedAt < 600) return;
  if (g.justPressed('A') || g.justPressed('Y') || g.justPressed('RIGHT') || g.justPressed('DOWN') || g.justPressed('START')) advance();
  else if (g.justPressed('B') || g.justPressed('LEFT') || g.justPressed('UP')) back();
}

function onKey(e) {
  if (!opened) return;
  const k = e.key;
  const onBtn = e.target && e.target.closest && e.target.closest('button');
  if ((k === 'Enter' || k === ' ') && onBtn) return;   // le bouton gère déjà son propre clic
  if (k === 'Enter' || k === ' ' || k === 'ArrowRight' || k === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); advance(); }
  else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); back(); }
  else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); }
}

function clockTick() {
  if (!root || !E.clock) return;
  const d = new Date();
  E.clock.textContent = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  setTimeout(clockTick, 15000);
}

/* ---------- API ---------- */
function loadCss() {
  if (cssReady) return cssReady;
  cssReady = new Promise((res) => {
    if (document.querySelector('link[data-ds-css]')) return res();
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = CSS_URL; l.dataset.dsCss = '1';
    l.onload = () => res(); l.onerror = () => res();
    document.head.appendChild(l);
  });
  return cssReady;
}

async function open(opts = {}) {
  if (opened) return;
  opened = true;                       // verrouille les doubles appels pendant le chargement du CSS
  onDoneCb = opts.onDone || null;
  await loadCss();
  if (!opened) return;
  step = -1; maxSeen = -1; curPage = -1; busy = false; skipping = false;
  build();
  document.body.appendChild(root);
  document.body.classList.add('ds-open');
  try { window.GamepadKit && window.GamepadKit.capture(true); } catch (_) {}
  openedAt = performance.now();
  keyHandler = onKey;
  window.addEventListener('keydown', keyHandler, true);
  rafId = requestAnimationFrame(pollPad);
  clockTick();
  requestAnimationFrame(() => root && root.classList.add('on'));
  try { window.dispatchEvent(new CustomEvent('dossier:open')); } catch (_) {}
  setMood('neutre');
  refreshButtons();
  E.next.focus({ preventScroll: true });
  intro();
}

function close() { if (opened) teardown(); }

window.Dossier = {
  open,
  close,
  get isOpen() { return opened; },
};
