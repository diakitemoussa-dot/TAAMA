/* ==========================================================
   GUIDE « COMMENT JOUER » — point d'entrée léger (window.Guide)
   ----------------------------------------------------------
   Ce petit fichier est chargé tout de suite ; le moteur (guide-ui.js,
   guide-art.js, guide-content.js, styles/guide.css) n'est téléchargé qu'au
   premier usage ou quand une partie démarre : le démarrage mobile reste léger.

   API : Guide.open(sujet?)   écran « Comment jouer » (sujet = id de page : move, drone, car…)
         Guide.start()        l'écran, depuis la première page
         Guide.isOpen         l'écran est-il ouvert ?
         Guide.hint(id)       force un conseil en jeu (même déjà vu)
         Guide.reset()        rejoue le guide (conseils de nouveau possibles)
   Événements window : guide:open · guide:close · guide:hint {id} · guide:mode {mode}
   Ce fichier est placé AVANT game-ui.js dans index.html : son écouteur de touches passe
   en premier et empêche le jeu de réagir pendant que l'écran est ouvert.
   ========================================================== */

/** Numéro de build UNIQUE du guide : tools/bump-guide.mjs le propage dans tous les imports et feuilles de style (aucun fichier ancien en cache). */
const GUIDE_BUILD = '35';
let mod = null, loading = null;
const load = () => loading || (loading = import('./guide-ui.js?v=35').then((m) => (mod = m.default)));

window.Guide = {
  get isOpen() { return !!(mod && mod.isOpen()); },
  open: (topic) => load().then((m) => m.open(topic)),
  start: () => load().then((m) => m.start()),
  hint: (id) => load().then((m) => m.hint(id)),
  step: (i) => load().then((m) => m.step(i)),
  reset: () => load().then((m) => m.reset()),
  gate: () => !!(mod && mod.gate && mod.gate()),     // premier Entrée/A sur ce que le guide montre : ferme le guide sans agir (voir guide-ui.js)
  debug: () => (mod ? mod.debug() : { build: GUIDE_BUILD, engineLoaded: false, reason: 'moteur pas encore chargé (pas en partie)' }),
  build: GUIDE_BUILD,
  load,
};

window.addEventListener('keydown', (e) => { if (mod && mod.isOpen()) mod.onKey(e); }, true);

// Le petit moteur des conseils essentiels (drone, pilotage, marche) se charge TOUJOURS, même en économie de données ou en 2G :
// seuls les gros dessins animés peuvent attendre (voir guide-ui.js, lowData).
// conseils en jeu : le petit moteur est chargé dès qu'une partie commence (pas avant) ; l'écran « Comment jouer » seulement à l'ouverture
const wait = setInterval(() => {
  const gu = window.GameUI;
  if (!(gu && gu.isInGame && gu.isInGame())) return;
  clearInterval(wait);
  load();                                                   // tout de suite : la démo du dialogue d'ouverture doit pouvoir s'afficher
}, 300);

// menu principal : la toute première fois, la démo « choisir dans un menu » (le moteur est chargé seulement si elle n'a jamais été vue)
const menuWait = setInterval(() => {
  const gu = window.GameUI;
  if (gu && gu.isInGame && gu.isInGame()) { clearInterval(menuWait); return; }
  const sc = document.querySelector('.gu-screen.on');
  const id = sc && sc.dataset.screen === 'main' ? 'menu' : sc && sc.dataset.screen === 'nouvelle' ? 'begin' : '';
  if (!id) return;
  try { const st = JSON.parse(localStorage.getItem('taama.guide.v1') || '{}'); if (st.v === 2 && st.seen && st.seen[id]) return; } catch (_) {}
  clearInterval(menuWait);
  load();
}, 700);
