/* ==========================================================
   ARMES À FEU RETIRÉES DES MODÈLES — le pistolet / fusil / gadget tenu par le personnage n'est jamais affiché.
   Appelé sur chaque modèle de personnage chargé (Sanctuaire, aperçu du profil, voiture).
   Les noms ci-dessous sont ceux du GLB du personnage (« Pistol », « Gadget_Nexus », « GN_Blue_Glow »…).
   ========================================================== */
const FIREARM_NAME = /pistol|rifle|gun|gadget|nexus|GN_Blue|arme/i;

/** Masque tous les nœuds d'arme d'un modèle. Retourne le nombre de nœuds masqués. */
export function hideFirearms(root) {
  if (!root || !root.traverse) return 0;
  let n = 0;
  root.traverse((o) => {
    if (o.name && FIREARM_NAME.test(o.name)) { o.visible = false; n++; }
  });
  return n;
}
