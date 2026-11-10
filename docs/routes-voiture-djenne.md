# Routes de Djenné accessibles en voiture (itinéraire de la carte)

**Problème** : des joueurs se perdaient en suivant l'itinéraire de la carte. Le graphe routier venait d'OpenStreetMap (`assets/data/routes-djenne.json`,
7 317 nœuds, 275 km) et n'avait jamais été confronté au modèle 3D du jeu : une ruelle OSM peut être barrée par une maison du modèle, un gué trop
profond, une pente. La voiture, elle, est arrêtée par tout obstacle (`vehicle.js : blockedAhead`) et se noie à 1,6 m d'eau (`water-logic.js`).

## Méthode (`tools/analyze-roads.mjs`)
Chaque tronçon est échantillonné tous les 1,5 m et testé contre la géométrie réelle de `djenne-ville-leger.glb` (même repère que le jeu) :

| Critère | Seuil | Raison |
|---|---|---|
| Dégagement de maison (`Bat_*`, à hauteur de caisse) | ≥ 1,1 m de l'axe | demi-largeur de la voiture 0,85 m + marge |
| Profondeur d'eau (niveau du fleuve − sol) | ≤ 1,3 m | moteur noyé à 1,6 m ; ralentie dès 0,25 m |
| Pente | ≤ 0,6 rad (~34°) | la voiture ne monte pas plus raide |
| Sol connu | oui | hors du modèle = rien sous la voiture |

Classes d'eau conservées dans le graphe : `0` sec, `1` gué peu profond (< 0,8 m), `2` gué profond (jusqu'à 1,3 m, voiture à 3–6 m/s).
Le routeur (`app/city-routes.js`) ajoute un surcoût aux gués (×1,6 et ×3) : il préfère toujours une route sèche.

## Résultats
- **7 666 tronçons testés → 3 767 retenus (137 km)**, une seule composante connexe (pas d'impasse). Refusés : 594 maisons en travers, 279 eau profonde,
  14 pente, 458 hors du modèle (très loin de la ville).
- **Le fleuve est l'obstacle principal** : avec 0,8 m d'eau maximum la voiture n'atteint que 31 km de routes ; à 1,3 m, tout le réseau utile.
- **Tous les lieux sont joignables depuis la voiture** (distance par la route, dont gué) :

| Lieu | Ancien itinéraire (OSM) | Itinéraire voiture | Tronçons bloqués sur l'ancien | Gué |
|---|---|---|---|---|
| Grande Mosquée | 242 m | 252 m | 4 (46 m) | – |
| Marché du lundi | 96 m | 96 m | 0 | – |
| École FA AID | 1 061 m | 1 090 m | 12 (168 m) | 99 m (33 m profonds, ≤ 0,85 m) |
| Barrage du Seuil | 665 m | 694 m | 12 (168 m) | – |
| Tonombo | 1 072 m | 1 101 m | 12 (168 m) | 182 m |
| Stade Koïkoumboro | 1 341 m | 1 370 m | 12 (168 m) | 99 m |
| Kaniana | 2 322 m | 2 361 m | 13 (177 m) | – |
| Hambarkétolo | 2 413 m | 2 628 m | 13 (216 m) | 99 m |
| Djenné-Djenno | 3 326 m | 3 541 m | 13 (216 m) | 99 m |
| Base NÉANTIS (approx.) | 606 m | 665 m | 7 (67 m) | 49 m |
| Laboratoire de Tapama | 228 m | 228 m | 0 | – |

L'ancien itinéraire vers presque tous les lieux traversait ~12 tronçons barrés par des maisons (170–220 m) ; le nouveau ne rallonge que de 3 à 9 %.
Rapport complet : `assets/data/routes-djenne-voiture.rapport.json`.

## Preuve par la conduite (`tools/drive-route-check.mjs`)
Un pilote automatique conduit la **vraie voiture** (collisions, fleuve) le long de la ligne calculée par le routeur du jeu, avec marche arrière de dégagement
(comme un joueur).

| Trajet | Résultat |
|---|---|
| Départ de la voiture → Barrage, **nouvel** itinéraire | arrivée en 152 s, 1 marche arrière |
| Départ de la voiture → Barrage, **ancien** itinéraire OSM | **bloquée à 30 %** (est 168 m, nord 20 m), 8 manœuvres, à 0,9 m de la ligne : maison en travers |
| Départ de la voiture → École FA AID (gué de 99 m) | arrivée en 251 s, 1 marche arrière |
| Départ de la voiture → Stade Koïkoumboro (gué de 99 m, 1,5 km) | arrivée en 321 s, 1 marche arrière |

Non testés en conduite : Tonombo, Kaniana, Hambarkétolo, Djenné-Djenno, NÉANTIS, laboratoire (validés par le seul calcul géométrique).

## Utilisation
- `node tools/analyze-roads.mjs` : rapport (sensibilité aux seuils, accès aux lieux) ; `--write` régénère `assets/data/routes-djenne-voiture.json`.
  Options : `--clear 1.1` (dégagement), `--water 1.3` (eau max). À refaire si le modèle de ville ou les routes OSM changent.
- `node tools/drive-route-check.mjs <lieu> <voiture|osm>` (serveur lancé : `npm run serve`) : conduit la voiture le long de l'itinéraire.
- La carte (`app/city-map.js`) charge le graphe voiture ; la barre d'itinéraire signale un gué (« gué de 100 m, roule doucement »).

## Limites
- Le dernier tronçon entre le dernier nœud routier et le lieu est à pied, en ligne droite (jusqu'à 264 m pour Djenné-Djenno, site hors route).
- Rayon de braquage non modélisé (5,6 m) : un virage à angle droit dans une ruelle de 2,5 m peut demander une marche arrière.
- Arbres, véhicules, props et murs de la base NÉANTIS ne sont pas pris en compte (le jeu les traite à part).
- Le test de conduite est un pilote simple : un échec peut venir de son habileté ; le contraste avec l'ancien itinéraire reste la mesure fiable.

## Guidage à l'écran (`app/route-arrow.js`, `app/car-dashboard.js`)
Dès qu'un lieu est choisi sur la carte :
- **Pastille sous la mini-carte** (à pied comme en voiture) : mini-boussole dont l'aiguille tourne vers le trajet (cap du trajet − cap de la caméra), puis
  « LIEU – distance – prochain virage » (« À droite dans 40 m »). Orange et « Reviens sur la route » à plus de 28 m de l'itinéraire. Ancrée sous la mini-carte.
- **Tableau de bord de la voiture** (en conduite uniquement, en bas de l'écran, remplace l'ancienne barre de touches) : compteur de vitesse à gauche ; au centre un
  **cadran de guidage en demi-cercle** (rose N/E/S/O qui tourne avec la voiture, aiguille jaune vers l'itinéraire, borne à ±90° ; « Demi-tour » si le but est derrière),
  distance restante et prochain virage, flanqué des **clignotants** (verts clignotants quand ceux de la voiture sont actifs, vert tamisé quand l'itinéraire annonce un virage
  à moins de 90 m) ; à droite les **rapports R N 1 2 3 4**, les voyants (phares, feux de détresse, moteur/eau) et la jauge d'essence.
  Les touches (V vue, L phares, H détresse, F descendre) s'affichent 9 s à l'entrée dans la voiture puis s'effacent.
  **Simulés** : les rapports (boîte automatique déduite de la vitesse) et la jauge d'essence (décorative : baisse lentement, jamais sous 12 %, plein à chaque montée, aucun effet sur la conduite).
- **Stable** : le guidage part de la position de la voiture (ou du joueur), pas de la caméra ; l'itinéraire n'est recalculé que si l'on s'en écarte de plus de 20 m ;
  les caps sont lissés. Mesuré : l'aiguille bouge de 1,8°/image au plus.
- **Visée** : un point 22 m en avant sur la route (jusqu'à 48 m à grande vitesse), pas le lieu en ligne droite. Disparaît à moins de 16 m de l'arrivée.
- Tests : `tests/route-arrow.test.mjs`, `tests/car-dashboard.test.mjs`. Vérifié en conduite (navigateur sans tête) : 42 → 70 km/h, rapports 3 → 4, « À gauche dans 30/20/10 m » avec la flèche gauche allumée,
  clignotant gauche vif au braquage, tableau masqué après la sortie.
