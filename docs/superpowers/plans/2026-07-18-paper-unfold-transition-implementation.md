# Transition "Dépliage de Papier" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le fade simple actuel entre la partie 2 et la partie 1 de "Le cœur de Bananin" par une transition en dépliage de papier en accordéon (6 bandes, centre → bords, durée totale 2000ms).

**Architecture:** Overlay HTML statique (6 `div.paper-strip`) piloté par classes CSS + `@keyframes` pour l'animation de dépliage (staggered via `animation-delay` en `nth-child`), et un petit module JS autonome (`paper-transition.js`) qui orchestre le timing global (déclenchement, callback à mi-parcours, fondu de sortie) et l'intègre dans `goToPart1()`.

**Tech Stack:** HTML, CSS (`@keyframes`, `transform`, `transition`), Vanilla JS (pas de framework)

---

## Structure de Fichiers

```
Créer:
- Le coeur de Bananin/paper-transition.js : orchestration du timing, expose window.playPaperUnfoldTransition(onFullyCovered)

Modifier:
- Le coeur de Bananin/index.html : markup overlay (6 bandes) + script tag
- Le coeur de Bananin/style.css : styles overlay/bandes + keyframes + délais
- Le coeur de Bananin/scene3d-part2.js : goToPart1() utilise la transition avec fallback
```

---

## Task 1: Markup HTML de l'overlay

**Files:**
- Modify: `Le coeur de Bananin/index.html`

- [ ] **Step 1: Ajouter le markup de l'overlay avant la fermeture de `</body>`**

Ouvre `Le coeur de Bananin/index.html`. Juste avant le premier `<script type="importmap">` (donc après tous les `<div>` de contenu, avant les scripts), ajoute :

```html
  <div id="paper-unfold-overlay" hidden>
    <div class="paper-strip paper-strip--left"></div>
    <div class="paper-strip paper-strip--left"></div>
    <div class="paper-strip paper-strip--left"></div>
    <div class="paper-strip paper-strip--right"></div>
    <div class="paper-strip paper-strip--right"></div>
    <div class="paper-strip paper-strip--right"></div>
  </div>
```

- [ ] **Step 2: Ajouter le script tag `paper-transition.js`**

Toujours dans `index.html`, trouve la ligne :

```html
  <script src="main.js"></script>
```

Ajoute juste après :

```html
  <script src="paper-transition.js"></script>
```

Le bloc de scripts en fin de fichier doit ressembler à :

```html
  <script src="main.js"></script>
  <script src="paper-transition.js"></script>
  <script type="module" src="scene3d.js"></script>
  <script type="module" src="scene3d-part2.js"></script>
```

- [ ] **Step 3: Vérifier visuellement**

Ouvre `Le coeur de Bananin/index.html` et confirme que :
- Le `<div id="paper-unfold-overlay" hidden>` avec ses 6 bandes est présent
- `<script src="paper-transition.js"></script>` est bien après `main.js` et avant les scripts `type="module"`

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/index.html"
git commit -m "feat: add paper unfold overlay markup to index.html"
```

---

## Task 2: Styles CSS et animations de dépliage

**Files:**
- Modify: `Le coeur de Bananin/style.css`

- [ ] **Step 1: Ajouter les styles de l'overlay et des bandes**

À la fin de `Le coeur de Bananin/style.css`, ajoute :

```css
/* Transition "dépliage de papier" entre partie 2 et partie 1 */
#paper-unfold-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  z-index: 9999;
  pointer-events: none;
}

#paper-unfold-overlay[hidden] {
  display: none;
}

#paper-unfold-overlay.fading-out {
  transition: opacity 725ms ease-in-out;
  opacity: 0;
}

.paper-strip {
  flex: 1 1 0;
  height: 100%;
  background: #ffffff;
  transform: scaleX(0);
}

.paper-strip--left {
  transform-origin: right center;
}

.paper-strip--right {
  transform-origin: left center;
}

@keyframes paper-strip-unfold-left {
  0% {
    transform: scaleX(0) rotateY(-40deg);
  }
  100% {
    transform: scaleX(1) rotateY(0deg);
  }
}

@keyframes paper-strip-unfold-right {
  0% {
    transform: scaleX(0) rotateY(40deg);
  }
  100% {
    transform: scaleX(1) rotateY(0deg);
  }
}

#paper-unfold-overlay.unfolding .paper-strip--left {
  animation-name: paper-strip-unfold-left;
  animation-duration: 700ms;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

#paper-unfold-overlay.unfolding .paper-strip--right {
  animation-name: paper-strip-unfold-right;
  animation-duration: 700ms;
  animation-timing-function: ease-out;
  animation-fill-mode: forwards;
}

/* Délais par bande, du centre (le plus court) vers les bords (le plus long) :
   distance au centre = |index - 2.5| ; délai = distance * 150ms */
#paper-unfold-overlay.unfolding .paper-strip:nth-child(1) { animation-delay: 375ms; }
#paper-unfold-overlay.unfolding .paper-strip:nth-child(2) { animation-delay: 225ms; }
#paper-unfold-overlay.unfolding .paper-strip:nth-child(3) { animation-delay: 75ms; }
#paper-unfold-overlay.unfolding .paper-strip:nth-child(4) { animation-delay: 75ms; }
#paper-unfold-overlay.unfolding .paper-strip:nth-child(5) { animation-delay: 225ms; }
#paper-unfold-overlay.unfolding .paper-strip:nth-child(6) { animation-delay: 375ms; }
```

- [ ] **Step 2: Vérifier la présence des règles**

Confirme dans `style.css` que les sélecteurs `#paper-unfold-overlay`, `.paper-strip`, les deux `@keyframes`, et les 6 règles `nth-child` sont bien présents.

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/style.css"
git commit -m "feat: add paper unfold overlay styles and keyframe animations"
```

---

## Task 3: Module JS d'orchestration du timing

**Files:**
- Create: `Le coeur de Bananin/paper-transition.js`

- [ ] **Step 1: Créer le fichier avec la logique de timing**

Crée `Le coeur de Bananin/paper-transition.js` avec ce contenu exact :

```javascript
(function () {
  // Timing (doit rester synchronisé avec les valeurs CSS dans style.css :
  // délai max des bandes = 375ms, durée d'animation par bande = 700ms).
  const FULL_COVER_MS = 1075; // délai max (375) + durée d'une bande (700)
  const PAUSE_MS = 200;
  const FADE_MS = 725;

  const overlay = document.getElementById('paper-unfold-overlay');

  window.playPaperUnfoldTransition = function playPaperUnfoldTransition(onFullyCovered) {
    if (!overlay) {
      if (typeof onFullyCovered === 'function') onFullyCovered();
      return;
    }

    // Réinitialiser l'état avant de rejouer (au cas où la transition a déjà tourné).
    overlay.hidden = false;
    overlay.classList.remove('fading-out');
    overlay.classList.remove('unfolding');
    overlay.style.opacity = '';

    // Forcer un reflow pour que le retrait de la classe 'unfolding' soit bien pris en
    // compte avant de la rajouter (sinon l'animation ne se relance pas si elle a déjà joué).
    void overlay.offsetWidth;

    overlay.classList.add('unfolding');

    setTimeout(() => {
      if (typeof onFullyCovered === 'function') onFullyCovered();
    }, FULL_COVER_MS);

    setTimeout(() => {
      overlay.classList.add('fading-out');
    }, FULL_COVER_MS + PAUSE_MS);

    setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('unfolding');
      overlay.classList.remove('fading-out');
    }, FULL_COVER_MS + PAUSE_MS + FADE_MS);
  };
})();
```

- [ ] **Step 2: Vérifier que le fichier est syntaxiquement valide**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\Le coeur de Bananin"
node --check paper-transition.js
```

Expected: aucune sortie (pas d'erreur de syntaxe).

- [ ] **Step 3: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/paper-transition.js"
git commit -m "feat: create paper unfold transition timing module"
```

---

## Task 4: Intégration dans goToPart1()

**Files:**
- Modify: `Le coeur de Bananin/scene3d-part2.js`

- [ ] **Step 1: Localiser la fonction actuelle**

Dans `Le coeur de Bananin/scene3d-part2.js`, cherche `window.goToPart1 = function goToPart1()`. Lis le corps actuel de la fonction pour confirmer sa structure avant de la remplacer (des modifications précédentes dans le fichier — particules de poussière, rotation du Plane — ne touchent pas cette fonction, mais vérifie tout de même qu'elle correspond à ce qui suit avant de remplacer).

- [ ] **Step 2: Remplacer le corps de la fonction**

Remplace toute la fonction `window.goToPart1 = function goToPart1() { ... };` par :

```javascript
window.goToPart1 = function goToPart1() {
  const revealPart1 = () => {
    container.classList.remove('visible');
    container.hidden = true;
    const scene3dDiv = document.getElementById('scene3d');
    if (scene3dDiv) {
      scene3dDiv.hidden = false;
      if (typeof window.playRevealAnimation === 'function') {
        window.playRevealAnimation();
      }
      if (typeof window.startScene3D === 'function') {
        window.startScene3D();
      }
      scene3dDiv.classList.add('visible');
    }
  };

  if (typeof window.playPaperUnfoldTransition === 'function') {
    window.playPaperUnfoldTransition(revealPart1);
  } else {
    // Fallback si paper-transition.js n'a pas chargé : comportement direct.
    revealPart1();
  }
};
```

- [ ] **Step 3: Vérifier**

Relis la fonction modifiée : elle doit appeler `window.playPaperUnfoldTransition` avec `revealPart1` en callback, et avoir un fallback qui appelle `revealPart1()` directement si la fonction de transition n'existe pas.

- [ ] **Step 4: Commit**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add "Le coeur de Bananin/scene3d-part2.js"
git commit -m "feat: integrate paper unfold transition into goToPart1"
```

---

## Task 5: Test visuel end-to-end

**Files:**
- Test: Navigateur web via serveur local

- [ ] **Step 1: Lancer le serveur HTTP**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS\Le coeur de Bananin"
npx --yes http-server -p 8080 . -c-1 &
```

Attends 2-3 secondes que le serveur démarre.

- [ ] **Step 2: Ouvrir le navigateur et attendre le chargement de la partie 2**

Ouvre `http://localhost:8080`. Attends ~4 secondes que la scène 3D de la partie 2 soit chargée et visible (grenier Guyo, ciel procédural).

- [ ] **Step 3: Déclencher la transition**

Puisque cliquer précisément sur l'avion 3D via un test automatisé est peu fiable (position dépendante du raycasting), déclenche la fonction directement pour valider le comportement (comme fait précédemment dans ce projet pour tester `goToPart1`) :

```javascript
window.goToPart1();
```

- [ ] **Step 4: Vérifier la séquence visuelle**

Observe (ou capture des screenshots à différents instants après le déclenchement) :
- **~0-1075ms** : les 6 bandes blanches se déplient depuis le centre vers les bords, écran de plus en plus couvert de blanc
- **~1075ms** : écran entièrement blanc
- **~1075-1275ms** : pause, toujours entièrement blanc
- **~1275-2000ms** : fondu progressif révélant la partie 1 (ciel aquarelle + cercle de révélation qui démarre)
- **~2000ms** : overlay complètement invisible (`hidden` réappliqué), partie 1 visible normalement

- [ ] **Step 5: Vérifier l'absence d'erreurs console**

Ouvre les DevTools (F12) → Console. Confirme qu'il n'y a aucune erreur liée à `paper-transition.js`, `paper-unfold-overlay`, ou `playPaperUnfoldTransition`.

- [ ] **Step 6: Vérifier le fallback (optionnel mais recommandé)**

Dans la console du navigateur, exécute :

```javascript
window.playPaperUnfoldTransition = undefined;
window.goToPart1();
```

Expected: la partie 1 s'affiche immédiatement (comportement direct `revealPart1()`), sans erreur.

- [ ] **Step 7: Commit final si tout est correct**

```bash
cd "c:\Users\Kabakoo Apprenant.e\Desktop\MES PROJETS"
git add -A
git commit -m "feat: paper unfold transition complete and tested end-to-end" --allow-empty
```

---

## Résumé

1. ✅ Markup HTML de l'overlay (6 bandes) + script tag
2. ✅ Styles CSS + keyframes (dépliage centre→bords, délais par bande)
3. ✅ Module `paper-transition.js` (timing, callback, fondu)
4. ✅ Intégration dans `goToPart1()` avec fallback
5. ✅ Test visuel end-to-end (~2000ms, pas d'erreur console, fallback fonctionnel)

La transition "dépliage de papier" est opérationnelle entre la partie 2 et la partie 1.
