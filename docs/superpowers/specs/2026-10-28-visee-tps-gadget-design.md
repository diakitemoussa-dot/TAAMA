# Visée TPS depuis le gadget — Design

**Date :** 2026-10-28
**Projet :** Les Gardiens de Djenné (mode Sanctuaire)
**Fichier principal touché :** `app/sanctuary-mode.js`
**Objectif :** Remplacer la visée actuelle (caméra derrière la tête, tir sans lien avec le
réticule) par une visée précise à hauteur des yeux du personnage (bras et gadget visibles),
avec un tir qui part de la bouche du gadget vers le point désigné par le réticule.

---

## Contexte — état actuel

- Visée : clic droit (souris) ou LT (manette). `_toggleAim()` passe le FOV de 60° à 25° d'un
  coup, et la distance caméra à 2,2 m derrière le joueur. Le FOV de retour est codé en dur à 60°.
- Le réticule (`#snAimReticle`) est fixe au centre de l'écran, mais **le tir l'ignore** :
  - si le drone ennemi est à ≤ 30 m et visible → auto-verrouillage ;
  - sinon → rayon droit de 18 m dans la direction du personnage (`_gadgetAimFallback`).
- Le clic droit déclenche **à la fois** la visée (`mousedown`) et un tir latéral
  (`contextmenu` du canvas → `_startGadgetShot(true)`).
- Constat visuel : en visée, la caméra est collée derrière la tête, et le réticule tombe sur
  les cheveux (capture utilisateur du 2026-10-28).

## Décisions validées avec l'utilisateur

| Sujet | Décision |
|---|---|
| Type de visée | Précise, **100 % manuelle** en visée |
| Caméra de visée | **À hauteur des yeux du personnage** (os `mixamorig:Head`), pour voir les bras et le gadget en bas de l'écran, réticule dégagé. Choisi à la place d'un ancrage sur `GN_Orange` (plus stable, plus simple, bras visibles) |
| Tête / cheveux | **Masqués** pendant la visée |
| Hors visée | Comportement actuel conservé (auto-verrouillage, 18 m) |
| Architecture | Petit module dédié `app/aim-system.js` ; `sanctuary-mode.js` ne fait que le brancher |

---

## Conception

### 1. Entrées

**Manette (validé) :**

| Entrée | Action |
|---|---|
| **L2 / LT** (maintenu) | Viser (zoom, caméra aux yeux) |
| **R2 / RT** | Tirer (en visée ou non) |
| **Stick droit** | Orienter la visée : déplace le réticule sur la cible (vitesse `GP_LOOK_SPEED`, éventuellement réduite en visée pour plus de précision) |

Ces trois assignations existent déjà dans le code (`GP.down('LT')`, `GP.justPressed('RT')`,
stick droit = `cameraYaw`/`playerPitch`) : elles sont conservées telles quelles.

**Clavier + souris (d'après les conventions des jeux PC, recherche du 2026-10-28) :**
convention observée : viser = clic droit **maintenu** (CoD, The Finals, Earthfall, PUBG en TPS),
tirer = clic gauche ; la molette n'est **pas** un standard de zoom ; un multiplicateur de
sensibilité en visée est très courant.

| Entrée | Action |
|---|---|
| **Clic droit** (maintenu) | Viser (zoom, caméra aux yeux) |
| **Clic gauche** ou **F** | Tirer (en visée ou non) |
| **Souris** | Orienter la visée |
| **V** | Tir latéral hors visée (inchangé) ; en visée, tir normal |
| **Molette** | Distance de caméra hors visée (inchangé) ; sans effet pendant la visée |

- **Sensibilité en visée** : un multiplicateur `AIM_LOOK_MULT` (~0,6, réglable) s'applique à
  `LOOK_SENSITIVITY` (souris, tactile) et à `GP_LOOK_SPEED` (stick droit) tant qu'on vise,
  pour un placement plus fin du réticule.
- Pas de mode « bascule » du clic droit ni de zoom à la molette dans cette itération.
- Le clic droit **ne déclenche plus de tir latéral** : on retire `_startGadgetShot(true)` du
  `contextmenu` du canvas (le `preventDefault` reste, pour supprimer le menu contextuel).
  Le bouton tactile « CÔTÉ » et les autres entrées de tir latéral sont inchangés.
- Bouton tactile « TIR » : tire, en visée ou non.

### 2. Caméra de visée (`aim-system.js`)

- **Ancre** : position monde de l'os `mixamorig:Head` (cherché une fois au chargement du
  modèle, nom normalisé avec `PropertyBinding.sanitizeNodeName` comme `PLAYER_LOWER_BONES`),
  décalée légèrement vers le haut et vers l'avant pour se placer aux yeux (constantes
  réglables). Si l'os est introuvable : repli sur `playerPos` (hauteur des yeux, `EYE_HEIGHT`).
- **Position** : l'ancre est lissée de façon exponentielle (même formule que
  `PLAYER_CAM_SMOOTH`), pour que les animations du buste ne secouent pas la vue. La caméra se
  place un peu en retrait des yeux, afin que les bras et le gadget entrent dans le champ.
- **Orientation** : issue de `cameraYaw` / `playerPitch` (souris, stick droit), **pas** de
  l'animation. Le réticule reste donc immobile au centre.
- **FOV** : on mémorise le FOV réel de la caméra à l'entrée en visée (`_baseFov`) et on
  interpole en douceur vers `AIM_FOV` (~40°), puis retour vers `_baseFov` (fini le 60° codé en
  dur). Même facteur de lissage que le zoom de distance (`PLAYER_CAM_ZOOM_SPEED`).
- **Collisions** : on réutilise le rayon caméra existant (`_camRay` sur `colliders`) entre le
  centre du joueur et la position de la caméra, pour ne jamais traverser un mur ou un pilier
  (cas d'un mur collé au dos du personnage).
- **Transition** : la distance de caméra et la position basculent par lissage (pas de saut).
  `_toggleAim` n'écrase plus `_camDist` / `_savedCamDist` (redondants avec `_camDistView`).

### 3. Corps du personnage en visée

- Le personnage s'oriente vers `cameraYaw` avec le lissage existant (`PLAYER_TURN_RATE`).
- **Tête et cheveux** (indispensable : la caméra étant aux yeux, elle serait sinon dans le
  crâne) : `CW_Body` est un maillage unique skinné ; on cache donc la tête en
  mettant l'échelle de l'os `mixamorig:Head` à 0 (les cheveux `CW_Hair` suivent cet os et
  disparaissent avec). Rétabli à l'échelle 1 dès qu'on relâche la visée. L'échelle est
  réappliquée après la mise à jour du mixer d'animation, sinon elle est écrasée à chaque image.

### 4. Point visé et tir

- **Point visé** : à chaque image en visée, un rayon part du centre de l'écran
  (`Raycaster.setFromCamera`) et intersecte `colliders` (BVH) sur 60 m ; sans impact, on prend
  le point à 60 m. Résultat stocké dans `aimPoint`.
- **Tir en visée** : `_fireGadgetShotOnce` trace le rayon de la **bouche du gadget** vers
  `aimPoint` (au lieu de `_gadgetFallback`). `_startGadgetShot` ne pivote plus le personnage vers
  le drone et ne force plus `cameraYaw` quand on vise.
- **Touche** : le drone N est touché si le segment bouche → `aimPoint` traverse sa sphère de
  collision (rayon de tolérance en constante réglable, ~0,6 m), et que `_gadgetLineClear`
  confirme qu'aucun mur n'est devant. Les dégâts restent `GADGET_SHOT_DAMAGE`.
- **Parallaxe** : la bouche du gadget est décalée de la caméra, donc le tir est dirigé vers
  `aimPoint` (point réellement visé) et non parallèle à l'axe de la caméra ; le faisceau arrive
  bien au centre du réticule quel que soit l'éloignement.
- **Réticule** : on garde `#snAimReticle` (affichage seulement en visée) ; la classe `is-lock`
  s'active quand le rayon du centre de l'écran touche le drone (couleur distincte).
- **Hors visée** : `_getGadgetTarget`, `_gadgetAimFallback` et l'auto-verrouillage restent
  tels quels.

### 5. Cas limites

- **Visée interrompue** (perte de focus, mort du joueur, sortie du mode, `blur`) : réutilise
  `_toggleAim(false)` déjà appelé à ces endroits ; il rétablit FOV, tête et distance.
- **Ancre introuvable** (GLB sans `mixamorig:Head`) : avertissement console et repli sur
  `playerPos` (hauteur des yeux).
- **Tir agenouillé** : même logique ; l'ancre suit la tête, donc la caméra descend avec le
  personnage.
- **Manette** : LT maintient la visée ; le stick droit oriente comme aujourd'hui.
- **Tactile** : pas de bouton de visée ajouté dans cette itération (hors périmètre).

### 6. Hors périmètre (YAGNI)

Niveaux de zoom multiples, molette pour régler le FOV en visée, bouton de visée tactile,
modification des animations ou du GLB, recul de l'arme, dispersion des tirs.

---

## Tests

Le projet n'a pas de suite de tests unitaires pour le gameplay. Vérification prévue :

1. **Logique pure testable** (dans `aim-system.js`) : lissage FOV (valeur de départ et de retour
   identiques), test de touche segment/sphère. Contrôlées par un petit script Node.
   Les réglages (décalages de la caméra, `AIM_FOV`, tolérance de touche) sont des constantes
   nommées en tête de module, à ajuster après l'essai visuel.
2. **Vérification dans le navigateur** (`tools/app-check.mjs`, Puppeteer) : lancer le serveur
   (`npm run serve`), entrer en mode Sanctuaire, simuler clic droit maintenu, vérifier : FOV
   atteint ~40° puis revient à la valeur initiale, `#snAimReticle` visible puis masqué, aucune
   erreur console.
3. **Essai manuel** (à faire par l'utilisateur) : la caméra aux yeux, les bras et le gadget
   visibles en bas de l'écran, la tête masquée, un tir qui touche bien le drone quand on le vise et le
   rate quand on ne le vise pas, clic droit sans tir latéral.

## Fichiers

- **Nouveau** : `app/aim-system.js` (logique de visée : ancre, FOV, point visé, test de touche).
- **Modifié** : `app/sanctuary-mode.js` (branchement, retrait du tir latéral du clic droit,
  masquage de la tête, tir vers `aimPoint`). `aim-system.js` est importé en ES depuis
  `sanctuary-mode.js` (comme `spatial-streaming.js` l'est depuis `mosque-viewer.js`, avec un
  `?v=N` de cache-busting) ; `index.html` n'est pas modifié.
