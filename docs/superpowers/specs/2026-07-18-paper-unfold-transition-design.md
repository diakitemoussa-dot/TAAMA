# Transition "Dépliage de Papier" (Partie 2 → Partie 1) — Design

**Date :** 2026-07-18
**Projet :** Le cœur de Bananin
**Objectif :** Remplacer le fade simple actuel entre la partie 2 et la partie 1 par une transition visuelle en forme de dépliage de papier en accordéon, déclenchée au clic sur l'avion en papier.

---

## Contexte

Actuellement, `window.goToPart1()` dans `scene3d-part2.js` effectue un simple fade (`container.classList.remove('visible')`) avant d'afficher la partie 1 avec son animation existante de révélation "cercle aquarelle" (`playRevealAnimation`). L'utilisateur souhaite une transition plus intuitive, simple et attractive qui prolonge la métaphore de l'avion en papier cliqué : un dépliage de papier en accordéon qui recouvre tout l'écran, avant de laisser place à l'animation aquarelle existante.

---

## Spécification

### Visuel et Animation

- **Overlay plein écran** composé de **6 bandes verticales blanches** (papier blanc simple, sans texture), positionnées côte à côte pour couvrir 100% de la largeur/hauteur de l'écran une fois dépliées.
- **Séquence de dépliage (centre → bords) :** chaque bande démarre à `scaleX(0)` (invisible, repliée) avec une légère `rotateY` initiale (effet "volet qui s'ouvre"), ancrée sur son bord intérieur (le plus proche du centre de l'écran). Les 2 bandes centrales se déplient en premier ; les paires suivantes vers l'extérieur démarrent avec un délai croissant proportionnel à leur distance au centre.
- **Disparition :** une fois l'écran entièrement blanc (toutes les bandes à `scaleX(1)`, `rotateY(0)`), courte pause, puis fondu (opacity) de tout l'overlay, révélant la partie 1 déjà basculée en dessous (avec le cercle aquarelle qui démarre, comme avant).

### Timing (durée totale : 2000ms)

| Étape | Valeur |
|-------|--------|
| Durée d'animation par bande (scaleX + rotateY, ease-out) | 700ms |
| Décalage entre paliers de bandes (centre → bords) | 150ms par palier |
| Délai max (bandes les plus extérieures, palier distance 2.5) | 375ms |
| Écran totalement blanc atteint à | 1075ms (375 + 700) |
| Pause avant fondu | 200ms |
| Fondu de sortie (opacity) | 725ms |
| **Total** | **2000ms** |

Calcul des délais par bande (6 bandes, indices 0 à 5, centre entre 2 et 3) :
- Distance au centre = `Math.abs(i - 2.5)` → valeurs possibles : 0.5, 1.5, 2.5
- Délai = distance × 150ms → 75ms, 225ms, 375ms

### Architecture Technique

#### Nouveau fichier : `paper-transition.js`

- Module autonome, ne dépend d'aucun autre fichier JS du projet.
- Expose une seule fonction globale : `window.playPaperUnfoldTransition(onFullyCovered)`.
- Responsabilités :
  1. Rendre l'overlay visible (`display`/`opacity`) et déclencher l'animation de dépliage des 6 bandes (via classes CSS + `animation-delay` calculé en JS ou défini en CSS statique).
  2. À **1075ms** (moment où l'écran est entièrement blanc), appeler `onFullyCovered()` — c'est le point où l'appelant doit basculer les scènes en dessous (masquer partie 2, afficher partie 1) sans que l'utilisateur voie le changement, puisqu'il est caché par le papier opaque.
  3. Après la pause de 200ms, lancer le fondu de sortie (725ms), puis masquer complètement l'overlay (`display: none` ou `hidden`) et réinitialiser son état pour un futur déclenchement.
- Aucun paramètre de configuration exposé (pas de besoin identifié) ; les constantes de timing sont définies en haut du fichier.

#### Modifications

- **`index.html`** : ajout du markup de l'overlay avant la fermeture de `<body>` :
  ```html
  <div id="paper-unfold-overlay" hidden>
    <div class="paper-strip"></div>
    <!-- x6 -->
  </div>
  ```
  Ajout du script : `<script src="paper-transition.js"></script>` (après `main.js`, avant les scripts de scène, puisque `scene3d-part2.js` en dépend au moment du clic, pas au chargement).

- **`style.css`** : ajout des styles `#paper-unfold-overlay` (position fixed, plein écran, z-index élevé au-dessus de tout le reste, `display: flex`) et `.paper-strip` (largeur `100% / 6`, fond blanc, `transform-origin` conditionnel selon l'index — géré via une classe modificatrice `.paper-strip--left`/`.paper-strip--right` ou via variables CSS par bande), plus les `@keyframes` du dépliage et du fondu.

- **`scene3d-part2.js`** : dans `window.goToPart1()`, remplacer la logique actuelle par :
  ```js
  window.goToPart1 = function goToPart1() {
    const revealPart1 = () => {
      container.classList.remove('visible');
      container.hidden = true;
      const scene3dDiv = document.getElementById('scene3d');
      if (scene3dDiv) {
        scene3dDiv.hidden = false;
        if (typeof window.playRevealAnimation === 'function') window.playRevealAnimation();
        if (typeof window.startScene3D === 'function') window.startScene3D();
        scene3dDiv.classList.add('visible');
      }
    };

    if (typeof window.playPaperUnfoldTransition === 'function') {
      window.playPaperUnfoldTransition(revealPart1);
    } else {
      // Fallback si paper-transition.js n'a pas chargé : ancien comportement direct.
      revealPart1();
    }
  };
  ```

### Performance

- Animations CSS uniquement (`transform`, `opacity`) — accélérées GPU, aucun impact sur le rendu Three.js en cours (qui continue de tourner en arrière-plan pendant la transition, invisible sous l'overlay).
- Pas de dépendance externe, pas de chargement d'assets supplémentaires.

### Vérification

1. Cliquer sur l'avion en papier en partie 2 déclenche le dépliage accordéon depuis le centre vers les bords.
2. L'écran devient entièrement blanc à ~1075ms, sans qu'on voie la partie 2 disparaître ou la partie 1 apparaître brutalement.
3. Le fondu de sortie révèle la partie 1 avec le cercle aquarelle qui démarre normalement (comportement identique à avant, juste précédé de la transition papier).
4. Durée totale ressentie ≈ 2 secondes, animation fluide sans saccade (vérifier à l'œil, pas de métrique FPS stricte requise pour une animation CSS courte).
5. Si `paper-transition.js` échoue à charger, `goToPart1()` fonctionne toujours (fallback direct).

---

## Hors Scope

- Pas de lien visuel/positionnel entre l'endroit cliqué sur l'avion 3D et le point de départ de l'overlay 2D (l'overlay se déploie toujours depuis le centre de l'écran, indépendamment de la position de l'avion au moment du clic).
- Pas de texture/grain papier (papier blanc simple, cf. décision utilisateur).
- Pas de transition inverse (partie 1 → partie 2) — hors scope de cette demande.
- Pas de configuration/réglages exposés à l'utilisateur final (nombre de bandes, durée, etc. sont fixes dans le code).

---

## Fichiers à Créer

- `Le coeur de Bananin/paper-transition.js`

## Fichiers à Modifier

- `Le coeur de Bananin/index.html` (markup overlay + script tag)
- `Le coeur de Bananin/style.css` (styles + keyframes)
- `Le coeur de Bananin/scene3d-part2.js` (fonction `goToPart1()`)
