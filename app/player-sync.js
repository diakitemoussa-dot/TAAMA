/* ==========================================================
   ENVOI DU PROFIL AU SERVEUR (qui l'écrit dans Notion)
   ----------------------------------------------------------
   Le navigateur n'appelle jamais Notion directement : la clé doit
   rester secrète. Il envoie le profil à /api/players ; si le serveur
   est absent, injoignable ou non configuré, l'envoi échoue sans bruit
   et le jeu réessaiera plus tard (profil marqué « en attente »).
   ========================================================== */

import { toPayload } from './player-profile.js';

export const PLAYERS_ENDPOINT = '/api/players';

/** @returns {Promise<boolean>} true si le serveur a bien enregistré le joueur */
export async function sendProfile(profile, { fetchFn = globalThis.fetch, url = PLAYERS_ENDPOINT, timeoutMs = 8000 } = {}) {
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
