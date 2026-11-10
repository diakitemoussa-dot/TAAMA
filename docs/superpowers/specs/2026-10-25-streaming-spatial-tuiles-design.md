# Streaming spatial des tuiles de la maquette — Design

**Date :** 2026-10-25
**Projet :** Les Gardiens de Djenné (mosquée de Djenné)
**Objectif :** Ne plus télécharger ni afficher toute la ville d'un coup : découper la
maquette en tuiles, charger celles qui entourent la caméra via `fetch`/`GLTFLoader`,
les libérer au loin, et laisser le frustum culling de Three.js faire le reste.

---

## Contexte

La maquette `djenne-ar.glb` pèse **3,92 Mo** et **629 370 triangles**, dont
**247 515** pour le seul arbre Bodhi (39 %). Elle était chargée d'un bloc avant
l'affichage de la scène, ce qui bloque le premier rendu et charge des zones que
le joueur ne regarde pas.

Contraintes :

- ne pas toucher au personnage joueur ni à ses animations ;
- conserver les noms de nœuds utilisés par `mosque-viewer.js` et `drone-game.js`
  (`Mosquee_Base`, `Minarets`, `Poteaux`, `Torons_Externes`, `Canaris`, …) ;
- garder un mode de secours avec l'ancien GLB (`?tiles=0`) ;
- rendre le streaming **observable** dans l'onglet Réseau.

---

## Découpage

`tools/split-tiles.mjs` lit le GLB source avec `@gltf-transform`, puis :

1. **externalise les textures** une seule fois dans `textures/` (URI relatives) ;
2. classe chaque maillage :
   - `CORE` si son étendue XZ ≤ 110 m (mosquée, murs, portes, canaris…),
   - `CORE` aussi pour le ciel / nuages / fonds (regex `ALWAYS`),
   - `TUILE` sinon (arbre Bodhi 303 × 287 m, `Plane.011` 325 × 396 m) ;
3. découpe les maillages étendus par **centre de triangle** dans une grille de
   **96 m** ;
4. convertit positions/normales/tangentes en espace monde (les tuiles n'ont donc
   aucune transformation de nœud) ;
5. compresse en Draco (cœur 14/10/12, tuiles 12/8/11) ;
6. écrit `index.json` (centre, rayon, boîte englobante, triangles, octets).

Résultat : **21 fichiers**, **3,89 Mo** de géométrie + **210 Ko** de textures,
**629 370 triangles** au total (aucune perte).

| Part | Fichiers | Poids | Triangles |
|---|---|---|---|
| `core` | 1 | 1,52 Mo | 376 387 |
| tuiles | 20 | 2,37 Mo | 252 983 |

L'animation des nuages (`WEB_Cloud3D_4Action`) est recopiée dans `core.gltf`,
**canal translation uniquement** : la rotation et l'échelle de repos sont déjà
bakées dans la géométrie, les rejouer les appliquerait deux fois.

---

## Chargement (`app/spatial-streaming.js`)

Classe `TileStreamer` :

- `init()` : `fetch('index.json')` puis chargement des tuiles `always` (le cœur) ;
  `init()` résout quand le cœur est prêt → la scène s'affiche tout de suite.
- `update(dt)` : toutes les **0,2 s**, calcule pour chaque tuile
  `d = distance(caméra, centre) - rayon` (0 si la caméra est dans la boîte) ;
  - `d ≤ 260 m` **et** (boîte dans le frustum **ou** `d ≤ 120 m`) → à charger ;
  - `d > 400 m` → déchargée (géométries et matériaux libérés) ;
  - tri par distance croissante, **6 requêtes** simultanées maximum.
- Frustum : `THREE.Frustum` construit depuis `projectionMatrix × matrixWorldInverse`.
- Textures : dédupliquées par `texture.name` — une même image n'est uploadée
  qu'une fois, même si plusieurs tuiles la référencent.
- Événement `mosque:tiles-changed` sur `window` → `drone-game.js` reconstruit ses
  colliders (BVH) au tick suivant.
- HUD de debug avec `?streaming=1` : tuiles chargées, Mo réseau, rayon, triangles
  dessinés et draw calls.

Rayons retenus : **260 m** (chargement), **400 m** (libération), **120 m**
(chargement garanti même hors champ). La scène utile tient dans ±200 m ; au-delà,
le brouillard (`fog.far ≈ 337 m`) masque les tuiles non chargées.

---

## Intégration

`app/mosque-viewer.js` :

- `loader.load(GLB)` remplacé par `onSceneReady(root, animations)`, appelé soit
  par `TileStreamer`, soit par le chargement monolithique ;
- `?tiles=0` force l'ancien chemin ; en cas d'échec du streaming, repli
  automatique sur le GLB complet ;
- `tileStreamer.update(dt)` est appelé dans la boucle de rendu ;
- `window.MosqueScene.tileStreamer` expose l'instance (tests, debug).

`app/drone-game.js` :

- `invalidateColliders()` + écoute de `mosque:tiles-changed`.

`_serve.cjs` : types MIME `.gltf`, `.bin`, `.webp`, `.wasm` + `ETag`/`304` pour
éviter de retélécharger les textures partagées.

---

## Vérifications

| Test | Résultat |
|---|---|
| `npm run tiles:check` | 21 tuiles, 629 370 tris, bbox [-367,-355,-417] → [374,356,417], nœuds attendus présents |
| `npm run test:tiles` | 21/21 tuiles, 3,89 Mo, 0 erreur, 629 325 tris dans la scène |
| `npm run test:compare` | écart pixel moyen **1,32–1,69 / 255**, ~2 % de pixels différents |
| `npm run test:app` | cœur affiché seul (1,52 Mo), puis 4 → 7 → 10 tuiles au fil des déplacements |
| Animation nuages | déplacement mesuré sur 1,2 s : 17,5 unités (clip actif) |

Les tests tournent dans un vrai Chrome via `puppeteer-core` (SwiftShader), pas en
mode `--virtual-time-budget` : ce dernier gèle le chargement asynchrone Draco et
donne de faux blocages.

### Observer le streaming

1. `npm run serve`, ouvrir `http://localhost:8123/?streaming=1`.
2. DevTools → Réseau → filtre `gltf` (ou `bin`).
3. Au démarrage : `index.json`, `core.gltf`, `core.bin`, puis les tuiles proches.
4. Se déplacer / voler : de nouvelles `tile_X_Z.gltf` apparaissent, les lointaines
   sortent de la liste après déchargement ; le HUD montre le nombre de tuiles et
   les Mo effectivement chargés.

---

## Limites connues

- La scène est petite (±200 m utiles) : au centre du village, presque toutes les
  tuiles sont à moins de 260 m. Le gain principal est le **premier rendu**
  (1,52 Mo au lieu de 3,92) et le streaming visible aux abords.
- Pas encore de LOD : l'arbre reste à 247 515 triangles, répartis entre les tuiles.
- Les tuiles sont des `.gltf` + `.bin` séparés (choix assumé pour partager les
  textures) ; un `.glb` par tuile dupliquerait 210 Ko de textures.
