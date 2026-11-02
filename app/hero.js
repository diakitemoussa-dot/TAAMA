/* Personnage jouable : un seul modèle (homme). Le module garde son API (getHero / heroUrl / window.Hero) pour les écrans qui chargent le modèle. */
const FILE = 'assets/models/personnage-joueur-gadget.glb?v=4';
export function getHero() { return 'homme'; }
export function setHero() { return 'homme'; }
export const heroUrl = () => FILE;
window.Hero = { get: getHero, set: setHero, url: heroUrl };
