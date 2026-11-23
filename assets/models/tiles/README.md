# Tuiles spatiales de la maquette

Découpage de `assets/models/djenne-ar.glb` en **21 fichiers** (1 cœur + 20 tuiles)
pour le chargement à la demande (`app/spatial-streaming.js`).

```
core.gltf + core.bin         1,52 Mo · 376 387 tris  (mosquée, murs, ciel, nuages…)
tile_X_Z.gltf + tile_X_Z.bin  20 tuiles · 2,37 Mo · 252 983 tris (végétation, sol lointain)
textures/tex_00.webp …        6 textures partagées · 210 Ko
index.json                    manifeste (centre, rayon, boîte, taille, priorité)
```

Total : **629 370 triangles** — identique au GLB d'origine, au triangle près.

## Principe

- Les maillages **compacts** (mosquée, minarets, clôture, portes, poteaux, canaris…)
  restent entiers dans `core.gltf`, chargé en premier : le jeu retrouve tous les
  noms de nœuds attendus (`Mosquee_Base`, `Minarets`, `Poteau…`).
- Les maillages **étendus** (arbre Bodhi, `Plane.011`) sont découpés selon une
  grille XZ de **96 m**. Chaque triangle va dans la tuile de son centre.
- Le ciel, les nuages et les grands fonds (`Sphere.001`, `Plane.012`,
  `WEB_Cloud3D_4.002`) restent dans le cœur (regex `ALWAYS` de `tools/split-tiles.mjs`).
- Les **textures sont externalisées une seule fois** dans `textures/` : les tuiles
  sont écrites en `.gltf` + `.bin` (un `.glb` ré-embarquerait les 210 Ko de textures
  dans chaque tuile).
- Draco : cœur en 14/10/12 bits (positions/normales/UV), tuiles en 12/8/11.

## `index.json`

```json
{
  "version": 1,
  "cell": 96,
  "tiles": [
    {
      "id": "core",
      "file": "core.gltf",
      "center": [4.1, 11.0, 0.2],
      "radius": 660.95,
      "box": { "min": [-366.5, -354.5, -416.7], "max": [373.8, 356.1, 416.7] },
      "tris": 376387,
      "bytes": 1595239,
      "always": true
    }
  ]
}
```

`center` et `radius` servent au calcul de distance ; `box` au frustum culling.

## Régénérer

```bash
npm run tiles          # node tools/split-tiles.mjs --cell 96
npm run tiles:check    # contrôle triangles / bbox / nœuds attendus
```

Options : `--cell 96` (taille de grille), `--atomic 110` (en dessous, le mesh reste
entier), `--src`, `--out`.

> Après régénération, pensez à incrémenter `TILES_INDEX_URL` (`?v=`) dans
> `app/mosque-viewer.js` et `spatial-streaming.js?v=` afin de contourner le cache.

## Vérifier dans le navigateur

```bash
npm run serve
# puis
http://localhost:8123/?streaming=1     # HUD : tuiles, Mo, rayon, tris
http://localhost:8123/?tiles=0         # ancien chargement monolithique (secours)
```

Tests automatisés (Chrome + SwiftShader, sans interface) :

```bash
npm run test:tiles     # charge les 21 tuiles, vérifie 629 370 tris et les nœuds
npm run test:compare   # compare visuellement monolithique vs tuiles
npm run test:app       # lance la vraie expérience et suit les requêtes réseau
```

La comparaison pixel donne un écart moyen de **1,3 à 1,7 / 255** (~2 % de pixels
différents, surtout des contours) entre l'ancien GLB et les tuiles.
