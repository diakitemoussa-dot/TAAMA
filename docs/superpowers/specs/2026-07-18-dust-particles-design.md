# Particules de Poussière Volumétriques — Design

**Date :** 2026-07-18  
**Projet :** Le cœur de Bananin (Partie 2)  
**Objectif :** Ajouter un système de particules de poussière flottante réaliste à la scène 3D pour améliorer l'ambiance visuelle du désert/Sahel.

---

## Contexte

La partie 2 de "Le cœur de Bananin" affiche un grenier Guyo (Meshy_output) dans un environnement désertique. Actuellement, la scène manque de profondeur atmosphérique. L'ajout de particules de poussière volumétriques créera une ambiance plus immersive, rappelant la poussière du Sahel flottant dans la lumière.

---

## Spécification

### Style et Apparence
- **Type :** Particules semi-transparentes réalistes
- **Couleur :** Gris clair (rgb: 200, 200, 200)
- **Opacité :** 0.4 (40% transparence, semi-transparent)
- **Forme :** Disques circulaires doux (gradient radial alpha)
- **Zone d'émission :** Partout dans la scène (attaché à la caméra)
- **Compte :** 800 particules

### Mouvement
- **Type :** Flottaison lente et naturelle
- **Gravité :** Douce (descente très lente)
- **Oscillation :** Mouvement sinusoïdal horizontal (flottement naturel)
- **Vitesse globale :** 0.005 unités/frame
- **Boucle infinie :** Les particules se régénèrent en haut de la zone quand elles sortent par le bas

### Architecture Technique

#### Composants Principaux

1. **BufferGeometry**
   - 800 particules positionnées aléatoirement dans une sphère (rayon 50 unités)
   - Attributs : position, vélocité personnalisée, offset aléatoire pour oscillation

2. **ShaderMaterial** (custom)
   - Vertex Shader : applique gravité, oscillation, régénération
   - Fragment Shader : rend disques doux avec dégradé alpha

3. **Système de Mise à Jour**
   - Uniforme `time` passée à chaque frame
   - Pas de modification CPU per-frame (tout dans le shader)
   - Pas de drawCall supplémentaire, un seul `THREE.Points`

#### Paramètres Configurables

```javascript
const dustConfig = {
  particleCount: 800,      // nombre de particules
  radius: 50,              // rayon zone d'émission (autour caméra)
  speed: 0.005,            // vitesse flottaison
  gravity: 0.0005,         // gravité douce
  oscillationSpeed: 0.3,   // vitesse oscillation sinus
  oscillationAmount: 2,    // amplitude mouvement horizontal
  opacity: 0.4,            // opacité
  particleSize: 2.0,       // taille de chaque particule
  color: { r: 200, g: 200, b: 200 } // couleur gris clair
};
```

### Intégration dans scene3d-part2.js

1. **Fonction `createDustParticles()`**
   - Crée la géométrie, le shader, et le Points mesh
   - Retourne l'objet Points

2. **Appel dans `init()`**
   - Créer les particules après que la scène et la caméra soient prêtes
   - Ajouter à `scene` (pas à la caméra, la position sera contrôlée par le shader)

3. **Boucle d'animation**
   - Mettre à jour l'uniforme `time` à chaque frame
   - Les particules se mettent à jour via le shader (pas de code CPU pour chaque particule)

### Vertex Shader (pseudo-code)

```glsl
uniform float time;
varying float vAlpha;
varying float vDist;

void main() {
  // Position initiale aléatoire dans la sphère
  vec3 pos = position;
  
  // Gravité : descente lente et cyclique
  pos.y -= time * gravity;
  
  // Régénération : quand y trop bas, remonter
  if (pos.y < -radius) {
    pos.y = radius;
  }
  
  // Oscillation horizontale (flottement)
  pos.x += sin(time * oscillationSpeed + pos.z) * oscillationAmount;
  pos.z += cos(time * oscillationSpeed * 0.7 + pos.x) * oscillationAmount;
  
  // Projection caméra
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = particleSize;
  
  // Passer alpha au fragment shader
  vAlpha = opacity;
}
```

### Fragment Shader (pseudo-code)

```glsl
varying float vAlpha;

void main() {
  // Créer un disque doux (gradient radial)
  vec2 center = gl_PointCoord - 0.5;
  float dist = length(center);
  
  // Discard pixels en dehors du rayon
  if (dist > 0.5) discard;
  
  // Dégradé alpha : opaque au centre, transparent aux bords
  float alpha = (1.0 - dist * 2.0) * vAlpha;
  
  // Couleur gris clair
  vec3 dustColor = vec3(200.0/255.0, 200.0/255.0, 200.0/255.0);
  
  gl_FragColor = vec4(dustColor, alpha);
}
```

### Performance

- **Draw Calls :** +1 (un seul THREE.Points)
- **Vertices :** 800
- **Texture :** Aucune (shader uniquement)
- **Impact estimé :** Minimal (~1-2 ms sur GPU moderne)

### Vérification

1. Visuellement : particules visibles flottant naturellement partout dans la scène
2. Performance : pas de ralentissement FPS (60 FPS maintenu)
3. Ambiance : l'atmosphère est plus immersive, effet de poussière volumétrique visible

---

## Hors Scope

- Interaction des particules avec la géométrie (collision)
- Émission variable basée sur le vent
- Particules avec texture/sprite individuelles
- Animation des particules réactives à la caméra

---

## Fichiers à Modifier

- **scene3d-part2.js** : Ajouter `createDustParticles()`, intégrer dans `init()` et boucle d'animation

## Fichiers à Créer

- Aucun (code inline dans scene3d-part2.js)

---

## Notes pour l'Implémentation

- Utiliser `THREE.ShaderMaterial` pour les shaders custom
- Passer `time` comme `uniform` depuis la boucle d'animation
- Positionner le mesh des particules en (0, 0, 0) ou suivre la caméra si besoin
- Tester la visibilité et l'opacité avec les paramètres
