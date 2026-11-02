/* ==========================================================
   COMMANDES TACTILES — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   Catalogue d'actions, dispositions par défaut de chaque mode
   (à pied · visée · voiture · drone), préréglages, aimantation à la
   grille, bornes, fusion des réglages du joueur et stockage
   (clé « taama.touch.v1 », avec migration / assainissement).

   Coordonnées : centre du contrôle en FRACTION de l'écran (0..1),
   en disposition « droitier » ; le mode gaucher est un miroir appliqué
   à la résolution (les réglages restent stockés côté droitier).
   Testé sous Node : tests/touch-controls.test.mjs
   ========================================================== */

export const STORAGE_KEY = 'taama.touch.v1';
export const SCHEMA = 1;
export const MODES = ['foot', 'aim', 'car', 'drone'];
export const MODE_NAMES = {
  foot:  { fr: 'À pied', en: 'On foot' },
  aim:   { fr: 'Visée du gadget', en: 'Gadget aiming' },
  car:   { fr: 'Voiture', en: 'Car' },
  drone: { fr: 'Drone', en: 'Drone' },
};

export const MODE_SHORT = {
  foot:  { fr: 'À pied', en: 'On foot' },
  aim:   { fr: 'Visée', en: 'Aim' },
  car:   { fr: 'Voiture', en: 'Car' },
  drone: { fr: 'Drone', en: 'Drone' },
};

export const LIMITS = {
  size:    { min: 0.6, max: 1.8 },    // échelle d'un contrôle (× taille de base)
  opacity: { min: 0.2, max: 1 },
  global:  { min: 0.7, max: 1.5 },    // taille globale
  look:    { min: 0.4, max: 2.2 },    // sensibilité caméra
  margin:  0.03,                      // marge mini au bord (fraction)
};
export const BASE_PX = 64;            // diamètre de base d'un bouton (≥ 48 px de cible tactile, même à l'échelle 0,75)
export const MIN_TARGET_PX = 48;      // cible tactile minimale
export const GRID = 0.025;            // pas de la grille d'aimantation (fraction de l'écran)
export const SNAP_RADIUS = 0.009;     // aimantation LÉGÈRE : seulement tout près d'une ligne de grille
export const STICK_DEADZONE = 0.12;

const ICONS_NOTE = 'les icônes SVG sont dans touch-controls.js (clé = icon)';

/* ---------- Catalogue d'actions ----------
   kind : tap (impulsion) · hold (maintenu) · latch (maintenu, ou verrou si appui bref) · toggle (bascule)
   modes : modes où l'action a un sens (liste proposée dans l'éditeur) */
export const ACTIONS = {
  jump:     { icon: 'jump',     kind: 'tap',   modes: ['foot', 'aim'], fr: 'Sauter',       en: 'Jump' },
  run:      { icon: 'run',      kind: 'latch', modes: ['foot'],        fr: 'Courir',       en: 'Run' },
  aim:      { icon: 'aim',      kind: 'latch', modes: ['foot', 'aim'], fr: 'Viser',        en: 'Aim' },
  fire:     { icon: 'fire',     kind: 'tap',   modes: ['foot', 'aim'], fr: 'Tirer',        en: 'Fire', needs: 'gadget' },
  fireSide: { icon: 'fireSide', kind: 'tap',   modes: ['foot', 'aim'], fr: 'Tir latéral',  en: 'Side shot', needs: 'gadget' },
  kneel:    { icon: 'kneel',    kind: 'tap',   modes: ['foot', 'aim'], fr: 'S’agenouiller', en: 'Kneel' },
  interact: { icon: 'interact', kind: 'tap',   modes: ['foot', 'aim', 'drone'], fr: 'Interagir', en: 'Interact', contextual: true },
  droneOn:  { icon: 'drone',    kind: 'tap',   modes: ['foot'],        fr: 'Drone',        en: 'Drone' },
  map:      { icon: 'map',      kind: 'tap',   modes: ['foot', 'aim', 'car', 'drone'], fr: 'Carte', en: 'Map' },
  photo:    { icon: 'photo',    kind: 'tap',   modes: ['foot', 'aim', 'car', 'drone'], fr: 'Photo', en: 'Photo' },
  video:    { icon: 'video',    kind: 'toggle', modes: ['foot', 'aim', 'drone'], fr: 'Vidéo', en: 'Video' },
  places:   { icon: 'places',   kind: 'tap',   modes: ['foot', 'drone'], fr: 'Lieux',      en: 'Places' },
  pause:    { icon: 'pause',    kind: 'tap',   modes: ['foot', 'aim', 'car', 'drone'], fr: 'Pause', en: 'Pause' },
  gas:      { icon: 'gas',      kind: 'hold',  modes: ['car'],         fr: 'Accélérer',    en: 'Accelerate' },
  brake:    { icon: 'brake',    kind: 'hold',  modes: ['car'],         fr: 'Frein / recul', en: 'Brake / reverse' },
  steerL:   { icon: 'left',     kind: 'hold',  modes: ['car'],         fr: 'Tourner à gauche', en: 'Steer left' },
  steerR:   { icon: 'right',    kind: 'hold',  modes: ['car'],         fr: 'Tourner à droite', en: 'Steer right' },
  handbrake: { icon: 'handbrake', kind: 'hold', modes: ['car'],        fr: 'Frein à main', en: 'Handbrake' },
  lights:   { icon: 'lights',   kind: 'tap',   modes: ['car'],         fr: 'Phares',       en: 'Headlights' },
  hazard:   { icon: 'hazard',   kind: 'tap',   modes: ['car'],         fr: 'Détresse',     en: 'Hazards' },
  view:     { icon: 'view',     kind: 'tap',   modes: ['car'],         fr: 'Changer de vue', en: 'Change view' },
  exitCar:  { icon: 'exit',     kind: 'tap',   modes: ['car'],         fr: 'Descendre',    en: 'Get out' },
  backChar: { icon: 'back',     kind: 'tap',   modes: ['drone'],       fr: 'Retour au personnage', en: 'Back to character' },
  quitDrone: { icon: 'exit',    kind: 'tap',   modes: ['drone'],       fr: 'Quitter le drone', en: 'Leave drone' },
};

/** Actions qu'un bouton peut recevoir dans un mode donné (pour le remplacement). */
export function actionsForMode(mode) {
  return Object.keys(ACTIONS).filter((id) => ACTIONS[id].modes.includes(mode));
}
export function actionLabel(id, lang = 'fr') {
  const a = ACTIONS[id];
  return a ? (lang === 'en' ? a.en : a.fr) : id;
}

/* ---------- Dispositions par défaut (droitier, paysage ≈ 844 × 390) ----------
   type : stick (analogique) · btn · pill (gâchette rectangulaire) · look (zone caméra, non déplaçable)
   key  : identifiant stable (le joueur peut remplacer l'action : `action`) */
const S = (key, action, x, y, size = 1, extra = {}) => ({ key, type: 'btn', action, x, y, size, opacity: 0.85, hidden: false, ...extra });
const P = (key, action, x, y, size = 1, extra = {}) => ({ key, type: 'pill', action, x, y, size, opacity: 0.85, hidden: false, ...extra });
const STICK = (key, role, x, y, size = 1.5) => ({ key, type: 'stick', role, action: null, x, y, size, opacity: 0.8, hidden: false, floating: true });
const LOOK = () => ({ key: 'look', type: 'look', action: null, x: 0.7, y: 0.5, size: 1, opacity: 1, hidden: false });

const FOOT = () => [
  STICK('move', 'move', 0.15, 0.68),
  LOOK(),
  S('jump',  'jump',  0.90, 0.66, 1.2),
  S('aim',   'aim',   0.77, 0.58, 1),
  S('fire',  'fire',  0.88, 0.38, 1.05),
  S('run',   'run',   0.77, 0.83, 0.95),
  S('kneel', 'kneel', 0.66, 0.84, 0.8),
  S('interact', 'interact', 0.64, 0.58, 1.25, { contextual: true }),
  S('side',  'fireSide', 0.67, 0.40, 0.8),
  S('drone', 'droneOn', 0.37, 0.88, 0.75),
  S('map',   'map',   0.48, 0.90, 0.7),
  S('photo', 'photo', 0.79, 0.10, 0.7),
  S('pause', 'pause', 0.875, 0.10, 0.7),
];
const AIM = () => [
  STICK('move', 'move', 0.15, 0.68),
  LOOK(),
  S('fire',  'fire',  0.88, 0.58, 1.5),
  S('side',  'fireSide', 0.74, 0.76, 0.95),
  S('aim',   'aim',   0.88, 0.30, 1),
  S('kneel', 'kneel', 0.70, 0.46, 0.8),
  S('jump',  'jump',  0.60, 0.80, 0.85),
  S('interact', 'interact', 0.50, 0.62, 1.15, { contextual: true }),
  S('photo', 'photo', 0.79, 0.10, 0.7),
  S('pause', 'pause', 0.875, 0.10, 0.7),
];
const CAR = () => [
  S('steerL', 'steerL', 0.10, 0.74, 1.3, { shape: 'arrow' }),
  S('steerR', 'steerR', 0.27, 0.74, 1.3, { shape: 'arrow' }),
  S('gas',    'gas',    0.90, 0.68, 1.45),
  S('brake',  'brake',  0.76, 0.80, 1.15),
  S('hand',   'handbrake', 0.78, 0.50, 0.8),
  S('lights', 'lights', 0.44, 0.88, 0.8),
  S('hazard', 'hazard', 0.54, 0.88, 0.8),
  S('view',   'view',   0.64, 0.88, 0.8),
  S('exit',   'exitCar', 0.88, 0.37, 0.85),
  S('photo',  'photo',  0.79, 0.10, 0.7),
  S('pause',  'pause',  0.875, 0.10, 0.7),
];
const DRONE = () => [
  STICK('left',  'dl', 0.14, 0.68, 1.45),     // gauche : monter / descendre + pivoter
  STICK('right', 'dr', 0.86, 0.68, 1.45),     // droite : avancer / reculer + glisser sur le côté
  S('photo', 'photo', 0.70, 0.84, 0.95),
  S('video', 'video', 0.58, 0.88, 0.8),
  S('places', 'places', 0.30, 0.88, 0.8),
  S('interact', 'interact', 0.50, 0.62, 1.2, { contextual: true }),
  S('back',  'backChar', 0.87, 0.36, 0.85),
  S('quit',  'quitDrone', 0.955, 0.34, 0.7),
  S('pause', 'pause', 0.87, 0.19, 0.7),
];
const BUILDERS = { foot: FOOT, aim: AIM, car: CAR, drone: DRONE };

export function defaultControls(mode) {
  const b = BUILDERS[mode];
  return b ? b() : [];
}

/* ---------- Bornes ---------- */
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const clampSize = (s) => clamp(num(s, 1), LIMITS.size.min, LIMITS.size.max);
export const clampOpacity = (o) => clamp(num(o, 0.85), LIMITS.opacity.min, LIMITS.opacity.max);
export const clampPos = (v) => clamp(num(v, 0.5), LIMITS.margin, 1 - LIMITS.margin);

/** Aimantation légère : ne s'accroche que si la valeur est à moins de `radius` d'une ligne de grille. */
export function snap(v, grid = GRID, radius = SNAP_RADIUS) {
  const g = Math.round(v / grid) * grid;
  return Math.abs(g - v) <= radius ? +g.toFixed(4) : v;
}

/** Diamètre en pixels d'un contrôle (jamais sous la cible tactile minimale, sauf zone caméra). */
export function sizePx(ctrl, globalScale = 1) {
  const base = ctrl.type === 'stick' ? BASE_PX * 1.9 : BASE_PX;
  return Math.round(Math.max(MIN_TARGET_PX, base * clampSize(ctrl.size) * clamp(globalScale, LIMITS.global.min, LIMITS.global.max)));
}

/* ---------- Préréglages ---------- */
export const PRESETS = {
  standard:    { fr: 'Standard droitier', en: 'Standard (right-handed)' },
  gaucher:     { fr: 'Gaucher',           en: 'Left-handed' },
  minimaliste: { fr: 'Minimaliste',       en: 'Minimal' },
  grands:      { fr: 'Grands boutons',    en: 'Big buttons' },
};
const MINIMAL_KEEP = new Set(['move', 'look', 'left', 'right', 'jump', 'fire', 'interact', 'pause', 'gas', 'brake', 'steerL', 'steerR', 'exit', 'photo', 'back', 'aim']);
const MINIMAL_HIDE_DRONE = new Set(['video', 'places', 'quit']);

/** Réglages d'un préréglage : { lefty?, globalSize?, globalOpacity?, overrides: {mode: {key: patch}} } */
export function presetSettings(name) {
  const out = { overrides: {} };
  if (name === 'gaucher') out.lefty = true;
  else out.lefty = false;
  if (name === 'grands') { out.globalSize = 1.3; }
  else out.globalSize = 1;
  if (name === 'minimaliste') {
    out.globalOpacity = 0.7;
    for (const m of MODES) {
      for (const c of defaultControls(m)) {
        const hide = c.contextual ? false : (!MINIMAL_KEEP.has(c.key) || (m === 'drone' && MINIMAL_HIDE_DRONE.has(c.key)));
        if (hide && c.type !== 'look') (out.overrides[m] = out.overrides[m] || {})[c.key] = { hidden: true };
      }
    }
  } else out.globalOpacity = 1;
  return out;
}

/* ---------- État utilisateur ---------- */
export function defaultState() {
  return {
    v: SCHEMA,
    show: 'auto',              // auto · always · never
    globalSize: 1,
    globalOpacity: 1,          // multiplie l'opacité propre de chaque contrôle
    lefty: false,
    lookSens: 1,
    haptics: true,
    grid: true,
    profiles: {},              // { mode: { key: { x?, y?, size?, opacity?, hidden?, action? } } }
  };
}

const PATCH_KEYS = ['x', 'y', 'size', 'opacity', 'hidden', 'action'];

function cleanPatch(mode, key, p) {
  if (!p || typeof p !== 'object') return null;
  const base = defaultControls(mode).find((c) => c.key === key);
  if (!base) return null;
  const o = {};
  if ('x' in p) o.x = +clampPos(p.x).toFixed(4);
  if ('y' in p) o.y = +clampPos(p.y).toFixed(4);
  if ('size' in p) o.size = clampSize(p.size);
  if ('opacity' in p) o.opacity = clampOpacity(p.opacity);
  if ('hidden' in p) o.hidden = !!p.hidden;
  if ('action' in p && typeof p.action === 'string' && base.type !== 'stick' && base.type !== 'look' &&
      ACTIONS[p.action] && ACTIONS[p.action].modes.includes(mode)) o.action = p.action;
  return Object.keys(o).length ? o : null;
}

/** Assainit n'importe quelle valeur lue du stockage (JSON invalide, ancienne version, champs inconnus). */
export function migrate(raw) {
  const d = defaultState();
  let r = raw;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (_) { return d; } }
  if (!r || typeof r !== 'object') return d;
  // v0 (sans numéro de version) : mêmes champs, on les accepte tels quels
  if (['auto', 'always', 'never'].includes(r.show)) d.show = r.show;
  d.globalSize = clamp(num(r.globalSize, 1), LIMITS.global.min, LIMITS.global.max);
  d.globalOpacity = clamp(num(r.globalOpacity, 1), LIMITS.opacity.min, 1);
  d.lefty = !!r.lefty;
  d.lookSens = clamp(num(r.lookSens, 1), LIMITS.look.min, LIMITS.look.max);
  d.haptics = r.haptics !== false;
  d.grid = r.grid !== false;
  if (r.profiles && typeof r.profiles === 'object') {
    for (const mode of MODES) {
      const src = r.profiles[mode];
      if (!src || typeof src !== 'object') continue;
      for (const key of Object.keys(src)) {
        const p = cleanPatch(mode, key, src[key]);
        if (p) (d.profiles[mode] = d.profiles[mode] || {})[key] = p;
      }
    }
  }
  return d;
}

export const serialize = (state) => JSON.stringify(migrate(state));
export const parse = (json) => migrate(json);

/* ---------- Résolution : défauts + réglages du joueur (+ miroir gaucher) ---------- */
export function resolveProfile(state, mode) {
  const st = migrate(state);
  const ov = st.profiles[mode] || {};
  return defaultControls(mode).map((c) => {
    const p = ov[c.key] || {};
    const m = { ...c };
    for (const k of PATCH_KEYS) if (k in p) m[k] = p[k];
    m.baseAction = c.action;
    m.opacityEff = clampOpacity(m.opacity * st.globalOpacity);
    if (st.lefty && c.type !== 'look') m.x = +(1 - m.x).toFixed(4);
    return m;
  });
}

/** Applique un changement à un contrôle (x/y fournis en coordonnées ÉCRAN : le miroir gaucher est inversé ici). */
export function setControl(state, mode, key, patch) {
  const st = migrate(state);
  const p = { ...patch };
  if (st.lefty && 'x' in p) p.x = 1 - p.x;
  if (st.grid) {
    if ('x' in p) p.x = snap(p.x);
    if ('y' in p) p.y = snap(p.y);
  }
  const clean = cleanPatch(mode, key, p);
  if (!clean) return st;
  st.profiles[mode] = st.profiles[mode] || {};
  st.profiles[mode][key] = { ...(st.profiles[mode][key] || {}), ...clean };
  return st;
}

export function resetControl(state, mode, key) {
  const st = migrate(state);
  if (st.profiles[mode]) {
    delete st.profiles[mode][key];
    if (!Object.keys(st.profiles[mode]).length) delete st.profiles[mode];
  }
  return st;
}

export function resetMode(state, mode) {
  const st = migrate(state);
  delete st.profiles[mode];
  return st;
}

export function resetAll(state) {
  const st = migrate(state);
  const keep = { show: st.show, haptics: st.haptics, grid: st.grid };
  return { ...defaultState(), ...keep };
}

/** Applique un préréglage : remplace les dispositions, garde Afficher / vibrations / grille. */
export function applyPreset(state, name) {
  if (!PRESETS[name]) return migrate(state);
  const base = resetAll(state);
  const p = presetSettings(name);
  base.lefty = !!p.lefty;
  base.globalSize = p.globalSize;
  base.globalOpacity = p.globalOpacity;
  for (const mode of Object.keys(p.overrides)) {
    for (const key of Object.keys(p.overrides[mode])) {
      const c = cleanPatch(mode, key, p.overrides[mode][key]);
      if (c) (base.profiles[mode] = base.profiles[mode] || {})[key] = c;
    }
  }
  return base;
}

/* ---------- Affichage : auto / toujours / jamais ---------- */
/** `?touch=1` force, `?touch=0` masque ; null si absent. */
export function touchParam(search = '') {
  const m = /[?&]touch=([^&#]*)/.exec(String(search));
  if (!m) return null;
  if (m[1] === '1' || m[1] === 'true') return true;
  if (m[1] === '0' || m[1] === 'false') return false;
  return null;
}

/** Détection fiable : pointeur principal grossier ET écran tactile (pas un PC avec écran tactile branché). */
export function isTouchDevice({ coarse = false, maxTouchPoints = 0 } = {}) {
  return !!coarse && maxTouchPoints > 0;
}

export function shouldShow({ show = 'auto', param = null, coarse = false, maxTouchPoints = 0 } = {}) {
  if (param === true) return true;
  if (param === false) return false;
  if (show === 'always') return true;
  if (show === 'never') return false;
  return isTouchDevice({ coarse, maxTouchPoints });
}

/** Nombre de contrôles masqués d'un profil (pour l'éditeur : « restaurer »). */
export function hiddenCount(state, mode) {
  return resolveProfile(state, mode).filter((c) => c.hidden && c.type !== 'look').length;
}

export const _note = ICONS_NOTE;
