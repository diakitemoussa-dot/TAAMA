/* ==========================================================
   ENVOI DU PROFIL AU SERVEUR (qui l'écrit dans Notion)
   ----------------------------------------------------------
   Le navigateur n'appelle jamais Notion directement : la clé doit
   rester secrète. Il envoie le profil à /api/players ; si le serveur
   est absent, injoignable ou non configuré, l'envoi échoue sans bruit
   et le jeu réessaiera plus tard (profil marqué « en attente »).
   ========================================================== */

import { toPayload } from './player-profile.js?v=1';

/** Adresse du serveur : `window.TAAMA_PLAYERS_ENDPOINT` ou <meta name="taama-players-endpoint"> si définis (hébergeur externe),
 *  sinon une adresse RELATIVE à la page (sous /Taama/ sur GitHub Pages, « /api/players » absolu visait la racine du domaine). */
export function resolveEndpoint(win = globalThis.window, doc = globalThis.document) {
  const fromWin = win && typeof win.TAAMA_PLAYERS_ENDPOINT === 'string' ? win.TAAMA_PLAYERS_ENDPOINT.trim() : '';
  if (fromWin) return fromWin;
  const meta = doc && doc.querySelector ? doc.querySelector('meta[name="taama-players-endpoint"]') : null;
  const fromMeta = meta && meta.content ? meta.content.trim() : '';
  return fromMeta || 'api/players';
}
export const PLAYERS_ENDPOINT = 'api/players';

/** Adresse d'un script Google (Apps Script) : envoi en texte, pas de requête de contrôle. */
export function isAppsScript(url) {
  return /^https:\/\/script\.(google|googleusercontent)\.com\//.test(String(url || ''));
}

/** @returns {Promise<boolean>} true si le serveur a bien enregistré le joueur */
export async function sendProfile(profile, { fetchFn = globalThis.fetch, url = resolveEndpoint(), timeoutMs = 8000, progress = null, note = null } = {}) {
  if (!profile || typeof fetchFn !== 'function') return false;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const script = isAppsScript(url);
    // Script Google : texte simple (pas de requête de contrôle CORS, que Google refuse) ; sinon JSON comme avant
    const headers = { 'Content-Type': script ? 'text/plain;charset=utf-8' : 'application/json' };
    const body = JSON.stringify(note ? { ...toPayload(profile), note } : progress ? { ...toPayload(profile), progress } : toPayload(profile));
    try {
      const res = await fetchFn(url, { method: 'POST', headers, body, signal: ctrl ? ctrl.signal : undefined, keepalive: true });
      if (!res.ok) return false;
      const data = await res.json().catch(() => ({}));
      return data.ok === true;
    } catch (e) {
      // Le navigateur bloque la lecture de la réponse du script : on renvoie en « no-cors » (réponse illisible, envoi tout de même fait)
      if (script && e && e.name === 'TypeError') {
        try { await fetchFn(url, { method: 'POST', mode: 'no-cors', headers, body, keepalive: true }); return true; } catch (_) { return false; }
      }
      return false;
    }
  } catch (_) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Appareil comme dans la feuille Bamako Drive : « Windows · souris », « iOS · tactile », « Android · tactile », « Autre · souris ». */
export function deviceLabel(win = globalThis.window) {
  try {
    const ua = (win && win.navigator && win.navigator.userAgent) || '';
    const os = /Windows/i.test(ua) ? 'Windows' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : /Mac OS X|Macintosh/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Autre';
    const touch = !!(win && win.matchMedia && win.matchMedia('(pointer: coarse)').matches);
    return `${os} · ${touch ? 'tactile' : 'souris'}`;
  } catch (_) { return ''; }
}
