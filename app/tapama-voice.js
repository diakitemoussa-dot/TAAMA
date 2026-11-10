/* ==========================================================
   VOIX DE TAPAMA — une voix de femme naturelle et expressive lit TOUTES ses répliques (radio, dialogues, laboratoire, dossier, aide, guide)
   ----------------------------------------------------------
   Fichiers audio préenregistrés (assets/audio/tapama/, générés par tools/gen-tapama-voice.mjs) : voix neuronale féminine, phrases dites une à une avec un rythme,
   une hauteur et des pauses selon l'humeur de la réplique et la ponctuation (joie, inquiétude, surprise, calme…). Chaque réplique est retrouvée par une clé calculée
   sur son texte d'origine (lineKey) ; le prénom du joueur n'est pas prononcé dans l'audio. La synthèse robotique du navigateur n'est plus utilisée : une réplique
   sans enregistrement reste silencieuse (texte à l'écran) jusqu'à la prochaine génération des fichiers (node tools/gen-tapama-voice.mjs).
   Le son passe par un analyseur : l'intensité réelle de la voix ouvre la bouche de Tapama (tapama-face.js). Respecte les réglages du jeu (volume général, « Couper tous les sons »).
   Désactivable : localStorage taama.voice = '0' ou ?novoice=1.
   API : window.TapamaVoice { line(texteOrigine, humeur), stop(), speaking, level(), lineKey(texte), recorded }. lineKey() est pure (testée sous Node).
   ========================================================== */
import { getLang } from './i18n.js?v=1';

/** Clé stable d'une réplique (texte français d'origine, avec {nom}) : FNV-1a 32 bits en hexadécimal. */
export function lineKey(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

const AUDIO_BASE = 'assets/audio/tapama/';
let manifest = null, manifestP = null, segTimer = 0, segAudio = null, token = 0, speakingAudio = false, busy = false;   // busy : une réplique est en cours (y compris les pauses entre ses phrases)
const off = () => { try { return localStorage.getItem('taama.voice') === '0' || /[?&]novoice=1/.test(location.search); } catch (_) { return false; } };
const loadManifest = () => manifestP || (manifestP = fetch(AUDIO_BASE + 'manifest.json?v=2').then((r) => (r.ok ? r.json() : {})).then((m) => (manifest = m)).catch(() => (manifest = {})));
if (typeof window !== 'undefined') setTimeout(() => { if (!off()) loadManifest(); }, 1500);

/* Analyse du son joué (pour animer la bouche de Tapama) : les phrases passent par un analyseur puis par un gain (volume du jeu). */
let actx = null, analyser = null, outGain = null, buf = null;
function audioGraph() {
  if (actx) return actx;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  try {
    actx = new AC(); analyser = actx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.3;
    outGain = actx.createGain(); analyser.connect(outGain); outGain.connect(actx.destination); buf = new Uint8Array(analyser.fftSize);
  } catch (_) { actx = null; }
  return actx;
}
function stop() { token++; clearTimeout(segTimer); speakingAudio = false; busy = false; if (segAudio) { try { segAudio.pause(); } catch (_) {} segAudio = null; } }

/** Joue les phrases enregistrées l'une après l'autre (pauses du manifeste). */
function playSegments(segs, vol) {
  const my = ++token; busy = true;
  const step = (i) => {
    if (my !== token || i >= segs.length) { if (my === token) { speakingAudio = false; busy = false; } return; }
    const a = new Audio(AUDIO_BASE + segs[i].f); segAudio = a;
    const ctx = audioGraph();
    if (ctx) { try { ctx.resume(); outGain.gain.value = Math.min(1, vol); ctx.createMediaElementSource(a).connect(analyser); } catch (_) { a.volume = Math.min(1, vol); } }
    else a.volume = Math.min(1, vol);
    a.onplaying = () => { if (my === token) speakingAudio = true; };
    a.onended = () => { speakingAudio = false; segTimer = setTimeout(() => step(i + 1), segs[i].gap || 0); };
    a.onerror = () => { speakingAudio = false; segTimer = setTimeout(() => step(i + 1), 0); };
    a.play().catch(() => { if (my === token) { speakingAudio = false; busy = false; } });         // lecture refusée (autoplay) : on ne bloque personne
  };
  step(0);
}

/** Réplique de Tapama : raw = texte français d'origine (avec {nom}), mood = humeur (informatif). Renvoie true si une voix enregistrée va être jouée. */
function line(raw, mood) {
  if (off() || !raw) return false;
  stop();
  const GA = window.GameAudio; const g = GA && GA.gain ? GA.gain('master') : 1;
  if (g <= 0 || getLang() === 'en') return false;                     // son coupé ; anglais : pas encore de voix enregistrée
  const my = token;
  const play = () => { if (my !== token) return false; const segs = manifest && manifest[lineKey(raw)]; if (!segs || !segs.length) return false; playSegments(segs, g); return true; };
  if (manifest) return play();
  busy = true; loadManifest().then(() => { if (my === token) busy = false; play(); });                                    // première réplique avant le chargement du manifeste : elle est jouée dès qu'il arrive
  return true;
}

if (typeof window !== 'undefined') window.TapamaVoice = {
  line, stop, lineKey,
  get enabled() { return !off(); },
  get speaking() { return speakingAudio; },
  get busy() { return busy; },
  /** Promesse résolue quand Tapama a fini de parler (ou après au plus maxMs) : le laboratoire attend la fin de sa phrase avant de passer à la suite. */
  whenDone(maxMs = 20000) {
    return new Promise((res) => {
      if (!busy) { res(); return; }
      const t0 = performance.now(), iv = setInterval(() => { if (!busy || performance.now() - t0 > maxMs) { clearInterval(iv); res(); } }, 100);
    });
  },
  get recorded() { return manifest ? Object.keys(manifest).length : 0; },
  /** Intensité de la voix en ce moment (0..1) : sert à ouvrir la bouche de Tapama. */
  level() {
    if (!speakingAudio || !analyser) return 0;
    analyser.getByteTimeDomainData(buf); let sum = 0;
    for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / buf.length) * 7);
  },
};
