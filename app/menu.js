/* ==========================================================
   MENU PRINCIPAL — « Les Gardiens de Djenné » (vue 360°)
   ----------------------------------------------------------
   Le menu s'affiche par-dessus la maquette révélée, qui tourne
   doucement (MosqueScene.setAutoRotate).

   Sections :
     🎯 Missions            → Missions.startMissions()
     🕊️ Exploration libre   → Missions.startFree()
     🛸 Drone & Modèles     → DroneGame.setModel + enter
     📜 Carnet de missions  → Missions.openLog()
     👤 Personnage          → bientôt
     🌐 Connexion           → bientôt

   Affiché automatiquement par missions.js (scheduleChooser) après
   `mosque:revealed`. Bouton « ⌂ MENU » ajouté aux actions de la maquette.
   ========================================================== */

const stage = document.getElementById('mosqueStage');

/* ---------------- Structure ---------------- */

const root = document.createElement('div');
root.id = 'gmRoot';
root.innerHTML = `
  <div class="gm-menu" id="gmMenu" hidden>
    <div class="gm-backdrop" id="gmBackdrop"></div>
    <div class="gm-wrap">
      <header>
        <div class="gm-kicker">◈ EXPLORATION DU PATRIMOINE DU MALI</div>
        <h1 class="gm-title">LES GARDIENS DE DJENNÉ</h1>
        <p class="gm-sub">Le Maître Maçon t'attend avant la grande fête du Crépissage.</p>
      </header>

      <div class="gm-grid">
        <button type="button" class="gm-card gm-card--missions" id="gmMissions">
          <span class="gm-ico" aria-hidden="true">🎯</span>
          <span class="gm-card-txt"><b>MISSIONS</b><i id="gmMissionsInfo">…</i></span>
          <span class="gm-badge" id="gmMissionsBadge">⛁ 0</span>
        </button>

        <button type="button" class="gm-card" id="gmFree">
          <span class="gm-ico" aria-hidden="true">🕊️</span>
          <span class="gm-card-txt"><b>EXPLORATION LIBRE</b><i>Drone, sanctuaire et AR — à ton rythme</i></span>
        </button>

        <button type="button" class="gm-card" id="gmModels">
          <span class="gm-ico" aria-hidden="true">🛸</span>
          <span class="gm-card-txt"><b>DRONE & MODÈLES</b><i id="gmModelsInfo">…</i></span>
        </button>

        <button type="button" class="gm-card" id="gmCarnet">
          <span class="gm-ico" aria-hidden="true">📜</span>
          <span class="gm-card-txt"><b>CARNET DE MISSIONS</b><i id="gmCarnetInfo">…</i></span>
        </button>

        <button type="button" class="gm-card gm-card--soon" id="gmPerson">
          <span class="gm-ico" aria-hidden="true">👤</span>
          <span class="gm-card-txt"><b>PERSONNAGE</b><i>Bientôt — choisis ton pilote</i></span>
        </button>

        <button type="button" class="gm-card gm-card--soon" id="gmConnexion">
          <span class="gm-ico" aria-hidden="true">🌐</span>
          <span class="gm-card-txt"><b>CONNEXION</b><i>Bientôt — ta progression en ligne</i></span>
        </button>
      </div>

      <p class="gm-note">Glisse sur la maquette pour l'explorer · le modèle tourne doucement pour toi · reviens ici avec ⌂ MENU</p>
    </div>
  </div>

  <div class="gm-models" id="gmModelsPane" hidden>
    <div class="gm-models-card">
      <div class="gm-kicker">◈ CHOISIS TON ENGIN</div>
      <h2 class="gm-models-title">DRONE & MODÈLES</h2>
      <div class="gm-model-list" id="gmModelList"></div>
      <button type="button" class="gm-btn-gold" id="gmModelsFly">🚁 DÉCOLLER AVEC CE MODÈLE</button>
      <button type="button" class="gm-btn-ghost" id="gmModelsBack">‹ RETOUR AU MENU</button>
    </div>
  </div>

  <div class="gm-toast" id="gmToast"></div>
`;
if (stage) stage.appendChild(root);

const menuEl   = document.getElementById('gmMenu');
const paneEl   = document.getElementById('gmModelsPane');
const listEl   = document.getElementById('gmModelList');
const toastEl  = document.getElementById('gmToast');

/* ---------------- Engins disponibles ---------------- */

const MODELS_INFO = [
  { id: 'drone',    ico: '🚁', name: 'Drone classique',    desc: 'Agile et précis — l\'engin des missions.' },
  { id: 'vaisseau', ico: '🛸', name: 'Vaisseau du désert', desc: 'Plus grand, vol planant — pour les explorateurs.' },
];

let selected = 'drone';
let open = false;
let toastTimer = 0;

/* ---------------- Toast léger ---------------- */

function gmToast(msg){
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600);
}

/* ---------------- Sync des infos ---------------- */

function sync(){
  const r = window.Missions?.resumeInfo?.() || {
    mode: null, current: null, banco: 0, stars: 0, maxStars: 15, doneCount: 0,
  };

  const infoEl  = document.getElementById('gmMissionsInfo');
  const badgeEl = document.getElementById('gmMissionsBadge');
  if (infoEl && badgeEl){
    if (r.mode === 'missions' && r.current){
      infoEl.textContent = `Reprendre : ${r.current.id} · ${r.current.title}`;
    } else if (r.doneCount > 0 && !r.current){
      infoEl.textContent = 'Chapitre 1 terminé — chapitres 2 à 4 en préparation';
    } else {
      infoEl.textContent = '5 missions · 4 chapitres — deviens Grand Gardien';
    }
    badgeEl.textContent = `⛁ ${r.banco} · ★ ${r.stars}/${r.maxStars}`;
  }

  const carnetInfo = document.getElementById('gmCarnetInfo');
  if (carnetInfo){
    carnetInfo.textContent = `⛁ ${r.banco} · ★ ${r.stars}/${r.maxStars} · ${r.doneCount}/5 missions accomplies`;
  }

  selected = window.DroneGame?.getModel?.() || selected;
  syncModels();

  const modelsInfo = document.getElementById('gmModelsInfo');
  if (modelsInfo){
    const mi = MODELS_INFO.find(m => m.id === selected) || MODELS_INFO[0];
    modelsInfo.textContent = `${mi.ico} ${mi.name} — change d'engin quand tu veux`;
  }
}

function syncModels(){
  if (!listEl) return;
  listEl.innerHTML = MODELS_INFO.map(m =>
    `<button type="button" class="gm-model${m.id === selected ? ' is-on' : ''}" data-mid="${m.id}">
       <b>${m.ico} ${m.name}</b><i>${m.desc}</i>
     </button>`
  ).join('');
  listEl.querySelectorAll('.gm-model').forEach(btn => {
    btn.addEventListener('click', () => {
      selected = btn.dataset.mid;
      syncModels();
    });
  });
}

/* ---------------- Ouvrir / fermer ---------------- */

function show(){
  if (open || !menuEl) return;
  open = true;
  sync();
  paneEl.hidden = true;
  paneEl.classList.remove('on');
  menuEl.hidden = false;
  requestAnimationFrame(() => menuEl.classList.add('on'));
  window.MosqueScene?.setAutoRotate?.(true);
  window.Missions?.setMenuOpen?.(true);
}

function hide(){
  if (!open || !menuEl) return;
  open = false;
  paneEl.classList.remove('on');
  paneEl.hidden = true;
  menuEl.classList.remove('on');
  setTimeout(() => { menuEl.hidden = true; }, 520);
  window.MosqueScene?.setAutoRotate?.(false);
  window.Missions?.setMenuOpen?.(false);
}

/* ---------------- Câblage ---------------- */

document.getElementById('gmBackdrop')?.addEventListener('click', hide);

document.getElementById('gmMissions')?.addEventListener('click', () => {
  hide();
  window.Missions?.startMissions?.();
});

document.getElementById('gmFree')?.addEventListener('click', () => {
  hide();
  window.Missions?.startFree?.();
});

document.getElementById('gmModels')?.addEventListener('click', () => {
  paneEl.hidden = false;
  requestAnimationFrame(() => paneEl.classList.add('on'));
});

document.getElementById('gmModelsBack')?.addEventListener('click', () => {
  paneEl.classList.remove('on');
  setTimeout(() => { paneEl.hidden = true; }, 320);
});

document.getElementById('gmModelsFly')?.addEventListener('click', () => {
  const id = selected;
  try { window.DroneGame?.setModel?.(id); } catch (_) {}
  hide();
  window.DroneGame?.enter?.();
});

document.getElementById('gmCarnet')?.addEventListener('click', () => {
  hide();
  window.Missions?.openLog?.();
});

document.getElementById('gmPerson')?.addEventListener('click', () =>
  gmToast('👤 Personnage — bientôt disponible dans une prochaine mise à jour !'));

document.getElementById('gmConnexion')?.addEventListener('click', () =>
  gmToast('🌐 Connexion — bientôt disponible : ta progression sera sauvegardée en ligne !'));

/* ---------------- Bouton ⌂ MENU dans les actions de la maquette ---------------- */

function injectMenuButton(){
  const wrap = document.querySelector('.mq-actions');
  if (!wrap || document.getElementById('gmOpen')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mq-btn mq-btn--ghost';
  b.id = 'gmOpen';
  b.textContent = '⌂ MENU';
  b.addEventListener('click', () => show());
  wrap.appendChild(b);
}
injectMenuButton();

/* Re-tente l'injection quand la maquette se révèle (au cas où le DOM bouge) */
window.addEventListener('mosque:revealed', () => {
  injectMenuButton();
  const modelsInfo = document.getElementById('gmModelsInfo');
  if (modelsInfo) sync();
});

/* ---------------- API ---------------- */

window.GameMenu = { show, hide, isOpen: () => open };
