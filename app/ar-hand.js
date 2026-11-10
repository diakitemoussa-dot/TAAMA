/* ==========================================================
   AR SUR PC — la mosquée posée sur la main de l'utilisateur (webcam + suivi de la main)
   ----------------------------------------------------------
   Ouvert par le bouton AR quand l'appareil n'a pas de vraie AR (ordinateur) : la webcam s'affiche en miroir, MediaPipe HandLandmarker
   (même bibliothèque que Documents « HAND TRACKING ») repère la main, et le modèle 3D de la Grande Mosquée
   (assets/models/djenne-mosque-only.glb) se pose sur la paume :
     • position = centre de la paume · taille = taille de la main (rapprocher la main = plus grand) ;
     • orientation = inclinaison de la main (poignet → majeur) + torsion de la paume ;
     • poing fermé = la mosquée tourne sur elle-même ; main absente = elle s'efface doucement.
   Bibliothèque et modèle de détection : CDN (comme three.js et Draco dans le reste du jeu). Échap ou ✕ pour quitter.
   Sur téléphone, le bouton AR continue d'utiliser model-viewer (ARCore / Quick Look) : voir ar-mode.js.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const MODEL_URL = 'assets/models/djenne-mosque-only.glb';
const DRACO = 'assets/vendor/three/examples/jsm/libs/draco/';
const MP_VER = '0.10.22-rc.20250304';
const MP_BUNDLES = [`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`, `https://unpkg.com/@mediapipe/tasks-vision@${MP_VER}/vision_bundle.mjs`];
const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VER}/wasm`;
const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let root = null, video = null, canvas = null, hint = null, state = null;

async function loadMediaPipe() {
  let mod = null, err = null;
  for (const u of MP_BUNDLES) { try { mod = await import(/* @vite-ignore */ u); break; } catch (e) { err = e; } }
  if (!mod) throw err || new Error('MediaPipe indisponible');
  const vision = await mod.FilesetResolver.forVisionTasks(MP_WASM);
  const mk = (delegate) => mod.HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MP_MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
    minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  try { return await mk('GPU'); } catch (_) { return await mk('CPU'); }
}

function buildDom() {
  root = document.createElement('div'); root.id = 'arHand';
  root.style.cssText = 'position:fixed;inset:0;z-index:400;background:#0b0a10;color:#F8F3EA;font-family:"Open Sans",system-ui,sans-serif;overflow:hidden';
  video = document.createElement('video'); video.playsInline = true; video.muted = true; video.autoplay = true;
  video.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)';
  canvas = document.createElement('canvas'); canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  hint = document.createElement('div');
  hint.style.cssText = 'position:absolute;left:50%;bottom:7%;transform:translateX(-50%);padding:12px 22px;border-radius:16px;background:rgba(85,65,93,.88);border:1px solid rgba(249,213,139,.8);font:700 17px "Open Sans",system-ui,sans-serif;text-align:center;max-width:90vw;transition:opacity .4s';
  const close = document.createElement('button'); close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', 'Quitter l’AR');
  close.style.cssText = 'position:absolute;right:20px;top:18px;width:46px;height:46px;border-radius:50%;border:2px solid rgba(249,213,139,.9);background:rgba(40,28,48,.85);color:#F9D58B;font-size:22px;cursor:pointer';
  close.addEventListener('click', stop);
  const title = document.createElement('div'); title.textContent = 'AR · La Grande Mosquée sur ta main';
  title.style.cssText = 'position:absolute;left:20px;top:22px;padding:8px 16px;border-radius:12px;background:rgba(40,28,48,.78);font:700 15px "Rubik","Open Sans",sans-serif;letter-spacing:.06em';
  root.append(video, canvas, title, hint, close);
  document.body.appendChild(root);
}

function setHint(t, show = true) { hint.textContent = t; hint.style.opacity = show ? '1' : '0'; }

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const k = 1 / Math.max(size.x, size.y, size.z, 1e-6);
  model.position.set(-c.x * k, -box.min.y * k, -c.z * k); model.scale.setScalar(k);   // base au niveau de y = 0, centré
  return model;
}

export async function start() {
  if (root) return;
  buildDom();
  setHint('Autorise la caméra pour commencer…');
  const S = state = { stop: false, raf: 0, stream: null, lm: null, three: null, last: -1, lost: 0, vis: 0, spin: 0 };
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) { setHint('Caméra indisponible : autorise-la dans le navigateur (icône 🔒 de la barre d’adresse), puis réessaie.'); return; }
  video.srcObject = S.stream; try { await video.play(); } catch (_) {}
  setHint('Chargement du suivi de la main…');

  // rendu 3D transparent par-dessus la vidéo (caméra orthographique en pixels)
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff1d8, 0x7a5a3a, 1.35));
  const sun = new THREE.DirectionalLight(0xffffff, 2.4); sun.position.set(-0.6, 1.2, 1.0); scene.add(sun);
  const cam = new THREE.OrthographicCamera(0, 1, 1, 0, -4000, 4000); cam.position.z = 1000;
  const holder = new THREE.Group(); holder.visible = false; scene.add(holder);
  S.three = { renderer, scene, cam, holder };
  const resize = () => {
    const W = window.innerWidth, H = window.innerHeight; renderer.setSize(W, H, false);
    cam.left = 0; cam.right = W; cam.top = 0; cam.bottom = -H; cam.updateProjectionMatrix();
  };
  resize(); window.addEventListener('resize', resize); S.resize = resize;

  try {
    const draco = new DRACOLoader(); draco.setDecoderPath(DRACO);
    const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(MODEL_URL);
    const model = fitModel(gltf.scene); holder.add(model);
  } catch (e) { setHint('Le modèle 3D de la mosquée n’a pas pu être chargé.'); console.warn('[AR main] modèle :', e); return; }
  try { S.lm = await loadMediaPipe(); } catch (e) { setHint('Le suivi de la main n’a pas pu être chargé (connexion Internet nécessaire).'); console.warn('[AR main] MediaPipe :', e); return; }
  setHint('Montre ta main ouverte à la caméra, paume vers toi ✋');

  const P = (lm, dw, dh) => new THREE.Vector3((1 - lm.x) * dw, -lm.y * dh, -lm.z * dw);   // miroir ; Y vers le haut
  const tgtPos = new THREE.Vector3(), tgtQ = new THREE.Quaternion(), qE = new THREE.Euler();
  let sizeSm = 0;

  const loop = (now) => {
    if (S.stop) return;
    S.raf = requestAnimationFrame(loop);
    const W = window.innerWidth, H = window.innerHeight, vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    const sc = Math.max(W / vw, H / vh), dw = vw * sc, dh = vh * sc, ox = (W - dw) / 2, oy = (H - dh) / 2;
    if (video.currentTime !== S.last) {
      S.last = video.currentTime;
      let res = null; try { res = S.lm.detectForVideo(video, now); } catch (_) {}
      const h = res && res.landmarks && res.landmarks[0];
      if (h) {
        S.lost = 0;
        const p0 = P(h[0], dw, dh), p5 = P(h[5], dw, dh), p9 = P(h[9], dw, dh), p13 = P(h[13], dw, dh), p17 = P(h[17], dw, dh);
        const palmLen = Math.hypot(p9.x - p0.x, p9.y - p0.y);
        const cx = (p0.x + p5.x + p9.x + p13.x + p17.x) / 5 + ox, cy = (p0.y + p5.y + p9.y + p13.y + p17.y) / 5 - oy;   // cy : ordonnée « three » (vers le haut, négative sous le bord haut)
        // poing fermé : bouts des doigts proches de la paume
        const tips = [8, 12, 16, 20].map((i) => P(h[i], dw, dh)); const avg = tips.reduce((a, t) => a + Math.hypot(t.x - p9.x, t.y - p9.y), 0) / 4;
        S.fist = avg < palmLen * 0.75;
        const size = palmLen * 2.6; sizeSm = sizeSm ? sizeSm + (size - sizeSm) * 0.3 : size;
        const up = new THREE.Vector3(p9.x - p0.x, p9.y - p0.y, 0).normalize();
        const roll = Math.atan2(-up.x, up.y);                                   // main droite = 0 ; penchée = rotation autour de l'axe de vue
        const n = new THREE.Vector3().subVectors(p5, p0).cross(new THREE.Vector3().subVectors(p17, p0)).normalize(); if (n.z < 0) n.negate();
        const yaw = Math.max(-1.0, Math.min(1.0, Math.atan2(n.x, n.z))), pitch = Math.max(-0.7, Math.min(0.7, -Math.atan2(n.y, n.z) * 0.8));
        tgtPos.set(cx - up.x * sizeSm * 0.05, cy + sizeSm * 0.12, 0);          // légèrement au-dessus de la paume
        qE.set(pitch, yaw + (S.fist ? 0 : 0), roll, 'ZXY'); tgtQ.setFromEuler(qE);
        if (!holder.visible) { holder.position.copy(tgtPos); holder.quaternion.copy(tgtQ); holder.visible = true; }
        setHint(S.fist ? 'Poing fermé : la mosquée tourne ✊' : 'Incline ta main pour la faire pivoter · rapproche-la pour agrandir', true);
        S.targetScale = sizeSm;
      } else { S.lost += 1; }
    }
    if (S.lost > 14 && holder.visible) { holder.visible = false; setHint('Montre ta main ouverte à la caméra, paume vers toi ✋'); }
    if (holder.visible && S.targetScale) {
      holder.position.lerp(tgtPos, 0.35);
      if (S.fist) { S.spin += 0.045; }
      const q = tgtQ.clone(); if (S.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), S.spin));
      holder.quaternion.slerp(q, 0.3);
      const s = holder.scale.x + (S.targetScale - holder.scale.x) * 0.3 || S.targetScale; holder.scale.setScalar(s);
    }
    renderer.render(scene, cam);
  };
  S.raf = requestAnimationFrame(loop);
}

export function stop() {
  const S = state; state = null;
  if (S) {
    S.stop = true; cancelAnimationFrame(S.raf);
    if (S.stream) S.stream.getTracks().forEach((t) => t.stop());
    if (S.lm && S.lm.close) { try { S.lm.close(); } catch (_) {} }
    if (S.three) { S.three.renderer.dispose(); S.three.scene.traverse((o) => { if (o.isMesh) { o.geometry && o.geometry.dispose(); } }); }
    if (S.resize) window.removeEventListener('resize', S.resize);
  }
  if (root) { root.remove(); root = video = canvas = hint = null; }
}

window.addEventListener('keydown', (e) => { if (root && e.key === 'Escape') { e.stopImmediatePropagation(); stop(); } }, true);
window.ARHand = { start, stop, get active() { return !!root; } };
