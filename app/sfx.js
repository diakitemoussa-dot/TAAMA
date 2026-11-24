/* ==========================================================
   EFFETS SONORES — chargement paresseux de assets/audio/sfx/<nom>.mp3
   ----------------------------------------------------------
   • un seul AudioContext ; volume par catégorie « effets » (Options › Audio) via GameAudio.ctx ;
   • un fichier absent = silence (le jeu fonctionne sans les sons, ils s'ajoutent au fur et à mesure) ;
   • Sfx.play(nom, { vol, rate }) : coup unique ; Sfx.loop(nom, { vol, rate }) : boucle (réglable en continu) ; Sfx.stopLoop(nom) : arrêt en fondu.
   Les noms attendus sont listés dans NAMES (voir assets/audio/sfx/CREDITS.md).
   ========================================================== */
const BASE = 'assets/audio/sfx/';
export const NAMES = ['car-start', 'engine-loop', 'brake-skid', 'crash-light', 'crash-heavy', 'door-open', 'door-close', 'gravel-roll', 'indicator'];

let ctx = null;
const bufs = {}, loading = {}, loops = {};

function ensure() {
  if (ctx) return ctx;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    window.GameAudio?.ctx?.(ctx, 'effects');
  } catch (_) { ctx = null; }
  return ctx;
}
function load(name) {
  if (name in bufs || loading[name]) return;
  loading[name] = true;
  fetch(BASE + name + '.mp3')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((ab) => (ab && ctx ? ctx.decodeAudioData(ab) : null))
    .then((b) => { bufs[name] = b || null; })
    .catch(() => { bufs[name] = null; })
    .finally(() => { loading[name] = false; });
}
const PRELOAD = ['car-start', 'brake-skid', 'crash-light', 'crash-heavy', 'door-open', 'door-close', 'engine-loop', 'plaster-spread', 'plaster-done', 'grimpe', 'device-pickup', 'device-hum', 'device-place', 'device-unlock', 'menu-move', 'menu-enter', 'circle-enter'];   // sons déjà fournis (les autres sont optionnels)
let preloaded = false;
function buffer(name) {
  const c = ensure(); if (!c) return null;
  if (!preloaded) { preloaded = true; PRELOAD.forEach(load); }                      // premier appel : on charge tout d'un coup
  if (!(name in bufs)) { load(name); return null; }
  return bufs[name];
}

/* Sons de secours fabriqués par code : utilisés tant que le fichier mp3 correspondant n'existe pas (indicator.mp3, splash.mp3). */
const synth = {
  indicator({ vol = 1, rate = 1 } = {}) {                         // « tic » sec du clignotant (rate 1 = tic, 0,8 = toc)
    const c = ctx, t = c.currentTime, osc = c.createOscillator(), g = c.createGain();
    osc.type = 'square'; osc.frequency.value = 1500 * rate;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(g); g.connect(c.destination); osc.start(t); osc.stop(t + 0.06);
  },
  'car-bump'({ vol = 1, rate = 1 } = {}) {                         // secousse de la voiture : bruit sourd de suspension + petit cliquetis de tôle
    const c = ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110 * rate, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5 * vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.25);
    const len = Math.floor(c.sampleRate * 0.18), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700 * rate; f.Q.value = 0.9;
    const g2 = c.createGain(); g2.gain.value = 0.35 * vol;
    src.connect(f); f.connect(g2); g2.connect(c.destination); src.start(t);
  },
  'menu-move'({ vol = 1 } = {}) {                                 // défilement dans un menu : petit « tic » doux
    const c = ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1180, t); o.frequency.exponentialRampToValueAtTime(880, t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.09);
  },
  'menu-enter'({ vol = 1 } = {}) {                                // entrée dans un menu : deux notes qui montent, avec un souffle
    const c = ctx, t = c.currentTime;
    [[523, 0], [784, 0.09]].forEach(([fr, dl]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t + dl); g.gain.exponentialRampToValueAtTime(0.2 * vol, t + dl + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dl + 0.32);
      o.connect(g); g.connect(c.destination); o.start(t + dl); o.stop(t + dl + 0.36);
    });
  },
  'plaster-done'({ vol = 1 } = {}) {                              // fin du crépissage : deux notes douces qui montent
    const c = ctx, t = c.currentTime;
    [[660, 0], [990, 0.16]].forEach(([fr, dl]) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = fr;
      g.gain.setValueAtTime(0.0001, t + dl); g.gain.exponentialRampToValueAtTime(0.25 * vol, t + dl + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + dl + 0.9);
      o.connect(g); g.connect(c.destination); o.start(t + dl); o.stop(t + dl + 1);
    });
  },
  splash({ vol = 1, rate = 1 } = {}) {                            // éclaboussure : bruit filtré dont la hauteur descend
    const c = ctx, t = c.currentTime, dur = 0.75, len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.6);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(2400 * rate, t); f.frequency.exponentialRampToValueAtTime(450 * rate, t + dur);
    const g = c.createGain(); g.gain.value = 0.8 * vol;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start(t);
  },
};

export function play(name, { vol = 1, rate = 1 } = {}) {
  const b = buffer(name);
  if (!b) {
    if (synth[name] && ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); synth[name]({ vol, rate }); }
    return;
  }
  const c = ctx;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = b; src.playbackRate.value = rate; g.gain.value = vol;
  src.connect(g); g.connect(c.destination); src.start();
}

/** Le son est-il chargé et prêt ? (déclenche son chargement la première fois ; faux si le fichier n'existe pas) */
export function has(name) {
  if (!ensure()) return false;
  if (!(name in bufs)) { load(name); return false; }
  return !!bufs[name];
}

/* Boucles de secours fabriquées par code (tant que le fichier mp3 n'existe pas). */
const synthLoop = {
  'plaster-spread'(c) {                                           // frottement de terre humide : bruit grave filtré
    const len = Math.floor(c.sampleRate * 1.6), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; d[i] = last * 6; }
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
    const g = c.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
    return { src, g };
  },
};

export function loop(name, { vol = 1, rate = 1 } = {}) {
  const L = loops[name];
  if (L) { L.g.gain.setTargetAtTime(vol, ctx.currentTime, 0.1); L.src.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.1); return; }
  const b = buffer(name);
  if (!b) {
    if (synthLoop[name] && ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const s = synthLoop[name](ctx); s.g.gain.value = vol * 0.5; s.src.playbackRate.value = rate; loops[name] = s;
    }
    return;
  }
  const c = ctx;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = b; src.loop = true; src.playbackRate.value = rate; g.gain.value = vol;
  src.connect(g); g.connect(c.destination); src.start();
  loops[name] = { src, g };
}

/** Joue un son long une seule fois et rend une poignée { stop(fondu) } (ex. la bande-son de la vidéo du grimpage). Rend null si le son n'est pas prêt. */
export function track(name, { vol = 1, offset = 0 } = {}) {
  const b = buffer(name); if (!b) return null;
  const c = ctx;
  if (c.state === 'suspended') c.resume().catch(() => {});
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = b; g.gain.value = vol;
  src.connect(g); g.connect(c.destination); src.start(0, Math.max(0, Math.min(offset, b.duration - 0.05)));
  return { stop(fade = 0.3) { try { g.gain.setTargetAtTime(0, c.currentTime, Math.max(0.01, fade / 3)); src.stop(c.currentTime + fade + 0.05); } catch (_) {} } };
}

/** Son de réussite d'une mission. Plusieurs événements de fin se suivent souvent (fin de mission puis séquence validée) : un seul son par fenêtre de 20 s. */
let lastMission = -1e9, holdUntil = 0;
/** Retient le son de réussite quelques secondes (ex. le temps du son de ramassage d'un dispositif). */
export function holdMission(ms = 2600) { holdUntil = performance.now() + ms; }
export function missionDone() {
  const now = performance.now();
  if (now - lastMission < 20000) return;
  lastMission = now;
  const wait = Math.max(0, holdUntil - now);
  if (wait > 0) setTimeout(() => play('plaster-done', { vol: 0.9 }), wait); else play('plaster-done', { vol: 0.9 });
}

export function stopLoop(name, fade = 0.2) {
  const L = loops[name]; if (!L || !ctx) return;
  delete loops[name];
  L.g.gain.setTargetAtTime(0, ctx.currentTime, Math.max(0.01, fade / 3));
  try { L.src.stop(ctx.currentTime + fade + 0.05); } catch (_) {}
}

/* Préchargement : tous les sons sont décodés dès la première touche ou le premier clic (le navigateur exige un geste pour l'audio),
   pour que le premier démarrage, la première portière ou le premier choc ne soient pas muets. */
function preloadAll() { if (ensure()) { preloaded = true; PRELOAD.forEach(load); } }
// le navigateur peut suspendre le contexte audio : on le relance à chaque geste du joueur
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); }, true));
['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, preloadAll, { once: true, capture: true }));

/** Diagnostic (console du navigateur) : Sfx.debug() = état du contexte et des sons chargés ; Sfx.test() = joue les sons un par un. */
function debug() {
  const loaded = {};
  PRELOAD.forEach((n) => { loaded[n] = !(n in bufs) ? (loading[n] ? 'chargement…' : 'non demandé') : (bufs[n] ? bufs[n].duration.toFixed(2) + ' s' : 'INTROUVABLE'); });
  return { contexte: ctx ? ctx.state : 'absent', volumeEffets: window.GameAudio ? window.GameAudio.gain('effects') : 'GameAudio absent', sons: loaded };
}
function test() {
  preloadAll();
  PRELOAD.forEach((n, i) => setTimeout(() => { console.info('[Sfx] test :', n); play(n, { vol: 1 }); }, 1500 + i * 2500));
  return 'Test lancé : 6 sons, un toutes les 2,5 s (tapez Sfx.debug() pour l’état)';
}

window.Sfx = { play, loop, stopLoop, track, missionDone, holdMission, has, NAMES, preload: preloadAll, debug, test };
