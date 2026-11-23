# Design — Choix de drone (drone classique ↔ vaisseau) dans le mode GAME

Date : 2026-07-02
Statut : validé (en attente de plan d'implémentation)

## Objectif

Ajouter au **mode GAME** la possibilité de choisir le modèle piloté, **sans remplacer** le
drone actuel : l'utilisateur bascule entre le **drone classique** (existant) et un nouveau
**drone-vaisseau** animé. Le système de vol reste identique ; seuls le modèle visuel et sa
logique d'animation changent.

## Contexte technique existant

- Mode GAME implémenté dans `app/drone-game.js` (`window.DroneGame = { enter, exit }`).
- Bouton **GAME** (`app/mosque-viewer.js`, ~ligne 873) appelle `window.DroneGame.enter()`.
- Le vol vit dans un `rig` (`THREE.Object3D`) qui porte position + cap (yaw). Le modèle
  visuel est un **enfant** du rig → découplé de la physique.
- Chargement drone actuel : `GLTFLoader` + `DRACOLoader` (decoder jsDelivr), normalisation
  (centrage, `scale = DRONE_SIZE / maxDim`, `rotation.y = π/2`), `AnimationMixer` pour les
  hélices (vitesse lissée `propSpeed`).
- Entrées normalisées déjà calculées : `input.lx` (yaw), `input.ly` (altitude),
  `input.rx` (strafe), `input.ry` (avance) ; vitesses amorties `vel.{fwd,side,up,yaw}`.
- L'app tourne en **ESM natif via importmap** (three@0.165.0 + three-mesh-bvh@0.7.8 en CDN),
  servie par `_serve.cjs` (port 8123). `assets/models/` **à la racine** est le dossier réel.

## Asset — vaisseau.glb

- Fichier cible : `assets/models/vaisseau.glb` (copié depuis
  `mosquee-djenne/assets/models/vaisseau.glb`, ~206 Ko, **compressé Draco**).
- Nœud racine : `Ship_Root`. Nez du vaisseau = **+Z** après import (à vérifier/ajuster).
- 5 clips d'animation « sur place » (ne déplacent pas le vaisseau) :
  `Hover`, `Forward`, `Reverse`, `TurnLeft`, `TurnRight`.

## Architecture

### 1. Sélecteur (UI)
- Un bouton dans le HUD du jeu (`droneHud`), cohérent avec le style existant, qui alterne
  **🚁 Drone ↔ 🛸 Vaisseau**.
- Choix **mémorisé** dans `localStorage` (clé ex. `djenne.droneModel`), **défaut = drone**
  (comportement actuel strictement inchangé si l'utilisateur ne touche à rien).

### 2. Chargement des modèles
- `vaisseau.glb` chargé **à la demande** (lazy) au premier passage au vaisseau, puis mis en
  cache mémoire. Réutilise le `GLTFLoader` + `DRACOLoader` déjà configurés.
- Normalisation partagée (centrage + `DRONE_SIZE/maxDim`) avec un **offset d'orientation
  propre à chaque modèle** :
  - drone : `rotation.y = π/2` (existant),
  - vaisseau : offset à déterminer pour aligner le nez (+Z) sur le sens du vol
    (paramètre clairement isolé et ajustable).

### 3. Contrôleurs d'animation (un par modèle)
Abstraction minimale : chaque modèle fournit une fonction `tickAnim(dt, signals)` appelée
dans la boucle.
- **Drone** : comportement actuel (hélices continues pilotées par `propSpeed`).
- **Vaisseau** : machine à états pilotée par `vel`/`input` :
  - avance (`vel.fwd > seuil`) → `Forward`
  - recul (`vel.fwd < -seuil`) → `Reverse`
  - cap gauche/droite (`vel.yaw`) → `TurnLeft` / `TurnRight`
  - sinon → `Hover`
  - **crossfade ~0.25 s** entre actions, clips en `THREE.LoopRepeat`.
  - **Priorité : le virage l'emporte** visuellement sur l'avance (règle simple et lisible).

### 4. Vol / physique
- **Inchangé.** Le vaisseau vole avec le même système que le drone (réglages, caméra chase,
  collisions). Aucune régression possible sur le drone existant.

### 5. Swap à chaud
- Au clic sur le bouton : retirer le modèle courant du `rig`, attacher l'autre (le charger si
  besoin), reconstruire l'`AnimationMixer` et sélectionner le contrôleur d'animation
  correspondant. Position / vitesse / cap conservés → le vol continue sans interruption.

## Composants / fichiers touchés
- `app/drone-game.js` : généralisation du chargement (fonction paramétrée par modèle),
  registre des 2 modèles, sélection + swap, contrôleurs d'animation, câblage du bouton HUD.
- `index.html` : ajout du bouton bascule dans `#droneHud`.
- `assets/models/vaisseau.glb` : copie de l'asset à la racine.
- (styles) : petite règle CSS pour le bouton si nécessaire.

## Flux de données
`clic bouton` → maj `localStorage` + `setModel(id)` → (charge si besoin) → swap dans `rig`
→ la boucle `update(dt)` appelle `tickAnim` du modèle actif ; le déplacement reste piloté
par `input`/`vel` comme aujourd'hui.

## Gestion des erreurs
- Échec de chargement `vaisseau.glb` → log console + **repli automatique sur le drone**, le
  bouton reste sur « Drone » (pas de blocage du jeu).
- Clips manquants côté vaisseau → si un clip attendu est absent, se rabattre sur `Hover`.

## Tests / vérification
- Vérif visuelle (Playwright + `_serve.cjs` port 8123) : entrer en GAME, basculer
  drone → vaisseau, vérifier orientation du nez, crossfades (avance/recul/virages), retour
  `Hover` au neutre, et que le **drone par défaut** est inchangé.
- Vérifier la persistance `localStorage` (recharger → modèle mémorisé).
- Vérifier le repli si `vaisseau.glb` absent/corrompu.

## Hors périmètre (YAGNI)
- Pas de nouvelle physique de vol propre au vaisseau.
- Pas d'écran de choix séparé ni de réglage dans le menu radial.
- Pas de 3ᵉ modèle ni de personnalisation (couleur, etc.).
