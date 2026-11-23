/* Mosquée en hologramme : en mode drone, la mosquée devient transparente (bleutée, lumineuse) pour voir à travers ses murs.
   Bascule : carré (manette) · touche G (clavier) · bouton 🔮 (écran tactile). Les matériaux d'origine sont restaurés tels quels. */
import * as THREE from 'three';

const PART = /^(Mosquee_|Minarets|Piliers|Poteaux|Porte_|Portes_|Torons_|Tombeaux_|Canaris|Tapis_Priere|Oeufs_Autruche|Supports_Oeufs)/i;
const OPACITY = 0.32;
const saved = new Map();            // mesh → matériau(x) d'origine
let on = false;

/* Une seule couleur (bleu hologramme), mais des nuances différentes selon la partie : [motif, clarté 0..1, opacité] */
const SHADES = [
  [/^Mosquee_Base/i, 0.50, 0.26],    // corps : bleu moyen
  [/^Mosquee_Cloture/i, 0.34, 0.30],  // enceinte : bleu profond
  [/^Minarets/i, 0.74, 0.40],        // minarets : bleu clair
  [/^Torons/i, 0.88, 0.60],          // torons : presque blanc
  [/^Piliers|^Poteaux/i, 0.80, 0.50],
  [/^Porte/i, 0.92, 0.55],           // portes : très lumineuses
  [/^Tombeaux/i, 0.66, 0.45],
  [/^Canaris/i, 0.85, 0.55],
  [/^Tapis/i, 0.60, 0.45],
  [/^Oeufs|^Supports_Oeufs/i, 0.9, 0.6],
];

function holoMaterial(name) {
  const hit = SHADES.find(([re]) => re.test(name));
  const [, light, op] = hit || [null, 0.5, OPACITY];
  const m = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(0.55, 0.95, light), transparent: true, opacity: op, depthWrite: false,
    blending: THREE.NormalBlending, side: THREE.DoubleSide,
  });
  m.fog = false;
  return m;
}

function parts() {
  const out = [];
  window.MosqueScene?.scene?.traverse((o) => { if (o.isMesh && PART.test(o.name || '')) out.push(o); });
  return out;
}

export function setHologram(next) {
  next = !!next;
  if (next === on) return on;
  if (next) {
    for (const o of parts()) {
      saved.set(o, o.material);
      o.material = Array.isArray(o.material) ? o.material.map(() => holoMaterial(o.name)) : holoMaterial(o.name);
      o.castShadow = false;
    }
    if (!saved.size) return on;     // maquette pas encore prête
  } else {
    for (const [o, m] of saved) {
      [].concat(o.material).forEach((x) => x.dispose?.());
      o.material = m;
      o.castShadow = true;
    }
    saved.clear();
  }
  on = next;
  document.getElementById('dgHolo')?.classList.toggle('is-active', on);
  return on;
}

export const toggleHologram = () => setHologram(!on);
export const isHologram = () => on;
