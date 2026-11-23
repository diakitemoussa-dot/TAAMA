/* ==========================================================
   LABORATOIRE DE TAPAMA — emplacement unique (repère du jeu : x = nord, y = hauteur, z = est)
   ----------------------------------------------------------
   La nouvelle maison de Tapama (assets/models/maison-tapama.glb, blender/djenne-placement-maison.blend) remplace l'ancien labo.
   Le cercle jaune est au centre du cylindre posé dans Blender : rez-de-chaussée, près de l'escalier intérieur.
   Source : assets/models/maison-tapama.json (clé « cercle »). Ce fichier ne fait que dupliquer ces trois nombres pour les modules qui en ont besoin
   avant le chargement du modèle (carte, itinéraire, déclencheur du labo, repère 3D). Rayon = PORTAL_RADIUS de sanctuary-mode.js.
   ========================================================== */
export const LABO = { x: 118.451, y: 7.559, z: -857.185, r: 1.8 };   // placé dans Blender (Cercle_Labo_Tapama)
/** Hauteur d'étage : on n'entre dans le cercle que si le joueur est au rez-de-chaussée (pas à l'étage juste au-dessus). */
export const LABO_HAUTEUR = 2.6;
