/* Mosquée en hologramme : en mode drone, la mosquée devient transparente (bleutée, lumineuse) pour voir à travers ses murs.
   Bascule : carré (manette) · touche G (clavier) · bouton 🔮 (écran tactile). Les matériaux d'origine sont restaurés tels quels. */
import * as THREE from 'three';

const PART = /^(Mosquee_|Minarets|Piliers|Poteaux|Porte_|Portes_|Torons_|Tombeaux_|Canaris|Tapis_Priere|Oeufs_Autruche|Supports_Oeufs)/i;
const OPACITY = 0.2;
const saved = new Map();            // mesh → matériau(x) d'origine
let on = false;

function holoMaterial(src) {
  const m = new THREE.MeshBasicMaterial({
    color: 0x3fb8e8, transparent: true, opacity: OPACITY, depthWrite: false,
    blending: THREE.NormalBlending, side: THREE.DoubleSide, wireframe: false,
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
      o.material = Array.isArray(o.material) ? o.material.map(holoMaterial) : holoMaterial(o.material);
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
