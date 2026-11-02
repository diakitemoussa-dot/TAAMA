/* Choix du personnage jouable : « homme » (personnage d'origine) ou « femme » (joueuse). Même armature et mêmes animations (voir
   assets/models/personnage-joueuse-gadget.INFO.md) : seul le fichier GLB change. Choix mémorisé dans le navigateur. */
const KEY = 'taama.hero';
const FILES = { homme: 'assets/models/personnage-joueur-gadget.glb?v=3', femme: 'assets/models/personnage-joueuse-gadget.glb?v=1' };
export function getHero() { try { return localStorage.getItem(KEY) === 'femme' ? 'femme' : 'homme'; } catch (_) { return 'homme'; } }
export function setHero(h) {
  const v = h === 'femme' ? 'femme' : 'homme';
  try { localStorage.setItem(KEY, v); } catch (_) {}
  window.dispatchEvent(new CustomEvent('hero:change', { detail: { hero: v } }));
  return v;
}
export const heroUrl = (h = getHero()) => FILES[h] || FILES.homme;
window.Hero = { get: getHero, set: setHero, url: heroUrl };
