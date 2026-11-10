/* ==========================================================
   PREMIER DISPOSITIF — « le fragment de mémoire » (document de conception, §5.1)
   ----------------------------------------------------------
   « Forme compacte, matériaux inconnus, quelques détails lumineux lorsque l'objet s'active. Il ne doit pas ressembler à un objet
   magique classique : une technologie avancée dont le fonctionnement n'est pas compris. »
   Caché SUR LE TOIT de la Grande Mosquée (accès par la porte-portail avec vidéo de transition, déjà présente dans le sanctuaire), à moitié enfoui sous du sable
   et des briques de banco tombées. Objet entièrement procédural : prisme hexagonal à facettes, bague équatoriale, texture ancienne
   gravée (motifs géométriques sahéliens, patine de bronze sombre) et rainures lumineuses qui ne s'allument qu'à l'activation.
   • approche (≤ 2,6 m, à pied dans le sanctuaire) : « E / ▲  Examiner l'objet » ;
   • activation : les rainures s'illuminent, l'objet se met à tourner et flotter, Tapama réagit par radio ;
   • puis « E / ▲  Récupérer le dispositif » : il vole vers le joueur et rejoint son inventaire (pastille « Dispositif 1 » en haut à droite,
     mémorisée dans le navigateur) — le joueur repart avec ;
   • API : window.Dispositif1 { position, active, taken, activate(), take(), reset(), radioThen() } · événements window « dispositif1:active » et « dispositif1:taken ».
   • CHEF D'ORCHESTRE de l'histoire (bible docs/scenario-chapitre1.md, S2 → S14), en bas de ce fichier : radio de récupération -> carte vers le
     laboratoire (cercle jaune) -> labo stade 1 -> vol hors-champ devant la mosquée + dossier -> gadget + carte vers la base -> (base : neantis-base.js)
     -> carte vers le labo -> labo stade 2 -> fin du chapitre. État dans localStorage (clés taama.*), reprise de partie incluse.
   ========================================================== */
import * as THREE from 'three';
import { mediaUrl } from './device-quality.js?v=6';

const M = window.MosqueScene;
const POS = new THREE.Vector3(-10.0, 15.3, 15.0);         // repère du jeu (x nord, z est) : SUR LE TOIT de la Grande Mosquée (emplacement d'origine, côté façade à minarets)
const REACH = 2.6;

const DEV_KEY = 'taama.dispositif1';
const S = { taking: 0, taken: false, lock: 0, badge: null, built: false, group: null, core: null, ring: null, glowMat: null, glowTex: null, active: false, t: 0, glow: 0, prompt: null, nearT: 0 };

/* ---------- textures : métal ancien gravé + masque lumineux ---------- */
function makeTextures() {
  const N = 256, base = document.createElement('canvas'), glow = document.createElement('canvas');
  base.width = base.height = glow.width = glow.height = N;
  const b = base.getContext('2d'), g = glow.getContext('2d');
  const grd = b.createLinearGradient(0, 0, 0, N); grd.addColorStop(0, '#6f8582'); grd.addColorStop(0.5, '#8a7a60'); grd.addColorStop(1, '#566a66');
  b.fillStyle = grd; b.fillRect(0, 0, N, N);
  // patine : taches vertes-brunes + grain
  for (let i = 0; i < 900; i++) { const x = Math.random() * N, y = Math.random() * N, r = 1 + Math.random() * 7;
    b.fillStyle = Math.random() < 0.5 ? 'rgba(70,110,92,.10)' : 'rgba(120,84,48,.10)'; b.beginPath(); b.arc(x, y, r, 0, 7); b.fill(); }
  for (let i = 0; i < 5000; i++) { b.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,235,200'},${Math.random() * 0.07})`; b.fillRect(Math.random() * N, Math.random() * N, 1, 1); }
  g.fillStyle = '#000'; g.fillRect(0, 0, N, N);
  // gravures : bandes de chevrons et de losanges (formes géométriques sahéliennes stylisées, sans signification réelle)
  const stroke = (path) => {
    b.strokeStyle = 'rgba(15,18,18,.85)'; b.lineWidth = 4; b.lineCap = b.lineJoin = 'round'; b.stroke(path);
    b.save(); b.translate(0, -1); b.strokeStyle = 'rgba(190,160,110,.45)'; b.lineWidth = 1.4; b.stroke(path); b.restore();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.lineCap = g.lineJoin = 'round'; g.stroke(path);
  };
  [34, 96, 160, 222].forEach((y, k) => {
    for (let x = 0; x <= N; x += 32) {
      const path = new Path2D();
      if (k % 2 === 0) { path.moveTo(x - 16, y + 12); path.lineTo(x, y - 12); path.lineTo(x + 16, y + 12); }
      else { path.moveTo(x, y - 12); path.lineTo(x + 12, y); path.lineTo(x, y + 12); path.lineTo(x - 12, y); path.closePath(); }
      stroke(path);
    }
    const bar = new Path2D(); bar.moveTo(0, y + 30); bar.lineTo(N, y + 30); stroke(bar);
  });
  const t = new THREE.CanvasTexture(base); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  const e = new THREE.CanvasTexture(glow); e.colorSpace = THREE.SRGBColorSpace; e.wrapS = e.wrapT = THREE.RepeatWrapping;
  return { base: t, glow: e };
}

/* ---------- construction ---------- */
function readTaken() { try { return localStorage.getItem(DEV_KEY) === '1'; } catch (_) { return false; } }
function roofY(x, z, fallback) {
  const ms = []; M.scene.traverse((o) => { if (o.isMesh && /^(Mosquee_Base|Torons_Internes|Cube015)$/.test(o.name)) ms.push(o); });
  if (!ms.length) return fallback;
  const rc = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)); const h = rc.intersectObjects(ms, false);
  return h.length ? h[0].point.y : fallback;
}
function groundY() { return roofY(POS.x, POS.z, POS.y); }

function build() {
  const tex = makeTextures(); S.glowTex = tex.glow;
  const g = new THREE.Group(); g.name = 'Dispositif1';
  const y0 = groundY();

  // objet : prisme hexagonal à facettes (profil tourné à 6 pans)
  const prof = [[0.0, -0.30], [0.17, -0.25], [0.27, -0.12], [0.27, 0.12], [0.17, 0.25], [0.0, 0.30]].map(([r, h]) => new THREE.Vector2(r, h));
  const coreGeo = new THREE.LatheGeometry(prof, 6);
  S.glowMat = new THREE.MeshStandardMaterial({ map: tex.base, emissiveMap: tex.glow, emissive: new THREE.Color(0x66e8ff), emissiveIntensity: 0.0, metalness: 0.45, roughness: 0.5, flatShading: true });
  S.core = new THREE.Mesh(coreGeo, S.glowMat);
  const ringGeo = new THREE.TorusGeometry(0.36, 0.035, 6, 6); ringGeo.rotateX(Math.PI / 2);
  S.ring = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x8a6d3a, metalness: 0.9, roughness: 0.35, emissive: new THREE.Color(0xffc060), emissiveIntensity: 0, flatShading: true }));
  const holder = new THREE.Group(); holder.add(S.core, S.ring); holder.position.set(0, 0.2, 0); holder.rotation.set(0.32, 0.6, 0.18);   // posé de travers, à moitié enfoui
  g.add(holder); S.holder = holder;

  // sable et briques de banco tombées : il est presque entièrement dissimulé
  const sand = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 8), new THREE.MeshStandardMaterial({ color: 0xb38e5c, roughness: 1, flatShading: true }));
  sand.scale.set(1.25, 0.34, 1.0); sand.position.set(0.05, 0.0, 0.0); g.add(sand);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 1, flatShading: true });
  [[-0.42, 0.12, 0.18, 0.2], [0.38, 0.10, -0.3, 0.17], [-0.1, 0.1, -0.44, 0.15], [0.28, 0.2, 0.28, 0.14], [-0.34, 0.07, -0.22, 0.12], [0.02, 0.28, 0.1, 0.13]].forEach(([x, y, z, s], i) => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), stoneMat); m.position.set(x, y, z); m.rotation.set(i, i * 1.7, i * 0.6); m.scale.y = 0.7; g.add(m);
  });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.raycast = () => {}; } });
  g.position.set(POS.x, y0, POS.z);
  M.scene.add(g);
  S.group = g; S.built = true; POS.y = y0;
  console.log('[Dispositif1] caché dans la cour à', POS.toArray().map((v) => +v.toFixed(1)).join(', '));
}

/* ---------- interaction ---------- */
function prompt(show, label) {
  if (!S.prompt) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;background:rgba(45,40,34,.84);' +
      'border:1px solid rgba(160,230,255,.8);color:#eef8ff;font:700 17px "Open Sans",system-ui,sans-serif;white-space:nowrap;z-index:60;pointer-events:none;display:none;box-shadow:0 0 22px rgba(102,232,255,.35)';
    document.body.appendChild(d); S.prompt = d;
  }
  if (show) { const pad = window.GamepadKit?.connected?.(); S.prompt.innerHTML = `<kbd style="border:1px solid #a8e6ff;border-radius:8px;padding:2px 10px;margin-right:8px">${pad ? '▲' : 'E'}</kbd>${label || 'Examiner l’objet'}`; }
  S.prompt.style.display = show ? 'block' : 'none';
}

/* Séquence 5 : une projection apparaît au-dessus du dispositif — la vidéo du décollage du drone — puis s'interrompt brutalement */
const PROJ_VIDEO = 'assets/videos/intro-drone format pc.mp4';
const PROJ_MS = 5000;
function showProjection(done) {
  const vid = document.createElement('video');
  vid.src = mediaUrl('introVideo'); vid.muted = true; vid.playsInline = true; vid.loop = true; vid.preload = 'auto'; vid.crossOrigin = 'anonymous';
  const tex = new THREE.VideoTexture(vid); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: 0x9fe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.8), mat); m.renderOrder = 6; m.raycast = () => {}; m.frustumCulled = false;
  m.position.copy(S.group.localToWorld(new THREE.Vector3(0, 1.7, 0))); M.scene.add(m);
  let over = false;
  const end = () => { if (over) return; over = true; M.scene.remove(m); mat.dispose(); tex.dispose(); try { vid.pause(); vid.removeAttribute('src'); vid.load(); } catch (_) {} done && done(); };
  vid.play().catch(() => {});
  const t0 = performance.now();
  const tick = () => {
    if (over) return;
    const t = performance.now() - t0;
    if (t > PROJ_MS) return end();                                                         // coupure brutale
    const k = Math.min(1, t / 400);
    mat.opacity = k * (t > PROJ_MS - 700 ? 0.35 + 0.65 * Math.random() : 0.8 + 0.2 * Math.random());   // scintillement, de plus en plus instable avant la coupure
    m.quaternion.copy(M.camera.quaternion);
    setTimeout(tick, 40);
  };
  tick();
}

/* S2 : activation courte (illumination) ; le dialogue et la projection passent dans le laboratoire (S4-S6) */
function activate() {
  if (S.active) return;
  S.active = true; S.t = 0;
  prompt(false);
  window.GamepadKit?.toast?.('Le dispositif s’illumine…');
  window.dispatchEvent(new CustomEvent('dispositif1:active', { detail: { position: POS.toArray() } }));
}

function badge(n, text) {
  if (!S.badge) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;right:24px;top:84px;z-index:61;display:flex;flex-direction:column;gap:6px;align-items:flex-end;pointer-events:none';
    document.body.appendChild(d); S.badge = d;
  }
  if (S.badge.querySelector('[data-n="' + n + '"]')) return;
  const b = document.createElement('div'); b.dataset.n = n;
  b.style.cssText = 'padding:7px 14px;border-radius:14px;background:rgba(45,40,34,.88);border:1px solid rgba(160,230,255,.85);color:#eef8ff;font:700 14px "Open Sans",system-ui,sans-serif;' +
    'box-shadow:0 0 16px rgba(102,232,255,.4);opacity:0;transform:translateY(-8px);transition:opacity .4s,transform .4s';
  b.innerHTML = '<span style="color:#66e8ff;margin-right:8px">◈</span>' + text;
  S.badge.appendChild(b); requestAnimationFrame(() => { b.style.opacity = '1'; b.style.transform = 'none'; });
}
function take() {
  if (!S.built || S.taken || S.taking || !S.active) return;
  S.taking = 0.0001; prompt(false); S.takeFrom = S.group.localToWorld(S.holder.position.clone());
  window.GamepadKit?.rumble?.(120, 0.35);
}
function finishTake() {
  S.taken = true; S.taking = 0; S.group.visible = false;
  try { localStorage.setItem(DEV_KEY, '1'); } catch (_) {}
  badge(1, 'Dispositif 1');
  window.GamepadKit?.toast?.('Dispositif 1 récupéré');
  window.dispatchEvent(new CustomEvent('dispositif1:taken'));
  setTimeout(() => window.GamepadKit?.toast?.('🚙 Voiture débloquée'), 1500);
  // S2 : Tapama appelle par radio ; quand la bulle disparaît, la carte s'ouvre sur le cercle jaune (laboratoire) avec l'itinéraire tracé
  lsSet(ACTE, '1:d1');
  setTimeout(() => radioThen({ text: 'Super, je vois que tu l’as récupéré ! Prends le pick-up garé devant la mosquée pour me rejoindre à ces coordonnées.', mood: 'souriante', duration: 9 }, () => {
    openMapTo('deuxieme'); window.dispatchEvent(new CustomEvent('taama:carte-labo'));
  }), 900);
}
window.addEventListener('neantis:dispositif', () => badge(2, 'Dispositif 2'));

/* ==========================================================
   CHEF D'ORCHESTRE — enchaînement des scènes S2 → S14 (bible : docs/scenario-chapitre1.md)
   Modules des autres agents appelés avec repli : window.Lab.open({stage,onDone}), window.Dossier.open({onDone}), CityMap.openTo, GameUI.
   ========================================================== */
const ACTE = 'taama.acte', LAB1 = 'taama.lab1', LAB2 = 'taama.lab2', DEV2 = 'taama.dispositif2', DOSSIER = 'taama.dossier', GADGET = 'taama.gadget';
const VOL_KEY = 'taama.vol', REV_KEY = 'taama.revelation';
const STORY_KEYS = [ACTE, 'taama.d1.spotted', DEV_KEY, 'taama.piste', LAB1, 'taama.lab1.q', VOL_KEY, DOSSIER, GADGET, DEV2, LAB2, 'taama.lab2.q', REV_KEY, 'taama.chapitre1', 'taama.next'];
const CIRCLE = { x: -175.012, z: -219.890, r: 1.8, away: 6 };      // cercle jaune = labo de Tapama (même rayon que PORTAL_RADIUS) ; verrou levé à 6 m
const REV_SPOT = { x: -10.0, z: 60.0, r: 26.0 };                    // devant la mosquée (S7)
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
const emit = (n, d) => window.dispatchEvent(new CustomEvent(n, { detail: d }));
const seq = (...ns) => ns.forEach((n) => { try { window.GameUI?.completeSequence?.(n); } catch (_) {} });
const toast = (m) => window.GamepadKit?.toast?.(m);
S.labBusy = false; S.volBusy = false; S.circleLock = false; S.leaving = false;

/* Bulle radio, puis `cb` quand elle a disparu (la file radio n'émet pas d'événement : on surveille la bulle .tp-radio) ; repli minuté */
function radioThen(opts, cb) {
  const T = window.Tapama, dur = (opts.duration || 8) * 1000;
  let fin = false, iv = 0;
  const done = () => { if (fin) return; fin = true; clearInterval(iv); try { cb && cb(); } catch (e) { console.warn('[histoire]', e); } };
  const pushed = !!(T && T.radio && T.radio(opts));
  const t0 = performance.now();
  iv = setInterval(() => {
    const t = performance.now() - t0;
    if (!pushed ? t > dur : (t > 1500 && !document.querySelector('.tp-radio.on')) || t > dur * 4 + 20000) done();
  }, 300);
}

/* Écran plein (labo, dossier) : le jeu 3D est gelé (sanctuary-mode.js : __storyFreeze), plus de manette, plus de carte */
let dayWasRunning = false;
function freeze(on) {
  if (on) { try { window.CityMap?.close?.(); } catch (_) {} try { document.exitPointerLock?.(); } catch (_) {} }
  window.__storyFreeze = !!on;
  window.GamepadKit?.capture?.(!!on);
  // le monde reste EXACTEMENT comme le joueur l'a laissé : heure du jour figée, voiture muette (position / conduite conservées), rien n'est déplacé
  try {
    const D = window.DayCycle;
    if (on) { dayWasRunning = !!(D && D.running); D?.pause?.(); } else if (dayWasRunning) { D?.resume?.(); dayWasRunning = false; }
    window.Vehicle?.pause?.(on);
  } catch (_) {}
}
let veilEl = null;                                                   // fondu au noir (transition vers / depuis le labo)
function veil(on, ms = 550) {
  if (!veilEl) { veilEl = document.createElement('div'); veilEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;z-index:99990'; document.body.appendChild(veilEl); }
  veilEl.style.transition = `opacity ${ms}ms ease`; veilEl.style.pointerEvents = on ? 'auto' : 'none';
  requestAnimationFrame(() => { veilEl.style.opacity = on ? '1' : '0'; });
  return new Promise((r) => setTimeout(r, ms + 60));
}
function openMapTo(id) {
  const CM = window.CityMap; if (!CM) return;
  if (CM.openTo) CM.openTo(id); else { CM.open(); CM.selectPlace(id); }
}
/* S3/S4 — entrée dans le cercle jaune : fondu, gel du jeu, scène du labo (Lab.open) */
function tryEnterLab() {
  S.circleLock = true;                                               // pas de re-déclenchement tant que le joueur n'a pas quitté le cercle de 6 m
  if (lsGet(DEV_KEY) !== '1') { toast('Il te manque le dispositif : retourne le chercher sur le toit de la mosquée.'); return; }
  if (lsGet(LAB1) !== 'done') return enterLab(1);
  if (lsGet(DEV2) === '1' && lsGet(LAB2) !== 'done') return enterLab(2);   // stade 2 : seulement avec le dispositif 2 (S11-S12)
}
function enterLab(stage) {
  S.labBusy = true;
  emit(stage === 2 ? 'taama:arrive-labo2' : 'taama:arrive-labo');
  lsSet(stage === 2 ? LAB2 : LAB1, 'open');
  veil(true).then(() => {
    freeze(true);
    const done = () => leaveLab(stage);
    if (window.Lab?.open) {
      try { window.Lab.open({ stage, onDone: done }); } catch (e) { console.warn('[Lab]', e); done(); return; }
      veil(false, 500);
    } else { toast('Laboratoire de Tapama indisponible : scène ignorée.'); setTimeout(done, 700); }
  });
}
/* S6 (fin labo 1) / S13-S14 (fin labo 2) : le joueur réapparaît ; l'histoire avance */
function leaveLab(stage) {
  if (S.leaving) return; S.leaving = true;
  veil(true, 150).then(() => {
    // le joueur retrouve le jeu comme il l'a laissé : même position, même voiture, même heure (aucune téléportation ni déplacement de la voiture)
    if (stage === 1) {
      lsSet(LAB1, 'done'); lsSet('taama.piste', '1'); lsSet(ACTE, '2:fin');
      seq(5, 6); emit('dispositif1:piste');
    } else {
      lsSet(LAB2, 'done'); lsSet(REV_KEY, '1'); lsSet('taama.chapitre1', 'done'); lsSet('taama.next', 'bandiagara');
      seq(11, 12, 13); emit('taama:chapitre1-fin');   // la séquence 12 (« La menace demeure ») est facultative dans le scénario : on la clôt avec la fin du chapitre
    }
    freeze(false); S.labBusy = false; S.leaving = false;
    veil(false, 700);
    if (stage === 2) setTimeout(() => { try { window.GameUI?.show?.('carte'); } catch (e) { console.warn('[GameUI]', e); } }, 900);   // S14 : carte des destinations, Bandiagara
  });
}
/* le cercle déclenche à pied comme au volant (portée élargie en voiture : le point suivi est le siège) */
M?.addFrameHook(() => {
  if (S.labBusy) return;
  const sm = window.SanctuaryMode, pp = sm && sm.isActive && sm.isActive() ? sm.playerPosition() : null;
  if (!pp) return;
  const d = Math.hypot(pp.x - CIRCLE.x, pp.z - CIRCLE.z);
  if (S.circleLock) { if (d > CIRCLE.away) S.circleLock = false; return; }
  if (d >= CIRCLE.r + (window.Vehicle?.state === 'drive' ? 1.2 : 0)) return;
  if (window.Tapama?.isBusy?.() || window.CityMap?.isOpen) return;
  tryEnterLab();
});

/* S7 — retour devant la mosquée après le labo 1 : le vol a eu lieu « hors-champ » ; radio, puis dossier NÉANTIS (S8), gadget et carte vers la base.
   Reprise : si le vol est fait mais pas le dossier (rechargement), le dossier est rouvert. API : Dispositif1.stealDevice2() = doVol(). */
function doVol() {
  if (lsGet(VOL_KEY) === '1' || S.volBusy) return;
  S.volBusy = true; lsSet(VOL_KEY, '1'); lsSet(ACTE, '3:vol');
  window.GamepadKit?.rumble?.(160, 0.5);
  toast('⚠️ NÉANTIS a emporté le deuxième dispositif !');
  emit('neantis:vol'); seq(7);
  setTimeout(() => radioThen({ text: '{nom}… un groupe est passé juste avant toi. Ils ont emporté le second dispositif. J’ai vu leurs images sur mon écran.', mood: 'inquiete', duration: 10 }, openDossier), 1200);
}
function openDossier() {
  S.volBusy = true; freeze(true);
  let fin = false;
  const done = () => {
    if (fin) return; fin = true;
    lsSet(DOSSIER, '1'); lsSet(GADGET, '1'); lsSet(ACTE, '3:base');   // gadget débloqué (sanctuary-mode.js lit taama.gadget)
    freeze(false); S.volBusy = false;
    toast('Gadget débloqué : clic droit pour viser, clic pour neutraliser');
    setTimeout(() => { openMapTo('neantis'); emit('taama:carte-base'); }, 500);
  };
  if (window.Dossier?.open) { try { window.Dossier.open({ onDone: done }); } catch (e) { console.warn('[Dossier]', e); done(); } }
  else { toast('Dossier NÉANTIS indisponible : scène ignorée.'); setTimeout(done, 700); }
}
setInterval(() => {
  if (lsGet(LAB1) !== 'done' || S.volBusy || S.labBusy || lsGet(DOSSIER) === '1') return;
  const sm = window.SanctuaryMode;
  if (!(sm && sm.isActive && sm.isActive()) || window.Tapama?.isBusy?.() || window.CityMap?.isOpen) return;
  if (lsGet(VOL_KEY) === '1') { openDossier(); return; }            // reprise de partie
  const pp = sm.playerPosition && sm.playerPosition();
  if (pp && Math.hypot(pp.x - REV_SPOT.x, pp.z - REV_SPOT.z) <= REV_SPOT.r && pp.y <= 12) doVol();
}, 700);

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat && S.prompt && S.prompt.style.display === 'block' && S.lock <= 0 && S.act) { S.lock = 0.6; S.act(); e.stopImmediatePropagation(); }
}, true);

let acc = 0;
M?.addFrameHook((dt) => {
  if (!S.built) {
    acc += dt;
    if (acc > 1 && M.loaded) { try { build(); if (readTaken()) { S.taken = true; S.group.visible = false; badge(1, 'Dispositif 1'); } if (lsGet('taama.dispositif2') === '1') badge(2, 'Dispositif 2'); } catch (e) { acc = -999; console.warn('[Dispositif1]', e); } }
    return;
  }
  S.lock = Math.max(0, S.lock - dt);
  if (S.taken) return;
  if (S.taking) {                                                // l'objet vole vers le joueur en rétrécissant
    S.taking += dt / 0.9;
    const sm0 = window.SanctuaryMode, tp = sm0 && sm0.playerPosition && sm0.playerPosition();
    const k = Math.min(1, S.taking), e = k * k * (3 - 2 * k);
    const to = tp ? new THREE.Vector3(tp.x, tp.y - 0.7, tp.z) : S.takeFrom.clone().add(new THREE.Vector3(0, 1.5, 0));
    const cur = S.takeFrom.clone().lerp(to, e); cur.y += Math.sin(k * Math.PI) * 0.6;
    S.group.worldToLocal(cur); S.holder.position.copy(cur); S.holder.scale.setScalar(1 - 0.85 * e);
    S.holder.rotation.y += dt * 9; S.glowMat.emissiveIntensity = 2.6;
    if (k >= 1) finishTake();
    return;
  }
  // lumière : éteinte (juste un reflet) tant qu'il n'est pas activé ; 1 une fois activé
  const target = S.active ? 1 : 0;
  S.glow += (target - S.glow) * Math.min(1, dt * 1.6);
  const pulse = S.active ? 0.78 + 0.22 * Math.sin(S.t * 3.2) : 0;
  S.t += dt;
  S.glowMat.emissiveIntensity = S.glow * (1.2 + 1.6 * pulse);
  S.ring.material.emissiveIntensity = S.glow * 1.2;
  if (S.active) {
    S.holder.rotation.y += dt * 0.9 * S.glow; S.ring.rotation.y -= dt * 1.8 * S.glow;
    S.holder.position.y += (0.55 - S.holder.position.y) * Math.min(1, dt * 0.9);          // se soulève doucement
    S.holder.rotation.x += (0 - S.holder.rotation.x) * Math.min(1, dt * 1.2); S.holder.rotation.z += (0 - S.holder.rotation.z) * Math.min(1, dt * 1.2);
  }
  const sm = window.SanctuaryMode, pp = sm && sm.playerPosition ? sm.playerPosition() : null;
  const near = !!(pp && Math.hypot(pp.x - POS.x, pp.z - POS.z) < REACH && Math.abs(pp.y - 1.7 - POS.y) < 2.2);
  let label = null; S.act = null;
  if (near) { label = S.active ? 'Récupérer le dispositif' : 'Examiner l’objet'; S.act = S.active ? take : activate; }
  prompt(!!label, label || '');
  if (label && S.lock <= 0 && window.GamepadKit?.justPressed?.('Y')) { S.lock = 0.6; S.act(); }
});

window.Dispositif1 = {
  get position() { return POS; }, get built() { return S.built; }, get active() { return S.active; },
  activate, take, stealDevice2: doVol, radioThen,
  get taken() { return S.taken; },
  get busy() { return S.labBusy || S.volBusy; },
  reset() {
    STORY_KEYS.forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
    S.labBusy = S.volBusy = S.circleLock = S.leaving = false; freeze(false); if (veilEl) { veilEl.style.opacity = '0'; veilEl.style.pointerEvents = 'none'; }
    if (S.badge) S.badge.innerHTML = ''; S.taken = false; S.taking = 0; if (S.group) S.group.visible = true; if (S.holder) S.holder.scale.setScalar(1); S.active = false; S.glow = 0;
    if (S.holder) { S.holder.position.y = 0.2; S.holder.rotation.set(0.32, 0.6, 0.18); }
    window.dispatchEvent(new CustomEvent('taama:reset'));
  },
};
