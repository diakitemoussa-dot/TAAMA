# djenne-ville-leger.glb — ville de Djenné v2 (allégée), branchée dans le jeu

Remplace les anciennes maisons du jeu. **Branché** dans `app/mosque-viewer.js` : le cœur (mosquée, ciel, nuages) vient toujours des tuiles (`tiles/core.gltf`), et ce modèle apporte tout le reste (sol, relief, fleuve, maisons, arbres). `djenne-ar.glb` et les tuiles ne sont pas modifiés.

- Revenir à l'ancienne ville : ajouter `?oldcity=1` à l'URL.
- Si le fichier est introuvable, le jeu garde l'ancienne ville (message dans la console).

## Budget
| | |
|---|---|
| Poids | ≈ 6,1 Mo (géométrie Draco + textures JPEG) |
| Triangles | ≈ 343 000 (maisons 218 k · arbres 94 k · sol 30 k · eau 2 k) |
| Objets à dessiner | 38 primitives, 7 matériaux |
| Textures | sol 2560² + 1536², toits 2048² + 1024² (≈ 55 Mo en mémoire GPU) |
| Extension requise | `KHR_draco_mesh_compression` uniquement |

## Repère
Le modèle est **déjà recalé dans le repère de la mosquée du jeu** (nœud racine `Ville_Jeu`, échelle ≈ 1,19 par rapport aux mètres réels, proportionnelle à la mosquée du jeu qui est ≈ 19 % plus grande que la réalité). Aucune transformation à appliquer en code.
- Sol autour de la mosquée à y = 2,36 (même niveau que l'ancien plan `Plane012`, qui est masqué mais reste dans la scène).
- Relief ×2, fleuve (Bani et bras du Niger) en contrebas ; origine géographique du modèle source : 13,9056° N, −4,5553° E.

## Ce que fait le jeu avec lui
- `mosque-viewer.js` : charge le GLB avec le cœur, masque `Plane012`, supprime les collines illusoires, expose `MosqueScene.newCity` et `MosqueScene.cityReady`. Sur appareil faible (`low`), les arbres lointains `Arbres_F_*` sont masqués.
- Drone : tous les maillages (donc la ville) sont déjà des colliders.
- Sanctuaire : colliders `Sol_*` et `Bat_*` ajoutés ; le joueur marche sur le relief de la ville v2 au lieu de `Plane012`.

## Contenu
- `Sol_Ville_z18` (≈ 3 km) et `Sol_Large_z16` (≈ 10 km) : relief + texture peinte ; `Fleuve_Eau` : eau à niveau constant, lit creusé.
- `Bat_<x>_<y>` / `Bat_zone_*` : maisons par carrés de 900 m (couleurs en attribut de sommet `COLOR_0` + toits texturés). Détail selon la distance à la mosquée : < 120 m fenêtres/portes/parapets/pilastres, < 350 m parapets/portes/fenêtres, au-delà boîtes à toit-terrasse.
- `Arbres_T_*` (≈ 4 000 proches) et `Arbres_F_*` (≈ 1 200 lointains).

## Régénération
Sources dans `Documents\Djenne3D` : `Djenne3D.blend` (version détaillée), `Djenne3D_export.blend`, `generer_batiments.py`, `generer_batiments_jeu.py`.
