/* ==========================================================
   REPÈRE DU JOUEUR : NOM + BARRE DE VIE JAUNE AU-DESSUS DE LA TÊTE
   ----------------------------------------------------------
   Même principe que les repères de Sahel Game (Hud.updateTags) : un petit bloc HTML (nom, barre de vie, flèche ▼) posé à
   l'écran au point où se projette la tête du personnage. Caché s'il est derrière la caméra, hors écran, trop loin, ou si on
   le demande (visée aux yeux, mort, au volant).
   Logique pure (barFraction, tagOpacity, tagVisible) : testée sous Node (tests/player-tag.test.mjs).

   API : const tag = new PlayerTag()
         tag.update(camera, headPos, { name, frac, hidden })   à chaque image ; headPos = point monde au-dessus de la tête
         tag.hide()                                            à la sortie du jeu
   ========================================================== */
import * as THREE from 'three';

export const TAG_COLOR = '#f9d58b';          // jaune de la charte du jeu (réticule, boutons, #f9d58b) : barre de vie et flèche
export const TAG_MAX_DIST = 80;              // m : au-delà, le repère disparaît

/** Part de vie restante entre 0 et 1 (hp et max en points de vie). */
export function barFraction(hp, max) {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(1, hp / max));
}

/** Opacité du repère selon la distance à la caméra : pleine de près, jamais en dessous de 0,35 (réglage de Sahel Game). */
export function tagOpacity(dist) {
  return Math.max(0.35, Math.min(1, 1.4 - dist / 60));
}

/** Le repère est-il affiché ? ndc : point projeté { x, y, z } (z >= 1 : derrière la caméra). */
export function tagVisible(ndc, dist, hidden = false) {
  return !hidden && ndc.z < 1 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1 && dist < TAG_MAX_DIST;
}

const CSS = `
#snPlayerTag { position: fixed; transform: translate(-50%, -100%); display: none; flex-direction: column; align-items: center; gap: 2px;
  pointer-events: none; z-index: 57; color: #fff3d6; text-shadow: 0 0 3px #000, 0 0 6px #000; font: 700 13px/1.1 'Rajdhani', 'Open Sans', system-ui, sans-serif;
  letter-spacing: .04em; white-space: nowrap; }
#snPlayerTag b { font-weight: 700; }
#snPlayerTag i { display: block; width: 58px; height: 6px; background: rgba(20,10,30,.62); border: 1px solid rgba(255,255,255,.6);
  border-radius: 4px; overflow: hidden; box-shadow: 0 0 6px rgba(249,213,139,.55); }
#snPlayerTag u { display: block; height: 100%; width: 100%; background: linear-gradient(180deg, #fff0c4 0%, ${TAG_COLOR} 55%, #e0a93f 100%);
  text-decoration: none; transition: width .2s; }
#snPlayerTag em { font-style: normal; font-size: 14px; line-height: 10px; color: ${TAG_COLOR}; }
`;

export class PlayerTag {
  constructor() {
    this.el = null; this._u = null; this._b = null; this._name = null;
    this._v = new THREE.Vector3();
  }

  _ensureDom() {
    if (this.el && this.el.isConnected) return;
    if (!document.getElementById('snPlayerTagStyle')) {
      const st = document.createElement('style'); st.id = 'snPlayerTagStyle'; st.textContent = CSS; document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.id = 'snPlayerTag';
    this.el.innerHTML = '<b></b><i><u></u></i><em>▼</em>';
    this._b = this.el.querySelector('b'); this._u = this.el.querySelector('u'); this._name = null;
    document.body.appendChild(this.el);
  }

  update(camera, headPos, { name = 'Joueur', frac = 1, hidden = false } = {}) {
    this._ensureDom();
    this._v.copy(headPos).project(camera);
    const dist = camera.position.distanceTo(headPos);
    const show = tagVisible(this._v, dist, hidden);
    this.el.style.display = show ? 'flex' : 'none';
    if (!show) return;
    if (name !== this._name) { this._b.textContent = name; this._name = name; }
    this.el.style.left = `${(this._v.x * 0.5 + 0.5) * innerWidth}px`;
    this.el.style.top = `${(-this._v.y * 0.5 + 0.5) * innerHeight}px`;
    this.el.style.opacity = tagOpacity(dist).toFixed(2);
    this._u.style.width = `${(Math.max(0, Math.min(1, frac)) * 100).toFixed(1)}%`;
  }

  hide() { if (this.el) this.el.style.display = 'none'; }
}
