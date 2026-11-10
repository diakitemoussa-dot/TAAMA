/* ==========================================================
   OMBRES DU PERSONNAGE — la carte d'ombre du soleil suit le joueur
   ----------------------------------------------------------
   La lumière du jour projette ses ombres avec UNE carte d'ombre qui couvre 640 m autour de la mosquée (4096 px = 16 cm par pixel) : le personnage (1,8 m)
   n'y tenait que sur ~11 pixels, flou et instable, et dès qu'il s'éloignait du centre la qualité tombait ; un disque sombre « fait main » faisait semblant d'ombre.
   Ici, tant que le joueur est dans le jeu, le cadre d'ombre se réduit à ±HALF m autour de LUI (110 m en PC : ≈ 5 cm par pixel ; plus large, un cadre trop étroit coupe net l'ombre des grands murs au soleil bas) et le suit, calé sur la grille des pixels de la carte
   (aucun scintillement quand il bouge). La direction du soleil reste celle du ciel (sky.js -> setSunLightDirection) : l'ombre est longue le matin et le soir, courte à midi.
   Le disque sombre n'est plus qu'un léger contact au pied quand les vraies ombres sont actives.
   API : window.ShadowFollow { on(), off(), update(centre: Vector3) } — appelé par sanctuary-mode.js à chaque image.
   ========================================================== */
import * as THREE from 'three';

/** Calage du centre de la carte d'ombre sur la grille de ses pixels, dans le plan de la lumière (pure fonction, testée sous Node). dir : direction vers le soleil (unitaire). */
export function snapToTexels(center, dir, texel) {
  const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, dir).normalize(), upL = new THREE.Vector3().crossVectors(dir, right).normalize();
  const a = center.dot(right), b = center.dot(upL), sa = Math.round(a / texel) * texel, sb = Math.round(b / texel) * texel;
  return center.clone().addScaledVector(right, sa - a).addScaledVector(upL, sb - b);
}

const M = typeof window !== 'undefined' ? window.MosqueScene : null;
if (M && M.sunLight) {
  const sun = M.sunLight, R = M.renderer;
  const DEFAULT = { l: -320, r: 320, t: 320, b: -320, bias: sun.shadow.bias, nbias: sun.shadow.normalBias, far: sun.shadow.camera.far };
  const HALF = (() => { try { const q = (window.Quality && window.Quality.level) || 'mid'; return q === 'high' ? 110 : q === 'mid' ? 120 : 130; } catch (_) { return 70; } })();
  const dir = sun.position.clone().normalize();
  let active = false, added = false;
  const place = (center) => {
    const texel = (2 * HALF) / (sun.shadow.mapSize.x || 2048);
    const c = snapToTexels(center, dir, texel);
    sun.target.position.copy(c); sun.target.updateMatrixWorld();
    sun.position.copy(dir).multiplyScalar(354).add(c);
  };
  // le ciel déplace le soleil (heure de la journée) : on garde la direction et on y rajoute le décalage vers le joueur
  const orig = M.setSunLightDirection ? M.setSunLightDirection.bind(M) : null;
  if (orig) M.setSunLightDirection = (x, y, z) => { dir.set(x, y, z).normalize(); orig(x, y, z); if (active) sun.position.add(sun.target.position); };
  const api = {
    get active() { return active; },
    on() {
      if (active || !R || !R.shadowMap.enabled) return;
      if (!added) { M.scene.add(sun.target); added = true; }
      const c = sun.shadow.camera; c.left = -HALF; c.right = HALF; c.top = HALF; c.bottom = -HALF; c.far = 700; c.updateProjectionMatrix();
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
      active = true;
    },
    off() {
      if (!active) return; active = false;
      const c = sun.shadow.camera; c.left = DEFAULT.l; c.right = DEFAULT.r; c.top = DEFAULT.t; c.bottom = DEFAULT.b; c.far = DEFAULT.far; c.updateProjectionMatrix();
      sun.shadow.bias = DEFAULT.bias; sun.shadow.normalBias = DEFAULT.nbias;
      sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld(); sun.position.copy(dir).multiplyScalar(354);
    },
    update(center) { if (active && center) place(center); },
    get realShadows() { return !!(R && R.shadowMap.enabled && sun.castShadow); },
  };
  window.ShadowFollow = api;
}
