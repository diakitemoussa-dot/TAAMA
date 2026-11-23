# Drone N — drone supplémentaire du sanctuaire

Modèle Blender low poly exporté dans `assets/models/droneN.glb` (328 Ko, 34 meshes).

**Important :** le drone N ne remplace pas le drone déjà présent dans le jeu.
L'ancien drone (`assets/models/drone.glb`) reste le drone posé sur le sac du personnage
et le drone pilotable. Le drone N est ajouté **en plus** dans le mode sanctuaire.

## Clips exportés

| Clip | Porté par | Usage prévu |
|---|---|---|
| `Idle` | `Drone_Root` | Vol stationnaire dans le sanctuaire |
| `Dodge_Right` | `Drone_Root` | Esquive vers la droite |
| `Dodge_Left` | `Drone_Root` | Esquive vers la gauche |
| `Death_Fall` | `Drone_Root` | Chute après neutralisation |
| `Explode` | `Drone_Rig` | Explosion en 8 morceaux (os `Body`, `Lens`, `Hood`, `Pod_R`, `Pod_L`, `Fin`, `Tail`, `Gun`) |

Les clips sont exportés via des NLA tracks, une piste par animation, pour que le GLB
conserve les cinq animations.

## Convention d'orientation

- Nez du modèle : **+Z** en glTF.
- Dans le sanctuaire, le groupe `droneN` est orienté avec `lookAt` vers le personnage :
  son nez (+Z local) regarde le joueur.

## Intégration actuelle

- `app/sanctuary-mode.js` :
  - `_loadSanctuaryDroneN()` charge `droneN.glb` indépendamment du drone du joueur.
  - Le drone N est placé à `(-34.0, 7.0, 20.3)`, à environ 3 m devant le point de
    départ du personnage et légèrement sur le côté, et normalisé à 1,3 unité de large.
  - Son clip `Idle` est joué en boucle par un `AnimationMixer` dans la boucle du
    sanctuaire.
  - Il est visible uniquement pendant le mode sanctuaire ; l'ancien drone reste
    attaché au sac (`DockedDrone`) et reste pilotable.
- `app/drone-game.js`, `app/drone-viewer.js` et `app/menu.js` ne sont pas modifiés :
  le drone classique reste le drone du jeu et le drone N n'apparaît pas dans le
  sélecteur de modèle.

## À brancher ensuite (côté jeu, pas dans Blender)

- `Dodge_Left` / `Dodge_Right` sur les esquives du drone N.
- `Death_Fall` puis `Explode` à sa neutralisation, avec un fondu et les morceaux
  visibles pendant l'explosion.
- Les tirs et la logique de combat restent dans le code du jeu ; le canon du drone
  n'est qu'un élément de modèle (os `Gun`).

## Comportement de la Sentinelle (IA)

Logique pure dans `app/drone-n-ai.js` (tests : `npm run test:drone-n-logic`),
branchée dans `_updateSanctuaryDroneN` de `app/sanctuary-mode.js`.

| État | Rôle | Indicateur au-dessus du drone |
|---|---|---|
| `PATROL` | ronde entre 4 waypoints (rayon 6 m), pause + balayage à chacun | bleu |
| `ALERT` | joueur repéré : s'arrête, se tourne, délai de réaction de 0,6 s | jaune |
| `ENGAGE` | tire (seul état où le laser part) | rouge |
| `SEARCH` | rejoint la dernière position connue puis balaie ~4 s | orange |

- Perception : cône frontal de 100° sur 12 m avec ligne de vue dégagée, ou joueur
  qui court à moins de 5 m (bruit). Pas de détection quand le joueur est dans la mosquée.
- Touché par le gadget : passage direct en `ENGAGE`.
- Perte de vue pendant plus de 1,5 s en `ENGAGE` : `SEARCH`, puis retour en `PATROL`.
- Destruction, respawn, entrée et sortie du sanctuaire : l'IA repart en `PATROL`.
- Vérification dans Chrome : `npm run test:drone-n` (serveur lancé avec `npm run serve`).
