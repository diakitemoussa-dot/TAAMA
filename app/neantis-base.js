/* ==========================================================
   BASE DE NÉANTIS — complexe fictif au nord-ouest de Djenné
   ----------------------------------------------------------
   Modèle : assets/models/neantis-base.glb (voir docs/superpowers/specs/2026-10-31-base-neantis-design.md),
   déjà recalé dans le repère du jeu. Chargé avec la ville v2.
   • de nuit : bandes et emblème bleus plus lumineux, halos aux ancres `Glow_*`, deux vraies lumières bleues ;
   • collisions : le drone traite tous les maillages comme obstacles ; le sanctuaire ajoute `Neantis_*` (sanctuary-mode.js) ;
   • intérieur du centre de contrôle : portes coulissantes automatiques (Neantis_Porte_<id>_<vantail>) qui s'ouvrent quand le
     joueur à pied approche (Anchor_Porte_<id>, PorteDir_<id>_<vantail> donnent le sens et la course) ; leur collision suit
     le vantail. Au fond de la chambre forte, le « Dispositif » flotte sur son socle : E (clavier) ou Y (manette) pour le récupérer.
   • API : window.NeantisBase { loaded, root, center, anchor(nom), anchors, deviceTaken, resetDevice() } — points d'ancrage
     (Anchor_Portail, Anchor_PorteService, Anchor_PorteStockage, Anchor_Patrouille_*, Anchor_Alarme, Anchor_DockDrone, Anchor_Dispositif).
     Événement window « neantis:dispositif » quand le dispositif est récupéré.
   Fiction : NÉANTIS et sa base n'existent pas à Djenné.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const M = window.MosqueScene;
const URL = 'assets/models/neantis-base.glb?v=9';
const DRACO = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';
const BLUE_HALO = 0x4aa8ff;

const state = { loaded: false, root: null, center: new THREE.Vector3(), anchors: {}, requested: false };
let emissive = [];             // { mat, day, night }
let halos = [], lights = [], level = -1, haloMats = [];
const OPEN_R = 4.4, CLOSE_R = 5.6, DOOR_TIME = 0.7;      // m (unités du jeu) : ouverture, refermeture (hystérésis), durée de la course
const DOOR_R = { Portail: 11, Service: 5.5 };               // portées propres aux grandes portes (ouverture ; fermeture = +1,2)
const TAKE_R = 3.2;                                       // portée de ramassage du dispositif
const doors = {};                                         // id -> { anchor, leaves:[{node, base, delta}], amt, open }
let device = null, deviceBase = 0, deviceHalo = null, promptEl = null;

function nightLevel() {
  if (window.CityLights && typeof window.CityLights.level === 'number' && window.CityLights.level >= 0) return window.CityLights.level;
  const dc = window.DayCycle; if (!dc) return 0;
  const e = typeof dc.sunElevation === 'number' ? dc.sunElevation : null;
  if (e === null) return (dc.now() >= 18.4 || dc.now() < 5.6) ? 1 : 0;
  const t = Math.min(1, Math.max(0, (5 - e) / 9)); return t * t * (3 - 2 * t);
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(210,235,255,1)'); grad.addColorStop(0.2, 'rgba(110,180,255,.55)');
  grad.addColorStop(0.55, 'rgba(60,130,255,.14)'); grad.addColorStop(1, 'rgba(40,100,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const DOOR_RE = /^Neantis_Porte_([^_]+)_([^_]+)$/;
function setupInterior(root) {
  // vantaux : on déplace le nœud de plus haut niveau (le maillage à deux matériaux est un groupe dont les enfants portent le même nom)
  root.traverse((o) => {
    const m = DOOR_RE.exec(o.name || ''); if (!m) return;
    if (o.parent && DOOR_RE.test(o.parent.name || '')) return;
    const [, id, leaf] = m;
    const dirA = state.anchors[`PorteDir_${id}_${leaf}`]; if (!dirA) return;
    const par = o.parent;
    const tgt = par.worldToLocal(dirA.clone());
    const d = (doors[id] = doors[id] || { anchor: state.anchors[`Anchor_Porte_${id}`], leaves: [], amt: 0, open: false });
    d.leaves.push({ node: o, base: o.position.clone(), delta: tgt.sub(o.position) });
  });
  device = root.getObjectByName('Dispositif') || null;
  if (device) {
    deviceBase = device.position.y;
    device.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.raycast = () => {}; } });
  }
  // lumière intérieure : trois sources bleutées (nombre constant)
  const maxBase = window.Quality ? window.Quality.preset.baseLights : 3;     // palier économique : 1 seule lumière intérieure
  let nBase = 0;
  for (const nm of ['Anchor_Light_Ecrans', 'Anchor_Light_Sas', 'Anchor_Light_Coffre']) {
    const p = state.anchors[nm]; if (!p || nBase >= maxBase) continue; nBase++;
    const L = new THREE.PointLight(0x7fb8ff, 70, 24, 2); L.position.copy(p); L.castShadow = false;
    M.scene.add(L);
  }
}

function playerPos() {
  const sm = window.SanctuaryMode;
  return sm && sm.playerPosition ? sm.playerPosition() : null;
}

function updateDoors(dt, pp) {
  for (const id in doors) {
    const d = doors[id]; if (!d.anchor) continue;
    let near = false;
    if (pp) {
      const dx = pp.x - d.anchor.x, dz = pp.z - d.anchor.z, dy = Math.abs(pp.y - d.anchor.y);
      const r = Math.hypot(dx, dz);
      const open_r = DOOR_R[id] || OPEN_R;
      near = dy < 6 && r < (d.open ? open_r + 1.2 : open_r);
    }
    d.open = near;
    const target = near ? 1 : 0;
    if (d.amt === target) continue;
    d.amt += Math.sign(target - d.amt) * Math.min(Math.abs(target - d.amt), dt / DOOR_TIME);
    const e = d.amt * d.amt * (3 - 2 * d.amt);                   // départ et arrivée doux
    for (const l of d.leaves) { l.node.position.copy(l.base).addScaledVector(l.delta, e); l.node.updateMatrixWorld(true); }
  }
}

function showPrompt(on) {
  if (!promptEl) {
    promptEl = document.createElement('div');
    promptEl.style.cssText = 'position:fixed;left:50%;bottom:16%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;' +
      'background:rgba(20,28,48,.82);border:1px solid rgba(110,180,255,.8);color:#e8f2ff;font:700 18px "Open Sans",system-ui,sans-serif;' +
      'letter-spacing:.02em;z-index:60;pointer-events:none;display:none;box-shadow:0 0 24px rgba(74,168,255,.45)';
    promptEl.innerHTML = '<kbd style="border:1px solid #9ccaff;border-radius:8px;padding:2px 10px;margin-right:10px">E</kbd>Récupérer le dispositif';
    document.body.appendChild(promptEl);
  }
  promptEl.style.display = on ? 'block' : 'none';
}

function takeDevice() {
  if (state.deviceTaken || !device) return;
  state.deviceTaken = true; device.visible = false; showPrompt(false);
  try { localStorage.setItem('taama.dispositif2', '1'); } catch (_) {}
  window.GamepadKit?.toast?.('Dispositif récupéré !');
  window.GamepadKit?.rumble?.(220, 0.6);
  // S10 (bible) : un document près du dispositif mentionne plusieurs emplacements ; Tapama réagit (séquence 10)
  setTimeout(() => window.GamepadKit?.toast?.('📄 « Ils connaissaient déjà les autres emplacements. Ce n’est pas une découverte accidentelle. »'), 700);
  setTimeout(() => {
    try { window.GameUI?.completeSequence?.(10); } catch (_) {}
    window.Tapama?.radio?.({ text: 'Alors ils ne sont pas là pour revendre un objet, {nom}. Ils cherchent quelque chose de précis.', mood: 'attentive', duration: 8 });
  }, 2200);
  // S11 : « Rejoins-moi » ; à la disparition de la bulle, la carte s'ouvre avec l'itinéraire vers le cercle jaune (labo de Tapama)
  setTimeout(() => {
    const call = { text: 'Tu l’as ! Rejoins-moi, {nom}. Je t’affiche le chemin jusqu’à chez moi.', mood: 'souriante', duration: 8 };
    const go = () => { try { localStorage.setItem('taama.acte', '3:retour'); } catch (_) {} const CM = window.CityMap; if (CM) { if (CM.openTo) CM.openTo('deuxieme'); else { CM.open(); CM.selectPlace('deuxieme'); } } };
    if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(call, go); else { window.Tapama?.radio?.(call); setTimeout(go, 10000); }
  }, 2400);
  window.dispatchEvent(new CustomEvent('neantis:dispositif', { detail: { position: device.getWorldPosition(new THREE.Vector3()).toArray() } }));
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat && promptEl && promptEl.style.display === 'block') { takeDevice(); e.stopImmediatePropagation(); }
}, true);

/* S9/S10 : approche de la base (une fois le gadget débloqué, avant le dispositif 2) ; séquences 8 puis 9 */
const story = { s9: false, s10: false };
function tickApproach(pp) {
  if (!pp || state.deviceTaken) return;
  let gad = false, d2 = false; try { gad = localStorage.getItem('taama.gadget') === '1'; d2 = localStorage.getItem('taama.dispositif2') === '1'; } catch (_) {}
  if (!gad || d2) return;
  const por = state.anchors.Anchor_Portail, ent = state.anchors.Anchor_Porte_Entree;
  if (!story.s9 && por && Math.hypot(pp.x - por.x, pp.z - por.z) < 70) {
    story.s9 = true;
    window.Tapama?.radio?.({ text: 'Ralentis avant le portail, {nom}. Gare-toi et continue à pied. Leurs drones balaient la zone.', mood: 'inquiete', duration: 8 });
    try { window.GameUI?.completeSequence?.(8); } catch (_) {}
  }
  if (!story.s10 && ent && Math.hypot(pp.x - ent.x, pp.z - ent.z) < 9) {
    story.s10 = story.s9 = true;
    window.Tapama?.radio?.({ text: 'Je te vois. Reste dans l’ombre. Quand un drone N s’approche, vise-le et tire : il se met en veille quelques secondes.', mood: 'attentive', duration: 9 });
    try { window.GameUI?.completeSequence?.(9); } catch (_) {}
  }
}

let tAnim = 0;
function updateDevice(dt, pp) {
  if (!device || state.deviceTaken) return;
  tAnim += dt;
  device.rotation.y += dt * 1.1;
  device.position.y = deviceBase + Math.sin(tAnim * 1.6) * 0.12;
  const a = state.anchors.Anchor_Dispositif;
  const near = !!(pp && a && Math.hypot(pp.x - a.x, pp.z - a.z) < TAKE_R && Math.abs(pp.y - a.y) < 4);
  showPrompt(near);
  if (near && window.GamepadKit?.justPressed?.('Y')) takeDevice();
}

function build(gltf) {
  const root = gltf.scene; root.name = 'NeantisBase';
  M.scene.add(root); root.updateMatrixWorld(true);
  const big = [], small = [];
  const emissiveSeen = new Set();
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = !/Socle/i.test(o.name); o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m && m.emissive && !emissiveSeen.has(m)) {
          emissiveSeen.add(m);
          if (/Bleu/i.test(m.name)) emissive.push({ mat: m, day: 0.45, night: 2.4 });
          else if (/Verre/i.test(m.name)) emissive.push({ mat: m, day: 0.15, night: 1.3 });
        }
      });
    } else if (o.name) {
      const p = new THREE.Vector3(); o.getWorldPosition(p);
      state.anchors[o.name] = p;
      if (/^Glow_(Emblem|Portail|Dock|Dispositif)/.test(o.name)) big.push(p); else if (/^Glow_/.test(o.name)) small.push(p);
    }
  });
  state.anchors.Anchor_Centre && state.center.copy(state.anchors.Anchor_Centre);
  setupInterior(root);
  const tex = glowTexture();
  const mk = (pts, size) => {
    if (!pts.length) return;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.PointsMaterial({ map: tex, size, sizeAttenuation: true, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, color: BLUE_HALO });
    const pt = new THREE.Points(geo, mat); pt.frustumCulled = false; pt.raycast = () => {}; pt.visible = false;
    M.scene.add(pt); halos.push(pt); haloMats.push(mat);
  };
  mk(big, 26); mk(small, 13);
  // deux vraies lumières bleues (nombre constant : pas de recompilation de shader)
  for (const nm of ['Glow_Emblem', 'Glow_Portail']) {
    const p = state.anchors[nm]; if (!p) continue;
    const L = new THREE.PointLight(BLUE_HALO, 0, 55, 2); L.position.copy(p); L.castShadow = false;
    L.visible = !window.Quality || window.Quality.preset.baseLights >= 3;   // halos bleus : sprites seulement sur le palier économique
    M.scene.add(L); lights.push(L);
  }
  state.root = root; state.loaded = true;
  console.log('[NÉANTIS] base chargée, centre', state.center.toArray().map((v) => Math.round(v)).join(', '));
}

let acc = 0;
M?.addFrameHook((dt) => {
  if (!state.requested) {
    acc += dt;
    if (acc < 0.5 || !M.loaded || !M.newCity) return;
    state.requested = true;
    const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    loader.load(URL, build, undefined, (e) => console.warn('[NÉANTIS] base indisponible :', e));
    return;
  }
  if (!state.loaded) return;
  const pp = playerPos();
  updateDoors(dt, pp);
  updateDevice(dt, pp);
  tickApproach(pp);
  const f = nightLevel();
  if (Math.abs(f - level) < 0.004) return;
  level = f;
  for (const e of emissive) e.mat.emissiveIntensity = e.day + (e.night - e.day) * f;
  for (const h of haloMats) h.opacity = 0.9 * f;
  for (const h of halos) h.visible = f > 0.01;
  for (const L of lights) L.intensity = 160 * f;
});

// raccourci « aller à la base » : devant l'entrée (à pied en sanctuaire, sinon caméra de survol à ~60 m)
function goTo() {
  const ent = state.anchors.Anchor_Porte_Entree, dev = state.anchors.Anchor_Dispositif;
  if (!state.loaded || !ent || !dev) return false;
  const dx = dev.x - ent.x, dz = dev.z - ent.z, l = Math.hypot(dx, dz) || 1;
  const ux = dx / l, uz = dz / l;
  const sm = window.SanctuaryMode;
  if (sm && sm.isActive && sm.isActive() && sm.debugTeleport) { sm.debugTeleport(ent.x - ux * 7, ent.y + 1.7, ent.z - uz * 7); return true; }
  const pos = new THREE.Vector3(ent.x - ux * 55, ent.y + 22, ent.z - uz * 55), tgt = new THREE.Vector3(state.center.x, state.center.y + 4, state.center.z);
  if (M.flyTo) M.flyTo(pos, tgt, 2.2); else { M.camera.position.copy(pos); M.controls.target.copy(tgt); }
  return true;
}

window.NeantisBase = {
  get loaded() { return state.loaded; },
  get root() { return state.root; },
  get center() { return state.center; },                     // THREE.Vector3 (repère du jeu)
  get anchors() { return state.anchors; },
  anchor(name) { return state.anchors[name] || null; },
  get deviceTaken() { return !!state.deviceTaken; },
  goTo,
  resetDevice() {                                              // remise à zéro de l'histoire côté base (clés taama.* du chapitre 1)
    state.deviceTaken = false; story.s9 = story.s10 = false; if (device) device.visible = true;
    ['taama.acte', 'taama.d1.spotted', 'taama.dispositif1', 'taama.piste', 'taama.lab1', 'taama.lab1.q', 'taama.vol', 'taama.dossier', 'taama.gadget', 'taama.dispositif2', 'taama.lab2', 'taama.lab2.q', 'taama.revelation', 'taama.chapitre1', 'taama.next']
      .forEach((k) => { try { localStorage.removeItem(k); } catch (_) {} });
  },
  get doors() { const o = {}; for (const id in doors) o[id] = { open: doors[id].open, amt: +doors[id].amt.toFixed(2) }; return o; },
};
