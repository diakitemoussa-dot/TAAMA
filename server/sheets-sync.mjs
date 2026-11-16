/* ==========================================================
   JOUEURS DANS GOOGLE SHEETS — côté serveur (en plus de Notion)
   ----------------------------------------------------------
   Même format que la feuille « Bamako Drive joueur » (onglet « Joueurs ») : une ligne par appareil, colonnes A à F identiques,
   dates « jj/mm/aaaa hh:mm:ss » (heure du Mali), appareil « Windows · souris ». Les colonnes G à L ajoutent le profil et la progression.
   Accès par un compte de service Google : sa clé reste sur le serveur, jamais dans le navigateur.

   Variables d'environnement :
     GOOGLE_SHEETS_ID               identifiant de la feuille (dans son adresse)
     GOOGLE_SERVICE_ACCOUNT_JSON    contenu du fichier JSON du compte de service (secret)
     GOOGLE_SHEETS_TAB              (facultatif) nom de l'onglet, « Joueurs » par défaut
   La feuille doit être partagée avec l'adresse e-mail du compte de service (éditeur).
   ========================================================== */

import crypto from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TZ = 'Africa/Bamako';
/** Colonnes : A à F = celles de « Bamako Drive joueur » ; G à L = ajout Taama. */
export const COLUMNS = ['Nom', 'ID appareil', 'Nombre de fois', 'Première visite', 'Dernière visite', 'Appareil',
  'Âge', 'Langue', 'Temps de jeu (min)', 'Chapitre', 'Séquence', 'Découvertes'];
const LAST_COL = 'L';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/** Jeton JWT signé avec la clé du compte de service (RS256). */
export function signServiceJwt(sa, nowSec) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 }));
  const input = `${header}.${claims}`;
  const sig = crypto.createSign('RSA-SHA256').update(input).sign(sa.private_key);
  return `${input}.${b64url(sig)}`;
}

/** Date au format de la feuille Bamako Drive : « 30/10/2026 17:08:50 » (heure du Mali). */
export function formatSheetDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('fr-FR', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/**
 * Ligne de la feuille pour un joueur.
 * existing : ligne déjà présente (tableau de valeurs) ou null ; newVisit : true si c'est une nouvelle connexion (compte +1).
 */
export function toSheetRow(p, progress, nowIso, { existing = null, newVisit = false } = {}) {
  const prevCount = existing && Number(existing[2]) > 0 ? Number(existing[2]) : 0;
  const count = prevCount + (newVisit || !existing ? 1 : 0);
  const minutes = progress && Number.isFinite(progress.playMs) ? Math.round(progress.playMs / 60000) : '';
  return [
    p.name,                                                  // Nom
    p.id,                                                    // ID appareil
    count,                                                   // Nombre de fois
    existing && existing[3] ? existing[3] : formatSheetDate(nowIso),   // Première visite (jamais réécrite)
    formatSheetDate(nowIso),                                 // Dernière visite
    (progress && progress.deviceLabel) || '',                // Appareil (« Windows · souris »)
    p.age,                                                   // Âge
    p.lang === 'en' ? 'English' : 'Français',                // Langue
    minutes,                                                 // Temps de jeu (min)
    progress ? progress.chapter : '',                        // Chapitre
    progress ? progress.sequence : '',                       // Séquence
    progress ? (Array.isArray(progress.discoveries) ? progress.discoveries.length : progress.discoveries) : '',   // Découvertes
  ];
}

async function accessToken(sa, fetchFn, now) {
  const jwt = signServiceJwt(sa, Math.floor(now().getTime() / 1000));
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString(),
  });
  if (!res.ok) throw new Error(`sheets_token_${res.status}`);
  const data = await res.json();
  return data.access_token;
}

async function api(fetchFn, token, method, path, body) {
  const res = await fetchFn(`${SHEETS_API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`sheets_${res.status}`);
  return res.json();
}

/**
 * Crée ou met à jour la ligne du joueur. newVisit : nouvelle connexion (le compteur « Nombre de fois » augmente).
 * Retourne { created } ; lève une erreur si Google refuse. La « Première visite » n'est jamais réécrite.
 */
export async function upsertSheetRow(env, p, progress, nowIso, fetchFn = globalThis.fetch, now = () => new Date(), { newVisit = false } = {}) {
  if (!env.GOOGLE_SHEETS_ID || !env.GOOGLE_SERVICE_ACCOUNT_JSON) return { skipped: true };
  const sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);
  const tab = env.GOOGLE_SHEETS_TAB || 'Joueurs';
  const token = await accessToken(sa, fetchFn, now);
  const base = `/${env.GOOGLE_SHEETS_ID}/values`;
  const idCol = await api(fetchFn, token, 'GET', `${base}/${encodeURIComponent(`${tab}!B:B`)}`);
  const rows = idCol.values || [];
  const idx = rows.findIndex((r) => r[0] === p.id);
  if (idx >= 1) {                                    // ligne existante (la ligne 1 est l'en-tête)
    const r = idx + 1;
    const range = encodeURIComponent(`${tab}!A${r}:${LAST_COL}${r}`);
    const cur = await api(fetchFn, token, 'GET', `${base}/${range}`);
    const old = (cur.values && cur.values[0]) || [];
    const row = toSheetRow(p, progress, nowIso, { existing: old, newVisit });
    await api(fetchFn, token, 'PUT', `${base}/${range}?valueInputOption=USER_ENTERED`, { values: [row] });
    return { created: false };
  }
  if (rows.length === 0) {                           // feuille vide : en-tête d'abord
    await api(fetchFn, token, 'PUT', `${base}/${encodeURIComponent(`${tab}!A1:${LAST_COL}1`)}?valueInputOption=USER_ENTERED`, { values: [COLUMNS] });
  }
  const row = toSheetRow(p, progress, nowIso, { existing: null });
  await api(fetchFn, token, 'POST', `${base}/${encodeURIComponent(`${tab}!A:${LAST_COL}`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { values: [row] });
  return { created: true };
}
