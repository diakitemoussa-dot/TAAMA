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

/** @returns {Promise<boolean>} true si le serveur a bien enregistré le joueur */
export async function sendProfile(profile, { fetchFn = globalThis.fetch, url = resolveEndpoint(), timeoutMs = 8000 } = {}) {
  if (!profile || typeof fetchFn !== 'function') return false;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toPayload(profile)),
      signal: ctrl ? ctrl.signal : undefined,
      keepalive: true,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => ({}));
    return data.ok === true;
  } catch (_) {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
