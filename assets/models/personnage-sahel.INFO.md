# Personnage Sahel + sac + drone — fiche de passation (`personnage-sahel.glb`)

Fichier : `assets/models/personnage-sahel.glb` — **3,1 Mo**, **61 clips** (57 Mixamo + 4 retargetés), 65 os, chargé par `app/hero.js` (`?v=1`).
Il est **fabriqué**, pas édité à la main : `node tools/build-player-sahel.mjs` (sources jamais modifiées).

| Source | Rôle |
|---|---|
| `Sahel-Game/client/assets/player.glb` (hors dépôt) | corps, tenue, pistolet (`Pistol`, `Muzzle_Pistol`), 57 clips |
| `assets/models/personnage-joueur-gadget.glb` | **sac à dos** (`BP_Backpack`) et **`DroneLandingPad`** (ancrage du drone) |

Ce que fait l'outil : os `mixamorig4:` → `mixamorig:` ; sac skinné → mesh rigide fixé sur `Spine2` (72 % / 28 % de ses poids
étaient sur `Spine2` / `Spine1`) ; sac et pad remis à l'échelle de la tête du nouveau rig (×1,035) ; fusil, chargeur et ancien gadget retirés.

## Clips : ce que le jeu attend et d'où ça vient (`app/sanctuary-mode.js`, `_installSahelClips`)

| Nom attendu par le jeu | Clip utilisé |
|---|---|
| `idle` `walk` `run` `jump` `pistol strafe right` `pistol walk backward` | identiques |
| `dying` | `Death` |
| `pistol kneeling idle` | `Pistol Kneel` |
| `pistol strafe left` | `Pistol Strafe` |
| `shoot_gadget` | **synthétisé** : pose de visée de `Pistol Idle Tir` (image 1) + recul (0,32 s) — `_makeSahelShotClip`, recul réglable via `SAHEL_RECOIL` |
| `idle_look` (repos long, après 7 s d'immobilité), `control_idle` (pose de pilotage du drone), `swim`, `swim_idle` (nage) | **repris de l'ancien modèle et retargetés** (voir ci-dessous) |
| `shoot_gadget_side` | absent : repli sur `shoot_gadget` (inutilisé) |

### Clips retargetés (`tools/retarget-lib.mjs`, appelé par `build-player-sahel.mjs`)
Les clips de l'ancien personnage (`personnage-joueur-gadget.glb`) ne peuvent pas être copiés tels quels : son squelette est en pose en A et le nouveau en pose en T
(écart de repos jusqu'à 36° aux bras, 17° aux pieds). Le retargeting transfère l'écart de rotation dans le repère monde, puis redresse bras, avant-bras, mains, cuisses,
jambes et pieds pour que leur **direction** soit celle de la source ; le déplacement du bassin est mis à l'échelle (×1,054). Vérifié par rendu côte à côte (ancien / nouveau) :
repos long (bras le long du corps, regard autour), pilotage (mains au niveau de la poitrine, tête baissée), nage et sur-place (bras tendus), même posture que l'original.
Le pistolet est masqué à la nage et pendant le pilotage du drone (comme l'ancien gadget l'était à la nage).
Les 3 clips « assis au volant » (`car_sit_center/left/right`) sont retargetés de la même façon dans `personnage-voiture-anim-sahel.glb` (`node tools/build-car-sit-sahel.mjs`, chargé par `vehicle.js`).
Test : `tests/player-clips.test.mjs`.

## Tir, visée, lunette, flamme (méthodes reprises de Sahel Game)

| Élément | Fichier | Reprise de |
|---|---|---|
| Flamme de canon (éclair, boule de feu, étincelles, fumée, lumière orange 0,09 s), traceur 0,08 s, impact (étincelles + poussière sable) | `app/muzzle-flash.js` | `client/src/muzzle.js`, `dust.js`, traceur de `main.js` |
| Solveur du canon : la colonne (`Spine1`) pivote (≤ 60°) pour que `Muzzle_Pistol` pointe le réticule | `app/aim-solve.js` + `_applyAimIK` | `client/src/aimsolve.js` |
| Mode tireur d’élite : L2 maintenue ou R3 (manette), T (clavier) ; caméra à l’épaule droite (0,53 m à droite, 0,49 m derrière, FOV 25°, regard décalé de 13,6° à gauche comme Cam_Sniper), tête visible, sensibilité ×0,69, vignette de lunette | `app/sniper-cam.js` | `cameras.json` (Cam_Visee 45° / Cam_Sniper 25°), `sensitivity.js` |
| Repères de tirs reçus : arc jaune (croissant + flèche) du côté du tireur, qui tourne avec la caméra et s'efface en 2,2 s ; plein si touché, discret si la balle frôle (< 1,6 m) | `app/hit-indicator.js` + `_indicateShotFrom` | `client/src/hitdir.js`, `hud.js` (`shotFrom`) |
| Balle : rayon du canon vers le réticule (visée / lunette) ou droit devant (hors visée) ; arrêtée par le premier mur ; drone touché si le trajet le traverse | `_fireBulletShot` | `main.js` (`shoot`) |

Pas de verrouillage automatique sur le drone ni de tir latéral : le corps suit la caméra. Cadence ≈ 0,4 s par coup
(`GADGET_SHOT_DURATION`, `GADGET_SHOT_COOLDOWN`). Détonation synthétisée (`_playPistolShotSound`).

Tests : `node tests/muzzle-flash.test.mjs`, `sniper-cam.test.mjs`, `aim-solve.test.mjs`, `hit-indicator.test.mjs`.

## Réglages de jeu faits avec ce personnage
- **Repère du joueur** : nom + barre de vie jaune (#f9d58b, couleur de la charte) au-dessus de la tête (`app/player-tag.js`) ; caché en visée aux yeux, à la mort et au volant.
- **Vitesse du personnage** : marche 3,0 -> 4,2 m/s, course 5,6 -> 8,0 m/s ; animations de déplacement à ×1,4 (`LOCO_ANIM_SCALE`, `_locoScale`).
- **Voiture** (`app/vehicle.js`) : vitesse de pointe 34 -> 20 m/s (72 km/h), accélération 23 -> 13, marche arrière 9 -> 6, freinage 28 -> 22.
- **Drones ennemis plus intelligents** (`app/drone-n-ai.js`, 24 tests dans `tests/drone-n-ai.test.mjs`) :
  - *repèrent vite* : vue 12 -> 22 m, cône 100° -> 140°, sixième sens à 3,5 m sous tout angle, pas entendus à 4 m, course à 10 m, réaction 0,6 -> 0,25 s ;
  - *poursuivent* : en combat ils avancent jusqu'à 12 m du joueur au lieu de rester sur place, le perdent après 3 s sans vue, cherchent 8 s ;
  - *se préviennent* : un drone qui repère le joueur envoie ses voisins (45 m) fouiller le secteur (`onAlarm`, `_shareDroneAlarm`) ;
  - *patrouillent de partout* : points tirés au hasard dans un grand disque autour du poste (`pickRoamPoint` : 140 m pour la sentinelle d'origine, 110 / 75 / 55 m pour les postes de la base), nouveau point dès que le chemin est bloqué (`skipWaypoint`).
- **Agenouillement** : le joueur se relève tout seul dès qu'il marche, court ou saute (une autre animation prend le relais) ; aucun texte à l'écran (`_standUpFromKneel`).
- **Menus** : l'image `assets/images/menu-personnage.png` (affichée avant le chargement du modèle 3D des écrans « Nouvelle partie », profil, etc.) montrait l'ancien personnage ; elle est régénérée avec le personnage Sahel (sac, drone, pistolet) par `node tools/menu-character.mjs assets/images/menu-personnage.png 150 2 1000 1400` (ancienne version sauvegardée dans `backups/menu-personnage-ancien-gadget.png`). Le visualiseur 3D (`app/character-viewer.js`) joue le clip `idle`.
- **Personnage qui tremblait au repos** : les animations de repos (capture de mouvement) contenaient du bruit haute fréquence (d'une clé à l'autre, quelques dixièmes de degré) et le balancement du bassin faisait glisser les pieds de ±8 cm comme un pendule. `app/clip-smooth.js` (`smoothValues` : lissage gaussien en boucle ; `dampValues` : amortissement du balancement) est appliqué à `idle` (35 % du balancement conservé) et à `pistol kneel` (lissage seul) au chargement (`SAHEL_SMOOTH_CLIPS`, `_smoothClip`). Mesuré : bruit image par image ÷ 5 (pieds 2,3 -> 0,45 mm, pistolet 2,1 -> 0,4 mm) ; glissement latéral des pieds 16 -> 5,5 cm.
