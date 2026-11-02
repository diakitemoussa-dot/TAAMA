/* ==========================================================
   PROFIL DU JOUEUR — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   À sa toute première partie, le joueur donne son prénom (ou pseudo)
   et son âge. Tapama l'appelle ensuite par son nom ; le profil est
   aussi envoyé dans la base Notion « Joueurs de Taama » (via le
   serveur, jamais directement depuis le navigateur).

   Données minimales, volontairement : prénom ou pseudo, âge, un
   identifiant anonyme, le type d'appareil et la langue. Rien d'autre.

   Ce module est utilisé par le jeu ET par le serveur : la validation
   est donc faite des deux côtés avec exactement les mêmes règles.
   ========================================================== */

import { t } from './i18n.js';

export const PROFILE_KEY = 'taama.player.v1';
export const NAME_MIN = 2;
export const NAME_MAX = 20;
export const AGE_MIN = 6;
export const AGE_MAX = 99;

// lettres (accents compris), chiffres, espace, tiret, apostrophe, point, tiret bas
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} .'’_-]*$/u;

/** Nettoie un prénom saisi : espaces superflus retirés, apostrophe droite → courbe. */
export function cleanName(raw) {
  return String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim().replace(/'/g, '’');
}

/** @returns {{ ok: boolean, error?: string, name?: string, age?: number }} */
export function validateProfileInput(input) {
  const src = input && typeof input === 'object' ? input : {};
  const name = cleanName(src.name);
  if (name.length < NAME_MIN) return { ok: false, error: 'name_short' };
  if (name.length > NAME_MAX) return { ok: false, error: 'name_long' };
  if (!NAME_RE.test(name)) return { ok: false, error: 'name_chars' };

  const raw = typeof src.age === 'string' ? src.age.trim() : src.age;
  const age = typeof raw === 'number' ? raw : (/^\d{1,3}$/.test(raw || '') ? Number(raw) : NaN);
  if (!Number.isInteger(age)) return { ok: false, error: 'age_invalid' };
  if (age < AGE_MIN || age > AGE_MAX) return { ok: false, error: 'age_range' };
  return { ok: true, name, age };
}

const ERRORS = {
  name_short: ['Ton nom doit avoir au moins {n} lettres.', { n: NAME_MIN }],
  name_long: ['Ton nom doit avoir {n} caractères au maximum.', { n: NAME_MAX }],
  name_chars: ['Utilise des lettres, des chiffres, un espace ou un tiret.'],
  age_invalid: ['Indique ton âge en chiffres.'],
  age_range: ['Ton âge doit être entre {a} et {b} ans.', { a: AGE_MIN, b: AGE_MAX }],
};
export function errorMessage(code) {
  const [fr, vars] = ERRORS[code] || ['Vérifie ce que tu as écrit.'];
  return t(fr, vars);
}

/** Type d'appareil pour la base (« Ordinateur », « Téléphone », « Tablette »). */
export function pickDevice({ coarsePointer = false, width = 1280, height = 720 } = {}) {
  if (!coarsePointer) return 'Ordinateur';
  return Math.min(width, height) >= 600 ? 'Tablette' : 'Téléphone';
}

export function languageLabel(lang) { return lang === 'en' ? 'English' : 'Français'; }

/** Identifiant anonyme : aléatoire, propre à l'appareil, sans lien avec la personne. */
export function newId(rand = Math.random, crypto = globalThis.crypto) {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const h = () => Math.floor(rand() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-${h()}-${h()}-${h()}${h()}${h()}`;
}

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidId(id) { return typeof id === 'string' && ID_RE.test(id); }

/** Crée un profil à partir d'une saisie validée. */
export function createProfile({ name, age }, { id, device, lang, nowIso }) {
  return { version: 1, id, name, age, device, lang, createdAt: nowIso, updatedAt: nowIso, synced: false };
}

/** Met à jour le nom / l'âge d'un profil existant (il sera renvoyé à la base). */
export function updateProfile(profile, { name, age }, nowIso) {
  return { ...profile, name, age, updatedAt: nowIso, synced: false };
}

export function sanitizeProfile(raw) {
  if (!raw || typeof raw !== 'object' || raw.version !== 1) return null;
  const v = validateProfileInput(raw);
  if (!v.ok || !isValidId(raw.id)) return null;
  return {
    version: 1,
    id: raw.id,
    name: v.name,
    age: v.age,
    device: ['Ordinateur', 'Téléphone', 'Tablette'].includes(raw.device) ? raw.device : 'Ordinateur',
    lang: raw.lang === 'en' ? 'en' : 'fr',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    synced: !!raw.synced,
  };
}

export function loadProfile(storage) {
  try {
    const raw = storage && storage.getItem(PROFILE_KEY);
    return raw ? sanitizeProfile(JSON.parse(raw)) : null;
  } catch (_) { return null; }
}

export function saveProfile(storage, profile) {
  try { storage.setItem(PROFILE_KEY, JSON.stringify(profile)); return true; } catch (_) { return false; }
}

/** Ce que le jeu envoie au serveur (rien de plus que le strict nécessaire). */
export function toPayload(profile) {
  return {
    id: profile.id,
    name: profile.name,
    age: profile.age,
    device: profile.device,
    lang: profile.lang,
    createdAt: profile.createdAt,
  };
}

/** Valide ce que le serveur reçoit. */
export function validatePayload(body) {
  const v = validateProfileInput(body);
  if (!v.ok) return v;
  if (!isValidId(body.id)) return { ok: false, error: 'id_invalid' };
  const device = ['Ordinateur', 'Téléphone', 'Tablette'].includes(body.device) ? body.device : 'Ordinateur';
  const lang = body.lang === 'en' ? 'en' : 'fr';
  const created = typeof body.createdAt === 'string' && !Number.isNaN(Date.parse(body.createdAt)) ? new Date(body.createdAt).toISOString() : null;
  return { ok: true, id: body.id, name: v.name, age: v.age, device, lang, createdAt: created };
}

/* ---------------- Le prénom dans les textes ---------------- */

/**
 * Remplace {nom} par le prénom du joueur. Sans prénom, la tournure reste correcte :
 *   « {nom}, j’ai trouvé… » → « J’ai trouvé… »   et   « Viens, {nom}. » → « Viens. »
 */
export function fillName(text, name) {
  const t = String(text == null ? '' : text);
  const n = cleanName(name);
  if (n) return t.replace(/\{nom\}/g, n);
  let out = t.replace(/^\{nom\}\s*,\s*/, '').replace(/\s*,\s*\{nom\}/g, '').replace(/\s*\{nom\}/g, '');
  if (out !== t && /^[a-zà-ÿ]/.test(out)) out = out[0].toUpperCase() + out.slice(1);
  return out;
}
