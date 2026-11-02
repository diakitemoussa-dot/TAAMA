# personnage-joueuse-gadget.glb — la joueuse (version féminine du personnage)

Même armature que `personnage-joueur-gadget.glb` : **65 os `mixamorig:*`, mêmes noms, même hiérarchie, mêmes 12 clips** (idle, walk, run, jump, Shoot_Gadget, Pistol Kneeling Idle, Pistol Strafe left/right, Pistol Walk Backward, Dying, control_idle, idle_look, cadence 24 i/s). Les nœuds `Gadget_Nexus` et `DroneLandingPad` sont conservés : le code du sanctuaire (`sanctuary-mode.js`) peut charger ce fichier à la place de l'autre en changeant seulement `PLAYER_GLB_URL`.

Différences : corps, haut et pantalon remodelés (épaules plus étroites, taille, hanches, poitrine, tête 7 % plus petite) ; cheveux, moustache et barbe d'origine retirés ; coiffure en chignon haut et deux tresses, sourcils, lèvres, boucles d'oreilles dorées (maillages `CW_Hair`, `CW_HairTie`, `CW_Brows`, `CW_Lips`, `CW_Earrings`, tous pondérés sur la tête / le haut du dos) ; haut vert-bleu, pantalon sable.

Sources et régénération : `Documents\Djenne3D\perso_f\build_joueuse.py` (`blender -b --python build_joueuse.py -- <sortie> [--preview]`).
Pas encore branché dans le jeu : aucun choix homme/femme à l'écran « Nouvelle partie » pour l'instant.
