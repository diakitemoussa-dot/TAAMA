/* ==========================================================
   MANETTE — support Gamepad API (window.GamepadKit)
   ----------------------------------------------------------
   Branchez une manette (Xbox, PlayStation, Switch…) et jouez :
     • Maquette (hors jeu) : A JOUER (drone) · Y sanctuaire · X vidéo ·
                             START menu 360° · B fermer
     • Jeu drone   : sticks = vol · A/LB photo · RB vidéo · X galerie ·
                     Y drone/vaisseau · BACK points d'intérêt ·
                     B/START quitter (drone posé : stick droit = caméra)
     • Sanctuaire  : stick G = marcher · stick D = regarder · A fermer ·
                     X/LB photo · RB vidéo · ◀▶ extérieur/intérieur ·
                     B/START quitter

   Lecture en continu (requestAnimationFrame) : sticks avec zone
   morte + lissage, boutons avec fronts d'appui (une seule frame).

   API :
     GamepadKit.connected()      → manette branchée ?
     GamepadKit.name()           → nom de la manette
     GamepadKit.state()          → { lx, ly, rx, ry } sticks (-1..1)
     GamepadKit.down('A')        → bouton maintenu ?
     GamepadKit.justPressed('A') → vient d'être pressé (1 frame)
     GamepadKit.rumble(120, 0.6) → vibration (si supportée)
     GamepadKit.toast('texte')   → notification rapide
   ========================================================== */

const DEADZONE = 0.14;   // zone morte des sticks
const SMOOTH   = 16;     // lissage des sticks (par seconde)

const AXES = ['lx', 'ly', 'rx', 'ry'];
const BTN_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'UP', 'DOWN', 'LEFT', 'RIGHT'];

const _state = { lx: 0, ly: 0, rx: 0, ry: 0 };
let _pad = null;
let _down = {};          // état maintenu des boutons
let _just = {};          // fronts d'appui de la frame
let _lastT = performance.now();
let _wasConnected = false;

function _pickPad() {
  if (!navigator.getGamepads) return null;
  for (const p of navigator.getGamepads()) {
    if (p && p.connected) return p;
  }
  return null;
}

function _shortId(id) {
  return String(id || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function _norm(v) {
  const a = Math.abs(v || 0);
  if (a < DEADZONE) return 0;
  const s = (a - DEADZONE) / (1 - DEADZONE);
  return v < 0 ? -s : s;
}

/* ---------- Notification discrète ---------- */
let _toastEl = null, _toastTimer = 0;
function toast(msg) {
  if (!_toastEl) {
    _toastEl = document.createElement('div');
    _toastEl.className = 'gp-toast';
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.add('is-on');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => _toastEl.classList.remove('is-on'), 4500);
}

/* ---------- Vibration ---------- */
function rumble(ms = 120, strength = 0.6) {
  const act = _pad && _pad.vibrationActuator;
  if (!act || typeof act.playEffect !== 'function') return;
  try {
    act.playEffect('dual-rumble', {
      startDelay: 0,
      duration: ms,
      weakMagnitude: strength,
      strongMagnitude: strength,
    });
  } catch (_) {}
}

/* ---------- Raccourcis « vue d'ensemble » (maquette, hors mode jeu) ---------- */
let _warmupUntil  = 0;      // anti « appui de réveil » juste après la connexion
let _ovHintShown  = false;  // aide vue d'ensemble déjà montrée ?
const _OVERVIEW_HINT = '🎮 A jouer (drone) · Y sanctuaire · X vidéo · START menu · B fermer';

function _overviewActive() {
  const stage = document.getElementById('mosqueStage');
  if (!stage || !stage.classList.contains('on')) return false;
  if (document.getElementById('arOverlay')?.classList.contains('visible')) return false;
  const ui = document.querySelector('.mq-ui');
  if (ui && ui.classList.contains('dg-hidden')) return false;   // un mode jeu est actif : il gère ses boutons
  return true;
}

function _overviewShortcuts() {
  if (!_overviewActive()) return;

  const menuOpen  = !!(window.GameMenu && window.GameMenu.isOpen && window.GameMenu.isOpen());
  const videoOpen = !!document.querySelector('#mosqueVideo.open');

  // Vidéo « Le Grand Crépissage » ouverte : B / START referme
  if (videoOpen) {
    if (_just['B'] || _just['START']) document.querySelector('.mq-video-close')?.click();
    return;
  }

  // Menu 360° ouvert : START / B referme
  if (menuOpen) {
    if (_just['START'] || _just['B']) window.GameMenu.hide?.();
    return;
  }

  // Menu radial / fiche info : B referme (comme le bouton ⌂)
  const radialOpen = !!document.querySelector('.mq-menu-wrap.is-open');
  const infoOpen   = !!document.querySelector('.mq-ui.info-open');
  if (radialOpen || infoOpen) {
    if (_just['B']) document.querySelector('[data-action="menu"]')?.click();
    return;
  }

  // Raccourcis principaux (le front d'appui est consommé : le mode qui
  // vient de s'ouvrir ne doit pas recevoir le même appui dans la foulée)
  if (_just['A']) { document.querySelector('[data-action="game"]')?.click(); _just['A'] = false; }      // JOUER (drone)
  if (_just['Y']) { document.querySelector('[data-action="interior"]')?.click(); _just['Y'] = false; }  // SANCTUAIRE
  if (_just['X'] || _just['RB']) document.querySelector('[data-action="video-crepissage"]')?.click();    // 🎥 vidéo
  if (_just['START']) window.GameMenu.show?.();                                                          // ⌂ menu 360°
}

/* ---------- Boucle de lecture ---------- */
function _poll() {
  requestAnimationFrame(_poll);

  const now = performance.now();
  const dt = Math.min(0.05, (now - _lastT) / 1000);
  _lastT = now;

  _pad = _pickPad();

  // Connexion / déconnexion (les navigateurs n'exposent une manette
  // qu'après un premier appui sur un de ses boutons)
  const conn = !!_pad;
  if (conn && !_wasConnected) {
    toast('🎮 Manette connectée' + (_pad.id ? ' — ' + _shortId(_pad.id) : ''));
    _warmupUntil = now + 600;   // ignore l'appui qui vient de réveiller la manette
    if (_overviewActive() && !_ovHintShown) {
      _ovHintShown = true;
      setTimeout(() => { if (_overviewActive()) toast(_OVERVIEW_HINT); }, 4900);
    }
  }
  if (!conn && _wasConnected) toast('🎮 Manette déconnectée');
  _wasConnected = conn;

  if (!_pad || now < _warmupUntil) {
    for (const k of AXES) _state[k] = 0;
    _down = {}; _just = {};
    return;
  }

  // Sticks (axes 0..3 du mapping standard) — zone morte + lissage
  const t = Math.min(1, SMOOTH * dt);
  const raw = [_norm(_pad.axes[0]), _norm(_pad.axes[1]), _norm(_pad.axes[2]), _norm(_pad.axes[3])];
  for (let i = 0; i < 4; i++) _state[AXES[i]] += (raw[i] - _state[AXES[i]]) * t;

  // Boutons — fronts d'appui (consommables une frame)
  const prev = _down;
  _down = {}; _just = {};
  for (let i = 0; i < BTN_NAMES.length; i++) {
    const b = _pad.buttons[i];
    const on = !!b && (b.pressed || b.value > 0.4);
    _down[BTN_NAMES[i]] = on;
    _just[BTN_NAMES[i]] = on && !prev[BTN_NAMES[i]];
  }

  // Raccourcis de la vue d'ensemble (hors mode jeu)
  _overviewShortcuts();
}
requestAnimationFrame(_poll);

/* ---------- API publique ---------- */
window.GamepadKit = {
  connected() { return !!_pad; },
  name() { return _pad ? _shortId(_pad.id) : ''; },
  state() { return _state; },
  down(n) { return !!_down[n]; },
  justPressed(n) { return !!_just[n]; },
  rumble,
  toast,
};
