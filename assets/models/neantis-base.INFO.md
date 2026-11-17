# neantis-base.glb — base de NÉANTIS (extérieur)

Complexe fictif du groupe NÉANTIS, au nord-ouest de Djenné (déplacée à ≈ 440 m de la mosquée : l'emplacement libre le plus proche, hors maisons, eau et fossés ; ancien site à 820 m conservé dans `site_820.json`). Design : `docs/superpowers/specs/2026-10-31-base-neantis-design.md`. Branché par `app/neantis-base.js` (chargé avec la ville v2).

## Budget
≈ 2 800 triangles, ≈ 30 Ko (Draco), 6 matériaux sans texture, 6 appels de dessin.

## Repère
Déjà dans le repère de la mosquée du jeu (comme `djenne-ville-leger.glb`). Centre ≈ (641 ; −7,5 ; −731) en coordonnées du jeu (x = nord, z = est, donc ici au nord-ouest). Le portail principal regarde vers la mosquée.

## Contenu (maillages `Neantis_*`)
`Neantis_Socle` (dalle + talus, 150 × 110 m), `Neantis_Noir` (murs, tours, bâtiments), `Neantis_Beton`, `Neantis_Or` (liserés dorés), `Neantis_Bleu` (bandes et N lumineux, émissif), `Neantis_Verre` (vitrages, émissif faible).
Enceinte 90 × 60 m ; portail + sas ; porte de service ; 4 tours de guet ; centre de contrôle avec grand N ; hangar de stockage ; conteneurs empilés (accès au mur) ; dock à drones ; mât d'antenne de 30 m.

## Ancres (empties) pour la suite
`Anchor_Portail`, `Anchor_PorteService`, `Anchor_PorteStockage`, `Anchor_DockDrone`, `Anchor_Alarme`, `Anchor_Centre`, `Anchor_Patrouille_SO|SE|NE|NO`, `Glow_*` (halos nocturnes). Lecture : `window.NeantisBase.anchor('Anchor_Portail')` (THREE.Vector3, repère du jeu).

## Dans le jeu
- Nuit : bandes et N plus lumineux, halos bleus, 2 vraies lumières bleues (suivent le cycle jour/nuit via `CityLights.level`).
- Collisions : drone = tous les maillages ; sanctuaire = `^Neantis_` (sanctuary-mode.js).
- Carte : repère « Zone NÉANTIS » (visible dès le début pour l'instant).
- Les arbres de la ville ont été retirés de l'emprise (199) dans `djenne-ville-leger.glb`.

## Régénération
Sources dans `Documents\Djenne3D\neantis` : `neantis_build.py` (construction + export, Blender en arrière-plan), `choisir_site.py` (choix du site), `retirer_arbres_base.py`.
Fiction : NÉANTIS et cette base n'existent pas à Djenné.

## Mise à jour : intérieur du centre de contrôle et récupération du dispositif
- Coque creuse : entrée (porte coulissante) → sas → porte → salle des écrans → porte → chambre forte avec le `Dispositif` sur son socle (≈ 4 500 triangles, 56 Ko).
- Portes : objets `Neantis_Porte_<Entree|Sas|Coffre>_<vantail>` (origine = centre du vantail) ; `Anchor_Porte_<id>` = centre de la porte, `PorteDir_<id>_<vantail>` = point d'arrivée du vantail ouvert (course 1,5 m). `app/neantis-base.js` les fait glisser quand le joueur à pied approche (ouverture ≈ 4,4 unités, refermeture à 5,6) ; leur collision (sanctuaire : `^Neantis_`) suit le vantail.
- Dispositif : nœud `Dispositif` (flotte et tourne), ancre `Anchor_Dispositif`, `Glow_Dispositif` (halo). E (clavier) ou Y (manette) à moins de 3,2 unités ; événement `neantis:dispositif`, `NeantisBase.deviceTaken` / `resetDevice()`. Non sauvegardé (revient au rechargement).
- Drones sentinelles : ancres `Anchor_Drone_<poste>` et `Anchor_DroneLook_<poste>` (7 postes, ≥ 30 m entre eux). Pas encore branchés dans le jeu.
- Lumières intérieures : 3 sources bleutées (`Anchor_Light_*`).

## Sentinelles (drones N) de la base
7 postes : Portail, Tour_SO/SE/NO/NE, Hangar, Dock (≥ 30 m entre eux). Ancres `Anchor_Drone_<poste>` / `Anchor_DroneLook_<poste>`.
`app/sanctuary-mode.js` : chaque poste est un clone du drone N avec son propre contexte (vie 6, IA PATROL > ALERT > ENGAGE > SEARCH, tir, esquives) ; aucune alerte de groupe, chacune ne réagit qu'à ce qu'elle perçoit.
Une sentinelle neutralisée ne revient qu'à la prochaine entrée dans le sanctuaire. Diagnostic : `SanctuaryMode.debug().sentinels`, `SanctuaryMode.debugDamage('Portail', 6)`.
