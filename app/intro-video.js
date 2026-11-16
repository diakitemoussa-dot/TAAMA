/* ==========================================================
   VIDÉO D'INTRO (cinématique du début) — choix du fichier + préchargement pendant la barre de chargement
   ----------------------------------------------------------
   La cinématique (30 s, tournée sous Blender) existe en trois fichiers, tous sous 2 Mo :
     • AV1 1080p        1,8 Mo : la plus nette (Chrome, Edge, Firefox, Safari récent) ;
     • AV1 720p mobile  1,0 Mo : appareil / réseau qui demande des médias allégés (voir device-quality.js) ;
     • H.264 720p       1,8 Mo : repli pour les navigateurs sans décodeur AV1 (anciens Safari / iPhone).
   Le fichier est téléchargé en entier pendant l'écran de chargement (preloadCinematic) puis lu depuis la mémoire :
   la lecture ne peut pas saccader ni attendre le réseau. Si le préchargement échoue, la cinématique se lit en streaming comme avant.
   Logique pure (pickCinematic) : testée sous Node (tests/intro-video.test.mjs).
   ========================================================== */
import { currentBytesPlan } from './device-quality.js?v=6';

export const CINE = {
  av1:   'assets/videos/taama-intro-av1-1080p.mp4',
  light: 'assets/videos/taama-intro-mobile-av1-720p.mp4',
  h264:  'assets/videos/taama-intro-h264-720p.mp4',
};
const AV1_TYPE = 'video/mp4; codecs="av01.0.08M.08"';

/** Fichier à lire : sans AV1 → H.264 ; avec AV1 → version mobile si le plan d'octets demande des médias allégés, sinon 1080p. */
export function pickCinematic({ av1 = true, light = false } = {}) {
  if (!av1) return CINE.h264;
  return light ? CINE.light : CINE.av1;
}

/** Le navigateur sait-il décoder l'AV1 en MP4 ? (canPlayType renvoie '', 'maybe' ou 'probably'.) */
export function canPlayAV1(doc = typeof document !== 'undefined' ? document : null) {
  try { return !!(doc && doc.createElement('video').canPlayType(AV1_TYPE)); } catch (_) { return false; }
}

export function cinematicUrl(win = typeof window !== 'undefined' ? window : null) {
  let light = false;
  try { light = !!(win && currentBytesPlan(win).lightMedia); } catch (_) {}
  return pickCinematic({ av1: canPlayAV1(), light });
}

/** État du préchargement : 'idle' | 'loading' | 'ready' | 'failed'. blobUrl : la vidéo en mémoire, prête à lire. */
export const introPre = { state: 'idle', url: '', blobUrl: '', promise: null };

/**
 * Télécharge la vidéo d'intro en mémoire. onProgress(0..100) est appelé pendant le téléchargement (et à 100 à la fin, réussie ou non).
 * Ne lève jamais d'erreur : en cas d'échec, state = 'failed' et la cinématique se lira en streaming.
 */
export function preloadCinematic(onProgress) {
  if (introPre.promise) return introPre.promise;
  const url = cinematicUrl();
  introPre.state = 'loading'; introPre.url = url;
  introPre.promise = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length')) || 0;
      let blob;
      if (res.body && res.body.getReader) {
        const reader = res.body.getReader(), chunks = [];
        let got = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          if (total && onProgress) onProgress(Math.min(99, (got / total) * 100));
        }
        blob = new Blob(chunks, { type: 'video/mp4' });
      } else blob = await res.blob();
      introPre.blobUrl = URL.createObjectURL(blob);
      introPre.state = 'ready';
    } catch (e) {
      console.warn('[intro] préchargement impossible, lecture en streaming :', e);
      introPre.state = 'failed';
    }
    if (onProgress) onProgress(100);
  })();
  return introPre.promise;
}
