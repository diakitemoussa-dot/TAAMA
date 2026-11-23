# Joueurs de Taama : enregistrement dans Notion

À sa toute première partie, le joueur donne son **prénom (ou pseudo)** et son **âge**. Tapama l'appelle ensuite par son prénom, et le profil est enregistré dans la base Notion **« Joueurs de Taama »**.

## Comment ça marche

```
Jeu (navigateur)  →  POST /api/players  →  serveur  →  API Notion  →  base « Joueurs de Taama »
 profil saisi          (données validées)    (détient la clé)
```

- Le navigateur **n'appelle jamais Notion directement** : la clé Notion donnerait accès à tout l'espace de travail, elle reste donc sur le serveur.
- Le serveur **revalide** le prénom, l'âge et l'identifiant (mêmes règles que le jeu) avant d'écrire.
- Un joueur = **une ligne**. Si le joueur change son nom depuis le menu, sa ligne est mise à jour (pas de doublon) grâce à son identifiant anonyme.
- Si le serveur est absent, injoignable ou non configuré, **le jeu fonctionne normalement** : le profil reste « en attente » sur l'appareil et est renvoyé au prochain lancement ou au retour de la connexion.

## Ce qui est enregistré (et rien d'autre)

| Colonne Notion | Contenu |
|---|---|
| Prénom ou pseudo | ce que le joueur a tapé (2 à 20 caractères) |
| Âge | nombre entier entre 6 et 99 |
| Identifiant | UUID aléatoire propre à l'appareil, sans lien avec la personne |
| Première connexion / Dernière mise à jour | dates |
| Appareil | Ordinateur, Téléphone ou Tablette |
| Langue | Français ou English |

Aucun nom de famille, e-mail, photo, localisation ni adresse IP n'est demandé ou enregistré.

## Mise en route (une seule fois)

La base existe déjà : <https://app.notion.com/p/b8ad25b1df584839b63f64e14d72c4d2> (privée).

1. **Créer l'intégration** : <https://www.notion.so/profile/integrations> → « Nouvelle intégration » → type *Interne* → copier le **secret**.
2. **Donner accès à la base** : dans Notion, ouvrir « Joueurs de Taama » → menu `···` → *Connexions* → ajouter l'intégration.
3. **Configurer le serveur** : copier `.env.example` en `.env` et coller le secret dans `NOTION_TOKEN`. `NOTION_PLAYERS_DB` est déjà rempli.
4. **Lancer** : `npm run serve`, jouer, puis vérifier qu'une ligne apparaît dans la base.

Pour la mise en ligne : le jeu appelle `POST /api/players` (même site). Il faut brancher `server/players-handler.mjs` (fonction `upsertPlayer(corps, env)`) sur l'hébergeur choisi (fonction serverless ou serveur Node) et y définir `NOTION_TOKEN` et `NOTION_PLAYERS_DB` comme variables d'environnement. Le serveur de développement `_serve.cjs` en donne un exemple complet.

## Données de joueurs : points d'attention

Le public visé a de **12 à 17 ans** : ces données concernent donc des mineurs.

- Garder la base **privée** (ne pas la déplacer sous la page de conception partagée) et limiter l'accès à l'équipe qui en a besoin.
- Vérifier avec Kabakoo les règles applicables (RGPD, consentement parental pour les moins de 15 ans en France, loi malienne sur les données personnelles) avant la mise en ligne publique.
- L'écran du profil indique clairement ce qui est enregistré ; adapter ce texte à la politique de confidentialité validée.
- Prévoir une façon de **supprimer** la ligne d'un joueur qui le demande (supprimer la ligne dans Notion suffit : le jeu en recréera une seulement s'il renvoie le profil).

## Tests

- `npm run test:player-logic` : validation, stockage, prénom dans les phrases.
- `npm run test:server-logic` : le serveur avec un faux Notion (création, mise à jour, pannes, données invalides).
- `npm run test:ui` : parcours complet dans Chrome, y compris l'envoi simulé et la reprise après panne.
