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
import { gaugeAngle, isUTurn, relativeDeg, fmtDist, turnLabel } from './route-arrow.js?v=8';

export const SPEED_MAX_KMH = 80;              // fin de l'échelle du compteur (la voiture plafonne à 72 km/h)
export const PANEL_W = 540;                   // largeur du bandeau (px) avant mise à l'échelle
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

/** Échelle du bandeau pour une fenêtre de largeur vw : 1 si elle est assez large, sinon réduite (marge de 8 px de chaque côté). */
export function scaleFor(vw, panelW = PANEL_W) { return Math.max(0.4, Math.min(1, (vw - 16) / panelW)); }

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

/* ---------- dessin ---------- */
const svgNS = 'http://www.w3.org/2000/svg';

function speedoSVG() {
  let t = '';
  for (let v = 0; v <= SPEED_MAX_KMH; v += 5) {
    const major = v % 10 === 0, a = speedNeedleAngle(v);
    t += `<line x1="59" y1="${major ? 9 : 10}" x2="59" y2="${major ? 19 : 15}" stroke="rgba(248,243,234,${major ? 0.9 : 0.5})" stroke-width="${major ? 2 : 1.3}" transform="rotate(${a.toFixed(1)} 59 59)"/>`;
    if (v % 20 === 0) { const r = 33, rad = a * Math.PI / 180; t += `<text x="${(59 + r * Math.sin(rad)).toFixed(1)}" y="${(62 - r * Math.cos(rad)).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" fill="rgba(248,243,234,.85)">${v}</text>`; }
  }
  return `<svg class="cd-speedo" viewBox="0 0 118 118"><circle cx="59" cy="59" r="55" fill="rgba(26,19,15,.62)" stroke="rgba(248,243,234,.8)" stroke-width="2"/>${t}` +
    '<g class="cd-sneedle"><path d="M59 17 L63.5 59 L59 68 L54.5 59 Z" fill="#f8f3ea" stroke="rgba(40,28,22,.9)" stroke-width="1.2" stroke-linejoin="round"/></g>' +
    '<circle cx="59" cy="59" r="6" fill="#3a2a20" stroke="#f8f3ea" stroke-width="2"/>' +
    '<text class="cd-kmh" x="59" y="92" text-anchor="middle" font-size="17" font-weight="800" fill="#f8f3ea">0</text><text x="59" y="104" text-anchor="middle" font-size="9.5" font-weight="700" fill="rgba(248,243,234,.7)">km/h</text></svg>';
}

function guideSVG() {
  let ticks = '';
  for (let a = 0; a < 360; a += 15) { const major = a % 30 === 0; ticks += `<line x1="95" y1="${major ? 13 : 14}" x2="95" y2="${major ? 23 : 19}" stroke="rgba(248,243,234,${major ? 0.8 : 0.45})" stroke-width="${major ? 2 : 1.2}" transform="rotate(${a} 95 98)"/>`; }
  const L = (txt, a, col) => `<text x="95" y="40" text-anchor="middle" font-size="15" font-weight="800" fill="${col}" transform="rotate(${a} 95 98)">${txt}</text>`;
  return '<svg class="cd-guide" viewBox="0 0 190 134"><defs><clipPath id="cdHalf"><rect x="0" y="0" width="190" height="99"/></clipPath></defs>' +
    '<path d="M 10 98 A 85 85 0 0 1 180 98" fill="none" stroke="rgba(26,19,15,.7)" stroke-width="22" stroke-linecap="butt"/>' +
    '<path d="M 3 98 A 92 92 0 0 1 187 98" fill="none" stroke="rgba(248,243,234,.65)" stroke-width="1.6"/>' +
    '<path d="M 18 98 A 77 77 0 0 1 172 98" fill="none" stroke="rgba(248,243,234,.3)" stroke-width="1"/>' +
    `<g clip-path="url(#cdHalf)"><g class="cd-rose">${ticks}${L('N', 0, '#ff8a6a')}${L('E', 90, 'rgba(248,243,234,.9)')}${L('S', 180, 'rgba(248,243,234,.9)')}${L('O', 270, 'rgba(248,243,234,.9)')}</g></g>` +
    '<path d="M95 1 L102 12 L88 12 Z" fill="#f8f3ea" stroke="rgba(40,28,22,.8)" stroke-width="1.2" stroke-linejoin="round"/>' +
    '<g class="cd-gneedle"><path d="M95 22 L106 68 L95 60 L84 68 Z" fill="#f9d58b" stroke="rgba(40,28,22,.95)" stroke-width="2" stroke-linejoin="round"/></g>' +
    '<circle cx="95" cy="98" r="7" fill="#3a2a20" stroke="#f9d58b" stroke-width="2"/>' +
    '<text class="cd-gdist" x="95" y="119" text-anchor="middle" font-size="17" font-weight="800" fill="#f8f3ea">—</text>' +
    '<text class="cd-gsub" x="95" y="131" text-anchor="middle" font-size="10" font-weight="700" fill="rgba(248,243,234,.75)"></text></svg>';
}

const ARROW_L = '<svg viewBox="0 0 34 34"><path d="M2 17 L16 3 L16 11 L32 11 L32 23 L16 23 L16 31 Z" stroke-linejoin="round"/></svg>';
const ARROW_R = '<svg viewBox="0 0 34 34"><path d="M32 17 L18 3 L18 11 L2 11 L2 23 L18 23 L18 31 Z" stroke-linejoin="round"/></svg>';

const ICON_LIGHTS = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><g stroke-width="2" stroke-linecap="round"><line x1="12" y1="2" x2="12" y2="5.5"/><line x1="12" y1="18.5" x2="12" y2="22"/><line x1="2" y1="12" x2="5.5" y2="12"/><line x1="18.5" y1="12" x2="22" y2="12"/><line x1="5" y1="5" x2="7.4" y2="7.4"/><line x1="16.6" y1="16.6" x2="19" y2="19"/><line x1="5" y1="19" x2="7.4" y2="16.6"/><line x1="16.6" y1="7.4" x2="19" y2="5"/></g></svg>';
const ICON_HAZARD = '<svg viewBox="0 0 24 24"><path d="M12 3 L22 20 L2 20 Z" fill="none" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 9.5 L12 14.5" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="17.2" r="1.3"/></svg>';
const ICON_ENGINE = '<svg viewBox="0 0 24 24"><path d="M12 2.5 C12 2.5 5.5 9.5 5.5 14.5 A6.5 6.5 0 0 0 18.5 14.5 C18.5 9.5 12 2.5 12 2.5 Z" stroke-width="1.5"/><path d="M9.2 14.5 A2.8 2.8 0 0 0 12 17.3" fill="none" stroke="rgba(26,19,15,.85)" stroke-width="1.8" stroke-linecap="round"/></svg>';

function fuelSVG() {
  let t = '';
  for (let i = 0; i <= 8; i++) { const a = -120 + 240 * i / 8; t += `<line x1="23" y1="5" x2="23" y2="${i % 4 === 0 ? 11 : 9}" stroke="rgba(248,243,234,.8)" stroke-width="${i % 4 === 0 ? 2 : 1.2}" transform="rotate(${a} 23 23)"/>`; }
  return '<svg class="cd-fuel" viewBox="0 0 46 46"><circle cx="23" cy="23" r="21" fill="rgba(26,19,15,.62)" stroke="rgba(248,243,234,.75)" stroke-width="1.8"/>' +
    '<path d="M 6.5 33.5 A 19 19 0 0 1 9 11" fill="none" stroke="#e5483a" stroke-width="3" transform="rotate(0 23 23)"/>' + t +
    '<g class="cd-fneedle"><path d="M23 8 L25.4 23 L23 26 L20.6 23 Z" fill="#f8f3ea" stroke="rgba(40,28,22,.9)" stroke-width="1" stroke-linejoin="round"/></g><circle cx="23" cy="23" r="3.2" fill="#3a2a20" stroke="#f8f3ea" stroke-width="1.4"/>' +
    '<text x="9" y="44" font-size="7.5" font-weight="800" fill="#ff8a6a" text-anchor="middle">E</text><text x="37" y="44" font-size="7.5" font-weight="800" fill="rgba(248,243,234,.85)" text-anchor="middle">F</text></svg>';
}
const ICON_PUMP = '<svg viewBox="0 0 24 24"><path d="M5 21 V5 a2 2 0 0 1 2-2 h6 a2 2 0 0 1 2 2 V21 Z" /><rect x="7.5" y="6" width="5" height="4" fill="rgba(26,19,15,.8)"/><path d="M15 9 h2.5 a2 2 0 0 1 2 2 v6 a1.4 1.4 0 0 0 2.8 0 V8 l-2.6-2.6" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const CSS = `
#snDash { position: fixed; left: 50%; bottom: 92px; width: ${PANEL_W}px; height: 138px; z-index: 58; pointer-events: none; display: none;
  transform: translateX(-50%) scale(1); transform-origin: 50% 100%; opacity: 0; transition: opacity .35s;
  font-family: 'Rajdhani', 'Open Sans', system-ui, sans-serif; color: #f8f3ea; }
#snDash.on { opacity: 1; }
#snDash .cd-panel { position: absolute; inset: 0; border-radius: 22px; background: rgba(58,42,32,.86); border: 1px solid rgba(249,213,139,.55);
  box-shadow: 0 6px 22px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.08); backdrop-filter: blur(5px); }
#snDash svg { display: block; overflow: visible; }
#snDash .cd-speedo { position: absolute; left: 10px; top: 10px; width: 118px; height: 118px; }
#snDash .cd-guide { position: absolute; left: 175px; top: 2px; width: 190px; height: 134px; }
#snDash .cd-gneedle path { transition: fill .18s, opacity .08s; }
#snDash .cd-gneedle.good path { fill: #c8f24a; filter: drop-shadow(0 0 6px rgba(200,242,74,.8)); }
#snDash .cd-gneedle.ok path, #snDash .cd-gneedle.bad path { fill: #ff3b30; filter: drop-shadow(0 0 6px rgba(255,59,48,.85)); }      /* plus de jaune : écart moyen = rouge fixe, mauvaise direction = rouge clignotant */
#snDash .cd-gneedle.bad.dim { opacity: .18; }
#snDash .cd-turn { position: absolute; top: 34px; width: 34px; height: 34px; }
#snDash .cd-turn svg { width: 34px; height: 34px; }
#snDash .cd-turn path { fill: rgba(255,255,255,.10); stroke: rgba(255,255,255,.22); stroke-width: 1.2; transition: fill .08s; }
#snDash .cd-turn.hint path { fill: rgba(75,224,122,.38); stroke: rgba(75,224,122,.7); }
#snDash .cd-turn.on path { fill: #4be07a; stroke: #b6ffcf; filter: drop-shadow(0 0 6px rgba(75,224,122,.9)); }
#snDash .cd-tl { left: 138px; } #snDash .cd-tr { left: 368px; }
#snDash .cd-right { position: absolute; left: 412px; top: 12px; width: 118px; height: 114px; }
#snDash .cd-gears { position: absolute; left: 0; top: 18px; width: 118px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; letter-spacing: .02em; }
#snDash .cd-gears span { width: 19px; text-align: center; color: rgba(248,243,234,.38); }
#snDash .cd-gears span.cur { color: #f8f3ea; }
#snDash .cd-gbox { position: absolute; top: 0; width: 24px; height: 18px; line-height: 16px; text-align: center; font-size: 13px; font-weight: 800; border: 1.5px solid #f8f3ea; border-radius: 6px; background: rgba(26,19,15,.7); left: 0; transition: left .12s; }
#snDash .cd-icons { position: absolute; left: 0; top: 46px; display: flex; gap: 9px; }
#snDash .cd-ic { width: 25px; height: 25px; }
#snDash .cd-ic svg { width: 25px; height: 25px; fill: rgba(248,243,234,.2); stroke: rgba(248,243,234,.28); }
#snDash .cd-ic.green svg { fill: #6bdc8a; stroke: #6bdc8a; filter: drop-shadow(0 0 4px rgba(107,220,138,.7)); }
#snDash .cd-ic.amber svg { fill: #ffb44a; stroke: #ffb44a; filter: drop-shadow(0 0 4px rgba(255,180,74,.7)); }
#snDash .cd-ic.red svg { fill: #ff5a48; stroke: #ff5a48; filter: drop-shadow(0 0 4px rgba(255,90,72,.8)); }
#snDash .cd-ic.hazard svg { fill: none; }
#snDash .cd-ic.hazard.red svg circle { fill: #ff5a48; }
#snDash .cd-fuelw { position: absolute; left: 4px; top: 74px; width: 108px; height: 40px; }
#snDash .cd-fuel { position: absolute; left: 0; top: -6px; width: 46px; height: 46px; }
#snDash .cd-pump { position: absolute; left: 56px; top: 9px; width: 22px; height: 22px; }
#snDash .cd-pump svg { width: 22px; height: 22px; fill: rgba(248,243,234,.85); stroke: rgba(248,243,234,.85); }
#snDash .cd-hint { position: absolute; left: 50%; bottom: calc(100% + 10px); transform: translateX(-50%); padding: 8px 16px; border-radius: 14px; white-space: nowrap;
  background: rgba(40,30,22,.82); border: 1px solid rgba(249,213,139,.7); color: #fbeed1; font: 700 14px 'Open Sans', system-ui, sans-serif; opacity: 0; transition: opacity .6s; }
#snDash .cd-hint.show { opacity: 1; }
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
    el.innerHTML = '<div class="cd-panel"></div>' + speedoSVG() + `<div class="cd-turn cd-tl">${ARROW_L}</div>` + guideSVG() + `<div class="cd-turn cd-tr">${ARROW_R}</div>` +
      '<div class="cd-right"><div class="cd-gbox">N</div><div class="cd-gears"><span data-g="R">R</span><span data-g="N">N</span><span data-g="1">1</span><span data-g="2">2</span><span data-g="3">3</span><span data-g="4">4</span></div>' +
      `<div class="cd-icons"><div class="cd-ic cd-lights">${ICON_LIGHTS}</div><div class="cd-ic hazard cd-hazard">${ICON_HAZARD}</div><div class="cd-ic cd-engine">${ICON_ENGINE}</div></div>` +
      `<div class="cd-fuelw">${fuelSVG()}<div class="cd-pump">${ICON_PUMP}</div></div></div><div class="cd-hint"></div>`;
    document.body.appendChild(el);
    refs = {
      sneedle: el.querySelector('.cd-sneedle'), kmh: el.querySelector('.cd-kmh'), rose: el.querySelector('.cd-rose'), gneedle: el.querySelector('.cd-gneedle'),
      gdist: el.querySelector('.cd-gdist'), gsub: el.querySelector('.cd-gsub'), tl: el.querySelector('.cd-tl'), tr: el.querySelector('.cd-tr'),
      gbox: el.querySelector('.cd-gbox'), gears: [...el.querySelectorAll('.cd-gears span')], lights: el.querySelector('.cd-lights'), hazard: el.querySelector('.cd-hazard'),
      engine: el.querySelector('.cd-engine'), fneedle: el.querySelector('.cd-fneedle'), hint: el.querySelector('.cd-hint'),
    };
    const fit = () => { scale = scaleFor(innerWidth); el.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`; };
    fit(); window.addEventListener('resize', fit);
    haveHeading = false; haveG = false;
  }
  const api = {
    /** Les touches s'affichent `ms` millisecondes (html : le texte des touches, fourni par vehicle.js), puis s'effacent. */
    showHint(html, ms = 9000) {
      ensure(); refs.hint.innerHTML = html; refs.hint.classList.add('show');
      clearTimeout(hintTimer); hintTimer = setTimeout(() => refs && refs.hint.classList.remove('show'), ms);
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
      refs.sneedle.setAttribute('transform', `rotate(${num(speedNeedleAngle(kmhShown))} 59 59)`);
      refs.kmh.textContent = String(Math.round(kmhShown));
      // rapport
      gear = gearOf(gear, data.speed);
      refs.gears.forEach((s) => s.classList.toggle('cur', String(gear) === s.dataset.g));
      const idx = ['R', 'N', 1, 2, 3, 4].findIndex((g) => g === gear);
      refs.gbox.textContent = String(gear); refs.gbox.style.left = `${Math.round(idx * 19.8 + 9.5 - 12)}px`;
      // cadran de guidage : la rose tourne avec la caméra ; l'aiguille pointe (cap du trajet − cap de la caméra), bornée à ±90° (demi-cercle)
      const hDeg = data.heading * 180 / Math.PI;
      heading = haveHeading ? smoothDeg(heading, hDeg, d, 16) : hDeg; haveHeading = true;
      refs.rose.setAttribute('transform', `rotate(${num(-heading)} 95 98)`);
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
      // clignotants
      const bl = blinkerState({ steer: data.steer, hazard: data.hazard, turn: g && g.active && !g.off ? g.turn : null, phase: data.phase });
      refs.tl.className = `cd-turn cd-tl ${bl.left}`; refs.tr.className = `cd-turn cd-tr ${bl.right}`;
      // voyants
      refs.lights.className = `cd-ic cd-lights ${data.beams ? 'green' : ''}`;
      refs.hazard.className = `cd-ic hazard cd-hazard ${data.hazard && data.phase ? 'red' : ''}`;
      refs.engine.className = `cd-ic cd-engine ${data.drowned ? 'red' : data.wet ? 'amber' : ''}`;
      // essence (décorative) : baisse avec la distance parcourue
      fuel = fuelAfter(fuel, Math.abs(data.speed) * d);
      refs.fneedle.setAttribute('transform', `rotate(${num(-120 + 240 * fuel)} 23 23)`);
    },
    get fuel() { return fuel; },
  };
  return api;
}
