# Base de NÉANTIS — extérieur du complexe (design)

Date : 2026-10-31. Statut : validé par oral avec l'équipe projet.

## But
Donner une présence physique au groupe NÉANTIS (qui veut s'emparer des dispositifs) : un complexe 3D posé à l'écart de Djenné, sur la vraie carte, visible au drone et à pied. Il sert les séquences 8 (poursuite), 9 (découverte de la base) et plus tard 10 (récupération). Source : document de conception Taama §2.1, §4.2, §9.3 et plan `2026-10-29-plan-jeu-taama-chapitre-1.md` (décision 6).

## Décisions
- Périmètre de cette étape : **extérieur seulement**. Hors périmètre : intérieur, patrouilles de Sentinelles, alarme, gestion des séquences (on prépare seulement des points d'ancrage nommés).
- Emplacement : **banc de sable au nord-ouest** de la ville, ≈ 600 m de la mosquée, zone plate, hors eau et hors maisons. Choix exact par calcul (pente, eau, bâtiments).
- Forme : **forteresse moderne**, enceinte ≈ 90 × 60 m, portail tourné vers Djenné (côté sud-est).

## Contenu
| Élément | Détail |
|---|---|
| Enceinte | mur noir de 4 m, bande bleue lumineuse en haut, 4 tours de guet de 9 m avec projecteurs |
| Entrées | portail principal + sas + guérite ; porte de service (côté nord-est) ; toit par une pile de conteneurs |
| Centre de contrôle | 2 niveaux, bande vitrée bleue, mât d'antenne 30 m, parabole, grand N lumineux sur la façade |
| Hangar de stockage | gros volume, lucarnes de toit, porte de chargement (futur lieu de la salle de stockage) |
| Cour | dalle sombre à marquages, conteneurs, groupe électrogène, dock à drones marqué du N |
| Socle | dalle plus large que l'enceinte avec talus, qui absorbe les irrégularités du terrain (le sol de la ville n'est pas modifié) |

## Style et budget
- Identité NÉANTIS : noir, bleu électrique lumineux, touches dorées métalliques, emblème en N, lignes nettes (doc §4.2). Contraste volontaire avec le banco de Djenné.
- Pas de texture : quelques matériaux (noir, béton sombre, bleu émissif, or métallique, verre bleu).
- ≈ 20 000 triangles, ≈ 0,5 Mo (Draco), peu d'appels de dessin : compatible mobile.
- Nœuds nommés (empties) pour la suite : `Anchor_Portail`, `Anchor_PorteService`, `Anchor_PorteStockage`, `Anchor_Patrouille_*`, `Anchor_Alarme`, `Glow_*` (halos nocturnes).

## Intégration dans le jeu
- Fichier à part `assets/models/neantis-base.glb`, déjà recalé dans le repère de la ville du jeu (même transformation que `djenne-ville-leger.glb`).
- `app/neantis-base.js` : charge le modèle avec la ville v2, ombres, éclairage de nuit (émissif + halos aux ancres `Glow_*`), expose `window.NeantisBase`.
- Collisions : le drone traite tous les maillages comme obstacles ; le sanctuaire ajoute les maillages `Neantis_*` à ses colliders.
- Carte : repère « Zone NÉANTIS » sur la grande carte et sur le cercle quand il est dans la vue (visible dès le début pour cette étape ; à masquer plus tard selon la séquence).
- Note culturelle : NÉANTIS et sa base sont fictifs ; rien ne doit laisser croire qu'il s'agit d'un lieu réel de Djenné.

## Vérification
Vues Blender, statistiques du .glb (triangles, poids), chargement réel dans le jeu (jour et nuit), test de sol et de collision par rayons, repère sur la carte.
