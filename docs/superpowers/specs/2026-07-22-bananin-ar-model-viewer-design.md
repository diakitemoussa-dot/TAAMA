# AR iOS/Android via model-viewer — Le cœur de Bananin
**Date :** 2026-07-22
**Statut :** Approuvé

---

## Objectif

Le bouton AR déjà présent dans la scène `#scene3d-part2` (à côté du modèle `scene-partie2.glb`) doit réellement lancer la réalité augmentée native, sur iOS **et** Android, sans app à installer.

---

## Contexte / décision clé

Une première implémentation utilisait `navigator.xr.isSessionSupported('immersive-ar')` (WebXR brut). Rejetée : Safari iOS ne supporte pas WebXR du tout, donc l'écran d'incompatibilité s'affichait systématiquement sur iPhone.

Décision : reprendre le pattern déjà utilisé et validé dans deux autres projets du même utilisateur (`Grenier Dogon`, `Toguna`) : le web component Google **`<model-viewer>`**.
- Android → mode `scene-viewer` (Google), utilise le `.glb` existant directement
- iOS → mode `quick-look`, `<model-viewer>` génère le `.usdz` **à la volée côté client** — aucun fichier `.usdz` à créer ou fournir

Voir mémoire [[feedback_ar_model_viewer_no_usdz]].

---

## Périmètre

- Un seul modèle concerné : `asset/model/scene-partie2.glb` (celui déjà affiché dans `#scene3d-part2`, là où vit le bouton AR actuel)
- Le modèle de l'arbre/grenier (`scene-bananin.glb`, scène `#scene3d`) reste hors scope — pas de bouton AR à ajouter là

---

## Fichiers impactés

| Fichier | Action |
|---|---|
| `index.html` | Ajouter le `<script>` CDN `model-viewer` + un `<model-viewer>` caché dans `#scene3d-part2` |
| `main.js` | Remplacer le handler du bouton AR : supprimer `checkARSupport()` (WebXR) et son appel `navigator.xr.isSessionSupported` ; utiliser `viewer.canActivateAR` / `viewer.activateAR()` |

Aucun autre fichier touché — l'écran d'incompatibilité DOGOKUN SORO déjà stylé (`#ar-incompatibility-screen`) est réutilisé tel quel comme fallback.

---

## Flow utilisateur

```
clic bouton AR
    │
    ▼
customElements.get('model-viewer') existe ET viewer.canActivateAR === true ?
    │
    ├─ Non → afficher #ar-incompatibility-screen (déjà existant, style DOGOKUN SORO)
    │
    └─ Oui → viewer.activateAR()
              │
              ├─ Android Chrome → Google Scene Viewer (natif, via le .glb)
              └─ iOS Safari     → AR Quick Look (USDZ généré à la volée par model-viewer)
```

---

## Détails d'implémentation

**index.html** — dans le `<head>` :
```html
<script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js"></script>
```

Dans `#scene3d-part2`, à côté du bouton AR existant :
```html
<model-viewer
  id="ar-viewer"
  src="asset/model/scene-partie2.glb"
  ar
  ar-modes="webxr scene-viewer quick-look"
  style="position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1"
  loading="eager">
</model-viewer>
```
Un seul modèle fixe → `src` posé une fois en HTML, pas besoin de le fixer en JS (contrairement à Grenier Dogon qui a plusieurs étapes/modèles).

**main.js** — remplacer le bloc `checkARSupport()` + son listener sur `arButton` :
```js
const arViewer = document.getElementById('ar-viewer');

arButton.addEventListener('click', () => {
  if (arViewer && arViewer.canActivateAR) {
    arViewer.activateAR();
  } else {
    arIncompatibilityScreen.classList.remove('hidden');
    arIncompatibilityScreen.classList.add('visible');
  }
});
```
Supprimer : la fonction `checkARSupport()`, l'appel `await checkARSupport()`, toute référence à `navigator.xr`.

---

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| Script CDN model-viewer non chargé (offline, bloqué) | `document.getElementById('ar-viewer')` existe mais `canActivateAR` reste `undefined`/`false` → écran d'incompatibilité |
| Navigateur sans AR (desktop, vieux Android) | `canActivateAR === false` → écran d'incompatibilité |
| `activateAR()` échoue en cours de session (utilisateur annule côté OS) | Comportement natif de l'OS, rien à gérer côté web |

---

## Test

- Automatisable (headless) : le script model-viewer charge sans erreur console, l'élément `#ar-viewer` existe avec le bon `src`, le clic sur le bouton AR déclenche bien `activateAR()` sans exception JS
- **Non automatisable** : l'ouverture réelle de Quick Look (iOS) / Scene Viewer (Android) nécessite un vrai téléphone — validation finale à faire par l'utilisateur sur son appareil ; en cas de souci il fournira une capture d'écran

---

## Hors scope

- Bouton AR pour le modèle arbre/grenier (`scene-bananin.glb`)
- Placement/scale/ancrage personnalisé (on délègue entièrement l'expérience AR à `<model-viewer>`/Scene Viewer/Quick Look natifs)
- Fichier `.usdz` statique ou pré-généré
