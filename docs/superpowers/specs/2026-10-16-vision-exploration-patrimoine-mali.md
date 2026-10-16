# 🛸 Idée d'Amélioration & Concept du Jeu : *Exploration du Patrimoine du Mali*

> **Statut :** vision proposée par l'utilisateur (16/10/2026) — implémentation par phases en cours.
> **Correspondance avec le projet :** voir la section en fin de document.

---

## 🎬 Scénario & Déroulement du Jeu (User Flow)

1. **Écran de chargement (Splash Screen) :**
   * Dès que l'utilisateur lance le jeu, une interface de chargement se lance avec une bonne image qui représente le jeu.
   * Pendant le chargement, ce sont les ressources du jeu qui seront téléchargées (cela risque de prendre un peu de temps).

2. **Vidéo animée d'introduction :**
   * Après le chargement, une vidéo animée du jeu se lance.
   * La vidéo illustre l'histoire sur laquelle le jeu est basé.
   * Un **bouton "Passer"** est présent en bas de la vidéo pour sauter la séquence.

3. **Interface du Menu Principal (Vue 360°) :**
   * Après la vidéo, une interface s'affiche avec une image de fond du jeu sur laquelle tourne le modèle en 360°.
   * Différentes parties/interfaces sont accessibles :
     * 👤 **Partie Personnage**
     * 🛸 **Partie Drone / Modèles** (avec les différents modèles disponibles)
     * 🌐 **Partie Connexion**
     * 🎯 **Partie Mission / Game**
     * 🕊️ **Partie Exploration Libre**
     * *(etc.)*

4. **Briefing & Explications (Fenêtre avec Personnage 2D) :**
   * Dès que l'utilisateur clique sur la **partie jeu / game**, une fenêtre apparaît.
   * Un personnage en modèle 2D s'adresse au joueur sous forme de slides pour lui donner des explications et lui présenter les différentes missions qu'il doit accomplir.
   * Le joueur utilise un **bouton "Suivant"** pour passer d'une slide à l'autre.

5. **Carte 2D Navigable & Déverrouillage des Missions :**
   * Une fois les slides terminées, le joueur accède à la **carte 2D navigable** présentant les différentes missions dans les différentes villes.
   * **Règles de progression :**
     * 🟢 Seule **une seule mission est active (en vert)** au tout début.
     * 🔒 Les autres missions sont **bloquées** : il faut progresser dans le jeu pour les débloquer.
     * 🏹 Tout au début, une **flèche indicative** va guider le joueur dans l'interface.

---

## ❓ Questions Clés

### 1. Quelles seront les villes qui seront dans le jeu en plus de Djenné ?

* **Djenné :** La ville de départ (focalisée sur la Grande Mosquée et la zone urbaine en banco).
* **Ségou :**
  * *Quelle partie de Ségou ?* **Ségou Koro** (la cité ancienne/historique) et les **bords du fleuve Niger** (zones artisanales et de poterie).
* **Mopti :** La zone du port fluvial et le carrefour des pirogues/pinasses.
* **Tombouctou :** La zone entourant la Mosquée Djingareyber et les centres de manuscrits.

### 2. Quelles sont les différentes missions que le jeu doit accomplir ?

* **Mission 1 (Djenné) :** Inspection et diagnostic de la structure de la Grande Mosquée (détecter les zones d'érosion et retrouver des éléments/symboles architecturaux sur le bâtiment).
* **Mission 2 (Ségou - Ségou Koro) :** Navigation le long des bords du fleuve Niger à Ségou Koro pour scanner les vestiges historiques et récupérer un document/objet d'archive lié à l'histoire de la cité.
* **Mission 3 (Mopti) :** Cartographie de la zone portuaire et repérage des trajets de transport du matériel de restauration à travers la ville.

### 3. Quels seront les personnages qui seront inclus dans le jeu ?

* **Le Joueur / Pilote :** Le personnage principal contrôlé par l'utilisateur.
* **Le Personnage Guide (Modèle 2D) :** Une historienne / spécialiste du patrimoine qui apparaît dans les slides pour donner les consignes, expliquer les missions et guider le joueur avec le bouton "Suivant".
* **Les PNJ locaux (Personnages Non Joueurs) :** Des figures locales rencontrées dans chaque ville (comme le maître maçon à Djenné ou l'artisan/historien à Ségou Koro) qui signalent les épreuves à réaliser.

### 4. Quel lien y a-t-il entre la mission 1 et la mission 2 / Ville 1 et Ville 2 ?

* **Le Lien Narratif :**
  * En accomplissant la **Mission 1 à Djenné**, l'inspection du site permet au joueur de découvrir un indice historique (un symbole ou des coordonnées) mentionnant un vestige conservé à Ségou Koro.
  * La réussite de la Mission 1 débloque alors la **Ville 2 (Ségou)** sur la carte 2D (la mission qui était bloquée passe au vert).
  * Le joueur enchaîne ainsi la **Mission 2 à Ségou** en suivant la suite logique de l'histoire et du réseau du patrimoine le long du fleuve Niger.

---

## 🔧 Correspondance avec le projet actuel (16/10/2026)

| Étape de la vision | État dans le projet | Où |
|---|---|---|
| 1. Écran de chargement | ⚠️ Partiel — animation de texte d'entrée + % de chargement de la maquette. *Image de fond à fournir par l'utilisateur.* | `index.html` (`#boot`, `#mosqueLoading`), `main.js` |
| 2. Vidéo d'intro + bouton Passer | ✅ **Existant** — vidéo drone (PC/mobile) avec bouton `PASSER ›`, puis séquence de décollage T-3 | `main.js`, `assets/videos/intro-drone *.mp4` |
| 3. Menu principal vue 360° | ✅ **Ajouté (P-A)** — la maquette tourne doucement, menu avec sections Missions / Exploration libre / Drone & Modèles / Carnet / Personnage / Connexion | `app/menu.js`, `styles/menu.css` |
| 4. Briefing slides + personnage guide 2D | 🔜 P-B — à construire (placeholder en attendant l'illustration du personnage) | à venir |
| 5. Carte 2D navigable + déverrouillage | 🔜 P-B — à construire (Djenné → Ségou → Mopti → Tombouctou, une mission active en vert) | à venir |
| Villes Ségou / Mopti / Tombouctou | 🔜 P-C — nécessite des décisions d'assets 3D (génération ou banque d'assets) | à venir |

**Notes techniques :**
- Le vaisseau (`assets/models/vaisseau.glb`) et le drone (`assets/models/drone.glb`) sont déjà commutables en jeu — le menu « Drone & Modèles » s'appuie dessus.
- `assets/models/personnages.glb` existe (personnages 3D) — pourra servir d'alternative au personnage 2D des slides.
- La carte 2D devra s'articuler avec l'état des missions (`localStorage` `djenne.missions.v2`).
