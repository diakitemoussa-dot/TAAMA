/* ==========================================================
   PERSONNAGE EN 3D DANS L'INTERFACE
   ----------------------------------------------------------
   Affiche le vrai modèle du joueur (personnage-joueur-gadget.glb) avec
   son drone arrimé sur le sac, l'animation « idle_look » (long repos)
   et un plateau tournant à 360° autour de l'axe vertical
   (Z dans Blender, Y dans three.js).

   Un seul rendu 3D est partagé : le canevas est déplacé d'un cadre à
   l'autre selon l'écran affiché, et s'arrête quand aucun écran ne
   l'utilise. Si le 3D est impossible (WebGL absent, modèle introuvable),
   l'image de secours placée dans le cadre reste affichée.

   API :
     attachCharacter(container, { interactive })   place le personnage dans un cadre
     rotateCharacter(dir)                          ← / → : fait tourner (dir = ±1)
     releaseCharacter()                            arrête le rendu et libère le cadre
   ========================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

import { heroUrl } from './hero.js?v=1';
const DRONE_URL = 'assets/models/drone.glb';
const DRACO_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';
const CLIP = 'idle_look';
const SPEED = 0.55;                     // rad/s : un tour en ~11 s
const START_ANGLE = 155 * Math.PI / 180;   // 3/4 arrière : sac, drone et gadget visibles

let V = null;            // { renderer, scene, camera, turntable, mixer, canvas }
let loading = null;      // promesse de chargement
let failed = false;
let host = null;         // cadre actuel
let raf = 0;
let angle = START_ANGLE;
let dragging = false;
let lastT = 0;
let ro = null;

function init() {
  if (V || failed) return V;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const canvas = renderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity .5s ease;touch-action:none;cursor:grab';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(21, 0.71, 0.1, 50);
    camera.position.set(0, 1.0, 5.6);
    camera.lookAt(0, 0.9, 0);

    // Lumière du couchant : clé chaude à gauche, remplissage froid à droite, contre-jour doux
    scene.add(new THREE.HemisphereLight(0xffe2c0, 0x4a3350, 0.9));
    const key = new THREE.DirectionalLight(0xffc88a, 3.0); key.position.set(-3, 3.2, 3.5); scene.add(key);
    const fill = new THREE.DirectionalLight(0x9ab4ff, 0.9); fill.position.set(3.5, 1.4, 2.0); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffe0b0, 2.0); rim.position.set(1.5, 2.5, -3.5); scene.add(rim);

    const turntable = new THREE.Group();
    turntable.rotation.y = angle;
    scene.add(turntable);
    V = { renderer, scene, camera, turntable, mixer: null, canvas, ready: false };
    return V;
  } catch (e) {
    failed = true;
    console.warn('[Personnage 3D] indisponible :', e && e.message);
    return null;
  }
}

let loadedHero = null;
function loadModels() {
  if (loading && loadedHero && loadedHero !== heroUrl() && V) {          // le joueur a changé de personnage : on recharge
    V.turntable.clear(); V.mixer = null; V.ready = false; loading = null;
  }
  if (loading) return loading;
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_PATH);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  const load = (url) => new Promise((res, rej) => loader.load(url, res, undefined, rej));

  loadedHero = heroUrl();
  loading = Promise.all([load(loadedHero), load(DRONE_URL)]).then(([player, drone]) => {
    const model = player.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    if (size.y > 0.01) model.scale.multiplyScalar(1.78 / size.y);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    model.position.y -= box.min.y;

    // Drone sur le pad du sac (mêmes constantes que le sanctuaire)
    const dm = drone.scene;
    dm.rotation.set(0, 0, 0);
    dm.updateMatrixWorld(true);
    dm.position.sub(new THREE.Box3().setFromObject(dm).getCenter(new THREE.Vector3()));
    dm.traverse((o) => { if (/^PropDisc_HELICE_/i.test(o.name || '')) o.scale.setScalar(0.0001); });
    const dock = new THREE.Group();
    dock.add(dm);
    dock.position.set(0, 0.0539, 0);
    dock.rotation.y = Math.PI;                       // même retournement (180°) que dans le sanctuaire
    dock.scale.setScalar(0.19);
    const pad = model.getObjectByName('DroneLandingPad');
    if (pad) pad.add(dock);

    model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    V.turntable.add(model);

    V.mixer = new THREE.AnimationMixer(model);
    const clip = player.animations.find((c) => String(c.name).trim().toLowerCase() === CLIP) || player.animations[0];
    if (clip) V.mixer.clipAction(clip).play();
    V.ready = true;
    window.dispatchEvent(new CustomEvent('character:ready'));
  }).catch((e) => {
    failed = true;
    console.warn('[Personnage 3D] modèle introuvable :', e && e.message);
  });
  return loading;
}

window.addEventListener('hero:change', () => {          // Homme / Femme : recharge le modèle affiché
  if (!V || !host) return;
  const c = host;
  loadModels().then(() => { if (host === c && V.ready) { resize(); V.canvas.style.opacity = '1'; } });
});

function resize() {
  if (!V || !host) return;
  const w = host.clientWidth, h = host.clientHeight;
  if (!w || !h) return;
  const scale = host.getBoundingClientRect().width / w || 1;           // l'écran 16:9 est mis à l'échelle
  const pr = Math.max(1, Math.min(2, (window.devicePixelRatio || 1) * scale));
  V.renderer.setPixelRatio(pr);
  V.renderer.setSize(w, h, false);
  V.camera.aspect = w / h;
  V.camera.updateProjectionMatrix();
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!V || !host || document.hidden) { lastT = now; return; }
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000);
  lastT = now;
  if (!dragging) angle += SPEED * dt;
  V.turntable.rotation.y = angle;
  if (V.mixer) V.mixer.update(dt);
  V.renderer.render(V.scene, V.camera);
}

function bindDrag(container) {
  const c = V.canvas;
  let x0 = 0;
  c.onpointerdown = (e) => {
    dragging = true; x0 = e.clientX;
    c.style.cursor = 'grabbing';
    try { c.setPointerCapture(e.pointerId); } catch (_) {}
  };
  c.onpointermove = (e) => {
    if (!dragging) return;
    angle += (e.clientX - x0) * 0.012;
    x0 = e.clientX;
  };
  const end = () => { dragging = false; c.style.cursor = 'grab'; };
  c.onpointerup = end;
  c.onpointercancel = end;
  c.style.pointerEvents = container ? 'auto' : 'none';
}

export function attachCharacter(container, { interactive = false } = {}) {
  if (!container || !init()) return false;
  host = container;
  container.style.overflow = 'hidden';
  container.appendChild(V.canvas);
  V.canvas.style.opacity = V.ready ? '1' : '0';
  V.canvas.style.pointerEvents = interactive ? 'auto' : 'none';
  V.canvas.style.cursor = interactive ? 'grab' : 'default';
  if (interactive) bindDrag(container); else { V.canvas.onpointerdown = V.canvas.onpointermove = V.canvas.onpointerup = V.canvas.onpointercancel = null; }
  resize();
  if (ro) ro.disconnect();
  if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(container); }
  window.addEventListener('resize', resize);

  const show = () => {
    if (host !== container || !V.ready) return;
    resize();
    V.canvas.style.opacity = '1';
    const fb = container.querySelector(':scope > img');           // image de secours
    if (fb) fb.style.opacity = '0';
  };
  loadModels().then(show);
  if (V.ready) show();
  if (!raf) { lastT = 0; raf = requestAnimationFrame(frame); }
  return true;
}

/** ← → : fait tourner le personnage (≈ 25° par appui). */
export function rotateCharacter(dir) {
  angle += (dir > 0 ? 1 : -1) * 0.45;
}

export function releaseCharacter() {
  cancelAnimationFrame(raf);
  raf = 0;
  if (ro) { ro.disconnect(); ro = null; }
  window.removeEventListener('resize', resize);
  if (V && V.canvas.parentElement) V.canvas.parentElement.removeChild(V.canvas);
  host = null;
}

export const characterInfo = () => ({ ready: !!(V && V.ready), failed, angle });
