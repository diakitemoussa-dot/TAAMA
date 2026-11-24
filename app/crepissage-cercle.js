/* ==========================================================
   MISSION DU CRÉPISSAGE — cercle jaune devant la mosquée + vidéo
   ----------------------------------------------------------
   • Après le message de Tapama sur la dernière mission (app/dispositif1.js), l'événement « taama:crepissage-cercle » pose le cercle jaune
     à l'emplacement du cylindre placé dans Blender (Cylinder : x = -39,663 · y(sol) = 5,091 · z = 22,489 dans le repère du jeu).
   • Dès que le joueur entre dans le cercle, la vidéo se joue plein écran dès le début (les 7 premières secondes sont coupées dans le fichier) (Échap / bouton : passer).
   • L'état est mémorisé (taama.crepissage.cercle) : le cercle revient au rechargement ; une nouvelle partie l'efface.
   ========================================================== */
const KEY = 'taama.crepissage.cercle';
const VIDEO = 'assets/videos/crepissage-montage.mp4?v=4';
const START_AT = 0;                                   // la vidéo a été coupée : les 7 premières secondes sont retirées du fichier (original : Grimpe_Rendu/crepissage-montage_complet_24s.mp4)
const POS = { x: -39.663, y: 5.091, z: 22.489, r: 1.8 };
/* Fin de la vidéo : le personnage réapparaît ici (repère du jeu ; y = hauteur des yeux ≈ sol + 1,7 m). À RÉGLER : coordonnées relevées avec SanctuaryMode.playerPosition() à l'endroit voulu. */
const ARRIVEE = { x: -38.5, y: 17.5, z: 22.15, yaw: Math.PI / 2 };   // toron de GAUCHE de l'avant-dernier rang (dessus mesuré à 15,82 m ; le rang du haut est à 17,46 m), face au mur ; y = hauteur des yeux (15,8 + 1,7) ; avant : z = 22,82 (toron de droite)
const ls = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

let node = null, playing = false, locked = false;     // locked : le joueur doit d'abord sortir du cercle avant de pouvoir le redéclencher

function spawn() {
  const sm = window.SanctuaryMode;
  if (node || !sm || !sm.spawnCircle) return;
  node = sm.spawnCircle(POS.x, POS.y, POS.z, POS.r);
}
function clear() { try { window.SanctuaryMode?.removeCircle?.(node); } catch (_) {} node = null; }

/* Transitions noires, comme celles des menus, de 4 s chacune : à l'entrée le jeu passe au noir (4 s) puis la vidéo apparaît ; à la fin la vidéo repasse au noir,
   le personnage est déplacé quand l'écran est noir, puis le noir se lève sur sa nouvelle position (0,8 + 0,4 + 0,8 = 2 s). */
const FADE_IN_MS = 4000;                                                    // entrée : le jeu passe au noir en 4 s
const VID_FADE_MS = 700;                                                    // la vidéo apparaît en fondu
const FADE_OUT_VID_MS = 600, HOLD_BLACK_MS = 150, FADE_OUT_MS = 600;       // sortie : 0,6 s vers le noir + 0,15 s de noir (la mission se place pendant ce noir) + 0,6 s de retour = 1,35 s

function stop(ov, vid) {
  if (ov._ending) return; ov._ending = true;
  clearTimeout(ov._startT);
  try { vid.pause(); } catch (_) {}
  window.removeEventListener('keydown', ov._key, true);
  const skip = ov.querySelector('button'); if (skip) skip.style.opacity = '0';
  vid.style.transition = `opacity ${FADE_OUT_VID_MS}ms ease`; vid.style.opacity = '0';                       // la vidéo repasse au noir
  ov.style.transition = 'none'; ov.style.opacity = '1';                                                      // (si on quitte pendant le fondu d'entrée : noir tout de suite)
  setTimeout(() => {
    if (ov._hooked) { try { window.SanctuaryMode?.endSceneHook?.(); } catch (_) {} window.__storyFreeze = true; }   // rend la main avant que la mission la reprenne (écran toujours noir)
    try { const A = ARRIVEE || { x: POS.x, y: POS.y + 1.7, z: POS.z }; window.SanctuaryMode?.teleportTo?.(A.x, A.y, A.z, A.yaw ?? undefined); } catch (e) { console.warn('[Crépissage] arrivée', e); }   // écran noir : on déplace le personnage
    try { window.Crepissage?.start?.(); } catch (e) { console.warn('[Crépissage]', e); }                    // la mission prend le personnage EN MAIN tout de suite : sinon la physique le fait glisser du toron (étroit) et il tombe pendant le noir
    setTimeout(() => {
      ov.style.transition = `opacity ${FADE_OUT_MS}ms ease`; ov.style.opacity = '0';                         // le noir se lève sur la nouvelle position
      if (!window.Crepissage?.active) { window.__storyFreeze = false; window.GamepadKit?.capture?.(false); }   // la mission a déjà pris la main : elle garde le jeu figé et la manette
      setTimeout(() => ov.remove(), FADE_OUT_MS + 50);
      playing = false; locked = true;                                                                         // pas de relance immédiate : il faut sortir du cercle
    }, HOLD_BLACK_MS);
  }, ov._started ? FADE_OUT_VID_MS : 0);
}
/* La vidéo est chargée à l'avance (dès qu'on approche du cercle) : à l'entrée elle démarre sans saccade. */
let preVid = null;
function makeVideo() {
  const v = document.createElement('video');
  v.src = VIDEO; v.playsInline = true; v.preload = 'auto'; v.controls = false;
  try { v.load(); } catch (_) {}
  return v;
}

function playVideo() {
  if (playing) return;
  playing = true;
  // Entrée dans le cercle en DOUCEUR : plus de gel net (le personnage restait figé en plein pas). Le jeu prend la main du personnage
  // (plus de commandes), son animation continue et passe tranquillement à la pose de repos pendant que l'écran passe au noir.
  const sm = window.SanctuaryMode;
  const hooked = !!(sm && sm.beginSceneHook && sm.beginSceneHook({ tick: () => {} }));
  if (!hooked) { window.__storyFreeze = true; window.GamepadKit?.capture?.(true); }
  try { document.exitPointerLock?.(); } catch (_) {}
  const ov = document.createElement('div'); ov._hooked = hooked;
  ov.style.cssText = `position:fixed;inset:0;z-index:99995;background:#000;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity ${FADE_IN_MS}ms ease`;
  const vid = preVid || makeVideo(); preVid = null;
  vid.style.cssText = `width:100%;height:100%;object-fit:contain;background:#000;opacity:0;transition:opacity ${VID_FADE_MS}ms ease`;
  const skip = document.createElement('button');
  skip.type = 'button'; skip.textContent = 'Passer';
  skip.style.cssText = 'position:absolute;right:max(16px,env(safe-area-inset-right,0px));bottom:max(16px,env(safe-area-inset-bottom,0px));padding:10px 18px;border-radius:999px;border:2px solid #F8F3EA;background:rgba(0,0,0,.55);color:#F8F3EA;font:600 15px system-ui,sans-serif;cursor:pointer;transition:opacity .4s ease';
  skip.addEventListener('click', () => stop(ov, vid));
  ov.append(vid, skip);
  ov._key = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); stop(ov, vid); } };
  window.addEventListener('keydown', ov._key, true);
  document.body.appendChild(ov);
  requestAnimationFrame(() => requestAnimationFrame(() => { ov.style.opacity = '1'; }));                       // le jeu passe au noir
  vid.addEventListener('ended', () => stop(ov, vid));
  vid.addEventListener('error', () => stop(ov, vid));
  const go = () => {                                                                                         // une fois l'écran noir : la vidéo démarre et apparaît en fondu
    if (ov._ending) return;
    ov._started = true;
    try { vid.currentTime = START_AT; } catch (_) {}
    vid.play().then(() => { vid.style.opacity = '1'; }).catch(() => { vid.muted = true; vid.play().then(() => { vid.style.opacity = '1'; }).catch(() => stop(ov, vid)); });
  };
  ov._startT = setTimeout(() => { if (vid.readyState >= 1) go(); else vid.addEventListener('loadedmetadata', go, { once: true }); }, FADE_IN_MS);
}

setInterval(() => {
  if (ls(KEY) !== '1') { if (node) clear(); return; }
  const sm = window.SanctuaryMode;
  if (!sm || !sm.isActive || !sm.isActive()) return;
  if (!node) spawn();
  const pp = sm.playerPosition && sm.playerPosition(); if (!pp || playing) return;
  const c = node && node.position ? node.position : POS;
  const d = Math.hypot(pp.x - c.x, pp.z - c.z), near = d < POS.r && Math.abs(pp.y - 1.7 - c.y) < 2.5;
  if (!preVid && d < POS.r + 12) preVid = makeVideo();                                  // on approche : la vidéo se charge avant l'entrée
  if (locked) { if (d > POS.r + 1.5) locked = false; return; }
  if (near && !window.__storyFreeze && !window.Tapama?.isBusy?.() && !window.CityMap?.isOpen) playVideo();
}, 250);

window.addEventListener('taama:crepissage-cercle', () => { try { localStorage.setItem(KEY, '1'); } catch (_) {} spawn(); });
window.addEventListener('taama:reset', () => { clear(); locked = false; });
window.addEventListener('taama:crepissage-fini', () => { try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_VUE); } catch (_) {} clear(); });

/* Plan automatique : dès que le personnage s'approche de la mosquée (mission du crépissage en cours), la caméra survole la mosquée
   et se pose sur le mur à crépir, comme le plan du dispositif 1 : le joueur voit où il doit aller. À chaque entrée dans le jeu tant que la mission du crépissage est en cours. */
const KEY_VUE = 'taama.crepissage.vue', WALL_TARGET = { x: -38.4, y: 17.5, z: 22.5 }, MAX_FEET_Y = 8;   // au-dessus de 8 m, le joueur est sur un toit / un toron : le plan ne se lance pas
let vueFaite = false;                       // une fois par ENTRÉE dans le jeu (Continuer / Nouvelle partie) : repart à zéro dès que le joueur quitte le sanctuaire
let attente = '';                           // raison pour laquelle le plan attend (affichée une fois dans la console à chaque changement : aide au diagnostic)
const attendre = (r) => { if (r !== attente) { attente = r; if (r) console.info('[Crépissage] plan de caméra en attente :', r); } return false; };
function planPossible(sm) {
  if (!sm || !sm.isActive || !sm.isActive()) { vueFaite = false; return attendre(''); }
  if (vueFaite) return attendre('');
  const G = window.GameUI;                                   // le sanctuaire reste actif DERRIÈRE le menu principal : le plan partait sous le menu, invisible, et n'était plus rejoué
  if (G && (G.isOpen?.() || (G.isInGame && !G.isInGame()))) return attendre('menu du jeu ouvert');
  if (ls('taama.acte') !== '4:crepissage') return attendre('mission du crépissage pas en cours (taama.acte = ' + ls('taama.acte') + ')');
  if (window.Crepissage?.active) return attendre('le crépissage est déjà en cours');
  if (!sm.showDeviceIntro) return attendre('plan indisponible');
  if (window.__storyFreeze) return attendre('jeu figé (scène, vidéo ou labo)');
  if (window.Vehicle?.state === 'drive') return attendre('le joueur est en voiture');
  const pp = sm.playerPosition && sm.playerPosition(); if (!pp) return attendre('position inconnue');
  if (sm.isGrounded && !sm.isGrounded()) return attendre('le joueur est en l’air (saut, chute)');
  if (pp.y - 1.7 > MAX_FEET_Y) return attendre('le joueur est perché (toit, torons) : ' + (pp.y - 1.7).toFixed(1) + ' m');
  if (Math.hypot(pp.x - POS.x, pp.z - POS.z) < POS.r + 1) return attendre('le joueur est dans le cercle');
  if (window.Tapama?.isBusy?.()) return attendre('Tapama parle');
  if (window.CityMap?.isOpen) return attendre('la carte est ouverte');
  return pp;
}
setInterval(() => {
  const sm = window.SanctuaryMode, pp = planPossible(sm); if (!pp) return;
  const ok = sm.showDeviceIntro({ title: 'Espace à crépir', target: pp.clone().set(WALL_TARGET.x, WALL_TARGET.y, WALL_TARGET.z) });
  if (ok) { vueFaite = true; attendre(''); } else attendre('le plan a été refusé par la caméra (personnage pas encore prêt ?)');
}, 500);
window.CrepissagePlan = { get attente() { return attente; }, rejouer() { vueFaite = false; } };   // diagnostic : CrepissagePlan.attente / CrepissagePlan.rejouer()
