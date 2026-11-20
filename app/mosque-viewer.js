/* ==========================================================
   ÉTAPE FINALE — Maquette 3D de la ville de Djenné
   Chargée après la vidéo de décollage du drone.
   Affiche le GLB (maquette + dôme de ciel + nuages 3D),
   caméra cadrée sur la Grande Mosquée, fog atmosphérique.
   ========================================================== */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas    = document.getElementById('mosqueCanvas');
const stage     = document.getElementById('mosqueStage');
const loadingEl = document.getElementById('mosqueLoading');
if (!canvas) throw new Error('mosqueCanvas introuvable');

const MODEL_URL     = 'assets/models/djenne-ar.glb';
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';

// URL de la vidéo du grand crépissage (à renseigner — laisser vide affiche "bientôt disponible")
const VIDEO_CREPISSAGE = '';

/* ---------- Renderer ---------- */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Rendu fidèle aux couleurs (comme l'aperçu Blender) — ACES assombrissait trop l'argile
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

/* ---------- Scène + fog atmosphérique ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fb8de);       // bleu ciel (filet visible hors dôme)
scene.fog = new THREE.Fog(0xf0dcab, 300, 900);      // brume sable (ajustée après chargement)

/* ---------- Caméra ---------- */
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 4000);
camera.position.set(140, 110, 140);

/* ---------- Contrôles orbitaux ---------- */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enablePan = false;
controls.maxPolarAngle = Math.PI * 0.495;           // empêche de passer sous le sol

/* ==========================================================
   Post-processing — BLOOM SÉLECTIF
   Fait rayonner UNIQUEMENT les objets placés sur le calque BLOOM
   (ici : les minarets). Le reste de la scène est noirci pendant
   la passe de bloom, donc ne brille pas.
   ========================================================== */
const BLOOM_LAYER = 1;
const bloomLayer = new THREE.Layers();
bloomLayer.set(BLOOM_LAYER);
camera.layers.enable(BLOOM_LAYER);

const darkMat   = new THREE.MeshBasicMaterial({ color: 0x000000 });
const savedMats = {};

const renderScene = new RenderPass(scene, camera);
const bloomPass   = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.14,  // strength (intensité du halo) — discret
  0.5,   // radius
  0.25   // threshold (ignore les zones peu lumineuses -> pas de surbrillance générale)
);

const bloomComposer = new EffectComposer(renderer);
bloomComposer.renderToScreen = false;
bloomComposer.addPass(renderScene);
bloomComposer.addPass(bloomPass);

const mixPass = new ShaderPass(
  new THREE.ShaderMaterial({
    uniforms: {
      baseTexture:  { value: null },
      bloomTexture: { value: bloomComposer.renderTarget2.texture }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
      void main(){ gl_FragColor = texture2D(baseTexture, vUv) + texture2D(bloomTexture, vUv); }`
  }),
  'baseTexture'
);
mixPass.needsSwap = true;

const finalComposer = new EffectComposer(renderer);
finalComposer.addPass(renderScene);
finalComposer.addPass(mixPass);
finalComposer.addPass(new OutputPass());

function darkenNonBloomed(obj){
  if (obj.isMesh && bloomLayer.test(obj.layers) === false){
    savedMats[obj.uuid] = obj.material;
    obj.material = darkMat;
  }
}
function restoreMat(obj){
  if (savedMats[obj.uuid]){
    obj.material = savedMats[obj.uuid];
    delete savedMats[obj.uuid];
  }
}
/* Rendu en deux temps : 1) halo des minarets seuls  2) scène normale + halo ajouté */
function renderSelectiveBloom(){
  const bg = scene.background, fg = scene.fog;
  scene.background = null;                 // fond noir pendant l'extraction du halo
  scene.fog = null;                        // pas de fog (sinon le noir vire à la brume -> faux halo)
  scene.traverse(darkenNonBloomed);
  bloomComposer.render();
  scene.traverse(restoreMat);
  scene.background = bg;
  scene.fog = fg;
  finalComposer.render();
}

/* ---------- Lumières (extérieur, fin de journée douce) ---------- */
const sun = new THREE.DirectionalLight(0xfff3da, 1.7);
sun.position.set(180, 280, 120);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.camera.near   =   1;
sun.shadow.camera.far    = 700;
sun.shadow.camera.left   = -320;
sun.shadow.camera.right  =  320;
sun.shadow.camera.top    =  320;
sun.shadow.camera.bottom = -320;
sun.shadow.bias          = -0.003;
sun.shadow.normalBias    =  0.15;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xcfe2f5, 0xd8c49a, 1.15);  // ciel bleu / sol ocre clair
scene.add(hemi);
const amb = new THREE.AmbientLight(0xffffff, 0.35);  // réduit pour que les ombres restent visibles
scene.add(amb);

/* ---------- Collines d'horizon (illusion de relief autour du village) ---------- */
function addHills(center, R, groundY = 0) {
  const inner = R * 0.70, outer = R * 0.88;   // reculées pour ne pas être trop proches du village
  const SEG = 180, RINGS = 20, stride = SEG + 1;
  const pos = [], col = [], idx = [];

  const hash = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y) => { let s = 0, amp = 0.5, f = 1, t = 0; for (let o = 0; o < 4; o++) { s += amp * vnoise(x * f, y * f); t += amp; amp *= 0.5; f *= 2; } return s / t; };

  const low = new THREE.Color(0xc2a575), high = new THREE.Color(0x9c7f4f);   // ocre clair -> ocre foncé
  for (let j = 0; j <= RINGS; j++) {
    const rt = j / RINGS;
    const rise = rt * rt * (3 - 2 * rt);
    for (let i = 0; i <= SEG; i++) {
      const a = i / SEG * Math.PI * 2;
      const nx = Math.cos(a), nz = Math.sin(a);
      // Rayon perturbé par noise → casse le cercle parfait
      const rWarp = 1 + (fbm(nx * 2.1 + 3.7, nz * 2.1 + 1.3) - 0.5) * 0.55
                      + (fbm(nx * 5.3 + 8.1, nz * 5.3 + 6.2) - 0.5) * 0.25;
      const radius = (inner + (outer - inner) * rt) * rWarp;
      // Hauteur variable — certaines zones quasi plates, d'autres en dune
      const h = rise * fbm(nx * 3 + 10, nz * 3 + 10) * 22 + fbm(nx * 7, nz * 7) * 7;
      pos.push(center.x + nx * radius, groundY - 8 + h, center.z + nz * radius);
      const c = low.clone().lerp(high, Math.min(1, h / 70));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let j = 0; j < RINGS; j++) for (let i = 0; i < SEG; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    idx.push(a, b, c, b, d, c);   // winding inversé → normales vers l'intérieur (face au village)
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }));
  mesh.name = 'WEB_Hills';
  mesh.castShadow    = true;
  mesh.receiveShadow = true;
  scene.add(mesh);                                         // fog activé -> collines lointaines fondues dans la brume
}

/* ---------- État ---------- */
let loaded = false, active = false, raf = 0;
let glowActive = false;             // effet bloom actif ?
let glowT = 0;                      // horloge de pulsation du halo
let glowMeshes = [];                // meshes actuellement illuminés (pour restauration + pulsation)
let minaretRoots = [];              // nœuds illuminés pour la fiche MINARETS
let facadeRoots  = [];              // nœuds illuminés pour la fiche FAÇADE
let canarisRoots = [];              // nœuds illuminés pour la fiche VENTILATION (canaris)
const GLOW_BASE  = 0.11;            // intensité émissive de base (discrète)
const GLOW_AMP   = 0.04;            // amplitude de la pulsation (0.07 -> 0.15)
const GLOW_SPEED = 0.9;             // vitesse de la pulsation (plus petit = plus lent)
const savedCamPos    = new THREE.Vector3();   // position caméra avant ouverture d'une fiche
const savedCamTarget = new THREE.Vector3();   // cible orbite avant ouverture d'une fiche
let   hasSavedCam    = false;
let introT = 0; let introDur = 2.8;
let introSmooth = false;                      // true = easeInOutCubic (vols boutons), false = easeOutCubic (travelling d'ouverture)
let mixer = null;                             // lecteur d'animations du GLB (nuages)
const camStart = new THREE.Vector3();
const camEnd   = new THREE.Vector3();
const target   = new THREE.Vector3();         // point visé en FIN de vol
const camStartTarget = new THREE.Vector3();   // point visé au DÉBUT du vol (pour interpoler l'orientation)
const _look = new THREE.Vector3();            // point visé courant (interpolé chaque frame)

/* Points de vue mémorisés pour les boutons GAME / INTÉRIEUR */
const viewOverview = new THREE.Vector3();   // vue d'ensemble (mode GAME)
const viewInterior = new THREE.Vector3();   // vue rapprochée (mode INTÉRIEUR)
const viewTarget   = new THREE.Vector3();   // centre de la mosquée

/* Cadrage "Façade" (vue de face, comme la capture) */
const facadeTarget = new THREE.Vector3();   // centre de la façade
const facadeNormal = new THREE.Vector3(0, 0, 1);   // normale sortante (vers l'avant)
let   facadeDist   = 120;                   // distance caméra ↔ façade
let   domeR        = 0;                      // rayon du dôme (limite)

/* Déplacement fluide de la caméra vers un point de vue (réutilise le travelling) */
function flyTo(dest, tgt, dur = 1.6){
  camStart.copy(camera.position);
  camEnd.copy(dest);
  camStartTarget.copy(controls.target);   // d'où la caméra regarde MAINTENANT (avant écrasement)
  target.copy(tgt);                        // vers où elle regardera à l'arrivée
  controls.target.copy(tgt);
  introDur = dur;
  introT = 0;
  introSmooth = true;                      // vol bouton -> easing doux des deux côtés (fluide à l'aller ET au retour)
}

/* ---------- Chargement GLB (Draco) ---------- */
const draco = new DRACOLoader();
draco.setDecoderPath(DRACO_DECODER);
const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

loader.load(
  MODEL_URL,
  (gltf) => {
    const root = gltf.scene;
    scene.add(root);


    // Animations du GLB (ex. nuages) -> lecture en boucle
    if (gltf.animations && gltf.animations.length){
      mixer = new THREE.AnimationMixer(root);
      mixer.timeScale = 0.5;                        // vitesse de lecture (0.5 = 2× plus lent)
      gltf.animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      });
    }

    // Repérer la mosquée + désactiver le fog sur ciel & nuages (restent nets)
    let mosque = null;
    let domeRadius = 0;
    const domeCenter = new THREE.Vector3();
    root.traverse((o) => {
      if (o.isMesh) {
        const n = o.name || '';
        if (/Sky|Sphere|Cloud/i.test(n)) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m) m.fog = false; });   // ciel & nuages : pas de fog
        }
        if (/Sky|Sphere/i.test(n) && !/Cloud/i.test(n)) {
          const sb = new THREE.Box3().setFromObject(o);
          const ss = sb.getSize(new THREE.Vector3());
          domeRadius = Math.max(domeRadius, Math.max(ss.x, ss.y, ss.z) / 2);
          sb.getCenter(domeCenter);
        }
        // Ombres naturelles sur tous les meshes sauf ciel/nuages
        if (!/Sky|Sphere/i.test(n)) {
          o.castShadow    = true;
          o.receiveShadow = true;
        }
      }
      if (!mosque && /Mosquee_Base/i.test(o.name)) mosque = o;
    });

    // Cadrage sur la mosquée (ou la scène entière en secours)
    const focus = mosque || root;
    const box = new THREE.Box3().setFromObject(focus);
    box.getCenter(target);
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) || 40;

    controls.target.copy(target);
    camStartTarget.copy(target);                 // travelling d'ouverture : visée fixe (centre mosquée)
    introSmooth = false;                         // easeOutCubic = arrivée drone (décélération)
    const dist = r * 2.4;
    camEnd.set(target.x + dist * 0.62, target.y + r * 1.0, target.z + dist * 0.62);
    camStart.set(target.x + dist * 1.05, target.y + r * 2.3, target.z + dist * 1.05);
    camera.position.copy(camStart);

    // Rayon du dôme (secours : depuis la scène entière)
    if (!domeRadius) {
      const wbox = new THREE.Box3().setFromObject(root);
      const wsize = wbox.getSize(new THREE.Vector3());
      domeRadius = (Math.max(wsize.x, wsize.z) * 0.5) || 360;
    }

    // Brouillard d'horizon : mosquée nette, village lointain fondu dans la brume
    // (ciel & nuages exemptés de fog -> horizon atmosphérique propre)
    scene.fog.color.set(0xe9d8ae);
    scene.fog.near = dist * 0.6;                // brume rapprochée de la caméra
    scene.fog.far  = domeRadius * 0.95;
    if (scene.fog.far <= scene.fog.near) scene.fog.far = scene.fog.near * 1.6;

    // La caméra reste À L'INTÉRIEUR du dôme de ciel
    controls.minDistance = r * 0.7;
    controls.maxDistance = domeRadius * 0.8;

    // Illusion de collines tout autour du village (horizon, sous le dôme)
    // box.min.y = niveau réel du sol (bas de la mosquée) pour ne pas flotter ni être sous terre
    addHills(domeCenter, domeRadius, box.min.y);

    // Points de vue pour les boutons GAME (ensemble) / INTÉRIEUR (rapproché)
    viewTarget.copy(target);
    // Vue initiale calée sur la position Blender (quartier sud, légère plongée)
    // Blender (-89.087, -239.01, 81.493) → Three.js Y-up : x=Bx, y=Bz, z=-By
    camEnd.set(-89.087, 81.493, 239.01);
    viewOverview.copy(camEnd);
    viewInterior.set(target.x + r * 0.85, target.y + r * 0.30, target.z + r * 0.85);

    // --- Cadrage "Façade" : caméra pile en face de la paroi des 3 tours ---
    domeR = domeRadius;
    let minarets = null, mainDoor = null;
    root.traverse((o) => {
      if (!o.isMesh) return;
      if (/Minarets/i.test(o.name)) minarets = o;
      if (/Porte_Principale/i.test(o.name)) mainDoor = o;
    });
    // Nœuds ciblés par l'effet bloom (noms exacts du GLB)
    const byName = (n) => root.getObjectByName(n);
    minaretRoots = [byName('Minarets')].filter(Boolean);
    facadeRoots  = ['Mosquee_Base', 'Minarets', 'Poteaux', 'Torons_Externes']
      .map(byName).filter(Boolean);
    canarisRoots = [byName('Canaris')].filter(Boolean);     // poteries de ventilation du toit
    const facBox = new THREE.Box3().setFromObject(mosque);
    if (minarets) facBox.expandByObject(minarets);          // inclut la hauteur des tours
    const facCenter = facBox.getCenter(new THREE.Vector3());
    const facSize   = facBox.getSize(new THREE.Vector3());

    // Normale verrouillée sur la paroi du socle la PLUS PROCHE des minarets (les 3 tours
    // de la façade qibla). La porte principale est près d'un angle -> repère trompeur.
    const baseBox = new THREE.Box3().setFromObject(mosque);
    const dc = minarets
      ? new THREE.Box3().setFromObject(minarets).getCenter(new THREE.Vector3())
      : (mainDoor ? new THREE.Box3().setFromObject(mainDoor).getCenter(new THREE.Vector3())
                  : facCenter.clone());
    const dPX = baseBox.max.x - dc.x, dNX = dc.x - baseBox.min.x;
    const dPZ = baseBox.max.z - dc.z, dNZ = dc.z - baseBox.min.z;
    const mMin = Math.min(dPX, dNX, dPZ, dNZ);
    if      (mMin === dPZ) facadeNormal.set(0, 0,  1);
    else if (mMin === dNZ) facadeNormal.set(0, 0, -1);
    else if (mMin === dPX) facadeNormal.set(1, 0,  0);
    else                   facadeNormal.set(-1, 0, 0);

    // Cadrage FIXE (mêmes coordonnées sur tout écran) — format paysage de référence
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), facadeNormal).normalize();
    const W = Math.abs(facSize.x * right.x) + Math.abs(facSize.z * right.z);   // largeur de la façade
    const H = facSize.y;                                                        // hauteur (avec tours)
    const depth = Math.abs(facSize.x * facadeNormal.x) + Math.abs(facSize.z * facadeNormal.z);
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const REF_ASPECT = 1.9;                                  // cadrage de référence (comme l'image)
    const hfovRef = 2 * Math.atan(Math.tan(vfov / 2) * REF_ASPECT);
    facadeDist = Math.max((H / 2) / Math.tan(vfov / 2), (W / 2) / Math.tan(hfovRef / 2)) * 1.06 + depth / 2;
    facadeTarget.copy(facCenter);

    loaded = true;
    if (active && loadingEl) loadingEl.classList.add('hidden');
    if (active) revealStage();                              // affiche le titre puis les boutons
  },
  (xhr) => {
    if (loadingEl && xhr.total) {
      const pct = Math.round((xhr.loaded / xhr.total) * 100);
      const b = loadingEl.querySelector('b');
      if (b) b.textContent = pct + '%';
    }
  },
  (err) => console.error('Erreur chargement maquette GLB :', err)
);

/* ---------- Chargement Piliers + Tapis_Priere (Draco) ---------- */
loader.load(
  'assets/models/piliers-interieur.glb',
  (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow    = true;
      o.receiveShadow = true;
    });
    scene.add(gltf.scene);
  },
  null,
  (err) => console.error('Erreur chargement piliers-interieur.glb :', err)
);

/* ---------- Chargement boxcollider mis à jour (Draco) ---------- */
loader.load(
  'assets/models/boxcollider.glb',
  (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.visible = false;   // invisible, utilisé uniquement pour les collisions BVH
    });
    scene.add(gltf.scene);
  },
  null,
  (err) => console.error('Erreur chargement boxcollider.glb :', err)
);

/* ---------- Redimensionnement plein écran ---------- */
const resize = () => {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  bloomComposer.setSize(w, h);
  finalComposer.setSize(w, h);
};
window.addEventListener('resize', resize);

/* ---------- Boucle de rendu ---------- */
const clock = new THREE.Clock();
let gameUpdate = null;   // fonction(dt) fournie par drone-game.js quand le mode jeu est actif
const tick = () => {
  raf = requestAnimationFrame(tick);
  const dt = clock.getDelta();

  if (mixer) mixer.update(dt);                      // joue l'animation des nuages

  if (gameUpdate) {
    gameUpdate(dt);
  } else if (loaded && introT < introDur) {
    // Vol caméra : on interpole la POSITION et le POINT VISÉ (orientation continue,
    // pas de saut de rotation à la 1re frame) -> fluide aussi bien à l'aller qu'au retour.
    introT += dt;
    const t = Math.min(1, introT / introDur);
    const e = introSmooth
      ? (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)   // easeInOutCubic (vols boutons)
      : 1 - Math.pow(1 - t, 3);                                       // easeOutCubic (travelling d'ouverture)
    camera.position.lerpVectors(camStart, camEnd, e);
    _look.lerpVectors(camStartTarget, target, e);
    camera.lookAt(_look);
  } else {
    controls.update();
  }

  // Pulsation douce du halo (respiration lumineuse) sur les meshes illuminés
  if (glowActive && glowMeshes.length) {
    glowT += dt;
    const inten = GLOW_BASE + Math.sin(glowT * GLOW_SPEED) * GLOW_AMP;   // pulsation lente
    glowMeshes.forEach((o) => {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => { if (m && m.emissive) m.emissiveIntensity = inten; });
    });
  }

  if (glowActive) renderSelectiveBloom();           // halo doré (bloom sélectif)
  else            renderer.render(scene, camera);   // rendu normal (perf)
};

/* ---------- Démarrage (appelé par main.js après la vidéo) ---------- */
window.startMosqueScene = () => {
  if (active) return;
  active = true;
  resize();
  stage.classList.add('on');
  stage.setAttribute('aria-hidden', 'false');
  if (loadingEl) loadingEl.classList.toggle('hidden', loaded);
  if (loaded) revealStage();
  introT = 0;
  clock.getDelta();                                  // reset dt
  if (!raf) tick();
};

/* ---------- API partagée pour le mode jeu (drone-game.js) ---------- */
window.MosqueScene = {
  scene, camera, renderer, controls,
  viewOverview, viewTarget,
  get domeRadius(){ return domeR; },
  flyTo,
  setGameUpdate(fn){ gameUpdate = (typeof fn === 'function') ? fn : null; },
  pauseLoop()  { cancelAnimationFrame(raf); raf = 0; },
  resumeLoop() { if (!raf) tick(); },
};

/* ---------- Boutons d'action (GAME / INTÉRIEUR / AR / menu) ---------- */
let toastEl = null, toastTimer = 0;
function toast(msg){
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'mq-toast';
    stage.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  // reflow puis affichage
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

const ui          = stage.querySelector('.mq-ui');
const menuWrap    = stage.querySelector('.mq-menu-wrap');
const btnGame     = stage.querySelector('[data-action="game"]');
const btnInterior = stage.querySelector('[data-action="interior"]');
const btnAr       = stage.querySelector('[data-action="ar"]');
const btnMenu     = stage.querySelector('[data-action="menu"]');

/* Révèle la scène : titre d'accueil, puis boutons cliquables (≈ après le titre) */
let readyTimer = 0;
function revealStage(){
  if (!stage || stage.classList.contains('revealed')) return;

  // Découpe le titre fort en spans animés (style "Think" AE)
  const titleStrong = stage.querySelector('.mosque-title strong');
  if (titleStrong && !titleStrong.dataset.split) {
    titleStrong.dataset.split = '1';
    const text = titleStrong.textContent;
    titleStrong.innerHTML = '';
    const BASE_DELAY = 0.5; // démarre après le mqTitleIn (.4s)
    let charIdx = 0;
    for (const ch of text) {
      const s = document.createElement('span');
      s.className = 'mq-tchar' + (ch === ' ' ? ' space' : '');
      s.textContent = ch === ' ' ? ' ' : ch;
      s.style.animationDelay = (BASE_DELAY + charIdx * 0.055) + 's';
      titleStrong.appendChild(s);
      if (ch !== ' ') charIdx++;
    }
  }

  stage.classList.add('revealed');
  clearTimeout(readyTimer);
  readyTimer = setTimeout(() => { if (ui) ui.classList.add('ready'); }, 7000);
  try { window.playDroneReveal?.(); } catch(_) {}
}

/* Ouvre / ferme le menu radial (masque GAME / SANCTUAIRE / AR quand ouvert) */
function setMenu(open){
  if (!menuWrap) return;
  menuWrap.classList.toggle('is-open', open);
  if (ui) ui.classList.toggle('menu-open', open);
  if (btnMenu) btnMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) hideInfo();                                // on repart d'un écran propre
}

/* Panneau d'informations (haut de l'écran) */
const infoEl = stage.querySelector('#mosqueInfo');
let infoTimer = 0;
/* Découpe le texte d'une fiche en mots/lettres (<span>) et pose un délai
   d'animation en cascade — révélation "bounce" lettre par lettre. */
function splitChars(block){
  if (!block) return;
  block.querySelectorAll('.mq-info-list li').forEach((li) => {
    if (li.dataset.split) return;                 // découpé une seule fois
    const words = li.textContent.split(' ');
    li.textContent = '';
    let n = 0;
    words.forEach((word, wi) => {
      const w = document.createElement('span');
      w.className = 'mq-word';
      [...word].forEach((ch) => {
        const c = document.createElement('span');
        c.className = 'mq-char';
        c.textContent = ch;
        c.style.animationDelay = (n * 0.028) + 's';   // cascade : chaque lettre démarre un peu après
        n++;
        w.appendChild(c);
      });
      li.appendChild(w);
      if (wi < words.length - 1) li.appendChild(document.createTextNode(' '));
    });
    li.dataset.split = '1';
  });
}

function showInfo(part){
  if (!infoEl) return;
  clearTimeout(infoTimer);
  // n'afficher que le bloc correspondant
  let activeBlock = null;
  infoEl.querySelectorAll('[data-info]').forEach((b) => {
    const on = b.getAttribute('data-info') === part;
    b.classList.toggle('on', on);
    if (on) activeBlock = b;
  });
  splitChars(activeBlock);                          // prépare la cascade lettre par lettre

  // Arrête le writing-sound exactement quand la dernière lettre finit son animation
  if (activeBlock) {
    const chars = activeBlock.querySelectorAll('.mq-char');
    if (chars.length) {
      chars[chars.length - 1].addEventListener('animationend', _stopWritingLoop, { once: true });
    }
  }

  if (ui) {
    ui.classList.add('info-open');           // mode "fiche" -> autres boutons cachés
    ui.classList.toggle('info-facade', part === 'facade');   // bouton crépissage : façade seulement
  }
  infoEl.classList.add('show');
}
function hideInfo(){
  if (!infoEl) return;
  clearTimeout(infoTimer);
  if (ui) { ui.classList.remove('info-open'); ui.classList.remove('info-facade'); }
  infoEl.classList.remove('show');
}

/* Ferme la fiche : coupe l'effet, déverrouille la caméra, la ramène
   à la position d'avant le clic (Façade comme Minarets), puis rouvre
   le menu radial pour choisir une autre partie. */
function closeFiche(){
  hideInfo();
  setGlow([]);
  _backSound.currentTime = 0; _backSound.play().catch(() => {});
  controls.enabled = true;                                 // déverrouille l'orbite
  controls.maxPolarAngle = Math.PI * 0.495;                // rétablit la limite anti-sol
  if (hasSavedCam) {
    flyTo(savedCamPos, savedCamTarget, 2.8);               // retour lent et fluide à la position mémorisée
    hasSavedCam = false;
  }
  setMenu(true);                                           // rouvre le menu radial (2e capture)
}

/* Vol caméra pile en face de la façade (vue de la capture) */
function flyToFacade(){
  if (!loaded) return;
  // mémorise la position courante pour pouvoir y revenir à la fermeture
  savedCamPos.copy(camera.position);
  savedCamTarget.copy(controls.target);
  hasSavedCam = true;
  controls.enabled = false;                               // caméra verrouillée pendant la fiche
  if (ui) ui.classList.add('info-open');                  // boutons cachés dès le départ du vol
  setGlow(facadeRoots);                                   // bloom : base + minarets + poteaux + torons externes

  const small = window.innerWidth < 900;
  let pos, tgt, dist;
  if (small){
    // Position Blender (-10.957, -103.98, 18.129) → Three.js (x, z_bl, -y_bl)
    pos = new THREE.Vector3(-10.957, 18.129, 103.98);
    // Direction depuis Rot XYZ Euler (97.412°, ~0°, -1.0543°) → Three.js
    const dir = new THREE.Vector3(0.018, 0.129, -0.991).normalize();
    tgt = pos.clone().addScaledVector(dir, 142);
    dist = pos.distanceTo(tgt);
    controls.maxPolarAngle = Math.PI;                     // vue figée fidèle (pas de clamp)
  } else {
    pos = facadeTarget.clone().addScaledVector(facadeNormal, facadeDist);
    pos.y = facadeTarget.y + facadeDist * 0.015;          // quasi horizontal, centré
    tgt = facadeTarget.clone();
    dist = facadeDist;
    controls.maxPolarAngle = Math.PI * 0.5;               // horizontale (évite un saut en fin de vol)
  }
  // bornes d'orbite adaptées pour ne pas être "tiré" hors cadrage
  controls.minDistance = Math.min(controls.minDistance, dist * 0.75);
  controls.maxDistance = Math.max(controls.maxDistance, dist * 1.1);
  flyTo(pos, tgt, 1.8);
  // l'info apparaît quand la caméra arrive
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => showInfo('facade'), 1300);
}

/* Effet "hologramme doré" sur les minarets : matériau émissif or + halo (bloom sélectif).
   on=true active, on=false rétablit l'apparence d'origine. */
/* Allume le glow sur un mesh : clone son matériau (pour ne PAS toucher aux autres
   parties qui partagent le même matériau dans le GLB), ajoute l'émissif or + calque bloom. */
function applyGlow(o){
  if (!o.userData._glowOn){
    o.userData._origMat = o.material;
    o.material = Array.isArray(o.material)
      ? o.material.map((m) => m.clone())
      : o.material.clone();
    o.userData._glowOn = true;
  }
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  mats.forEach((m) => {
    if (m && m.emissive){ m.emissive.setHex(0xf9d58b); m.emissiveIntensity = GLOW_BASE; }
  });
  o.layers.enable(BLOOM_LAYER);
}
/* Éteint le glow : restaure le matériau d'origine partagé et libère le clone. */
function clearGlow(o){
  if (o.userData._glowOn){
    const clones = Array.isArray(o.material) ? o.material : [o.material];
    clones.forEach((m) => m && m.dispose && m.dispose());
    o.material = o.userData._origMat;
    o.userData._origMat = null;
    o.userData._glowOn = false;
  }
  o.layers.disable(BLOOM_LAYER);
}
/* Applique l'effet bloom doré à un ensemble de nœuds (vide = tout éteindre). */
function setGlow(roots){
  glowMeshes.forEach(clearGlow);                          // éteint l'effet courant
  glowMeshes = [];
  (roots || []).forEach((root) => {
    if (!root) return;
    root.traverse((o) => { if (o.isMesh){ applyGlow(o); glowMeshes.push(o); } });
  });
  glowActive = glowMeshes.length > 0;
}

/* Vol caméra vers les minarets — position/visée figées (capture Blender).
   Grand écran : nouvelles coordonnées. Petit écran : position d'origine restaurée. */
function flyToMinarets(){
  if (!loaded) return;
  // mémorise la position courante pour pouvoir y revenir à la fermeture
  savedCamPos.copy(camera.position);
  savedCamTarget.copy(controls.target);
  hasSavedCam = true;
  controls.enabled = false;                               // caméra verrouillée pendant la fiche
  if (ui) ui.classList.add('info-open');                  // boutons cachés pendant le vol
  setGlow(minaretRoots);                                  // bloom : minarets uniquement

  const small = window.innerWidth < 900;
  // Grand écran : Blender (-54.34, -44.068, 13.536), Rot Z=-62.828°
  // Petit écran : Blender (-60.028, -47.671, 12.889), Rot Z=-72.734°
  const pos = small
    ? new THREE.Vector3(-60.028, 12.889, 47.671)
    : new THREE.Vector3(-54.34, 13.536, 44.068);
  const dir = small
    ? new THREE.Vector3(0.887, 0.129, -0.443).normalize()
    : new THREE.Vector3(0.768, -0.014, -0.641).normalize();
  const tgt = pos.clone().addScaledVector(dir, 75);
  const dist = pos.distanceTo(tgt);

  controls.maxPolarAngle = Math.PI;                       // vue figée fidèle (pas de clamp)
  controls.minDistance = Math.min(controls.minDistance, dist * 0.75);
  controls.maxDistance = Math.max(controls.maxDistance, dist * 1.1);
  flyTo(pos, tgt, 1.8);
  // l'info apparaît quand la caméra arrive
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => showInfo('minarets'), 1300);
}

/* Vol caméra vers les canaris (ventilation du toit) — position/visée figées
   (capture Blender), identiques sur petit ET grand écran */
function flyToVentilation(){
  if (!loaded) return;
  // mémorise la position courante pour pouvoir y revenir à la fermeture
  savedCamPos.copy(camera.position);
  savedCamTarget.copy(controls.target);
  hasSavedCam = true;
  controls.enabled = false;                               // caméra verrouillée pendant la fiche
  if (ui) ui.classList.add('info-open');                  // boutons cachés pendant le vol
  setGlow(canarisRoots);                                  // bloom : canaris uniquement

  // Position exacte réglée dans Blender (Z-up) -> Three.js (Y-up) : (x, z, -y)
  const pos = new THREE.Vector3(44.687, 28.618, 33.988);
  // Visée : direction "forward" issue du quaternion Blender (W .680, X .516, Y .323, Z .408),
  // convertie en Y-up
  const dir = new THREE.Vector3(-0.860, -0.259, -0.438).normalize();
  const tgt = pos.clone().addScaledVector(dir, 75);
  const dist = pos.distanceTo(tgt);

  controls.maxPolarAngle = Math.PI;                       // vue figée fidèle (pas de clamp)
  controls.minDistance = Math.min(controls.minDistance, dist * 0.75);
  controls.maxDistance = Math.max(controls.maxDistance, dist * 1.1);
  flyTo(pos, tgt, 1.8);
  // l'info apparaît quand la caméra arrive
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => showInfo('ventilation'), 1300);
}

/* Vol caméra vers la cour extérieure (espace des femmes) — coordonnées de la
   capture Blender + fiche d'info. AUCUN effet bloom sur cette partie. */
function flyToCour(){
  if (!loaded) return;
  // mémorise la position courante pour pouvoir y revenir à la fermeture
  savedCamPos.copy(camera.position);
  savedCamTarget.copy(controls.target);
  hasSavedCam = true;
  controls.enabled = false;                      // caméra verrouillée pendant la fiche
  if (ui) ui.classList.add('info-open');         // boutons cachés pendant le vol
  setGlow([]);                                   // aucun effet bloom sur cette partie

  // Position exacte réglée dans Blender (Z-up) -> Three.js (Y-up) : (x, z, -y).
  // Même rotation sur les deux écrans -> même direction ; seule la position diffère.
  const small = window.innerWidth < 900;
  const pos = small
    ? new THREE.Vector3(79.788, 49.261, -98.889)   // petit écran (réglage d'origine)
    : new THREE.Vector3(45.611, 39.035, -65.006);  // grand écran / PC (nouveau réglage)
  // Visée : direction "forward" du quaternion Blender (W .306, X .237, Y .583, Z .714), convertie en Y-up
  const dir = new THREE.Vector3(-0.695, -0.208, 0.687).normalize();
  const tgt = pos.clone().addScaledVector(dir, 90);
  const dist = pos.distanceTo(tgt);
  controls.maxPolarAngle = Math.PI;              // vue figée fidèle (pas de clamp)
  controls.minDistance = Math.min(controls.minDistance, dist * 0.75);
  controls.maxDistance = Math.max(controls.maxDistance, dist * 1.1);
  flyTo(pos, tgt, 1.8);
  // l'info apparaît quand la caméra arrive
  clearTimeout(infoTimer);
  infoTimer = setTimeout(() => showInfo('cour'), 1300);
}

function setMode(activeBtn){
  [btnGame, btnInterior].forEach((b) => {
    if (!b) return;
    const on = b === activeBtn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

const _gameBtnSound = new Audio('assets/audio/soundclic_for_btn_Game.mp3');
_gameBtnSound.preload = 'auto';
_gameBtnSound.volume  = 0.9;

const _actionSound = new Audio('assets/audio/action-sound.mp3');
_actionSound.preload = 'auto';
_actionSound.volume  = 0.85;

const _writingSound = new Audio('assets/audio/writing-sound.mp3');
_writingSound.preload = 'auto';
_writingSound.volume  = 0.7;

const _backSound = new Audio('assets/audio/back-sound.mp3');
_backSound.preload = 'auto';
_backSound.volume  = 0.85;

function _playWritingLoop() {
  _writingSound.loop = true;
  _writingSound.currentTime = 0;
  _writingSound.play().catch(() => {});
}

function _stopWritingLoop() {
  _writingSound.loop = false;
  _writingSound.pause();
  _writingSound.currentTime = 0;
}

/* Déverrouillage iOS */
document.addEventListener('audioUnlock', () => {
  _gameBtnSound.play().catch(() => {}); _gameBtnSound.pause(); _gameBtnSound.currentTime = 0;
}, { once: true });

if (btnGame) btnGame.addEventListener('click', () => {
  if (!loaded) return;
  _gameBtnSound.currentTime = 0;
  _gameBtnSound.play().catch(() => {});
  if (window.DroneGame) {                       // mode jeu drone
    hideInfo();
    setGlow([]);
    clearTimeout(infoTimer);
    controls.maxPolarAngle = Math.PI * 0.495;   // évite qu'une fiche ouverte ne fuite son état dans le jeu
    window.DroneGame.enter();
    return;
  }
  // Repli (si drone-game.js absent) : ancienne vue d'ensemble
  hideInfo();
  setGlow([]);
  setMode(btnGame);
  controls.enabled = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  flyTo(viewOverview, viewTarget, 1.8);
  window.dispatchEvent(new CustomEvent('mosque:action', { detail: 'game' }));
});

if (btnInterior) btnInterior.addEventListener('click', () => {
  if (!loaded) return;
  if (window.SanctuaryMode) {
    hideInfo();
    setGlow([]);
    setMode(btnInterior);
    window.SanctuaryMode.enter();
    return;
  }
  // Repli si sanctuary-mode.js absent
  hideInfo();
  setGlow([]);
  setMode(btnInterior);
  controls.enabled = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  flyTo(viewInterior, viewTarget, 1.8);
  window.dispatchEvent(new CustomEvent('mosque:action', { detail: 'interior' }));
});

if (btnAr) btnAr.addEventListener('click', () => {
  import('./ar-mode.js').then(mod => mod.enter());
});

if (btnMenu) btnMenu.addEventListener('click', (e) => {
  e.stopPropagation();
  const radialOpen = menuWrap.classList.contains('is-open');
  const infoOpen   = ui && ui.classList.contains('info-open');
  let detail;
  if (radialOpen) {            // menu ouvert -> on referme tout -> retour accueil (boutons reviennent)
    setMenu(false);
    hideInfo();
    setGlow([]);
    detail = 'menu-close';
  } else if (infoOpen) {       // on est sur une fiche -> la croix ferme + ramène la caméra
    closeFiche();
    detail = 'info-close';
  } else {                     // accueil -> ouvrir le menu
    setMenu(true);
    detail = 'menu-open';
  }
  window.dispatchEvent(new CustomEvent('mosque:action', { detail }));
});

/* Vidéo "Le grand crépissage" */
const btnVideo      = stage.querySelector('[data-action="video-crepissage"]');
const videoModal    = stage.querySelector('#mosqueVideo');
const videoEl       = stage.querySelector('#mosqueVideoEl');
const videoSoon     = stage.querySelector('#mosqueVideoSoon');
const videoClose    = stage.querySelector('.mq-video-close');
const videoBackdrop = stage.querySelector('.mq-video-backdrop');

function openVideo(){
  if (!videoModal) return;
  const hasSrc = !!VIDEO_CREPISSAGE;
  if (hasSrc && videoEl && videoEl.src !== VIDEO_CREPISSAGE) videoEl.src = VIDEO_CREPISSAGE;
  if (videoEl)  videoEl.hidden  = !hasSrc;
  if (videoSoon) videoSoon.hidden = hasSrc;
  videoModal.classList.add('open');
  videoModal.setAttribute('aria-hidden', 'false');
  if (hasSrc && videoEl) { try { videoEl.currentTime = 0; videoEl.play(); } catch (e) {} }
}
function closeVideoModal(){
  if (!videoModal) return;
  if (videoEl) videoEl.pause();
  videoModal.classList.remove('open');
  videoModal.setAttribute('aria-hidden', 'true');
}
if (btnVideo)      btnVideo.addEventListener('click', (e) => { e.stopPropagation(); openVideo(); });
if (videoClose)    videoClose.addEventListener('click', closeVideoModal);
if (videoBackdrop) videoBackdrop.addEventListener('click', closeVideoModal);

/* Sous-boutons du menu radial (actions à brancher plus tard) */
const radLabels = { facade: 'Façade', minarets: 'Minarets', ventilation: 'Ventilation', cour: 'Cour extérieure' };
stage.querySelectorAll('.mq-rad-item').forEach((item) => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const part = item.getAttribute('data-part');
    setMenu(false);                                   // referme le menu après sélection
    window.dispatchEvent(new CustomEvent('mosque:focus', { detail: part }));
    if (part === 'facade') {
      _actionSound.currentTime = 0; _actionSound.play().catch(() => {});
      setTimeout(_playWritingLoop, 1300);
      flyToFacade();                                  // zoom de face + infos
    } else if (part === 'minarets') {
      _actionSound.currentTime = 0; _actionSound.play().catch(() => {});
      setTimeout(_playWritingLoop, 1300);
      hideInfo();
      flyToMinarets();                                // vol caméra vers les minarets
    } else if (part === 'ventilation') {
      _actionSound.currentTime = 0; _actionSound.play().catch(() => {});
      setTimeout(_playWritingLoop, 1300);
      hideInfo();
      flyToVentilation();                             // vol caméra vers les canaris (ventilation)
    } else if (part === 'cour') {
      _actionSound.currentTime = 0; _actionSound.play().catch(() => {});
      setTimeout(_playWritingLoop, 1300);
      flyToCour();                                    // déplacement caméra vers la cour extérieure
    } else {
      hideInfo();
      toast(radLabels[part] || part);                 // (actions à brancher plus tard)
    }
  });
});
