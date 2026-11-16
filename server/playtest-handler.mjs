/* ==========================================================
   SÉANCES DE TEST — côté serveur (PC de l'animateur)
   ----------------------------------------------------------
   POST /api/playtest   le jeu envoie la session d'un joueur
                        → enregistrée dans playtests/AAAA-MM-JJ/<fichier>.json
                        (la même session est réécrite à chaque envoi)
   GET  /api/playtest   toutes les sessions enregistrées (pour la page de rapport)
                        → UNIQUEMENT depuis le PC lui-même (localhost) : les fichiers
                          contiennent les prénoms des joueurs.

   Le dossier playtests/ n'est jamais servi par le web ni versionné (.gitignore).
   ========================================================== */

import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { isSession, sessionFileName } from '../app/playtest-core.js';

export const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const MAX_EVENTS = 60000;

const dayDir = (s) => {
  const d = new Date(s.startedAt);
  if (Number.isNaN(d.getTime())) return 'date-inconnue';
  const p2 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** Enregistre une session. @returns {Promise<{status:number, json:object}>} */
export async function saveSession(rawBody, { dir, fs = fsp } = {}) {
  if (typeof rawBody === 'string' && Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return { status: 413, json: { ok: false, error: 'too_large' } };
  let s;
  try { s = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody; } catch (_) { return { status: 400, json: { ok: false, error: 'bad_json' } }; }
  if (!isSession(s)) return { status: 400, json: { ok: false, error: 'not_a_session' } };
  if (s.events.length > MAX_EVENTS) s.events = s.events.slice(-MAX_EVENTS);
  s.receivedAt = new Date().toISOString();

  const folder = path.join(dir, dayDir(s));
  try {
    await fs.mkdir(folder, { recursive: true });
    // une session = un fichier ; si le prénom a été saisi après un premier envoi, l'ancien fichier (« sans-nom ») est remplacé
    const id8 = String(s.id).replace(/[^\w-]/g, '').slice(0, 8);
    const existing = (await fs.readdir(folder)).filter((f) => f.endsWith(`_${id8}.json`));
    const name = sessionFileName(s);
    await fs.writeFile(path.join(folder, name), JSON.stringify(s, null, 1), 'utf8');
    for (const f of existing) if (f !== name) await fs.unlink(path.join(folder, f)).catch(() => {});
    return { status: 200, json: { ok: true, file: `${dayDir(s)}/${name}` } };
  } catch (_) {
    return { status: 500, json: { ok: false, error: 'write_failed' } };
  }
}

/** Toutes les sessions (les plus récentes en dernier). */
export async function listSessions({ dir, fs = fsp } = {}) {
  const out = [];
  let days = [];
  try { days = await fs.readdir(dir); } catch (_) { return out; }
  for (const day of days.sort()) {
    let files = [];
    try { files = await fs.readdir(path.join(dir, day)); } catch (_) { continue; }
    for (const f of files.filter((x) => x.endsWith('.json')).sort()) {
      try {
        const s = JSON.parse(await fs.readFile(path.join(dir, day, f), 'utf8'));
        if (isSession(s)) out.push(s);
      } catch (_) { /* fichier abîmé : ignoré */ }
    }
  }
  return out.sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
}

/** La requête vient-elle du PC lui-même ? */
export function isLocal(remoteAddress) {
  const a = String(remoteAddress || '');
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}
