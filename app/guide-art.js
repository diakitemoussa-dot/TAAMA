/* ==========================================================
   GUIDE — IMAGES ANIMÉES (SVG + CSS, aucune vidéo, aucun GIF)
   ----------------------------------------------------------
   scene(id)            petit dessin animé du sujet (le personnage, le drone, la voiture…)
   device(page, mode)   le geste : touches qui s'enfoncent · souris · manette · écran tactile
   chip(action, mode)   pastille de la bonne touche / du bon bouton (bulles, « ? »)
   icon(nom)            pictogramme (traits de touch-controls.js)
   Les animations sont dans styles/guide.css (boucle de 3 s). Sans animation
   (« animations réduites »), la même image est figée sur la pose utile.
   ========================================================== */

import * as TL from './touch-layout.js?v=1';
import { UI_LABELS } from './guide-content.js?v=35';
import { t } from './i18n.js?v=1';

import { ICO, icon, PAD_COL, PAD_PS, PAD_NAME, padBtn, lang } from './guide-icons.js?v=35';
export { icon, padBtn };
const keys = (k) => (Array.isArray(k) ? k : k[lang()] || k.fr);

/* ---------- Le personnage et les décors ---------- */
const hero = (x, y, s = 1, c = '', extra = '') => `<g transform="translate(${x} ${y}) scale(${s})"><g class="gd-bob ${c}">` +
  '<g class="gd-leg l"><rect x="-6" y="0" width="5.4" height="17" rx="2.7" fill="#5a3a26"/></g><g class="gd-leg r"><rect x="0.6" y="0" width="5.4" height="17" rx="2.7" fill="#5a3a26"/></g>' +
  '<rect x="-9" y="-24" width="7" height="17" rx="3" fill="#c98a4b"/><path d="M-8-26l-3-5 4 2z" fill="#3a281e"/>' +                       // sac à dos (le drone est posé dessus)
  '<rect x="-7" y="-27" width="14" height="29" rx="6" fill="#f9d58b"/><rect x="-7" y="-9" width="14" height="3" fill="#a8703f"/>' +
  `<circle cx="1" cy="-35" r="7.5" fill="#e0a877"/><path d="M-6.5-36a7.5 7.5 0 0115 0c-3-3-11-3-15 0z" fill="#3a281e"/>${extra}</g></g>`;
const SKY = '<rect width="240" height="150" fill="url(#gdSky)"/><circle cx="196" cy="30" r="13" fill="#f9d58b" opacity=".9"/>';
const MOSQ = '<g fill="#b9794a" opacity=".92"><path d="M118 112V70l5-9 5 9v-10l5-12 5 12v10l5-9 5 9v42z"/><path d="M165 112V84h38v28z"/><path d="M158 112V66l4-8 4 8v-14l5-10 5 10v14l4-8 4 8v46z" transform="translate(40 0)"/></g>' +
  '<g stroke="#8a5530" stroke-width="1.6"><path d="M116 76h-4M116 86h-4M116 96h-4M205 70h4M205 80h4M205 90h4"/></g>';
const GROUND = '<rect y="112" width="240" height="38" fill="#7a4f2f"/><path d="M0 112h240" stroke="#e0a05a" stroke-width="2.5"/>';
const SCROLL = (c = '') => `<g class="gd-scroll ${c}"><path d="M0 131h26M60 131h26M120 131h26M180 131h26M240 131h26M300 131h26" stroke="#a8703f" stroke-width="4" stroke-linecap="round"/></g>`;
const base = (inner, bg = SKY + MOSQ + GROUND) => `<svg class="gd-scene" viewBox="0 0 240 150" aria-hidden="true">${bg}${inner}</svg>`;
const DRONE = (c = '', s = 1) => `<g class="${c}"><g transform="scale(${s})"><ellipse cx="-12" cy="-5" rx="9" ry="2" fill="#f8f3ea" class="gd-prop"/><ellipse cx="12" cy="-5" rx="9" ry="2" fill="#f8f3ea" class="gd-prop"/><rect x="-8" y="-4" width="16" height="7" rx="3" fill="#3a281e" stroke="#f9d58b" stroke-width="1.5"/><circle cx="0" cy="6" r="2.4" fill="#f9d58b"/></g></g>`;
const CAR = (c = '') => `<g class="${c}"><g class="gd-cbob"><path d="M-34 0v-14h14l8-12h26l8 12h8v14z" fill="#e0a05a" stroke="#3a281e" stroke-width="2" stroke-linejoin="round"/><path d="M-10-24h10v12h-18z M3-24h8l5 12H3z" fill="#bfe3f2" opacity=".85"/><path d="M-34-14h74" stroke="#a8703f" stroke-width="2"/>` +
  '<g class="gd-wheel"><circle cx="-20" cy="2" r="8" fill="#2a1d15"/><circle cx="-20" cy="2" r="3" fill="#c98a4b"/><path d="M-20-4v3" stroke="#f8f3ea" stroke-width="2.5"/></g><g class="gd-wheel"><circle cx="22" cy="2" r="8" fill="#2a1d15"/><circle cx="22" cy="2" r="3" fill="#c98a4b"/><path d="M22-4v3" stroke="#f8f3ea" stroke-width="2.5"/></g></g></g>';
const BEAM = '<path class="gd-beam" d="M40-12L100-34V6z" fill="#f9d58b" opacity=".5"/>';
const mini = (n, x, y, w, c = '') => `<svg class="${c}" x="${x}" y="${y}" width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICO[n]}</svg>`;

const SCENES = {
  move: () => base(hero(86, 94, 1.25, 'walk') + SCROLL()),
  look: () => base(hero(96, 94, 1.25) + '<path class="gd-cone" d="M104 52L226 8V104z" fill="#f9d58b" opacity=".3"/>' + `<g style="color:#f8f3ea">${mini('eye', 196, 20, 28)}</g>`),
  run: () => base(hero(86, 94, 1.25, 'walk run') + SCROLL('fast') + '<g stroke="#f8f3ea" stroke-width="3" stroke-linecap="round" class="gd-speed" opacity=".7"><path d="M34 52h28M22 66h34M38 80h24"/></g>'),
  jump: () => base('<ellipse class="gd-shadow" cx="100" cy="116" rx="18" ry="4" fill="#000" opacity=".3"/>' + hero(100, 94, 1.25, 'jump') + '<g stroke="#f9d58b" stroke-width="3" stroke-linecap="round" class="gd-speed"><path d="M146 40l8-8M156 58h10M146 76l8 8"/></g>'),
  kneel: () => base(hero(100, 94, 1.25, 'kneel') + `<g style="color:#f9d58b" class="gd-bounce">${mini('kneel', 136, 28, 30)}</g>`),
  drone: () => base(hero(76, 94, 1.25) + '<g transform="translate(68 52)">' + DRONE('gd-rise') + '</g>' + '<path d="M70 50Q100 20 170 18" stroke="#f9d58b" stroke-width="2" stroke-dasharray="3 6" fill="none" opacity=".7"/>'),
  fly: () => base(`<g transform="translate(120 70)"><g class="gd-fly">${DRONE('', 1.9)}</g></g>` + '<path d="M30 80Q75 30 120 70T210 60" stroke="#f9d58b" stroke-width="2" stroke-dasharray="3 6" fill="none" opacity=".7"/>', SKY + MOSQ + GROUND),
  photo: () => base(`<g transform="translate(70 56)"><g class="gd-fly">${DRONE('', 1.7)}</g></g><circle class="gd-flash" cx="70" cy="62" r="10" fill="#fff"/>` +
    '<g class="gd-polaroid"><rect x="150" y="26" width="64" height="74" rx="4" fill="#f8f3ea" transform="rotate(5 182 63)"/><rect x="156" y="32" width="52" height="46" fill="#b9794a" transform="rotate(5 182 63)"/><path d="M158 74l14-18 10 10 8-8 14 16z" fill="#e0a05a" transform="rotate(5 182 63)"/></g>'),
  interact: () => base('<rect x="140" y="92" width="50" height="20" rx="3" fill="#8a5530"/>' + hero(76, 94, 1.25) + '<g transform="translate(165 80)"><g class="gd-pick"><path d="M0-14L12 0 0 14-12 0z" fill="#f9d58b" stroke="#fff3c9" stroke-width="2"/></g></g>' +
    `<g style="color:#f9d58b" class="gd-bounce">${mini('interact', 150, 24, 30)}</g>`),
  doors: () => base('<rect x="130" y="40" width="80" height="72" fill="#4a2f22"/><rect x="138" y="52" width="64" height="60" fill="#12202c"/><rect class="gd-door l" x="138" y="52" width="32" height="60" fill="#6f879a" stroke="#2d4458" stroke-width="2"/><rect class="gd-door r" x="170" y="52" width="32" height="60" fill="#6f879a" stroke="#2d4458" stroke-width="2"/><circle cx="170" cy="46" r="4" fill="#4aa8ff"/>' +
    `<g transform="translate(40 94)"><g class="gd-go">${hero(0, 0, 1.2, 'walk')}</g></g>`, SKY + GROUND),
  carin: () => base(`<g transform="translate(150 106)">${CAR('gd-still-car')}<path class="gd-cdoor" d="M-10-24l-8 12h8z" fill="#f9d58b"/></g>` + `<g transform="translate(30 94)"><g class="gd-go">${hero(0, 0, 1.2, 'walk')}</g></g>`),
  car: () => base(`<g transform="translate(110 106)">${CAR('gd-drive') + BEAM}</g>` + SCROLL('fast')),
  caraux: () => base(`<g transform="translate(70 106)">${CAR() + BEAM}</g><rect x="150" y="10" width="82" height="76" rx="12" fill="#2a1d15" opacity=".7"/><g style="color:#f8f3ea"><g class="gd-seq a">${mini('lights', 156, 16, 30)}</g><g class="gd-seq b">${mini('handbrake', 194, 16, 30)}</g><g class="gd-seq c">${mini('view', 156, 50, 30)}</g><g class="gd-seq d">${mini('exit', 194, 50, 30)}</g></g>`),
  swim: () => base('<g transform="translate(120 88)"><g class="gd-swimmer"><circle cx="0" cy="0" r="8" fill="#e0a877"/><path d="M-8-1a8 8 0 0116 0c-3-3-12-3-16 0z" fill="#3a281e"/><path class="gd-arm" d="M4 4q14-6 22 0" stroke="#f9d58b" stroke-width="5" stroke-linecap="round" fill="none"/></g></g>' +
    '<ellipse class="gd-ripple" cx="120" cy="96" rx="14" ry="4" fill="none" stroke="#f8f3ea" stroke-width="2"/><g class="gd-wave"><path d="M-40 94q10-8 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0V150H-40z" fill="#2f7fa0" opacity=".88"/></g><g class="gd-wave2"><path d="M-40 106q10-7 20 0t20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0 20 0V150H-40z" fill="#256a88"/></g>', SKY + '<rect y="90" width="240" height="60" fill="#3a97b8"/>'),
  map: () => base('<g class="gd-minimap"><circle cx="50" cy="75" r="34" fill="#5e4a68" stroke="#f9d58b" stroke-width="3"/><path d="M26 86q22-26 48-18" stroke="#6fb4d6" stroke-width="5" fill="none"/><circle cx="50" cy="75" r="4" fill="#f9d58b"/></g>' +
    '<path d="M92 75h26" stroke="#f8f3ea" stroke-width="3" stroke-linecap="round" class="gd-bounce"/><path d="M118 75l-8-7v14z" fill="#f8f3ea"/>' +
    '<rect x="128" y="22" width="104" height="104" rx="10" fill="#5e4a68" stroke="#f9d58b" stroke-width="3"/><path d="M134 100q30-40 60-12t34-40" stroke="#6fb4d6" stroke-width="7" fill="none"/><path class="gd-route" d="M146 108L170 84 190 92 214 52" stroke="#f9d58b" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle class="gd-pulse" cx="214" cy="52" r="9" fill="#f9d58b"/>', SKY + GROUND),
  circle: () => base('<ellipse class="gd-ring" cx="170" cy="118" rx="36" ry="9" fill="#f9d58b" fill-opacity=".25" stroke="#f9d58b" stroke-width="3.5"/><path d="M0 140Q60 130 128 122" stroke="#f9d58b" stroke-width="3" stroke-dasharray="4 7" fill="none" class="gd-route"/>' +
    `<g transform="translate(30 94)"><g class="gd-go2">${hero(0, 0, 1.2, 'walk')}</g></g>`),
  lab: () => base('<rect x="30" y="30" width="180" height="90" rx="8" fill="#3a281e" stroke="#c98a4b" stroke-width="3"/><rect x="104" y="64" width="32" height="20" rx="4" fill="#12100e" stroke="#f9d58b" stroke-width="2"/>' +
    '<g transform="translate(120 20)"><g class="gd-drop"><path d="M0-9L8 0 0 9-8 0z" fill="#f9d58b" stroke="#fff3c9" stroke-width="1.5"/></g></g>' +
    '<g fill="#5a4636"><circle class="gd-dot a" cx="88" cy="104" r="6"/><circle class="gd-dot b" cx="120" cy="104" r="6"/><circle class="gd-dot c" cx="152" cy="104" r="6"/></g>', SKY),
  labhint: () => base('<g transform="translate(120 70)"><g class="gd-glow"><g style="color:#f9d58b" transform="translate(-30 -34)">' + mini('bulb', 0, 0, 60) + '</g></g></g><g class="gd-rays" stroke="#f9d58b" stroke-width="3" stroke-linecap="round"><path d="M120 18v-10M82 30l-7-7M158 30l7-7M64 66h-10M176 66h10"/></g>', SKY),
  dossier: () => base('<rect x="48" y="14" width="144" height="98" rx="8" fill="#12202c" stroke="#4aa8ff" stroke-width="3"/><rect x="58" y="24" width="124" height="78" fill="#1b2d3d"/><g class="gd-page"><rect x="64" y="30" width="112" height="66" fill="#f8f3ea"/><path d="M72 42h60M72 54h96M72 66h80M72 78h92" stroke="#8a7560" stroke-width="4" stroke-linecap="round"/></g><rect x="100" y="112" width="40" height="10" fill="#3a2f28"/>', SKY),
  gadget: () => base('<g transform="translate(160 56)"><g class="gd-robot"><circle r="19" fill="#1b2330" stroke="#4aa8ff" stroke-width="3"/><circle class="gd-eye" r="7" fill="#4aa8ff"/><path d="M-19 0h-8M19 0h8" stroke="#4aa8ff" stroke-width="3"/></g><g class="gd-aim" stroke="#f9d58b" stroke-width="3" fill="none"><circle r="28"/><path d="M0-36v14M0 22v14M-36 0h14M22 0h14"/></g></g>' +
    hero(48, 94, 1.25) + '<path class="gd-shot" d="M74 56L146 56" stroke="#f9d58b" stroke-width="5" stroke-linecap="round"/>'),
  pause: () => base('<g transform="translate(120 66)"><g class="gd-bounce"><rect x="-34" y="-34" width="68" height="68" rx="16" fill="#3a281e" stroke="#f9d58b" stroke-width="4"/><rect x="-15" y="-16" width="10" height="32" rx="3" fill="#f9d58b"/><rect x="5" y="-16" width="10" height="32" rx="3" fill="#f9d58b"/></g></g>' + '<g fill="#f8f3ea" font-family="Rubik,sans-serif" font-weight="800" font-size="18" class="gd-zz"><text x="170" y="40">z</text><text x="184" y="26" font-size="24">z</text></g>', SKY),
  help: () => base('<g transform="translate(70 66)"><clipPath id="gdTc"><circle r="38"/></clipPath><circle r="40" fill="#f9d58b"/><image href="assets/images/tapama/tapama-souriante.webp" x="-38" y="-38" width="76" height="76" clip-path="url(#gdTc)" preserveAspectRatio="xMidYMid slice"/></g>' +
    '<g class="gd-bounce"><rect x="116" y="30" width="108" height="64" rx="16" fill="#f8f3ea"/><path d="M116 62l-14 8 16 4z" fill="#f8f3ea"/><g style="color:#55415D">' + mini('help', 150, 36, 40) + '</g><path d="M162 80h50" stroke="#a8703f" stroke-width="4" stroke-linecap="round" opacity="0"/></g>', SKY),
};
export const scene = (id) => (SCENES[id] || SCENES.move)();

/* ---------- Le geste, selon le mode ---------- */

const cap = (k, i, extra = '') => `<kbd class="gd-cap hit${/^.{3,}$/.test(k) ? ' gd-wide' : ''}${extra}" style="--i:${i}">${k}</kbd>`;
const MOUSE = (m, help) => `<svg class="gd-mouse m-${m}" viewBox="0 0 90 120" aria-hidden="true"><g class="mv"><rect x="14" y="6" width="62" height="108" rx="31" fill="#f8f3ea" stroke="#3a281e" stroke-width="3"/>` +
  '<path class="mb l" d="M45 6h-0.5A31 31 0 0014 37v14h31z" fill="#e8dcc6"/><path class="mb r" d="M45 6A31 31 0 0176 37v14H45z" fill="#e8dcc6"/><path d="M14 51h62M45 6v45" stroke="#3a281e" stroke-width="3" fill="none"/><rect x="40" y="20" width="10" height="18" rx="5" fill="#3a281e"/></g>' +
  (help ? '<g class="gd-helpdot"><circle cx="78" cy="14" r="13" fill="#f9d58b"/><text x="78" y="20" text-anchor="middle" font-family="Rubik,sans-serif" font-weight="800" font-size="18" fill="#55415D">?</text></g>' : '') + '</svg>';

function kbdDevice(g) {
  let h = '';
  if (g.k) {
    const ks = keys(g.k);
    if (g.cross) {
      const pos = ['t', 'l', 'b', 'r'];                                // Z Q S D : haut, gauche, bas, droite
      h += `<div class="gd-cross">${ks.map((k, i) => cap(k, [0, 3, 1, 2][i], ' p-' + pos[i])).join('')}</div>`;
    } else if (g.kc) {
      h += `<div class="gd-legend">${ks.map((k, i) => `<div class="gd-lg">${cap(k, i)}<span>${t(g.kc[i])}</span></div>`).join('')}</div>`;
    } else h += `<div class="gd-row">${ks.map((k, i) => cap(k, i)).join('')}</div>`;
  }
  if (g.m) h += MOUSE(g.m, g.help);
  return `<div class="gd-dev gd-kb">${h}</div>`;
}

/* manette : croquis simple, les parties utiles s'animent */
function padDevice(g) {
  const lit = new Set(g.b || []), i = (n) => [...lit].indexOf(n);
  const bt = (n, x, y, r = 8.6) => `<g class="pbtn${lit.has(n) ? ' hit' : ''}" style="--i:${Math.max(0, i(n))}"><circle cx="${x}" cy="${y}" r="${r}" fill="${PAD_COL[n] ? PAD_COL[n] : '#4a3a30'}" stroke="#2a1d15" stroke-width="1.5"/><text x="${x}" y="${y + 4.2}" text-anchor="middle" font-size="12" font-weight="800" font-family="Rubik,sans-serif" fill="${PAD_COL[n] ? '#2a1d15' : '#f8f3ea'}">${PAD_PS[n] || n}</text></g>`;
  const sh = (n, x, w = 40) => `<rect class="pbtn${lit.has(n) ? ' hit' : ''}" style="--i:${Math.max(0, i(n))}" x="${x}" y="${n[1] === 'T' ? 2 : 14}" width="${w}" height="${n[1] === 'T' ? 14 : 12}" rx="5" fill="#4a3a30" stroke="#2a1d15" stroke-width="1.5"/><text x="${x + w / 2}" y="${n[1] === 'T' ? 12.5 : 23.5}" text-anchor="middle" font-size="7" font-weight="800" font-family="Rubik,sans-serif" fill="#f8f3ea">${PAD_NAME[n] || n}</text>`;
  const stick = (c, x, y, on, press) => `<circle cx="${x}" cy="${y}" r="15" fill="#3a2d26" stroke="${on ? '#f9d58b' : '#2a1d15'}" stroke-width="${on ? 3 : 1.5}"/><g class="${on ? 'stk ' + (g.d || '') : ''}${press ? ' hit' : ''}" ${on === 'R' ? 'style="animation-delay:.4s"' : ''}><circle cx="${x}" cy="${y}" r="10" fill="${on ? '#f9d58b' : '#5a4636'}" stroke="#2a1d15" stroke-width="1.5"/></g>`;
  const L = (g.s || '').includes('L'), R = (g.s || '').includes('R');
  const svg = `<svg class="gd-pad" viewBox="0 0 240 150" aria-hidden="true">` +
    '<path transform="translate(19 18) scale(.3)" d="M123.5 0.0 143.0 -0.5 167.0 5.5 170.5 8.0 170.5 17.0 172.5 20.0 180.0 24.5 222.0 24.5 223.0 27.5 224.5 23.0 229.0 20.5 444.0 20.5 448.0 24.5 488.0 25.5 494.5 23.0 495.0 17.5 501.5 16.0 503.0 6.5 522.0 0.5 549.0 -0.5 564.0 2.5 579.0 8.5 580.0 16.5 582.0 15.5 593.5 22.0 613.5 54.0 625.5 78.0 635.5 110.0 653.5 182.0 669.5 262.0 673.5 306.0 671.5 356.0 666.5 376.0 659.5 391.0 640.5 413.0 637.5 423.0 632.0 428.5 618.0 434.5 584.0 439.5 559.0 437.5 542.0 432.5 524.0 424.5 519.5 419.0 519.5 414.0 522.0 411.5 525.0 411.5 528.0 408.5 540.0 406.5 554.5 400.0 541.5 380.0 539.5 376.0 540.5 373.0 535.5 369.0 526.5 350.0 500.5 278.0 496.0 273.5 488.0 270.5 478.0 278.5 461.0 285.5 436.0 287.5 419.0 283.5 407.0 277.5 396.0 268.5 276.0 268.5 265.0 277.5 253.0 283.5 236.0 287.5 223.0 287.5 208.0 284.5 182.0 270.5 171.5 278.0 161.5 309.0 156.5 319.0 157.5 320.0 153.5 326.0 154.5 328.0 152.5 328.0 153.5 330.0 151.5 335.0 149.5 335.0 150.5 338.0 148.5 338.0 148.5 343.0 144.5 348.0 145.5 350.0 133.5 376.0 117.5 400.0 129.0 402.5 132.0 405.5 140.0 407.5 142.5 410.0 141.0 416.5 130.0 423.5 118.0 426.5 116.0 428.5 92.0 433.5 72.0 434.5 35.0 430.5 26.0 428.5 18.0 422.5 15.0 422.5 12.5 420.0 12.5 412.0 16.0 408.5 22.0 406.5 22.5 404.0 11.5 389.0 2.5 365.0 -0.5 346.0 0.0 343.5 1.5 345.0 -0.5 342.0 -0.5 293.0 7.5 232.0 35.5 113.0 50.5 69.0 78.5 22.0 81.0 19.5 86.0 18.5 87.5 12.0 97.0 6.5 112.0 1.5Z" fill="#6b5546" stroke="#2a1d15" stroke-width="8" stroke-linejoin="round"/>' +
    sh('LT', 37) + sh('RT', 160) + sh('LB', 37) + sh('RB', 160) +
    '<rect x="102" y="30" width="36" height="22" rx="3" fill="#4a3a30" stroke="#2a1d15" stroke-width="1.5"/>' +
    stick('L', 84, 81, L ? 'L' : '', lit.has('L3')) + stick('R', 150, 81, R ? 'R' : '') +
    `<g class="pbtn${lit.has('LEFT') || lit.has('DPAD') ? ' hit' : ''}" style="--i:0"><path d="M53 49h6v6h6v6h-6v6h-6v-6h-6v-6h6z" transform="translate(0 0)" fill="#4a3a30" stroke="#2a1d15" stroke-width="1.5"/></g>` +
    bt('Y', 186, 39, 8) + bt('X', 168, 55, 8) + bt('B', 198, 55, 8) + bt('A', 183, 71, 8) +
    `<rect class="pbtn${lit.has('START') ? ' hit' : ''}" style="--i:0" x="161" y="30" width="14" height="8" rx="4" fill="#4a3a30" stroke="#2a1d15" stroke-width="1.5"/><rect class="pbtn${lit.has('BACK') ? ' hit' : ''}" style="--i:0" x="66" y="30" width="14" height="8" rx="4" fill="#4a3a30" stroke="#2a1d15" stroke-width="1.5"/></svg>`;
  let leg = '';
  if (g.bc) leg = `<div class="gd-legend">${g.b.map((b, n) => `<div class="gd-lg" style="--i:${n}">${padBtn(b)}<span>${t(g.bc[n])}</span></div>`).join('')}</div>`;
  return `<div class="gd-dev gd-pd">${svg}${leg}</div>`;
}

/* tactile : l'écran du téléphone avec les vrais boutons (et leur place choisie par le joueur) */
function touchState() { try { return TL.parse(localStorage.getItem(TL.STORAGE_KEY)); } catch (_) { return TL.defaultState(); } }
function touchDevice(g, tm) {
  const lg = lang(), want = new Set(g.b || []);
  let h = '';
  if (g.ui) {
    const label = UI_LABELS.tapui[g.ui] || UI_LABELS.tapui.lab;
    h = g.ui === 'drag' ? '<div class="gd-panel gd-mapp"><i class="gd-fing"></i></div>'
      : g.ui === 'pinch' ? '<div class="gd-panel gd-mapp"><i class="gd-fing f1"></i><i class="gd-fing f2"></i></div>'
      : g.ui === 'x' ? `<div class="gd-panel gd-mapp"><span class="gd-xb">${icon('x')}<i class="gd-fing"></i></span></div>`
      : g.ui === 'menu' ? '<div class="gd-panel gd-menu"><b></b><b class="sel"><i class="gd-fing"></i></b><b></b></div>'
      : g.ui === 'help'
      ? `<div class="gd-ctl hl" style="left:7%;top:20%;--d:62"><span class="tcb">${icon('help')}</span><i class="gd-fing"></i></div>`
      : `<div class="gd-panel"><b></b><b></b><b class="s"></b><span class="gd-pbtn">${t(label)}<i class="gd-fing"></i></span></div>`;
  } else {
    let prof; try { const st = touchState(); prof = TL.resolveProfile(st, tm); } catch (_) { prof = TL.defaultControls(tm); }
    let n = 0;
    for (const c of prof) {
      if (c.hidden) continue;
      const d = TL.sizePx(c, 1);
      const act = c.action && want.has(c.action);
      const st = `left:${(c.x * 100).toFixed(1)}%;top:${(c.y * 100).toFixed(1)}%;--d:${d}`;
      if (c.type === 'look') { if (g.look) h += `<div class="gd-look" style="--i:0"><i class="gd-fing"></i></div>`; continue; }
      if (c.type === 'stick') {
        const on = g.sk ? c.role === g.sk : g.s ? c.role === 'move' : g.sd;
        h += `<div class="gd-ctl stk${on ? ' hl' : ''}" style="${st}"><i class="ring"></i><i class="knob${on ? ' tilt ' + (g.d || '') : ''}" style="${c.role === 'dr' ? 'animation-delay:.5s' : ''}">${on ? '<i class="gd-fing"></i>' : ''}</i></div>`;
      } else {
        const idx = [...want].indexOf(c.action);
        h += `<div class="gd-ctl${act ? ' hl hit' : ''}${c.y > 0.78 ? ' up' : ''}" style="${st};--i:${Math.max(0, idx)}"><span class="tcb">${icon((TL.ACTIONS[c.action] || {}).icon || 'interact')}</span>${act ? `${want.size > 1 ? '' : `<small>${TL.actionLabel(c.action, lg)}</small>`}<i class="gd-fing"></i>` : ''}</div>`;
      }
      n++;
    }
  }
  const leg = !g.ui && want.size > 1 ? `<div class="gd-legend">${[...want].map((a, n) => `<div class="gd-lg" style="--i:${n}"><span class="gd-tb">${icon((TL.ACTIONS[a] || {}).icon)}</span><span>${TL.actionLabel(a, lg)}</span></div>`).join('')}</div>` : '';
  return `<div class="gd-dev gd-tc${leg ? ' gd-tl' : ''}"><div class="gd-ph">${h}</div>${leg}</div>`;
}

export function device(page, mode) {
  const g = page.g[mode];
  return mode === 'kbd' ? kbdDevice(g) : mode === 'pad' ? padDevice(g) : touchDevice(g, page.tm);
}
