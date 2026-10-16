/* ==========================================================
   MISSIONS — « Les Gardiens de Djenné » (Phase 1 — chapitre 1)
   ----------------------------------------------------------
   Moteur de missions posé par-dessus les modes existants :
     • Mode GAME (drone)      → M01..M04 (ce chapitre)
     • M05..M12               → verrouillées (chapitres suivants)

   Interface exposée à drone-game.js (appels optionnels) :
     window.Missions.onGameEnter()         → entrée en mode GAME
     window.Missions.onGameExit()          → sortie du mode GAME
     window.Missions.tick(dt, pos, yaw)    → appelée chaque frame de vol
     window.Missions.onPhoto(pos)          → photo prise
     window.Missions.onEggScan()           → scan œufs d'autruche terminé

   Écoute aussi l'événement 'mosque:revealed' (mosque-viewer.js) pour
   proposer le choix Missions / Exploration libre.

   Dépend de window.MosqueScene (mosque-viewer.js) :
     mosqueBox, facadeTarget, facadeNormal, facadeDist, viewTarget, scene.
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

const MISSIONS = [
  /* ----- Chapitre 1 — jouable (mode drone) ----- */
  {
    id: 'M01', ch: 1, icon: '🚁', title: 'Premier envol', mode: 'game',
    hint: "Décolle et atteins 12 m d'altitude (joystick GAUCHE vers le haut).",
    banco: 20,
    talisman: { id: 'premier-envol', icon: '🥇', name: 'Premier Envol' },
  },
  {
    id: 'M02', ch: 1, icon: '⭕', title: 'Le tour du propriétaire', mode: 'game',
    hint: 'Traverse les 4 anneaux dorés autour de la mosquée.',
    banco: 30,
  },
  {
    id: 'M03', ch: 1, icon: '📸', title: "L'Œil du Sahel", mode: 'game',
    hint: 'Approche la façade de la prière et prends une photo (outil 📷).',
    banco: 30,
    talisman: { id: 'oeil-sahel', icon: '📸', name: 'Œil du Sahel' },
  },
  {
    id: 'M04', ch: 1, icon: '🪺', title: 'Le Trésor des Tours', mode: 'game',
    hint: "Survole les œufs d'autruche (au-dessus des tours) pour lancer le radar.",
    banco: 40,
    talisman: { id: 'archeologue', icon: '🏺', name: 'Archéologue' },
  },

  /* ----- Chapitres suivants — en préparation ----- */
  { id: 'M05', ch: 2, icon: '🚪', title: 'Franchir la porte', mode: 'sanctuary', locked: true, banco: 20,
    hint: 'Entre dans le sanctuaire et atteins la salle de prière.' },
  { id: 'M06', ch: 2, icon: '🌙', title: 'La Veillée des tombeaux', mode: 'sanctuary', locked: true, banco: 30,
    hint: 'Scanne les tombeaux dans le sanctuaire.' },
  { id: 'M07', ch: 2, icon: '🕌', title: "La Place de l'Imam", mode: 'sanctuary', locked: true, banco: 40,
    hint: "Trouve et scanne la place de l'Imam." },
  { id: 'M08', ch: 2, icon: '⛰️', title: 'Le Toit du Monde', mode: 'sanctuary', locked: true, banco: 50,
    hint: 'Prends le portail vers le toit et photographie la ville.' },
  { id: 'M09', ch: 3, icon: '📚', title: 'Le Quiz du Patrimoine', mode: 'quiz', locked: true, banco: 60,
    hint: 'Réponds correctement à 5 questions.' },
  { id: 'M10', ch: 4, icon: '🛠️', title: 'Le Grand Crepissage', mode: 'game', locked: true, banco: 60,
    hint: 'Regarde la vidéo du crépissage et livre le banco en drone.' },
  { id: 'M11', ch: 4, icon: '📱', title: 'Ramène la Mosquée chez toi', mode: 'ar', locked: true, banco: 40,
    hint: 'Place la mosquée en AR chez toi.' },
  { id: 'M12', ch: 4, icon: '🏆', title: 'Diplôme de Gardien', mode: 'quiz', locked: true, banco: 0,
    hint: 'Termine toutes les missions pour obtenir ton diplôme.' },
];

/* ==========================================================
   2. ÉTAT + PERSISTANCE (localStorage)
   ========================================================== */

const LS_KEY = 'djenne.missions.v1';

function blankState(){
  return { mode: null, banco: 0, done: {}, talismans: [], rings: {} };
}
function loadState(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return blankState();
    const d = JSON.parse(raw) || {};
    return {
      mode: d.mode === 'missions' || d.mode === 'free' ? d.mode : null,
      banco: Number(d.banco) || 0,
      done: { ...(d.done || {}) },
      talismans: Array.isArray(d.talismans) ? d.talismans : [],
      rings: { ...(d.rings || {}) },
    };
  } catch (_) { return blankState(); }
}
let state = loadState();
function save(){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (_) {}
}

/* Helpers missions */
function missionById(id){ return MISSIONS.find(m => m.id === id) || null; }
function currentMission(){ return MISSIONS.find(m => !m.locked && !state.done[m.id]) || null; }
function currentId(){ const c = currentMission(); return c ? c.id : null; }

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
    <div class="ms-banner-hint" id="msHint"></div>
  </div>

  <div class="ms-choice" id="msChoice" hidden>
    <div class="ms-choice-card">
      <div class="ms-choice-kicker">◈ LES GARDIENS DE DJENNÉ</div>
      <h2 class="ms-choice-title">Choisis ton aventure</h2>
      <p class="ms-choice-sub">Le Maître Maçon t'attend avant la fête du Grand Crepissage.</p>
      <button type="button" class="ms-choice-btn ms-choice-missions" id="msChoiceMissions">
        <span class="ms-choice-ico">📜</span>
        <span class="ms-choice-txt"><b>MISSIONS</b><i id="msChoiceInfo">12 missions · 4 chapitres</i></span>
      </button>
      <button type="button" class="ms-choice-btn" id="msChoiceFree">
        <span class="ms-choice-ico">🧭</span>
        <span class="ms-choice-txt"><b>EXPLORATION LIBRE</b><i>Drone, sanctuaire et AR — à ton rythme</i></span>
      </button>
      <p class="ms-choice-note">Tu pourras changer d'avis à tout moment (carnet 📜).</p>
    </div>
  </div>

  <div class="ms-log" id="msLog" hidden>
    <div class="ms-log-back" id="msLogBack"></div>
    <div class="ms-log-card">
      <header class="ms-log-head">
        <span class="ms-log-title">📜 CARNET DE MISSIONS</span>
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

const banner   = document.getElementById('msBanner');
const pillEl   = document.getElementById('msPill');
const hintEl   = document.getElementById('msHint');
const choice   = document.getElementById('msChoice');
const logEl    = document.getElementById('msLog');
const logBody  = document.getElementById('msLogBody');
const logBanco = document.getElementById('msLogBanco');
const logMode  = document.getElementById('msLogMode');
const toasts   = document.getElementById('msToasts');

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
   6. BANDEAU OBJECTIF
   ========================================================== */

let inGame = false;

function updateBanner(){
  if (!banner) return;
  if (state.mode !== 'missions'){ banner.classList.remove('on'); return; }
  banner.classList.add('on');

  const banco = `⛁ ${state.banco}`;
  const cur = currentMission();

  if (!cur){
    pillEl.innerHTML =
      `<span class="ms-b-ico">🏆</span><span class="ms-b-name">Chapitre 1 terminé !</span>` +
      `<span class="ms-b-banco">${banco}</span>`;
    hintEl.textContent = 'Chapitres 2 à 4 en préparation — continue à explorer en attendant !';
    return;
  }

  const passed = ringsBuilt ? rings.filter(r => r.passed).length : countSavedRings();
  const prog = cur.id === 'M02' ? `Anneaux ${passed}/4 — ` : '';

  pillEl.innerHTML =
    `<span class="ms-b-ico">${cur.icon}</span>` +
    `<span class="ms-b-name">${cur.id} · ${cur.title}</span>` +
    `<span class="ms-b-banco">${banco}</span>`;

  let h = prog + cur.hint;
  if (cur.mode === 'game' && !inGame) h += '  (bouton GAME en bas à gauche)';
  hintEl.textContent = h;
}

function countSavedRings(){
  let n = 0;
  for (let i = 0; i < 4; i++) if (state.rings['R' + i]) n++;
  return n;
}

/* ==========================================================
   7. ANNEAUX 3D (mission M02)
   ========================================================== */

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
  sp.raycast = () => {};              // n'interfère pas avec les raycasts du jeu
  return sp;
}

function tintRing(r, passed){
  r.mat.color.set(passed ? 0x7fe3a5 : 0xf9d58b);
  r.mat.opacity  = passed ? 0.32 : 0.72;
  r.mat2.color.set(passed ? 0x7fe3a5 : 0xf9d58b);
  r.mat2.opacity = passed ? 0.10 : 0.18;
}

function buildRings(){
  if (ringsBuilt) return;
  const M = window.MosqueScene;
  if (!M || !M.mosqueBox || M.mosqueBox.isEmpty()) return;

  const box = M.mosqueBox;
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const R = Math.max(60, Math.max(s.x, s.z) * 0.85);   // rayon du parcours
  const y = box.max.y + 18;                            // au-dessus des tours

  for (let i = 0; i < 4; i++){
    const th = i * Math.PI / 2;                        // 4 positions cardinales
    const g = new THREE.Group();
    g.name = 'MS_Ring';

    const mat  = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.72, depthWrite: false });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(14, 0.9, 10, 48), mat);
    torus.raycast = () => {};
    g.add(torus);

    const mat2 = new THREE.MeshBasicMaterial({ color: 0xf9d58b, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.RingGeometry(14.6, 17.2, 48), mat2);
    halo.raycast = () => {};
    g.add(halo);

    g.add(makeNumberSprite(i + 1));

    g.position.set(c.x + Math.cos(th) * R, y, c.z + Math.sin(th) * R);
    g.rotation.y = -th;                                // anneau orienté dans le sens du parcours
    g.visible = false;
    M.scene.add(g);

    const passed = !!state.rings['R' + i];
    rings.push({ id: 'R' + i, idx: i, group: g, mat, mat2, center: g.position.clone(), passed });
    if (passed) tintRing(rings[rings.length - 1], true);
  }
  ringsBuilt = true;
}

function refreshRings(){
  const need = state.mode === 'missions' && inGame && currentId() === 'M02';
  if (need && !ringsBuilt) buildRings();
  if (!ringsBuilt) return;
  for (const r of rings) r.group.visible = need;
}

/* ==========================================================
   8. COMPLÉTION DES MISSIONS
   ========================================================== */

function complete(id){
  const m = missionById(id);
  if (!m || state.done[id]) return;
  state.done[id] = true;
  state.banco += m.banco || 0;
  if (m.talisman && !state.talismans.includes(m.talisman.id)) state.talismans.push(m.talisman.id);
  save();

  playSnd(sndWin);
  toastBig(`✓ MISSION ACCOMPLIE · ${m.title}<br><b>+${m.banco} ⛁</b>`);

  if (m.talisman){
    setTimeout(() => { playSnd(sndBadge); toastBig(`🏅 Talisman obtenu — ${m.talisman.name}`); }, 2600);
  }

  const nxt = currentMission();
  if (nxt){
    setTimeout(() => toastInfo(`➤ Objectif suivant : ${nxt.id} · ${nxt.title}`), 5200);
  } else {
    setTimeout(() => toastInfo('🏆 Chapitre 1 terminé !<br><i>Chapitres 2 à 4 en préparation…</i>'), 5200);
  }

  refreshRings();
  updateBanner();
  updateLog();
  updateChoiceInfo();
}

/* ==========================================================
   9. HOOKS APPELÉS PAR drone-game.js
   ========================================================== */

let _photoNudge = 0;

function tick(dt, pos){
  if (state.mode !== 'missions' || !pos) return;
  const cur = currentMission();
  if (!cur) return;

  if (cur.id === 'M01'){
    const M = window.MosqueScene;
    const alt = pos.y - ((M && M.viewTarget) ? M.viewTarget.y : 0);
    if (alt >= 12) complete('M01');
  } else if (cur.id === 'M02'){
    if (!ringsBuilt) buildRings();
    if (!ringsBuilt) return;
    let changed = false;
    for (const r of rings){
      if (!r.passed && pos.distanceTo(r.center) < 15){
        r.passed = true;
        state.rings[r.id] = true;
        save();
        tintRing(r, true);
        playSnd(sndBadge);
        changed = true;
      }
    }
    if (changed){
      updateBanner();
      const n = rings.filter(r => r.passed).length;
      if (n < 4) toastInfo(`⭕ Anneau ${n}/4 !`);
      if (n >= 4) complete('M02');
    }
  }
}

function onPhoto(pos){
  if (state.mode !== 'missions' || !pos) return;
  const cur = currentMission();
  if (!cur || cur.id !== 'M03') return;
  const M = window.MosqueScene;
  if (!M || !M.facadeTarget || !M.facadeNormal) return;

  const dx = pos.x - M.facadeTarget.x;
  const dz = pos.z - M.facadeTarget.z;
  const side  = dx * M.facadeNormal.x + dz * M.facadeNormal.z;   // > 0 : devant la façade
  const horiz = Math.hypot(dx, dz);
  const tol   = (M.facadeDist || 120) * 1.6;
  const vTol  = (M.facadeDist || 120) * 1.2;

  if (side > 0 && horiz < tol && Math.abs(pos.y - M.facadeTarget.y) < vTol){
    complete('M03');
  } else if (!_photoNudge || Date.now() - _photoNudge > 7000){
    _photoNudge = Date.now();
    toastInfo('📸 Presque… approche-toi de la façade et recadre bien les 3 tours !');
  }
}

function onEggScan(){
  if (state.mode !== 'missions') return;
  const cur = currentMission();
  if (cur && cur.id === 'M04') complete('M04');
}

function onGameEnter(){
  inGame = true;
  refreshRings();
  updateBanner();
}

function onGameExit(){
  inGame = false;
  refreshRings();
  updateBanner();
}

/* ==========================================================
   10. ÉCRAN DE CHOIX + CARNET
   ========================================================== */

function updateChoiceInfo(){
  const info = document.getElementById('msChoiceInfo');
  if (!info) return;
  const cur = currentMission();
  if (state.mode === 'missions' && cur){
    info.textContent = `Reprendre : ${cur.id} · ${cur.title} — ⛁ ${state.banco}`;
  } else {
    const doneN = Object.keys(state.done).filter(k => missionById(k) && !missionById(k).locked).length;
    info.textContent = `${doneN}/4 missions · 🏅 ${state.talismans.length} talismans · ⛁ ${state.banco}`;
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

function missionRow(m){
  const done = !!state.done[m.id];
  const isCur = !done && currentId() === m.id;
  const cls = done ? 'is-done' : isCur ? 'is-current' : m.locked ? 'is-locked' : '';
  const stat = done ? '✓' : isCur ? '▶' : m.locked ? '🔒' : '·';
  const tal = m.talisman ? `<i title="${m.talisman.name}">${m.talisman.icon}</i>` : '';
  const banco = m.banco ? `<em>+${m.banco} ⛁</em>` : '';
  return `<div class="ms-m ${cls}">
    <span class="ms-m-stat">${stat}</span>
    <span class="ms-m-ico">${m.icon}</span>
    <span class="ms-m-txt"><b>${m.id} · ${m.title}</b><small>${m.hint}</small></span>
    <span class="ms-m-rw">${tal}${banco}</span>
  </div>`;
}

function updateLog(){
  if (!logBody) return;
  if (logBanco) logBanco.textContent = '⛁ ' + state.banco;

  let h = '';
  for (const ch of CHAPTERS){
    const ms = MISSIONS.filter(m => m.ch === ch.n);
    const allLocked = ms.every(m => m.locked);
    h += `<section class="ms-chap"><h3 class="${allLocked ? 'locked-chap' : ''}">Chap. ${ch.n} — ${ch.name}${allLocked ? ' <small>en préparation</small>' : ''}</h3>`;
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
   11. BOUTON CARNET DANS LA BARRE D'OUTILS DU DRONE
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
   12. CÂBLAGE (boutons, événements)
   ========================================================== */

document.getElementById('msChoiceMissions')?.addEventListener('click', () => {
  setMode('missions');
  hideChooser();
  toastInfo('📜 Missions activées — bonne chance, Gardien !');
});
document.getElementById('msChoiceFree')?.addEventListener('click', () => {
  setMode('free');
  hideChooser();
  toastInfo('🧭 Exploration libre — visite à ton rythme.');
});
document.getElementById('msLogClose')?.addEventListener('click', closeLog);
document.getElementById('msLogBack')?.addEventListener('click', closeLog);
logMode?.addEventListener('click', () => {
  setMode(state.mode === 'missions' ? 'free' : 'missions');
  toastInfo(state.mode === 'missions'
    ? '📜 Missions activées — bonne chance !'
    : '🧭 Exploration libre activée.');
});
document.getElementById('msLogReset')?.addEventListener('click', () => {
  if (!confirm('Réinitialiser toute la progression des missions (Banco, talismans, missions) ?')) return;
  state = blankState();
  save();
  if (ringsBuilt) for (const r of rings){ r.passed = false; tintRing(r, false); }
  refreshRings();
  updateBanner();
  updateLog();
  updateChoiceInfo();
  toastInfo('↺ Progression réinitialisée.');
});

/* Choix proposé quand la maquette se révèle (après le titre d'accueil) */
let chooserTimer = 0;
function scheduleChooser(){
  clearTimeout(chooserTimer);
  chooserTimer = setTimeout(() => {
    if (!state.mode){
      showChooser();
    } else {
      updateBanner();
      if (state.mode === 'missions'){
        const cur = currentMission();
        toastInfo(cur
          ? `📜 Reprendre les missions — ${cur.id} · ${cur.title}`
          : '🏆 Missions terminées — bravo, Gardien !');
      }
    }
  }, 2800);
}
window.addEventListener('mosque:revealed', scheduleChooser);

/* ==========================================================
   13. INITIALISATION
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
  openLog,
  openChooser: showChooser,
  reset(){ state = blankState(); save(); updateBanner(); updateLog(); },
  _debug: {
    force(id){ complete(id); },
    give(n){ state.banco += n; save(); updateBanner(); updateLog(); },
    state(){ return state; },
  },
};
