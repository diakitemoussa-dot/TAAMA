/* ==========================================================
   PERSONNAGE MOUILLÉ — en sortant de l'eau, le personnage reste un peu mouillé quelques secondes
   ----------------------------------------------------------
   • tant qu'il est dans l'eau (pataugeage ou nage) : mouillé à 100 % (soak() appelé à chaque image) ;
   • à la sortie : plein effet WET_HOLD secondes, puis séchage progressif sur WET_FADE secondes ;
   • effet : vêtements et peau un peu plus sombres (tissu gorgé d'eau) et plus brillants (roughness réduite : l'eau forme un film qui reflète le soleil).
   Les valeurs d'origine des matériaux sont mémorisées et rétablies exactement une fois sec.
   API : window.WetLook { soak(), update(dt, modèle3D), level, reset() } ; wetLevel(état, dt) est pure (testée sous Node).
   ========================================================== */
export const WET_HOLD = 3;        // s : plein effet après la sortie de l'eau
export const WET_FADE = 6;        // s : séchage progressif ensuite
export const DARKEN = 0.3;        // part de luminosité perdue à 100 % mouillé
export const ROUGH_DROP = 0.65;   // part de roughness perdue à 100 % mouillé
export const ROUGH_MIN = 0.12;    // jamais plus lisse que ça (pas de plastique)

/** Fait avancer l'état de séchage. s = { level (0..1), hold (s) } ; renvoie s (modifié). */
export function wetLevel(s, dt) {
  if (s.hold > 0) { s.hold = Math.max(0, s.hold - dt); return s; }
  if (s.level > 0) s.level = Math.max(0, s.level - dt / WET_FADE);
  return s;
}
/** Valeurs d'un matériau à un niveau de mouillure donné (pure). base = { r, g, b, rough } ; renvoie { k (facteur de couleur), rough }. */
export function wetValues(base, level) {
  return { k: 1 - DARKEN * level, rough: level <= 0 ? base.rough : Math.max(Math.min(base.rough, ROUGH_MIN), base.rough * (1 - ROUGH_DROP * level)) };
}

const S = { level: 0, hold: 0 };
let model = null, shown = -1;
const mats = new Map();                // matériau -> valeurs d'origine

function collect(root) {
  mats.clear();
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || mats.has(m) || !m.color || typeof m.roughness !== 'number') continue;
      mats.set(m, { r: m.color.r, g: m.color.g, b: m.color.b, rough: m.roughness });
    }
  });
}
function paint(level) {
  for (const [m, b] of mats) {
    const v = wetValues(b, level);
    m.color.setRGB(b.r * v.k, b.g * v.k, b.b * v.k); m.roughness = v.rough;
  }
}

if (typeof window !== 'undefined') window.WetLook = {
  get level() { return S.level; },
  soak() { S.level = 1; S.hold = WET_HOLD; },                 // dans l'eau : toujours plein ; le compte à rebours repart à chaque image
  reset() { S.level = 0; S.hold = 0; if (mats.size) paint(0); shown = 0; },
  update(dt, root) {
    if (root && root !== model) {                               // nouveau modèle (changement de personnage) : on rétablit l'ancien puis on mémorise le nouveau
      if (model && mats.size) paint(0);
      model = root; collect(root); shown = -1;
    }
    if (!model) return;
    wetLevel(S, dt);
    const l = Math.round(S.level * 100) / 100;
    if (l !== shown) { shown = l; paint(l); }
  },
};
