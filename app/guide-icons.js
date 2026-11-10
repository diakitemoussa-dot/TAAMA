/* ==========================================================
   GUIDE — pictogrammes et pastilles de touches (petit module partagé
   par les conseils en jeu et par l'écran « Comment jouer »)
   Mêmes tracés que les boutons de touch-controls.js.
   ========================================================== */

import * as TL from './touch-layout.js?v=1';
import { t } from './i18n.js?v=1';

/* ---------- Pictogrammes : mêmes tracés que les boutons de touch-controls.js ---------- */
export const ICO = {
  jump: '<path d="M6 13l6-6 6 6M6 19l6-6 6 6"/>', run: '<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
  aim: '<circle cx="12" cy="12" r="6.5"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  fire: '<path d="M13.5 2L5 13.5h6L10 22l9-12h-6.5z" fill="currentColor"/>', kneel: '<path d="M6 8l6 6 6-6M7 19h10"/>',
  interact: '<path d="M9 11V6.5a1.8 1.8 0 013.6 0V11m0-1.2a1.8 1.8 0 013.6 0v2.2a6 6 0 01-6 6h-.8a5 5 0 01-4-2l-2-3a1.8 1.8 0 012.8-2.2L9 13"/>',
  drone: '<circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M7 7l3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.5"/>',
  map: '<path d="M12 21s-7-5.7-7-11a7 7 0 0114 0c0 5.3-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  photo: '<path d="M4 8h3l1.8-2.6h6.4L17 8h3v11H4z"/><circle cx="12" cy="13.2" r="3.6"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14" stroke-width="3"/>', gas: '<path d="M12 4l7.5 15h-15z" fill="currentColor"/>',
  left: '<path d="M15 5l-7 7 7 7" stroke-width="3"/>', right: '<path d="M9 5l7 7-7 7" stroke-width="3"/>',
  handbrake: '<circle cx="12" cy="12" r="9"/><path d="M10 17V7h3a3 3 0 010 6h-3"/>',
  lights: '<path d="M10 6a6 6 0 100 12z"/><path d="M14 8h7M14 12h7M14 16h7"/>',
  view: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  exit: '<path d="M10 4H5v16h5M14 8l4 4-4 4M8 12h10"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  foot: '<circle cx="12" cy="5" r="2"/><path d="M12 8v6M12 14l-3 6M12 14l3 6M8 11l4-2 4 2"/>',
  door: '<path d="M6 21V4h12v17M4 21h16"/><circle cx="14.5" cy="13" r=".8" fill="currentColor"/>',
  car: '<path d="M3 16v-4l2-4h9l3 4h4v4M3 16h18"/><circle cx="7.5" cy="17" r="2"/><circle cx="16.5" cy="17" r="2"/>',
  wave: '<path d="M2 9c3-3 5 3 8 0s5 3 8 0 3 0 4 0M2 15c3-3 5 3 8 0s5 3 8 0 3 0 4 0"/>',
  circle: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
  lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 002 3h10a2 2 0 002-3l-5-9V3M8 15h8"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 00-4-10z"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h16"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5M12 17.5v.1"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n] || ''}</svg>`;

/* ---------- Pastilles de touches ---------- */
export const lang = () => (document.documentElement.lang || 'fr').startsWith('en') ? 'en' : 'fr';
export const PAD_COL = { A: '#6fbf5a', B: '#e0594b', X: '#4a90d9', Y: '#f4c542' };
/** Boutons de manette : lettre colorée (A B X Y), gâchette (LB RB LT RT), sticks (L3 R3), croix, START. */
export const PAD_PS = { A: '✕', B: '○', X: '□', Y: '△' };
/** Noms affichés des boutons de manette (Xbox, avec l'équivalent PlayStation entre parenthèses). */
export const PAD_NAME = { LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2', L3: 'L3', R3: 'R3', START: 'OPTIONS', BACK: 'SHARE', LEFT: '◀', DPAD: '✚' };
const padLabel = (b) => PAD_NAME[b] || b;
export const padBtn = (b) => (PAD_COL[b]
  ? `<span class="gd-pb" style="--c:${PAD_COL[b]}"><b>${PAD_PS[b]}</b></span>`
  : `<span class="gd-pb gd-pw">${padLabel(b)}</span>`);
const CHIPS = {
  drone: { kbd: ['R'], pad: 'LB', touch: 'droneOn' }, interact: { kbd: ['E'], pad: 'Y', touch: 'interact' },
  map: { kbd: ['M'], pad: 'LEFT', touch: 'map' }, gadget: { kbd: ['clic'], pad: 'LT', touch: 'aim' },
};
/** Pastille de la bonne commande pour une action (bulles du jeu, bouton « ? »). */
export function chip(action, mode) {
  const c = CHIPS[action]; if (!c) return '';
  if (mode === 'kbd') return c.kbd[0] === 'clic' ? `<kbd class="gd-k gd-wide">${t('Clic droit')}</kbd>` : `<kbd class="gd-k">${c.kbd[0]}</kbd>`;
  if (mode === 'pad') return padBtn(c.pad);
  return `<span class="gd-tb">${icon(TL.ACTIONS[c.touch].icon)}</span>`;
}

