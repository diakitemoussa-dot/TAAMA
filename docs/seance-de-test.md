# Séance de test TAAMA : enregistrement automatique des joueurs

Pendant une séance de test, le jeu enregistre automatiquement ce que fait chaque joueur. Une page de rapport compare ensuite les joueurs et les appareils.

Ce système est **temporaire** : il ne fonctionne qu'avec `?test=1` dans l'adresse. Sans ce paramètre, le jeu se comporte exactement comme avant.

## Avant la séance (PC de l'animateur)

1. Dans le dossier du jeu : `npm run serve`
2. La console affiche deux adresses :
   - `http://localhost:8123` pour jouer sur le PC lui-même → ouvrir **http://localhost:8123/?test=1**
   - `séance de test (autres appareils du Wi-Fi) : http://192.168.x.x:8123/?test=1` → à ouvrir sur **chaque tablette et téléphone** (même Wi-Fi que le PC)
3. Si Windows demande d'autoriser Node.js sur le réseau, accepter (réseau privé), sinon les tablettes ne pourront pas joindre le PC.

Une pastille rouge **● TEST** apparaît en haut à gauche : le mode test est actif.

## Pendant la séance

- **Chaque joueur arrive sur un jeu neuf**, comme s'il l'ouvrait pour la première fois : cinématique, écran du prénom et de l'âge, aucune progression. Le prénom saisi dans le jeu sert à identifier le joueur dans le rapport.
- Si la page se recharge pendant la partie, rien n'est perdu et rien n'est remis à zéro : c'est toujours le même joueur.
- **Notes de l’animateur** : dans le panneau (appui long sur **TEST**), un champ permet d’écrire tes observations sur le joueur en cours. Elles sont enregistrées au fur et à mesure avec sa session et apparaissent dans le rapport, le CSV et le résumé Notion.
- **Quand un joueur a fini** : appui long (1 seconde) sur la pastille **TEST** → **Terminer → joueur suivant** → confirmer.
  La session (actions + notes) est envoyée au PC et gardée sur l’appareil, puis la page redémarre automatiquement sur un jeu neuf pour le joueur suivant.
- Si le PC n'est pas joignable, un fichier `.json` est téléchargé sur l'appareil et une copie reste en mémoire sur l'appareil (bouton « Télécharger toutes les sessions de l'appareil »).
- Le panneau affiche aussi le prénom, l'appareil, la durée, les étapes atteintes et l'heure du dernier envoi au PC.

Pensez à prévenir les joueurs que leur prénom et leurs actions dans le jeu sont enregistrés pour améliorer le jeu.

## Ce qui est enregistré

| Catégorie | Détail |
|---|---|
| Joueur | prénom et âge saisis sur l'écran « Profil » du jeu |
| Appareil | ordinateur / tablette / téléphone, système, navigateur, taille d'écran, qualité graphique |
| Parcours | écrans visités, boutons utilisés, séquences terminées, étapes clés du chapitre 1 |
| Tapama | dialogues (lus jusqu'au bout ou passés), messages radio, demandes d'aide (touche H) |
| Laboratoire | mauvaises réponses, indices demandés ou proposés, énigmes résolues |
| Gestes | position des clics/appuis (sans contenu), nombre de touches, manette, clics répétés au même endroit |
| Moments sans action | plus de 30 s sans rien faire, et à quel endroit |
| Technique | erreurs du jeu, images par seconde, rotation de l'écran, rechargements |

**Jamais enregistré** : le texte tapé au clavier (seulement « saisie »), l'adresse IP, la localisation, des photos.

## Où vont les données

- Sur le PC : dossier `playtests/AAAA-MM-JJ/` du jeu, un fichier par joueur (ex. `2026-11-13_1432_Awa_ab12cd34.json`).
- Ce dossier n'est **jamais** servi sur le web ni envoyé sur GitHub (`.gitignore`). Il contient des prénoms : le supprimer quand l'analyse est terminée.

## Après la séance : le rapport

Sur le PC, serveur lancé : **http://localhost:8123/tools/playtest-rapport.html**

- Choisir la séance (par date). Les fichiers téléchargés sur les tablettes peuvent être glissés dans la page.
- **Constats automatiques** : point d'arrêt le plus fréquent, énigme la plus difficile, écart entre appareils, dialogues passés, moments sans action, jeu saccadé, erreurs…
- **Classement des joueurs** avec l'**indice de jeu** sur 100 :
  70 points de progression (étapes clés atteintes) + 30 points d'autonomie (−3 par mauvaise réponse, −4 par indice demandé, −3 par aide de Tapama, −2 par clic d'agacement).
- **Étapes du chapitre 1** : quelle part des joueurs atteint chaque étape, et en combien de temps.
- **Ordinateur / tablette / téléphone** : comparaison des appareils.
- **Parcours détaillé** : cliquer sur un joueur pour voir toute sa partie, minute par minute.
- **Exporter CSV (Notion)** : dans Notion, « Importer » → CSV crée une base avec une ligne par joueur.
- **Copier le résumé (Notion)** : à coller directement dans la page Notion de la séance.

La page de rapport demande d'être ouverte par le serveur (pas en double-cliquant le fichier).

## Fichiers

| Fichier | Rôle |
|---|---|
| `app/playtest-boot.js` | remise à zéro du jeu pour chaque nouveau joueur (chargé en premier dans `index.html`) |
| `app/playtest.js` | enregistrement des actions, envoi au PC, pastille et panneau TEST |
| `app/playtest-core.js` | calculs (résumé d'un joueur, indice de jeu, constats, CSV), partagés jeu / serveur / rapport |
| `server/playtest-handler.mjs` | `POST /api/playtest` (enregistre) et `GET /api/playtest` (lecture, depuis le PC seulement) |
| `tools/playtest-rapport.html` | page de rapport |
| `app/game-ui.js`, `app/laboratoire.js` | quelques lignes `track(…)` / événements ajoutés, sans effet hors mode test |

Tests : `npm run test:playtest-logic`

## Retirer le système

Quitter le mode test sur un appareil : bouton « Quitter le mode test » du panneau, ou ouvrir l'adresse avec `?test=0`.
Pour le retirer complètement du code : supprimer les deux lignes `playtest` de `index.html` (les autres ajouts sont inactifs sans elles).
