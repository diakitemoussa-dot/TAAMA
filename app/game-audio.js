/* ==========================================================
   VOLUMES PAR CATÉGORIE — Options › Audio
   ----------------------------------------------------------
   Script classique, chargé avant tous les modules sonores. Il applique
   les curseurs de l'écran Options à tous les sons du jeu :

     master   volume général seul (vidéos)
     music    musique
     effects  pas, gadget, tirs, interface
     drone    hélices, scan
     ambience vent, ville

   Au réglage par défaut, le facteur vaut 1 : rien ne change par rapport
   aux volumes d'origine du jeu. Curseur à 0 = silence ; « Couper tous les
   sons » et « Couper le son en arrière-plan » coupent tout.

   Usage dans un module :
     GameAudio.track(audioElement, 'effects');   // <audio> : son volume est multiplié
     GameAudio.ctx(audioContext, 'effects');     // WebAudio : tout passe par un gain de catégorie
   ========================================================== */
(function (root) {
  'use strict';

  var KEY = 'taama.settings.v1';
  var DEFAULTS = { volume: 80, music: 60, effects: 85, drone: 70, ambience: 55, muteAll: false, muteBackground: true };
  var s = {};
  var k;
  for (k in DEFAULTS) s[k] = DEFAULTS[k];

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function merge(from) {
    if (!from || typeof from !== 'object') return;
    ['volume', 'music', 'effects', 'drone', 'ambience'].forEach(function (key) {
      if (typeof from[key] === 'number' && isFinite(from[key])) s[key] = clamp(from[key], 0, 100);
    });
    if (typeof from.muteAll === 'boolean') s.muteAll = from.muteAll;
    if (typeof from.muteBackground === 'boolean') s.muteBackground = from.muteBackground;
  }

  // réglages déjà enregistrés : actifs dès le premier son
  try { merge(JSON.parse(root.localStorage.getItem(KEY))); } catch (e) { /* mode privé : réglages par défaut */ }

  var hidden = false;
  var tracked = [];     // { el, cat, base }
  var contexts = [];    // { node, cat }

  /** Facteur appliqué à la catégorie (1 au réglage par défaut). */
  function gain(cat) {
    if (s.muteAll) return 0;
    if (hidden && s.muteBackground) return 0;
    var master = s.volume / DEFAULTS.volume;
    if (!cat || cat === 'master') return master;
    return master * (s[cat] / DEFAULTS[cat]);
  }

  function refresh() {
    tracked.forEach(function (t) { t.apply(); });
    contexts.forEach(function (c) { c.node.gain.value = clamp(gain(c.cat), 0, 2); });
  }

  /** Un <audio>/<video> : son volume (même modifié plus tard par le jeu) est multiplié par le réglage. */
  function track(el, cat) {
    if (!el || typeof HTMLMediaElement === 'undefined') return el;
    var native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'volume');
    var base = el.volume;
    var rec = {
      apply: function () { native.set.call(el, clamp(base * gain(cat), 0, 1)); },
    };
    Object.defineProperty(el, 'volume', {
      configurable: true,
      get: function () { return base; },
      set: function (v) { base = clamp(Number(v) || 0, 0, 1); rec.apply(); },
    });
    tracked.push(rec);
    rec.apply();
    return el;
  }

  /** Un AudioContext : sa sortie passe par un gain de catégorie. */
  function ctx(audioContext, cat) {
    if (!audioContext || audioContext.__gameAudio) return audioContext;
    var real = audioContext.destination;
    var node = audioContext.createGain();
    node.gain.value = clamp(gain(cat), 0, 2);
    node.connect(real);
    Object.defineProperty(audioContext, 'destination', { configurable: true, get: function () { return node; } });
    audioContext.__gameAudio = true;
    contexts.push({ node: node, cat: cat });
    return audioContext;
  }

  function set(settings) { merge(settings); refresh(); }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () { hidden = document.hidden; refresh(); });
  }

  root.GameAudio = {
    gain: gain,
    set: set,
    track: track,
    ctx: ctx,
    settings: function () { var o = {}; for (var key in s) o[key] = s[key]; return o; },
    _setHidden: function (h) { hidden = !!h; refresh(); },   // pour les tests
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
