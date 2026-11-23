/* ==========================================================
   EFFETS D'ÉCRAN — fondu au noir à la fin du flyer, et écran noir entre deux menus
   ----------------------------------------------------------
   • Fin de la cinématique : le flyer reste FLYER_HOLD_MS, puis un fondu au noir (fadeToBlack) le fait disparaître.
   • Entrée dans un menu : écran noir de BLACK_MS au total (1 s vers le noir, 1 s de retour), via blackTransition.
     Si le noir est déjà là (fin du flyer), blackTransition reprend ce noir sans recommencer le fondu.
     Les écrans qui ne sont pas des menus (titre, chargement, cinématique, pause) ne passent pas par là.
   Logique pure (isMenuScreen, constantes) : testée sous Node (tests/screen-fx.test.mjs).
   ========================================================== */

export const FLYER_HOLD_MS = 4000;     // le flyer reste affiché ce temps avant le fondu au noir
export const FADE_MS = 1000;           // durée du fondu vers le noir à la fin du flyer
export const BLACK_IN_MS = 1000;       // écran noir : fondu vers le noir
export const BLACK_OUT_MS = 1000;      // écran noir : retour à l'écran
export const BLACK_MS = BLACK_IN_MS + BLACK_OUT_MS;   // 2 s au total à chaque entrée dans un menu

/** Écrans qui sont des menus : ils passent par l'écran noir. La pause (en jeu) et les écrans d'attente sont exclus. */
export const MENU_SCREENS = ['main', 'nouvelle', 'continuer', 'carte', 'options-audio', 'options-commandes', 'options-affichage', 'options-jeu', 'credits', 'profil'];
export function isMenuScreen(id) { return MENU_SCREENS.includes(id); }

const VEIL_ID = 'guBlack';

function makeVeil(inMs) {
  const veil = document.createElement('div');
  veil.id = VEIL_ID;
  veil.setAttribute('aria-hidden', 'true');
  veil.style.cssText = `position:fixed;inset:0;z-index:9500;background:#000;opacity:0;pointer-events:all;transition:opacity ${inMs}ms ease`;
  document.body.appendChild(veil);
  return veil;
}

/** Fondu vers le noir : le voile reste en place (opaque) et la promesse est résolue à la fin du fondu. */
export function fadeToBlack(ms = FADE_MS) {
  return new Promise((resolve) => {
    const veil = document.getElementById(VEIL_ID) || makeVeil(ms);
    veil.style.transition = `opacity ${ms}ms ease`;
    requestAnimationFrame(() => requestAnimationFrame(() => { veil.style.opacity = '1'; }));
    setTimeout(resolve, ms + 30);
  });
}

/**
 * Écran noir entre deux menus. Si un voile noir est déjà là (fin du flyer), on part de ce noir : `run()` est appelé aussitôt,
 * puis on revient à l'écran en BLACK_OUT_MS. Sinon : fondu vers le noir (BLACK_IN_MS), `run()`, retour (BLACK_OUT_MS).
 * Retourne une promesse résolue à la fin.
 */
export function blackTransition(run, { inMs = BLACK_IN_MS, outMs = BLACK_OUT_MS } = {}) {
  return new Promise((resolve) => {
    const existing = document.getElementById(VEIL_ID);
    const veil = existing || makeVeil(inMs);
    const callRun = () => { try { run(); } catch (e) { console.error('[écran noir]', e); } };
    const back = () => {
      veil.style.transition = `opacity ${outMs}ms ease`;
      veil.style.opacity = '0';
      setTimeout(() => { veil.remove(); resolve(); }, outMs);
    };
    if (existing) {
      // déjà noir : on change d'écran, puis on revient
      setTimeout(() => { callRun(); back(); }, 60);
      return;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => { veil.style.opacity = '1'; }));
    setTimeout(() => { callRun(); back(); }, inMs);
  });
}
