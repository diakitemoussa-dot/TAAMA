/* ==========================================================
   VARIANTES MOBILES DES MODÈLES (Meshopt, KTX2) AVEC REPLI
   ----------------------------------------------------------
   - Meshopt : personnage et drone N légers (mêmes nœuds, mêmes clips que les originaux).
   - KTX2 (Basis) : textures de la ville mobile, lues telles quelles par le GPU (≈ 1 octet/pixel au lieu de 4).
   - Variantes utilisées UNIQUEMENT si `currentBytesPlan().modelLight` (appareil non high OU réseau lent) ;
     le PC (palier high, réseau correct) charge toujours les fichiers d'origine.
   - Repli automatique sur le candidat suivant (jusqu'à l'original) si le fichier est introuvable ou si le
     décodage échoue (Meshopt/WebAssembly ou KTX2 non pris en charge).
   Les tests de la logique pure (choix des candidats) sont dans device-quality.js.
   ========================================================== */
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { currentBytesPlan, modelVariantUrls, cityCandidates } from './device-quality.js?v=6';

const BASIS_PATH = new URL('../assets/vendor/basis/', import.meta.url).href;

/** Journal de débogage : quel fichier a réellement été chargé (window.GltfExtras.loaded). */
const loaded = {};
window.GltfExtras = { loaded, light: () => lightModels() };

export function lightModels() {
  try { return !!currentBytesPlan().modelLight; } catch (_) { return false; }
}

/** Ajoute le décodeur Meshopt à un GLTFLoader (sans effet sur les fichiers non Meshopt). */
export function useMeshopt(loader) {
  if (MeshoptDecoder && MeshoptDecoder.supported !== false) loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}

/**
 * Essaie les URLs dans l'ordre (repli sur la suivante en cas d'erreur de chargement ou de décodage).
 * Même signature que loader.load ; `onError` n'est appelé que si TOUS les candidats échouent.
 */
export function loadFirst(loader, urls, onLoad, onProgress, onError, key) {
  let i = 0;
  const next = (lastErr) => {
    if (i >= urls.length) { if (onError) onError(lastErr); return; }
    const url = urls[i++];
    loader.load(url, (g) => { if (key) loaded[key] = url; onLoad(g); }, onProgress, (err) => {
      if (i < urls.length) console.warn('[Variantes] échec de', url, '-> repli sur', urls[i], err && err.message ? '(' + err.message + ')' : '');
      next(err);
    });
  };
  next(null);
}

/** loader.load avec variante mobile éventuelle (table MOBILE_VARIANTS) et repli sur l'original. */
export function loadModel(loader, url, onLoad, onProgress, onError) {
  loadFirst(loader, modelVariantUrls(url, lightModels()), onLoad, onProgress, onError, url.replace(/[?#].*$/, '').replace(/^.*\//, ''));
}

/** Le GPU sait-il lire une compression de texture (sinon KTX2 serait décompressé en RGBA 4 o/px : inutile) ? */
export function gpuTextureCompression(renderer) {
  const ext = renderer && renderer.extensions;
  if (!ext || !ext.has) return false;
  return ['WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc', 'WEBGL_compressed_texture_etc1', 'WEBGL_compressed_texture_s3tc', 'WEBGL_compressed_texture_pvrtc', 'EXT_texture_compression_bptc'].some((n) => ext.has(n));
}

/**
 * Charge la ville : candidats KTX2 > JPEG mobile > original selon le palier. `makeLoader()` fournit un GLTFLoader
 * (Draco) ; le KTX2Loader est créé à la demande (import dynamique) et libéré après le chargement.
 */
export function loadCity(makeLoader, renderer, onLoad, onProgress, onError) {
  const light = lightModels();
  const ktx2Ok = light && gpuTextureCompression(renderer);
  const files = cityCandidates(light, ktx2Ok);
  let ktx2 = null;
  const finish = () => { if (ktx2) { try { ktx2.dispose(); } catch (_) {} ktx2 = null; } };
  const attempt = async (idx, lastErr) => {
    if (idx >= files.length) { finish(); if (onError) onError(lastErr); return; }
    const file = files[idx];
    const loader = makeLoader();
    try {
      if (/ktx2/.test(file)) {
        const { KTX2Loader } = await import('three/addons/loaders/KTX2Loader.js');
        ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
        loader.setKTX2Loader(ktx2);
      }
    } catch (e) { console.warn('[Variantes] KTX2 indisponible :', e); return attempt(idx + 1, e); }
    loader.load(`assets/models/${file}?v=4`, (g) => { loaded.city = file; finish(); onLoad(g); }, onProgress, (err) => {
      if (idx + 1 < files.length) console.warn('[Variantes] ville : échec de', file, '-> repli sur', files[idx + 1], err && err.message ? '(' + err.message + ')' : '');
      attempt(idx + 1, err);
    });
  };
  attempt(0, null);
}
