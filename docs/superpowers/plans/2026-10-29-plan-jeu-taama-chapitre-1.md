# Plan du jeu — Taama, chapitre 1 « Djenné »

Basé sur le document de conception Taama v1.0 (Notion, mis à jour le 27/10/2026) et sur l'état réel du code au 29/10/2026.

## 1. Où en est-on

Le jeu actuel s'appelle « Les Gardiens de Djenné » et a un guide textuel, le Maître Maçon. Le document Taama décrit une aventure d'enquête avec une histoire (Tapama, NEXUS, deux dispositifs). Le code contient déjà beaucoup de technique (maquette, drone, sanctuaire à pied, gadget, ennemi), mais **presque rien de l'histoire**.

| Domaine du document | État | Ce qui existe |
|---|---|---|
| Lancement, chargement, intro vidéo | Existe | Vidéo d'intro (PC et portable), écran de chargement, passage de l'intro |
| Menu principal | Partiel | Missions / Exploration libre, choix du drone. « Personnage » et « Connexion » sont « bientôt » |
| Carte des destinations verrouillées | Absent | Seulement un verrouillage par chapitre de missions |
| Personnage principal jouable | Existe | `personnage-joueur-gadget.glb`, marche, course, saut, visée TPS/FPS, gadget |
| Drone (observer, repérer) | Partiel | Vol, photo, vidéo, scan radar des œufs. Pas de système d'indices, pas de gadget de neutralisation côté drone |
| Robots NEXUS | Partiel | Une seule Sentinelle (surveillance) avec IA et balles traçantes. Pas de robot d'intervention ni technique |
| Tapama, PDG NEXUS, dialogues, voix | Absent | Aucun texte, modèle ni voix |
| Deux dispositifs et énigmes | Absent | Les scans des tombeaux et de l'imam sont le plus proche |
| Cinématiques (vol, synchronisation, PDG) | Absent | Seulement des vidéos de transition |
| Base NEXUS (infiltration) | Absent | Pas de lieu ni de niveau |
| Langues FR/EN | Absent | Textes en dur en français |
| Sauvegarde / Continuer | Partiel | Missions et rang en `localStorage`, pas de position |
| Mobile Android, manette, qualité d'appareil, streaming | Existe | PWA, joysticks tactiles, `gamepad.js`, `device-quality.js`, `spatial-streaming.js` |

## 2. Les 13 séquences du chapitre 1

| # | Séquence | Type | État | Ce qu'il faut |
|---|---|---|---|---|
| 1 | Lancement | Interface | Partiel | Écran titre avec logo et ambiance, chargement avec 2 illustrations et messages courts |
| 2 | Djenné, lieu de mémoire | Cinématique | Partiel | Adapter ou refaire la vidéo d'intro pour les « signes discrets de technologie » |
| 3 | L'appel de Tapama | Dialogue + tutoriel | Absent | Système de dialogue, portrait de Tapama, tutoriel des commandes |
| 4 | Premier repérage | Exploration | Partiel | Premier indice + usage du drone sans danger (réutiliser M01 et M03) |
| 5 | Premier dispositif | Énigme | Absent | Modèle du dispositif, énigme simple, projection fragmentaire |
| 6 | La deuxième piste | Enquête | Absent | Indice vers le 2e emplacement, premiers signes de NEXUS |
| 7 | Le vol | Cinématique courte | Absent | Équipe NEXUS, vol du 2e dispositif |
| 8 | La poursuite | Action | Absent | Parcours dans les ruelles, repérage par le drone |
| 9 | Découverte de la base | Infiltration | Partiel | Zone NEXUS, patrouilles de Sentinelles (IA déjà là) |
| 10 | La récupération | Infiltration + énigme | Absent | Salle de stockage, documents, alerte et fuite |
| 11 | La synchronisation | Cinématique interactive | Absent | Les 2 dispositifs ensemble, carte (Bandiagara, Ségou, Lomé) |
| 12 | La menace demeure | Scène finale | Absent | Scène du PDG |
| 13 | Fin de chapitre | Interface | Partiel | Carte des destinations avec Djenné terminé et le reste verrouillé |

## 3. Décisions à prendre avant de commencer

1. **Nom et fusion avec l'existant.** Garder « Les Gardiens de Djenné » ou passer à « Taama » ? Le Maître Maçon est-il remplacé par Tapama, ou garde-t-il un rôle (guide du patrimoine) ? Les 10 missions actuelles sont-elles recyclées en séquences, ou gardées comme mode à part ?
2. **Les missions actuelles et l'histoire.** Les missions M01-M10 sont des défis de pilotage et de scan. Elles ne racontent pas l'enquête. Il faut décider quelles missions deviennent des étapes de l'enquête.
3. **Combat.** Le document dit « neutralisation temporaire » et laisse le combat optionnel. Aujourd'hui, une balle de la Sentinelle fait mourir le joueur (animation de 3 s) et le gadget détruit le drone. À aligner : neutralisation avec réapparition, ou rester tel quel.
4. **Voix.** Le jeu n'a aucune voix. Dialogues en texte seul, ou voix enregistrées ?
5. **Langues.** FR et EN dès le départ, ou FR d'abord ? Ça change la façon d'écrire les textes (clés de traduction plutôt que texte en dur).
6. **Niveau de la base NEXUS.** Nouveau décor 3D à modéliser, ou zone existante réaménagée ? C'est le plus gros poste d'art.

## 4. Feuille de route proposée

Chaque phase donne quelque chose de jouable et testable avant la suivante.

### Phase 0 — Cadrage (1 à 2 jours)
- Trancher les décisions du §3.
- Écrire un document de contenu : textes des 13 séquences, dialogues, noms, ordre.
- Résultat : une spec courte dans `docs/superpowers/specs/`.

### Phase 1 — Colonne vertébrale narrative
- Système de dialogue réutilisable (portrait, texte, bouton « Suivant », passage).
- Gestionnaire de séquences : enchaîne les 13 étapes, sauvegarde « où j'en suis » (reprendre = bouton « Continuer »).
- Textes en clés de traduction dès maintenant (FR, EN prévu).
- Résultat : séquences 1 à 4 jouables de bout en bout, avec Tapama (même en 2D) qui appelle le joueur.

### Phase 2 — Les dispositifs et l'enquête
- Modèles des deux dispositifs, activation, projection fragmentaire.
- Système d'indices : le drone et le personnage « examinent » un détail, ça alimente l'enquête.
- Énigme du premier dispositif. Réutiliser le moteur de scans de `sanctuary-mode.js`.
- Résultat : séquences 5 et 6.

### Phase 3 — Vol et poursuite
- Cinématique du vol (courte, peut être une séquence caméra scénarisée).
- Poursuite dans les ruelles : cibles en fuite, repérage par le drone, passages à choisir.
- Résultat : séquences 7 et 8.

### Phase 4 — Base NEXUS et infiltration
- Zone NEXUS (décor, accès, sas).
- Patrouilles de Sentinelles avec IA (déjà faite) + alarme globale.
- Deuxième type de robot (intervention : plus rapide, bloque) et robot technique (verrouille des accès).
- Salle de stockage, documents découverts, fuite après alerte.
- Résultat : séquences 9 et 10.

### Phase 5 — Conclusion et ouverture
- Synchronisation des deux dispositifs (cinématique interactive), carte des destinations.
- Scène du PDG (cinématique), écran de fin avec Bandiagara, Ségou, Bamako et Lomé verrouillés.
- Carte des destinations dans le menu (remplace l'écran « Missions » actuel).
- Résultat : séquences 11 à 13, chapitre complet.

### Phase 6 — Finition et test
- Écrans de chargement avec messages culturels courts (vérifiés par des sources fiables).
- Réglage de la difficulté, tutoriel, accessibilité (manette, tactile).
- Test avec des adolescents de 12 à 17 ans et mesure de réussite du document : explorer, utiliser le drone, relier les indices, résoudre une énigme sans aide, raconter ce qu'on a découvert sur Djenné.
- Performances Android (qualité d'appareil et streaming déjà en place).

## 5. Ce qui est déjà acquis et à réutiliser

- Sentinelle et IA : `app/drone-n-ai.js`, `app/sanctuary-mode.js` (patrouille, alerte, engagement, recherche, balles traçantes).
- Visée et gadget : `app/aim-system.js`.
- Scans, portails, lieux : `app/sanctuary-mode.js` (`LIEUX`, `jumpTo`, scans des tombeaux, de l'imam et de l'entrée).
- Drone : `app/drone-game.js` (vol, photo, scan radar, retour au personnage).
- Missions, étoiles, rangs, sauvegarde : `app/missions.js`.
- Plateformes : manette (`gamepad.js`), qualité d'appareil, streaming de tuiles, PWA.

## 6. Risques

- **Charge d'art** : Tapama, le PDG, 2 types de robots, 2 dispositifs et la base NEXUS sont à modéliser. La Phase 4 dépend du décor.
- **Cohérence** : mélanger les missions actuelles avec l'histoire sans les fusionner donnerait deux jeux en un. Décision 1 du §3.
- **Contenu culturel** : le document demande de vérifier les faits historiques et de ne pas faire passer la fiction (dispositifs, NEXUS) pour de l'histoire réelle.
- **Mobile** : le sanctuaire et la base NEXUS devront tourner sur Android sans installation.
- **Périmètre** : le document insiste pour préférer une première version maîtrisée à plusieurs fonctionnalités. Un seul personnage et un seul drone suffisent pour le chapitre 1.

## 7. Prochaine étape recommandée

Trancher les décisions 1 et 2 du §3 (nom et fusion avec les missions), puis démarrer la Phase 1 (dialogues et gestionnaire de séquences), qui débloque toutes les autres phases.
