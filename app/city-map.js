/* ==========================================================
   CARTE DE DJENNÉ — mini-carte + grande carte interactive
   ----------------------------------------------------------
   Cercle en haut à gauche : la ville autour de vous (nord en haut), flèche = direction de la caméra.
   Clic (ou touche M, ou croix gauche de la manette) : la carte s'ouvre AU CENTRE, déjà zoomée sur vous.
     • souris  : glisser = déplacer · molette = zoom · double-clic = zoom avant · boutons + − ⌖
     • tactile : un doigt = déplacer · pincement = zoom
     • clavier : flèches / WASD (ZQSD) = déplacer · + − = zoom · C = me recentrer · M ou Échap = fermer
     • manette : stick gauche = déplacer · stick droit ↑↓ ou RT/LT = zoom · A = me recentrer · B ou croix gauche = fermer
   Pendant que la carte est ouverte, les commandes du jeu (drone, personnage) sont bloquées
   (GamepadKit.capture + touches interceptées).

   Image : assets/images/carte-djenne.jpg — nord en haut, est à droite, 2,94 km de côté, centrée sur la
   Grande Mosquée (voir Documents\Djenne3D\make_map.py). Ville v2 uniquement.
   Repère du jeu : le nord réel est +x, l'est réel est +z (la ville est recalée sur la mosquée du jeu).
   ========================================================== */
import * as THREE from 'three';
import { PLACES, createRouter, formatDistance, etaMinutes } from './city-routes.js?v=2';
import { createRouteArrow, projectOnRoute } from './route-arrow.js?v=8';

const M = window.MosqueScene;
const MAP_URL = 'assets/images/carte-djenne.jpg?v=2';
const ROUTES_URL = 'assets/data/routes-djenne-voiture.json?v=1';   // routes que la voiture du jeu peut vraiment prendre (tools/analyze-roads.mjs)

/* Géoréférence de l'image (repère « nouveau » de Blender/Blosm, mètres réels) */
const HALF = 1470;                      // demi-côté de l'image (m)
const IMG = 2048;                       // pixels
const K = 0.84;                         // échelle mosquée du jeu / réalité (djenne-ville-leger.INFO.md)
const CB_X = -12.0, CB_Y = 5.2;         // centre de la mosquée dans le repère d'origine du modèle
const PPM = IMG / (2 * HALF);           // pixels d'image par mètre réel

const MINI_HALF = 120;                  // demi-largeur de la vue réduite (m réels) — zoomée sur le joueur
const OPEN_HALF = 300;                  // demi-largeur à l'ouverture de la grande carte (m réels)
const MIN_HALF = 40;                    // zoom maximal (m réels)
const PAN_KEYS = {
  ArrowUp: [0, 1], KeyW: [0, 1], KeyZ: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
};

/** repère du jeu (x = nord, z = est) -> mètres réels (est, nord) par rapport à la mosquée */
function gameToReal(gx, gz) {
  return { e: K * (gz + CB_Y), n: K * (gx - CB_X) };
}

if (!M) { console.warn('[carte] MosqueScene absent'); }
else init();

function init() {
  /* ---------- DOM ---------- */
  const backdrop = document.createElement('div'); backdrop.className = 'cm-backdrop';
  const box = document.createElement('div');
  box.className = 'cm'; box.id = 'cityMap'; box.tabIndex = 0;
  box.setAttribute('role', 'button'); box.setAttribute('aria-label', 'Carte de Djenné — cliquer pour agrandir');
  const cv = document.createElement('canvas'); box.appendChild(cv);
  const nTag = document.createElement('span'); nTag.className = 'cm-n'; nTag.textContent = 'N'; box.appendChild(nTag);
  const hint = document.createElement('span'); hint.className = 'cm-hint'; hint.textContent = 'Carte'; box.appendChild(hint);
  const ui = document.createElement('div'); ui.className = 'cm-ui';
  ui.innerHTML = '<div class="cm-topbar"></div><div class="cm-bar"><span class="cm-title">Djenné</span>' +
    '<button type="button" class="cm-tg cm-tg-places" aria-expanded="false">Lieux</button>' +
    '<button type="button" class="cm-tg cm-tg-leg" aria-expanded="false">Légende</button></div>' +
    '<div class="cm-legend"><span><i style="background:#f4cf5a;border-radius:50%"></i>Vous</span>' +
    '<span><i style="background:#d6be96;border:2px solid #785c3c"></i>Grande Mosquée</span>' +
    '<span><i style="background:#966c4e"></i>Maisons</span><span><i style="background:#4a808e"></i>Fleuve</span>' +
    '<span><i style="background:#f0deba"></i>Routes</span>' +
    '<span><i style="background:#10131c;border:2px solid #37a3ff"></i>Zone NÉANTIS</span>' +
    '<span><i style="background:#ffd34d;border-radius:2px;height:5px;vertical-align:2px"></i>Itinéraire</span></div>' +
    '<div class="cm-places"><div class="cm-places-t">Lieux · clic : itinéraire</div><div class="cm-places-l"></div></div>' +
    '<div class="cm-route"><b class="cm-route-name"></b><span class="cm-route-info"></span><button type="button" class="cm-route-x">Effacer</button></div>' +
    '<div class="cm-hint-t">Glisse pour déplacer · pince pour zoomer</div>' +
    '<div class="cm-key"><span class="cm-key-kb">Glisser · molette : déplacer / zoomer · C : me recentrer · M ou Échap : fermer<br></span>' +
    '<span class="cm-key-pad"><b>🎮</b> stick G déplacer · R2/L2 zoom · ✕ recentrer · ○ fermer</span></div>';
  const closeBtn = document.createElement('button'); closeBtn.className = 'cm-close'; closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Réduire la carte'); closeBtn.textContent = '×'; ui.appendChild(closeBtn);
  const tools = document.createElement('div'); tools.className = 'cm-tools';
  const mkTool = (txt, label) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.setAttribute('aria-label', label); b.title = label; tools.appendChild(b); return b; };
  const bIn = mkTool('+', 'Zoom avant'), bOut = mkTool('−', 'Zoom arrière'), bMe = mkTool('⌖', 'Me recentrer');
  ui.appendChild(tools);
  box.appendChild(ui);
  const tgPlaces = ui.querySelector('.cm-tg-places'), tgLeg = ui.querySelector('.cm-tg-leg');
  // mode compact (téléphone / tablette / écran court) : la carte prend tout l'écran utile, panneaux repliables autour
  const mqCompact = window.matchMedia ? window.matchMedia('(max-height: 520px), (pointer: coarse)') : { matches: false };
  const compact = () => mqCompact.matches;
  const setPanel = (cls, btn, on) => { box.classList.toggle(cls, on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
  const closePanels = () => { setPanel('pl-open', tgPlaces, false); setPanel('leg-open', tgLeg, false); };
  tgPlaces.addEventListener('click', (e) => { e.stopPropagation(); setPanel('pl-open', tgPlaces, !box.classList.contains('pl-open')); setPanel('leg-open', tgLeg, false); });
  tgLeg.addEventListener('click', (e) => { e.stopPropagation(); setPanel('leg-open', tgLeg, !box.classList.contains('leg-open')); setPanel('pl-open', tgPlaces, false); });
  let hasPad = false;
  const syncPad = () => { const GP = window.GamepadKit, v = !!(GP && GP.connected && GP.connected()); if (v !== hasPad) { hasPad = v; box.classList.toggle('has-pad', v); } };
  document.body.append(backdrop, box);
  document.body.classList.add('has-citymap');

  const ctx = cv.getContext('2d');
  const img = new Image(); let imgReady = false, imgReq = false;
  let closedAt = -1e9, open = false, shown = false, acc = 0, lastKey = '';
  const dir = new THREE.Vector3();
  const view = { ce: 0, cn: 0, half: OPEN_HALF };               // vue de la grande carte (m réels)
  const held = new Set();                                        // flèches / WASD maintenues

  /* ---------- lieux et itinéraires ---------- */
  let router = null, routeReq = false, autoShown = false;
  let autoOpened = false;   // carte ouverte PAR L'HISTOIRE (openTo) : les sticks sont bloqués tant qu'elle reste ouverte ; ouverte à la main : ils déplacent la carte
  const ls = (k) => { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } };
  // destination suggérée selon l'avancement de l'histoire (bible chapitre 1) : dispositif 1 -> labo ; labo 1 fait -> aucune ;
  // gadget -> base NÉANTIS ; dispositif 2 -> labo ; labo 2 fait -> aucune
  const lsv = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
  const storyTarget = () => (lsv('taama.lab2') === 'done' || lsv('taama.chapitre1') === 'done') ? null
    : ls('taama.dispositif2') ? 'deuxieme' : ls('taama.gadget') ? 'neantis' : lsv('taama.lab1') === 'done' ? null : ls('taama.dispositif1') ? 'deuxieme' : null;
  const sel = { id: null, route: null, from: null };               // lieu choisi + itinéraire calculé depuis `from`
  let hits = [];                                                   // pastilles cliquables à l'écran : { id, x, y, r } (px canvas)
  const places = () => {
    const l = PLACES.map((p) => ({ ...p }));
    const nb = window.NeantisBase;
    if (nb && nb.loaded) { const r = gameToReal(nb.center.x, nb.center.z); l.push({ id: 'neantis', name: 'Base NÉANTIS', short: 'NÉANTIS', e: r.e, n: r.n, kind: 'neantis', info: 'Complexe du groupe NÉANTIS : le dispositif y est gardé.' }); }
    // cercle jaune = laboratoire de Tapama (visible dès que le dispositif 1 est récupéré)
    if (ls('taama.dispositif1')) { const r = gameToReal(-175.012, -219.890); l.push({ id: 'deuxieme', name: 'Laboratoire de Tapama', short: 'Labo Tapama', e: r.e, n: r.n, kind: 'labo', info: 'Le cercle jaune : Tapama t’y attend avec son établi et ses écrans.' }); }
    return l;
  };
  const placeOf = (id) => places().find((p) => p.id === id) || null;
  const routeArrow = createRouteArrow();           // boussole-guide fixe en haut de l'écran (app/route-arrow.js)
  function loadRouter() {
    if (router || routeReq) return; routeReq = true;
    fetch(ROUTES_URL).then((r) => r.json()).then((d) => { router = createRouter(d); recomputeRoute(true); if (fitPending && fitRoute()) fitPending = false; draw(true); }).catch((e) => console.warn('[carte] routes indisponibles :', e));
  }
  function recomputeRoute(force) {
    const pl = sel.id && placeOf(sel.id); if (!pl) { sel.route = null; updateRouteBar(); return; }
    if (!router) { loadRouter(); return; }
    const me = actorReal();
    if (!force && sel.route && sel.from) {
      const moved = Math.hypot(me.e - sel.from.e, me.n - sel.from.n);
      if (moved < 6) return;                                                                                // ne recalcule pas à chaque pas
      if (sel.route.roads ? projectOnRoute(sel.route.pts, me.e, me.n).dist < 20 : moved < 25) return;      // encore sur l'itinéraire : on le garde tel quel (la flèche ne saute pas)
    }
    sel.from = { e: me.e, n: me.n };
    sel.route = router.route(me.e, me.n, pl.e, pl.n);
    updateRouteBar();
  }
  let fitPending = false;                                          // cadrage de l'itinéraire différé (routes pas encore chargées)
  function fitRoute() {
    if (!sel.route) return false;
    let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
    for (const q of sel.route.pts) { a = Math.min(a, q[0]); b = Math.max(b, q[0]); c = Math.min(c, q[1]); d = Math.max(d, q[1]); }
    // cadre l'itinéraire dans la zone VISIBLE (hors barre du haut, boutons, fiche d'itinéraire en mode compact)
    const ins = insets(), cw = cv.clientWidth || 1, ch = cv.clientHeight || 1, S = Math.min(cw, ch);
    const wv = Math.max(60, cw - ins.L - ins.R), hv = Math.max(60, ch - ins.T - ins.B);
    const hE = ((b - a) * 0.62 + 60) * S / wv, hN = ((d - c) * 0.62 + 60) * S / hv;
    view.half = Math.max(160, hE, hN);
    const mpp = 2 * view.half / S;
    view.ce = (a + b) / 2 - (ins.L - ins.R) / 2 * mpp; view.cn = (c + d) / 2 + (ins.T - ins.B) / 2 * mpp;
    clampView();
    return true;
  }
  function selectPlace(id, fit = true) {
    if (id === sel.id) { clearRoute(); return; }                   // second clic : retire l'itinéraire
    sel.id = id; sel.route = null; sel.from = null;
    if (compact()) closePanels();                                  // le tiroir ne masque pas l'itinéraire
    recomputeRoute(true);
    if (fit) fitRoute();                                           // cadre l'itinéraire dans la grande carte
    markPlacesActive(); draw(true);
  }
  function clearRoute() { sel.id = null; sel.route = null; sel.from = null; updateRouteBar(); markPlacesActive(); draw(true); }
  const listEl = ui.querySelector('.cm-places-l'), barEl = ui.querySelector('.cm-route');
  function buildPlacesList() {
    listEl.innerHTML = '';
    for (const p of places()) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'cm-pl'; b.dataset.id = p.id; b.title = p.info || '';
      b.innerHTML = '<i class="cm-dot cm-k-' + p.kind + '"></i>' + p.short + (p.approx ? ' <small>≈</small>' : '');
      b.addEventListener('click', (e) => { e.stopPropagation(); selectPlace(p.id); });
      listEl.appendChild(b);
    }
    markPlacesActive();
  }
  function markPlacesActive() { for (const b of listEl.children) b.classList.toggle('on', b.dataset.id === sel.id); }
  function updateRouteBar() {
    const pl = sel.id && placeOf(sel.id);
    barEl.classList.toggle('on', !!pl);
    if (!pl) return;
    barEl.querySelector('.cm-route-name').textContent = pl.name;
    const L = sel.route ? sel.route.length : 0;
    barEl.querySelector('.cm-route-info').textContent = sel.route
      ? formatDistance(L) + ' · ≈ ' + etaMinutes(L, 9) + ' min en voiture · ' + etaMinutes(L, 1.4) + ' min à pied' + (sel.route.roads ? '' : ' (à vol d’oiseau)')
        + (sel.route.wet >= 5 ? ' · gué de ' + Math.round(sel.route.wet / 10) * 10 + ' m, roule doucement' : '')
      : 'Calcul…';
  }
  // La carte s'ouvre d'elle-même aux moments clés de l'histoire (app/dispositif1.js : S2, S8, S11) via CityMap.openTo(id) ;
  // les itinéraires s'effacent à la fin du labo 1 (S6), à la fin du chapitre (S14) et à la remise à zéro.
  const dropRoute = () => { if (sel.id) clearRoute(); };
  window.addEventListener('dispositif1:piste', dropRoute);
  window.addEventListener('taama:chapitre1-fin', dropRoute);
  window.addEventListener('taama:reset', () => { autoShown = false; dropRoute(); });
  barEl.querySelector('.cm-route-x').addEventListener('click', (e) => { e.stopPropagation(); clearRoute(); });
  for (const t of ['pointerdown', 'pointermove']) ui.addEventListener(t, (e) => { if (e.target.closest('.cm-places, .cm-route')) e.stopPropagation(); });

  /* ---------- vue ---------- */
  // `view.half` = demi-côté (m réels) de la plus PETITE dimension du cadre ; la grande carte compacte est rectangulaire
  const asp = () => { const w = cv.width || 1, h = cv.height || 1, m = Math.min(w, h); return { x: w / m, y: h / m }; };
  /** marges (px CSS) occupées par l'interface autour de la carte, mesurées dans le DOM (mode compact seulement) */
  function insets() {
    if (!open || !compact()) return { L: 0, R: 0, T: 0, B: 0 };
    const cr = cv.getBoundingClientRect(), tr = tools.getBoundingClientRect(), bar = ui.querySelector('.cm-topbar').getBoundingClientRect();
    const rt = barEl.classList.contains('on') ? barEl.getBoundingClientRect() : null;
    return { L: 8, R: Math.max(0, cr.right - tr.left) + 6, T: Math.max(0, bar.bottom - cr.top) + 6, B: rt ? Math.max(0, cr.bottom - rt.top) + 6 : 8 };
  }
  function clampView() {
    const A = asp();
    view.half = Math.max(MIN_HALF, Math.min(HALF / Math.max(A.x, A.y), view.half));
    const limE = Math.max(0, HALF - view.half * A.x), limN = Math.max(0, HALF - view.half * A.y);
    view.ce = Math.max(-limE, Math.min(limE, view.ce));
    view.cn = Math.max(-limN, Math.min(limN, view.cn));
  }
  /** zoom d'un facteur f (<1 = avant) en gardant fixe le point (u, v) de l'écran (0..1) */
  function zoomAt(f, u = 0.5, v = 0.5) {
    const A = asp(), h0 = view.half;
    const we = view.ce + (u - 0.5) * 2 * h0 * A.x, wn = view.cn - (v - 0.5) * 2 * h0 * A.y;
    view.half = Math.max(MIN_HALF, Math.min(HALF / Math.max(A.x, A.y), h0 * f));
    view.ce = we - (u - 0.5) * 2 * view.half * A.x; view.cn = wn + (v - 0.5) * 2 * view.half * A.y;
    clampView();
  }
  function recenter(half) {
    const pl = playerReal();
    view.ce = pl.e; view.cn = pl.n; if (half) view.half = half;
    clampView();
  }

  /* ---------- ouverture / fermeture ---------- */
  function setOpen(v) {
    if (v === open) return;
    open = v; closedAt = performance.now();
    box.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-on', open);
    box.setAttribute('aria-label', open ? 'Carte de Djenné' : 'Carte de Djenné — cliquer pour agrandir');
    held.clear();
    if (open) { closePanels(); syncPad(); resizeCanvas(); }        // le canvas prend sa taille (plein cadre en compact) avant le calcul de la vue
    if (open) {
      try { document.exitPointerLock?.(); } catch (_) {}
      buildPlacesList(); loadRouter();
      if (!autoShown && !sel.id && storyTarget() && placeOf(storyTarget())) { autoShown = true; sel.id = storyTarget(); markPlacesActive(); }   // l'itinéraire vers la base est affiché dès la 1re ouverture (jamais de téléportation)
      recenter(OPEN_HALF);                                       // s'ouvre zoomée sur le joueur
      if (sel.id) recomputeRoute(true);
      window.GamepadKit?.capture?.(true);                        // la manette ne pilote plus le jeu
    } else {
      autoOpened = false;                                        // fermée : le jeu récupère la manette, et la prochaine ouverture manuelle laissera les sticks libres
      window.GamepadKit?.capture?.(false);
    }
    lastKey = ''; resizeCanvas(); draw(true);
  }
  const stop = (e) => e.stopPropagation();
  for (const t of ['pointerdown', 'mousedown', 'touchstart', 'pointerup', 'mouseup', 'touchend', 'contextmenu']) {
    box.addEventListener(t, stop, { passive: true });
    backdrop.addEventListener(t, stop, { passive: true });
  }
  box.addEventListener('click', (e) => { e.stopPropagation(); if (!open) setOpen(true); });
  box.addEventListener('keydown', (e) => { if (!open && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } });
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); setOpen(false); });
  backdrop.addEventListener('click', () => setOpen(false));
  bIn.addEventListener('click', (e) => { e.stopPropagation(); zoomAt(0.65); });
  bOut.addEventListener('click', (e) => { e.stopPropagation(); zoomAt(1 / 0.65); });
  bMe.addEventListener('click', (e) => { e.stopPropagation(); recenter(); });

  /* ---------- souris / tactile sur la grande carte ---------- */
  const ptrs = new Map(); let drag = null, pinch = null, multi = false, lastTap = null, dblAt = 0;
  const rect = () => cv.getBoundingClientRect();
  const mpp0 = () => { const r = rect(); return (2 * view.half) / Math.min(r.width, r.height); };   // mètres par pixel écran
  const midOf = () => { const [a, b] = [...ptrs.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }; };
  cv.addEventListener('pointerdown', (e) => {
    if (!open) return;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { drag = { x: e.clientX, y: e.clientY, ce: view.ce, cn: view.cn }; multi = false; }
    else if (ptrs.size === 2) { pinch = midOf(); drag = null; multi = true; }
    cv.classList.add('is-drag');
  });
  cv.addEventListener('pointermove', (e) => {
    if (!open || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size >= 2) {                                 // pincement : zoom autour du milieu des deux doigts + déplacement
      const m = midOf(), r = rect();
      view.ce -= (m.x - pinch.x) * mpp0(); view.cn += (m.y - pinch.y) * mpp0();
      zoomAt(pinch.d / m.d, (m.x - r.left) / r.width, (m.y - r.top) / r.height);
      pinch = m;
    } else if (drag) {
      const k = mpp0();
      view.ce = drag.ce - (e.clientX - drag.x) * k; view.cn = drag.cn + (e.clientY - drag.y) * k; clampView();
    }
  });
  const endPtr = (e) => {
    if (e.type === 'pointerup' && drag && ptrs.size === 1 && !multi && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) {
      const r = rect(), sc = cv.width / r.width, px = (e.clientX - r.left) * sc, py = (e.clientY - r.top) * sc, now = performance.now();
      if (e.pointerType === 'touch' && lastTap && now - lastTap.t < 450 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        lastTap = null; dblAt = now;                               // double tape : zoom avant, sans (dé)sélectionner de lieu
        ptrs.delete(e.pointerId); drag = null; cv.classList.remove('is-drag');
        zoomAt(0.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
      let best = null, bd = 1e9;
      for (const h of hits) { const d = Math.hypot(h.x - px, h.y - py); if (d < h.r * 1.5 && d < bd) { bd = d; best = h; } }
      if (best) { ptrs.delete(e.pointerId); drag = null; cv.classList.remove('is-drag'); selectPlace(best.id, false); return; }
    }
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { x: p.x, y: p.y, ce: view.ce, cn: view.cn }; }
    if (ptrs.size === 0) { drag = null; multi = false; cv.classList.remove('is-drag'); }
  };
  cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
  box.addEventListener('wheel', (e) => {
    e.stopPropagation();
    if (!open) return;
    e.preventDefault();
    const r = rect(), u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    zoomAt(Math.exp(Math.max(-300, Math.min(300, dy)) * 0.0016), u, v);
  }, { passive: false });
  cv.addEventListener('dblclick', (e) => {
    if (!open || performance.now() - dblAt < 700) return;          // déjà géré par la double tape tactile
    const r = rect(); zoomAt(0.5, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });

  /* ---------- clavier ---------- */
  // La lettre tapée (e.key) et non la position physique (e.code) : sur un clavier AZERTY la touche M est à la place du « ; » (code Semicolon), KeyM y est la virgule.
  const isKey = (e, l) => (e.key || '').toLowerCase() === l;
  window.addEventListener('keydown', (e) => {
    if (!shown || e.ctrlKey || e.metaKey || e.altKey) return;
    const tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName)) return;
    if (!open) {
      if (isKey(e, 'm')) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (/^F\d+$/.test(e.key)) return;                              // touches de fonction du navigateur
    const c = e.code;
    if (isKey(e, 'm') || c === 'Escape') setOpen(false);
    else if (isKey(e, 'c')) recenter();
    else if (c === 'Equal' || c === 'NumpadAdd' || e.key === '+') zoomAt(0.75);
    else if (c === 'Minus' || c === 'NumpadSubtract' || e.key === '-') zoomAt(1 / 0.75);
    else if (PAN_KEYS[c]) held.add(c);
    e.preventDefault(); e.stopImmediatePropagation();              // le jeu ne reçoit plus les touches
  }, true);
  window.addEventListener('keyup', (e) => { held.delete(e.code); }, true);   // jamais bloqué : pas de touche « coincée » dans le jeu
  window.addEventListener('blur', () => held.clear());

  /* ---------- dessin ---------- */
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w, h;
    if (open && compact()) { w = Math.max(96, Math.round((cv.clientWidth || window.innerWidth) * dpr)); h = Math.max(96, Math.round((cv.clientHeight || window.innerHeight) * dpr)); }
    else { const css = open ? Math.min(window.innerWidth * 0.99, window.innerHeight * 0.98) : box.clientWidth || 168; w = h = Math.max(96, Math.round(css * dpr)); }
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  }
  window.addEventListener('resize', () => { resizeCanvas(); if (open) clampView(); draw(true); });

  function playerReal() {
    const p = M.camera.position, r = gameToReal(p.x, p.z);
    M.camera.getWorldDirection(dir);
    return { e: r.e, n: r.n, heading: Math.atan2(dir.z, dir.x) };      // 0 = nord (+x), + vers l'est (+z)
  }

  /** Position de l'ACTEUR (la voiture quand on conduit, sinon le joueur) : le guidage part de là et non de la caméra, qui tremble et se décale en poursuite. */
  function actorReal() {
    const base = playerReal();
    const V = window.Vehicle, driving = !!(V && V.state === 'drive' && V.position);
    let p = driving ? V.position : null;
    if (!p) { const sp = window.SanctuaryMode && window.SanctuaryMode.playerPosition && window.SanctuaryMode.playerPosition(); if (sp) p = sp; }
    if (!p) return { ...base, driving: false, speed: 0 };
    const r = gameToReal(p.x, p.z);
    return { e: r.e, n: r.n, heading: base.heading, driving, speed: driving ? (V.speed || 0) : 0 };
  }

  function niceBar(maxM) {
    let best = 20;
    for (const m of [20, 50, 100, 200, 250, 500, 1000]) if (m <= maxM) best = m;
    return best;
  }

  function draw(force) {
    if (!imgReady) return;
    resizeCanvas();
    const W = cv.width, H = cv.height, S = Math.min(W, H);           // S = unité d'échelle (plus petite dimension)
    const cp = open && compact(), dp = Math.min(window.devicePixelRatio || 1, 2), fl = (css) => (cp ? css * dp : 0);   // planchers lisibles (px CSS) en mode compact
    const ins = cp ? insets() : null, vis = cp
      ? { x0: ins.L * dp + 10 * dp, y0: ins.T * dp + 10 * dp, x1: W - ins.R * dp - 4 * dp, y1: H - ins.B * dp }
      : { x0: S * 0.06, y0: S * 0.06, x1: S * 0.94, y1: S * 0.94 };   // zone où se posent les repères de bord
    // point du bord de la zone visible dans la direction `ang`, replié de `m` px vers l'intérieur
    const edgePt = (ang, m = 0) => {
      const cx = (vis.x0 + vis.x1) / 2, cy = (vis.y0 + vis.y1) / 2, hw = (vis.x1 - vis.x0) / 2 - m, hh = (vis.y1 - vis.y0) / 2 - m;
      const c = Math.cos(ang), sn = Math.sin(ang), t = Math.min(Math.abs(c) > 1e-6 ? hw / Math.abs(c) : 1e9, Math.abs(sn) > 1e-6 ? hh / Math.abs(sn) : 1e9);
      return [cx + c * t, cy + sn * t, cx, cy];
    };
    const pl = playerReal();
    const half = open ? view.half : MINI_HALF;
    const hx = half * W / S, hy = half * H / S;                      // demi-étendues (m) horizontale et verticale
    let ce = open ? view.ce : pl.e, cn = open ? view.cn : pl.n;
    const limE = Math.max(0, HALF - hx), limN = Math.max(0, HALF - hy); ce = Math.max(-limE, Math.min(limE, ce)); cn = Math.max(-limN, Math.min(limN, cn));
    const key = `${open}|${W}x${H}|${ce.toFixed(1)}|${cn.toFixed(1)}|${half.toFixed(1)}|${pl.e.toFixed(1)}|${pl.n.toFixed(1)}|${pl.heading.toFixed(2)}`;
    if (!force && key === lastKey && !(sel.id && sel.route)) return;
    lastKey = key;
    if (sel.id) recomputeRoute(false);
    hits = [];

    const sx = IMG / 2 + ce * PPM - hx * PPM, sy = IMG / 2 - cn * PPM - hy * PPM;
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, hx * PPM * 2, hy * PPM * 2, 0, 0, W, H);
    const toC = (e, n) => [((e - ce) / (2 * hx) + 0.5) * W, (0.5 - (n - cn) / (2 * hy)) * H];

    // itinéraire vers le lieu choisi : liseré sombre + trait doré animé
    if (sel.id && sel.route && sel.route.pts.length > 1) {
      ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      const path = () => { ctx.beginPath(); sel.route.pts.forEach((q, i) => { const [x, y] = toC(q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); };
      ctx.strokeStyle = 'rgba(40,28,48,.92)'; ctx.lineWidth = Math.max(5, fl(7), S * (open ? 0.0105 : 0.022)); path(); ctx.stroke();
      ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = Math.max(3, fl(4), S * (open ? 0.0062 : 0.013));
      ctx.setLineDash([Math.max(S * 0.02, fl(10)), Math.max(S * 0.012, fl(6))]); ctx.lineDashOffset = -(performance.now() / 40) % 1000; path(); ctx.stroke();
      ctx.restore();
    }

    // Grande Mosquée (≈ 71 m de côté)
    const [mx, my] = toC(0, 0);
    const rs = Math.max(S * 0.012, 36 / (2 * half) * S);
    ctx.save();
    ctx.lineWidth = Math.max(2, S * 0.005); ctx.strokeStyle = '#fff3c9'; ctx.fillStyle = 'rgba(192,160,112,.92)';
    ctx.beginPath(); ctx.rect(mx - rs, my - rs, rs * 2, rs * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (open) {
      const fs = Math.max(Math.round(S * 0.021), fl(12));
      ctx.save(); ctx.font = `700 ${fs}px Rajdhani, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,48,.9)'; ctx.fillStyle = '#ffe9b0';
      ctx.strokeText('Grande Mosquée', mx, my - rs - S * 0.012); ctx.fillText('Grande Mosquée', mx, my - rs - S * 0.012);
      // échelle : longueur « ronde » qui tient dans ~22 % de la largeur
      const bar = niceBar(hx * 2 * 0.22), barLen = bar / (2 * hx) * W, bx = (cp ? vis.x1 - fl(10) : W - S * 0.04) - barLen, by = cp ? vis.y1 - fl(10) : H - S * 0.045;
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,28,48,.9)'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barLen, by); ctx.stroke();
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#ffe9b0'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + barLen, by); ctx.stroke();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(40,28,48,.9)'; ctx.fillStyle = '#ffe9b0';
      const lbl = bar >= 1000 ? (bar / 1000) + ' km' : bar + ' m';
      ctx.strokeText(lbl, bx + barLen / 2, by - Math.max(S * 0.012, fl(5))); ctx.fillText(lbl, bx + barLen / 2, by - Math.max(S * 0.012, fl(5)));
      ctx.font = `700 ${Math.max(Math.round(S * 0.03), fl(15))}px Rajdhani, sans-serif`;
      const nx = cp ? vis.x1 - fl(24) : W - S * 0.07, ny = cp ? vis.y0 + fl(12) : S * 0.11;
      ctx.strokeText('N ↑', nx, ny); ctx.fillText('N ↑', nx, ny);
      ctx.restore();
    }

    // Zone NÉANTIS (base fictive) : pastille noire au N bleu
    const nb = window.NeantisBase;
    if (nb && nb.loaded) {
      const r = gameToReal(nb.center.x, nb.center.z), [bx, by] = toC(r.e, r.n);
      const sz = open ? Math.max(S * 0.03, 14, fl(11)) : Math.max(S * 0.07, 11);
      if (bx > -sz && bx < W + sz && by > -sz && by < H + sz) {
        ctx.save(); ctx.translate(bx, by);
        ctx.fillStyle = '#10131c'; ctx.strokeStyle = '#37a3ff'; ctx.lineWidth = Math.max(2, S * 0.005);
        ctx.beginPath(); ctx.roundRect(-sz, -sz, sz * 2, sz * 2, sz * 0.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5db8ff'; ctx.font = `800 ${Math.round(sz * 1.5)}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, sz * 0.06);
        if (open) {
          ctx.textBaseline = 'alphabetic'; ctx.font = `700 ${Math.max(Math.round(S * 0.02), fl(12))}px Rajdhani, sans-serif`;
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(16,19,28,.95)'; ctx.fillStyle = '#9fd4ff';
          ctx.strokeText('Zone NÉANTIS', 0, sz + S * 0.024); ctx.fillText('Zone NÉANTIS', 0, sz + S * 0.024);
        }
        ctx.restore();
      } else {                                                      // base hors vue : repère sur le bord + distance
        const k = open ? Math.max(S * 0.03, fl(11)) : S * 0.07;
        let ex, ey, ang;
        if (open) { const c0 = edgePt(0, 0); ang = Math.atan2(by - c0[3], bx - c0[2]); [ex, ey] = edgePt(ang, k * 2.2); }
        else { ang = Math.atan2(by - H / 2, bx - W / 2); ex = W / 2 + Math.cos(ang) * S * 0.39; ey = H / 2 + Math.sin(ang) * S * 0.39; }
        ctx.save(); ctx.translate(ex, ey);
        ctx.save(); ctx.rotate(ang);                                // pointe vers la base
        ctx.fillStyle = '#37a3ff'; ctx.strokeStyle = '#10131c'; ctx.lineWidth = Math.max(2, S * 0.004);
        ctx.beginPath(); ctx.moveTo(k * 1.9, 0); ctx.lineTo(k * 1.05, -k * 0.6); ctx.lineTo(k * 1.05, k * 0.6); ctx.closePath(); ctx.stroke(); ctx.fill();
        ctx.restore();
        ctx.fillStyle = '#10131c'; ctx.strokeStyle = '#37a3ff'; ctx.lineWidth = Math.max(2, S * 0.005);
        ctx.beginPath(); ctx.roundRect(-k, -k, k * 2, k * 2, k * 0.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5db8ff'; ctx.font = `800 ${Math.round(k * 1.5)}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('N', 0, k * 0.06);
        if (open) {
          const dm = Math.round(Math.hypot(r.e - pl.e, r.n - pl.n) / 10) * 10;
          ctx.textBaseline = 'alphabetic'; ctx.font = `700 ${Math.max(Math.round(S * 0.02), fl(12))}px Rajdhani, sans-serif`;
          ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(16,19,28,.95)'; ctx.fillStyle = '#9fd4ff';
          const txt = 'NÉANTIS · ' + (dm >= 1000 ? (dm / 1000).toFixed(1) + ' km' : dm + ' m');
          const ty = ey > H / 2 ? -k - S * 0.012 : k + Math.max(S * 0.026, fl(14));
          ctx.strokeText(txt, 0, ty); ctx.fillText(txt, 0, ty);
        }
        ctx.restore();
      }
    }

    // lieux célèbres : pastilles cliquables (grande carte) ; le lieu choisi est mis en avant, sinon repère sur le bord
    if (open) {
      const fs2 = Math.max(Math.round(S * 0.019), fl(12)), rr = Math.max(S * 0.013, 8, fl(7));
      for (const p of places()) {
        if (p.id === 'mosquee') { const [x, y] = toC(0, 0); hits.push({ id: p.id, x, y, r: Math.max(rs, rr) }); continue; }
        const [x, y] = toC(p.e, p.n), on = p.id === sel.id, inside = x > -rr && x < W + rr && y > -rr && y < H + rr;
        if (p.id === 'neantis') { if (inside) hits.push({ id: p.id, x, y, r: Math.max(S * 0.03, 14, fl(16)) }); }
        else if (inside) {
          ctx.save(); ctx.translate(x, y);
          ctx.fillStyle = on ? '#ffd34d' : '#fff3c9'; ctx.strokeStyle = '#3a2a46'; ctx.lineWidth = Math.max(2, S * 0.004);
          ctx.beginPath(); ctx.arc(0, 0, rr * (on ? 1.25 : 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#3a2a46'; ctx.beginPath(); ctx.arc(0, 0, rr * 0.38, 0, Math.PI * 2); ctx.fill();
          ctx.font = `700 ${fs2}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,48,.92)'; ctx.fillStyle = on ? '#ffe9a0' : '#fff3c9';
          ctx.strokeText(p.short, 0, rr * 2.3); ctx.fillText(p.short, 0, rr * 2.3);
          ctx.restore();
          hits.push({ id: p.id, x, y, r: Math.max(rr * 1.6, fl(15)) });
        }
        if (on && !inside) {                                       // lieu choisi hors de la vue : flèche au bord
          const k = Math.max(S * 0.022, fl(9)), c0 = edgePt(0, 0), ang = Math.atan2(y - c0[3], x - c0[2]), ep = edgePt(ang, k * 1.8);
          ctx.save(); ctx.translate(ep[0], ep[1]); ctx.rotate(ang);
          ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#3a2a46'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(k * 1.6, 0); ctx.lineTo(-k, -k * 0.9); ctx.lineTo(-k * 0.4, 0); ctx.lineTo(-k, k * 0.9); ctx.closePath(); ctx.stroke(); ctx.fill();
          ctx.rotate(-ang); ctx.font = `700 ${fs2}px Rajdhani, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,48,.92)'; ctx.fillStyle = '#ffe9a0';
          const lab = p.short + ' · ' + formatDistance(Math.hypot(p.e - pl.e, p.n - pl.n)); ctx.strokeText(lab, 0, -k * 1.5); ctx.fillText(lab, 0, -k * 1.5);
          ctx.restore();
        }
      }
    }

    // joueur : flèche orientée selon la caméra (si dans la vue)
    const [px, py] = toC(pl.e, pl.n);
    if (px > -40 && px < W + 40 && py > -40 && py < H + 40) {
      const a = open ? Math.max(S * 0.02, 10, fl(9)) : Math.max(S * 0.035, 9);
      ctx.save(); ctx.translate(px, py); ctx.rotate(pl.heading);
      ctx.lineWidth = Math.max(2, S * 0.006); ctx.strokeStyle = '#3a2a46'; ctx.fillStyle = '#f4cf5a';
      ctx.beginPath(); ctx.moveTo(0, -a * 1.15); ctx.lineTo(a * 0.78, a * 0.85); ctx.lineTo(0, a * 0.4); ctx.lineTo(-a * 0.78, a * 0.85); ctx.closePath();
      ctx.stroke(); ctx.fill();
      ctx.restore();
    } else if (open) {                                              // joueur hors vue : repère sur le bord
      const c0 = edgePt(0, 0), ang = Math.atan2(py - c0[3], px - c0[2]), ep = edgePt(ang, Math.max(S * 0.03, fl(14))), q = Math.max(S, fl(300));
      ctx.save(); ctx.translate(ep[0], ep[1]); ctx.rotate(ang + Math.PI / 2);
      ctx.fillStyle = '#f4cf5a'; ctx.strokeStyle = '#3a2a46'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -q * 0.025); ctx.lineTo(q * 0.02, q * 0.015); ctx.lineTo(-q * 0.02, q * 0.015); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }

  /* ---------- manette / clavier tenu : appliqués à chaque image ---------- */
  function applyInputs(dt) {
    const GP = window.GamepadKit, raw = GP && GP.raw;
    syncPad();
    let ex = 0, ny = 0, zf = 0;
    for (const k of held) { const d = PAN_KEYS[k]; if (d) { ex += d[0]; ny += d[1]; } }
    if (raw && GP.connected()) {
      const s = raw.state();
      if (raw.justPressed('B')) { setOpen(false); return; }          // B ferme toujours (et rend la manette au jeu)
      if (!autoOpened) {                                             // carte ouverte à la main : sticks et gâchettes déplacent / zooment la carte
        ex += s.lx; ny += -s.ly;
        zf = (raw.trigger(7) - raw.trigger(6)) + (-s.ry);            // RT / stick droit ↑ = zoom avant ; LT / stick droit ↓ = arrière
        if (raw.justPressed('LEFT')) { setOpen(false); return; }
        if (raw.justPressed('A')) recenter();
      }
    }
    if (ex || ny) {
      const n = Math.hypot(ex, ny), k = n > 1 ? 1 / n : 1;
      view.ce += ex * k * view.half * 1.5 * dt; view.cn += ny * k * view.half * 1.5 * dt;
    }
    if (zf) view.half *= Math.exp(-zf * 1.4 * dt);
    if (ex || ny || zf) clampView();
  }

  /* ---------- boucle ---------- */
  M.addFrameHook((dt) => {
    const d = Math.min(dt, 0.1);
    acc += d;
    let tickSlow = false;
    if (acc >= 0.1) {
      acc = 0; tickSlow = true;
      const gu = document.getElementById('guRoot');
      const want = !!(M.loaded && M.newCity && (!gu || gu.hidden));
      if (want !== shown) {
        shown = want; box.classList.toggle('is-on', shown);
        if (!shown && open) setOpen(false);
        if (shown && !imgReq) { imgReq = true; img.onload = () => { imgReady = true; draw(true); }; img.onerror = () => console.warn('[carte] image introuvable'); img.src = MAP_URL; }
        if (shown) { resizeCanvas(); lastKey = ''; }
      }
    }
    if (!shown) { routeArrow.hide(); return; }
    // boussole-guide (interface) : seulement quand un lieu est choisi, la grande carte fermée ; l'aiguille vise un point de l'itinéraire, pas le lieu en ligne droite
    if (open || !sel.id || !sel.route) routeArrow.hide();
    else { const pl = placeOf(sel.id), a = actorReal(); routeArrow.update(d, { route: sel.route, name: pl ? (pl.short || pl.name) : '', me: a, speed: a.speed, visible: true }); }
    if (!autoShown && !sel.id && storyTarget() && placeOf(storyTarget())) { autoShown = true; sel.id = storyTarget(); loadRouter(); }   // itinéraire vers la base visible d'emblée, sur le cercle comme sur la grande carte
    if (open) { applyInputs(d); draw(false); return; }
    // fermée : la croix gauche de la manette ouvre la carte (si aucun menu n'est affiché)
    const GP = window.GamepadKit;
    if (GP && GP.connected() && GP.justPressed('LEFT') && !(window.Vehicle && window.Vehicle.state === 'drive') && !(window.KeyboardMenu && window.KeyboardMenu.hasMenu && window.KeyboardMenu.hasMenu())) { setOpen(true); return; }
    if (tickSlow) draw(false);
  });

  window.CityMap = {
    open: () => setOpen(true), close: () => setOpen(false), toggle: () => setOpen(!open),
    get isOpen() { return open; }, get visible() { return shown; }, get busy() { return open || performance.now() - closedAt < 300; },
    get view() { return { ...view }; }, zoomAt, recenter,
    gameToReal,
    selectPlace: (id) => { if (id !== sel.id) selectPlace(id); }, clearRoute,
    // ouvre la grande carte avec l'itinéraire vers le lieu `id` déjà tracé et cadré
    openTo(id) {
      autoShown = true;
      if (sel.id !== id) { sel.id = id; sel.route = null; sel.from = null; }
      if (!open) autoOpened = true;                              // ouverture automatique (histoire) : sticks bloqués jusqu'à la fermeture
      setOpen(true);
      fitPending = true; recomputeRoute(true);
      if (fitRoute()) fitPending = false;
      markPlacesActive(); draw(true);
    },
    get selected() { return sel.id; },
    get guide() { return routeArrow.state; },                    // cap du trajet, distance restante, prochain virage (tableau de bord de la voiture)
    get route() { return sel.route ? { id: sel.id, length: sel.route.length, pts: sel.route.pts.length, roads: sel.route.roads } : null; },
  };
}
