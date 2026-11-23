# Fondu de bord aquarelle pour Meshy_output — Partie 2 Bananin — Design

**Goal:** Faire en sorte que le pourtour extérieur du mesh `Meshy_output` (petite flaque de terrain/rocher, partie 2 de "Le cœur de Bananin") s'affiche avec un bord flou et irrégulier façon aquarelle, plus quelques petites taches isolées dispersées juste au-delà du bord, au lieu de son bord géométrique net actuel — **directement dans Blender** (retouche de texture + ré-export GLB), pas en code runtime.

> Ce document a été réécrit le 2026-07-17 : le design/l'intention (bord flou irrégulier + gouttes dispersées, style aquarelle) restent ceux validés précédemment. Seule la méthode d'exécution change : édition du canal alpha de la texture source dans Blender via MCP, au lieu d'un masque Three.js/canvas généré au runtime.

## Contexte technique découvert (fichier source Blender)

- Fichier source : `Le coeur de Bananin/asset/model/Word-Dogon.blend`.
- `Meshy_output` (nom du node dans le GLB) référence le mesh Blender `output.001` : **29 sommets**, 91 boucles UV, un seul UV layer.
- Bbox UV réelle mesurée dans Blender (via `bpy`, pas via Three.js) : **U ∈ [0.6037, 0.6379]**, **V ∈ [0.1623, 0.2067]** — une petite sous-région d'un atlas 2048×2048.
- Matériau `Material_0.002`, **exclusif à cet objet** (aucun autre matériau dans le `.blend` ne l'utilise).
- Ce matériau utilise l'image `Baked_BaseColor.png` (2048×2048, RGBA, colorspace sRGB, `alpha_mode='STRAIGHT'`) — cette image est elle aussi **exclusive à `Material_0.002`** (vérifié : aucun autre matériau du fichier ne la référence). On peut donc modifier son canal alpha librement sans impacter le reste de la scène.
- Le nœud `Image Texture` (Base Color) alimente déjà l'entrée **Alpha** du `Principled BSDF` (branchement existant, `Alpha.is_linked == True`). Le matériau est en `blend_method = 'HASHED'`, ce qui correspond côté export glTF à `alphaMode: BLEND` (cohérent avec l'observation faite précédemment côté runtime).
- Conséquence directe : **il n'y a rien à créer côté shader** — il suffit de peindre le masque voulu dans le canal alpha existant de `Baked_BaseColor.png`, dans la zone UV du mesh (+ marge de padding pour les taches), pour que le fondu apparaisse aussi bien dans Blender que dans le GLB exporté.

## Approche

1. **Localiser la région pixel** correspondant à la bbox UV du mesh dans l'image 2048×2048 (`x = U × 2048`, `y = V × 2048`, V=0 en bas — convention Blender native, pas de flip nécessaire puisqu'on manipule `image.pixels` directement dans Blender). Ajouter un padding (~40–60% de la taille de la bbox) autour pour laisser de la place au fondu et aux taches sans les couper.
2. **Générer le masque alpha** dans cette zone pixel via `bpy`/numpy (script exécuté par `execute_blender_code`) :
   - Alpha = 1 (opaque) sur le cœur de la forme occupée par le terrain.
   - Bord flou et irrégulier : plusieurs cercles/ellipses légèrement décalés et de rayons randomisés, combinés (max), plus du bruit (Perlin/valeur aléatoire lissée) modulant le rayon en fonction de l'angle — pas un simple radial gradient parfait.
   - 3–6 petites taches isolées à alpha partiel (0.2–0.6), dispersées juste au-delà du bord principal, tailles et positions aléatoires — effet "gouttes d'aquarelle".
   - Seul le **canal alpha** est modifié ; les canaux RGB (couleur du terrain) restent inchangés.
3. **Écrire les pixels modifiés** dans `bpy.data.images['Baked_BaseColor.png'].pixels` (uniquement dans la zone paddée, le reste de l'image — non échantillonné par ce mesh — reste intact), puis `image.pack()`/`update()` et sauvegarde du `.blend`.
4. **Vérification visuelle immédiate dans Blender** (`get_viewport_screenshot` en mode rendu Material Preview/Cycles) avant tout export.
5. **Avant export GLB** : décimer/joindre/compresser selon la pratique standard du projet (mémoire `feedback_reduce_before_export`) — vérifier qu'aucune géométrie superflue n'a été introduite (aucune ici, seule la texture change) et que la compression de texture/Draco habituelle du pipeline d'export est appliquée.
6. **Ré-export** vers `Le coeur de Bananin/asset/model/scene-partie2.glb`.
7. **Vérification navigateur** : serveur local, scroll jusqu'à la partie 2, orbite caméra libre autour du terrain, confirmer le bord flou/irrégulier + taches, et absence de régression (éclairage, ombres, `preventTerrainClipping` — la géométrie de collision n'est pas touchée, seule la texture change).

## Fichiers concernés

- `Le coeur de Bananin/asset/model/Word-Dogon.blend` — édition du canal alpha de l'image `Baked_BaseColor.png` (matériau `Material_0.002`), via script Python exécuté dans Blender (MCP).
- `Le coeur de Bananin/asset/model/scene-partie2.glb` — ré-exporté depuis ce `.blend` après modification.
- Aucun changement dans `Le coeur de Bananin/scene3d-part2.js` (le fondu vit désormais entièrement dans la texture, pas dans le code runtime).

## Vérification

1. Dans Blender : capture viewport (rendu shading) montrant le bord flou/irrégulier et les taches sur `Meshy_output` avant export.
2. Après export : serveur local (`cd "Le coeur de Bananin" && npx --yes http-server -p 8080 .`), scroller jusqu'à la partie 2, observer le bord de la flaque de terrain sous plusieurs angles de caméra (orbite libre) : le bord doit apparaître flou/irrégulier avec quelques petites taches dispersées, sans changement du reste du rendu.

## Hors scope

- Pas de changement du comportement de collision caméra (`preventTerrainClipping`) — le fondu est purement visuel (alpha texture), la géométrie de collision reste identique (29 sommets, bbox inchangée).
- Pas d'animation du fondu (masque statique, peint une fois dans la texture source).
- Pas de retouche des autres zones de l'atlas `Baked_BaseColor.png` (seule la zone UV du mesh + padding est modifiée).
