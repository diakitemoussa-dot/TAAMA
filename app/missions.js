/* ==========================================================
   MISSIONS — « Les Gardiens de Djenné » (v2 — Chapitre 1 : 5 missions)
   ----------------------------------------------------------
   Vraies missions de jeu : briefing, objectifs à étapes, temps,
   étoiles (1-3), débriefing, grades, course d'anneaux, safari
   photo, livraison de banco.

   Interface exposée à drone-game.js (appels optionnels) :
     window.Missions.onGameEnter()              → entrée en mode GAME
     window.Missions.onGameExit()               → sortie du mode GAME
     window.Missions.tick(dt, pos, yaw, landed) → appelée chaque frame de vol
     window.Missions.onPhoto(pos)               → photo prise
     window.Missions.onEggScan()                → scan œufs terminé

   Écoute 'mosque:revealed' (mosque-viewer.js).
   Dépend de window.MosqueScene (mosqueBox, facadeTarget, facadeNormal,
   facadeDist, doorTarget, canarisTarget, viewTarget, scene).
   ========================================================== */
import * as THREE from 'three';

/* ==========================================================
   1. DONNÉES
   ========================================================== */

const CHAPTERS = [
  { n: 1, name: "L'Apprenti Pilote" },
  { n: 2, name: 'Les Secrets du Sanctuaire' },
  { n: 3, name: "L'Épreuve du Savoir" },
  { n: 4, name: 'Le Grand Crepissage' },
];

const RANKS = [
  { x: 0,   ic: '🎓', n: 'Apprenti' },
  { x: 75,  ic: '⚒️', n: 'Compagnon' },
  { x: 150, ic: '🛡️', n: 'Gardien' },
  { x: 240, ic: '👑', n: 'Grand Gardien' },
];

/* Le Maître Maçon parle au joueur dans les briefings. */
const MISSIONS = [
  {
    id: 'M01', ch: 1, icon: '🚁', title: 'Premier vol', mode: 'game', banco: 20,
    story: "Bienvenue à Djenné, apprenti. La grande fête du Crepissage approche. " +
           "Avant de veiller sur la mosquée, montre-moi que tu maîtrises ton drone : " +
           "un bon Gardien sait monter haut, tenir l'air… et se poser sans une égratignure.",
    objectives: [
      { id: 'takeoff', label: 'Décoller — atteins 10 m' },
      { id: 'land',    label: 'Atterrir en douceur' },
      { id: 'hover', star: 2, label: "Bonus · voler 30 s d'affilée" },
      { id: 'high',  star: 3, label: "Bonus · atteins 40 m d'altitude" },
    ],
    talisman: { id: 'premier-envol', icon: '🥇', name: 'Premier Envol' },
  },
  {
    id: 'M02', ch: 1, icon: '🏁', title: 'La Course du Sahel', mode: 'game', banco: 40,
    story: "Le Grand Crepissage commence toujours par le tour de veille : " +
           "on inspecte les remparts du ciel. Traverse les 8 anneaux dorés du circuit — " +
           "chaque anneau franchi passe au vert ! Les meilleurs Gardiens bouclent le tour en moins de 40 secondes.",
    objectives: [
      { id: 'race',   label: 'Traverser les 8 anneaux du circuit' },
      { id: 'silver', star: 2, label: 'Bonus · circuit en moins de 60 s' },
      { id: 'gold',   star: 3, label: 'Bonus · circuit en moins de 40 s' },
    ],
    talisman: { id: 'aigle-rapide', icon: '🏁', name: 'Aigle Rapide' },
  },
  {
    id: 'M03', ch: 1, icon: '📸', title: 'Safari Photo', mode: 'game', banco: 40,
    story: "L'œil du Gardien, c'est l'appareil photo. Ramène-moi trois clichés " +
           "pour le journal de la ville : la façade des trois tours, la grande porte, " +
           "et le toit aux canaris. Et… surprends-moi avec un bonus.",
    objectives: [
      { id: 'facade',  label: 'Photo de la façade (3 tours)' },
      { id: 'door',    label: 'Photo de la grande porte' },
      { id: 'roof',    label: 'Photo du toit aux canaris' },
      { id: 'fast',    star: 2, label: 'Bonus · les 3 photos en moins de 2 min 30' },
      { id: 'eggshot', star: 3, label: "Bonus · photo des œufs d'autruche" },
    ],
    talisman: { id: 'oeil-sahel', icon: '📸', name: 'Œil du Sahel' },
  },
  {
    id: 'M04', ch: 1, icon: '🪺', title: "Le Trésor des Tours", mode: 'game', banco: 40,
    story: "On raconte que des œufs d'autruche veillent sur le toit depuis des siècles. " +
           "Passe le radar au-dessus des tours pour vérifier leur état. " +
           "Et si tu es courageux… approche-toi pour les voir de tes propres yeux.",
    objectives: [
      { id: 'scan',  label: "Scanner les œufs au radar" },
      { id: 'close', star: 2, label: "Bonus · approche à moins de 30 m des œufs" },
      { id: 'shot',  star: 3, label: "Bonus · prends une photo des œufs" },
    ],
    talisman: { id: 'archeologue', icon: '🏺', name: 'Archéologue' },
  },
  {
    id: 'M05', ch: 1, icon: '🧱', title: "L'Urgence de la Tour", mode: 'game', banco: 60,
    story: "URGENCE ! La tour Est s'effrite avec la saison sèche. " +
           "Le Maître Maçon a besoin de deux boules de banco frais, livrées au sommet, " +
           "avant que le vent ne se lève. Récupère-les au chantier, puis file au sommet. Chaque seconde compte !",
    objectives: [
      { id: 'deliver', label: 'Livrer 2 boules de banco au sommet' },
      { id: 'silver',  star: 2, label: 'Bonus · livraison en moins de 2 min' },
      { id: 'gold',    star: 3, label: 'Bonus · livraison en moins de 1 min 20' },
    ],
    talisman: { id: 'sauveur-tour', icon: '🧱', name: 'Sauveur de la Tour' },
  },

  /* ----- Chapitre 2 — Les Secrets du Sanctuaire (5 missions à pied) ----- */
  {
    id: 'M06', ch: 2, icon: '🚪', title: 'Franchir la porte', mode: 'sanctuary', banco: 30, timer: '2:00',
    story: "Te voilà dans la maison de Dieu, Gardien. Ici, on laisse ses sandales au seuil " +
           "et son impatience dehors. Va saluer la grande porte du nord — celle des fidèles, " +
           "près de l'entrée principale — puis reviens te recueillir dans la salle de prière. " +
           "Un pas après l'autre, comme la caravane.",
    objectives: [
      { id: 'entree', label: "Scanner l'entrée principale (côté nord)" },
      { id: 'retour', label: 'Revenir dans la salle de prière' },
      { id: 'photo',  star: 2, label: "Bonus · photo de la grande porte (📷 tout près)" },
      { id: 'eclair', star: 3, label: 'Bonus · rituel bouclé en moins de 2 min' },
    ],
    talisman: { id: 'seuil-sanctuaire', icon: '🚪', name: 'Seuil du Sanctuaire' },
    hint: "Sors saluer l'entrée nord, puis reviens dans la salle de prière.",
  },
  {
    id: 'M07', ch: 2, icon: '🌙', title: 'La Veillée des tombeaux', mode: 'sanctuary', banco: 40,
    story: "Sur la terrasse reposent deux gardiens de jadis : Almany Ismaïla, grand imam du " +
           "XVIIIe siècle, et une tombe plus petite dont le nom s'est perdu. La tradition veut " +
           "qu'on vienne y demander la baraka. Analyse les deux tombeaux, puis reste un instant " +
           "en silence : la veillée appartient à ceux qui savent attendre.",
    objectives: [
      { id: 'tomb',  label: 'Scanner les grands tombeaux de la terrasse' },
      { id: 'petit', label: 'Scanner le petit tombeau' },
      { id: 'recul', star: 2, label: 'Bonus · 5 s de recueillement immobile près des tombeaux' },
      { id: 'photo', star: 3, label: 'Bonus · photo de la terrasse des tombeaux (📷)' },
    ],
    talisman: { id: 'veilleur-tombes', icon: '🌙', name: 'Veilleur des Tombes' },
    hint: 'Approche-toi tout près des deux tombes pour lancer les analyses.',
  },
  {
    id: 'M08', ch: 2, icon: '🕌', title: "La Place de l'Imam", mode: 'sanctuary', banco: 50, timer: '4:00',
    story: "Le mihrab, tourné vers La Mecque, est le cœur de la mosquée : c'est de là que " +
           "l'imam guide la prière et que, le vendredi, sa voix — la khouṭba — porte jusqu'à la " +
           "cour. Trouve la place de l'Imam, analyse-la, puis recueille-toi cinq secondes : " +
           "le silence aussi fait partie du savoir.",
    objectives: [
      { id: 'imam',    label: "Trouver et scanner la place de l'Imam" },
      { id: 'khoutba', label: 'Se recueillir 5 s au mihrab' },
      { id: 'photo',   star: 2, label: "Bonus · photo de la place de l'Imam (📷 tout près)" },
      { id: 'vite',    star: 3, label: 'Bonus · bouclé en moins de 4 min' },
    ],
    talisman: { id: 'voix-qibla', icon: '🧭', name: 'Voix de la Qibla' },
    hint: 'Le mihrab se trouve dans la salle de prière.',
  },
  {
    id: 'M09', ch: 2, icon: '⛰️', title: 'Le Toit du Monde', mode: 'sanctuary', banco: 60, timer: '2:00',
    story: "Prends le passage qui grimpe vers la terrasse : là-haut, entre les canaris d'eau " +
           "et les œufs d'autruche, tu verras Djenné comme les maçons la voient la veille du " +
           "crépissage. Monte, respire l'air du Sahel, puis redescends — éloigne-toi d'abord " +
           "de la porte du toit : elle ne s'ouvre qu'à ceux qui reviennent. " +
           "Un Gardien connaît le chemin des deux côtés.",
    objectives: [
      { id: 'roof',  label: 'Monter sur le toit par la porte du passage' },
      { id: 'floor', label: 'Redescendre par la porte du toit' },
      { id: 'photo', star: 2, label: 'Bonus · photo de Djenné depuis le toit (📷)' },
      { id: 'alerte', star: 3, label: 'Bonus · aller-retour en moins de 2 min' },
    ],
    talisman: { id: 'toit-du-monde', icon: '⛰️', name: 'Toit du Monde' },
    hint: 'La porte du passage se trouve côté est de la mosquée.',
  },
  {
    id: 'M10', ch: 2, icon: '🧭', title: 'La Ronde de Veille', mode: 'sanctuary', banco: 80, timer: '5:00',
    story: "La veille de la fête, le Gardien fait sa ronde : un regard sur chaque trésor du " +
           "sanctuaire, comme les anciens comptaient les pas autour de la mosquée. " +
           "Boucle la ronde — les tombeaux, la place de l'Imam et l'entrée — sans jamais " +
           "toucher au raccourci du menu ☰. C'est à pied qu'on mérite le titre.",
    objectives: [
      { id: 'ronde',     label: 'Boucler la ronde : analyser les 4 trésors du sanctuaire' },
      { id: 'expresse',  star: 2, label: 'Bonus · ronde bouclée en moins de 5 min' },
      { id: 'pardessus', star: 3, label: 'Bonus · ronde sans téléportation (menu ☰)' },
    ],
    talisman: { id: 'ronde-gardien', icon: '🧭', name: 'Ronde du Gardien' },
    hint: 'Les 4 analyses : tombeaux, petit tombeau, place de l’Imam et entrée.',
  },

  /* ----- Chapitres suivants — en préparation ----- */
  { id: 'M11', ch: 3, icon: '📚', title: 'Le Quiz du Patrimoine', mode: 'quiz', soon: true, banco: 60,
    story: '', objectives: [], hint: 'Réponds correctement à 5 questions.' },
  { id: 'M12', ch: 4, icon: '🛠️', title: 'Le Grand Crepissage', mode: 'game', soon: true, banco: 60,
    story: '', objectives: [], hint: 'Regarde la vidéo du crépissage et livre le banco.' },
  { id: 'M13', ch: 4, icon: '📱', title: 'Ramène la Mosquée chez toi', mode: 'ar', soon: true, banco: 40,
    story: '', objectives: [], hint: 'Place la mosquée en AR chez toi.' },
  { id: 'M14', ch: 4, icon: '🏆', title: 'Diplôme de Gardien', mode: 'quiz', soon: true, banco: 0,
    story: '', objectives: [], hint: 'Termine toutes les missions pour obtenir ton diplôme.' },
];

const MAX_STARS_CH1 = MISSIONS.filter(m => m.ch === 1).length * 3;   // 15
const OPEN_MISSIONS  = MISSIONS.filter(m => !m.soon);                // chapitres jouables
const MAX_STARS_OPEN = OPEN_MISSIONS.length * 3;                     // 30

/* ==========================================================
   2. ÉTAT + PERSISTANCE (v2 — progression remise à plat)
   ========================================================== */

const LS_KEY = 'djenne.missions.v2';

function blankState(){
  return { mode: null, banco: 0, stars: {}, best: {}, talismans: [], done: {}, prog: {} };
}
function loadState(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return blankState();
    const d = JSON.parse(raw) || {};
    return {
      mode: d.mode === 'missions' || d.mode === 'free' ? d.mode : null,
      banco: Number(d.banco) || 0,
      stars: { ...(d.stars || {}) },
      best: { ...(d.best || {}) },
      talismans: Array.isArray(d.talismans) ? d.talismans : [],
      done: { ...(d.done || {}) },
      prog: { ...(d.prog || {}) },
    };
  } catch (_) { return blankState(); }
}
let state = loadState();
function save(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
}

function missionById(id){ return MISSIONS.find(m => m.id === id) || null; }
function currentMission(){ return MISSIONS.find(m => !m.locked && !state.done[m.id]) || null; }
function currentId(){ const c = currentMission(); return c ? c.id : null; }
function prog(id){
  if (!state.prog[id]) state.prog[id] = { obj: {}, t: 0 };
  if (!state.prog[id].obj) state.prog[id].obj = {};
  return state.prog[id];
}
function objDone(id, oid){ return !!prog(id).obj[oid]; }
function rankOf(banco){
  let r = RANKS[0];
  for (const k of RANKS) if (banco >= k.x) r = k;
  return r;
}
function starSum(){ return Object.values(state.stars).reduce((a, b) => a + b, 0); }

/* Déverrouillage progressif : le Chapitre 2 s'ouvre quand le Chapitre 1 est terminé.
   Les missions « soon » (chapitres en préparation) restent verrouillées. */
function refreshLocks(){
  const ch1Done = MISSIONS.filter(m => m.ch === 1).every(m => state.done[m.id]);
  for (const m of MISSIONS) m.locked = m.soon ? true : (m.ch > 1 && !ch1Done);
}
refreshLocks();

/* ==========================================================
   3. SONS
   ========================================================== */

const sndWin   = new Audio('assets/audio/action-sound.mp3');
const sndBadge = new Audio('assets/audio/transition_sound.mp3');
sndWin.volume = 0.85;
sndBadge.volume = 0.7;
function playSnd(a){ try { a.currentTime = 0; a.play().catch(() => {}); } catch (_) {} }

/* ==========================================================
   4. INTERFACE (injectée dans #mosqueStage)
   ========================================================== */

const stage = document.getElementById('mosqueStage');

const root = document.createElement('div');
root.id = 'msRoot';
root.innerHTML = `
  <div class="ms-banner" id="msBanner">
    <div class="ms-banner-pill" id="msPill"></div>
    <div class="ms-objs" id="msObjs"></div>
    <div class="ms-timer" id="msTimer" hidden></div>
    <div class="ms-banner-hint" id="msHint"></div>
  </div>

  <div class="ms-count" id="msCount" hidden></div>

  <div class="ms-choice" id="msChoice" hidden>
    <div class="ms-choice-card">
      <div class="ms-choice-kicker">◈ LES GARDIENS DE DJENNÉ</div>
      <h2 class="ms-choice-title">Choisis ton aventure</h2>
      <p class="ms-choice-sub">Le Maître Maçon t'attend avant la fête du Grand Crepissage.</p>
      <button type="button" class="ms-choice-btn ms-choice-missions" id="msChoiceMissions">
        <span class="ms-choice-ico">📜</span>
        <span class="ms-choice-txt"><b>MISSIONS</b><i id="msChoiceInfo">10 missions · 4 chapitres</i></span>
      </button>
      <button type="button" class="ms-choice-btn" id="msChoiceFree">
        <span class="ms-choice-ico">🧭</span>
        <span class="ms-choice-txt"><b>EXPLORATION LIBRE</b><i>Drone, sanctuaire et AR — à ton rythme</i></span>
      </button>
      <p class="ms-choice-note">Tu pourras changer d'avis à tout moment (carnet 📜).</p>
    </div>
  </div>

  <div class="ms-brief" id="msBrief" hidden>
    <div class="ms-modal-card">
      <div class="ms-choice-kicker">◈ BRIEFING DE MISSION</div>
      <h2 class="ms-modal-title" id="msBriefTitle"></h2>
      <p class="ms-modal-story" id="msBriefStory"></p>
      <div class="ms-brief-objs" id="msBriefObjs"></div>
      <div class="ms-modal-rewards" id="msBriefRewards"></div>
      <button type="button" class="ms-btn-gold" id="msBriefGo">🚁 COMMENCER LA MISSION</button>
      <button type="button" class="ms-btn-ghost" id="msBriefLater">Plus tard (carnet 📜)</button>
    </div>
  </div>

  <div class="ms-debrief" id="msDebrief" hidden>
    <div class="ms-modal-card">
      <div class="ms-choice-kicker" id="msDbKicker">◈ MISSION ACCOMPLIE</div>
      <h2 class="ms-modal-title" id="msDbTitle"></h2>
      <div class="ms-stars" id="msDbStars"></div>
      <p class="ms-modal-story" id="msDbStats"></p>
      <div class="ms-modal-rewards" id="msDbRewards"></div>
      <button type="button" class="ms-btn-gold" id="msDbNext">▸ MISSION SUIVANTE</button>
      <button type="button" class="ms-btn-ghost" id="msDbClose">Continuer l'exploration</button>
    </div>
  </div>

  <div class="ms-log" id="msLog" hidden>
    <div class="ms-log-back" id="msLogBack"></div>
    <div class="ms-log-card">
      <header class="ms-log-head">
        <span class="ms-log-title">📜 CARNET DE MISSIONS</span>
        <span class="ms-log-rank" id="msLogRank">🎓 Apprenti</span>
        <span class="ms-log-banco" id="msLogBanco">⛁ 0</span>
        <button type="button" class="ms-log-close" id="msLogClose" aria-label="Fermer">✕</button>
      </header>
      <div class="ms-log-body" id="msLogBody"></div>
      <footer class="ms-log-foot">
        <button type="button" class="ms-log-mode" id="msLogMode"></button>
        <button type="button" class="ms-log-reset" id="msLogReset">↺ Réinitialiser</button>
      </footer>
    </div>
  </div>

  <div class="ms-toasts" id="msToasts"></div>
`;
if (stage) stage.appendChild(root);

const banner    = document.getElementById('msBanner');
const pillEl    = document.getElementById('msPill');
const objsEl    = document.getElementById('msObjs');
const timerEl   = document.getElementById('msTimer');
const hintEl    = document.getElementById('msHint');
const countEl   = document.getElementById('msCount');
const choice    = document.getElementById('msChoice');
const briefEl   = document.getElementById('msBrief');
const dbEl      = document.getElementById('msDebrief');
const logEl     = document.getElementById('msLog');
const logBody   = document.getElementById('msLogBody');
const logBanco  = document.getElementById('msLogBanco');
const logRank   = document.getElementById('msLogRank');
const logMode   = document.getElementById('msLogMode');
const toasts    = document.getElementById('msToasts');

/* ==========================================================
   5. TOASTS
   ========================================================== */

function addToast(html, info){
  if (!toasts) return;
  const t = document.createElement('div');
  t.className = 'ms-toast' + (info ? ' info' : '');
  t.innerHTML = html;
  toasts.appendChild(t);
  requestAnimationFrame(() => t.classList.add('on'));
  setTimeout(() => {
    t.classList.remove('on');
    setTimeout(() => t.remove(), 450);
  }, 3400);
  while (toasts.children.length > 3) toasts.firstChild.remove();
}
const toastBig  = (html) => addToast(html, false);
const toastInfo = (html) => addToast(html, true);

/* ==========================================================
   6. BANDEAU OBJECTIFS
   ========================================================== */

let inGame = false;
let _tAcc = 0;
let _tickErr = false;
let _lastTimerTxt = '';

function fmtTime(t){
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
}

function markObj(id, oid, silent){
  const p = prog(id);
  if (p.obj[oid]) return;
  p.obj[oid] = true;
  save();
  const m = missionById(id);
  const o = m && m.objectives.find(x => x.id === oid);
  if (!silent && o){
    toastInfo(`${o.star ? '☆' : '✓'} ${o.label}`);
    if (!o.star) playSnd(sndBadge);
  }
  updateBanner();
}

function renderObjectives(m){
  const p = prog(m.id);
  let h = '';
  for (const o of m.objectives){
    const ok = p.obj[o.id];
    const cls = ok ? 'done' : (o.star ? 'bonus' : '');
    let extra = '';
    if (m.id === 'M01' && o.id === 'hover') extra = ` — ${Math.min(30, Math.floor(p.t))}/30 s`;
    if (m.id === 'M02' && o.id === 'race'){
      const nRace = Array.isArray(p.rings) ? p.rings.filter(Boolean).length : Math.min(8, p.next || 0);
      extra = ` — ${nRace}/8`;
    }
    if (m.id === 'M05' && o.id === 'deliver') extra = ` — ${Math.min(2, p.delivered || 0)}/2`;
    if (m.id === 'M07' && o.id === 'recul')   extra = ` — ${Math.min(5, Math.floor(p.recul || 0))}/5 s`;
    if (m.id === 'M08' && o.id === 'khoutba') extra = ` — ${Math.min(5, Math.floor(p.khoutba || 0))}/5 s`;
    if (m.id === 'M10' && o.id === 'ronde')   extra = ` — ${sanctRondeN(p)}/4`;
    h += `<div class="ms-obj ${cls}">${ok ? '✓' : (o.star ? '☆' : '○')} ${o.label}${extra}</div>`;
  }
  return h;
}

function updateTimerUI(id, p){
  if (!timerEl) return;
  const m = missionById(id);
  const sanct = !!(m && m.mode === 'sanctuary' && !m.soon);
  const t = sanct ? (_sxId === id ? _sxT : 0) : (p ? (p.t || 0) : 0);
  const show = p && !p.finished && t > 0 && (
    sanct ? !!m.timer : (id === 'M02' || id === 'M03' || id === 'M05')
  );
  if (!show){ timerEl.hidden = true; return; }
  const goals = id === 'M02' ? ' · 🥇 <40 s · 🥈 <60 s'
              : id === 'M05' ? ' · 🥇 <1:20 · 🥈 <2:00'
              : sanct ? ' · 🥇 < ' + m.timer
              : ' · 🥈 <2:30';
  const txt = '⏱ ' + fmtTime(t) + goals;
  if (txt !== _lastTimerTxt){ timerEl.textContent = txt; _lastTimerTxt = txt; }
  timerEl.hidden = false;
}

function updateBanner(){
  if (!banner) return;
  if (state.mode !== 'missions'){ banner.classList.remove('on'); return; }
  banner.classList.add('on');

  const banco = `⛁ ${state.banco}`;
  const cur = currentMission();

  if (!cur){
    pillEl.innerHTML =
      `<span class="ms-b-ico">🏆</span><span class="ms-b-name">Aventures terminées !</span>` +
      `<span class="ms-b-banco">${banco}</span>`;
    objsEl.innerHTML = `<div class="ms-obj done">✓ ${starSum()}/${MAX_STARS_OPEN} étoiles</div>`;
    timerEl.hidden = true;
    hintEl.textContent = 'La suite (quiz, crépissage, AR, diplôme) arrive bientôt — continue à explorer !';
    return;
  }

  pillEl.innerHTML =
    `<span class="ms-b-ico">${cur.icon}</span>` +
    `<span class="ms-b-name">${cur.id} · ${cur.title}</span>` +
    `<span class="ms-b-banco">${banco}</span>`;
  objsEl.innerHTML = renderObjectives(cur);
  updateTimerUI(cur.id, prog(cur.id));

  let h = '';
  if (cur.mode === 'game' && !inGame) h = 'Lance le mode GAME (bouton en bas à gauche) — ou ouvre le briefing 📖 depuis le carnet.';
  if (cur.mode === 'sanctuary' && !(window.SanctuaryMode && window.SanctuaryMode.isActive())){
    h = 'Ouvre le briefing 📖 (carnet 🥇) ou entre dans le sanctuaire pour commencer.';
  }
  hintEl.textContent = h;
}

/* ==========================================================
   7. OBJETS 3D (anneaux, balise, balle de banco)
   ========================================================== */

let Z = null;
let _eggC = null;

function eggCenter(){
  const M = window.MosqueScene;
  if (!M || !M.scene) return null;
  if (!_eggC){
    M.scene.traverse((o) => {
      if (!_eggC && o.isMesh && /Oeufs_Autruche/i.test(o.name || '')){
        _eggC = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      }
    });
  }
  return _eggC;
}

function zones(){
  const M = window.MosqueScene;
  if (!M || !M.mosqueBox || M.mosqueBox.isEmpty()) return null;
  if (!Z){
    const box = M.mosqueBox;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    const R = Math.max(60, Math.max(s.x, s.z) * 0.85);
    const diag = Math.max(s.x, s.y, s.z);
    const fN = M.facadeNormal || new THREE.Vector3(0, 0, 1);
    const fD = M.facadeDist || 120;
    const pickup = M.facadeTarget.clone().addScaledVector(fN, fD * 0.55);
    pickup.y = box.min.y + 2;
    Z = {
      c, s, R, minY: box.min.y, maxY: box.max.y,
      facade: { p: M.facadeTarget.clone(), r: fD * 1.5 },
      door:   { p: (M.doorTarget || c).clone(), r: Math.max(24, diag * 0.45) },
      roof:   { p: (M.canarisTarget || new THREE.Vector3(c.x, box.max.y, c.z)).clone(), r: Math.max(30, diag * 0.55) },
      eggs:   { p: null, r: Math.max(30, diag * 0.6) },
      pickup,
      deliver: new THREE.Vector3(c.x, box.max.y + 24, c.z),
    };
  }
  const e = eggCenter();
  if (e && !Z.eggs.p) Z.eggs.p = e.clone();
  return Z;
}

/* ---------- Anneaux du circuit (M02) ---------- */
let rings = [];
let ringsBuilt = false;

function makeNumberSprite(n){
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const ctx = cv.getContext('2d');
  ctx.font = '700 88px Orbitron, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f9d58b';
  ctx.shadowColor = '#f9d58b';
  ctx.shadowBlur = 18;
  ctx.fillText(String(n), 64, 70);
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(9, 9, 1);
  sp.position.set(0, 22, 0);
  sp.raycast = () => {};
  return sp;
}

function applyRingState(r, st){
  const c = st === 'done' ? 0x74e6a4 : 0xf9d58b;   // validé = vert bien visible
  r.mat.color.set(c);
  r.mat2.color.set(c);
  r.mat.opacity  = st === 'done' ? 0.42 : st === 'next' ? 0.98 : 0.30;
  r.mat2.opacity = st === 'done' ? 0.10 : st === 'next' ? 0.22 : 0.10;
}

function buildRings(){
  if (ringsBuilt) return;
  const z = zones();
  const M = window.MosqueScene;
  if (!z || !M) return;

  // Ne jamais placer un anneau au-delà de la barrière invisible de vol (dôme × 0.62)
  const barrier = (M.domeRadius || 600) * 0.62;
  const rMax = Math.max(40, barrier * 0.92);

  for (let i = 0; i < 8; i++){
    const th = i * Math.PI / 4;
    const rad = Math.min((i % 2 === 0) ? z.R * 0.92 : z.R * 1.35, rMax);   // slalom
    const y = z.maxY + 14 + (i % 3) * 9;

    const g = new THREE.Group();
    g.name = 'MS_Ring';

    const mat  = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.3, depthWrite: false });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(14, 0.9, 10, 48), mat);
    torus.raycast = () => {};
    g.add(torus);

    const mat2 = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.RingGeometry(14.6, 17.2, 48), mat2);
    halo.raycast = () => {};
    g.add(halo);

    g.add(makeNumberSprite(i + 1));

    g.position.set(z.c.x + Math.cos(th) * rad, y, z.c.z + Math.sin(th) * rad);
    g.rotation.y = -th;                                    // anneau face au sens du circuit
    g.visible = false;
    M.scene.add(g);
    rings.push({ group: g, mat, mat2, center: g.position.clone() });
  }
  ringsBuilt = true;
}

function refreshRings(){
  const need = state.mode === 'missions' && inGame && currentId() === 'M02';
  if (need && !ringsBuilt) buildRings();
  if (!ringsBuilt) return;
  for (const r of rings) r.group.visible = need;
}

/* ---------- Balise d'objectif (colonne de lumière) ---------- */
let beacon = null;
let beaconBuilt = false;

function buildBeacon(){
  if (beaconBuilt) return;
  const M = window.MosqueScene;
  if (!M) return;
  beaconBuilt = true;
  beacon = new THREE.Group();
  beacon.name = 'MS_Beacon';

  const colMat = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide });
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 80, 12, 1, true), colMat);
  cyl.position.y = 40;
  cyl.raycast = () => {};
  beacon.add(cyl);

  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(6, 7.4, 40), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 1.2;
  ring.raycast = () => {};
  beacon.add(ring);

  beacon.userData = { ringMat, ring };
  beacon.visible = false;
  M.scene.add(beacon);
}

function beaconTargetFor(cur){
  if (!cur) return null;
  if (cur.id === 'M03'){
    const z = zones(); if (!z) return null;
    const p = prog('M03');
    for (const [k, t] of [['facade', z.facade], ['door', z.door], ['roof', z.roof]]){
      if (!p.obj[k] && t.p) return t.p;
    }
    return null;
  }
  if (cur.id === 'M04'){
    const z = zones(); return (z && z.eggs.p) || null;
  }
  if (cur.id === 'M05'){
    const z = zones(); if (!z) return null;
    const p = prog('M05');
    if (p.delivered >= 2) return null;
    return p.carrying ? z.deliver : z.pickup;
  }
  return null;
}

function refreshBeacon(){
  const cur = currentMission();
  const show = state.mode === 'missions' && inGame && cur &&
               (cur.id === 'M03' || cur.id === 'M04' || cur.id === 'M05');
  if (show && !beaconBuilt) buildBeacon();
  if (beaconBuilt){
    const target = show ? beaconTargetFor(cur) : null;
    beacon.visible = !!target;
    if (target) beacon.position.copy(target);
  }
  refreshBall();
}

/* ---------- Balle de banco (M05) ---------- */
let ball = null;
let ballBuilt = false;
let ballBaseY = 0;

function buildBall(){
  if (ballBuilt) return;
  const M = window.MosqueScene;
  if (!M) return;
  ballBuilt = true;
  ball = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xa9743f, roughness: 0.85, emissive: 0x3a220c, emissiveIntensity: 0.6 })
  );
  ball.name = 'MS_Ball';
  ball.raycast = () => {};
  ball.visible = false;
  M.scene.add(ball);
}

function refreshBall(){
  const cur = currentMission();
  const p = prog('M05');
  const need = state.mode === 'missions' && inGame && cur && cur.id === 'M05' && p.delivered < 2;
  if (need && !ballBuilt) buildBall();
  if (!ballBuilt) return;
  if (!need){ ball.visible = false; return; }
  if (!p.carrying){
    const z = zones();
    if (z){
      ball.position.copy(z.pickup);
      ballBaseY = z.pickup.y + 5;
      ball.position.y = ballBaseY;
    }
  }
  ball.visible = true;
}

function animateSceneHelpers(){
  if (beaconBuilt && beacon.visible){
    const ud = beacon.userData;
    ud.ringMat.opacity = 0.35 + 0.25 * Math.sin(_tAcc * 3);
    ud.ring.rotation.z += 0.02;
  }
  if (ballBuilt && ball.visible && !prog('M05').carrying){
    ball.position.y = ballBaseY + Math.sin(_tAcc * 2) * 1.2;
  }
}

/* ==========================================================
   8. LOGIQUE PAR MISSION
   ========================================================== */

function tickM01(dt, pos, landed, p){
  const z = zones(); if (!z) return;
  const alt = pos.y - z.c.y;

  if (!p.obj.takeoff && alt >= 10){ markObj('M01', 'takeoff'); }

  if (p.obj.takeoff && !p.obj.land && landed === true){
    markObj('M01', 'land');
  }

  if (p.obj.takeoff && landed !== true && !p.obj.hover){
    p.t += dt;
    const sec = Math.floor(p.t);
    if (sec !== p._shown){ p._shown = sec; if (sec > 0) updateBanner(); }
    if (p.t >= 30){ save(); markObj('M01', 'hover'); }
  }

  if (!p.obj.high && alt >= 40){ markObj('M01', 'high'); }

  if (p.obj.takeoff && p.obj.land) complete('M01');
}

/* Migration douce : ancien format p.next → tableau d'anneaux validés */
function ensureRingsState(p){
  if (Array.isArray(p.rings) && p.rings.length === 8) return;
  p.rings = new Array(8).fill(false);
  const n = Math.min(8, Math.max(0, p.next || 0));
  for (let i = 0; i < n; i++) p.rings[i] = true;
}

function finishRaceM02(p, final){
  p.finished = true;
  if (p.t < 40) markObj('M02', 'gold', true);
  if (p.t < 60) markObj('M02', 'silver', true);
  const best = state.best.M02;
  state.best.M02 = best ? Math.min(best, p.t) : p.t;
  save();
  toastBig(final);
  complete('M02');
}

function tickM02(dt, pos, p){
  if (!p.started || p.finished) return;
  p.t += dt;

  if (!ringsBuilt) buildRings();
  if (!ringsBuilt) return;
  ensureRingsState(p);
  if (p.rings.every(Boolean)){
    save();
    finishRaceM02(p, `🏁 CIRCUIT TERMINÉ ! ⏱ ${fmtTime(p.t)}`);
    return;
  }

  /* Validation libre : TOUT anneau traversé passe au vert (peu importe l'ordre).
     L'anneau restant le plus proche pulse pour guider le pilote. */
  const R_PASS = 18;
  let changed = false;
  for (let i = 0; i < rings.length; i++){
    if (p.rings[i]) continue;
    if (pos.distanceTo(rings[i].center) < R_PASS){
      p.rings[i] = true;
      changed = true;
      playSnd(sndBadge);
      const n = p.rings.filter(Boolean).length;
      if (n >= 8){
        save();
        finishRaceM02(p, `🏁 CIRCUIT TERMINÉ ! ⏱ ${fmtTime(p.t)}`);
        return;
      }
      toastInfo(`⭕ Anneau ${i + 1} validé ! (${n}/8)`);
    }
  }
  if (changed){ save(); updateBanner(); }

  /* Apparence : prochain conseillé = anneau restant le plus proche */
  let nearest = -1, nd = Infinity;
  for (let i = 0; i < rings.length; i++){
    if (p.rings[i]) continue;
    const d = pos.distanceTo(rings[i].center);
    if (d < nd){ nd = d; nearest = i; }
  }
  for (let i = 0; i < rings.length; i++){
    const st = p.rings[i] ? 'done' : (i === nearest ? 'next' : 'todo');
    applyRingState(rings[i], st);
    rings[i].group.scale.setScalar(st === 'next' ? 1 + 0.06 * Math.sin(_tAcc * 5) : 1);
  }
}

function tickM03(dt, p){
  if (p.started) p.t += dt;
}

function tickM04(dt, pos, p){
  const z = zones();
  const e = z && z.eggs.p;
  if (e && !p.obj.close && pos.distanceTo(e) < 30) markObj('M04', 'close');
}

function tickM05(dt, pos, p){
  const z = zones(); if (!z) return;

  if (p.started && !p.finished) p.t += dt;

  if (!p.carrying && (p.delivered || 0) < 2){
    if (pos.distanceTo(z.pickup) < 28){
      p.carrying = true;
      if (!p.started){ p.started = true; p.t = 0; }
      save();
      playSnd(sndBadge);
      toastInfo('🟤 Boule de banco récupérée ! File au sommet !');
      refreshBeacon();
      updateBanner();
    }
  }

  if (p.carrying){
    if (ballBuilt && ball.visible){
      ball.position.set(pos.x, pos.y - 2.6, pos.z);
    }
    if (pos.distanceTo(z.deliver) < 30){
      p.carrying = false;
      p.delivered = (p.delivered || 0) + 1;
      playSnd(sndWin);
      if (p.delivered >= 2){
        p.finished = true;
        if (p.t < 80) markObj('M05', 'gold', true);
        if (p.t < 120) markObj('M05', 'silver', true);
        save();
        complete('M05');
      } else {
        save();
        toastInfo('✔ Livraison 1/2 ! Encore une boule — retourne au chantier !');
        refreshBeacon();
        updateBanner();
      }
    }
  }
}

/* ---------------------------------------------------------- */

function tick(dt, pos, yaw, landed){
  if (state.mode !== 'missions' || !pos) return;
  try {
    _tAcc += dt;
    animateSceneHelpers();

    const cur = currentMission();
    if (!cur){ refreshRings(); refreshBeacon(); return; }
    const p = prog(cur.id);
    updateTimerUI(cur.id, p);

    switch (cur.id){
      case 'M01': tickM01(dt, pos, landed, p); break;
      case 'M02': tickM02(dt, pos, p); break;
      case 'M03': tickM03(dt, p); break;
      case 'M04': tickM04(dt, pos, p); break;
      case 'M05': tickM05(dt, pos, p); break;
    }
  } catch (e){
    if (!_tickErr){ _tickErr = true; console.error('Missions tick error:', e); }
  }
}

function onPhoto(pos){
  if (state.mode !== 'missions' || !pos) return;
  const cur = currentMission();
  if (!cur) return;
  if (cur.id === 'M03') onPhotoM03(pos);
  else if (cur.id === 'M04') onPhotoM04(pos);
}

function onPhotoM03(pos){
  const z = zones(); if (!z) return;
  const p = prog('M03');
  if (!p.started){ p.started = true; p.t = 0; save(); }

  const targets = [['facade', z.facade], ['door', z.door], ['roof', z.roof]];
  let best = null, bestScore = Infinity;
  for (const [key, t] of targets){
    if (p.obj[key] || !t || !t.p) continue;
    const sc = pos.distanceTo(t.p) / t.r;
    if (sc < 1 && sc < bestScore){ best = key; bestScore = sc; }
  }

  if (z.eggs.p && !p.obj.eggshot && pos.distanceTo(z.eggs.p) < z.eggs.r){
    markObj('M03', 'eggshot');
  }

  if (best){
    markObj('M03', best, true);
    playSnd(sndBadge);
    const n = ['facade', 'door', 'roof'].filter(k => p.obj[k]).length;
    if (n >= 3){
      if (p.t < 150) markObj('M03', 'fast', true);
      complete('M03');
    } else {
      const nm = { facade: 'façade', door: 'grande porte', roof: 'toit aux canaris' };
      toastInfo(`📸 Photo ${nm[best]} ✓ (${n}/3)`);
      updateBanner();
    }
  } else if (Date.now() - _photoWarn > 5000){
    _photoWarn = Date.now();
    toastInfo('📸 Rien à photographier ici… Vise la façade, la porte ou le toit !');
  }
  refreshBeacon();
}
let _photoWarn = 0;

function onPhotoM04(pos){
  const z = zones();
  if (!z || !z.eggs.p) return;
  const p = prog('M04');
  if (!p.obj.shot && pos.distanceTo(z.eggs.p) < z.eggs.r){
    markObj('M04', 'shot');
  }
}

function onEggScan(){
  if (state.mode !== 'missions') return;
  const cur = currentMission();
  if (cur && cur.id === 'M04' && !objDone('M04', 'scan')){
    markObj('M04', 'scan');
    complete('M04');
  }
}

function onGameEnter(){
  inGame = true;
  refreshRings();
  refreshBeacon();
  updateBanner();
  const cur = currentMission();
  if (cur && cur.id === 'M02'){
    const p = prog('M02');
    if (!p.started && !p.finished) runCountdown(() => {
      p.started = true;
      save();
      toastInfo('🏁 GO ! Traverse les 8 anneaux — chaque anneau franchi passe au vert !');
    });
  }
}

function onGameExit(){
  inGame = false;
  refreshRings();
  refreshBeacon();
  updateBanner();
}

/* ==========================================================
   8 bis. MISSIONS DU SANCTUAIRE (à pied, avec le personnage)
   ----------------------------------------------------------
   Le mode sanctuaire (sanctuary-mode.js) signale ses événements :
     Missions.onSanctuaryEnter() / onSanctuaryExit()
     Missions.onSanctuaryTick(dt, pos, { inside, tomb })
     Missions.onSanctuaryEvent('scan',   'tomb'|'petit'|'imam'|'entree')
     Missions.onSanctuaryEvent('portal', 'roof'|'floor')
     Missions.onSanctuaryEvent('photo',  { x, y, z })
     Missions.onSanctuaryEvent('visit',  'interior'|'exterior')  (menu ☰)
   ========================================================== */

const SANCT_PHOTO_R = { M06: 14, M07: 14, M08: 9 };   // portée du bonus photo (m)

let   _sxT = 0;          // chrono de la mission sanctuaire en cours (temps de jeu)
let   _sxId = null;      // id de la mission chronométrée
let   _haveLastPos = false;
const _lastPos = new THREE.Vector3();

function sanctSpots(){
  try { return window.SanctuaryMode?.spots?.() || null; } catch (_) { return null; }
}
function sanctScans(p){ return p.scans || (p.scans = {}); }
function sanctRondeN(p){ return ['tomb','petit','imam','entree'].filter(k => sanctScans(p)[k]).length; }

function finishSanct(m){
  const p = prog(m.id);
  if (p.finished || state.done[m.id]) return;
  p.finished = true;
  const t = _sxId === m.id ? _sxT : 0;
  if (m.id === 'M06' && t > 0 && t < 120) markObj('M06', 'eclair', true);
  if (m.id === 'M08' && t > 0 && t < 240) markObj('M08', 'vite', true);
  if (m.id === 'M09' && t > 0 && t < 120) markObj('M09', 'alerte', true);
  if (m.id === 'M10'){
    if (t > 0 && t < 300) markObj('M10', 'expresse', true);
    if (p.notel !== false) markObj('M10', 'pardessus', true);
  }
  save();
  playSnd(sndWin);
  complete(m.id);
}

function onSanctuaryEnter(){ _haveLastPos = false; updateBanner(); }
function onSanctuaryExit(){  _haveLastPos = false; updateBanner(); }

function onSanctuaryTick(dt, pos, info){
  if (state.mode !== 'missions' || !pos || !dt) return;
  const cur = currentMission();
  if (!cur || cur.mode !== 'sanctuary' || cur.soon) return;
  const p = prog(cur.id);

  /* Chrono : repart de zéro à chaque nouvelle mission sanctuaire */
  if (_sxId !== cur.id){ _sxId = cur.id; _sxT = 0; }
  if (!p.finished) _sxT += dt;

  /* Vitesse du personnage (pour les temps de recueillement) */
  let speed = 0;
  if (_haveLastPos && dt > 0) speed = _lastPos.distanceTo(pos) / dt;
  _lastPos.copy(pos); _haveLastPos = true;

  if (p.finished) return;
  const inf = info || {};

  if (cur.id === 'M06'){
    if (p.obj.entree && !p.obj.retour && inf.inside) markObj('M06', 'retour');
    if (p.obj.entree && p.obj.retour) finishSanct(cur);
    return;
  }

  if (cur.id === 'M07' && !p.obj.recul){
    const sp = sanctSpots();
    const c  = inf.tomb || (sp && (sp.tomb || sp.petit));
    if (c){
      if (pos.distanceTo(c) < 6 && speed < 0.5){
        p.recul = (p.recul || 0) + dt;
        if (p.recul >= 5){ save(); markObj('M07', 'recul'); }
        else { const s = Math.floor(p.recul); if (s !== p._reculShown){ p._reculShown = s; updateBanner(); } }
      } else p.recul = 0;
    }
    return;
  }

  if (cur.id === 'M08' && !p.obj.khoutba){
    const sp = sanctSpots();
    const c  = sp && sp.imam;
    if (c){
      if (pos.distanceTo(c) < 5 && speed < 0.5){
        p.khoutba = (p.khoutba || 0) + dt;
        if (p.khoutba >= 5){
          save(); markObj('M08', 'khoutba');
          if (p.obj.imam) finishSanct(cur);
        } else { const s = Math.floor(p.khoutba); if (s !== p._khoutbaShown){ p._khoutbaShown = s; updateBanner(); } }
      } else p.khoutba = 0;
    }
    return;
  }

  if (cur.id === 'M10'){
    /* La ronde se valide par les analyses (voir onSanctuaryEvent). */
  }
}

function onSanctuaryEvent(kind, data){
  if (state.mode !== 'missions') return;
  const cur = currentMission();
  if (!cur || cur.mode !== 'sanctuary' || cur.soon) return;
  const p = prog(cur.id);
  if (p.finished) return;

  if (kind === 'scan'){
    if (cur.id === 'M06' && data === 'entree') markObj('M06', 'entree');
    if (cur.id === 'M07'){
      if (data === 'tomb')  markObj('M07', 'tomb');
      if (data === 'petit') markObj('M07', 'petit');
      if (p.obj.tomb && p.obj.petit) finishSanct(cur);
    }
    if (cur.id === 'M08' && data === 'imam'){
      markObj('M08', 'imam');
      if (p.obj.khoutba) finishSanct(cur);
    }
    if (cur.id === 'M10' && ['tomb','petit','imam','entree'].includes(data)){
      const sc = sanctScans(p);
      if (!sc[data]){ sc[data] = true; save(); }
      const n = sanctRondeN(p);
      if (n >= 4){ markObj('M10', 'ronde'); finishSanct(cur); }
      else { toastInfo(`🧭 Ronde : ${n}/4 trésors analysés`); updateBanner(); }
    }
    return;
  }

  if (kind === 'portal' && cur.id === 'M09'){
    if (data === 'roof') markObj('M09', 'roof');
    else if (data === 'floor' && p.obj.roof){ markObj('M09', 'floor'); finishSanct(cur); }
    return;
  }

  if (kind === 'photo' && data){
    if (cur.id === 'M09'){
      if (data.y > 14) markObj('M09', 'photo');
      return;
    }
    const r = SANCT_PHOTO_R[cur.id];
    if (!r) return;
    const sp = sanctSpots();
    const target = cur.id === 'M06' ? sp && sp.entree
                 : cur.id === 'M07' ? sp && (sp.tomb || sp.petit)
                 : cur.id === 'M08' ? sp && sp.imam
                 : null;
    if (target){
      const dx = data.x - target.x, dy = data.y - target.y, dz = data.z - target.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) <= r) markObj(cur.id, 'photo');
    }
    return;
  }

  if (kind === 'visit' && cur.id === 'M10' && p.notel !== false){
    p.notel = false;
    save();
    if (!p._notelWarned){
      p._notelWarned = true;
      toastInfo('🧭 Raccourci utilisé — le bonus « ronde sans téléportation » est perdu.');
    }
  }
}

/* ==========================================================
   9. FIN DE MISSION : étoiles, grades, débriefing
   ========================================================== */

function computeStars(m){
  let s = 1;
  for (const o of m.objectives) if (o.star && objDone(m.id, o.id)) s++;
  return Math.min(3, s);
}

function complete(id){
  const m = missionById(id);
  if (!m || state.done[id]) return;

  state.done[id] = true;
  refreshLocks();
  const stars = computeStars(m);
  state.stars[id] = Math.max(state.stars[id] || 0, stars);
  const prevRank = rankOf(state.banco);
  state.banco += m.banco || 0;
  const newRank = rankOf(state.banco);
  if (m.talisman && !state.talismans.includes(m.talisman.id)) state.talismans.push(m.talisman.id);
  save();

  if (newRank.n !== prevRank.n){
    setTimeout(() => { playSnd(sndBadge); toastBig(`🎖 PROMOTION — ${newRank.ic} ${newRank.n} !`); }, 3800);
  }
  if (id === 'M05'){
    setTimeout(() => { playSnd(sndBadge); toastBig('🕌 CHAPITRE 2 DÉBLOQUÉ — Les Secrets du Sanctuaire !'); }, 4600);
  }

  refreshRings();
  refreshBeacon();
  updateBanner();
  updateLog();
  updateChoiceInfo();

  if (inGame){
    setTimeout(() => { try { window.DroneGame?.exit?.(); } catch (_) {} }, 1200);
  }
  setTimeout(() => showDebrief(m, stars), inGame ? 2100 : 700);
}

function starSpans(stars){
  let h = '';
  for (let i = 0; i < 3; i++){
    h += `<span class="${i < stars ? 'lit' : 'dim'}" style="animation-delay:${0.3 + i * 0.4}s">★</span>`;
  }
  return h;
}

function showDebrief(m, stars){
  const next = currentMission();
  const p = prog(m.id);

  document.getElementById('msDbKicker').textContent = '◈ MISSION ACCOMPLIE';
  document.getElementById('msDbTitle').textContent = `${m.icon} ${m.id} · ${m.title}`;
  document.getElementById('msDbStars').innerHTML = starSpans(stars);

  let stats = '';
  if (m.id === 'M02' && p.t > 0){
    stats = `🏁 Ton temps : <b>${fmtTime(p.t)}</b>`;
    if (state.best.M02) stats += ` · Record : ${fmtTime(state.best.M02)}`;
  } else if (m.id === 'M05' && p.t > 0){
    stats = `⏱ Livraison bouclée en <b>${fmtTime(p.t)}</b>`;
  } else if (m.mode === 'sanctuary' && _sxId === m.id && _sxT > 0){
    stats = `🕌 Rituel bouclé en <b>${fmtTime(_sxT)}</b>`;
  } else if (m.id === 'M03' && p.t > 0){
    stats = `📸 Safari bouclé en <b>${fmtTime(p.t)}</b>`;
  } else {
    stats = stars === 3 ? 'Sans faute, Gardien. Le Maître Maçon est impressionné.'
          : stars === 2 ? 'Bel exploit. Tu peux viser les 3 étoiles en rejouant la mission.'
          : 'Mission remplie. Retente-la pour décrocher plus d\'étoiles !';
  }
  document.getElementById('msDbStats').innerHTML = stats;

  let rw = `+${m.banco} ⛁`;
  if (m.talisman) rw += ` · 🏅 ${m.talisman.name}`;
  document.getElementById('msDbRewards').innerHTML = rw;

  const nextBtn = document.getElementById('msDbNext');
  const closeBtn = document.getElementById('msDbClose');
  if (next){
    nextBtn.hidden = false;
    nextBtn.textContent = '▸ MISSION SUIVANTE';
  } else {
    nextBtn.hidden = true;
    document.getElementById('msDbKicker').textContent = '◈ CHAPITRES DISPONIBLES TERMINÉS';
    document.getElementById('msDbTitle').textContent = '🏆 Bravo, Gardien !';
    document.getElementById('msDbStats').innerHTML =
      `${starSum()}/${MAX_STARS_OPEN} étoiles · ${state.talismans.length} talismans · ⛁ ${state.banco} au total<br>` +
      `<i>La suite arrive bientôt : quiz du patrimoine, vidéo du crépissage, AR et diplôme…</i>`;
    closeBtn.textContent = "Continuer l'exploration";
  }

  dbEl.hidden = false;
  requestAnimationFrame(() => dbEl.classList.add('on'));
}

function hideDebrief(){
  dbEl.classList.remove('on');
  setTimeout(() => { dbEl.hidden = true; }, 350);
}

/* ==========================================================
   10. BRIEFING, CHOIX, CARNET
   ========================================================== */

let _briefId = null;

function showBrief(m){
  if (!m || !m.story) return;
  _briefId = m.id;
  document.getElementById('msBriefTitle').textContent = `${m.icon} ${m.id} · ${m.title}`;
  document.getElementById('msBriefStory').textContent = m.story;
  document.getElementById('msBriefObjs').innerHTML = m.objectives.map(o =>
    `<div class="ms-brief-obj ${o.star ? 'bonus' : ''}"><span>${o.star ? '☆' : '●'}</span>${o.label}</div>`
  ).join('');
  document.getElementById('msBriefRewards').innerHTML =
    `Récompense : <b>+${m.banco} ⛁</b>${m.talisman ? ` · 🏅 ${m.talisman.name}` : ''}`;
  const go = document.getElementById('msBriefGo');
  go.textContent = m.mode === 'game' ? '🚁 COMMENCER LA MISSION'
    : m.mode === 'sanctuary' ? '🚪 ENTRER DANS LE SANCTUAIRE'
    : 'COMMENCER';
  briefEl.hidden = false;
  requestAnimationFrame(() => briefEl.classList.add('on'));
}
function hideBrief(){
  briefEl.classList.remove('on');
  setTimeout(() => { briefEl.hidden = true; }, 350);
}

function updateChoiceInfo(){
  const info = document.getElementById('msChoiceInfo');
  if (!info) return;
  const cur = currentMission();
  const doneN = Object.keys(state.done).filter(k => { const m = missionById(k); return m && !m.soon; }).length;
  if (state.mode === 'missions' && cur){
    info.textContent = `Reprendre : ${cur.id} · ${cur.title} — ⛁ ${state.banco}`;
  } else if (!cur){
    info.textContent = `Aventures terminées · ⭐ ${starSum()}/${MAX_STARS_OPEN} · ⛁ ${state.banco}`;
  } else {
    info.textContent = `${doneN}/${OPEN_MISSIONS.length} missions · ⭐ ${starSum()}/${MAX_STARS_OPEN} · ⛁ ${state.banco}`;
  }
}

function showChooser(){
  if (!choice) return;
  updateChoiceInfo();
  choice.hidden = false;
  requestAnimationFrame(() => choice.classList.add('on'));
}
function hideChooser(){
  if (!choice) return;
  choice.classList.remove('on');
  setTimeout(() => { choice.hidden = true; }, 350);
}

function setMode(mode){
  state.mode = mode;
  save();
  updateBanner();
  updateLog();
  updateChoiceInfo();
  refreshRings();
  refreshBeacon();
}

function openLog(){
  if (!logEl) return;
  updateLog();
  logEl.hidden = false;
  requestAnimationFrame(() => logEl.classList.add('on'));
}
function closeLog(){
  if (!logEl) return;
  logEl.classList.remove('on');
  setTimeout(() => { logEl.hidden = true; }, 320);
}

function starsTxt(n){
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function missionRow(m){
  const done = !!state.done[m.id];
  const isCur = !done && currentId() === m.id;
  const cls = done ? 'is-done' : isCur ? 'is-current' : m.locked ? 'is-locked' : '';
  const stat = done ? '✓' : isCur ? '▶' : m.locked ? '🔒' : '·';
  const tal = m.talisman ? `<i title="${m.talisman.name}">${m.talisman.icon}</i>` : '';
  const banco = m.banco ? `<em>+${m.banco} ⛁</em>` : '';
  const stars = done ? `<span class="ms-m-stars">${starsTxt(state.stars[m.id] || 0)}</span>` : '';
  const best = (m.id === 'M02' && state.best.M02) ? `<small>🏁 record ${fmtTime(state.best.M02)}</small>` : '';
  const hint = m.hint || (m.objectives[0] ? m.objectives[0].label : '');
  return `<div class="ms-m ${cls}" data-mid="${m.id}">
    <span class="ms-m-stat">${stat}</span>
    <span class="ms-m-ico">${m.icon}</span>
    <span class="ms-m-txt"><b>${m.id} · ${m.title} ${stars}</b><small>${hint}</small>${best}</span>
    <span class="ms-m-rw">${tal}${banco}</span>
  </div>`;
}

function updateLog(){
  if (!logBody) return;
  if (logBanco) logBanco.textContent = '⛁ ' + state.banco;
  if (logRank){ const r = rankOf(state.banco); logRank.textContent = `${r.ic} ${r.n}`; }

  let h = '';
  for (const ch of CHAPTERS){
    const ms = MISSIONS.filter(m => m.ch === ch.n);
    const allLocked = ms.every(m => m.locked);
    const soon = ms.every(m => m.soon);
    const note = soon ? 'en préparation' : (allLocked ? 'termine le Chapitre 1 pour débloquer' : '');
    h += `<section class="ms-chap"><h3 class="${allLocked ? 'locked-chap' : ''}">Chap. ${ch.n} — ${ch.name}${note ? ` <small>${note}</small>` : ''}</h3>`;
    for (const m of ms) h += missionRow(m);
    h += '</section>';
  }

  const withTal = MISSIONS.filter(m => m.talisman);
  const talsHtml = withTal.map(m => {
    const got = state.talismans.includes(m.talisman.id);
    return `<i class="${got ? '' : 'locked'}" title="${m.talisman.name}${got ? '' : ' (à débloquer)'}">${got ? m.talisman.icon : '❓'}</i>`;
  }).join('');
  h += `<section class="ms-chap"><h3>Talismans</h3><div class="ms-tals">${talsHtml}</div></section>`;

  logBody.innerHTML = h;
  if (logMode) logMode.textContent = state.mode === 'missions'
    ? '🧭 Passer en exploration libre'
    : '📜 Activer les missions';
}

/* ==========================================================
   11. COMPTE À REBOURS
   ========================================================== */

let counting = false;
function runCountdown(onDone){
  if (counting) return;
  if (!countEl){ if (onDone) onDone(); return; }
  counting = true;
  const seq = ['3', '2', '1', 'GO !'];
  let i = 0;
  countEl.hidden = false;
  countEl.classList.add('on');
  const step = () => {
    if (i >= seq.length){
      countEl.classList.remove('on');
      setTimeout(() => { countEl.hidden = true; counting = false; if (onDone) onDone(); }, 500);
      return;
    }
    countEl.textContent = seq[i];
    countEl.classList.remove('pop');
    void countEl.offsetWidth;
    countEl.classList.add('pop');
    playSnd(i < 3 ? sndBadge : sndWin);
    i++;
    setTimeout(step, i === 4 ? 750 : 820);
  };
  step();
}

/* ==========================================================
   12. BOUTON CARNET DANS LA BARRE D'OUTILS DU DRONE
   ========================================================== */

function injectToolbarButton(){
  const bar = document.querySelector('.dg-toolbar');
  if (!bar || bar.querySelector('#msToolLog')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dg-tool';
  b.id = 'msToolLog';
  b.textContent = '📜';
  b.setAttribute('aria-label', 'Carnet de missions');
  b.title = 'Carnet de missions';
  b.addEventListener('click', (e) => { e.stopPropagation(); openLog(); });
  bar.appendChild(b);
}

/* ==========================================================
   13. CÂBLAGE
   ========================================================== */

function startMissions(){
  setMode('missions');
  hideChooser();
  const cur = currentMission();
  if (cur) showBrief(cur);
  else toastInfo('🏆 Chapitre 1 terminé — bravo, Gardien !');
}
function startFree(){
  setMode('free');
  hideChooser();
  toastInfo('🧭 Exploration libre — visite à ton rythme.');
}
document.getElementById('msChoiceMissions')?.addEventListener('click', startMissions);
document.getElementById('msChoiceFree')?.addEventListener('click', startFree);
document.getElementById('msBriefGo')?.addEventListener('click', () => {
  const m = missionById(_briefId);
  hideBrief();
  if (!m) return;
  setMode('missions');
  if (m.mode === 'game') window.DroneGame?.enter?.();
  else if (m.mode === 'sanctuary'){
    try { window.SanctuaryMode?.resetScans?.(); } catch (_) {}
    window.SanctuaryMode?.enter?.();
  }
});
document.getElementById('msBriefLater')?.addEventListener('click', hideBrief);
document.getElementById('msDbNext')?.addEventListener('click', () => {
  hideDebrief();
  const cur = currentMission();
  if (cur) showBrief(cur);
});
document.getElementById('msDbClose')?.addEventListener('click', hideDebrief);
document.getElementById('msLogClose')?.addEventListener('click', closeLog);
document.getElementById('msLogBack')?.addEventListener('click', closeLog);
logMode?.addEventListener('click', () => {
  setMode(state.mode === 'missions' ? 'free' : 'missions');
  toastInfo(state.mode === 'missions'
    ? '📜 Missions activées — bonne chance !'
    : '🧭 Exploration libre activée.');
});
document.getElementById('msLogReset')?.addEventListener('click', () => {
  if (!confirm('Réinitialiser toute la progression (missions, étoiles, banco, talismans) ?')) return;
  state = blankState();
  save();
  refreshLocks();
  refreshRings();
  refreshBeacon();
  updateBanner();
  updateLog();
  updateChoiceInfo();
  toastInfo('↺ Progression réinitialisée.');
});
logBody?.addEventListener('click', (e) => {
  const row = e.target.closest('.ms-m');
  if (!row) return;
  const mid = row.dataset.mid;
  if (mid && mid === currentId()){
    closeLog();
    setTimeout(() => showBrief(missionById(mid)), 320);
  }
});

/* Choix proposé quand la maquette se révèle (après le titre d'accueil) */
let chooserTimer = 0;
function scheduleChooser(){
  clearTimeout(chooserTimer);
  chooserTimer = setTimeout(() => {
    // Ne pas rouvrir le menu principal par-dessus une partie déjà lancée
    // (le joueur a pu entrer dans le sanctuaire ou le pilotage entre-temps).
    if (window.SanctuaryMode?.isActive?.()) return;
    if (document.getElementById('droneHud')?.classList.contains('is-on')) return;
    if (window.GameMenu && typeof window.GameMenu.show === 'function'){
      updateBanner();
      window.GameMenu.show();                 // menu principal « vue 360° »
      return;
    }
    if (!state.mode){
      showChooser();
    } else if (state.mode === 'missions'){
      const cur = currentMission();
      updateBanner();
      if (cur) showBrief(cur);
      else toastInfo('🏆 Chapitre 1 terminé — bravo, Gardien !');
    }
  }, 2800);
}
window.addEventListener('mosque:revealed', scheduleChooser);

/* ==========================================================
   14. INITIALISATION
   ========================================================== */

if (stage){
  updateBanner();
  updateLog();
  updateChoiceInfo();
  injectToolbarButton();
  if (stage.classList.contains('revealed')) scheduleChooser();
}

/* API publique (hooks + débogage) */
window.Missions = {
  onGameEnter,
  onGameExit,
  tick,
  onPhoto,
  onEggScan,
  onSanctuaryEnter,
  onSanctuaryExit,
  onSanctuaryTick,
  onSanctuaryEvent,
  openLog,
  openChooser: showChooser,
  openBrief(){ const c = currentMission(); if (c) showBrief(c); },
  startMissions,
  startFree,
  resumeInfo(){
    const cur = currentMission();
    return {
      mode: state.mode,
      current: cur ? { id: cur.id, title: cur.title, icon: cur.icon } : null,
      banco: state.banco,
      stars: starSum(),
      maxStars: MAX_STARS_OPEN,
      doneCount: Object.keys(state.done).filter(k => { const m = missionById(k); return m && !m.soon; }).length,
      doneTotal: OPEN_MISSIONS.length,
    };
  },
  setMenuOpen(open){
    if (!banner) return;
    if (open) banner.classList.remove('on');
    else updateBanner();
  },
  reset(){ state = blankState(); save(); updateBanner(); updateLog(); },
  _debug: {
    force(id){ complete(id); },
    give(n){ state.banco += n; save(); updateBanner(); updateLog(); },
    state(){ return state; },
    rings(){
      const M = window.MosqueScene;
      return {
        built: ringsBuilt,
        domeR: M ? M.domeRadius : null,
        barrier: M ? Math.round((M.domeRadius || 600) * 0.62) : null,
        centers: rings.map(r => r.center.toArray().map(v => Math.round(v))),
        prog: prog('M02'),
      };
    },
  },
};
