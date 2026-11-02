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
import { TileStreamer } from './spatial-streaming.js?v=3';
import { detectQuality, QUALITY_PRESETS, createDynamicRes, currentBytesPlan } from './device-quality.js?v=5';

const canvas    = document.getElementById('mosqueCanvas');
const stage     = document.getElementById('mosqueStage');
const loadingEl = document.getElementById('mosqueLoading');
if (!canvas) throw new Error('mosqueCanvas introuvable');

const MODEL_URL     = 'assets/models/djenne-ar.glb';
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';

// URL de la vidéo du grand crépissage (à renseigner — laisser vide affiche "bientôt disponible")
const VIDEO_CREPISSAGE = '';

/* ---------- Renderer ---------- */
const QUALITY = detectQuality();
const QUALITY_PRESET = QUALITY_PRESETS[QUALITY];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: QUALITY !== 'low' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PRESET.maxPixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Rendu fidèle aux couleurs (comme l'aperçu Blender) — ACES assombrissait trop l'argile
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = QUALITY_PRESET.shadows;
// filtre des ombres selon le palier (PC : PCFSoft comme avant ; mobile : filtre plus léger)
renderer.shadowMap.type = { basic: THREE.BasicShadowMap, pcf: THREE.PCFShadowMap, pcfsoft: THREE.PCFSoftShadowMap }[QUALITY_PRESET.shadowType] || THREE.PCFSoftShadowMap;
// résolution dynamique (mobile seulement) : baisse d'un cran si < 40 fps pendant 2 s, remonte si stable
const dynRes = createDynamicRes({ min: QUALITY_PRESET.minPixelRatio, max: Math.min(window.devicePixelRatio, QUALITY_PRESET.maxPixelRatio) });

/* ---------- Scène + fog atmosphérique ---------- */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9a06b);       // orangé du couchant (filet visible hors dôme)
scene.fog = new THREE.Fog(0xefc9a0, 300, 900);      // brume chaude du soir (ajustée après chargement)

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

const hiddenSprites = [];                 // sprites (nuages/soleil) masqués pendant la passe de halo
function darkenNonBloomed(obj){
  if ((obj.isSprite || obj.isPoints) && obj.visible){
    obj.visible = false;
    hiddenSprites.push(obj);
  }
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
  hiddenSprites.forEach((s) => { s.visible = true; });
  hiddenSprites.length = 0;
  scene.background = bg;
  scene.fog = fg;
  finalComposer.render();
}

/* ---------- Lumières (extérieur, coucher de soleil) ---------- */
const sun = new THREE.DirectionalLight(0xffb877, 1.3);   // lumière dorée, soleil bas
sun.position.set(-245, 74, -245);                         // aligné sur le soleil du ciel (sky.js)
sun.castShadow = true;
sun.shadow.mapSize.set(QUALITY_PRESET.shadowSize, QUALITY_PRESET.shadowSize);   // PC : 4096 comme avant
sun.shadow.camera.near   =   1;
sun.shadow.camera.far    = 700;
sun.shadow.camera.left   = -320;
sun.shadow.camera.right  =  320;
sun.shadow.camera.top    =  320;
sun.shadow.camera.bottom = -320;
sun.shadow.bias          = -0.003;
sun.shadow.normalBias    =  0.15;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0xffd9b0, 0xb98a5e, 1.0);   // reflets chauds du couchant
scene.add(hemi);
const amb = new THREE.AmbientLight(0xfff1e0, 0.32);  // réduit pour que les ombres restent visibles
scene.add(amb);
const moonLight = new THREE.DirectionalLight(0xaec4f0, 0);  // clair de lune (piloté par daycycle.js)
moonLight.position.set(160, 240, -160);
scene.add(moonLight);

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
const frameHooks = [];                        // hooks appelés chaque frame (ciel, nuages générés…)
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
const doorTarget   = new THREE.Vector3();   // centre de la porte principale (missions)
const canarisTarget = new THREE.Vector3();  // centre des canaris du toit (missions)
let   facadeDist   = 120;                   // distance caméra ↔ façade
let   domeR        = 0;                      // rayon du dôme (limite)
const skyboxMeshes = [];                     // meshes du dôme de ciel (skybox) — masqués définitivement
const mosqueBox    = new THREE.Box3();       // boîte englobante de la mosquée (missions)

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

/* Met à jour le pourcentage affiché pendant le chargement. */
function setLoadingPct(pct) {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  window.dispatchEvent(new CustomEvent('mosque:loading', { detail: { pct: v } }));   // écran de chargement (game-ui.js)
  if (!loadingEl) return;
  const b = loadingEl.querySelector('b');
  if (b) b.textContent = v + '%';
}

/**
 * Prépare la scène dès que le cœur de la maquette est disponible.
 * `root` contient au minimum le groupe `MosqueeTiles` (tuiles) ou la scène GLB complète.
 */
function onSceneReady(root, animations) {
    scene.add(root);


    // Animations du GLB (ex. nuages) -> lecture en boucle
    if (animations && animations.length){
      mixer = new THREE.AnimationMixer(root);
      mixer.timeScale = 0.5;                        // vitesse de lecture (0.5 = 2× plus lent)
      animations.forEach((clip) => {
        const action = mixer.clipAction(clip);
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
      });
    }

    // Repérer la mosquée + désactiver le fog sur ciel & nuages (restent nets)
    let mosque = null;
    let domeRadius = 0;
    const domeCenter = new THREE.Vector3();
    const skyboxFound = [];                 // dôme de ciel repéré pendant le parcours
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
          skyboxFound.push(o);               // sera masqué : skybox supprimée
        }
        // Nouvelle ville : l'ancien grand sol plat (Plane012, y=2.36) cacherait le relief et le fleuve.
        // Il reste dans la scène (le sanctuaire l'ignore alors comme collider, cf. MosqueScene.newCity).
        if (newCityLoaded && /^Plane012$/i.test(n)) o.visible = false;
        // Ombres naturelles sur tous les meshes sauf ciel/nuages
        if (!/Sky|Sphere/i.test(n)) {
          o.castShadow    = true;
          o.receiveShadow = true;
        }
      }
      if (!mosque && /Mosquee_Base/i.test(o.name)) mosque = o;
    });

    // Skybox supprimée : le dôme de ciel ne s'affiche plus (le fond bleu + le fog
    // atmosphérique prennent le relais). Les calculs internes (domeRadius, collines,
    // barrière de vol, brouillard) continuent d'utiliser ses dimensions.
    skyboxFound.forEach((m) => { m.visible = false; skyboxMeshes.push(m); });

    // Cadrage sur la mosquée (ou la scène entière en secours)
    const focus = mosque || root;
    const box = new THREE.Box3().setFromObject(focus);
    mosqueBox.copy(box);
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
    // Ville v2 : brume réduite (portée ×2,2, début ×1,5) pour voir plus loin, notamment en vol de drone.
    // daycycle.js module ensuite `far` avec la brume du matin à partir de fogFarBase.
    fogFarBase = domeRadius * 0.95 * (newCityLoaded ? 2.2 : 1);
    scene.fog.near = dist * 0.6 * (newCityLoaded ? 1.5 : 1);   // brume rapprochée de la caméra
    scene.fog.far  = fogFarBase;
    if (scene.fog.far <= scene.fog.near) scene.fog.far = scene.fog.near * 1.6;

    // La caméra reste À L'INTÉRIEUR du dôme de ciel
    controls.minDistance = r * 0.7;
    controls.maxDistance = domeRadius * 0.8 * (newCityLoaded ? 2.6 : 1);   // ville v2 : on peut s'éloigner pour la survoler

    // Illusion de collines tout autour du village (horizon, sous le dôme)
    // box.min.y = niveau réel du sol (bas de la mosquée) pour ne pas flotter ni être sous terre
    if (!newCityLoaded) addHills(domeCenter, domeRadius, box.min.y);   // la nouvelle ville a son propre relief

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

    // Centres ciblés par les missions (photo de la porte / des canaris)
    doorTarget.copy(facCenter);
    if (mainDoor) new THREE.Box3().setFromObject(mainDoor).getCenter(doorTarget);
    canarisTarget.set(target.x, box.max.y, target.z);
    if (canarisRoots[0]) new THREE.Box3().setFromObject(canarisRoots[0]).getCenter(canarisTarget);

    loaded = true;
    window.dispatchEvent(new CustomEvent('mosque:loaded'));
    if (active && loadingEl) loadingEl.classList.add('hidden');
    if (active) revealStage();                              // affiche le titre puis les boutons
}

/* ---------- Chargement : tuiles spatiales (défaut) ou GLB monolithique (?tiles=0) ---------- */
const TILES_INDEX_URL = `assets/models/${QUALITY_PRESET.tilesDir}/index.json?v=1`;
const URL_PARAMS = new URLSearchParams(location.search);
const USE_TILES = URL_PARAMS.get('tiles') !== '0';
let tileStreamer = null;
/* Budget de streaming = palier appareil (rayons, requêtes) x palier réseau (rayon réduit, octets/s). PC + bon réseau : valeurs d'origine. */
function tileOptions() {
  const pl = currentBytesPlan();
  return {
    loadRadius: QUALITY_PRESET.tileLoad * pl.radiusFactor,
    unloadRadius: QUALITY_PRESET.tileUnload * pl.radiusFactor,
    nearRadius: 120 * pl.radiusFactor,
    maxConcurrent: pl.concurrent,
    bytesPerSec: pl.bytesPerSec,
  };
}
let _netToastDone = false;
window.addEventListener('quality:net', (e) => {                  // le réseau change en cours de partie : le streaming s'adapte
  if (tileStreamer && tileStreamer.setBudget) tileStreamer.setBudget(tileOptions());
  if (e.detail && e.detail.net === 'slow' && !_netToastDone && loaded) {
    _netToastDone = true;
    toast('Connexion lente : qualité réduite pour économiser tes données. Réglable dans Options › Affichage.');
  }
});
// Ville v2 : seulement avec les tuiles (le GLB monolithique contient déjà l'ancienne ville)
const NEW_CITY = USE_TILES && URL_PARAMS.get('oldcity') !== '1';

function loadMonolithicScene() {
  setLoadingPct(0);
  loader.load(
    MODEL_URL,
    (gltf) => onSceneReady(gltf.scene, gltf.animations),
    (xhr) => { if (xhr.total) setLoadingPct((xhr.loaded / xhr.total) * 100); },
    (err) => console.error('Erreur chargement maquette GLB :', err),
  );
}

/* ---------- Ville de Djenné v2 (allégée) ----------
   assets/models/djenne-ville-leger.glb : sol + relief + fleuve + maisons + arbres, déjà recalée dans le
   repère de la mosquée du jeu (voir djenne-ville-leger.INFO.md). Le cœur (mosquée, ciel, nuages) reste
   celui des tuiles ; les anciennes maisons ne sont plus chargées. ?oldcity=1 rétablit l'ancienne ville. */
const CITY_URL = `assets/models/${currentBytesPlan().cityGlb}?v=4`;   // mobile / réseau lent : textures de la ville réduites de moitié
let cityPromise = Promise.resolve(false);
let newCityLoaded = false;
let fogFarBase = 0;                  // portée de base de la brume (m), lue par daycycle.js

function loadNewCity() {
  cityPromise = new Promise((resolve) => {
    loader.load(
      CITY_URL,
      (gltf) => {
        const city = gltf.scene;
        city.name = 'VilleDjenne';
        city.traverse((o) => {
          if (!o.isMesh) return;
          const n = o.name || '';
          const water = /^Fleuve/i.test(n);
          o.receiveShadow = !water;
          o.castShadow = /^Bat_/i.test(n);
          if (/^Arbres_/i.test(n) && QUALITY !== 'low') {                        // les arbres projettent une ombre (feuillage plat : ombre des deux faces)
            o.castShadow = true;
            for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) { m.shadowSide = THREE.DoubleSide; m.needsUpdate = true; }
          }
          if (QUALITY === 'low' && /^Arbres_F/i.test(n)) o.visible = false;   // arbres lointains : pas sur mobile
          if (water) o.renderOrder = 1;
        });
        scene.add(city);
        newCityLoaded = true;
        resolve(true);
      },
      (xhr) => { if (xhr.total) setLoadingPct(50 + (xhr.loaded / xhr.total) * 50); },
      (err) => { console.warn('[Ville v2] indisponible, ancienne ville conservée :', err); resolve(false); },
    );
  });
  return cityPromise;
}

if (USE_TILES) {
  tileStreamer = new TileStreamer({
    scene, camera, loader, renderer,
    indexUrl: TILES_INDEX_URL,
    alwaysOnly: NEW_CITY,
    ...tileOptions(),
    hud: URL_PARAMS.has('streaming'),
    onProgress: (s) => {
      const pct = (s.bytes / (s.preloadBytes || s.bytesTotal || 1)) * 100;
      setLoadingPct(NEW_CITY ? pct * 0.5 : pct);
    },
  });
  tileStreamer.init()
    .then(async ({ root, animations }) => {
      if (NEW_CITY) await loadNewCity();
      onSceneReady(root, animations);
      tileStreamer.refresh();                 // évalue tout de suite les tuiles voisines
    })
    .catch((err) => {
      console.warn('[Streaming] tuiles indisponibles, repli sur le GLB complet :', err);
      tileStreamer = null;
      loadMonolithicScene();
    });
} else {
  loadMonolithicScene();
}

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

/* ---------- Chargement Personnages (plans détourés, positions Blender) ---------- */
// Cache-buster : force le rechargement de la dernière version à chaque ré-export
// (évite d'avoir à vider le cache / Ctrl+Shift+R après un nouvel export Blender)
loader.load(
  `assets/models/personnages.glb?v=${Date.now()}`,
  (gltf) => {
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow    = true;
      o.receiveShadow = false;                       // plans fins : pas de réception d'ombre
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        m.transparent = true;                        // fond détouré = transparent
        m.alphaTest   = 0.5;                         // découpe nette des bords
        m.side        = THREE.DoubleSide;            // plan visible des deux côtés
      });
    });
    scene.add(gltf.scene);                           // aucune transform -> positions identiques à Blender
  },
  null,
  (err) => console.error('Erreur chargement personnages.glb :', err)
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
  { const pr = dynRes.update(dt); if (pr) { renderer.setPixelRatio(pr); bloomComposer.setPixelRatio(pr); finalComposer.setPixelRatio(pr); resize(); } }

  if (mixer) mixer.update(dt);                      // joue l'animation des nuages
  for (const fn of frameHooks){ try { fn(dt); } catch (_) {} }   // hooks externes (ciel, nuages…)

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

  // Streaming spatial : charge/libère les tuiles selon la position de la caméra.
  if (tileStreamer) tileStreamer.update(dt);

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
  get mosqueBox(){ return mosqueBox; },
  get facadeTarget(){ return facadeTarget; },
  get facadeNormal(){ return facadeNormal; },
  get facadeDist(){ return facadeDist; },
  get doorTarget(){ return doorTarget; },
  get canarisTarget(){ return canarisTarget; },
  get tileStreamer(){ return tileStreamer; },
  get flying(){ return loaded && introT < introDur; },   // travelling de caméra en cours (la manette n'oriente pas pendant)
  get newCity(){ return newCityLoaded; },          // ville v2 chargée (sol/relief/maisons de djenne-ville-leger.glb)
  get cityReady(){ return cityPromise; },          // promesse : ville v2 prête (true) ou indisponible (false)
  get fogFarBase(){ return fogFarBase; },          // portée de base de la brume (0 tant que la scène n'est pas prête)
  flyTo,
  setGameUpdate(fn){ gameUpdate = (typeof fn === 'function') ? fn : null; },
  setAutoRotate(on){                    // rotation douce de la maquette (menu principal)
    controls.autoRotate = !!on;
    controls.autoRotateSpeed = 0.6;
  },
  setSkyboxVisible(on){                 // afficher/masquer le dôme de ciel (skybox)
    skyboxMeshes.forEach((m) => { m.visible = !!on; });
  },
  addFrameHook(fn){                     // hook appelé chaque frame — fonction(dt)
    if (typeof fn === 'function') frameHooks.push(fn);
  },
  setSunLightDirection(x, y, z){        // recale la lumière du jour (synchro soleil du ciel, sky.js)
    sun.position.set(x, y, z).normalize().multiplyScalar(354);
  },
  get sunLight(){ return sun; },        // lumières exposées pour le cycle jour/nuit (daycycle.js)
  get hemiLight(){ return hemi; },
  get ambLight(){ return amb; },
  get moonLight(){ return moonLight; },
  get loaded(){ return loaded; },
  setShadows(on){                       // Options › Ombres portées
    renderer.shadowMap.enabled = !!on;
    sun.castShadow = !!on;
    scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      ms.forEach((m) => { m.needsUpdate = true; });
    });
  },
  applyQuality(level){                  // Options › Qualité graphique (la résolution change tout de suite ; les tuiles au prochain lancement)
    const p = QUALITY_PRESETS[level] || QUALITY_PRESET;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, p.maxPixelRatio));
    dynRes.reset(Math.min(window.devicePixelRatio, p.maxPixelRatio));
    resize();
    return p;
  },
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
  window.dispatchEvent(new CustomEvent('mosque:revealed'));
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
window.GameAudio?.track(_gameBtnSound, 'effects');

const _actionSound = new Audio('assets/audio/action-sound.mp3');
_actionSound.preload = 'auto';
_actionSound.volume  = 0.85;
window.GameAudio?.track(_actionSound, 'effects');

const _writingSound = new Audio('assets/audio/writing-sound.mp3');
_writingSound.preload = 'auto';
_writingSound.volume  = 0.7;
window.GameAudio?.track(_writingSound, 'effects');

const _backSound = new Audio('assets/audio/back-sound.mp3');
_backSound.preload = 'auto';
_backSound.volume  = 0.85;
window.GameAudio?.track(_backSound, 'effects');

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
  import('./ar-mode.js?v=3').then(mod => mod.enter());
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
