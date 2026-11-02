/* ==========================================================
   EAU — détection de la surface du fleuve + effets (éclaboussures, ondes, sillage)
   ----------------------------------------------------------
   · surfaceAt(x, z)  : hauteur Y de la surface du fleuve (River.mesh) en (x, z), ou null hors de l'eau.
                        Grille grossière des triangles d'eau (rejet immédiat hors fleuve) + raycast vertical avec cache 0,25 s.
   · depthAt(x, z, groundY) : profondeur = surface − sol.
   · effets partagés joueur / voiture : splash, footSplash, wake, ripple, vehicleFx.
   Performance : un seul Points (gouttelettes) + un seul InstancedMesh (ondes), pools réutilisés (aucune allocation par image),
   aucune lumière, matériaux simples ; travail arrêté à plus de 80 m du fleuve. Aucun son.
   API : window.WaterFx
   ========================================================== */
import * as THREE from 'three';
import * as L from './water-logic.js?v=1';
import { detectQuality } from './device-quality.js?v=5';

const M = window.MosqueScene;
const LEVEL = (() => { try { return window.Quality?.level || detectQuality(); } catch (_) { return 'mid'; } })();
const NP = L.particleBudget(LEVEL), NR = L.ringBudget(LEVEL);
const FAR = 80;                                         // m : au-delà du fleuve, on ne fait rien

/* ---------- grille des triangles d'eau (rejet rapide) ---------- */
const CELL = 10;
let _grid = null, _gridMesh = null, _top = 0, _bottom = 0;
const cellKey = (cx, cz) => (cx + 2000) * 4096 + (cz + 2000);
function ensureGrid() {
  const mesh = window.River && window.River.mesh;
  if (!mesh || !mesh.geometry) return false;
  if (_gridMesh === mesh) return true;
  const pos = mesh.geometry.attributes.position; if (!pos) return false;
  const idx = mesh.geometry.index;
  mesh.updateWorldMatrix(true, false);
  const mw = mesh.matrixWorld, v = new THREE.Vector3();
  const n = pos.count, wx = new Float32Array(n), wy = new Float32Array(n), wz = new Float32Array(n);
  let top = -Infinity, bot = Infinity;
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mw); wx[i] = v.x; wy[i] = v.y; wz[i] = v.z;
    if (v.y > top) top = v.y; if (v.y < bot) bot = v.y;
  }
  const g = new Set(), tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const x0 = Math.min(wx[a], wx[b], wx[c]), x1 = Math.max(wx[a], wx[b], wx[c]);
    const z0 = Math.min(wz[a], wz[b], wz[c]), z1 = Math.max(wz[a], wz[b], wz[c]);
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++)
      for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) g.add(cellKey(cx, cz));
  }
  _grid = g; _gridMesh = mesh; _top = top + 3; _bottom = bot - 30;
  return true;
}
function occupied(x, z) { return _grid.has(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))); }

/** Le fleuve est-il à moins de r mètres de (x, z) ? (par cellules : approximatif, par excès) */
function nearRiver(x, z, r = FAR) {
  if (!ensureGrid()) return false;
  const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), k = Math.ceil(r / CELL);
  for (let i = -k; i <= k; i++) for (let j = -k; j <= k; j++) if (_grid.has(cellKey(cx + i, cz + j))) return true;
  return false;
}

/* ---------- surface : raycast vertical + cache ---------- */
const _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _dn = new THREE.Vector3(0, -1, 0);
_rc.firstHitOnly = true;
const CACHE_N = 6, _cx = new Float32Array(CACHE_N), _cz = new Float32Array(CACHE_N), _cy = new Float32Array(CACHE_N), _ct = new Float64Array(CACHE_N).fill(-9);
let _ci = 0;
const now = () => performance.now() / 1000;
function surfaceAt(x, z) {
  if (!ensureGrid() || !occupied(x, z)) return null;
  const t = now();
  for (let i = 0; i < CACHE_N; i++) if (t - _ct[i] < 0.25 && Math.abs(_cx[i] - x) < 0.35 && Math.abs(_cz[i] - z) < 0.35) return Number.isNaN(_cy[i]) ? null : _cy[i];
  _rc.set(_o.set(x, _top, z), _dn); _rc.near = 0; _rc.far = _top - _bottom;
  const h = _rc.intersectObject(_gridMesh, false);
  const y = h.length ? h[0].point.y : NaN;
  _ci = (_ci + 1) % CACHE_N; _cx[_ci] = x; _cz[_ci] = z; _cy[_ci] = y; _ct[_ci] = t;
  return Number.isNaN(y) ? null : y;
}
function depthAt(x, z, groundY) { return L.depth(surfaceAt(x, z), groundY); }

/* ---------- gouttelettes (Points) ---------- */
let _scene = false;
const dropGeo = new THREE.BufferGeometry();
const dPos = new Float32Array(NP * 3).fill(0), dCol = new Float32Array(NP * 3), dVel = new Float32Array(NP * 3), dLife = new Float32Array(NP), dMax = new Float32Array(NP), dFloor = new Float32Array(NP);
for (let i = 0; i < NP; i++) dPos[i * 3 + 1] = -9999;
dropGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
dropGeo.setAttribute('color', new THREE.BufferAttribute(dCol, 3));
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 1, 16, 16, 15);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}
const dropMat = new THREE.PointsMaterial({ size: LEVEL === 'low' ? 0.16 : 0.12, sizeAttenuation: true, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
const drops = new THREE.Points(dropGeo, dropMat);
drops.frustumCulled = false; drops.renderOrder = 3; drops.visible = false;
let _di = 0, _alive = 0;
const WR = 0.78, WG = 0.92, WB = 1.0;                  // blanc bleuté

function drop(x, y, z, vx, vy, vz, life, floorY, bright) {
  const i = _di; _di = (_di + 1) % NP;
  dPos[i * 3] = x; dPos[i * 3 + 1] = y; dPos[i * 3 + 2] = z;
  dVel[i * 3] = vx; dVel[i * 3 + 1] = vy; dVel[i * 3 + 2] = vz;
  dLife[i] = dMax[i] = life; dFloor[i] = floorY;
  dCol[i * 3] = WR * bright; dCol[i * 3 + 1] = WG * bright; dCol[i * 3 + 2] = WB * bright;
}

/* ---------- ondes circulaires (InstancedMesh) ---------- */
const ringGeo = new THREE.RingGeometry(0.92, 1, 40); ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
const rings = new THREE.InstancedMesh(ringGeo, ringMat, NR);
rings.frustumCulled = false; rings.renderOrder = 3; rings.visible = false;
rings.setColorAt(0, new THREE.Color(0, 0, 0));          // alloue instanceColor
const rX = new Float32Array(NR), rY = new Float32Array(NR), rZ = new Float32Array(NR), rAge = new Float32Array(NR), rLife = new Float32Array(NR).fill(0), rR0 = new Float32Array(NR), rR1 = new Float32Array(NR), rAmp = new Float32Array(NR);
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
let _ri = 0, _ringsAlive = 0;
const ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < NR; i++) { rings.setMatrixAt(i, ZERO_M); rings.setColorAt(i, _c.setRGB(0, 0, 0)); }

function ripple(x, y, z, r1 = 1.6, life = 0.9, r0 = 0.15, amp = 0.8) {
  const i = _ri; _ri = (_ri + 1) % NR;
  rX[i] = x; rY[i] = y + 0.04; rZ[i] = z; rAge[i] = 0; rLife[i] = life; rR0[i] = r0; rR1[i] = r1; rAmp[i] = amp;
}

/* ---------- API des effets ---------- */
const TAU = Math.PI * 2;
/** Gerbe + onde à l'entrée / la sortie de l'eau. power ~ 0,4 (petit) … 1,5 (gros plouf). */
function splash(x, y, z, power = 1) {
  power = Math.max(0.2, Math.min(1.6, power));
  const n = Math.max(5, Math.round(NP * 0.28 * power));
  for (let k = 0; k < n; k++) {
    const a = Math.random() * TAU, sp = (0.6 + Math.random() * 1.8) * (0.6 + power * 0.5);
    drop(x + Math.cos(a) * 0.15, y + 0.05, z + Math.sin(a) * 0.15, Math.cos(a) * sp, (2.4 + Math.random() * 3.2) * (0.6 + power * 0.45), Math.sin(a) * sp, 0.7 + Math.random() * 0.5, y, 1);
  }
  ripple(x, y, z, 1.4 + power * 1.8, 1.0 + power * 0.4, 0.2, 0.5);
  ripple(x, y, z, 0.9 + power * 1.2, 0.7 + power * 0.3, 0.1, 0.35);
}
/** Petites éclaboussures aux pieds (pataugeage). */
function footSplash(x, y, z) {
  for (let k = 0; k < 4; k++) {
    const a = Math.random() * TAU, sp = 0.4 + Math.random() * 0.9;
    drop(x, y + 0.04, z, Math.cos(a) * sp, 1.4 + Math.random() * 1.6, Math.sin(a) * sp, 0.4 + Math.random() * 0.25, y, 0.85);
  }
  ripple(x, y, z, 0.9, 0.6, 0.1, 0.35);
}
/** Sillage : une onde qui s'élargit (nage, marche dans l'eau). */
function wake(x, y, z, power = 1) { ripple(x, y, z, 0.9 + power * 0.9, 0.9 + power * 0.3, 0.12, 0.32 * Math.min(1, 0.4 + power * 0.6)); }

let _vWake = 0, _vSpray = 0;
/** Voiture dans l'eau : gerbes latérales (∝ vitesse), gouttelettes, ondes. o = { x, z, yaw, speed, surface, depth } */
function vehicleFx(dt, o) {
  const sp = Math.abs(o.speed);
  if (sp < 0.4) { _vSpray = 0; return; }
  const k = Math.min(1, sp / 12), fx = Math.sin(o.yaw), fz = Math.cos(o.yaw), rx = Math.cos(o.yaw), rz = -Math.sin(o.yaw);
  _vSpray += dt * (8 + 40 * k);
  while (_vSpray >= 1) {
    _vSpray -= 1;
    const side = Math.random() < 0.5 ? -1 : 1, fwd = Math.random() < 0.6 ? 1.55 : -1.45;
    const bx = o.x + rx * side * 0.9 + fx * fwd, bz = o.z + rz * side * 0.9 + fz * fwd;
    const out = (1.6 + Math.random() * 1.6) * (0.5 + k), up = (2.2 + Math.random() * 2.2) * (0.5 + k);
    drop(bx, o.surface + 0.05, bz, rx * side * out + fx * o.speed * 0.25, up, rz * side * out + fz * o.speed * 0.25, 0.55 + Math.random() * 0.5, o.surface, 0.9);
  }
  _vWake -= dt;
  if (_vWake <= 0) {
    _vWake = 0.32 - 0.12 * k;
    ripple(o.x - fx * 1.4, o.surface, o.z - fz * 1.4, 2.0 + 2.2 * k, 1.1, 0.4, 0.45);
    ripple(o.x + rx * 0.9, o.surface, o.z + rz * 0.9, 1.2 + 1.2 * k, 0.8, 0.2, 0.3);
  }
}

/* ---------- voile sous-marin (facultatif, très léger) ---------- */
let _veil = null, _veilOn = false;
function veil(on) {
  if (on === _veilOn) return;
  _veilOn = on;
  if (!_veil) {
    _veil = document.createElement('div');
    _veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:3;background:rgba(40,120,110,.22);opacity:0;transition:opacity .25s';
    document.body.appendChild(_veil);
  }
  _veil.style.opacity = on ? '1' : '0';
}

/* ---------- mise à jour ---------- */
let _near = false, _nearT = 0, _veilT = 0;
function tick(dt) {
  if (!M || !M.scene) return;
  if (!_scene) { M.scene.add(drops); M.scene.add(rings); _scene = true; }
  _nearT -= dt;
  if (_nearT <= 0) {
    _nearT = 0.5;
    const c = M.camera ? M.camera.position : null;
    _near = !!c && nearRiver(c.x, c.z, FAR);
    if (!_near) { veil(false); }
  }
  if (!_near && !_alive && !_ringsAlive) { drops.visible = false; rings.visible = false; return; }
  dt = Math.min(dt, 0.05);
  // gouttelettes
  {
    let alive = 0;
    for (let i = 0; i < NP; i++) {
      if (dLife[i] <= 0) continue;
      const j = i * 3;
      dVel[j + 1] -= 9.8 * dt;
      dPos[j] += dVel[j] * dt; dPos[j + 1] += dVel[j + 1] * dt; dPos[j + 2] += dVel[j + 2] * dt;
      dLife[i] -= dt;
      if (dLife[i] <= 0 || dPos[j + 1] < dFloor[i]) { dLife[i] = 0; dPos[j + 1] = -9999; dCol[j] = dCol[j + 1] = dCol[j + 2] = 0; continue; }
      const f = Math.min(1, (dLife[i] / dMax[i]) * 1.8);
      dCol[j] = WR * f; dCol[j + 1] = WG * f; dCol[j + 2] = WB * f;
      alive++;
    }
    const was = _alive; _alive = alive;
    if (alive || was) { dropGeo.attributes.position.needsUpdate = true; dropGeo.attributes.color.needsUpdate = true; }
    drops.visible = alive > 0;
  }
  // ondes
  let ra = 0;
  for (let i = 0; i < NR; i++) {
    if (rLife[i] <= 0) continue;
    rAge[i] += dt;
    const t = rAge[i] / rLife[i];
    if (t >= 1) { rLife[i] = 0; rings.setMatrixAt(i, ZERO_M); rings.setColorAt(i, _c.setRGB(0, 0, 0)); continue; }
    const e = 1 - (1 - t) * (1 - t), r = rR0[i] + (rR1[i] - rR0[i]) * e, a = Math.pow(1 - t, 1.4) * rAmp[i];
    _m.compose(_p.set(rX[i], rY[i], rZ[i]), _q.identity(), _s.set(r, 1, r));
    rings.setMatrixAt(i, _m); rings.setColorAt(i, _c.setRGB(WR * a, WG * a, WB * a));
    ra++;
  }
  const rw = _ringsAlive; _ringsAlive = ra;
  if (ra || rw) { rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true; }
  rings.visible = ra > 0;
  // voile bleu-vert quand la caméra est sous la surface
  _veilT -= dt;
  if (_near && _veilT <= 0 && M.camera) {
    _veilT = 0.12;
    const c = M.camera.position, s = surfaceAt(c.x, c.z);
    veil(s !== null && c.y < s - 0.02);
  }
}
M?.addFrameHook?.((dt) => { try { tick(dt); } catch (e) { if (!tick.err) { tick.err = 1; console.error('[Eau] erreur :', e && (e.stack || e)); } } });

window.WaterFx = {
  surfaceAt, depthAt, nearRiver, splash, footSplash, wake, ripple, vehicleFx,
  logic: L, level: LEVEL, budget: { particles: NP, rings: NR },
  get alive() { return _alive; }, get ringsAlive() { return _ringsAlive; },
  get veil() { return _veilOn; },
};
