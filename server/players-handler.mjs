/* ==========================================================
   ENREGISTREMENT DES JOUEURS DANS NOTION — côté serveur
   ----------------------------------------------------------
   Le jeu envoie le profil à POST /api/players ; ce module le revalide,
   puis crée (ou met à jour) la ligne correspondante dans la base Notion
   « Joueurs de Taama ». La clé Notion reste ici : elle ne doit JAMAIS
   être placée dans le code du navigateur.

   Variables d'environnement :
     NOTION_TOKEN        clé de l'intégration Notion (secret)
     NOTION_PLAYERS_DB   identifiant de la base « Joueurs de Taama »
     ALLOWED_ORIGIN      (facultatif) origine autorisée si le jeu est servi ailleurs

   Fonctionne tel quel dans le serveur de dev (_serve.cjs) et peut être
   branché sur n'importe quel hébergeur Node (fonction serverless, etc.).
   ========================================================== */

import { validatePayload } from '../app/player-profile.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const MAX_BODY_BYTES = 4096;

const text = (s) => [{ type: 'text', text: { content: String(s) } }];

/** Propriétés Notion d'un joueur (le titre est le prénom). */
export function toNotionProperties(p, { nowIso, creating }) {
  const props = {
    'Prénom ou pseudo': { title: text(p.name) },
    'Âge': { number: p.age },
    'Identifiant': { rich_text: text(p.id) },
    'Appareil': { select: { name: p.device } },
    'Langue': { select: { name: p.lang === 'en' ? 'English' : 'Français' } },
    'Dernière mise à jour': { date: { start: nowIso } },
  };
  if (creating) props['Première connexion'] = { date: { start: p.createdAt || nowIso } };
  return props;
}

async function notion(fetchFn, env, method, path, body) {
  const res = await fetchFn(`${NOTION_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`notion_${res.status}`);
  return res.json();
}

/**
 * @param {string|object} rawBody  corps de la requête (texte JSON ou objet)
 * @returns {Promise<{ status: number, json: object }>}
 */
export async function upsertPlayer(rawBody, env = process.env, fetchFn = globalThis.fetch, now = () => new Date()) {
  if (typeof rawBody === 'string' && Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { status: 413, json: { ok: false, error: 'too_large' } };
  let body = rawBody;
  if (typeof rawBody === 'string') {
    try { body = JSON.parse(rawBody); } catch (_) { return { status: 400, json: { ok: false, error: 'bad_json' } }; }
  }
  const v = validatePayload(body);
  if (!v.ok) return { status: 400, json: { ok: false, error: v.error } };

  if (!env.NOTION_TOKEN || !env.NOTION_PLAYERS_DB) return { status: 503, json: { ok: false, error: 'not_configured' } };

  const nowIso = now().toISOString();
  try {
    const found = await notion(fetchFn, env, 'POST', `/databases/${env.NOTION_PLAYERS_DB}/query`, {
      filter: { property: 'Identifiant', rich_text: { equals: v.id } },
      page_size: 1,
    });
    if (found.results && found.results.length) {
      await notion(fetchFn, env, 'PATCH', `/pages/${found.results[0].id}`, { properties: toNotionProperties(v, { nowIso, creating: false }) });
      return { status: 200, json: { ok: true, created: false } };
    }
    await notion(fetchFn, env, 'POST', '/pages', {
      parent: { database_id: env.NOTION_PLAYERS_DB },
      properties: toNotionProperties(v, { nowIso, creating: true }),
    });
    return { status: 200, json: { ok: true, created: true } };
  } catch (_) {
    // Aucun détail renvoyé au navigateur : le jeu réessaiera plus tard.
    return { status: 502, json: { ok: false, error: 'notion_error' } };
  }
}
