/* ============================================================
   NIVEAU DE QUALITÉ SELON L'APPAREIL
   ------------------------------------------------------------
   'low'  : mobile d'entrée de gamme (peu de mémoire / de cœurs / GPU faible) = « Économie »
   'mid'  : mobile / tablette standard
   'high' : ordinateur ou mobile très puissant (rendu d'origine, inchangé)

   Forçable : ?quality=low|mid|high (ou ?q=…), Options › Affichage › Qualité (clé taama.quality),
   ou dans la console : Quality.force('low') / Quality.force(null) puis recharger.
   Console : Quality.level, Quality.reason, Quality.preset.
   Logique pure (les entrées sont passées en paramètre) pour rester testable.
   ============================================================ */

export const QUALITY_LEVELS = ['low', 'mid', 'high'];

/**
 * Réglages par niveau.
 *  tilesDir      jeu de tuiles de la mosquée
 *  maxPixelRatio plafond de la résolution de rendu (le GPU paie ×dpr²)
 *  minPixelRatio plancher de la résolution dynamique (0 = pas de résolution dynamique)
 *  shadows / shadowSize / shadowType  ombres du soleil (taille de carte, filtre)
 *  headlights    vrais projecteurs de la voiture + plafonnier (sinon cônes émissifs seuls)
 *  baseLights    nombre de lumières bleues de la base Néantis (3 d'origine)
 *  tile*         streaming des tuiles : rayons de chargement/libération (m), requêtes simultanées
 *  mobileMedia   vidéos allégées + audio chargé à la demande
 */
export const QUALITY_PRESETS = {
  low:  { tilesDir: 'tiles-mobile', maxPixelRatio: 1,   minPixelRatio: 0.6,  shadows: false, shadowSize: 1024, shadowType: 'basic',
          headlights: false, baseLights: 1, tileLoad: 180, tileUnload: 230, tileConcurrent: 3, mobileMedia: true },
  mid:  { tilesDir: 'tiles-mobile', maxPixelRatio: 1.5, minPixelRatio: 0.75, shadows: true,  shadowSize: 2048, shadowType: 'pcf',
          headlights: true,  baseLights: 3, tileLoad: 220, tileUnload: 280, tileConcurrent: 4, mobileMedia: true },
  high: { tilesDir: 'tiles',        maxPixelRatio: 2,   minPixelRatio: 0,    shadows: true,  shadowSize: 4096, shadowType: 'pcfsoft',
          headlights: true,  baseLights: 3, tileLoad: 260, tileUnload: 320, tileConcurrent: 6, mobileMedia: false },
};

/** GPU de téléphone peu puissant, d'après la chaîne WEBGL_debug_renderer_info. */
export function isWeakGpu(gpu) {
  if (!gpu || typeof gpu !== 'string') return false;
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software/.test(g)) return false;       // rendu logiciel de test : on ne juge pas
  if (/mali-?4\d\d|mali-?t\d|mali-?g[3-5]\d?\b/.test(g)) return true;
  if (/adreno\D{0,12}[1-5]\d\d\b/.test(g)) return true;
  if (/powervr|sgx|apple a(?:[789]|1[0-2])\b/.test(g)) return true;
  return false;
}

/**
 * Choisit le palier ET dit pourquoi.
 * @param {{ forced?: string|null, coarsePointer?: boolean, memoryGB?: number,
 *           cores?: number, gpu?: string }} env
 * @returns {{ level: string, reason: string }}
 */
export function pickQualityDetail(env = {}) {
  const { forced = null, coarsePointer = false, memoryGB, cores, gpu } = env;
  if (forced && QUALITY_LEVELS.includes(forced)) return { level: forced, reason: 'forcé (URL ou Options)' };
  if (!coarsePointer) return { level: 'high', reason: 'ordinateur (pointeur précis)' };
  // iOS / Safari ne donnent pas deviceMemory (tous les iPhone récents sont puissants) :
  // on s'appuie alors sur les cœurs ; la baisse auto selon les FPS couvre le reste.
  if (typeof memoryGB === 'number' && memoryGB <= 4) return { level: 'low', reason: `mémoire ${memoryGB} Go` };
  if (typeof cores === 'number' && cores <= 4) return { level: 'low', reason: `${cores} cœurs` };
  if (isWeakGpu(gpu)) return { level: 'low', reason: `GPU modeste (${gpu})` };
  return { level: 'mid', reason: 'mobile standard' };
}

export function pickQuality(env = {}) { return pickQualityDetail(env).level; }

/** Qualité choisie par le joueur dans Options › Affichage (« auto » = aucune valeur enregistrée). */
export function storedQuality(win = window) {
  try { return win.localStorage.getItem('taama.quality'); } catch (_) { return null; }
}

/** Chaîne du GPU (WEBGL_debug_renderer_info), mise en cache ; '' si indisponible. */
let _gpu = null;
function readGpu(win) {
  if (_gpu !== null) return _gpu;
  _gpu = '';
  try {
    const c = win.document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) _gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
    if (gl) { const l = gl.getExtension('WEBGL_lose_context'); if (l) l.loseContext(); }
  } catch (_) {}
  return _gpu;
}

/** Lit l'environnement réel du navigateur : { level, reason }. */
export function detectQualityDetail(win = window) {
  const nav = win.navigator || {};
  const params = new URLSearchParams(win.location ? win.location.search : '');
  const stored = storedQuality(win);
  const forced = params.get('quality') || params.get('q') || (stored !== 'auto' ? stored : null);
  const coarsePointer = !!(win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
  const env = { forced, coarsePointer, memoryGB: nav.deviceMemory, cores: nav.hardwareConcurrency };
  let d = pickQualityDetail(env);
  if (d.level === 'mid' && win.document) d = pickQualityDetail({ ...env, gpu: readGpu(win) });  // sonde GPU : seulement en cas de doute
  return d;
}

let _logged = '';
export function detectQuality(win = window) {
  const d = detectQualityDetail(win);
  const key = d.level + '|' + d.reason;
  if (key !== _logged) { _logged = key; try { console.info(`[Qualité] palier=${d.level} raison=${d.reason}`); } catch (_) {} }
  return d.level;
}

/**
 * Résolution dynamique : mesure le temps de frame sur une fenêtre de 2 s ;
 * < 40 fps -> un cran de résolution en moins ; >= 55 fps pendant 2 fenêtres de suite -> un cran de plus.
 * Les frames très longues (> 0,5 s : onglet masqué, chargement) sont ignorées.
 * update() renvoie le nouveau ratio, ou null s'il ne change pas.
 */
export function createDynamicRes({ min, max, step = 0.25, windowSec = 2, lowFps = 40, highFps = 55 }) {
  const st = { pr: max, t: 0, n: 0, good: 0 };
  return {
    get pr() { return st.pr; },
    reset(newMax) { if (newMax) max = newMax; st.pr = max; st.t = st.n = st.good = 0; },
    update(dt) {
      if (!(min > 0) || !(dt > 0) || dt > 0.5) return null;
      st.t += dt; st.n++;
      if (st.t < windowSec) return null;
      const fps = st.n / st.t; st.t = 0; st.n = 0;
      let next = st.pr;
      if (fps < lowFps) { next = Math.max(min, st.pr - step); st.good = 0; }
      else if (fps >= highFps) { if (++st.good >= 2) { next = Math.min(max, st.pr + step); st.good = 0; } }
      else st.good = 0;
      if (next === st.pr) return null;
      st.pr = next; return next;
    },
  };
}

/** Réglages du streaming de tuiles (rayons, requêtes simultanées) par palier : borne la mémoire GPU. */
export function tileBudget(level) {
  const p = QUALITY_PRESETS[level] || QUALITY_PRESETS.high;
  return { loadRadius: p.tileLoad, unloadRadius: p.tileUnload, maxConcurrent: p.tileConcurrent };
}

/* ============================================================
   RÉSEAU : palier d'octets ('slow' | 'medium' | 'fast'), indépendant du palier GPU.
   Le réseau décide des octets / chargements ; l'appareil décide du rendu.
   ============================================================ */

const CITY_FULL = 'djenne-ville-leger.glb', CITY_LIGHT = 'djenne-ville-leger-mobile.glb';
export const NET_LEVELS = ['slow', 'medium', 'fast'];

/** Seuils (Mb/s) d'un débit MESURÉ. Descente : < slowBelow ; remontée seulement au-dessus de slowUp (hystérésis). */
export const NET_THRESHOLDS = { slowBelow: 1.5, slowUp: 2.0, fastAbove: 6, fastDown: 4 };
/** `navigator.connection.downlink` est une estimation grossière, plafonnée à 10 et peu fiable au démarrage de Chrome :
 *  seuils plus bas, pour ne jamais prendre un bon réseau pour un réseau lent. */
export const CONN_THRESHOLDS = { slowBelow: 0.7, slowUp: 1.0, fastAbove: 5, fastDown: 3.5 };

/** Classe une mesure instantanée. current = palier actuel (pour l'hystérésis). */
export function classifyNet({ effectiveType, downlink, saveData, mbps } = {}, current = null) {
  if (saveData === true) return 'slow';
  if (effectiveType === 'slow-2g' || effectiveType === '2g' || effectiveType === '3g') return 'slow';
  const T = typeof mbps === 'number' ? NET_THRESHOLDS : CONN_THRESHOLDS;
  const v = typeof mbps === 'number' ? mbps : (typeof downlink === 'number' ? downlink : null);
  if (v === null) return current || 'fast';                       // inconnu : comportement normal du palier
  if (current === 'slow') { if (v < T.slowUp) return 'slow'; }
  else if (v < T.slowBelow) return 'slow';
  if (current === 'fast') return v >= T.fastDown ? 'fast' : 'medium';
  return v >= T.fastAbove ? 'fast' : 'medium';
}

/** Débit (Mb/s) à partir de transferts [{start,end,bytes}] (ms) : octets / temps où au moins un transfert était actif. */
export function estimateMbps(entries) {
  const e = (entries || []).filter((x) => x && x.bytes > 0 && x.end > x.start).sort((a, b) => a.start - b.start);
  if (!e.length) return null;
  let busy = 0, bytes = 0, curS = e[0].start, curE = e[0].end;
  for (const x of e) {
    bytes += x.bytes;
    if (x.start > curE) { busy += curE - curS; curS = x.start; curE = x.end; } else curE = Math.max(curE, x.end);
  }
  busy += curE - curS;
  return busy > 20 ? (bytes * 8) / 1000 / busy : null;            // octets*8 / ms / 1000 = Mb/s
}

/**
 * Suivi du palier réseau : moyenne mobile exponentielle + hystérésis temporelle
 * (il faut `confirm` verdicts consécutifs identiques pour changer ; saveData = immédiat).
 */
export function createNetTracker({ initial = 'fast', alpha = 0.35, confirm = 2, onChange } = {}) {
  const st = { level: initial, mbps: null, pending: null, count: 0 };
  return {
    get level() { return st.level; },
    get mbps() { return st.mbps; },
    push(sample = {}) {
      if (typeof sample.mbps === 'number') st.mbps = st.mbps === null ? sample.mbps : st.mbps + alpha * (sample.mbps - st.mbps);
      if (sample.saveData === true) {
        st.pending = null; st.count = 0;
        if (st.level !== 'slow') { st.level = 'slow'; onChange && onChange('slow'); }
        return st.level;
      }
      const verdict = classifyNet({ ...sample, mbps: st.mbps === null ? undefined : st.mbps }, st.level);
      if (verdict === st.level) { st.pending = null; st.count = 0; return st.level; }
      if (verdict === st.pending) st.count++; else { st.pending = verdict; st.count = 1; }
      if (st.count >= confirm) { st.level = verdict; st.pending = null; st.count = 0; onChange && onChange(st.level); }
      return st.level;
    },
    force(level) { if (NET_LEVELS.includes(level)) { st.level = level; st.pending = null; st.count = 0; onChange && onChange(level); } },
  };
}

/** Effets du palier réseau sur les octets (le rendu n'en dépend pas). */
export function netPlan(net) {
  switch (net) {
    case 'slow':   return { net, tilesDir: 'tiles-mobile', radiusFactor: 0.6,  concurrent: 2,    bytesPerSec: 150e3, lightMedia: true,  deferHeavyAudio: true,  speculativePreload: false };
    case 'medium': return { net, tilesDir: null,           radiusFactor: 0.85, concurrent: 4,    bytesPerSec: 600e3, lightMedia: false,  deferHeavyAudio: true,  speculativePreload: false };
    default:       return { net: 'fast', tilesDir: null,   radiusFactor: 1,    concurrent: null, bytesPerSec: 0,     lightMedia: false, deferHeavyAudio: false, speculativePreload: true };
  }
}

/**
 * Combine appareil et réseau SÉPARÉMENT : render = palier GPU ; bytes = le plus économe des deux pour les octets.
 * @returns {{ render: string, bytes: object }}
 */
export function combineQuality(deviceLevel, net) {
  const dev = QUALITY_PRESETS[deviceLevel] || QUALITY_PRESETS.high;
  const plan = netPlan(net);
  const lightDevice = deviceLevel !== 'high';
  return {
    render: deviceLevel,
    bytes: {
      net: plan.net,
      tilesDir: plan.tilesDir || dev.tilesDir,
      cityGlb: (lightDevice || plan.net === 'slow') ? CITY_LIGHT : CITY_FULL,    // ville : textures réduites (2,2 Mo / 18 Mo GPU) sur mobile ou réseau lent ; PC en réseau moyen : intacte
      radiusFactor: plan.radiusFactor,
      concurrent: plan.concurrent === null ? dev.tileConcurrent : Math.min(plan.concurrent, dev.tileConcurrent),
      bytesPerSec: plan.bytesPerSec,
      lightMedia: plan.lightMedia || (lightDevice && dev.mobileMedia),
      deferHeavyAudio: plan.deferHeavyAudio || lightDevice,
      speculativePreload: plan.speculativePreload && !lightDevice,
    },
  };
}

/* ---------- Réseau réel du navigateur ---------- */
const NET_ADAPT_KEY = 'taama.netAdapt', SAVE_DATA_KEY = 'taama.saveData';
function lsGet(win, k) { try { return win.localStorage.getItem(k); } catch (_) { return null; } }

/** Options joueur : adapter selon la connexion (défaut oui) / économiser mes données (défaut non) / ?net= en URL. */
export function netPrefs(win = window) {
  const params = new URLSearchParams(win.location ? win.location.search : '');
  const f = params.get('net');
  return {
    adapt: lsGet(win, NET_ADAPT_KEY) !== '0',
    saveData: lsGet(win, SAVE_DATA_KEY) === '1',
    forced: NET_LEVELS.includes(f) ? f : null,
  };
}

let _tracker = null, _src = 'inconnu', _prefs = null;
function readConn(win) {
  const c = win.navigator && (win.navigator.connection || win.navigator.mozConnection || win.navigator.webkitConnection);
  return c ? { effectiveType: c.effectiveType, downlink: c.downlink, rtt: c.rtt, saveData: c.saveData === true } : null;
}

/** Démarre le suivi (idempotent, non bloquant). */
export function startNetWatch(win = window) {
  if (_tracker) return _tracker;
  _prefs = netPrefs(win);
  const emit = (lvl) => { try { win.dispatchEvent(new win.CustomEvent('quality:net', { detail: { net: lvl, mbps: _tracker && _tracker.mbps } })); } catch (_) {} };
  _tracker = createNetTracker({ initial: 'fast', onChange: emit });
  const conn = readConn(win);
  const sample = () => { const c = readConn(win); if (c) _tracker.push({ ...c, saveData: c.saveData || _prefs.saveData }); };
  if (_prefs.forced) { _src = 'URL ?net='; _tracker.force(_prefs.forced); return _tracker; }
  if (conn) {
    _src = 'navigator.connection';
    sample(); sample();
    try { (win.navigator.connection || win.navigator.mozConnection).addEventListener('change', sample); } catch (_) {}
  } else {
    // Safari / Firefox : débit mesuré sur les vrais téléchargements du jeu (PerformanceResourceTiming), jamais bloquant
    _src = 'mesure PerformanceResourceTiming';
    if (_prefs.saveData) _tracker.push({ saveData: true });
    try {
      const recent = [];
      const po = new win.PerformanceObserver((list) => {
        const now = win.performance.now();
        for (const e of list.getEntries()) {
          if (e.transferSize > 60000 && e.responseEnd > e.requestStart) recent.push({ start: e.requestStart, end: e.responseEnd, bytes: e.transferSize });
        }
        while (recent.length && recent[0].end < now - 8000) recent.shift();
        const mbps = estimateMbps(recent);
        if (mbps !== null) _tracker.push({ mbps, saveData: _prefs.saveData });
      });
      po.observe({ type: 'resource', buffered: true });
    } catch (_) {}
  }
  return _tracker;
}

/** Palier réseau effectif (tient compte de « Adapter selon la connexion » et « Économiser mes données »). */
export function currentNet(win = window) {
  const t = startNetWatch(win);
  if (_prefs.forced) return t.level;
  if (_prefs.saveData) return 'slow';
  if (!_prefs.adapt) return 'fast';
  return t.level;
}

/** Plan d'octets courant = réseau + appareil. */
export function currentBytesPlan(win = window) {
  return combineQuality(detectQualityDetail(win).level, currentNet(win)).bytes;
}

/** Médias allégés quand le plan d'octets le demande (vidéo 960 px, son de drone limité aux 100 s utiles). */
export const MEDIA = {
  introVideo: { full: 'assets/videos/intro-drone format pc.mp4', light: 'assets/videos/intro-drone format pc-leger.mp4' },
  dronePart:  { full: 'assets/audio/sound_for_drone_part.mp3',   light: 'assets/audio/sound_for_drone_part-leger.mp3' },
};
export function mediaUrl(name, win = window) {
  const m = MEDIA[name]; if (!m) return '';
  let light = false;
  try { light = currentBytesPlan(win).lightMedia; } catch (_) {}
  return light ? m.light : m.full;
}

function prefsChanged(win) {
  _prefs = netPrefs(win);
  const n = currentNet(win);
  win.dispatchEvent(new win.CustomEvent('quality:net', { detail: { net: n } }));
  return n;
}

if (typeof window !== 'undefined') {
  try { startNetWatch(window); } catch (_) {}
  window.Quality = {
    get level() { return detectQualityDetail(window).level; },
    get reason() { return detectQualityDetail(window).reason; },
    get preset() { return QUALITY_PRESETS[detectQualityDetail(window).level]; },
    net() { return currentNet(window); },
    plan() { return currentBytesPlan(window); },
    media(name) { return mediaUrl(name, window); },
    debug() {
      const d = detectQualityDetail(window);
      return { palier: d.level, raison: d.reason, reseau: currentNet(window), debitMbps: _tracker && _tracker.mbps, source: _src, connexion: readConn(window), prefs: _prefs, octets: currentBytesPlan(window) };
    },
    force(l) { try { l ? localStorage.setItem('taama.quality', l) : localStorage.removeItem('taama.quality'); } catch (_) {} return 'recharge la page pour appliquer'; },
    saveData(on) { try { on ? localStorage.setItem(SAVE_DATA_KEY, '1') : localStorage.removeItem(SAVE_DATA_KEY); } catch (_) {} return prefsChanged(window); },
    adapt(on) { try { on ? localStorage.removeItem(NET_ADAPT_KEY) : localStorage.setItem(NET_ADAPT_KEY, '0'); } catch (_) {} return prefsChanged(window); },
  };
}
