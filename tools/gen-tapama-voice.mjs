/**
 * Voix de Tapama : collecte toutes ses répliques (séquences du jeu + appels radio dans app/*.js) puis génère les fichiers audio.
 * Usage : node tools/gen-tapama-voice.mjs [--force] [--collect-only]
 * Prérequis : python avec edge-tts (pip install edge-tts) ; variable TAAMA_PY = exécutable python à utiliser (sinon « python »).
 * Sortie : assets/audio/tapama/*.mp3 + manifest.json (lu par app/tapama-voice.js).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { SEQUENCES, RADIO, PUZZLES } from '../app/tapama-core.js?v=2';
import { lineKey } from '../app/tapama-voice.js';

import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lines = new Map();
// les textes à trou dynamique ({r}…) ne sont pas préenregistrés : la synthèse du navigateur les lit
const add = (text, mood) => { if (!text || typeof text !== 'string') return; if (/\{(?!nom\})\w+\}/.test(text)) return; const key = lineKey(text); if (!lines.has(key)) lines.set(key, { key, text, mood: mood || 'neutre' }); };
for (const seq of Object.values(SEQUENCES)) for (const l of seq.lines || []) if (l.who === 'tapama') add(l.text, l.mood);
for (const r of Object.values(RADIO)) if (r && r.text) add(r.text, r.mood);
for (const p of Object.values(PUZZLES)) { add(p.prompt, 'attentive'); for (const l of Object.values(p.levels || {})) add(l.text, l.mood); }   // aide aux énigmes
try { const { OBJECTIVES } = await import('../app/guide-content.js?v=35'); for (const v of Object.values(OBJECTIVES)) add(typeof v === 'string' ? v : (v && v.fr), 'souriante'); } catch (e) { console.warn('objectifs du guide ignorés :', e.message); }   // « Que faire maintenant ? »
// appels radio : { text: '…', mood: '…' } dans le code (même ligne)
const BS = String.fromCharCode(92), BT = String.fromCharCode(96), DQ = String.fromCharCode(34);   // antislash, accent grave, guillemet : évite les doubles échappements
const RE = new RegExp('text:' + BS + 's*([' + "'" + DQ + BT + '])((?:' + BS + BS + '.|(?!' + BS + '1)[^' + BS + BS + '])*)' + BS + '1' + BS + 's*,' + BS + 's*mood:' + BS + "s*'(" + BS + "w+)'", 'g');
const TXT = new RegExp('text:' + BS + 's*([' + "'" + DQ + BT + '])((?:' + BS + BS + '.|(?!' + BS + '1)[^' + BS + BS + '])*)' + BS + '1', 'g');
const MOOD = new RegExp("mood:" + BS + "s*'(" + BS + "w+)'");
for (const f of fs.readdirSync(path.join(root, 'app')).filter((n) => n.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(root, 'app', f), 'utf8');
  for (const ln of src.split(String.fromCharCode(10))) {
    if (/who:\s*'player'/.test(ln)) continue;
    const mm = MOOD.exec(ln); if (!mm) continue;
    let m; TXT.lastIndex = 0;
    while ((m = TXT.exec(ln))) { if (m[2].includes('${')) continue; add(m[2].split(BS + "'").join("'").split(BS + 'n').join(' '), mm[1]); }
  }
}
// laboratoire : « La réponse, c'est « {r} » » pour chacune des réponses affichées des énigmes
{
  const lab = fs.readFileSync(path.join(root, 'app', 'laboratoire.js'), 'utf8');
  const ln = lab.split(String.fromCharCode(10)).find((l) => l.trim().startsWith('revele:'));
  const mm = ln && MOOD.exec(ln); TXT.lastIndex = 0; const tm = ln && TXT.exec(ln);
  if (mm && tm) {
    const base = tm[2].split(BS + "'").join("'");
    const AFF = new RegExp("affichee:" + BS + "s*'([^']*)'", 'g');
    for (const a of lab.matchAll(AFF)) { const text = base.replace('{r}', a[1]); lines.set(lineKey(text), { key: lineKey(text), text, mood: mm[1] }); }
  }
}
const out = [...lines.values()];
fs.writeFileSync(path.join(root, 'tools', '.tapama-lines.json'), JSON.stringify(out, null, 1));
console.log(`${out.length} répliques collectées`);
if (process.argv.includes('--collect-only')) process.exit(0);
const py = process.env.TAAMA_PY || 'python';
const r = spawnSync(py, [path.join(root, 'tools', 'gen_tapama_voice.py'), ...(process.argv.includes('--force') ? ['--force'] : [])], { stdio: 'inherit' });
process.exit(r.status || 0);
