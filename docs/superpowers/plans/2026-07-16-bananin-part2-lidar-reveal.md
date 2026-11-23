# Révélation LiDAR (nuage de points → mesh) — Partie 2 Bananin — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** À chaque entrée dans la partie 2 de "Le cœur de Bananin", faire apparaître le grenier (ATTIC) comme un scan LiDAR : un nuage de points coloré (violet en bas → or en haut) qui se solidifie progressivement en mesh du bas vers le haut sur ~4.5s, orbite caméra libre pendant tout le processus, rejoué à chaque nouvelle entrée.

**Architecture:** Un plan de découpe (`THREE.Plane` + `clippingPlanes` + `renderer.localClippingEnabled`) appliqué aux matériaux du mesh solide monte progressivement du bas vers le haut du modèle. En parallèle, un nuage de points (échantillonné une fois via `MeshSurfaceSampler`, trié par hauteur Y) n'affiche via `BufferGeometry.setDrawRange` que la portion de points située au-dessus du plan courant — pas de shader personnalisé nécessaire.

**Tech Stack:** three.js 0.164.0 (ESM via importmap CDN, déjà en place dans `index.html`), `MeshSurfaceSampler` (`three/addons/math/MeshSurfaceSampler.js`, disponible via le même mapping `three/addons/`). Pas de framework de test unitaire — le projet est du HTML/CSS/JS statique sans build tool. Vérification par observation directe dans le navigateur (serveur statique local).

**Convention de vérification navigateur :** depuis `Le coeur de Bananin/`, lancer `npx --yes http-server -p 8080 .` puis ouvrir `http://localhost:8080` — nécessaire car les imports ES module et le chargement du GLB échouent en `file://`.

---

## Structure des fichiers

- `Le coeur de Bananin/scene3d-part2.js` — **modifié** dans les 3 tâches : import de l'addon, infrastructure de clipping (Tâche 1), génération du nuage de points (Tâche 2), animation du scan + câblage du déclencheur (Tâche 3).

Aucun autre fichier du projet n'est concerné (le HTML/CSS ne changent pas — tout se joue en WebGL dans le canvas existant `#scene3d-part2`).

---

## Task 1 : Infrastructure de découpe (import, `localClippingEnabled`, collecte des matériaux)

But : préparer le terrain pour le plan de découpe et le nuage de points, sans changer le rendu actuel (le modèle doit toujours apparaître normalement, solide, comme avant).

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js:1-4` (imports), `:35-52` (`makeShadable`), `:97-114` (`init`)

- [ ] **Step 1 : Ajouter l'import de `MeshSurfaceSampler`**

Dans `Le coeur de Bananin/scene3d-part2.js`, remplacer les imports (lignes 1-4) :

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
```

par :

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
```

- [ ] **Step 2 : Ajouter les globals du scan LiDAR**

Juste après `const clock = new THREE.Clock();` (ligne 16), ajouter :

```js

// --- Révélation LiDAR (nuage de points -> mesh solide) ---
// Plan de découpe : ne montre le mesh solide que sous ce plan (normale vers le haut).
// Assigné aux matériaux du modèle (voir makeShadable) une fois le scan démarré.
const scanClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const solidMaterials = [];
let lidarCloud = null;
let scanBoundsMinY = 0;
let scanBoundsMaxY = 0;
let scanAnimationId = null;
const SCAN_DURATION_MS = 4500;
const SCAN_MARGIN = 0.3;
```

- [ ] **Step 3 : Collecter les matériaux solides dans `makeShadable`**

Remplacer la fonction (lignes 35-52) :

```js
function makeShadable(gltf) {
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const source = obj.material;
    const standard = new THREE.MeshStandardMaterial({
      map: source.map || null,
      color: source.map ? 0xffffff : source.color,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    obj.material = standard;
    obj.castShadow = true;
    obj.receiveShadow = true;
  });
}
```

par :

```js
function makeShadable(gltf) {
  gltf.scene.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const source = obj.material;
    const standard = new THREE.MeshStandardMaterial({
      map: source.map || null,
      color: source.map ? 0xffffff : source.color,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    obj.material = standard;
    obj.castShadow = true;
    obj.receiveShadow = true;
    solidMaterials.push(standard);
  });
}
```

- [ ] **Step 4 : Activer le clipping local sur le renderer**

Dans `init()`, remplacer :

```js
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setClearColor(FOG_COLOR, 1);
```

par :

```js
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.localClippingEnabled = true;
  renderer.setClearColor(FOG_COLOR, 1);
```

- [ ] **Step 5 : Vérifier que rien n'a changé visuellement**

Lancer le serveur local :

```bash
cd "Le coeur de Bananin" && npx --yes http-server -p 8080 .
```

Ouvrir `http://localhost:8080`, précharger l'écran de chargement, scroller jusqu'à la partie 2.

Expected : le grenier apparaît normalement, solide, comme avant cette tâche (aucun changement visuel — `solidMaterials` n'a pas encore de `clippingPlanes` assignées, `scanClipPlane` n'est pas encore utilisé).

- [ ] **Step 6 : Commit**

```bash
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat(part2): infrastructure de découpe pour la révélation LiDAR"
```

---

## Task 2 : Génération du nuage de points (échantillonnage + dégradé de couleur)

But : construire, une fois le modèle chargé, un nuage de points coloré couvrant toute la surface du grenier, trié par hauteur, prêt à être utilisé par l'animation du scan (Tâche 3).

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (nouvelle fonction `buildLidarPointCloud`, appel dans `init`)

- [ ] **Step 1 : Ajouter la fonction `buildLidarPointCloud`**

Juste avant `function addLighting(scene, target) {` (ligne 54 dans le fichier d'origine), ajouter :

```js
const LIDAR_POINT_COUNT = 25000;
const LIDAR_COLOR_BOTTOM = new THREE.Color('#55415d');
const LIDAR_COLOR_TOP = new THREE.Color('#f9d58b');

// Échantillonne la surface du modèle en un nuage de points coloré (dégradé violet en bas
// -> or en haut, selon la hauteur Y dans la bounding box), trié par Y croissant. Le tri
// permet à startLidarScan (Tâche 3) d'afficher "tous les points au-dessus d'une hauteur
// donnée" via BufferGeometry.setDrawRange, sans shader personnalisé.
function buildLidarPointCloud(gltf, bounds) {
  gltf.scene.updateMatrixWorld(true);

  const meshes = [];
  gltf.scene.traverse((obj) => {
    if (obj.isMesh && obj.geometry) meshes.push(obj);
  });

  const triangleCounts = meshes.map((mesh) => {
    const geom = mesh.geometry;
    return geom.index ? geom.index.count / 3 : geom.attributes.position.count / 3;
  });
  const totalTriangles = triangleCounts.reduce((sum, n) => sum + n, 0);

  const minY = bounds.min.y;
  const maxY = bounds.max.y;
  const heightSpan = Math.max(maxY - minY, 0.0001);

  const positions = [];
  const colors = [];
  const tempPosition = new THREE.Vector3();
  const tempColor = new THREE.Color();

  meshes.forEach((mesh, i) => {
    const share = totalTriangles > 0 ? triangleCounts[i] / totalTriangles : 0;
    const sampleCount = Math.round(LIDAR_POINT_COUNT * share);
    if (sampleCount <= 0) return;
    const sampler = new MeshSurfaceSampler(mesh).build();
    for (let s = 0; s < sampleCount; s += 1) {
      sampler.sample(tempPosition);
      tempPosition.applyMatrix4(mesh.matrixWorld);
      const t = THREE.MathUtils.clamp((tempPosition.y - minY) / heightSpan, 0, 1);
      tempColor.copy(LIDAR_COLOR_BOTTOM).lerp(LIDAR_COLOR_TOP, t);
      positions.push(tempPosition.x, tempPosition.y, tempPosition.z);
      colors.push(tempColor.r, tempColor.g, tempColor.b);
    }
  });

  const count = positions.length / 3;
  const order = Array.from({ length: count }, (_, i) => i).sort(
    (a, b) => positions[a * 3 + 1] - positions[b * 3 + 1]
  );

  const sortedPositions = new Float32Array(count * 3);
  const sortedColors = new Float32Array(count * 3);
  const sortedYs = new Float32Array(count);

  order.forEach((sourceIndex, targetIndex) => {
    sortedPositions[targetIndex * 3] = positions[sourceIndex * 3];
    sortedPositions[targetIndex * 3 + 1] = positions[sourceIndex * 3 + 1];
    sortedPositions[targetIndex * 3 + 2] = positions[sourceIndex * 3 + 2];
    sortedColors[targetIndex * 3] = colors[sourceIndex * 3];
    sortedColors[targetIndex * 3 + 1] = colors[sourceIndex * 3 + 1];
    sortedColors[targetIndex * 3 + 2] = colors[sourceIndex * 3 + 2];
    sortedYs[targetIndex] = sortedPositions[targetIndex * 3 + 1];
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(sortedPositions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(sortedColors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.03,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
  });

  const points = new THREE.Points(geometry, material);
  return { points, sortedYs, count };
}
```

- [ ] **Step 2 : Construire et ajouter le nuage de points dans `init`**

Dans `init(gltf)`, remplacer :

```js
  makeShadable(gltf);

  // Le brouillard se fond avec le fond crème de la page pour un effet de profondeur cohérent.
```

par :

```js
  makeShadable(gltf);

  const modelBounds = new THREE.Box3().setFromObject(gltf.scene);
  scanBoundsMinY = modelBounds.min.y;
  scanBoundsMaxY = modelBounds.max.y;
  lidarCloud = buildLidarPointCloud(gltf, modelBounds);
  scene.add(lidarCloud.points);

  // Le brouillard se fond avec le fond crème de la page pour un effet de profondeur cohérent.
```

- [ ] **Step 3 : Vérifier l'apparence du nuage de points**

Relancer le serveur si besoin (`cd "Le coeur de Bananin" && npx --yes http-server -p 8080 .`), ouvrir `http://localhost:8080`, scroller jusqu'à la partie 2.

Expected : le grenier solide est visible comme avant, mais recouvert d'un semis de points colorés (violet vers le bas, or vers le haut) suivant sa surface — normal à ce stade, aucun découpage n'est encore actif (Tâche 3). Si les points sont difficiles à distinguer, ouvrir la console navigateur et exécuter `lidarCloud` n'est pas exposé globalement ; à la place, vérifier visuellement le dégradé violet→or sur les surfaces du toit et de la base.

- [ ] **Step 4 : Commit**

```bash
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat(part2): génère le nuage de points LiDAR coloré du grenier"
```

---

## Task 3 : Animation du scan (balayage bas → haut) + câblage du déclencheur

But : faire monter le plan de découpe du bas vers le haut sur ~4.5s avec easing, réduire le nuage de points affiché en conséquence, et démarrer/relancer ce scan à chaque entrée en partie 2 (y compris les retours), en annulant proprement toute animation en cours.

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (nouvelles fonctions `easeInOutCubic`, `findFirstIndexAbove`, `startLidarScan` ; modification de `window.setScene3DPart2Visible`)

- [ ] **Step 1 : Ajouter les fonctions utilitaires d'easing et de recherche**

Juste avant `const dracoLoader = new DRACOLoader();` (fin du fichier), ajouter :

```js
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Recherche binaire : premier index dans sortedYs (trié croissant) dont la valeur
// dépasse strictement threshold. Les points à partir de cet index sont "au-dessus"
// du plan de découpe courant, donc pas encore solidifiés.
function findFirstIndexAbove(sortedYs, threshold) {
  let low = 0;
  let high = sortedYs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (sortedYs[mid] > threshold) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

// Lance (ou relance) le scan LiDAR : réinitialise le plan de découpe sous le modèle et
// le nuage de points complet, puis anime la montée du plan sur SCAN_DURATION_MS.
function startLidarScan() {
  if (!lidarCloud || !solidMaterials.length) return;
  if (scanAnimationId !== null) {
    cancelAnimationFrame(scanAnimationId);
    scanAnimationId = null;
  }

  solidMaterials.forEach((material) => {
    material.clippingPlanes = [scanClipPlane];
  });

  const startY = scanBoundsMinY - SCAN_MARGIN;
  const endY = scanBoundsMaxY + SCAN_MARGIN;

  lidarCloud.points.geometry.setDrawRange(0, lidarCloud.count);
  scanClipPlane.constant = -startY;

  const startTime = performance.now();

  function step(now) {
    const t = Math.min((now - startTime) / SCAN_DURATION_MS, 1);
    const eased = easeInOutCubic(t);
    const currentY = THREE.MathUtils.lerp(startY, endY, eased);

    scanClipPlane.constant = -currentY;

    const firstVisible = findFirstIndexAbove(lidarCloud.sortedYs, currentY);
    lidarCloud.points.geometry.setDrawRange(firstVisible, lidarCloud.count - firstVisible);

    if (t < 1) {
      scanAnimationId = requestAnimationFrame(step);
    } else {
      scanAnimationId = null;
    }
  }

  scanAnimationId = requestAnimationFrame(step);
}
```

- [ ] **Step 2 : Démarrer le scan à chaque entrée en partie 2**

Remplacer `window.setScene3DPart2Visible` :

```js
window.setScene3DPart2Visible = function setScene3DPart2Visible(visible) {
  if (visible === revealed) return;
  revealed = visible;
  if (visible) {
    container.hidden = false;
    if (typeof window.startScene3DPart2 === 'function') window.startScene3DPart2();
    requestAnimationFrame(() => container.classList.add('visible'));
  } else {
    container.classList.remove('visible');
  }
};
```

par :

```js
function tryStartLidarScan() {
  if (lidarCloud) {
    startLidarScan();
  } else {
    setTimeout(tryStartLidarScan, 100);
  }
}

window.setScene3DPart2Visible = function setScene3DPart2Visible(visible) {
  if (visible === revealed) return;
  revealed = visible;
  if (visible) {
    container.hidden = false;
    if (typeof window.startScene3DPart2 === 'function') window.startScene3DPart2();
    requestAnimationFrame(() => container.classList.add('visible'));
    tryStartLidarScan();
  } else {
    container.classList.remove('visible');
  }
};
```

`tryStartLidarScan` gère le cas où le modèle (et donc `lidarCloud`) n'est pas encore chargé à la toute première entrée en partie 2, en réutilisant le même pattern de polling que `startWhenReady`.

- [ ] **Step 3 : Vérifier le scan complet dans le navigateur**

Relancer le serveur si besoin (`cd "Le coeur de Bananin" && npx --yes http-server -p 8080 .`), ouvrir `http://localhost:8080`.

1. Scroller jusqu'à la partie 2.
   Expected : le plan de découpe balaie le grenier du bas vers le haut sur ~4.5s ; sous le plan, le mesh solide est visible ; au-dessus, le nuage de points (dégradé violet → or) reste visible jusqu'à ce que le plan les dépasse. L'orbite caméra (glisser la souris) fonctionne pendant tout le scan.
2. Attendre la fin du scan.
   Expected : le grenier est 100% solide, aucun point résiduel visible.
3. Scroller en arrière vers la partie 1, puis re-scroller vers la partie 2.
   Expected : le scan se rejoue depuis le début (nuage de points complet, mesh masqué sous le plan, puis nouveau balayage complet sur ~4.5s).
4. Si le point 3 échoue (le modèle reste solide sans rejouer le scan), vérifier dans la console navigateur qu'aucune erreur JS n'interrompt `startLidarScan` (ex: `lidarCloud` non défini) avant de continuer.

- [ ] **Step 4 : Commit**

```bash
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat(part2): anime le balayage LiDAR bas vers haut à chaque entrée en partie 2"
```

---

## Self-review

- **Couverture de la spec** : génération du nuage de points (Task 2), plan de découpe + `localClippingEnabled` (Task 1), animation du balayage avec easing sur 4.5s (Task 3), dégradé de couleur violet/or (Task 2), orbite libre pendant le scan (non modifiée — `controls.update()` tourne dans la boucle de rendu indépendamment du scan), rejeu à chaque entrée y compris après retour arrière (Task 3, `tryStartLidarScan` appelé à chaque `visible === true`), annulation propre de l'animation en cours avant relance (Task 3, `cancelAnimationFrame`) — tous couverts.
- **Placeholders** : aucun "TBD"/"à affiner" laissé dans le code ; la seule note d'ajustement (taille des points) est mentionnée comme vérification visuelle optionnelle, pas comme étape bloquante.
- **Cohérence des noms** : `lidarCloud`, `scanClipPlane`, `solidMaterials`, `scanBoundsMinY/MaxY`, `scanAnimationId`, `startLidarScan`, `findFirstIndexAbove`, `easeInOutCubic` utilisés de façon identique entre les tâches où ils sont définis et celles où ils sont consommés.
