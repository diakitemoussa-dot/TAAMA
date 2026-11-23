# Révélation LiDAR (nuage de points → mesh) — Partie 2 "Le cœur de Bananin"

## Contexte

La partie 2 de l'expérience ([scene3d-part2.js](../../../Le%20coeur%20de%20Bananin/scene3d-part2.js)) montre le grenier (`ATTIC`) en orbite libre (OrbitControls), chargé depuis `asset/model/scene-partie2.glb`. À l'arrivée dans cette scène (déclenchée par `window.setScene3DPart2Visible(true)`, appelé depuis [scene3d.js](../../../Le%20coeur%20de%20Bananin/scene3d.js) quand le fondu de la partie 1 est terminé), le modèle apparaît actuellement d'un coup, en mesh solide.

On veut remplacer cette apparition par un effet de "scan LiDAR" : le modèle se révèle d'abord comme un nuage de points, puis se solidifie progressivement en mesh, du bas (fondations) vers le haut (toit), sur ~4.5 secondes, orbite caméra libre pendant tout le processus. Cet effet se rejoue à chaque entrée en partie 2 (y compris après un retour en arrière vers la partie 1 suivi d'un nouveau passage en partie 2).

## Approche retenue

Balayage vertical (bas → haut) : un plan de découpe (`clippingPlanes`) appliqué aux matériaux du mesh solide monte progressivement de sous le modèle vers le sommet. La portion sous le plan est mesh solide (visible), la portion au-dessus reste un nuage de points épars. Pas de shader custom : le nuage de points est trié par hauteur (Y) une fois à la génération, et on utilise `BufferGeometry.setDrawRange` pour n'afficher que la portion de points située au-dessus du plan courant.

Deux autres approches (fondu croisé uniforme ; assemblage de particules dispersées) ont été envisagées et écartées : la première ne rend pas l'idée de "scan", la seconde est plus complexe pour un gain visuel jugé moins fidèle à un rendu LiDAR.

## Génération du nuage de points

- Utiliser `MeshSurfaceSampler` (`three/addons/math/MeshSurfaceSampler.js`, déjà disponible via l'import map existant `three/addons/`).
- Pour chaque mesh "shadable" du modèle (ceux traités par `makeShadable`), créer un `MeshSurfaceSampler`, et échantillonner un nombre de points proportionnel à la surface (approximée par le nombre de triangles) du mesh, pour une répartition homogène.
- Nombre total de points cible : ~25 000 (constante ajustable `LIDAR_POINT_COUNT`).
- Construire un unique `BufferGeometry` combinant tous les points échantillonnés, avec deux attributs :
  - `position` (Float32, x/y/z monde du point)
  - `color` (Float32, dégradé linéaire entre `#55415d` en bas et `#f9d58b` en haut, interpolé selon la position Y normalisée dans la bounding box du modèle)
- Trier les points par Y croissant après échantillonnage (tri du tableau d'index, puis reconstruction des attributs dans cet ordre) — nécessaire pour que `setDrawRange` puisse exposer "tous les points au-dessus d'une hauteur donnée" comme un suffixe contigu du buffer.
- Matériau : `THREE.PointsMaterial({ vertexColors: true, size: ~0.03, sizeAttenuation: true, transparent: true })` (taille à affiner visuellement à l'implémentation).
- Le nuage de points est un objet `THREE.Points` ajouté à la scène, positionné/orienté comme le modèle GLTF (même transform que `gltf.scene`).

## Plan de découpe du mesh solide

- `renderer.localClippingEnabled = true`.
- Un seul `THREE.Plane` avec normale `(0, 1, 0)` (garde tout ce qui est *sous* le plan, `plane.constant` négatif de la hauteur de coupe courante).
- Assigné à `clippingPlanes` de chaque matériau `MeshStandardMaterial` créé dans `makeShadable` (stocker une référence aux matériaux créés pour pouvoir leur assigner le plan une fois celui-ci instancié).

## Cycle d'animation du scan

État additionnel : `scanMinY`, `scanMaxY` (bounding box Y du modèle, calculée une fois après chargement), `scanAnimationId` (handle `requestAnimationFrame` en cours, pour pouvoir l'annuler).

Fonction `startLidarScan()` :
1. Annule toute animation de scan en cours (`cancelAnimationFrame(scanAnimationId)` si présent).
2. Réinitialise le plan de coupe à `scanMinY - marge` (rien de solide visible).
3. Réinitialise `pointCloud.geometry.setDrawRange(0, totalPointCount)` (tous les points visibles).
4. Lance une boucle `requestAnimationFrame` sur ~4500ms avec easing ease-in-out :
   - `currentY = lerp(scanMinY - marge, scanMaxY + marge, easeInOut(t))`
   - Met à jour `plane.constant = -currentY`.
   - Recherche (recherche binaire sur le tableau Y trié, ou index incrémental puisque `currentY` est croissant) le premier index de point dont `y > currentY`, et appelle `pointCloud.geometry.setDrawRange(firstIndexAbove, totalPointCount - firstIndexAbove)`.
   - À la fin (`t >= 1`) : plan au-dessus du sommet, `setDrawRange(0, 0)` (aucun point affiché), mesh 100% solide.

Déclenchement : dans `window.setScene3DPart2Visible`, dans la branche `if (visible)`, après `startScene3DPart2()` (ou une fois le modèle chargé et le nuage de points construit — attendre que les deux soient prêts avant de lancer `startLidarScan()`, avec le même pattern de polling que `startWhenReady`).

Pendant le scan, l'`OrbitControls` existant continue de fonctionner sans aucune modification (aucun verrouillage de caméra).

## Cas limites

- **Sortie avant la fin du scan** : si l'utilisateur retourne en partie 1 pendant le scan (`setScene3DPart2Visible(false)`), l'animation `requestAnimationFrame` en cours continue en arrière-plan (le conteneur est simplement masqué par CSS) ; au retour, `startLidarScan()` l'annule et repart de zéro — pas de fuite ni de double-boucle.
- **Modèle pas encore chargé à la première entrée** : le scan démarre seulement une fois `loadedGltf` disponible et le nuage de points construit, en réutilisant le pattern d'attente déjà en place (`startWhenReady`).
- **Rejeu multiple rapide** (va-et-vient rapide entre les parties) : chaque nouvel appel à `startLidarScan()` annule proprement l'animation précédente avant d'en lancer une nouvelle, donc pas de plans/points désynchronisés.

## Vérification

Test manuel dans le navigateur :
1. Scroller jusqu'à la partie 2 et observer le balayage bas → haut sur ~4.5s, avec dégradé violet → or sur les points, orbite caméra libre pendant le scan.
2. Vérifier que le modèle est 100% solide (aucun point résiduel visible) une fois le scan terminé.
3. Scroller en arrière vers la partie 1, puis revenir en partie 2 : vérifier que le scan se rejoue depuis le début (nuage de points complet, mesh masqué, puis nouveau balayage complet).
