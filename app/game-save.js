/* ==========================================================
   SAUVEGARDE ET RÉGLAGES — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   Le stockage est passé en paramètre (getItem / setItem / removeItem) :
   en jeu c'est localStorage, dans les tests un faux stockage.

   • Réglages : enregistrés sur l'appareil (écran Options).
   • Partie : progression du chapitre 1, séquences terminées,
     découvertes, temps de jeu. Sauvegarde à chaque séquence terminée.
   ========================================================== */

import { t, monthShort } from './i18n.js';

export const SAVE_KEY = 'taama.save.v1';
export const SETTINGS_KEY = 'taama.settings.v1';

/** Les 13 séquences du premier chapitre (document de conception §7). */
export const SEQUENCES_LIST = [
  { n: 1, title: 'Le lancement' },
  { n: 2, title: 'Djenné, un lieu chargé de mémoire' },
  { n: 3, title: 'L’appel de Tapama' },
  { n: 4, title: 'Le premier repérage' },
  { n: 5, title: 'Le premier dispositif' },
  { n: 6, title: 'La deuxième piste' },
  { n: 7, title: 'Le vol' },
  { n: 8, title: 'La poursuite' },
  { n: 9, title: 'La découverte de la base' },
  { n: 10, title: 'La récupération' },
  { n: 11, title: 'La synchronisation' },
  { n: 12, title: 'La menace demeure' },
  { n: 13, title: 'Fin du chapitre' },
];
export const SEQUENCE_COUNT = SEQUENCES_LIST.length;

/** Découvertes possibles (affichées dans le journal d'enquête). */
export const DISCOVERIES = [
  { id: 'indice', label: 'Premier indice' },
  { id: 'fragment', label: 'Fragment de mémoire' },
  { id: 'cle', label: 'Clé de synchronisation' },
];

/** Destinations de la saga : seule Djenné est ouverte au chapitre 1. */
export const DESTINATIONS = [
  { id: 'djenne', name: 'Djenné', unlocked: true },
  { id: 'bandiagara', name: 'Bandiagara', unlocked: false },
  { id: 'segou', name: 'Ségou', unlocked: false },
  { id: 'bamako', name: 'Bamako', unlocked: false },
  { id: 'lome', name: 'Lomé', unlocked: false },
];

export const DEFAULT_SETTINGS = Object.freeze({
  lang: 'fr',
  volume: 80, music: 60, effects: 85, drone: 70, ambience: 55,
  muteBackground: true, muteAll: false,
  quality: 'auto',                 // auto | low | mid | high
  netAdapt: true, saveData: false, // réseau : adapter selon la connexion / économiser mes données
  fullscreen: false, shadows: true, showClock: true, showHints: true, showFps: false,
  timeSpeed: 1,                    // ×1 ×2 ×4 ×8
  skippableCutscenes: true, objectiveReminder: true, aimAssist: true,
  subtitles: true, textSize: 'M',  // S | M | L
  reduceShake: false, highContrast: false, rumble: true,
});

const ALLOWED = {
  lang: ['fr', 'en'],
  quality: ['auto', 'low', 'mid', 'high'],
  timeSpeed: [1, 2, 4, 8],
  textSize: ['S', 'M', 'L'],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Valide un jeu de réglages : valeurs inconnues ou invalides → défaut. */
export function sanitizeSettings(input) {
  const out = { ...DEFAULT_SETTINGS };
  if (!input || typeof input !== 'object') return out;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (!(k in input)) continue;
    const def = DEFAULT_SETTINGS[k];
    const v = input[k];
    if (ALLOWED[k]) { if (ALLOWED[k].includes(v)) out[k] = v; }
    else if (typeof def === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (typeof def === 'number') { if (Number.isFinite(v)) out[k] = clamp(Math.round(v), 0, 100); }
  }
  return out;
}

function readJSON(storage, key) {
  try {
    const raw = storage && storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function writeJSON(storage, key, value) {
  try { storage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
}

export function loadSettings(storage) {
  return sanitizeSettings(readJSON(storage, SETTINGS_KEY));
}

export function saveSettings(storage, settings) {
  return writeJSON(storage, SETTINGS_KEY, sanitizeSettings(settings));
}

/* ---------------- Partie ---------------- */

export function sequenceTitle(n) {
  const s = SEQUENCES_LIST.find((x) => x.n === n);
  return s ? t(s.title) : '';
}

/** Libellé d'une découverte dans la langue courante. */
export function discoveryLabel(d) { return t(d.label); }

/** Nouvelle partie : les séquences 1 et 2 (lancement, cinématique) sont déjà derrière nous. */
export function newSave(nowIso) {
  return {
    version: 1,
    chapter: 1,
    sequence: 3,
    done: [1, 2],
    discoveries: [],
    playMs: 0,
    lastPlayed: nowIso,
    seenIntro: true,
  };
}

/** Valide une sauvegarde lue sur le disque ; null si inutilisable. */
export function sanitizeSave(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
  if (!Number.isInteger(raw.sequence)) return null;
  const uniq = (a) => [...new Set(Array.isArray(a) ? a : [])];
  return {
    version: 1,
    chapter: 1,
    sequence: clamp(raw.sequence, 1, SEQUENCE_COUNT),
    done: uniq(raw.done).filter((n) => Number.isInteger(n) && n >= 1 && n <= SEQUENCE_COUNT).sort((a, b) => a - b),
    discoveries: uniq(raw.discoveries).filter((id) => DISCOVERIES.some((d) => d.id === id)),
    playMs: Number.isFinite(raw.playMs) && raw.playMs > 0 ? raw.playMs : 0,
    lastPlayed: typeof raw.lastPlayed === 'string' ? raw.lastPlayed : null,
    seenIntro: !!raw.seenIntro,
  };
}

export function loadSave(storage) {
  return sanitizeSave(readJSON(storage, SAVE_KEY));
}

export function writeSave(storage, save) {
  return writeJSON(storage, SAVE_KEY, save);
}

export function deleteSave(storage) {
  try { storage.removeItem(SAVE_KEY); return true; } catch (_) { return false; }
}

/** Termine une séquence : la suivante devient la séquence en cours (sauvegarde automatique). */
export function completeSequence(save, n, nowIso) {
  const done = [...new Set([...save.done, n])].sort((a, b) => a - b);
  return {
    ...save,
    done,
    sequence: clamp(Math.max(save.sequence, n + 1), 1, SEQUENCE_COUNT),
    lastPlayed: nowIso,
  };
}

export function addDiscovery(save, id) {
  if (!DISCOVERIES.some((d) => d.id === id) || save.discoveries.includes(id)) return save;
  return { ...save, discoveries: [...save.discoveries, id] };
}

export function addPlayTime(save, ms, nowIso) {
  return { ...save, playMs: save.playMs + Math.max(0, ms), lastPlayed: nowIso };
}

/** Destinations ouvertes : « 1 sur 5 ». */
export function destinationsProgress() {
  return { open: DESTINATIONS.filter((d) => d.unlocked).length, total: DESTINATIONS.length };
}

/* ---------------- Textes affichés ---------------- */

const pad2 = (n) => String(n).padStart(2, '0');

/** « Aujourd’hui · 18:42 », « Hier · 09:10 » ou « 12 oct. · 09:10 ». */
export function formatLastPlayed(iso, now = new Date()) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days === 0) return t('Aujourd’hui · {x}', { x: hm });
  if (days === 1) return t('Hier · {x}', { x: hm });
  return `${d.getDate()} ${monthShort(d.getMonth())} · ${hm}`;
}

/** « 47 minutes », « 1 h 05 » ou « Moins d’une minute ». */
export function formatPlaytime(ms) {
  const min = Math.floor((ms || 0) / 60000);
  if (min < 1) return t('Moins d’une minute');
  if (min < 60) return t(min > 1 ? '{n} minutes' : '{n} minute', { n: min });
  return `${Math.floor(min / 60)} h ${pad2(min % 60)}`;
}

/** Objectif affiché dans le journal d'enquête (proposition, à valider pour les séquences 5 et suivantes). */
const OBJECTIVES = {
  3: 'Écouter l’appel de Tapama.',
  4: 'Examiner l’emplacement près de la mosquée et utiliser le drone pour observer un détail éloigné.',
  5: 'Trouver le premier dispositif et l’activer.',
  6: 'Suivre l’indice de Tapama jusqu’au deuxième emplacement.',
  7: 'Ne pas perdre de vue les agents de NÉANTIS.',
  8: 'Poursuivre les agents dans les ruelles.',
  9: 'Repérer l’installation avec le drone et trouver un chemin.',
  10: 'Récupérer le deuxième dispositif et quitter la base.',
  11: 'Activer les deux dispositifs ensemble avec Tapama.',
  12: 'Surveiller les prochaines pistes.',
  13: 'Revoir les éléments découverts et choisir la suite.',
};
const DEFAULT_OBJECTIVE = 'Explorer les lieux et poursuivre l’enquête.';

export function sequenceObjective(n) {
  return t(OBJECTIVES[n] || DEFAULT_OBJECTIVE);
}

/** Part du chapitre accomplie, en pourcentage (séquence 4 sur 13 → 31). */
export function progressPercent(n) {
  return Math.round((clamp(n, 1, SEQUENCE_COUNT) / SEQUENCE_COUNT) * 100);
}

/** « Séquence 4 · Le premier repérage » */
export function sequenceLabel(n) {
  return t('Séquence {n} · {x}', { n, x: sequenceTitle(n) });
}
