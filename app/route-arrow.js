/* ==========================================================
   PASTILLE D'ITINÉRAIRE — une interface fixe à l'écran, pour suivre la route choisie sur la carte
   ----------------------------------------------------------
   Quand un lieu est choisi sur la carte (app/city-map.js), une pastille s'affiche sous la mini-carte : mini-boussole + « LIEU – distance – prochain virage ».
   Le guidage vise un point situé un peu en avant SUR la route (et non le lieu en ligne droite : la route contourne les maisons) ; si le joueur s'écarte,
   il le ramène vers la route. Son état (state : cap du trajet lissé, cap de la caméra lissé, distance, virage) alimente aussi le tableau de bord de la voiture
   (app/car-dashboard.js : cadran en demi-cercle).

   Logique pure (routeMetrics, guideState, bearingTo, relativeAngle, smoothAngle, turnLabel) : testée sous Node
   (tests/route-arrow.test.mjs). Repère : mètres réels { e: est, n: nord } ; cap = angle depuis le nord, vers l'est
   (même convention que city-map.js : heading = atan2(dz, dx) avec nord = +x du jeu, est = +z).

   Stabilité : le guidage part de la position du VÉHICULE ou du joueur (pas de la caméra, qui tremble), le point visé s'éloigne avec la vitesse
   (lookAhead) et le cap est lissé dans le MONDE (smoothAngle), comme l'aiguille d'une boussole : la direction ne saute ni à un virage ni
   quand l'itinéraire est recalculé. Le cap de la caméra est lui aussi lissé pour que la rose tourne sans à-coups.

   API : const arrow = createRouteArrow()
         arrow.update(dt, { route, name, me: { e, n, heading }, visible, speed })   à chaque image
         arrow.state  -> { active, bearing (rad, lissé, 0 = nord, + vers l'est), remaining, off, arrived, turn }
         arrow.hide()
   ========================================================== */

export const LOOK_AHEAD = 22;        // m : la flèche vise un point 22 m en avant sur la route
export const OFF_ROUTE = 28;         // m : au-delà, on est « hors route » et la flèche ramène vers la route
export const ARRIVED = 16;           // m : à moins de 16 m de l'arrivée, la flèche disparaît
export const TURN_MIN_DEG = 35;      // ° : un changement de cap de plus de 35° est un virage
export const TURN_SHOW = 130;        // m : un virage n'est annoncé qu'à moins de 130 m

const TAU = Math.PI * 2;
const wrapPi = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a; };

/** Longueurs cumulées d'une ligne brisée [[e, n], …] : { cum: [0, d1, d1+d2, …], total }. Mise en cache par tableau de points. */
const _cache = new WeakMap();
export function routeMetrics(pts) {
  let m = _cache.get(pts);
  if (m) return m;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  m = { cum, total: cum[cum.length - 1] || 0 };
  _cache.set(pts, m);
  return m;
}

/** Point de la ligne à la distance `s` depuis son début (borné). */
export function pointAt(pts, s) {
  const { cum, total } = routeMetrics(pts);
  if (s <= 0) return { e: pts[0][0], n: pts[0][1], seg: 0 };
  if (s >= total) { const l = pts[pts.length - 1]; return { e: l[0], n: l[1], seg: pts.length - 2 }; }
  let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i], L = cum[i] - cum[i - 1] || 1, u = (s - cum[i - 1]) / L;
  return { e: a[0] + (b[0] - a[0]) * u, n: a[1] + (b[1] - a[1]) * u, seg: i - 1 };
}

/** Projection d'un point sur la ligne : le plus proche point de la ligne { along (m depuis le début), dist (écart), seg }. */
export function projectOnRoute(pts, e, n) {
  const { cum } = routeMetrics(pts);
  let best = { dist: Infinity, along: 0, seg: 0 };
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], dx = pts[i][0] - ax, dy = pts[i][1] - ay, L2 = dx * dx + dy * dy;
    let u = L2 > 1e-9 ? ((e - ax) * dx + (n - ay) * dy) / L2 : 0; u = Math.max(0, Math.min(1, u));
    const d = Math.hypot(e - (ax + u * dx), n - (ay + u * dy));
    if (d < best.dist) best = { dist: d, along: cum[i - 1] + u * Math.sqrt(L2), seg: i - 1 };
  }
  return best;
}

/** Cap (rad, 0 = nord, + vers l'est) de `from` vers `to`. */
export function bearingTo(from, to) { return Math.atan2(to.e - from.e, to.n - from.n); }

/** Angle de la flèche à l'écran, en degrés, sens des aiguilles d'une montre depuis le haut (0 = tout droit) : cap du but − cap de la caméra. */
export function relativeAngle(heading, from, to) { return wrapPi(bearingTo(from, to) - heading) * 180 / Math.PI; }

/** Rotation lissée d'un angle (degrés) vers sa cible par le chemin le plus court : évite que la flèche tremble ou fasse un tour complet. */
export function smoothAngle(cur, target, dt, rate = 10) {
  let d = ((target - cur + 540) % 360) - 180;
  return cur + d * (1 - Math.exp(-rate * dt));
}

/**
 * Prochain virage sur la ligne après `along` : { dist (m jusqu'au virage), deg (+ à droite, − à gauche) } ou null.
 * Un virage est un sommet où le cap change de plus de TURN_MIN_DEG (segments de moins de 2 m ignorés), à moins de TURN_SHOW m.
 */
export function nextTurn(pts, along) {
  const { cum } = routeMetrics(pts);
  let prevDir = null;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0], dy = pts[i][1] - pts[i - 1][1], L = Math.hypot(dx, dy);
    if (L < 2) continue;
    const dir = Math.atan2(dx, dy);
    if (cum[i - 1] >= along - 1e-6 && prevDir !== null) {                 // sommet i-1 situé devant nous
      const turn = wrapPi(dir - prevDir) * 180 / Math.PI;
      const d = cum[i - 1] - along;
      if (d > TURN_SHOW) return null;
      if (Math.abs(turn) >= TURN_MIN_DEG && d >= 0) return { dist: d, deg: turn };
    }
    prevDir = dir;
  }
  return null;
}

/**
 * État du guidage pour un joueur en `me` ({ e, n }) sur la ligne `pts` :
 * { target, remaining, offRoute, off (hors route ?), arrived, turn }.
 */
export function guideState(pts, me, { look = LOOK_AHEAD, offRoute = OFF_ROUTE, arrived = ARRIVED } = {}) {
  if (!pts || pts.length < 2) return null;
  const { total } = routeMetrics(pts);
  const pr = projectOnRoute(pts, me.e, me.n);
  const remaining = Math.max(0, total - pr.along);
  const off = pr.dist > offRoute;
  const last = pts[pts.length - 1];
  const done = Math.hypot(last[0] - me.e, last[1] - me.n) <= arrived || remaining <= arrived * 0.6;
  // hors route : on vise le point de la route le plus proche ; sinon un point en avant
  const target = off ? pointAt(pts, pr.along) : pointAt(pts, Math.min(total, pr.along + look));
  return { target, remaining: remaining + (off ? pr.dist : 0), offRoute: pr.dist, off, arrived: done, turn: off ? null : nextTurn(pts, pr.along) };
}

/** Distance du point visé selon la vitesse (m/s) : plus on roule vite, plus la flèche regarde loin (moins de nervosité dans les virages). */
export function lookAhead(speed = 0) { return Math.max(LOOK_AHEAD, Math.min(48, 14 + Math.abs(speed) * 1.6)); }

/** Texte du prochain virage : « Tourne à droite dans 40 m », « Tourne à gauche… », demi-tour au-delà de 135°. */
export function turnLabel(turn) {
  if (!turn) return '';
  const d = Math.max(10, Math.round(turn.dist / 10) * 10);
  const a = Math.abs(turn.deg);
  const side = a >= 135 ? 'Demi-tour' : turn.deg > 0 ? (a < 70 ? 'Légèrement à droite' : 'À droite') : (a < 70 ? 'Légèrement à gauche' : 'À gauche');
  return `${side} dans ${d} m`;
}

export const fmtDist = (m) => (m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.max(10, Math.round(m / 10) * 10) + ' m');

/** Angle d'une aiguille sur un cadran en DEMI-cercle : le cap relatif est ramené à ±90° ; derrière soi (au-delà), l'aiguille reste sur le côté et l'on annonce un demi-tour. */
export function gaugeAngle(relDeg) { return Math.max(-90, Math.min(90, relDeg)); }
/** Faut-il faire demi-tour ? (le but est nettement derrière) */
export function isUTurn(relDeg) { return Math.abs(relDeg) > 110; }
/** Cap relatif (degrés, −180..180) d'un cap du monde vu par une caméra : > 0 = à droite. */
export function relativeDeg(bearingRad, headingRad) { return wrapPi(bearingRad - headingRad) * 180 / Math.PI; }

const CSS = `
#snRouteArrow { position: fixed; left: 14px; top: 196px; z-index: 56; pointer-events: none; display: none; align-items: center; gap: 9px;
  padding: 6px 14px 6px 8px; border-radius: 16px; background: rgba(60,42,66,.74); color: #f8f3ea; border: 1px solid rgba(249,213,139,.45);
  box-shadow: 0 3px 14px rgba(0,0,0,.25); backdrop-filter: blur(4px); max-width: calc(100vw - 28px);
  font: 700 13px/1.2 'Rajdhani', 'Open Sans', system-ui, sans-serif; letter-spacing: .03em; white-space: nowrap; }
#snRouteArrow .ra-ico { width: 26px; height: 26px; flex: none; display: block; }
#snRouteArrow .ra-line { overflow: hidden; text-overflow: ellipsis; }
#snRouteArrow .ra-go { color: #f9d58b; font-weight: 900; font-size: 15px; margin-left: 2px; flex: none; }
#snRouteArrow .ra-name { color: #f9d58b; text-transform: uppercase; letter-spacing: .06em; }
#snRouteArrow .ra-sep { opacity: .55; margin: 0 5px; }
#snRouteArrow.is-off { border-color: rgba(255,154,58,.8); }
#snRouteArrow.is-off .ra-name { color: #ffb066; }
#snRouteArrow.is-off .ra-needle path { fill: #ffb066; }
`;

/* Pastille d'itinéraire (sous la mini-carte) : mini-boussole dont l'aiguille tourne vers le trajet (cap du trajet − cap de la caméra, tour complet : utile à pied),
   puis « LIEU – distance – prochain virage » sur une ligne. En voiture, le tableau de bord (app/car-dashboard.js) montre en plus le grand cadran en demi-cercle. */
const ICON = '<svg class="ra-ico" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="rgba(30,20,36,.7)" stroke="rgba(249,213,139,.7)" stroke-width="2"/>' +
  '<g class="ra-needle"><path d="M16 5 L21 18 L16 15 L11 18 Z" fill="#f9d58b" stroke="rgba(60,42,66,.9)" stroke-width="1.2" stroke-linejoin="round"/></g>' +
  '<circle cx="16" cy="16" r="2" fill="#3c2a42"/></svg>';

export function createRouteArrow() {
  let el = null, needle = null, lineEl = null, lastKey = '';
  let bearingDeg = 0, haveBearing = false;                 // cap du trajet dans le monde, lissé (degrés)
  let headingDeg = 0, haveHeading = false;                 // cap de la caméra, lissé (degrés)
  let needleDeg = 0, haveNeedle = false;                   // angle de l'aiguille de la pastille, lissé
  const state = { active: false, bearing: 0, heading: 0, name: '', remaining: 0, offRoute: 0, off: false, arrived: false, turn: null };
  let frames = 0, anchoredKey = '', resizeBound = false;
  /** Ancrage : juste sous la mini-carte (en haut à gauche), sans toucher aux autres éléments de l'écran. Recalculé seulement quand la mise en page change. */
  function anchor() {
    const m = document.getElementById('cityMap');
    const r = m && m.getBoundingClientRect();
    if (!r || !r.width) return;
    const key = `${Math.round(r.left)}|${Math.round(r.bottom)}`;
    if (key === anchoredKey) return;
    anchoredKey = key;
    el.style.left = `${Math.round(r.left)}px`;
    el.style.top = `${Math.round(r.bottom) + 10}px`;
  }
  function ensure() {
    if (el && el.isConnected) return;
    if (!document.getElementById('snRouteArrowStyle')) {
      const st = document.createElement('style'); st.id = 'snRouteArrowStyle'; st.textContent = CSS; document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = 'snRouteArrow';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = ICON + '<div class="ra-line"></div><span class="ra-go" aria-hidden="true">→</span>';
    needle = el.querySelector('.ra-needle'); lineEl = el.querySelector('.ra-line');
    document.body.appendChild(el); lastKey = ''; haveHeading = false; haveNeedle = false;
    if (!resizeBound) { resizeBound = true; window.addEventListener('resize', () => { anchoredKey = ''; if (el && el.isConnected) anchor(); }); }
  }
  return {
    get state() { return state; },
    hide() { if (el) el.style.display = 'none'; state.active = false; haveBearing = false; haveHeading = false; haveNeedle = false; },
    update(dt, { route, name = '', me, visible = true, speed = 0 } = {}) {
      if (!visible || !route || !route.roads || !route.pts || !me) { this.hide(); return; }
      const g = guideState(route.pts, me, { look: lookAhead(speed) });
      if (!g || g.arrived) { this.hide(); state.arrived = !!(g && g.arrived); return; }
      ensure();
      const d = Math.min(dt, 0.1);
      // cap du trajet (monde) et cap de la caméra, tous deux lissés : l'aiguille glisse, sans saut aux virages ni au recalcul de l'itinéraire
      const rawB = bearingTo(me, g.target) * 180 / Math.PI;
      bearingDeg = haveBearing ? smoothAngle(bearingDeg, rawB, d, 7) : rawB; haveBearing = true;
      const rawH = me.heading * 180 / Math.PI;
      headingDeg = haveHeading ? smoothAngle(headingDeg, rawH, d, 16) : rawH; haveHeading = true;
      Object.assign(state, { active: true, bearing: bearingDeg * Math.PI / 180, heading: headingDeg * Math.PI / 180, name, remaining: g.remaining, offRoute: g.offRoute, off: g.off, arrived: false, turn: g.turn });
      el.style.display = 'flex';
      if (frames++ % 6 === 0) anchor();
      el.classList.toggle('is-off', g.off);
      const rel = relativeDeg(state.bearing, state.heading);
      needleDeg = haveNeedle ? smoothAngle(needleDeg, rel, d, 14) : rel; haveNeedle = true;
      needle.setAttribute('transform', `rotate(${needleDeg.toFixed(1)} 16 16)`);
      const key = `${name}|${g.off ? 1 : 0}|${fmtDist(g.off ? g.offRoute : g.remaining)}|${turnLabel(g.turn)}`;
      if (key !== lastKey) {                                  // le texte ne change que de temps en temps : pas de réécriture du DOM à chaque image
        lastKey = key;
        const sep = '<span class="ra-sep">–</span>';
        lineEl.innerHTML = g.off
          ? `<span class="ra-name">Reviens sur la route</span>${sep}${fmtDist(g.offRoute)}`
          : `<span class="ra-name"></span>${sep}${fmtDist(g.remaining)}${sep}${g.turn ? turnLabel(g.turn) : 'Tout droit'}`;
        if (!g.off) lineEl.querySelector('.ra-name').textContent = name;
      }
    },
  };
}
