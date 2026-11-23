# Enregistrer les joueurs dans la feuille « Bamako Drive joueur »

Pas de serveur, pas de clé secrète, pas de Render. Il suffit d'un script collé dans la feuille.

## 1. Créer une feuille à part pour Taama (ne pas toucher à Bamako Drive)
⚠️ **N'utilisez pas la feuille « Bamako Drive joueur » ni son script : le script de Bamako Drive fait tourner le jeu Bamako. Si on le remplace, Bamako Drive ne fonctionne plus.**

1. Ouvrez Google Sheets et créez une **nouvelle feuille vide**, nommée « Taama joueurs ».
2. Dans cette nouvelle feuille, menu **Extensions → Apps Script**.
3. Effacez le texte d'exemple, collez tout le contenu du fichier `Code.gs`, puis enregistrez (icône disquette).

## 2. Publier le script
1. Cliquez sur **Déployer → Nouveau déploiement**.
2. À côté de « Sélectionner le type », choisissez **Application Web**.
3. Réglages :
   - **Description** : `Taama joueurs v1`
   - **Exécuter en tant que** : **Moi**
   - **Qui a accès** : **Tout le monde**
4. Cliquez sur **Déployer**.
5. Google demande l'autorisation : **Autoriser l'accès**, choisissez votre compte. L'écran « Google n'a pas validé cette application » apparaît : cliquez sur **Paramètres avancés → Accéder à … (non sécurisé)**, puis **Autoriser**. C'est votre propre script, c'est normal.
6. Copiez l'**URL de l'application Web** (elle commence par `https://script.google.com/macros/s/` et finit par `/exec`).

## 3. Vérifier
Ouvrez l'URL copiée dans un navigateur. Vous devez voir :
`{"ok":true,"service":"taama-joueurs"}`

## 4. Me l'envoyer
Envoyez-moi l'URL `/exec` copiée. Je la branche sur le jeu.

## Si des modifications du script ne sont pas prises en compte
Il faut refaire **Déployer → Gérer les déploiements → crayon → Version : Nouvelle version → Déployer**. L'adresse ne change pas.
