# Fleuve : rivage cohérent avec le terrain (`app/river.js`)

**Problème.** `Fleuve_Eau` est une surface plate à y = −12,13 (1 978 sommets) alors que le terrain (`Sol_Large_z16`, `Sol_Ville_z18`) varie : sur ~35 % de la surface le sol est
*au-dessus* de l'eau, 44 % des points juste au-delà du bord ont un sol *plus bas* que l'eau (jusqu'à 7 m). Résultat : plaque d'eau au bord net et rectiligne, tantôt posée
sur le sable (z-fighting, aspect « collé »), tantôt suspendue au-dessus d'un sol bas (« flotte »).

**Solution (rendu seulement, le modèle 3D n'est pas modifié).** Au chargement, une seule fois (`bakeBed`) :
1. rendu vertical du terrain (caméra orthographique à 400 m, ±1 000 m autour de l'origine, 2048² texels, 1024² sur mobile faible) dans une texture demi-flottante :
   R = hauteur du sol − niveau de l'eau, A = 1 là où il y a du sol ;
2. rendu de la surface d'eau seule dans un masque.
Le matériau de l'eau (`SHORE_GLSL` dans `onBeforeCompile`) calcule alors la **profondeur réelle** sous chaque pixel :
- profondeur < 2 cm : pixel supprimé (l'eau suit exactement le terrain, plus de z-fighting) ;
- transparente et claire dans le peu profond (< 0,5 m), avec une frange d'écume animée (< 0,3 m) ; teinte sableuse puis vert-brun et opaque au large ;
- fondu sur 3 m le long du bord du maillage (masque) et au-delà de 3,5 m de profondeur : plus de plaque suspendue au-dessus d'un sol bas ;
- hors de la zone cuite, ou sans extension `EXT_color_buffer_float` / `half_float` : ancien aspect (aucune régression possible).

**Cohérence avec le jeu.** Le jeu mesure déjà la profondeur par la même surface et le même terrain (`water-fx.js`, `water-logic.js` : patauge à 0,15 m, nage à 0,55 m) ;
l'écume apparaît donc exactement là où le personnage commence à patauger. La physique n'a pas changé.

**Limites.** Zone cuite = ±1 000 m (au-delà : ancien aspect) ; résolution ≈ 1 m (le rivage est lisse, pas pixel-parfait) ; terrain cuit une fois : si un terrain
`Sol_*` est modifié ou chargé après, relancer `River` (recharger la page).

## Fleuve profond (lit creusé, `carveRiver`)
Sous l'eau, le terrain du modèle était presque plat (30 à 80 cm) : impossible de vraiment nager. Au chargement, les sommets de `Sol_*` situés sous l'eau sont abaissés selon leur
distance à la rive : **0,30 m de profondeur par mètre depuis la berge, jusqu'à 2,8 m** (1 000 sommets environ, jusqu'à 2 m de baisse). Les collisions du joueur, la profondeur mesurée
par le jeu (pataugeage, nage) et l'aspect de l'eau suivent ce nouveau relief (la carte du lit est recuite après le creusement).

**Épargnées :** toutes les routes du réseau de la voiture (`routes-djenne-voiture.json`) qui touchent le fleuve ou passent à moins de 40 m de lui (disque de 16 m, fondu de 12 m) :
les gués restent franchissables. Vérifié par conduite automatique : École (99 m de gué) et Tonombo (182 m) arrivent à destination.
Désactiver : `?nocarve=1` dans l'adresse. Limites : zone de ±1 000 m ; résolution du relief = celle des sommets du terrain (13 m en ville).
