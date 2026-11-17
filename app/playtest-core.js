/* ==========================================================
   SÉANCES DE TEST — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   Utilisée par l'enregistreur en jeu (app/playtest.js), par le
   serveur (server/playtest-handler.mjs) et par la page de rapport
   (tools/playtest-rapport.html).

   Une session = un joueur, du lancement du jeu jusqu'à
   « Joueur suivant ». Chaque événement : { t, k, d }
     t  millisecondes depuis le début de la session
     k  type (ecran, action, profil, sequence, evt, dialogue, aide, clic…)
     d  détails (facultatif)
   ========================================================== */

export const FORMAT = 'taama-playtest';
export const VERSION = 1;

/* Clés de stockage du mode test : « taamaTest. » ne commence PAS par « taama. »,
   elles survivent donc à la remise à zéro du jeu. */
export const TEST_PREFIX = 'taamaTest.';
export const FLAG_KEY = 'taamaTest.on';
export const CURRENT_KEY = 'taamaTest.current';
export const ARCHIVE_KEY = 'taamaTest.archive';

/** Préfixes des données du jeu effacées pour chaque nouveau joueur (progression, profil, réglages, guide…). */
export const GAME_PREFIXES = ['taama.', 'djenne.'];

export const IDLE_MS = 30000;          // 30 s sans aucune action = « inactif »
export const RAGE_WINDOW_MS = 1500;    // 4 clics en 1,5 s au même endroit = signe d'agacement
export const RAGE_CLICKS = 4;
export const RAGE_DIST = 0.06;         // distance en fraction de l'écran

/** Clés du jeu à effacer (jamais celles du mode test ni celles d'autres sites hébergés au même endroit). */
export function gameKeysToWipe(keys) {
  return (keys || []).filter((k) => typeof k === 'string' && !k.startsWith(TEST_PREFIX) && GAME_PREFIXES.some((p) => k.startsWith(p)));
}

/** Le mode test est-il demandé ? ?test=1 l'active (et s'en souvient), ?test=0 le coupe. */
export function testModeFromUrl(search, flag) {
  const m = /[?&]test=([^&]*)/.exec(search || '');
  if (m) return m[1] !== '0' && m[1] !== 'false';
  return flag === '1';
}

/* ---------------- Appareil ---------------- */

export function deviceType({ coarse = false, width = 1280, height = 720 } = {}) {
  if (!coarse) return 'Ordinateur';
  return Math.min(width, height) >= 600 ? 'Tablette' : 'Téléphone';
}

export function osName(ua = '') {
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPod/i.test(ua)) return 'iOS';
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) return 'iPadOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/CrOS/i.test(ua)) return 'ChromeOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Autre';
}

export function browserName(ua = '') {
  if (/Edg\//i.test(ua)) return 'Edge';
  if (/OPR\/|Opera/i.test(ua)) return 'Opera';
  if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet';
  if (/Firefox|FxiOS/i.test(ua)) return 'Firefox';
  if (/Chrome|CriOS/i.test(ua)) return 'Chrome';
  if (/Safari/i.test(ua)) return 'Safari';
  return 'Autre';
}

export function describeDevice({ coarse, width, height, ua, dpr } = {}) {
  return {
    type: deviceType({ coarse, width, height }),
    os: osName(ua),
    browser: browserName(ua),
    screen: `${Math.round(width || 0)}×${Math.round(height || 0)}`,
    dpr: Number.isFinite(dpr) ? Math.round(dpr * 100) / 100 : 1,
    touch: !!coarse,
  };
}

/* ---------------- Session ---------------- */

export function newSessionId(rand = Math.random) {
  const h = () => Math.floor(rand() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-${h()}`;
}

export function newSession({ id, nowIso, device = null, url = '' }) {
  return { format: FORMAT, v: VERSION, id, startedAt: nowIso, endedAt: null, device, player: null, url, events: [], notes: '', sentAt: null };
}

/** Une session lue (stockage, fichier, serveur) est-elle utilisable ? */
export function isSession(s) {
  return !!(s && typeof s === 'object' && s.format === FORMAT && typeof s.id === 'string' && /^[\w-]{4,40}$/.test(s.id)
    && typeof s.startedAt === 'string' && Array.isArray(s.events));
}

/** Nom de fichier sûr : « 2026-11-13_1432_Awa_ab12cd34.json » */
export function sessionFileName(s) {
  const d = new Date(s.startedAt);
  const ok = !Number.isNaN(d.getTime());
  const p2 = (n) => String(n).padStart(2, '0');
  const day = ok ? `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}` : 'date-inconnue';
  const hm = ok ? `${p2(d.getHours())}${p2(d.getMinutes())}` : '0000';
  const name = safeName(s.player && s.player.name) || 'sans-nom';
  return `${day}_${hm}_${name}_${String(s.id).replace(/[^\w-]/g, '').slice(0, 8)}.json`;
}

export function safeName(n) {
  return String(n || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
}

/* ---------------- Étapes clés du chapitre 1 ---------------- */

/** Dans l'ordre du jeu. `match(e)` reconnaît l'événement qui marque l'étape. */
export const MILESTONES = [
  { id: 'profil', label: 'Nom saisi', match: (e) => e.k === 'profil' },
  { id: 'nouvelle', label: 'Nouvelle partie lancée', match: (e) => e.k === 'nouvelle-partie' },
  { id: 'ouverture', label: 'Appel de Tapama terminé', match: (e) => e.k === 'evt' && e.d && e.d.n === 'taama:ouverture-fin' },
  { id: 'repere', label: 'Dispositif 1 repéré au drone', match: (e) => e.k === 'evt' && e.d && e.d.n === 'dispositif1:spotted' },
  { id: 'active', label: 'Dispositif 1 activé', match: (e) => e.k === 'evt' && e.d && e.d.n === 'dispositif1:active' },
  { id: 'pris', label: 'Dispositif 1 récupéré', match: (e) => e.k === 'evt' && e.d && e.d.n === 'dispositif1:taken' },
  { id: 'labo', label: 'Laboratoire ouvert', match: (e) => e.k === 'evt' && e.d && e.d.n === 'lab:open' },
  { id: 'enigme', label: 'Première énigme résolue', match: (e) => e.k === 'evt' && e.d && e.d.n === 'lab:enigme-resolue' },
  { id: 'labofin', label: 'Laboratoire terminé', match: (e) => e.k === 'evt' && e.d && e.d.n === 'lab:done' },
  { id: 'dossier', label: 'Dossier terminé', match: (e) => e.k === 'evt' && e.d && e.d.n === 'dossier:done' },
  { id: 'base', label: 'Dispositif 2 (base Néantis)', match: (e) => e.k === 'evt' && e.d && e.d.n === 'neantis:dispositif' },
  { id: 'fin', label: 'Fin du chapitre 1', match: (e) => (e.k === 'sequence' && e.d && e.d.n >= 13) || (e.k === 'evt' && e.d && e.d.n === 'taama:chapitre1-fin') },
];

/* ---------------- Résumé d'une session ---------------- */

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Transforme la liste brute d'événements en indicateurs lisibles. */
export function summarize(session) {
  const ev = (session.events || []).filter((e) => e && Number.isFinite(e.t)).sort((a, b) => a.t - b.t);
  const end = session.endedAt && session.startedAt
    ? Math.max(0, Date.parse(session.endedAt) - Date.parse(session.startedAt))
    : (ev.length ? ev[ev.length - 1].t : 0);
  const durationMs = Math.max(end, ev.length ? ev[ev.length - 1].t : 0);

  const out = {
    id: session.id,
    name: (session.player && session.player.name) || '',
    age: session.player && Number.isFinite(session.player.age) ? session.player.age : null,
    device: (session.device && session.device.type) || '?',
    os: (session.device && session.device.os) || '?',
    browser: (session.device && session.device.browser) || '?',
    screen: (session.device && session.device.screen) || '',
    startedAt: session.startedAt,
    finished: !!session.endedAt,
    notes: typeof session.notes === 'string' ? session.notes.trim() : '',
    durationMs,
    activeMs: durationMs,
    idleMs: 0, idleCount: 0, hiddenMs: 0,
    milestones: {},                 // id -> t (première fois)
    milestonesReached: 0,
    lastMilestone: null,
    maxSequence: null,
    sequences: {},                  // n -> t
    screens: {},                    // lieu -> ms
    dialogues: 0, dialoguesSkipped: 0, dialogueReadMs: [],
    radios: 0, tips: 0,
    helpRequests: 0, guideOpens: 0,
    labWrong: 0, labHints: 0, labAutoHints: 0, labSolved: 0,
    pauses: 0, reloads: 0,
    clicks: 0, rageClicks: 0, keys: 0,
    errors: 0, errorMessages: [],
    fps: { median: null, min: null },
    lowFpsMs: 0,
    actions: {},
  };

  let place = 'démarrage';
  let placeSince = 0;
  const addPlace = (until) => { out.screens[place] = (out.screens[place] || 0) + Math.max(0, until - placeSince); };
  const setPlace = (p, t) => { if (p === place) return; addPlace(t); place = p; placeSince = t; };

  let hiddenSince = null;
  const hiddenSpans = [];
  const idleSpans = [];
  const dialogueStart = {};
  const recentClicks = [];
  const fpsVals = [];
  let lastFpsT = null, lastFpsLow = false;
  const errSet = new Set();

  for (const e of ev) {
    const d = e.d || {};
    switch (e.k) {
      case 'ecran': setPlace(`écran : ${d.id}`, e.t); break;
      case 'jeu': setPlace('en jeu', e.t); break;
      case 'pause': out.pauses++; setPlace('écran : pause', e.t); break;
      case 'reprise': setPlace('en jeu', e.t); break;
      case 'action': out.actions[d.name] = (out.actions[d.name] || 0) + 1; break;
      case 'sequence':
        if (Number.isInteger(d.n)) {
          if (!(d.n in out.sequences)) out.sequences[d.n] = e.t;
          out.maxSequence = Math.max(out.maxSequence || 0, d.n);
        }
        break;
      case 'dialogue':
        if (d.phase === 'debut') { dialogueStart[d.id || '?'] = e.t; out.dialogues++; }
        else if (d.phase === 'fin') {
          if (d.skipped) out.dialoguesSkipped++;
          const s = dialogueStart[d.id || '?'];
          if (Number.isFinite(s)) out.dialogueReadMs.push(e.t - s);
        }
        break;
      case 'radio': out.radios++; break;
      case 'astuce': out.tips++; break;
      case 'aide': out.helpRequests++; break;
      case 'guide': out.guideOpens++; break;
      case 'evt':
        if (d.n === 'lab:enigme-erreur') out.labWrong++;
        else if (d.n === 'lab:indice') { if (d.auto) out.labAutoHints++; else out.labHints++; }
        else if (d.n === 'lab:enigme-resolue') out.labSolved++;
        else if (d.n === 'explore:start') setPlace('exploration libre', e.t);
        else if (d.n === 'lab:open') setPlace('laboratoire', e.t);
        else if (d.n === 'lab:done') setPlace('en jeu', e.t);
        break;
      case 'clic': {
        out.clicks++;
        recentClicks.push(e);
        while (recentClicks.length && e.t - recentClicks[0].t > RAGE_WINDOW_MS) recentClicks.shift();
        const near = recentClicks.filter((c) => Math.hypot((c.d.x || 0) - (d.x || 0), (c.d.y || 0) - (d.y || 0)) <= RAGE_DIST);
        if (near.length >= RAGE_CLICKS) { out.rageClicks++; recentClicks.length = 0; }
        break;
      }
      case 'touches': out.keys += Number(d.n) || 0; break;
      case 'inactif': out.idleCount++; idleSpans.push([e.t - (Number(d.ms) || 0), e.t]); break;
      case 'cache': hiddenSince = e.t; break;
      case 'visible': if (hiddenSince != null) { hiddenSpans.push([hiddenSince, e.t]); hiddenSince = null; } break;
      case 'rechargement': out.reloads++; break;
      case 'erreur': out.errors++; if (d.msg) errSet.add(String(d.msg).slice(0, 160)); break;
      case 'fps':
        if (Number.isFinite(d.v)) {
          fpsVals.push(d.v);
          if (lastFpsLow && lastFpsT != null) out.lowFpsMs += e.t - lastFpsT;
          lastFpsT = e.t; lastFpsLow = d.v < 25 && place === 'en jeu';
        }
        break;
      default: break;
    }
    for (const m of MILESTONES) {
      if (!(m.id in out.milestones) && m.match(e)) out.milestones[m.id] = e.t;
    }
  }
  addPlace(durationMs);
  if (hiddenSince != null) hiddenSpans.push([hiddenSince, durationMs]);
  out.hiddenMs = hiddenSpans.reduce((a, [x, y]) => a + Math.max(0, y - x), 0);
  // inactivité : seulement le temps où le jeu était à l'écran (l'appli quittée est déjà comptée à part)
  const overlap = ([a, b]) => hiddenSpans.reduce((acc, [x, y]) => acc + Math.max(0, Math.min(b, y) - Math.max(a, x)), 0);
  out.idleMs = idleSpans.reduce((acc, sp) => acc + Math.max(0, sp[1] - sp[0] - overlap(sp)), 0);

  out.milestonesReached = Object.keys(out.milestones).length;
  const reached = MILESTONES.filter((m) => m.id in out.milestones);
  out.lastMilestone = reached.length ? reached[reached.length - 1].label : null;
  out.activeMs = Math.max(0, durationMs - out.idleMs - out.hiddenMs);
  out.errorMessages = [...errSet];
  out.fps = { median: median(fpsVals), min: fpsVals.length ? Math.min(...fpsVals) : null };
  out.dialogueReadMedianMs = median(out.dialogueReadMs);
  out.score = playScore(out);
  return out;
}

/**
 * Indice de jeu sur 100 (comparaison entre joueurs d'une même séance) :
 *   70 pts  progression (étapes clés atteintes)
 *   30 pts  autonomie : on retire 3 pts par mauvaise réponse, 4 par indice demandé,
 *           3 par aide de Tapama, 2 par clic d'agacement (plancher 0)
 * Volontairement simple et explicable : à lire avec le temps de jeu et les retours oraux.
 */
export function playScore(s) {
  const progress = (s.milestonesReached / MILESTONES.length) * 70;
  const autonomy = Math.max(0, 30 - 3 * s.labWrong - 4 * s.labHints - 3 * s.helpRequests - 2 * s.rageClicks);
  return Math.round(progress + autonomy);
}

/** Libellés uniques : deux « Awa » deviennent « Awa (14:32) » et « Awa (15:10) ». */
export function uniqueLabels(sessions) {
  const count = {};
  sessions.forEach((s) => { const n = (s.player && s.player.name) || 'Sans nom'; count[n] = (count[n] || 0) + 1; });
  const p2 = (n) => String(n).padStart(2, '0');
  const first = sessions.map((s) => {
    const n = (s.player && s.player.name) || 'Sans nom';
    if (count[n] < 2) return n;
    const d = new Date(s.startedAt);
    return Number.isNaN(d.getTime()) ? `${n} (${String(s.id).slice(0, 4)})` : `${n} (${p2(d.getHours())}:${p2(d.getMinutes())})`;
  });
  // même prénom ET même minute : on numérote
  const seen = {};
  const again = {};
  first.forEach((l) => { again[l] = (again[l] || 0) + 1; });
  return first.map((l) => { if (again[l] < 2) return l; seen[l] = (seen[l] || 0) + 1; return `${l} #${seen[l]}`; });
}

/* ---------------- Export ---------------- */

export function fmtDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (m < 1) return `${s} s`;
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV importable dans une base Notion (une ligne par joueur). */
export function toCSV(summaries, labels) {
  const head = ['Joueur', 'Âge', 'Appareil', 'Système', 'Navigateur', 'Début', 'Durée (min)', 'Temps actif (min)',
    'Indice de jeu', 'Étapes atteintes', 'Dernière étape', 'Séquence max', 'Mauvaises réponses', 'Indices demandés',
    'Aides Tapama', 'Dialogues passés', 'Clics d’agacement', 'Temps inactif (min)', 'Erreurs techniques', 'FPS médian', 'Partie terminée', 'Notes de l’animateur'];
  const rows = summaries.map((s, i) => [
    labels ? labels[i] : s.name, s.age ?? '', s.device, s.os, s.browser, s.startedAt,
    (s.durationMs / 60000).toFixed(1), (s.activeMs / 60000).toFixed(1), s.score,
    `${s.milestonesReached}/${MILESTONES.length}`, s.lastMilestone || '', s.maxSequence ?? '',
    s.labWrong, s.labHints, s.helpRequests, `${s.dialoguesSkipped}/${s.dialogues}`, s.rageClicks,
    (s.idleMs / 60000).toFixed(1), s.errors, s.fps.median ?? '', s.finished ? 'Oui' : 'Non', s.notes || '',
  ]);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

/* ---------------- Analyse d'une séance (plusieurs joueurs) ---------------- */

/** Part des joueurs ayant atteint chaque étape, et temps médian pour y arriver. */
export function funnel(summaries) {
  const n = summaries.length || 1;
  return MILESTONES.map((m) => {
    const times = summaries.filter((s) => m.id in s.milestones).map((s) => s.milestones[m.id]);
    return { id: m.id, label: m.label, count: times.length, pct: Math.round((times.length / n) * 100), medianMs: median(times) };
  });
}

/** Médianes des principaux indicateurs par type d'appareil. */
export function byDevice(summaries) {
  const groups = {};
  summaries.forEach((s) => { (groups[s.device] = groups[s.device] || []).push(s); });
  return Object.entries(groups).map(([device, list]) => ({
    device,
    players: list.length,
    score: median(list.map((s) => s.score)),
    steps: median(list.map((s) => s.milestonesReached)),
    durationMs: median(list.map((s) => s.durationMs)),
    labWrong: median(list.map((s) => s.labWrong)),
    helps: median(list.map((s) => s.helpRequests + s.labHints)),
    rageClicks: median(list.map((s) => s.rageClicks)),
    idleMs: median(list.map((s) => s.idleMs)),
    fps: median(list.map((s) => s.fps.median).filter(Number.isFinite)),
    errors: list.reduce((a, s) => a + s.errors, 0),
  }));
}

/** Temps médian passé à chaque endroit (écrans, en jeu, laboratoire…), du plus long au plus court. */
export function placeTimes(summaries) {
  const all = {};
  summaries.forEach((s) => Object.entries(s.screens).forEach(([k, v]) => { (all[k] = all[k] || []).push(v); }));
  return Object.entries(all).map(([place, v]) => ({ place, players: v.length, medianMs: median(v) })).sort((a, b) => b.medianMs - a.medianMs);
}

/** Constats automatiques, rédigés en phrases simples. À confirmer avec les observations et les retours oraux. */
export function insights(sessions, summaries, labels) {
  const out = [];
  const n = summaries.length;
  if (!n) return out;
  const pct = (x) => Math.round((x / n) * 100);

  // 1. Où les joueurs s'arrêtent (dernière étape atteinte, pour ceux qui n'ont pas fini le chapitre)
  const stops = {};
  summaries.forEach((s) => { if (!('fin' in s.milestones)) { const k = s.lastMilestone || 'avant la première étape'; stops[k] = (stops[k] || 0) + 1; } });
  const stop = Object.entries(stops).sort((a, b) => b[1] - a[1])[0];
  if (stop && stop[1] >= 2) {
    const i = MILESTONES.findIndex((m) => m.label === stop[0]);
    const next = MILESTONES[i + 1];
    out.push({ level: 'blocage', text: `Plus gros point d’arrêt : ${stop[1]} joueur(s) sur ${n} se sont arrêtés après « ${stop[0]} »${next ? `, sans atteindre « ${next.label} »` : ''}.` });
  }

  // 2. Meilleur joueur / plus en difficulté
  const order = summaries.map((s, i) => ({ s, l: labels[i] })).sort((a, b) => b.s.score - a.s.score || a.s.durationMs - b.s.durationMs);
  if (n >= 2) {
    out.push({ level: 'info', text: `Meilleur indice de jeu : ${order[0].l} (${order[0].s.score}/100, ${order[0].s.milestonesReached} étapes, ${order[0].s.device.toLowerCase()}).` });
    const last = order[order.length - 1];
    out.push({ level: 'info', text: `Le plus en difficulté : ${last.l} (${last.s.score}/100, arrêté à « ${last.s.lastMilestone || 'aucune étape'} »).` });
  }

  // 3. Appareils
  const dev = byDevice(summaries);
  if (dev.length >= 2) {
    const sorted = [...dev].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const a = sorted[0], b = sorted[sorted.length - 1];
    if ((a.score ?? 0) - (b.score ?? 0) >= 10) out.push({ level: 'blocage', text: `Écart selon l’appareil : indice médian ${a.score} sur ${a.device.toLowerCase()} contre ${b.score} sur ${b.device.toLowerCase()}. Les commandes ou l’affichage sur ${b.device.toLowerCase()} sont à vérifier.` });
  }

  // 4. Énigmes du laboratoire
  const wrong = summaries.reduce((x, s) => x + s.labWrong, 0);
  const inLab = summaries.filter((s) => 'labo' in s.milestones).length;
  if (inLab && wrong / inLab >= 3) out.push({ level: 'blocage', text: `Énigmes difficiles : en moyenne ${(wrong / inLab).toFixed(1)} mauvaises réponses par joueur arrivé au laboratoire.` });
  const errByEnigma = {};
  sessions.forEach((s) => s.events.forEach((e) => { if (e.k === 'evt' && e.d && e.d.n === 'lab:enigme-erreur') { const k = `labo ${e.d.stage ?? '?'} · énigme ${(e.d.index ?? 0) + 1}`; errByEnigma[k] = (errByEnigma[k] || 0) + 1; } }));
  const hardest = Object.entries(errByEnigma).sort((a, b) => b[1] - a[1])[0];
  if (hardest && hardest[1] >= 3) out.push({ level: 'blocage', text: `Énigme qui pose le plus de problèmes : ${hardest[0]} (${hardest[1]} mauvaises réponses au total).` });

  // 5. Dialogues passés
  const dl = summaries.reduce((x, s) => x + s.dialogues, 0);
  const sk = summaries.reduce((x, s) => x + s.dialoguesSkipped, 0);
  if (dl >= 3 && sk / dl >= 0.4) out.push({ level: 'attention', text: `${Math.round((sk / dl) * 100)} % des dialogues de Tapama sont passés sans être lus jusqu’au bout : trop longs, ou le bouton « passer » est trop tentant ?` });

  // 6. Agacement : clics répétés au même endroit
  const rageTargets = {};
  sessions.forEach((s) => {
    const clicks = s.events.filter((e) => e.k === 'clic');
    for (let i = RAGE_CLICKS - 1; i < clicks.length; i++) {
      const w = clicks.slice(i - RAGE_CLICKS + 1, i + 1);
      if (w[w.length - 1].t - w[0].t <= RAGE_WINDOW_MS && w.every((c) => c.d && c.d.c === w[0].d.c)) { const k = w[0].d.c || '?'; rageTargets[k] = (rageTargets[k] || 0) + 1; i += RAGE_CLICKS - 1; }
    }
  });
  const rage = Object.entries(rageTargets).sort((a, b) => b[1] - a[1])[0];
  if (rage) out.push({ level: 'attention', text: `Clics répétés (agacement ou bouton qui ne répond pas) surtout sur : « ${rage[0]} » (${rage[1]} fois).` });

  // 6 bis. Même bouton actionné en boucle (souris, clavier ou manette) : bouton qui ne répond pas ?
  const loops = {};
  sessions.forEach((s, i) => {
    const acts = s.events.filter((e) => e.k === 'action' && e.d && e.d.name);
    for (let j = 0; j < acts.length; j++) {
      const w = acts.filter((x, k) => k >= j && x.d.name === acts[j].d.name && x.t - acts[j].t <= 10000);
      if (w.length >= 5) { const k = `« ${acts[j].d.name} » sur l’écran ${acts[j].d.ecran || '?'}`; loops[k] = Math.max(loops[k] || 0, w.length); (loops[k + '§'] = loops[k + '§'] || new Set()).add(labels[i]); j += w.length - 1; }
    }
  });
  Object.keys(loops).filter((k) => !k.endsWith('§')).forEach((k) => out.push({ level: 'blocage', text: `Bouton actionné en boucle : ${k}, jusqu’à ${loops[k]} fois en 10 s (${[...loops[k + '§']].join(', ')}). Le bouton ne fait peut-être pas ce que le joueur attend.` }));

  // 7. Inactivité
  const idlePlaces = {};
  sessions.forEach((s) => s.events.forEach((e) => { if (e.k === 'inactif' && e.d) idlePlaces[e.d.lieu || '?'] = (idlePlaces[e.d.lieu || '?'] || 0) + 1; }));
  const idle = Object.entries(idlePlaces).sort((a, b) => b[1] - a[1])[0];
  if (idle && idle[1] >= 2) out.push({ level: 'attention', text: `Moments sans aucune action (plus de 30 s) surtout ici : ${idle[0]} (${idle[1]} fois). Le joueur ne sait peut-être pas quoi faire.` });

  // 8. Aide
  const helped = summaries.filter((s) => s.helpRequests + s.labHints + s.guideOpens > 0).length;
  if (helped) out.push({ level: 'info', text: `${helped} joueur(s) sur ${n} (${pct(helped)} %) ont demandé de l’aide (Tapama, indices ou « Comment jouer »).` });

  // 9. Technique
  const errs = summaries.reduce((x, s) => x + s.errors, 0);
  if (errs) out.push({ level: 'blocage', text: `${errs} erreur(s) technique(s) enregistrée(s) chez ${summaries.filter((s) => s.errors).length} joueur(s) : voir le détail par joueur.` });
  const slow = summaries.filter((s) => Number.isFinite(s.fps.median) && s.fps.median < 25);
  if (slow.length) out.push({ level: 'attention', text: `Jeu saccadé (moins de 25 images/s en médiane) chez : ${slow.map((s) => `${labels[summaries.indexOf(s)]} (${s.device.toLowerCase()}, ${s.fps.median} i/s)`).join(', ')}.` });
  const portrait = sessions.filter((s) => s.events.some((e) => e.k === 'orientation' && e.d && e.d.portrait)).length;
  if (portrait) out.push({ level: 'info', text: `${portrait} joueur(s) ont tourné l’appareil en portrait pendant la partie.` });
  const reloads = summaries.filter((s) => s.reloads > 0).length;
  if (reloads) out.push({ level: 'attention', text: `${reloads} joueur(s) ont rechargé la page en cours de partie.` });
  return out;
}
