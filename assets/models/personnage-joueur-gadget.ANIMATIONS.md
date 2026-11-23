# Personnage joueur + gadget — fiche de passation des animations (`personnage-joueur-gadget.glb`)

Fichier : `assets/models/personnage-joueur-gadget.glb` — **2,80 Mo**, **12 clips**, 65 os, 8 meshes, 31 matériaux, 1 texture.
Export : Blender 5.2 → glTF 2.0 (GLB), mode **ACTIONS**, `export_anim_single_armature=False`,
`use_selection=True` (armature + enfants, **sans le drone**).

Nœud racine : **`Armature`**. Nœuds techniques conservés : **`DroneLandingPad`** (support du drone)
et **`Gadget_Nexus`** (gadget animé / point de tir).

> ⚠️ Le **drone n'est pas dans ce fichier**. Le GLB séparé `drone.glb` est chargé par
> `_loadDockedDrone()` puis arrimé sur `DroneLandingPad` (échelle **0,19**, `DRONE_DOCK_Z`).

## Utilisation dans le jeu

`app/sanctuary-mode.js` (ligne 24) charge ce fichier avec `?v=2` pour casser le cache.
Les clips sont enregistrés **en minuscules** (`clip.name.toLowerCase()`) :

```js
_playerActions['idle'], _playerActions['walk'], _playerActions['run'], ...
```

Animations jouées en **couches** :
- **basse** (jambes) : `idle`, `walk`, `run` filtrés sur `PLAYER_LOWER_BONES` ;
- **haute** (buste/bras) : `shoot_gadget`, `shoot_gadget_side` filtrés sur les autres os ;
- le reste est joué en entier via `_playAction(nom)`.

## Liste des clips (noms exacts dans le GLB)

### Animations au sol (10) — pose complète, sans canal racine

| Clip | Durée | Boucle | Usage |
|---|---|---|---|
| `idle` | 3,33 s | oui | repos / marche sur place par défaut |
| `walk` | 1,03 s | oui | déplacement lent |
| `run` | 0,63 s | oui | course |
| `jump` | 1,00 s | non (`LoopOnce`) | saut, fin détectée par l'événement `finished` |
| `idle_look` | 10,57 s | oui | repos long, regard autour |
| `control_idle` | 3,33 s | oui | pilotage du drone (perso immobile) |
| `hold_gadget` | 1,60 s | oui | maintien du gadget |
| `Hold_Gadget_Manual` | 1,60 s | oui | variante manuelle du maintien |
| `Shoot_Gadget` | 0,87 s (26 img) | non | tir debout (couche haute) — **un seul tir**, recul à partir de 0,17 s (maj. 2026-10-28) |
| `Shoot_Gadget_Side` | 1,57 s | non | tir de côté (couche haute) |

### Animations de vol (9) — 2 s, bouclables, avec canal racine

| Clip | Canal racine | Effet |
|---|---|---|
| `Idle_Hover` | translation | vol stationnaire, **+0,20 m** de flottement |
| `Ascend_Up` | translation | montée |
| `Descend_Down` | translation | descente |
| `Move_Forward` | translation | déplacement avant |
| `Move_Backward` | translation | déplacement arrière |
| `Move_Left` | translation | déplacement gauche |
| `Move_Right` | translation | déplacement droite |
| `Yaw_RotateLeft` | translation + **rotation** | rotation 360° anti-horaire |
| `Yaw_RotateRight` | translation + **rotation** | rotation 360° horaire |

> 💡 Les 9 clips de vol embarquent **la pose idle du personnage** (et non la T-pose de repos)
> + le flottement de **0,20 m** sur le nœud `Armature`. Ils sont donc directement utilisables
> sans superposition avec `idle`. Les `Yaw_*` ajoutent une rotation complète de `Armature`.

## ⚠️ À savoir avant de réexporter depuis Blender

1. Dans `Personnage_Animations/personnage_animations.blend`, les pistes NLA de vol
   sont **au niveau objet** (translation/rotation de `Armature`) et **muettes par défaut**.
   L'armature n'anime donc **pas** la pose pendant ces clips.
2. La pose idle a été **bakée temporairement** dans les 9 actions de vol juste avant l'export
   (frames 1→61 remappées 0→60), puis **retirée** du `.blend` pour ne pas polluer la scène.
   ➡️ **Un nouvel export direct produirait des clips de vol en T-pose.** Il faut refaire ce bake.
3. Les 3 pistes `Shoot_Gadget`, `hold_gadget`, `Hold_Gadget_Manual` ont été ajoutées
   (muettes) pour que ces clips soient exportés.
4. `export_animation_mode='ACTIONS'` + `export_anim_single_armature=False` : c'est la seule
   combinaison testée qui exporte **exactement** ces 19 clips (le mode `NLA_TRACKS` perd la
   translation/rotation du nœud `Armature`, donc le flottement et le yaw).
5. Les 5 actions `mixamo.com*` (orphelines, autre personnage) sont **exclues** de l'export.
6. L'armature doit être **démasquée** (`hide_viewport = False`) sinon l'export la saute :
   pas de skin ni d'animation.

## Vérification rapide

Un avertissement `[Sanctuaire] Animations du personnage introuvables` en console = le GLB
chargé n'a pas de clip `idle` (mauvais fichier ou cache navigateur : vérifier le `?v=`).

Inspection du fichier seul (Node) : lire le chunk JSON du GLB et compter `json.animations`
→ **19** attendus.

Sauvegarde de l'ancienne version : `backups/personnage-joueur-gadget_AVANT_v2.glb` (10 clips).

## Mise à jour du clip de tir — 2026-10-28

- Le GLB contient **12 clips** (control_idle, Dying, idle, idle_look, jump, Pistol Kneeling Idle, Pistol Strafe left/right, Pistol Walk Backward, run, Shoot_Gadget, walk). Les clips `hold_gadget`, `Shoot_Gadget_Side` et les 9 clips de vol cités plus haut n'existent plus dans ce fichier.
- `Shoot_Gadget` vient d'une nouvelle animation Mixamo (26 images, 0,867 s, deux mains sur le gadget), retouchée dans Blender (`Desktop/Personnage_Animations/personnage_animations.blend`).
- Méthode : export GLB depuis Blender (mode `ACTIONS`), puis **remplacement du seul clip** dans le GLB du jeu : `node tools/patch-glb-clip.mjs <cible.glb> <export.glb> Shoot_Gadget <sortie.glb>`. Vérification : `tools/glb-compare-clips.mjs` (les 11 autres clips restent identiques à 0,00) et `tools/glb-diff-structure.mjs`.
- Ancien GLB sauvegardé : `backups/personnage-joueur-gadget_AVANT_shoot_v3.glb`.
- Côté jeu (`app/sanctuary-mode.js`) : `GADGET_SHOT_TIMES = [0.17]`, `GADGET_SHOT_DURATION = 0.87`, `GADGET_SHOT_DAMAGE = 3` (même équilibre qu'avant : le drone, 6 PV, tombe en 2 tirs), `PLAYER_GLB_URL …?v=3`.

## Ajout des clips de nage — 2026-11-02

- Le GLB contient maintenant **14 clips** (les 12 précédents, inchangés, + `Swim` et `Swim_Idle`). Taille : 2,80 Mo → 3,44 Mo. URL côté jeu : `app/hero.js` (`FILE`) en `?v=4`.
- Nouveaux clips (boucle, 30 fps, 65 os × translation/rotation/échelle, interpolation LINEAR) :

| Clip | Durée | Boucle | Origine |
|---|---|---|---|
| `Swim` | 4,53 s (137 images) | oui | Mixamo – Swimming (nage à plat ventre, sur place), FBX sans modèle, retargeté par noms d'os |
| `Swim_Idle` | 3,00 s (91 images) | oui | Mixamo – Treading Water (flottaison à la verticale, sur place), FBX sans modèle, retargeté par noms d'os |

- Méthode : FBX → Blender 5.2 en arrière-plan → GLB d'animation (échantillonné à 30 fps) → canaux recopiés par nom d'os dans le GLB du jeu avec `@gltf-transform/core` (les squelettes de repos sont identiques, en centimètres, aucune conversion). Matériaux, textures, os, maillages et les 12 autres clips : inchangés. Les FBX Mixamo ne sont pas dans le projet (conditions Mixamo : pas de redistribution des animations seules).
- Repères (espace du modèle, origine = pieds au repos, +Z = avant, Hips au repos 0,92 m) : `Swim` Hips y ≈ 0,65 m, corps à plat ventre dirigé vers +Z, tête y ≈ 0,78, pieds y ≈ 0,5–0,7 ; `Swim_Idle` Hips y ≈ 0,93 m, tête y ≈ 1,40, épaules y ≈ 1,35, bras tendus vers l'avant.
- Sauvegarde de l'ancien GLB : `Documents/Djenne3D/mixamo/personnage-joueur-gadget.ORIGINAL.glb`.
