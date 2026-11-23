/* ==========================================================
   TABLEAU DE BORD DE LA VOITURE — interface à l'écran, affichée en conduite à la place de l'ancienne barre de touches
   ----------------------------------------------------------
   Trois zones dans un seul bandeau en bas de l'écran :
     • à gauche : COMPTEUR DE VITESSE (aiguille + « 42 km/h ») ;
     • au centre : CADRAN DE GUIDAGE EN DEMI-CERCLE. La rose N/E/S/O tourne avec la caméra, l'aiguille jaune pointe vers la direction de l'itinéraire
       (droit devant = en haut ; derrière soi, l'aiguille reste sur le côté et le texte annonce « Demi-tour »). Dessous : distance restante et
       prochain virage. De part et d'autre, les CLIGNOTANTS : verts clignotants quand ceux de la voiture sont actifs (braquage, feux de détresse),
       vert tamisé quand l'itinéraire annonce un virage dans moins de 90 m ;
     • à droite : BOÎTE DE VITESSES (R N 1 2 3 4, automatique selon la vitesse), VOYANTS (phares, feux de détresse, moteur / eau) et JAUGE D'ESSENCE.
   Les touches (V vue, L phares, H détresse, F descendre) s'affichent 9 s à l'entrée dans la voiture, puis s'effacent.

   Logique pure (speedKmh, speedNeedleAngle, gearOf, blinkerState, fuelAfter, scaleFor) : testée sous Node (tests/car-dashboard.test.mjs).
   Données : voir CarDashboard.update(dt, data). Le guidage vient de window.CityMap.guide (app/route-arrow.js).
   ========================================================== */
import { gaugeAngle, isUTurn, relativeDeg, fmtDist, turnLabel } from './route-arrow.js?v=9';

export const SPEED_MAX_KMH = 120;             // fin de l'échelle du compteur (pointe : 72 km/h, jusqu'à ~115 km/h accélérateur maintenu)
export const PANEL_W = 760;                   // largeur du bandeau (px) avant mise à l'échelle
export const TURN_HINT_DIST = 90;             // m : à moins de 90 m d'un virage de l'itinéraire, la flèche correspondante s'allume doucement
export const FUEL_FLOOR = 0.12;               // l'essence ne descend jamais sous 12 % (jauge décorative : aucun effet sur la conduite)
export const FUEL_PER_M = 0.01 / 250;         // 1 % tous les 250 m

/** Vitesse en km/h (valeur absolue) à partir de m/s. */
export function speedKmh(ms) { return Math.abs(ms) * 3.6; }

/** Angle de l'aiguille du compteur : −135° à 0 km/h, +135° à SPEED_MAX_KMH, borné. */
export function speedNeedleAngle(kmh) { return -135 + 270 * Math.max(0, Math.min(1, kmh / SPEED_MAX_KMH)); }

/** Rapport engagé (boîte automatique simulée) : 'R' en marche arrière, 'N' à l'arrêt, puis 1 à 4 avec hystérésis (pas de va-et-vient aux seuils). */
export function gearOf(prev, speedMs) {
  if (speedMs < -0.25) return 'R';
  const k = speedKmh(speedMs);
  if (k < 2) return 'N';
  const up = [14, 30, 48], down = [12, 27, 45];
  let g = typeof prev === 'number' ? prev : 1;
  while (g < 4 && k >= up[g - 1]) g++;
  while (g > 1 && k < down[g - 2]) g--;
  return g;
}

/**
 * État des deux flèches de clignotant : 'off' | 'hint' | 'on'.
 *  - 'on' (vert vif) : le clignotant de la voiture est actif (braquage au-delà du seuil, ou feux de détresse) pendant la phase allumée du clignotement ;
 *  - 'hint' (vert tamisé) : l'itinéraire annonce un virage de ce côté à moins de TURN_HINT_DIST ;
 *  - 'off' sinon. steer > 0 = braquage à gauche (même convention que vehicle.js).
 */
export function blinkerState({ steer = 0, hazard = false, turn = null, phase = true } = {}) {
  const hint = { left: 'off', right: 'off' };
  if (turn && turn.dist <= TURN_HINT_DIST && Math.abs(turn.deg) >= 35) hint[turn.deg < 0 ? 'left' : 'right'] = 'hint';
  const active = { left: hazard || steer > 0.12, right: hazard || steer < -0.12 };
  return { left: active.left && phase ? 'on' : hint.left, right: active.right && phase ? 'on' : hint.right };
}

/** Niveau d'essence après avoir roulé `meters` m (jauge décorative) : baisse lente, jamais sous FUEL_FLOOR. */
export function fuelAfter(level, meters) { return Math.max(FUEL_FLOOR, Math.min(1, level - Math.abs(meters) * FUEL_PER_M)); }

export const PANEL_BOTTOM = 92;               // marge basse (px) sur grand écran
export const FULL_HEIGHT = 700;               // à partir de cette hauteur de fenêtre (px), le bandeau garde sa taille pleine
export const MIN_HEIGHT_SCALE = 0.3;          // plancher de l'échelle due à la hauteur (téléphone en paysage très bas)

/** Échelle due à la hauteur vh de la fenêtre : 1 à partir de 700 px, puis chute franche (≈ 0,69 à 577 px, ≈ 0,36 à 385 px, 0,3 à 300 px). */
export function heightScale(vh = Infinity) {
  if (!Number.isFinite(vh) || vh >= FULL_HEIGHT) return 1;
  const t = Math.max(0, (vh - 300) / (FULL_HEIGHT - 300));
  return MIN_HEIGHT_SCALE + (1 - MIN_HEIGHT_SCALE) * Math.pow(t, 1.6);
}

/** Marge basse du bandeau : 92 px sur grand écran, jusqu'à 10 px sur écran peu haut (la rangée de boutons du bas est retirée en voiture). */
export function bottomFor(vh = Infinity) {
  if (!Number.isFinite(vh) || vh >= FULL_HEIGHT) return PANEL_BOTTOM;
  const t = Math.min(1, Math.max(0, (vh - 480) / (FULL_HEIGHT - 480)));
  return Math.round(10 + (PANEL_BOTTOM - 10) * t);
}

/** Échelle du bandeau pour une fenêtre de largeur vw (marge de 8 px de chaque côté, plancher 0,4) et, si fournie, de hauteur vh :
 *  1 si la fenêtre est assez grande, sinon réduite. La hauteur compte : sur un téléphone en paysage, large mais peu haut,
 *  un bandeau à l'échelle 1 recouvrirait le milieu de l'écran et le bandeau de guidage. */
export function scaleFor(vw, panelW = PANEL_W, vh = Infinity) {
  const byWidth = Math.max(0.4, (vw - 16) / panelW);
  return Math.min(1, byWidth, heightScale(vh));
}

/** Texte du cadran de guidage : { dist, sub, uturn }. Sans itinéraire : tirets et invitation à choisir un lieu. */
export function guideText(guide) {
  if (!guide || !guide.active) return { dist: '—', sub: 'Choisis un lieu (carte)', uturn: false };
  if (guide.off) return { dist: fmtDist(guide.offRoute), sub: 'Reviens sur la route', uturn: false };
  const rel = relativeDeg(guide.bearing, guide.heading);
  if (isUTurn(rel)) return { dist: fmtDist(guide.remaining), sub: 'Demi-tour', uturn: true };
  return { dist: fmtDist(guide.remaining), sub: guide.turn ? turnLabel(guide.turn) : 'Tout droit', uturn: false };
}

/** Ton de l'aiguille de guidage : 'good' (bonne voie : vert-jaune), 'ok' (écart moyen : rouge fixe), 'bad' (mauvaise direction : rouge clignotant).
 *  Hystérésis (entrée / sortie différentes) : l'aiguille ne papillote pas au seuil. relDeg : cap relatif du trajet (−180..180), off : hors route. */
export const TONE = { goodIn: 25, goodOut: 38, badIn: 75, badOut: 58 };
export function guideTone(prev, relDeg, off = false) {
  const a = Math.abs(relDeg);
  if (off) return 'bad';
  if (prev === 'good') return a <= TONE.goodOut ? 'good' : (a >= TONE.badIn ? 'bad' : 'ok');
  if (prev === 'bad') return a >= TONE.badOut ? 'bad' : (a <= TONE.goodIn ? 'good' : 'ok');
  return a <= TONE.goodIn ? 'good' : (a >= TONE.badIn ? 'bad' : 'ok');
}

const TAU = Math.PI * 2;
const wrapDeg = (a) => ((a + 540) % 360) - 180;
const smoothDeg = (cur, target, dt, rate) => cur + wrapDeg(target - cur) * (1 - Math.exp(-rate * Math.max(0, dt)));

/* ---------- dessin : bandeau « hologramme » aux couleurs du jeu (or #f9d58b, crème #f8f3ea, violet #55415d, corail #ff8a6a) ---------- */
const GOLD = '#f9d58b', CREAM = '#f8f3ea', CORAL = '#ff8a6a', GOOD = '#62e08a', ALERT = '#ff5a48';
export const SPEED_BARS = 36;                 // barres du compteur circulaire
export const BAR_SEGS = 12;                   // segments des jauges de droite
export const TRACE_M = 160;                   // mètres d'itinéraire montrés dans le cadran central
export const ROAD = { z0: 16, nearPx: 2.6, yCar: 98, yHorizon: 20, half: 5.5, step: 4 };   // perspective : recul de la caméra (m), px/m au pied de la voiture, horizon, demi-largeur de route (m), pas (m)

/** Projection en perspective d'un point de la route (f = mètres devant la voiture, r = mètres à droite) dans le cadran (voiture en (95, 98)). */
export function roadProject(f, r, R = ROAD) {
  const z = Math.max(0, f) + R.z0, k = R.z0 / z;
  return [95 + r * R.nearPx * k, R.yHorizon + (R.yCar - R.yHorizon) * k];
}

/** Route en perspective à partir des points (f, r) : { poly (ruban dont la largeur diminue avec la distance), mid (ligne centrale) } en chemins SVG ; '' si rien à montrer. */
export function roadRibbon(fr, R = ROAD) {
  // rééchantillonnage tous les R.step m ; on s'arrête dès que la route repasse derrière la voiture
  const pts = [];
  for (let i = 0; i < fr.length; i++) {
    const [f, r] = fr[i];
    if (pts.length > 1 && f < 0.5) break;
    if (!pts.length) { pts.push([f, r]); continue; }
    const [pf, pr] = pts[pts.length - 1], d = Math.hypot(f - pf, r - pr), n = Math.max(1, Math.ceil(d / R.step));
    for (let j = 1; j <= n; j++) pts.push([pf + (f - pf) * j / n, pr + (r - pr) * j / n]);
  }
  if (pts.length < 2) return { poly: '', mid: '' };
  const L = [], Rt = [], M = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tf = b[0] - a[0], tr = b[1] - a[1]; const len = Math.hypot(tf, tr) || 1; tf /= len; tr /= len;
    const nf = -tr, nr = tf;                                   // normale au sol (vers la droite de la route)
    const [f, r] = pts[i];
    L.push(roadProject(f - nf * R.half, r - nr * R.half, R)); Rt.push(roadProject(f + nf * R.half, r + nr * R.half, R)); M.push(roadProject(f, r, R));
  }
  const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  const poly = 'M' + L.map(fmt).join(' L') + ' L' + Rt.reverse().map(fmt).join(' L') + ' Z';
  const mid = 'M' + M.map(fmt).join(' L');
  return { poly, mid };
}

/** Nombre de barres allumées du compteur pour une vitesse (0..SPEED_BARS). */
export function litBars(kmh, n = SPEED_BARS) { return Math.round(Math.max(0, Math.min(1, kmh / SPEED_MAX_KMH)) * n); }

function speedoSVG() {
  let bars = '';
  for (let i = 0; i < SPEED_BARS; i++) {
    const a = -135 + 270 * i / (SPEED_BARS - 1);
    bars += `<line class="cd-sb" data-i="${i}" x1="0" y1="-45" x2="0" y2="-57" stroke-width="4" stroke-linecap="round" transform="translate(225 104) rotate(${a.toFixed(1)})"/>`;
  }
  return `<g class="cd-speedo">${bars}<circle cx="225" cy="104" r="38" fill="none" stroke="${GOLD}" stroke-opacity=".35" stroke-width="1.2"/>` +
    `<text class="cd-kmh" x="225" y="112" text-anchor="middle" font-size="30" font-weight="800" fill="${CREAM}">0</text>` +
    `<text x="225" y="128" text-anchor="middle" font-size="11" font-weight="700" letter-spacing="1.5" fill="${GOLD}">KM/H</text></g>`;
}

function guideSVG() {
  let ticks = '';
  for (let a = 0; a < 360; a += 15) { const major = a % 30 === 0; ticks += `<line x1="95" y1="${major ? 13 : 14}" x2="95" y2="${major ? 23 : 19}" stroke="rgba(248,243,234,${major ? 0.85 : 0.45})" stroke-width="${major ? 2 : 1.2}" transform="rotate(${a} 95 98)"/>`; }
  const L = (txt, a, col) => `<text x="95" y="42" text-anchor="middle" font-size="14" font-weight="800" fill="${col}" transform="rotate(${a} 95 98)">${txt}</text>`;
  return '<g transform="translate(392 128) scale(1.14) translate(-95 -98)"><defs><clipPath id="cdHalf"><rect x="0" y="0" width="190" height="99"/></clipPath><clipPath id="cdTrace"><path d="M 14 98 A 81 81 0 0 1 176 98 Z"/></clipPath><linearGradient id="cdRoadG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#f9d58b" stop-opacity="1"/><stop offset="1" stop-color="#f9d58b" stop-opacity=".35"/></linearGradient><linearGradient id="cdRoadR" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a48" stop-opacity="1"/><stop offset="1" stop-color="#ff5a48" stop-opacity=".35"/></linearGradient></defs>' +
    `<path d="M 6 98 A 89 89 0 0 1 184 98" fill="none" stroke="${GOLD}" stroke-opacity=".8" stroke-width="2"/>` +
    `<path d="M 20 98 A 75 75 0 0 1 170 98" fill="none" stroke="${GOLD}" stroke-opacity=".3" stroke-width="1"/>` +
    `<g clip-path="url(#cdHalf)"><g class="cd-rose">${ticks}</g></g>` +
    `<path d="M95 0 L102 11 L88 11 Z" fill="${CREAM}" stroke="rgba(40,28,22,.8)" stroke-width="1" stroke-linejoin="round"/>` +
    '<g clip-path="url(#cdTrace)"><path class="cd-trace-glow" d=""/><path class="cd-trace" d=""/><path class="cd-road-mid" d=""/></g>' +
    `<g class="cd-gneedle"><path d="M95 24 L105 66 L95 59 L85 66 Z" fill="${GOLD}" stroke="rgba(40,28,22,.95)" stroke-width="1.8" stroke-linejoin="round"/></g>` +
    `<circle cx="95" cy="98" r="6" fill="#3a2a20" stroke="${GOLD}" stroke-width="2"/>` +
    `<text class="cd-gdist" x="95" y="117" text-anchor="middle" font-size="19" font-weight="800" fill="${CREAM}">—</text>` +
    `<text class="cd-gsub" x="95" y="130" text-anchor="middle" font-size="10.5" font-weight="700" fill="rgba(248,243,234,.78)"></text></g>`;
}

const ARROW_L = '<svg viewBox="0 0 34 34"><path d="M2 17 L16 3 L16 11 L32 11 L32 23 L16 23 L16 31 Z" stroke-linejoin="round"/></svg>';
const ARROW_R = '<svg viewBox="0 0 34 34"><path d="M32 17 L18 3 L18 11 L2 11 L2 23 L18 23 L18 31 Z" stroke-linejoin="round"/></svg>';

const ICON_LIGHTS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><g stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22"/><line x1="2" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7.4" y2="7.4"/><line x1="16.6" y1="16.6" x2="19" y2="19"/><line x1="5" y1="19" x2="7.4" y2="16.6"/><line x1="16.6" y1="7.4" x2="19" y2="5"/></g></svg>';
const ICON_HAZARD = '<svg viewBox="0 0 24 24"><path d="M12 3 L22 20 L2 20 Z" fill="none" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5 L12 14.5" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.3"/></svg>';
const ICON_ENGINE = '<svg viewBox="0 0 24 24"><path d="M12 2.5 C12 2.5 5.5 9.5 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 9.5 12 2.5 12 2.5 Z" stroke-width="1.5"/><path d="M9.2 14.5 A2.8 2.8 0 0 0 12 17.3" fill="none" stroke="rgba(26,19,15,.85)" stroke-width="1.8" stroke-linecap="round"/></svg>';
const ICON_DIAL = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke-width="2"/><path d="M12 12 L16.5 7.5" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8"/></svg>';
const ICON_PUMP = '<svg viewBox="0 0 24 24"><path d="M5 21 V5 a2 2 0 0 1 2-2 h6 a2 2 0 0 1 2 2 V21 Z" /><rect x="7.5" y="6" width="5" height="4" fill="rgba(26,19,15,.8)"/><path d="M15 9 h2.5 a2 2 0 0 1 2 2 v6 a1.4 1.4 0 0 0 2.8 0 V8 l-2.6-2.6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TEMP = '<svg viewBox="0 0 24 24"><path d="M10 14 V4 a2 2 0 0 1 4 0 V14 a4 4 0 1 1 -4 0 Z" fill="none" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="17" r="2"/></svg>';

/* cadre : contour de bandeau à pans coupés, crête centrale, bas légèrement creusé */
const FRAME = '<path class="cd-frame" d="M18 66 L128 66 L148 52 L612 52 L632 66 L742 66 L748 150 Q 380 176 12 150 Z"/>' +
  `<path d="M24 160 Q 380 184 736 160" fill="none" stroke="${GOLD}" stroke-opacity=".5" stroke-width="1.2"/>` +
  `<path d="M150 58 H610" fill="none" stroke="${GOLD}" stroke-opacity=".5" stroke-width="1"/>`;

const CSS = `
#snDash { position: fixed; left: 50%; bottom: 92px; width: ${PANEL_W}px; height: 188px; z-index: 58; pointer-events: none; display: none;
  transform: translateX(-50%) scale(1); transform-origin: 50% 100%; opacity: 0; transition: opacity .35s;
  font-family: 'Rajdhani', 'Open Sans', system-ui, sans-serif; color: ${CREAM}; }
#snDash.on { opacity: 1; }
#snDash svg { display: block; overflow: visible; }
#snDash .cd-art { position: absolute; left: 0; top: 0; width: ${PANEL_W}px; height: 188px; }
#snDash .cd-frame { fill: rgba(70,52,78,.66); stroke: ${GOLD}; stroke-width: 1.8; filter: drop-shadow(0 0 7px rgba(249,213,139,.45)); }
#snDash .cd-sb { stroke: rgba(248,243,234,.16); transition: stroke .08s; }
#snDash .cd-sb.lit { stroke: ${GOLD}; filter: drop-shadow(0 0 3px rgba(249,213,139,.7)); }
#snDash .cd-sb.lit.hot { stroke: ${CORAL}; filter: drop-shadow(0 0 3px rgba(255,138,106,.8)); }
#snDash .cd-radar { position: absolute; left: 14px; top: 36px; width: 124px; height: 124px; pointer-events: auto; cursor: pointer; }
#snDash .cd-radar .cd-clip { position: absolute; inset: 8px; border-radius: 50%; overflow: hidden; background: rgba(40,28,48,.85); }
#snDash .cd-radar canvas { width: 100%; height: 100%; display: block; transform-origin: 50% 50%; }
#snDash .cd-radar .cd-ring { position: absolute; inset: 0; width: 100%; height: 100%; }
#snDash .cd-radar .cd-lbl { position: absolute; left: 0; right: 0; bottom: 3px; text-align: center; font-size: 11px; font-weight: 800; letter-spacing: 1.4px; color: ${GOLD}; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
#snDash .cd-gneedle { display: none; }                         /* le tracé de l'itinéraire remplace l'aiguille */
#snDash .cd-trace { fill: url(#cdRoadG); stroke: #fff4d6; stroke-opacity: .9; stroke-width: 1.4; stroke-linejoin: round; }
#snDash .cd-trace-glow { fill: #f9d58b; fill-opacity: .45; stroke: #f9d58b; stroke-opacity: .45; stroke-width: 6; stroke-linejoin: round; filter: blur(4px); }
#snDash .cd-road-mid { fill: none; stroke: #3a2a20; stroke-opacity: .55; stroke-width: 1.6; stroke-dasharray: 5 6; stroke-linecap: round; }
#snDash .cd-trace.bad { fill: url(#cdRoadR); stroke: #ffd2c8; } #snDash .cd-trace.bad.dim { opacity: .4; }
#snDash .cd-trace.idle, #snDash .cd-trace-glow.idle, #snDash .cd-road-mid.idle { display: none; }
#snDash .cd-gneedle path { transition: fill .18s, opacity .08s; }
#snDash .cd-gneedle.good path { fill: ${GOOD}; filter: drop-shadow(0 0 6px rgba(98,224,138,.8)); }
#snDash .cd-gneedle.ok path, #snDash .cd-gneedle.bad path { fill: ${ALERT}; filter: drop-shadow(0 0 6px rgba(255,90,72,.85)); }
#snDash .cd-gneedle.bad.dim { opacity: .18; }
#snDash .cd-turn { position: absolute; top: 64px; width: 30px; height: 30px; opacity: 0; transition: opacity .15s; }
#snDash .cd-turn.hint, #snDash .cd-turn.on { opacity: 1; }
#snDash .cd-turn svg { width: 30px; height: 30px; }
#snDash .cd-turn path { fill: rgba(248,243,234,.10); stroke: rgba(248,243,234,.28); stroke-width: 1.2; transition: fill .08s; }
#snDash .cd-turn.hint path { fill: rgba(98,224,138,.38); stroke: rgba(98,224,138,.7); }
#snDash .cd-turn.on path { fill: ${GOOD}; stroke: #d6ffe3; filter: drop-shadow(0 0 6px rgba(98,224,138,.9)); }
#snDash .cd-tl { left: 292px; } #snDash .cd-tr { left: 438px; }
#snDash .cd-right { position: absolute; left: 498px; top: 62px; width: 132px; height: 96px; }
#snDash .cd-gears { position: absolute; left: 0; top: 24px; width: 132px; display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; letter-spacing: .02em; }
#snDash .cd-gears span { width: 22px; text-align: center; color: rgba(248,243,234,.38); }
#snDash .cd-gears span.cur { color: ${CREAM}; }
#snDash .cd-gbox { position: absolute; top: 0; left: 0; width: 28px; height: 22px; line-height: 20px; text-align: center; font-size: 16px; font-weight: 800; border: 1.6px solid ${GOLD}; border-radius: 7px; background: rgba(40,28,48,.75); color: ${GOLD}; transition: left .12s; }
#snDash .cd-icons { position: absolute; left: 0; top: 56px; display: flex; gap: 8px; }
#snDash .cd-ic { width: 22px; height: 22px; }
#snDash .cd-ic svg { width: 22px; height: 22px; fill: rgba(248,243,234,.22); stroke: rgba(248,243,234,.3); }
#snDash .cd-ic.green svg { fill: ${GOOD}; stroke: ${GOOD}; filter: drop-shadow(0 0 4px rgba(98,224,138,.7)); }
#snDash .cd-ic.amber svg { fill: #ffb44a; stroke: #ffb44a; filter: drop-shadow(0 0 4px rgba(255,180,74,.7)); }
#snDash .cd-ic.red svg { fill: ${ALERT}; stroke: ${ALERT}; filter: drop-shadow(0 0 4px rgba(255,90,72,.8)); }
#snDash .cd-ic.hazard svg { fill: none; }
#snDash .cd-ic.hazard.red svg circle { fill: ${ALERT}; }
#snDash .cd-bars { position: absolute; left: 650px; top: 64px; width: 92px; display: flex; flex-direction: column; gap: 9px; }
#snDash .cd-bar { display: flex; align-items: center; gap: 6px; height: 14px; }
#snDash .cd-bar svg { width: 15px; height: 15px; flex: none; fill: ${GOLD}; stroke: ${GOLD}; }
#snDash .cd-bar.warn svg { fill: none; stroke: #ffb44a; }
#snDash .cd-bar .cd-segs { display: flex; gap: 1.5px; flex: 1; height: 12px; }
#snDash .cd-bar .cd-segs i { flex: 1; border-radius: 1.5px; background: rgba(248,243,234,.16); transform: skewX(-18deg); }
#snDash .cd-bar .cd-segs i.on { background: ${GOLD}; box-shadow: 0 0 4px rgba(249,213,139,.6); }
#snDash .cd-bar.warn .cd-segs i.on { background: #ffb44a; box-shadow: 0 0 4px rgba(255,180,74,.6); }
#snDash .cd-bar.warn.red .cd-segs i.on { background: ${ALERT}; box-shadow: 0 0 4px rgba(255,90,72,.7); }
#snDash .cd-hint { position: absolute; right: 8px; bottom: calc(100% - 18px); display: flex; gap: 7px; flex-wrap: nowrap; white-space: nowrap; opacity: 0; transition: opacity .6s; }
#snDash .cd-hint.show { opacity: 1; }
#snDash .cd-key { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px 5px 6px; border-radius: 9px; background: rgba(70,52,78,.82); border: 1px solid rgba(249,213,139,.7); color: ${CREAM}; font: 700 13px 'Rajdhani', 'Open Sans', system-ui, sans-serif; letter-spacing: .02em; box-shadow: 0 0 8px rgba(249,213,139,.25); }
#snDash .cd-key kbd { min-width: 20px; padding: 1px 5px; text-align: center; border: 1.2px solid ${GOLD}; border-radius: 6px; color: ${GOLD}; font: 800 12px 'Rajdhani', system-ui, sans-serif; }
body.in-car #cityMap { display: none !important; }
`;

export function createCarDashboard() {
  let el = null, refs = null;
  let tone = 'ok', kmhShown = 0, gear = 'N', fuel = 1, heading = 0, haveHeading = false, gNeedle = 0, haveG = false, hintTimer = 0, scale = 1;
  const num = (v, d = 1) => v.toFixed(d);
  function ensure() {
    if (el && el.isConnected) return;
    if (!document.getElementById('snDashStyle')) { const st = document.createElement('style'); st.id = 'snDashStyle'; st.textContent = CSS; document.head.appendChild(st); }
    el = document.createElement('div');
    el.id = 'snDash';
    el.setAttribute('aria-hidden', 'true');
    const seg = () => '<i></i>'.repeat(BAR_SEGS);
    el.innerHTML = `<svg class="cd-art" viewBox="0 0 ${PANEL_W} 188">${FRAME}${speedoSVG()}${guideSVG()}</svg>` +
      '<div class="cd-radar"><svg class="cd-ring" viewBox="0 0 124 124"><circle cx="62" cy="62" r="60" fill="none" stroke="#f9d58b" stroke-width="2"/><circle cx="62" cy="62" r="55" fill="none" stroke="#f9d58b" stroke-opacity=".35" stroke-width="1" stroke-dasharray="3 5"/></svg><div class="cd-clip"><canvas width="220" height="220"></canvas></div><span class="cd-lbl">CARTE</span></div>' +
      `<div class="cd-turn cd-tl">${ARROW_L}</div><div class="cd-turn cd-tr">${ARROW_R}</div>` +
      '<div class="cd-right"><div class="cd-gbox">N</div><div class="cd-gears"><span data-g="R">R</span><span data-g="N">N</span><span data-g="1">1</span><span data-g="2">2</span><span data-g="3">3</span><span data-g="4">4</span></div>' +
      `<div class="cd-icons"><div class="cd-ic cd-lights">${ICON_LIGHTS}</div><div class="cd-ic hazard cd-hazard">${ICON_HAZARD}</div><div class="cd-ic cd-engine">${ICON_ENGINE}</div><div class="cd-ic">${ICON_DIAL}</div><div class="cd-ic">${ICON_PUMP}</div></div></div>` +
      `<div class="cd-bars"><div class="cd-bar cd-b-fuel">${ICON_PUMP}<div class="cd-segs">${seg()}</div></div><div class="cd-bar cd-b-load">${ICON_TEMP}<div class="cd-segs">${seg()}</div></div>` +
      `<div class="cd-bar warn cd-b-warn">${ICON_HAZARD}<div class="cd-segs">${seg()}</div></div><div class="cd-bar cd-b-beam">${ICON_LIGHTS}<div class="cd-segs">${seg()}</div></div></div><div class="cd-hint"></div>`;
    document.body.appendChild(el);
    refs = {
      sbars: [...el.querySelectorAll('.cd-sb')], kmh: el.querySelector('.cd-kmh'), rose: el.querySelector('.cd-rose'), gneedle: el.querySelector('.cd-gneedle'),
      gdist: el.querySelector('.cd-gdist'), gsub: el.querySelector('.cd-gsub'), tl: el.querySelector('.cd-tl'), tr: el.querySelector('.cd-tr'),
      gbox: el.querySelector('.cd-gbox'), gears: [...el.querySelectorAll('.cd-gears span')], lights: el.querySelector('.cd-lights'), hazard: el.querySelector('.cd-hazard'),
      engine: el.querySelector('.cd-engine'), hint: el.querySelector('.cd-hint'), trace: el.querySelector('.cd-trace'), traceGlow: el.querySelector('.cd-trace-glow'), mid: el.querySelector('.cd-road-mid'),
      radar: el.querySelector('.cd-radar'), rcv: el.querySelector('.cd-radar canvas'),
      bars: { fuel: el.querySelector('.cd-b-fuel'), load: el.querySelector('.cd-b-load'), warn: el.querySelector('.cd-b-warn'), beam: el.querySelector('.cd-b-beam') },
    };
    refs.rctx = refs.rcv.getContext('2d');
    refs.radar.addEventListener('click', () => { try { window.CityMap?.open?.(); } catch (_) {} });          // toucher la mini-carte du tableau de bord ouvre la grande carte
    for (const k of Object.keys(refs.bars)) refs.bars[k].segs = [...refs.bars[k].querySelectorAll('.cd-segs i')];
    const fit = () => {
      scale = scaleFor(innerWidth, PANEL_W, innerHeight);
      el.style.bottom = `${bottomFor(innerHeight)}px`;
      el.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`;
    };
    fit(); window.addEventListener('resize', fit); window.addEventListener('orientationchange', () => setTimeout(fit, 250));
    haveHeading = false; haveG = false;
  }
  const api = {
    /** Les touches s'affichent `ms` millisecondes (html : le texte des touches, fourni par vehicle.js), puis s'effacent. */
    showHint(html, ms = 9000) {
      ensure(); refs.hint.innerHTML = html; refs.hint.classList.add('show');
      clearTimeout(hintTimer); if (ms > 0) hintTimer = setTimeout(() => refs && refs.hint.classList.remove('show'), ms);        // ms = 0 : les touches restent affichées
    },
    /** Plein d'essence (au départ). La jauge est décorative : aucun effet sur la conduite. */
    refuel() { fuel = 1; },
    hide() { if (el) { el.classList.remove('on'); el.style.display = 'none'; } clearTimeout(hintTimer); if (refs) refs.hint.classList.remove('show'); haveHeading = false; haveG = false; },
    /**
     * data : { speed (m/s, signée), steer (rad, > 0 = gauche), hazard, beams, drowned, wet, braking, phase (clignotement), heading (rad, cap de la caméra : 0 = nord, + vers l'est),
     *          guide (window.CityMap.guide) }
     */
    update(dt, data) {
      ensure();
      const d = Math.min(Math.max(dt, 0), 0.1);
      if (el.style.display !== 'block') { el.style.display = 'block'; void el.offsetWidth; }
      el.classList.add('on');
      // vitesse
      const kmh = speedKmh(data.speed);
      kmhShown += (kmh - kmhShown) * (1 - Math.exp(-18 * d));
      const lit = litBars(kmhShown);
      refs.sbars.forEach((b, i) => { b.classList.toggle('lit', i < lit); b.classList.toggle('hot', i >= Math.round(SPEED_BARS * 0.7)); });
      refs.kmh.textContent = String(Math.round(kmhShown));
      // rapport
      gear = gearOf(gear, data.speed);
      refs.gears.forEach((s) => s.classList.toggle('cur', String(gear) === s.dataset.g));
      const idx = ['R', 'N', 1, 2, 3, 4].findIndex((g) => g === gear);
      refs.gbox.textContent = String(gear); refs.gbox.style.left = `${Math.round(idx * 22 + 11 - 14)}px`;
      // cadran de guidage : la rose tourne avec la caméra ; l'aiguille pointe (cap du trajet − cap de la caméra), bornée à ±90° (demi-cercle)
      const hDeg = data.heading * 180 / Math.PI;
      heading = haveHeading ? smoothDeg(heading, hDeg, d, 16) : hDeg; haveHeading = true;
      const g = data.guide, txt = guideText(g);
      const rel = g && g.active ? relativeDeg(g.bearing, heading * Math.PI / 180) : 0;
      const target = g && g.active ? gaugeAngle(rel) : 0;
      if (!haveG || Math.abs(target - gNeedle) > 120) gNeedle = target; else gNeedle += (target - gNeedle) * (1 - Math.exp(-20 * d));   // un saut +90° <-> −90° (demi-tour) ne balaie pas tout l'arc
      haveG = true;
      refs.gneedle.setAttribute('transform', `rotate(${num(gNeedle)} 95 98)`);
      tone = g && g.active ? guideTone(tone, rel, g.off) : 'ok';
      refs.gneedle.setAttribute('class', `cd-gneedle ${g && g.active ? tone : 'idle'}${tone === 'bad' && g && g.active && !data.phase ? ' dim' : ''}`);       // vert-jaune sur la bonne voie, rouge clignotant à contresens
      refs.gneedle.style.opacity = g && g.active ? '' : '0.25';
      refs.gdist.textContent = txt.dist; refs.gsub.textContent = txt.sub;
      // tracé de l'itinéraire en temps réel, en perspective (route vue depuis la voiture) : ~160 m de route devant, large au pied de la voiture, fine à l'horizon
      const pts = g && g.active && window.CityMap && window.CityMap.ahead ? window.CityMap.ahead(TRACE_M) : null;
      let dPath = '', dMid = '';
      if (pts && pts.length > 1) {
        const hr = heading * Math.PI / 180, sh = Math.sin(hr), ch = Math.cos(hr);
        const rb = roadRibbon(pts.map(([e, n]) => [e * sh + n * ch, e * ch - n * sh]));            // (est, nord) -> (devant, à droite)
        dPath = rb.poly; dMid = rb.mid;
      }
      const trCls = !dPath ? 'idle' : (tone === 'bad' ? 'bad' + (!data.phase ? ' dim' : '') : '');
      refs.trace.setAttribute('d', dPath); refs.traceGlow.setAttribute('d', dPath); refs.mid.setAttribute('d', dMid);
      refs.trace.setAttribute('class', `cd-trace ${trCls}`); refs.traceGlow.setAttribute('class', `cd-trace-glow ${dPath ? '' : 'idle'}`); refs.mid.setAttribute('class', `cd-road-mid ${dPath ? '' : 'idle'}`);
      // clignotants
      const bl = blinkerState({ steer: data.steer, hazard: data.hazard, turn: g && g.active && !g.off ? g.turn : null, phase: data.phase });
      refs.tl.className = `cd-turn cd-tl ${bl.left}`; refs.tr.className = `cd-turn cd-tr ${bl.right}`;
      // voyants
      refs.lights.className = `cd-ic cd-lights ${data.beams ? 'green' : ''}`;
      refs.hazard.className = `cd-ic hazard cd-hazard ${data.hazard && data.phase ? 'red' : ''}`;
      refs.engine.className = `cd-ic cd-engine ${data.drowned ? 'red' : data.wet ? 'amber' : ''}`;
      // essence (décorative) : baisse avec la distance parcourue ; jauges de droite
      fuel = fuelAfter(fuel, Math.abs(data.speed) * d);
      const fill = (bar, frac) => { const n = Math.round(Math.max(0, Math.min(1, frac)) * BAR_SEGS); bar.segs.forEach((sg, i) => sg.classList.toggle('on', i < n)); };
      fill(refs.bars.fuel, fuel);
      fill(refs.bars.load, Math.min(1, kmhShown / SPEED_MAX_KMH));                         // charge moteur : suit la vitesse
      fill(refs.bars.warn, data.drowned ? 1 : data.wet ? 0.6 : 0.08);                      // alerte : monte dans l'eau
      refs.bars.warn.classList.toggle('red', !!data.drowned);
      fill(refs.bars.beam, data.beams ? 1 : 0.15);                                         // phares
      // mini-carte : copie de la mini-carte du jeu (même rotation), cliquable pour ouvrir la grande carte
      const src = document.querySelector('#cityMap canvas');
      if (src && src.width > 8) {
        try { refs.rctx.drawImage(src, 0, 0, refs.rcv.width, refs.rcv.height); refs.rcv.style.transform = src.style.transform || ''; } catch (_) { /* canvas pas prêt */ }
      }
    },
    get fuel() { return fuel; },
  };
  return api;
}
