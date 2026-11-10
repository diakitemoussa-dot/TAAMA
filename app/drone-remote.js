/* ==========================================================
   VUE DU PILOTE — la télécommande tenue à deux mains, avec le téléphone qui montre ce que voit le drone
   ----------------------------------------------------------
   Pendant le vol depuis le sac, la caméra est celle du pilote (ses yeux) et regarde le drone au loin ; cette incrustation reprend le bas de
   l'écran : deux mains brunes (manches de sa tenue) sur la télécommande grise, dont les manettes suivent les commandes réelles, et le téléphone
   dont l'écran affiche la VRAIE vue de la caméra du drone (rendue dans une petite texture, ~7 images/s) avec « H : 18M », « 0 KM/H », cap, REC et batterie.
   Fonctions pures (testées sous Node, tests/drone-remote.test.mjs) : fovFor, lookAt décalé, formatTelemetry, stickOffset.
   ========================================================== */

/** Champ de vision (degrés) pour que le drone garde une taille apparente à peu près constante : il occupe `frac` de la hauteur de l'écran. */
export function fovFor(dist, size = 0.9, frac = 0.11, min = 16, max = 62) {
  const d = Math.max(0.5, dist);
  const fov = 2 * Math.atan((size / frac) / (2 * d)) * 180 / Math.PI;
  return Math.max(min, Math.min(max, fov));
}
/** Décalage vertical du point visé (m, vers le bas) pour que le drone apparaisse dans la moitié haute de l'écran (la télécommande occupe le bas). */
export function aimDrop(dist, fovDeg, shift = 0.16) { return Math.max(0, dist) * Math.tan(fovDeg * Math.PI / 360) * 2 * shift; }

/** Texte du téléphone. altM : hauteur au-dessus du sol (m), speedMs : vitesse (m/s), headingDeg : cap (0–360), battery : 0–100. */
export function formatTelemetry({ altM = 0, speedMs = 0, headingDeg = 0, battery = 100 } = {}) {
  return {
    alt: `H:${Math.max(0, Math.round(altM))}M`,
    speed: `${Math.max(0, Math.round(speedMs * 3.6))} KM/H`,
    heading: `${(((headingDeg % 360) + 360) % 360).toFixed(1)}°`,
    battery: `${Math.max(0, Math.min(100, Math.round(battery)))}%`,
  };
}
/** Déplacement (px) d'une manette dessinée pour des commandes -1..1 (le disque est borné). */
export function stickOffset(x, y, r = 9) {
  const m = Math.hypot(x, y);
  const k = m > 1 ? 1 / m : 1;
  return [x * k * r, y * k * r];
}

const CSS = `
#dgRemote { position: fixed; left: 2.2vw; bottom: -2px; width: min(34vw, 430px); aspect-ratio: 360 / 360; z-index: 41; pointer-events: none; display: none;
  filter: drop-shadow(0 8px 14px rgba(0,0,0,.35)); transform: translateY(6%); }
#dgRemote.on { display: block; }
#dgRemote svg { width: 100%; height: 100%; display: block; overflow: visible; }
#dgRemote .dr-screen { position: absolute; left: 8.9%; top: 3.2%; width: 82.2%; height: 38%; overflow: hidden; border-radius: 3% / 6%; background: #1c1a1f; }
#dgRemote canvas { position: absolute; inset: 0; width: 100%; height: 100%; transform: scaleY(-1); }
#dgRemote .dr-t { position: absolute; font: 700 clamp(7px, 1vw, 11px)/1 'Rajdhani', 'Open Sans', system-ui, sans-serif; color: #fff; letter-spacing: .04em; text-shadow: 0 1px 2px rgba(0,0,0,.7); }
#dgRemote .dr-tl { left: 3%; top: 5%; padding: 2px 4px; background: rgba(20,16,20,.55); border-radius: 3px; display: flex; flex-direction: column; gap: 3px; }
#dgRemote .dr-rec { right: 3%; top: 5%; background: rgba(20,16,20,.55); padding: 2px 5px; border-radius: 3px; display: flex; align-items: center; gap: 4px; }
#dgRemote .dr-rec i { width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; display: block; }
#dgRemote .dr-bl { left: 3%; bottom: 6%; padding: 2px 4px; background: rgba(20,16,20,.55); border-radius: 3px; display: flex; flex-direction: column; gap: 3px; }
#dgRemote .dr-br { right: 3%; bottom: 6%; background: rgba(20,16,20,.55); padding: 2px 5px; border-radius: 3px; display: flex; gap: 6px; align-items: center; }
#dgRemote .dr-br i { width: 7px; height: 7px; border-radius: 50%; background: #ff3b30; display: block; }
@media (max-width: 760px) { #dgRemote { width: 52vw; } }
`;

const SVG = `
<svg viewBox="0 0 360 360" aria-hidden="true">
  <defs>
    <linearGradient id="drBody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8c3c0"/><stop offset="1" stop-color="#9d9895"/></linearGradient>
    <linearGradient id="drSkin" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a4a36"/><stop offset="1" stop-color="#5a3526"/></linearGradient>
    <linearGradient id="drSleeve" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e3a63c"/><stop offset="1" stop-color="#c17f26"/></linearGradient>
  </defs>
  <!-- téléphone (son écran est la zone .dr-screen par-dessus) -->
  <rect x="14" y="0" width="332" height="150" rx="16" fill="#27252b" stroke="#47444c" stroke-width="2"/>
  <rect x="150" y="146" width="60" height="26" rx="6" fill="#3a373f"/>
  <rect x="120" y="164" width="120" height="14" rx="5" fill="#4a474f"/>
  <!-- télécommande -->
  <path d="M6 232 Q6 186 52 186 L308 186 Q354 186 354 232 L354 290 Q354 330 312 330 L48 330 Q6 330 6 290 Z" fill="url(#drBody)" stroke="#7c7774" stroke-width="2"/>
  <path d="M30 192 Q180 176 330 192" fill="none" stroke="#e4dfdc" stroke-width="3" opacity=".6"/>
  <circle cx="88" cy="240" r="30" fill="#4b4750"/><circle cx="272" cy="240" r="30" fill="#4b4750"/>
  <g fill="#ddd7d3"><rect x="132" y="214" width="14" height="9" rx="3"/><rect x="214" y="214" width="14" height="9" rx="3"/>
  <circle cx="162" cy="300" r="3.2"/><circle cx="176" cy="300" r="3.2"/><circle cx="190" cy="300" r="3.2"/><circle cx="204" cy="300" r="3.2"/></g>
  <rect x="152" y="238" width="56" height="30" rx="14" fill="#86817e" opacity=".7"/>
  <!-- manettes mobiles + pouces -->
  <g id="drStickL"><circle cx="88" cy="240" r="17" fill="#2b292f"/><circle cx="88" cy="238" r="13" fill="#3a373e"/>
    <path id="drThumbL" d="M44 330 Q36 292 56 262 Q70 238 92 232 Q108 232 104 250 Q98 266 84 276 Q70 300 74 330 Z" fill="url(#drSkin)"/></g>
  <g id="drStickR"><circle cx="272" cy="240" r="17" fill="#2b292f"/><circle cx="272" cy="238" r="13" fill="#3a373e"/>
    <path id="drThumbR" d="M316 330 Q324 292 304 262 Q290 238 268 232 Q252 232 256 250 Q262 266 276 276 Q290 300 286 330 Z" fill="url(#drSkin)"/></g>
  <!-- mains et manches -->
  <path d="M-4 360 L-4 290 Q-4 248 30 236 Q56 232 66 262 L84 360 Z" fill="url(#drSkin)"/>
  <path d="M364 360 L364 290 Q364 248 330 236 Q304 232 294 262 L276 360 Z" fill="url(#drSkin)"/>
  <path d="M-10 360 L-10 318 Q20 308 50 322 L66 360 Z" fill="url(#drSleeve)"/>
  <path d="M370 360 L370 318 Q340 308 310 322 L294 360 Z" fill="url(#drSleeve)"/>
  <g stroke="#7a4a1a" stroke-width="3" opacity=".7"><path d="M-6 336 Q22 328 54 340"/><path d="M366 336 Q338 328 306 340"/></g>
</svg>`;

/** Crée l'incrustation (une seule fois). renderer/scene : pour le rendu de la vue du drone. */
export function createRemote() {
  let el = null, screen = null, cv = null, ctx2d = null, rt = null, cam = null, buf = null, img = null, frameT = 0, shown = false;
  const W = 256, H = 144;
  const refs = {};
  function ensure() {
    if (el && el.isConnected) return;
    if (!document.getElementById('dgRemoteStyle')) { const st = document.createElement('style'); st.id = 'dgRemoteStyle'; st.textContent = CSS; document.head.appendChild(st); }
    el = document.createElement('div'); el.id = 'dgRemote'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = SVG + '<div class="dr-screen"><canvas width="' + W + '" height="' + H + '"></canvas>' +
      '<div class="dr-t dr-tl"><span class="dr-h">H:0M</span></div><div class="dr-t dr-rec"><i></i>REC</div>' +
      '<div class="dr-t dr-bl"><span class="dr-s">0 KM/H</span><span class="dr-a">0.0°</span></div><div class="dr-t dr-br"><span><i style="display:inline-block;margin-right:3px"></i>REC</span><span class="dr-b">100%</span></div></div>';
    document.body.appendChild(el);
    screen = el.querySelector('.dr-screen'); cv = el.querySelector('canvas'); ctx2d = cv.getContext('2d'); img = ctx2d.createImageData(W, H); buf = new Uint8Array(W * H * 4);
    refs.h = el.querySelector('.dr-h'); refs.s = el.querySelector('.dr-s'); refs.a = el.querySelector('.dr-a'); refs.b = el.querySelector('.dr-b');
    refs.sl = el.querySelector('#drStickL'); refs.sr = el.querySelector('#drStickR');
  }
  return {
    get visible() { return shown; },
    show(on) { ensure(); shown = on; el.classList.toggle('on', on); },
    /** data : { lx, ly, rx, ry (commandes -1..1), altM, speedMs, headingDeg, battery }. live : { renderer, scene, droneCam } pour l'écran du téléphone (facultatif). */
    update(dt, data, live) {
      if (!shown) return;
      const T = formatTelemetry(data);
      refs.h.textContent = T.alt; refs.s.textContent = T.speed; refs.a.textContent = T.heading; refs.b.textContent = T.battery;
      const [lx, ly] = stickOffset(data.lx, -data.ly), [rx, ry] = stickOffset(data.rx, -data.ry);
      refs.sl.setAttribute('transform', `translate(${lx.toFixed(1)} ${ly.toFixed(1)})`); refs.sr.setAttribute('transform', `translate(${rx.toFixed(1)} ${ry.toFixed(1)})`);
      frameT -= dt;
      if (live && frameT <= 0) {                           // vue du drone : petite texture, ~7 images/s
        frameT = 0.14;
        try {
          const { renderer, scene, camera } = live;
          if (!rt) { rt = renderer.getRenderTarget ? new live.THREE.WebGLRenderTarget(W, H, { depthBuffer: true }) : null; }
          if (rt) {
            const prev = renderer.getRenderTarget(), sh = renderer.shadowMap.autoUpdate;
            renderer.shadowMap.autoUpdate = false; renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = sh;
            renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); img.data.set(buf); ctx2d.putImageData(img, 0, 0);
          }
        } catch (_) { /* pas de vue en direct : écran sombre */ }
      }
    },
    dispose() { if (el) el.classList.remove('on'); shown = false; if (rt) { rt.dispose(); rt = null; } },
  };
}
