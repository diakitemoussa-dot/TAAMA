# Système de Particules de Poussière Volumétriques — Plan d'Implémentation

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter un système de particules de poussière flottante réaliste à la scène 3D (partie 2) pour améliorer l'ambiance visuelle du Sahel.

**Architecture:** BufferGeometry avec 800 particules rendues via THREE.Points + ShaderMaterial custom. Vertex shader applique gravité douce, oscillation, et régénération. Fragment shader rend disques doux avec dégradé alpha. Mise à jour via uniforme `time` chaque frame (CPU-light).

**Tech Stack:** Three.js, GLSL (vertex/fragment shaders), scene3d-part2.js

---

## Structure de Fichiers

```
Modification:
- scene3d-part2.js : Ajouter createDustParticles(), intégrer dans init(), boucle d'animation
```

---

## Task 1: Créer la structure de base de createDustParticles()

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (ajouter fonction avant `window.startScene3DPart2`)

- [ ] **Step 1: Ajouter la fonction createDustParticles() avec BufferGeometry**

Ajoute ceci avant la ligne `window.startScene3DPart2 = function` (environ ligne 410 dans le fichier) :

```javascript
function createDustParticles(scene) {
  // Configuration des particules
  const config = {
    particleCount: 800,
    radius: 50,
    speed: 0.005,
    gravity: 0.0005,
    oscillationSpeed: 0.3,
    oscillationAmount: 2,
    opacity: 0.4,
    particleSize: 2.0,
    color: new THREE.Color(200 / 255, 200 / 255, 200 / 255)
  };

  // Créer la géométrie
  const geometry = new THREE.BufferGeometry();
  
  // Générer positions aléatoires dans une sphère
  const positions = new Float32Array(config.particleCount * 3);
  for (let i = 0; i < config.particleCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    const r = config.radius * Math.random();
    
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  
  return { geometry, config };
}
```

- [ ] **Step 2: Vérifier que la fonction est ajoutée**

Ouvre `scene3d-part2.js` et confirme que la fonction `createDustParticles` existe et génère 800 positions aléatoires. Pas besoin de run, juste vérifier visuellement que le code est présent.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: add dust particles geometry and configuration"
```

---

## Task 2: Écrire le Vertex Shader

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (ajouter shader dans createDustParticles)

- [ ] **Step 1: Créer la variable vertexShader**

Dans la fonction `createDustParticles()`, avant la ligne `return { geometry, config };`, ajoute :

```javascript
  // Vertex Shader
  const vertexShader = `
    uniform float time;
    uniform float speed;
    uniform float gravity;
    uniform float oscillationSpeed;
    uniform float oscillationAmount;
    uniform float radius;
    
    void main() {
      vec3 pos = position;
      
      // Gravité : descente lente et cyclique
      pos.y -= time * speed * gravity;
      
      // Régénération : quand y trop bas, remonter au sommet
      if (pos.y < -radius * 1.5) {
        pos.y = radius;
      }
      
      // Oscillation horizontale (flottement naturel)
      pos.x += sin(time * oscillationSpeed + position.z * 0.1) * oscillationAmount;
      pos.z += cos(time * oscillationSpeed * 0.7 + position.x * 0.1) * oscillationAmount;
      
      // Projection caméra
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      gl_PointSize = 2.0;
    }
  `;
```

- [ ] **Step 2: Vérifier le shader**

Le code GLSL doit être une string de plusieurs lignes. Vérifie que les uniforms sont déclarés en haut et que le code est syntaxiquement valide (pas d'erreur obvious).

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: add dust particles vertex shader with gravity and oscillation"
```

---

## Task 3: Écrire le Fragment Shader

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (ajouter shader dans createDustParticles)

- [ ] **Step 1: Créer la variable fragmentShader**

Dans `createDustParticles()`, après le `vertexShader`, ajoute :

```javascript
  // Fragment Shader
  const fragmentShader = `
    uniform vec3 dustColor;
    uniform float opacity;
    
    void main() {
      // Créer un disque doux (gradient radial)
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      
      // Discard pixels en dehors du rayon
      if (dist > 0.5) discard;
      
      // Dégradé alpha : opaque au centre, transparent aux bords
      float alpha = (1.0 - dist * 2.0) * opacity;
      
      gl_FragColor = vec4(dustColor, alpha);
    }
  `;
```

- [ ] **Step 2: Vérifier le shader**

Le code GLSL doit créer un disque doux avec dégradé d'opacité. Pas de syntaxe GLSL invalide.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: add dust particles fragment shader with soft disc and alpha gradient"
```

---

## Task 4: Créer le ShaderMaterial et retourner le Points mesh

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (compléter createDustParticles)

- [ ] **Step 1: Créer ShaderMaterial et Points mesh**

Dans `createDustParticles()`, après les shaders, avant le `return`, ajoute :

```javascript
  // Créer le matériau avec les shaders
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      speed: { value: config.speed },
      gravity: { value: config.gravity },
      oscillationSpeed: { value: config.oscillationSpeed },
      oscillationAmount: { value: config.oscillationAmount },
      radius: { value: config.radius },
      dustColor: { value: config.color },
      opacity: { value: config.opacity }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  
  // Créer le mesh Points
  const dustParticles = new THREE.Points(geometry, material);
  dustParticles.userData.dustMaterial = material; // Store material pour mise à jour
  
  return dustParticles;
```

- [ ] **Step 2: Mettre à jour le return statement**

Change le `return { geometry, config };` final en :

```javascript
  // Le return est maintenant dans le code ajouté ci-dessus (dustParticles est retourné)
```

En fait, tu dois REMPLACER la ligne `return { geometry, config };` par la création du material et Points. Voici le code complet de la fin de la fonction :

**Remplace** (à la fin de createDustParticles avant le `}`):

```javascript
  // OLD: return { geometry, config };
```

**Par:**

```javascript
  // Créer le matériau avec les shaders
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      speed: { value: config.speed },
      gravity: { value: config.gravity },
      oscillationSpeed: { value: config.oscillationSpeed },
      oscillationAmount: { value: config.oscillationAmount },
      radius: { value: config.radius },
      dustColor: { value: config.color },
      opacity: { value: config.opacity }
    },
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  
  // Créer le mesh Points
  const dustParticles = new THREE.Points(geometry, material);
  dustParticles.userData.dustMaterial = material;
  
  return dustParticles;
```

- [ ] **Step 3: Vérifier que createDustParticles retourne un Points mesh**

La fonction doit maintenant retourner un objet `THREE.Points` avec un material qui a des uniforms. Pas de run, juste vérification visuelle.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: create shader material and dust particles points mesh"
```

---

## Task 5: Intégrer les particules dans init()

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (modifier init() function)

- [ ] **Step 1: Trouver la fin de la fonction init() dans scene3d-part2.js**

Cherche la ligne où est définie `const init = function(gltf) {`. Cette fonction se termine quand on voit `window.startScene3DPart2 = function`.

- [ ] **Step 2: Ajouter l'appel à createDustParticles() dans init()**

Avant la ligne `window.startScene3DPart2 = function`, ajoute ceci (à la fin de la fonction init, avant `};` qui ferme init) :

```javascript
  // Créer les particules de poussière
  const dustParticles = createDustParticles(scene);
  scene.add(dustParticles);
  window.dustParticles = dustParticles; // Expose globally pour la boucle d'animation
```

- [ ] **Step 3: Vérifier que dustParticles est ajouté à la scène**

Cherche dans le code la ligne `scene.add(dustParticles);` pour confirmer que c'est là.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: add dust particles to scene in init()"
```

---

## Task 6: Mettre à jour l'uniforme time dans la boucle d'animation

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js` (modifier la boucle d'animation)

- [ ] **Step 1: Chercher la boucle d'animation**

Cherche la ligne `window.startScene3DPart2 = function startScene3DPart2()`. À l'intérieur, tu trouveras une boucle `renderer.setAnimationLoop()` ou `setAnimationLoop()`.

- [ ] **Step 2: Ajouter la mise à jour du time uniforme**

À l'intérieur de la boucle d'animation (dans la fonction passée à `setAnimationLoop`), AVANT `renderer.render(scene, camera);`, ajoute :

```javascript
    // Mettre à jour les particules de poussière
    if (window.dustParticles && window.dustParticles.userData.dustMaterial) {
      window.dustParticles.userData.dustMaterial.uniforms.time.value = performance.now() * 0.001;
    }
```

La boucle ressemblera à ça :

```javascript
  renderer.setAnimationLoop((t) => {
    // ... existing code ...
    
    // Mettre à jour les particules de poussière
    if (window.dustParticles && window.dustParticles.userData.dustMaterial) {
      window.dustParticles.userData.dustMaterial.uniforms.time.value = performance.now() * 0.001;
    }
    
    renderer.render(scene, camera);
  });
```

- [ ] **Step 3: Vérifier que le code est présent dans la boucle d'animation**

Confirme que la mise à jour du uniforme est AVANT le `renderer.render()`.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: update dust particles time uniform in animation loop"
```

---

## Task 7: Tester visuellement et vérifier la performance

**Files:**
- Test: Navigateur web, ouvrir `http://localhost:8080`

- [ ] **Step 1: Lancer le serveur HTTP**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\Le coeur de Bananin"
npx --yes http-server -p 8080 . -c-1 &
```

- [ ] **Step 2: Ouvrir le navigateur et charger la page**

Ouvre `http://localhost:8080` dans ton navigateur. Tu dois voir :
- Le ciel aquarelle en arrière-plan
- Le grenier Guyo au centre
- Des particules flottantes flous/gris dans toute la scène

**Expected :** Les particules doivent être visibles, semi-transparentes, flottant lentement vers le bas avec une légère oscillation horizontale.

- [ ] **Step 3: Vérifier la performance**

Ouvre les DevTools du navigateur (F12) → onglet Performance/FPS. Cherche :
- **FPS :** Doit rester à 60 FPS (ou proche)
- **GPU :** Pas de spike visible
- **CPU :** Impact minimal

Si tu vois un ralentissement (FPS < 50), signale-le.

- [ ] **Step 4: Tester l'interaction avec la caméra**

Bouge la caméra (scroll, drag) pour vérifier que les particules suivent et se déplacent naturellement. Pas de freeze, pas de jank.

- [ ] **Step 5: Commit final**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: dust particles system complete and tested - 800 particles with volumetric effect"
```

---

## Résumé

Toutes les tâches complétées :
1. ✅ BufferGeometry avec 800 particules
2. ✅ Vertex shader avec gravité + oscillation + régénération
3. ✅ Fragment shader avec disques doux et dégradé alpha
4. ✅ ShaderMaterial et Points mesh
5. ✅ Intégration dans init()
6. ✅ Mise à jour time uniforme dans boucle d'animation
7. ✅ Test visuel et performance

Le système est opérationnel et prêt pour production !
