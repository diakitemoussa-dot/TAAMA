import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('droneCanvas');
if (!canvas) throw new Error('droneCanvas introuvable');

const DRONE_URL = 'assets/models/drone.glb';
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();

// Environnement neutre (studio) — indispensable pour que les matériaux
// métalliques/PBR du drone soient visibles (sinon ils reflètent le vide = noir).
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
camera.position.set(0, 1.0, 3.6);
camera.lookAt(0, 0, 0);

const key = new THREE.DirectionalLight(0xfff2cc, 2.4);
key.position.set(2, 3, 2);
scene.add(key);

const rim = new THREE.DirectionalLight(0xb89cff, 1.4);
rim.position.set(-2, 1.2, -1.5);
scene.add(rim);

const ambient = new THREE.AmbientLight(0x9c7fb8, 0.7);
scene.add(ambient);

const fillBelow = new THREE.HemisphereLight(0xf9d58b, 0x2a1f33, 0.5);
scene.add(fillBelow);

const droneGroup = new THREE.Group();
scene.add(droneGroup);

let mixer = null;
let droneRoot = null;

const draco = new DRACOLoader();
draco.setDecoderPath(DRACO_DECODER);

const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(draco);

gltfLoader.load(
  DRONE_URL,
  (gltf) => {
    droneRoot = gltf.scene;


    const box = new THREE.Box3().setFromObject(droneRoot);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);

    droneRoot.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 1.8 / maxDim;
    droneRoot.scale.setScalar(scale);

    droneGroup.add(droneRoot);

    if (gltf.animations && gltf.animations.length > 0) {
      mixer = new THREE.AnimationMixer(droneRoot);
      // Page d'accueil : on ne joue QUE le vol stationnaire (Idle_Hover),
      // sinon tous les clips de déplacement se superposent.
      const idle = THREE.AnimationClip.findByName(gltf.animations, 'Idle_Hover')
                || gltf.animations[0];
      const action = mixer.clipAction(idle);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
    }
  },
  undefined,
  (err) => console.error('Erreur chargement drone GLB :', err)
);

const resize = () => {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(64, rect.width);
  const h = Math.max(64, rect.height);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
};
resize();
new ResizeObserver(resize).observe(canvas);

const clock = new THREE.Clock();
let prevTime = performance.now();
const animate = () => {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);

  droneGroup.rotation.y += dt * 0.35;
  droneGroup.position.y = Math.sin(performance.now() * 0.001) * 0.04;

  renderer.render(scene, camera);
};
animate();
