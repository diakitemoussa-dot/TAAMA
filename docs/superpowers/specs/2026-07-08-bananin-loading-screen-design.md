# Écran de chargement — "Le cœur de Bananin"

## Contexte

Nouveau projet "Le coeur de Bananin", version retravaillée du projet Grenier Dogon, dans un dossier séparé (`Le coeur de Bananin/`) sans dépendance ni copie du projet existant. Toute l'expérience sera en style aquarelle. Ce spec couvre uniquement le premier écran : le chargement (loading screen), reproduisant le style de l'image de référence fournie par l'utilisateur (titre manuscrit, barre de progression peinte façon aquarelle, texte "LOADING..." en dessous).

## Stack technique

HTML/CSS/JS simple, sans build tool (pas de Vite/Three.js à ce stade — juste des fichiers statiques).

Fichiers :
- `index.html` — page unique avec la section loading
- `style.css` — styles aquarelle (texture papier, police, effets)
- `main.js` — logique de préchargement des assets + progression de la barre

## Structure des assets existants

- `asset/image/la coline ..jpg`
- `asset/image/la falaise ..png`
- `asset/image/les roches ..png`
- (versions `-no-bg.png` également présentes, non utilisées pour le loading)

Ces 3 images serviront d'assets de démonstration à précharger pour faire avancer la barre de progression réelle.

## Design visuel

**Fond** : effet papier aquarelle obtenu en CSS pur (dégradé + filtre SVG `feTurbulence` pour le grain), sans image externe. Teinte beige/blanc cassé.

**Titre "Le cœur de Bananin"** : police Google Fonts manuscrite **Caveat**, gris-bleu foncé, légère ombre douce pour effet encre.

**Barre de progression** :
- Contour irrégulier "peint à la main" via filtre SVG (`feTurbulence` + `feDisplacementMap`) sur un rectangle arrondi
- Remplissage dégradé rouge bordeaux/rose avec texture "hachures" (pattern SVG croisillons, comme dans l'image de référence)
- La largeur du remplissage correspond au pourcentage réel de chargement

**Texte "LOADING..."** : police monospace/stamp (**Special Elite** ou similaire), gras, letter-spacing large, sous la barre.

## Logique de chargement

- `main.js` liste les assets à précharger (les 3 images de `asset/image/`, extensible plus tard à `asset/model/` et `asset/audio/`)
- Chaque asset chargé incrémente le pourcentage ; la barre se remplit en direct, proportionnellement au nombre d'assets chargés / total
- À 100%, fondu (transition CSS `opacity`) de l'écran de loading vers la suite de l'expérience (pour l'instant un écran vide/placeholder, à construire dans une prochaine itération)

## Hors scope

- La suite de l'expérience après le loading (sera un projet séparé / itération suivante)
- Tout import ou copie de code/assets depuis le projet Grenier Dogon existant
- Modèles 3D et audio (dossiers créés mais vides pour l'instant)
