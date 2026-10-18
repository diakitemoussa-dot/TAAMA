# 🎮 GDD — « Les Gardiens de Djenné » — Système de Missions

**Date :** 16 octobre 2026
**Statut :** Validé — Phase 1 implémentée (16/10/2026)
**Fichiers concernés :** `app/missions.js` (nouveau), `styles/missions.css` (nouveau), `index.html`, `app/drone-game.js`, `app/sanctuary-mode.js`, `app/mosque-viewer.js`

---

## 1. Vision

Transformer l'expérience de visite actuelle (GAME / SANCTUAIRE / AR) en **jeu de missions** :
le visiteur devient un **apprenti Gardien du patrimoine** de Djenné, qui reçoit des missions
du **Maître Maçon** pour préparer le **Grand Crepissage** (la fête annuelle de l'enduit).

- **Public :** jeunes visiteurs, élèves, familles (8–16 ans + tout public).
- **Durée d'une partie complète :** 15–25 min.
- **Mobile d'abord**, mais jouable confortablement sur PC.
- **Ne casse rien :** l'« Exploration libre » conserve l'expérience actuelle à l'identique.

---

## 2. Rôle du joueur & contexte narratif

> « Avant le Grand Crepissage, la mosquée doit être inspectée, ses secrets vérifiés.
>  Toi, jeune apprenti, tu vas tout voir d'en haut comme d'en bas. Bonne chance. »
>  — Le Maître Maçon

Le joueur progresse de **Apprenti → Compagnon → Gardien → Grand Gardien**.
Chaque mission mêle **fun** (voler, scanner, photographier) et **savoir** (fiches, quiz).

---

## 3. Boucle de jeu (core loop)

```
 Recevoir une mission  →  Objectif clair affiché (HUD + flèche 3D)  →
 Réaliser l'action (drone / sanctuaire / vidéo / AR / quiz)  →
 Feedback immédiat (toast + son + Banco ⛁)  →
 Progression (grade, talisman, déblocage)  →  Mission suivante
```

### 3 piliers
| Pilier | Contenu |
|---|---|
| **Explorer** | Vol drone, marche intérieure, toit, AR |
| **Découvrir** | Fiches d'info existantes + quiz éducatif |
| **Collectionner** | Banco ⛁ (points), Talismans (badges), grades, diplôme final |

---

## 4. Récompenses & progression

### Monnaie : le **Banco** ⛁
Points gagnés par mission. Total = progression de grade.

| Grade | Banco requis |
|---|---|
| Apprenti | 0 |
| Compagnon | 150 |
| Gardien | 300 |
| Grand Gardien | 500 |

### Talismans (badges)
| Talisman | Condition |
|---|---|
| 🥇 Premier Envol | Terminer M01 |
| 📸 Œil du Sahel | Terminer M03 |
| 🏺 Archéologue | Terminer M04 |
| 🌙 Veilleur des Tombeaux | Terminer M06 |
| 🕌 Funambule | Terminer M08 |
| 📚 Savant de Djenné | Terminer M09 |
| 🛠️ Maître du Crepissage | Terminer M10 |
| 🏆 Gardien d'Honneur | Terminer M12 (diplôme) |

### Déblocages
- 🛸 **Vaisseau** : débloqué après M07 (actuellement libre — on le gate).
- 🎨 **Skins de drone** (couleurs) : 1 débloqué en M02, 1 en M05, 1 en M09.

---

## 5. Les missions (12 missions, 4 chapitres)

### Chapitre 1 — L'Apprenti Pilote (mode GAME / drone)

| ID | Mission | Objectif concret | Déclencheur technique | Récompense |
|---|---|---|---|---|
| M01 | **Premier envol** | Décoller et atteindre 12 m d'altitude | `altitude >= 12` (télémétrie existante) | 20 ⛁ + 🥇 |
| M02 | **Le tour du propriétaire** | Franchir les 4 anneaux lumineux autour de la cour | 4 anneaux (nouveaux) dans la scène, test de passage | 30 ⛁ + skin |
| M03 | **L'Œil du Sahel** | Photographier la façade de la prière | Photo + zone/angle de caméra | 30 ⛁ + 📸 |
| M04 | **Le Trésor des Tours** | Scanner les œufs d'autruche au radar | Fin du scan existant (`scanState`) | 40 ⛁ + 🏺 |

### Chapitre 2 — Les Secrets du Sanctuaire (mode SANCTUAIRE)

| ID | Mission | Objectif concret | Déclencheur technique | Récompense |
|---|---|---|---|---|
| M05 | **Franchir la porte** | Entrer dans le sanctuaire et atteindre la salle de prière | Zone 3D intérieure | 20 ⛁ + skin |
| M06 | **La Veillée des tombeaux** | Scanner les tombeaux (scan existant) | Fin du scan « Tombeaux » | 30 ⛁ + 🌙 |
| M07 | **La Place de l'Imam** | Trouver et scanner la place de l'Imam | Fin du scan « Place de l'Imam » | 40 ⛁ + **déblocage 🛸** |
| M08 | **Le Toit du Monde** | Prendre le portail vers le toit + photo depuis le toit | Portail existant + photo en zone toit | 50 ⛁ + 🕌 |

### Chapitre 3 — L'Épreuve du Savoir (quiz)

| ID | Mission | Objectif concret | Déclencheur technique | Récompense |
|---|---|---|---|---|
| M09 | **Le Quiz du Patrimoine** | Répondre correctement à 5 questions | Modale quiz (nouvelle) | 60 ⛁ + 📚 + skin |

**Banque de questions (validées par les fiches existantes) :**
1. À quoi servent les **torons** de bois qui dépassent des murs ? → *D'échafaudage permanent pour refaire l'enduit chaque année*
2. Que sont les **canaris** posés sur le toit ? → *Des bols en terre cuite qui bouchent les trous d'aération*
3. Que symbolise l'**œuf d'autruche** au sommet des tours ? → *La pureté et la fécondité*
4. En quoi est bâtie la mosquée ? → *En banco (terre crue + paille)*
5. Qui refait l'enduit chaque année ? → *Les habitants, pendant le Grand Crepissage*
6. Vers où est orientée la façade de la prière ? → *Vers La Mecque (la qibla)*

### Chapitre 4 — Le Grand Crepissage (finale)

| ID | Mission | Objectif concret | Déclencheur technique | Récompense |
|---|---|---|---|---|
| M10 | **Le Grand Crepissage** | Regarder la vidéo du crépissage + livrer 6 boules de banco en drone | Vidéo `annual_plastering.mp4` + 6 anneaux « livraison » | 60 ⛁ + 🛠️ |
| M11 | **Ramène la Mosquée chez toi** | Placer la mosquée en AR dans son environnement | `model-viewer` existant (succès = ouverture) | 40 ⛁ |
| M12 | **Diplôme de Gardien** | Écran final : score, talismans, photos, grade | — | 🏆 Diplôme |

---

## 6. UX / HUD (ce que voit le joueur)

1. **Écran de choix** (au premier arrivé sur la maquette, après la vidéo drone) :
   **« 📜 MISSIONS »** ou **« 🧭 EXPLORATION LIBRE »** (mémorisé, modifiable).
2. **Bandeau mission active** (haut-centre, discret) : `M03 · L'Œil du Sahel — Photo 0/1`,
   avec bouton replier. Bascule automatiquement à chaque étape.
3. **Carnet de missions** 📜 (nouveau bouton dans la barre d'outils) :
   panneau listant les 4 chapitres, statut par mission (🔒 verrouillée / ● dispo / ◐ en cours / ✓ terminée),
   récompenses visibles. C'est aussi là qu'on **relance** une mission.
4. **Toasts** : « ✓ MISSION ACCOMPLIE · +30 ⛁ » (son `action-sound.mp3` réutilisé),
   « 🔓 VAISSEAU DÉBLOQUÉ ! », « 🏅 Talisman obtenu ».
5. **Waypoints 3D** : flèche dorée animée (modèle `direction.glb` déjà utilisé au sanctuaire,
   réutilisé côté drone) qui pointe vers l'objectif + **anneaux lumineux** pour les checkpoints
   (même style que les anneaux du radar existant).
6. **Compteur Banco + grade** : pastille discrète (ex. « ⛁ 220 · Gardien »).
7. **Écran Talismans** : collection, surprises au fur et à mesure.
8. **Écran Diplôme final** : grade obtenu, score, talismans, photos de la session,
   bouton « Rejouer » / « Explorer librement ». (Version imprimable/partageable image plus tard.)

---

## 7. Architecture technique

### Nouveau module : `app/missions.js` (~700 lignes estimées)
- **Définitions** des missions (données pures, facile à éditer).
- **État** : missions faites, banco, talismans, skins, choix missions/libre.
- **Persistance** : `localStorage` clé `djenne.missions.v1` (+ bouton « Réinitialiser »).
  ⚠️ Corrige aussi au passage la persistance du choix drone/vaisseau (spec 2026-07-02).
- **Bus d'événements unifié** : les modes émettent
  `window.dispatchEvent(new CustomEvent('game:event', { detail: {...} }))`
  - `drone:altitude {alt}` · `drone:photo {position, direction}` · `drone:ring {id}` · `scan:egg-done`
  - `sanctuary:scan-done {id}` · `sanctuary:portal {to}` · `zone:enter {zoneId}`
  - `mode:enter {mode}` · `video:watched {id}`
- **Zones 3D** : sphères/boîtes (façade, salle de prière, toit, etc.) testées à bas coût dans les boucles existantes.
- **Anneaux & flèches** : instanciés dans `window.MosqueScene.scene` (APIs existantes `pauseLoop`/`resumeLoop`).

### Modifications légères des fichiers existants
| Fichier | Ajout |
|---|---|
| `app/drone-game.js` | émettre `drone:altitude`, `drone:photo`, `drone:ring`, `scan:egg-done` (4 lignes) |
| `app/sanctuary-mode.js` | émettre `sanctuary:scan-done`, `sanctuary:portal`, `zone:enter` |
| `app/mosque-viewer.js` | émettre `mode:enter`, brancher la vidéo crépissage (M10), écran de choix Missions/Libre |
| `index.html` | markup HUD missions (bandeau, carnet, toast, quiz, diplôme) + `missions.css` |
| `main.js` | rien (sauf audio unlock existant) |

---

## 8. Découpage d'implémentation (phases livrables)

| Phase | Contenu | Résultat testable |
|---|---|---|
| **P1 — Fondations + Chapitre 1** | Moteur missions, persistance, écran choix, carnet, bandeau, toasts, M01→M04 (vol, anneaux, photo façade, radar œufs) | On peut jouer le chapitre drone de bout en bout |
| **P2 — Chapitre 2 Sanctuaire** | M05→M08, waypoints flèche, déblocage vaisseau, zones intérieures | Chapitre intérieur jouable |
| **P3 — Chapitre 3 Quiz + collection** | M09 quiz, écran Talismans, compteur grade, skins drone | Progression complète hors finale |
| **P4 — Finale + polish** | M10 vidéo+livraison banco, M11 AR, M12 diplôme, sons, animations, tests mobile | Partie complète 15–25 min |

Chaque phase est **validée dans la copie** (`mosquee-djenne-copie`, branche `ameliorations`)
avant d'être appliquée à l'original et publiée.

---

## 9. Points à valider

1. **Titre** : « Les Gardiens de Djenné » — OK ou autre idée ?
2. **Narrateur** : le Maître Maçon — OK ?
3. **Monnaie « Banco » ⛁** et **Talismans** — OK ou autres noms ?
4. Priorité des phases (proposition : P1 d'abord, jouable tout de suite).

---

# 🎮 MISE À JOUR v1.1 — Chapitre 1 « qualité jeu vidéo » (16/10/2026)

Suite aux retours : le chapitre 1 passe d'un enchaînement de tutoriels à **5 vraies missions**
avec briefing, objectifs multiples, étoiles et débriefing.

## Nouveau système commun
- **Briefing avant chaque mission** : histoire du Maître Maçon, liste des objectifs,
  récompenses, bouton « 🚁 COMMENCER LA MISSION » (entre directement dans le mode drone).
- **Objectifs à étapes** affichés en direct dans le bandeau (✓ / ○ / ☆ bonus).
- **Étoiles 1 à 3** par mission : 1 ⭐ = mission remplie, ⭐⭐ = performance,
  ⭐⭐⭐ = exploit bonus. Total chapitre : 15 ⭐.
- **Chrono en direct** pour les missions à performance (course, safari, livraison).
- **Écran de débriefing** : étoiles animées, temps réalisé, record, récompenses,
  bouton « ▸ MISSION SUIVANTE ».
- **Grades** : 🎓 Apprenti (0) → ⚒️ Compagnon (75) → 🛡️ Gardien (150) → 👑 Grand Gardien (240 ⛁),
  avec toast de promotion.

## Les 5 missions du chapitre 1
| ID | Mission | Mécanique | Étoiles |
|---|---|---|---|
| M01 | 🚁 Premier vol | Décoller (10 m) + atterrir | ⭐ vol · ⭐⭐ 30 s en l'air · ⭐⭐⭐ 40 m d'altitude |
| M02 | 🏁 La Course du Sahel | Circuit de 8 anneaux en slalom (chaque anneau traversé passe au vert, ordre libre) + compte à rebours + chrono | ⭐ finir · ⭐⭐ <60 s · ⭐⭐⭐ <40 s |
| M03 | 📸 Safari Photo | 3 cibles à photographier (façade, porte, toit aux canaris) | ⭐ 3 photos · ⭐⭐ <2 min 30 · ⭐⭐⭐ + photo des œufs |
| M04 | 🪺 Le Trésor des Tours | Radar œufs + inspection rapprochée | ⭐ scan · ⭐⭐ <30 m des œufs · ⭐⭐⭐ photo des œufs |
| M05 | 🧱 L'Urgence de la Tour | Livraison : 2 boules de banco (chantier → sommet du toit) | ⭐ 2 livraisons · ⭐⭐ <2 min · ⭐⭐⭐ <1 min 20 |

## Assistance en vol
- **Balise lumineuse** (colonne de lumière dorée) qui marque l'objectif actif
  (cible photo, œufs, point de collecte / de livraison).
- **Anneau le plus proche mis en surbrillance** dans la course (les autres s'estompent) ; les anneaux validés passent au **vert**.
- **Balle de banco** visible qui suit le drone pendant le transport.

## Technique
- `app/missions.js` : moteur v2 (état par mission dans `localStorage`, clé `djenne.missions.v2`).
- `mosque-viewer.js` expose `doorTarget` et `canarisTarget` (centres porte / canaris).
- `drone-game.js` transmet `landed` à la boucle de missions (objectif d'atterrissage).
