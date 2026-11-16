/* ==========================================================
   REPÈRES DE DIRECTION DES TIRS REÇUS — repris de Sahel Game (client/src/hitdir.js + Hud.shotFrom / updateIndicators)
   ----------------------------------------------------------
   Quand le joueur est visé ou touché, un arc jaune (croissant + pointe de flèche) apparaît autour du viseur, du côté d'où vient
   le tir. Il tourne avec la caméra, se renforce si le tir a touché (power 1) et s'efface en ~2 s.
   Logique pure (headingTo, indicatorAngle, indicatorAlpha, crescent, arrowhead) : testée sous Node (tests/hit-indicator.test.mjs).
   Repère three.js : un cap est l'angle autour de Y (0 = +z, positif vers +x), comme la caméra : elle regarde vers (sin cap, cos cap).

   API : const hi = new HitIndicators()
         hi.shotFrom(id, from, power)   un tir vient de `from` { x, z } (id : le tireur, un même tireur réutilise le même arc)
         hi.update(dt, camHeading, at)  à chaque image : camHeading = cap de la caméra, at = position du joueur { x, z }
         hi.clear()                     retire tous les arcs
   ========================================================== */

/** Cap (radians) d'un point `to` vu depuis `from`, plan (x, z). */
export function headingTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

/** Angle de l'arc sur l'écran, en degrés, sens des aiguilles d'une montre depuis le haut (0 = tireur devant, 90 = à droite, 180 = derrière).
 *  camHeading : cap de la caméra ; from : position du joueur ; to : position du tireur. */
export function indicatorAngle(camHeading, from, to) {
  let a = (camHeading - headingTo(from, to)) * 180 / Math.PI;    // à gauche de la caméra = +x : cap plus grand, donc angle négatif (anti-horaire)
  a = ((a % 360) + 360) % 360;
  return a > 180 ? a - 360 : a;                                  // -180..180
}

/** Opacité d'une indication selon son âge : pleine un instant, puis elle s'efface en douceur. */
export function indicatorAlpha(age, life = 2.2, hold = 0.5) {
  if (age < 0 || age >= life) return 0;
  return age <= hold ? 1 : 1 - (age - hold) / (life - hold);
}

/** Points d'un croissant (arc épais au milieu, effilé aux bouts) : centre (0, 0), rayon moyen R, épaisseur T, demi-ouverture en degrés.
 *  Angle 0 = en haut. Renvoie une liste [x, y] fermée (bord extérieur, puis bord intérieur en sens inverse). */
export function crescent(R = 78, T = 9, half = 42, steps = 20) {
  const out = [], inn = [];
  for (let i = 0; i <= steps; i++) {
    const u = -1 + 2 * i / steps, a = u * half * Math.PI / 180;
    const w = (T / 2) * Math.cos(u * Math.PI / 2);                // épaisseur : maximale au milieu, nulle aux bouts
    out.push([Math.sin(a) * (R + w), -Math.cos(a) * (R + w)]);
    inn.push([Math.sin(a) * (R - w), -Math.cos(a) * (R - w)]);
  }
  return [...out, ...inn.reverse()];
}

/** Pointe de flèche au milieu de l'arc, tournée vers l'extérieur (vers le tireur) : un triangle échancré à l'arrière.
 *  Même repère que crescent() : centre (0, 0), angle 0 = en haut. Renvoie [x, y] : pointe, aile droite, creux, aile gauche. */
export function arrowhead(R = 78, T = 9, len = 26, wing = 12) {
  const base = R + T / 2 - 3;                          // l'arrière de la pointe chevauche l'arc
  return [[0, -(base + len)], [wing, -(base - 3)], [0, -(base + len * 0.3)], [-wing, -(base - 3)]];
}

const pts = (list) => list.map(([x, y]) => `${(100 + x).toFixed(2)},${(100 + y).toFixed(2)}`).join(' ');
const MAX_ARCS = 6;

const CSS = `
#snHitDirs { position: fixed; left: 50%; top: 57%; width: 0; height: 0; pointer-events: none; z-index: 58; }
#snHitDirs .sn-dir { position: absolute; left: -100px; top: -100px; width: 200px; height: 200px; opacity: 0; transform-origin: 100px 100px;
  filter: drop-shadow(0 0 4px rgba(255,196,0,.95)) drop-shadow(0 0 10px rgba(255,140,0,.55)); }
#snHitDirs .sn-dir svg { display: block; animation: snDirPop .28s ease-out; transform-origin: 100px 100px; }
@keyframes snDirPop { from { transform: scale(1.35); } to { transform: scale(1); } }
`;

export class HitIndicators {
  constructor() {
    this.arcPoints = pts(crescent());
    this.arrowPoints = pts(arrowhead());
    this.indicators = new Map();                       // id du tireur -> { x, z, age, power, el }
    this.root = null;
    this._n = 0;
  }

  _ensureDom() {
    if (this.root && this.root.isConnected) return;
    if (!document.getElementById('snHitDirsStyle')) {
      const st = document.createElement('style'); st.id = 'snHitDirsStyle'; st.textContent = CSS; document.head.appendChild(st);
    }
    this.root = document.createElement('div');
    this.root.id = 'snHitDirs';
    document.body.appendChild(this.root);
  }

  /** Un tir (ou une balle qui frôle) vient de la position `from` : un arc jaune apparaît du côté du tireur. power : 1 si le tir a touché, moins s'il a raté. */
  shotFrom(id, from, power = 1) {
    this._ensureDom();
    let ind = this.indicators.get(id);
    if (!ind) {
      if (this.indicators.size >= MAX_ARCS) return;
      const gid = `snDirG${++this._n}`;
      const el = document.createElement('div');
      el.className = 'sn-dir';
      el.innerHTML = `<svg viewBox="0 0 200 200" width="200" height="200"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#fff58a"/><stop offset="0.55" stop-color="#ffd21a"/><stop offset="1" stop-color="#ff9d00"/></linearGradient></defs>` +
        `<g fill="url(#${gid})" stroke="rgba(110,50,0,.75)" stroke-width="1.4" stroke-linejoin="round">` +
        `<polygon points="${this.arcPoints}"/><polygon points="${this.arrowPoints}"/></g></svg>`;
      this.root.appendChild(el);
      ind = { el };
      this.indicators.set(id, ind);
    } else if (ind.power > power && ind.age < 0.5) {
      power = ind.power;                               // un frôlement ne rabaisse pas l'arc d'un tir qui vient de toucher
    }
    Object.assign(ind, { x: from.x, z: from.z, age: 0, power });
  }

  /** À appeler à chaque image : fait tourner les arcs avec la caméra et les efface peu à peu. camHeading : cap de la caméra ; at : position du joueur. */
  update(dt, camHeading, at) {
    if (!this.indicators.size) return;
    const k = Math.max(0.8, Math.min(1.6, Math.min(innerWidth, innerHeight) / 700));
    for (const [id, ind] of this.indicators) {
      ind.age += dt;
      const a = indicatorAlpha(ind.age) * ind.power;
      if (a <= 0) { ind.el.remove(); this.indicators.delete(id); continue; }
      ind.el.style.opacity = a.toFixed(3);
      ind.el.style.transform = `rotate(${indicatorAngle(camHeading, at, ind).toFixed(1)}deg) scale(${(k * (0.92 + 0.12 * ind.power)).toFixed(3)})`;
    }
  }

  clear() {
    for (const ind of this.indicators.values()) ind.el.remove();
    this.indicators.clear();
  }
}
