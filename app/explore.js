/* ==========================================================
   EXPLORATION LIBRE — découverte de la ville et de la mosquée (bouton du menu principal)
   ----------------------------------------------------------
   Affiche la maquette 3D (vue d'ensemble) SANS les boutons GAME / SANCTUAIRE / MENU ni la carte : seuls restent le bouton AR et le
   menu à trois traits (en bas à droite). Les lieux de Djenné y sont signalés par des bulles reliées au sol par un trait.
     • souris : glisser = tourner · molette = zoomer · clic droit / Maj + glisser = déplacer (OrbitControls)
     • écran tactile : un doigt = tourner · pincement = zoomer · deux doigts = déplacer
     • manette : stick droit = tourner · stick gauche = se déplacer · RT/LT ou croix haut/bas = zoomer · R3 = vue d'ensemble
     • clic / toucher sur une bulle : la caméra s'approche du lieu et sa description s'affiche
     • Échap, B ou START : retour au menu principal
   Emplacements : coordonnées réelles (OpenStreetMap, voir city-routes.js) converties dans le repère du jeu.
   ========================================================== */
import * as THREE from 'three';
import { PLACES } from './city-routes.js?v=1';

const M = window.MosqueScene;
const K = 0.84, CB_X = -12.0, CB_Y = 5.2;
const realToGame = (e, n) => ({ x: n / K + CB_X, z: e / K - CB_Y });          // inverse de city-map.js : gameToReal

const S = { active: false, root: null, labels: [], sols: null, t: 0, selected: null, bar: null };
const _v = new THREE.Vector3(), _c = new THREE.Vector3();

function groundAt(x, z) {
  if (!S.sols) { S.sols = []; M.scene.traverse((o) => { if (o.isMesh && /^Sol_/.test(o.name)) S.sols.push(o); }); }
  if (!S.sols.length) return 5.0;
  const rc = groundAt.rc || (groundAt.rc = new THREE.Raycaster()); rc.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0)); rc.far = 900;
  const h = rc.intersectObjects(S.sols, false); return h.length ? h[0].point.y : 5.0;
}

function placesList() {
  const l = [];
  for (const p of PLACES) {
    if (Math.hypot(p.e, p.n) > 1450) continue;                                 // hors de la maquette 3D
    const g = realToGame(p.e, p.n);
    l.push({ id: p.id, name: p.id === 'mosquee' ? 'Grande Mosquée' : p.short, info: p.info, x: g.x, z: g.z, lift: p.id === 'mosquee' ? 30 : 8, key: p.id === 'mosquee' || p.id === 'marche' });
  }
  const nb = window.NeantisBase;
  if (nb && nb.loaded) l.push({ id: 'neantis', name: 'Zone NÉANTIS', info: 'Complexe fictif du groupe NÉANTIS : le dispositif y est gardé.', x: nb.center.x, z: nb.center.z, lift: 14, key: false });
  return l;
}

function build() {
  S.root = document.createElement('div'); S.root.id = 'exploreLabels';
  document.body.appendChild(S.root);
  for (const p of placesList()) {
    const el = document.createElement('div'); el.className = 'xl';
    el.innerHTML = '<button type="button" class="xl-pill"><b></b><span class="xl-info"></span></button><i class="xl-stem"></i><i class="xl-dot"></i>';
    el.querySelector('b').textContent = p.name; el.querySelector('.xl-info').textContent = p.info || '';
    el.querySelector('.xl-pill').addEventListener('click', (e) => { e.stopPropagation(); select(p.id); });
    S.root.appendChild(el);
    const y = groundAt(p.x, p.z);
    S.labels.push({ p, el, pos: new THREE.Vector3(p.x, y + 1.5, p.z), top: new THREE.Vector3(p.x, y + p.lift, p.z), w: 0, level: 0 });
  }
}

function select(id) {
  const L = S.labels.find((q) => q.p.id === id); if (!L) return;
  S.selected = S.selected === id ? null : id;
  S.labels.forEach((q) => q.el.classList.toggle('sel', q.p.id === S.selected));
  if (!S.selected) return;
  const away = new THREE.Vector3(-0.55, 0, -0.83);                                // on arrive du sud-ouest, en plongée
  const dist = id === 'mosquee' ? 150 : 110, up = id === 'mosquee' ? 80 : 60;
  const tgt = new THREE.Vector3(L.p.x, L.pos.y + (id === 'mosquee' ? 12 : 3), L.p.z);
  const dest = tgt.clone().addScaledVector(away, dist); dest.y = tgt.y + up;
  M.flyTo && M.flyTo(dest, tgt, 1.8);
  setTimeout(() => { if (S.selected === id) { S.selected = null; S.labels.forEach((q) => q.el.classList.remove('sel')); } }, 9000);
}

function update() {
  const cam = M.camera, W = window.innerWidth, H = window.innerHeight;
  const placed = [];
  const order = S.labels.map((L) => { L.dist = cam.position.distanceTo(L.pos); return L; }).sort((a, b) => a.dist - b.dist);
  for (const L of order) {
    _v.copy(L.pos).project(cam); _c.copy(L.top).project(cam);
    const behind = _v.z > 1 || _v.z < -1 || L.dist > 2600;
    const x = (_v.x * 0.5 + 0.5) * W, y = (-_v.y * 0.5 + 0.5) * H;
    if (behind || x < -80 || x > W + 80 || y < -40 || y > H + 40) { L.el.style.display = 'none'; continue; }
    L.el.style.display = '';
    const s = Math.max(0.72, Math.min(1.25, 1.3 - L.dist / 2400));
    const pillW = (L.p.name.length * 8.2 + 26) * s, pillH = 28 * s;
    // tige : au moins jusqu'au point haut projeté, rallongée par paliers tant que la bulle en recouvre une autre
    const base = Math.max(30, Math.min(160, y - ((-_c.y * 0.5 + 0.5) * H)));
    let level = 0, stem = base;
    for (; level < 6; level++) {
      stem = base + level * (pillH + 6);
      const r = { l: x - pillW / 2, r: x + pillW / 2, t: y - stem - pillH, b: y - stem };
      if (!placed.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t)) { placed.push(r); break; }
      if (level === 5) placed.push(r);
    }
    L.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    L.el.style.setProperty('--stem', `${(stem / s).toFixed(1)}px`);
    L.el.style.zIndex = String(1000 - Math.round(L.dist));
    L.el.classList.toggle('near', L.dist < 380);
  }
}

function leaveHint() {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'xl-leave'; b.textContent = 'Échap · Menu principal';
  b.addEventListener('click', stop); document.body.appendChild(b); S.bar = b;
}

export function start() {
  if (S.active || !M || !M.loaded) return false;
  S.active = true;
  document.body.classList.add('mode-explore');
  if (!S.root) { try { build(); } catch (e) { console.warn('[explore]', e); } }
  if (!S.bar) leaveHint(); S.bar.style.display = '';
  S.root.style.display = '';
  const ui = document.querySelector('.mq-ui'); ui && ui.classList.remove('dg-hidden');
  M.controls.enabled = true; M.controls.maxPolarAngle = Math.PI * 0.495; M.setAutoRotate && M.setAutoRotate(false);
  M.controls.minDistance = 12;
  const dc = window.DayCycle; if (dc && typeof dc.sunElevation === 'number' && dc.sunElevation < 25 && dc.setTime) dc.setTime(12);   // exploration de jour : lieux bien lisibles, sans brume d'aube
  // vue large sur la ville, depuis le sud, en plongée
  M.flyTo && M.flyTo(new THREE.Vector3(-420, 330, 260), new THREE.Vector3(0, 5, 0), 2.4);
  M.resumeLoop && M.resumeLoop();
  window.dispatchEvent(new CustomEvent('explore:start'));
  return true;
}

export function stop() {
  if (!S.active) return;
  S.active = false;
  document.body.classList.remove('mode-explore');
  if (S.root) S.root.style.display = 'none';
  if (S.bar) S.bar.style.display = 'none';
  S.selected = null; S.labels.forEach((q) => q.el.classList.remove('sel'));
  window.ARHand?.active && window.ARHand.stop();
  window.dispatchEvent(new CustomEvent('explore:stop'));
  window.GameUI?.show?.('main');
}

window.addEventListener('keydown', (e) => {
  if (S.active && e.key === 'Escape' && !window.ARHand?.active && !document.querySelector('.mq-menu-wrap.is-open, .mq-ui.info-open, #mosqueVideo.open')) { e.preventDefault(); e.stopImmediatePropagation(); stop(); }
}, true);

M?.addFrameHook(() => {
  if (!S.active) return;
  update();
  const GP = window.GamepadKit;
  if (GP && GP.connected && GP.connected() && !window.ARHand?.active && !(window.GameUI && window.GameUI.isOpen && window.GameUI.isOpen())) {
    if (GP.justPressed('START') || GP.justPressed('B')) stop();
  }
});

window.Explore = { start, stop, get active() { return S.active; }, select };
