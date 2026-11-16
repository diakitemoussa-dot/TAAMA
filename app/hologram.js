/* Mosquée en hologramme : en mode drone, la mosquée devient transparente (bleutée, lumineuse) pour voir à travers ses murs.
   Bascule : carré (manette) · touche G (clavier) · bouton 🔮 (écran tactile). Les matériaux d'origine sont restaurés tels quels. */
import * as THREE from 'three';

const PART = /^(Mosquee_|Minarets|Piliers|Poteaux|Porte_|Portes_|Torons_|Tombeaux_|Canaris|Tapis_Priere|Oeufs_Autruche|Supports_Oeufs)/i;
const OPACITY = 0.32;
const saved = new Map();            // mesh → matériau(x) d'origine
let on = false;

/* Une teinte par partie : on distingue au premier coup d'œil les murs, minarets, piliers, portes, etc. */
const COLORS = [
  [/^Mosquee_Base/i, 0x35c8ff],      // corps de la mosquée : bleu
  [/^Mosquee_Cloture/i, 0x2de2b8],   // enceinte : turquoise
  [/^Minarets/i, 0xffb347],          // minarets : orange
  [/^Torons/i, 0xff7a59],            // torons (poutres) : corail
  [/^Piliers/i, 0xb388ff],           // piliers : violet
  [/^Poteaux/i, 0xe27bff],           // poteaux : rose
  [/^Porte/i, 0xffe14d],             // portes : jaune
  [/^Tombeaux/i, 0xff5d8f],          // tombeaux : rouge rosé
  [/^Canaris/i, 0x7dff6a],           // canaris : vert
  [/^Tapis/i, 0xffffff],             // tapis : blanc
  [/^Oeufs|^Supports_Oeufs/i, 0xfff2a8],
];

function holoMaterial(name) {
  const hit = COLORS.find(([re]) => re.test(name));
  const m = new THREE.MeshBasicMaterial({
    color: hit ? hit[1] : 0x35c8ff, transparent: true, opacity: OPACITY, depthWrite: false,
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
