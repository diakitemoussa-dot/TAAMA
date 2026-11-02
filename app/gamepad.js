/* ==========================================================
   MANETTE — support Gamepad API (window.GamepadKit)
   ----------------------------------------------------------
   Branchez une manette (Xbox, PlayStation, Switch…) et jouez :
     • Maquette (hors jeu) : A JOUER (drone) · Y sanctuaire · X vidéo ·
                             START menu 360° · B fermer ·
                             stick D = tourner autour · stick G = se déplacer ·
                             LT/RT ou croix haut/bas = zoom · R3 = vue d'ensemble
     • Jeu drone   : sticks = vol · A photo · RB vidéo ·
                     Options/BACK menu des lieux · L1/LB retour au personnage ·
                     △/○ et X hors menu inactifs (drone posé : stick droit = caméra)
     • Sanctuaire  : stick G = marcher · L3 = courir ·
                     ○/B = sauter · ✕/A = valider dans un menu ·
                     R2/RT = tirer · L1/LB = drone ↔ personnage ·
                     Options/START = menu · stick D = caméra ·
                     RB vidéo · □/X et △/Y inactifs
     • Menus       : croix directionnelle = naviguer · ✕/A = valider

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
const _ZERO  = { lx: 0, ly: 0, rx: 0, ry: 0 };   // renvoyé au jeu quand la manette est « capturée » (carte ouverte)
let _captured = false;
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
let _rumbleT = 0, _rumbleCalls = 0, _rumbleLog = [];
function stopRumble() {
  const act = _pad && _pad.vibrationActuator;
  try { act && act.reset && act.reset(); } catch (_) {}
}
function rumble(ms = 120, strength = 0.6) {
  if (window.GameSettings && window.GameSettings.rumble === false) return;     // Options › Vibrations de la manette
  const act = _pad && _pad.vibrationActuator;
  if (!act || typeof act.playEffect !== 'function') return;
  const now = performance.now();
  _rumbleCalls++; _rumbleLog.push(String(new Error().stack || '').split(String.fromCharCode(10))[2]?.trim().slice(-70) || ''); if (_rumbleLog.length > 12) _rumbleLog.shift();
  if (now < _warmupUntil + 1500) return;      // pas de vibration juste après la connexion
  if (now - _rumbleT < 250) return;           // limiteur : jamais de vibration en continu, même si un module appelle en boucle
  _rumbleT = now;
  const d = Math.max(20, Math.min(ms, 300)), k = Math.max(0, Math.min(strength, 0.8));
  try {
    act.playEffect('dual-rumble', { startDelay: 0, duration: d, weakMagnitude: k, strongMagnitude: k });
  } catch (_) {}
}
// la vibration s'arrête quand la page passe en arrière-plan
document.addEventListener('visibilitychange', () => { if (document.hidden) stopRumble(); });

/* ---------- Navigation manette dans le menu visible ---------- */
// Réutilise la navigation clavier (keyboard-menu.js) : croix directionnelle
// pour parcourir, X pour valider. Ne s'active que si un menu est affiché.
function _menuNav() {
  const KM = window.KeyboardMenu;
  if (!KM || typeof KM.hasMenu !== 'function' || !KM.hasMenu()) return false;

  if (_just['UP'] || _just['LEFT']) {
    KM.move(-1);
    _just['UP'] = _just['LEFT'] = false;
  }
  if (_just['DOWN'] || _just['RIGHT']) {
    KM.move(1);
    _just['DOWN'] = _just['RIGHT'] = false;
  }
  if (_just['A']) {
    KM.activate();
    _just['A'] = false;
  }
  return true;
}

/* ---------- Raccourcis « vue d'ensemble » (maquette, hors mode jeu) ---------- */
let _warmupUntil  = 0;      // anti « appui de réveil » juste après la connexion
let _ovHintShown  = false;  // aide vue d'ensemble déjà montrée ?
const _OVERVIEW_HINT = '🎮 A jouer (drone) · Y sanctuaire · X vidéo · START menu · stick D tourner · stick G se déplacer · LT/RT zoom';

function _overviewActive() {
  if (document.body.classList.contains('mode-campaign')) return false;   // partie en cours : la vue d'ensemble (GAME / SANCTUAIRE / MENU) n'existe plus, A / Y / X ne doivent rien lancer (sinon A, qui fait avancer Tapama, démarrait le drone)
  if (window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()) return false;                 // dialogue de Tapama ouvert : il a la manette
  if (window.GameUI && window.GameUI.isOpen && window.GameUI.isOpen()) return false;   // un écran du jeu (menu, pause…) a la manette
  const stage = document.getElementById('mosqueStage');
  if (!stage || !stage.classList.contains('on')) return false;
  if (document.getElementById('arOverlay')?.classList.contains('visible')) return false;
  const ui = document.querySelector('.mq-ui');
  if (ui && ui.classList.contains('dg-hidden')) return false;   // un mode jeu est actif : il gère ses boutons
  return true;
}

function _overviewShortcuts() {
  if (!_overviewActive() || document.body.classList.contains('mode-explore')) return;   // exploration libre : A / Y / X / START ne lancent rien

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
  if (_just['Y'] && !window.__vehicleBusy) { document.querySelector('[data-action="interior"]')?.click(); _just['Y'] = false; }  // SANCTUAIRE
  if (_just['X'] || _just['RB']) document.querySelector('[data-action="video-crepissage"]')?.click();    // 🎥 vidéo
  if (_just['START']) {                                                                                  // pause (nouvelle interface) ou ancien menu 360°
    if (window.GameUI && window.GameUI.isInGame && window.GameUI.isInGame()) window.GameUI.openPause();
    else window.GameMenu.show?.();
  }
}


/* ---------- Orbite autour de la ville (vue d'ensemble, hors mode jeu) ----------
   stick droit = tourner autour (azimut) / monter-descendre (élévation) ·
   stick gauche = se déplacer dans la ville · LT/RT ou croix haut/bas = zoom ·
   clic stick droit (R3) = retour à la vue d'ensemble. */
const ORBIT = { az: 1.9, el: 1.1, pan: 0.6, zoom: 1.25, panMax: 1400 };

function _overviewOrbit(dt) {
  if (!_overviewActive()) return;
  const M = window.MosqueScene;
  if (!M || !M.loaded || M.flying || !M.controls || !M.controls.enabled) return;
  if (window.GameMenu && window.GameMenu.isOpen && window.GameMenu.isOpen()) return;
  if (document.querySelector('#mosqueVideo.open, .mq-menu-wrap.is-open, .mq-ui.info-open')) return;

  if (_just['R3'] && M.viewOverview && M.viewTarget) { M.flyTo(M.viewOverview, M.viewTarget); return; }

  const cam = M.camera, ctl = M.controls, tg = ctl.target;
  const lt = _pad && _pad.buttons[6] ? _pad.buttons[6].value : 0;
  const rt = _pad && _pad.buttons[7] ? _pad.buttons[7].value : 0;
  const zoomIn = Math.max(rt, _down['UP'] ? 1 : 0), zoomOut = Math.max(lt, _down['DOWN'] ? 1 : 0);
  const { lx, ly, rx, ry } = _state;
  if (!lx && !ly && !rx && !ry && !zoomIn && !zoomOut) return;
  M.setAutoRotate && M.setAutoRotate(false);

  // décalage caméra → cible en coordonnées sphériques
  let ox = cam.position.x - tg.x, oy = cam.position.y - tg.y, oz = cam.position.z - tg.z;
  let r = Math.hypot(ox, oy, oz) || 1;
  let theta = Math.atan2(ox, oz), phi = Math.acos(Math.max(-1, Math.min(1, oy / r)));

  theta -= rx * ORBIT.az * dt;                                       // stick droit → tourner autour de la ville
  phi = Math.max(0.12, Math.min(ctl.maxPolarAngle || 1.5, phi + ry * ORBIT.el * dt));
  r *= Math.exp((zoomOut - zoomIn) * ORBIT.zoom * dt);               // zoom
  r = Math.max(ctl.minDistance || 5, Math.min(ctl.maxDistance || 1e4, r));

  // stick gauche → déplacement horizontal du centre d'orbite, dans le sens de la caméra
  let dx = 0, dz = 0;
  if (lx || ly) {
    const fl = Math.hypot(ox, oz) || 1, fx = -ox / fl, fz = -oz / fl;       // avant (horizontal)
    const sp = ORBIT.pan * r * dt;
    dx = (fx * -ly + -fz * lx) * sp; dz = (fz * -ly + fx * lx) * sp;
    const c = M.viewTarget || tg, nx = tg.x + dx - c.x, nz = tg.z + dz - c.z, d = Math.hypot(nx, nz);
    if (d > ORBIT.panMax) { const k = ORBIT.panMax / d; dx = c.x + nx * k - tg.x; dz = c.z + nz * k - tg.z; }
  }
  tg.x += dx; tg.z += dz;
  const sp2 = Math.sin(phi);
  cam.position.set(tg.x + r * sp2 * Math.sin(theta), tg.y + r * Math.cos(phi), tg.z + r * sp2 * Math.cos(theta));
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
    stopRumble();               // coupe toute vibration restée active sur la manette
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

  if (_captured) return;     // carte ouverte : seul GamepadKit.raw la lit, ni le jeu ni les menus

  // Menus ouverts : croix directionnelle + X (consommés avant le jeu)
  if (_just['UP'] || _just['DOWN'] || _just['LEFT'] || _just['RIGHT'] || _just['A']) {
    _menuNav();
  }

  // Raccourcis de la vue d'ensemble (hors mode jeu)
  _overviewShortcuts();
  _overviewOrbit(dt);                                     // orbite autour de la ville
}
requestAnimationFrame(_poll);

/* ---------- API publique ---------- */
window.GamepadKit = {
  connected() { return !!_pad; },
  name() { return _pad ? _shortId(_pad.id) : ''; },
  state() { return _captured ? _ZERO : _state; },
  down(n) { return !_captured && !!_down[n]; },
  justPressed(n) { return !_captured && !!_just[n]; },
  capture(on) { _captured = !!on; },                    // true : le jeu ne reçoit plus la manette (ex. carte ouverte)
  raw: {                                                // lecture directe, même capturée
    state() { return _state; },
    down(n) { return !!_down[n]; },
    justPressed(n) { return !!_just[n]; },
    trigger(i) { return (_pad && _pad.buttons[i]) ? _pad.buttons[i].value : 0; },   // 6 = LT, 7 = RT (0..1)
  },
  rumble, stopRumble,
  rumbleDebug() { return { calls: _rumbleCalls, last: _rumbleLog.slice() }; },
  toast,
};
