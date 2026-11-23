# Spécification Projet : AR Robot Guide — Académie Kabakoo

## 📋 Résumé Exécutif

**Nom du Projet** : AR Robot Guide Kabakoo  
**Objectif** : Développer une expérience de visite guidée en réalité augmentée (AR) de l'Académie Kabakoo  
**Public** : Nouveaux visiteurs, étudiants, partenaires  
**Plateforme** : Web AR (8th Wall)  
**Statut** : Proposition  
**Durée estimée** : 8–10 semaines

---

## 🎯 Description du Projet

L'Académie Kabakoo souhaite offrir une expérience de visite innovante et immersive grâce à la réalité augmentée. Un **robot guide futuriste inspiré de l'esthétique africaine** apparaîtra sur l'écran du visiteur (smartphone/tablette) et le guidera à travers les différents espaces de l'académie, expliquant les zones, les services, et la philosophie de l'établissement en temps réel.

### Avantages de cette approche
- ✅ Expérience visiteur **moderne et engageante**
- ✅ Accessible via **simple lien Web** (pas d'app à télécharger)
- ✅ **Réutilisable** pour futurs événements, campus virtuels
- ✅ **Traçabilité** : collecte de données sur les zones consultées
- ✅ **Scalabilité** : extension possible à d'autres académies

---

## 🤖 Design du Robot Guide

### Concept
- **Nom** : À définir (ex. *Kaja*, *Sango*, *Zahir*)
- **Style** : Futuriste + influences africaines (géométries, couleurs, matériaux)
- **Couleurs** : Palette Kabakoo (`#55415d` violet, `#f9d58b` or) + dégradés modernes
- **Taille** : Adapté à l'écran (scalable selon appareil)
- **Comportement** : Animations douces, gestes expressifs, expressions faciales

### Capacités du robot
1. **Accueil & guidage** : animation de bienvenue, gestes de direction
2. **Explications** : animations synchronisées avec texte/audio
3. **Navigation** : pointage vers zones suivantes
4. **Réactivité** : micro-expressions pour engagement utilisateur

---

## 📍 Zones de l'Académie Kabakoo

| Zone | Description | Durée explica. |
|------|-------------|-----------------|
| **Accueil** | Bienvenue, présentation générale | 30s |
| **Salles de cours** | Philosophie pédagogique, équipements | 45s |
| **Lab/Ateliers** | Tech, projets, ressources | 45s |
| **Espaces collaboratifs** | Zones de travail, communauté | 40s |
| **Ressources** | Bibliothèque, mentoring, support | 35s |
| **Vision/Valeurs** | Mission Kabakoo, impact sociétal | 40s |

---

## 🔧 Technologie & Stack

| Composant | Technologie | Justification |
|-----------|-------------|---------------|
| **Plateforme AR** | 8th Wall WebAR | Web mobile, pas d'app, accès immédiat |
| **3D/Modélisation** | Blender → glTF/GLB | Pipeline optimisé, compression WebP |
| **Moteur 3D** | Three.js / Babylon.js | Performance web, intégration 8th Wall |
| **Animation** | Mixamoanimations (ou custom) | Librairie + animations custom du robot |
| **Audio** | Web Audio API + fichiers MP3 | Synthèse voix (Google TTS) + effects |
| **Hosting** | GitHub Pages / Vercel | Déploiement simple, CDN global |

---

## 📊 Phases du Projet & Estimations

### **Phase 1 : Modélisation 3D du Robot**
**Durée estimée : 2–2.5 semaines**

#### Livrables
- ✓ Design 2D du robot (concepts, mood boards)
- ✓ Modèle 3D haute-poly (détails, émotions faciales)
- ✓ Grille de poses/gestes (accueil, pointage, explication, écoute)
- ✓ Textures et matériaux (basés sur palette Kabakoo)

#### Étapes
1. **Concept & Sketches** (3–4 jours)
   - Explorations 2D (10–15 itérations)
   - Validation lead / stakeholders

2. **Modèle 3D base** (5–6 jours)
   - Topology clean, rig prêt pour animation
   - Fichier Blender + exports glTF test

3. **Détails & Texturing** (3–4 jours)
   - Raffinement, matériaux, éclairage Blender
   - Preview d'animation test

---

### **Phase 2 : Optimisation 3D**
**Durée estimée : 1–1.5 semaines**

#### Livrables
- ✓ Modèle optimisé pour web (<2 MB GLB)
- ✓ LOD (Level of Detail) si nécessaire
- ✓ Textures compressées (WebP q90)
- ✓ Tests de performance (FPS mobile cible: 30+)

#### Étapes
1. **Décimation mesh** (2 jours)
   - Réduction poly count (20–30K target)
   - Préservation détails essentiels

2. **Compression textures** (2 jours)
   - PNG → WebP optimisé
   - `gltf-transform` pour compression GLB interne

3. **Tests mobile** (2 jours)
   - iPhone 11+, Samsung Galaxy S20+
   - Mesure FPS, mémoire, batterie
   - Optimisations ciblées (shaders, draw calls)

---

### **Phase 3 : Animations & Rigging**
**Durée estimée : 2–2.5 semaines**

#### Livrables
- ✓ Rig articulé (bones, IK, expressions faciales)
- ✓ 8–12 animations clés (accueil, écoute, pointage, validation, erreur)
- ✓ Blend shapes pour expressions (sourire, surprise, réflexion)
- ✓ Audio sync (lèvres, gestes temporisés)

#### Étapes
1. **Rigging** (3–4 jours)
   - Squelette (bones, IK pour bras/doigts)
   - Contrôles (body, arms, head, facial)
   - Weight painting

2. **Animations clés** (5–7 jours)
   - Idle (respiration, clignotement)
   - Accueil & transition
   - Gestes explicatifs (bras, mains)
   - Pointage directionnel
   - Réactions (assentiment, questionnement)

3. **Sync audio-animation** (2–3 jours)
   - Marqueurs (timecode) pour déclenchement
   - Blend shapes synchronisés (morphing)
   - Tests de synchronisation

---

### **Phase 4 : Implémentation Web AR**
**Durée estimée : 2–3 semaines**

#### Livrables
- ✓ Page Web AR fonctionnelle (8th Wall)
- ✓ Détection d'orientation du téléphone
- ✓ Scénariste/flow de visite (6 zones navigables)
- ✓ Textes + intégration voix
- ✓ UX mobile (boutons, navigation)
- ✓ Tests cross-browser (iOS/Android)

#### Étapes
1. **Setup 8th Wall** (3–4 jours)
   - Intégration du projet 8th Wall
   - Import robot GLB optimisé
   - Configuration caméra, lumières

2. **Logique de scénario** (5–6 jours)
   - Écrans de transition (zones)
   - Déclenchement animations & audio
   - Navigation (boutons Suivant/Précédent/Accueil)
   - Textes & traductions (FR/EN optionnel)

3. **UX & Interactions** (3–4 jours)
   - Boutons tactiles, gestures
   - Indicateurs de progression
   - Indicateur de qualité réseau (utile AR)
   - Fallback si AR indisponible

4. **Tests & déploiement** (3–5 jours)
   - Tests fonctionnels multi-appareils
   - Optimisation performance finale
   - Déploiement staging → production
   - Hébergement (GitHub Pages + CDN)

---

## 📈 Calendrier Estimé

| Phase | Semaines | Dates (exemple) |
|-------|----------|-----------------|
| **Phase 1** : Modélisation | 2.5 | Sem 1–2.5 |
| **Phase 2** : Optimisation | 1.5 | Sem 2.5–4 |
| **Phase 3** : Animations | 2.5 | Sem 3–5.5 |
| **Phase 4** : Implémentation | 2.5 | Sem 5–7.5 |
| **Buffer/Révisions** | 1–2 | Sem 7.5–9 |
| **Total** | **8–10 semaines** | ~2.5 mois |

### Jalons clés
- ✅ **Fin Sem 2.5** : Design robot validé, modèle de base
- ✅ **Fin Sem 4** : Robot optimisé, tests mobile OK
- ✅ **Fin Sem 5.5** : Animations complètes, sync audio
- ✅ **Fin Sem 7.5** : Version bêta jouable, tests utilisateurs
- ✅ **Fin Sem 9** : Lancement public

---

## 🎮 Exemple de Flux Utilisateur

```
1. Utilisateur ouvre le lien Web AR (QR code ou direct)
   ↓
2. Demande permissions caméra (8th Wall)
   ↓
3. Robot apparaît à l'écran (animation de spawn)
   Robot : "Bienvenue à l'Académie Kabakoo ! Je suis Kaja, votre guide."
   ↓
4. Menu : 6 zones à visiter (boutons tactiles)
   Utilisateur sélectionne "Salles de cours"
   ↓
5. Transition vers zone (fondu 3D ou translation caméra)
   Robot : "Voici nos salles de cours..."
   [Robot gestures, texte + audio]
   ↓
6. Bouton "Zone suivante" ou "Retour menu"
   ↓
7. Fin visite : résumé, partage score social (optionnel)
```

---

## 🚀 Risques & Mitigation

| Risque | Impact | Mitigation |
|--------|--------|-----------|
| **Modèle 3D trop complexe** → Performance dégradée | Haut | Tester dès Phase 2, LOD si besoin |
| **Sync audio-animation décalée** | Moyen | Marqueurs temporels, tests précoces |
| **Compatibilité 8th Wall** (certains devices) | Moyen | Cible iOS 13+, Android 8+, fallback 2D |
| **Scénario non finalisé** (textes, zones) | Moyen | Collaborer avec Académie dès Phase 1 |
| **Déploiement tardif** | Moyen | Milestone Phase 4 strict, staging précoce |

---

## ✅ Critères de Succès

- ✓ Robot modélisé, stylisé, reconnaissable
- ✓ Animations fluides (30 FPS min sur mobile 2–3 ans)
- ✓ Visite complète < 5 min (engageant, pas barbant)
- ✓ Accès Web simple (QR code, lien direct)
- ✓ Testé sur iOS & Android, caméras de qualité
- ✓ Feedback utilisateurs positifs (Net Promoter Score)

---

## 📞 Ressources Requises

| Rôle | Temps | Notes |
|------|-------|-------|
| **3D Artist / Modeleur** | 100% Phases 1–2 | Concept → Modèle |
| **Animateur 3D** | 100% Phase 3 | Rig, animations, sync |
| **Développeur Web AR** | 50% Phase 3 + 100% Phase 4 | Three.js, 8th Wall, AR logic |
| **Lead / Producteur** | 10–20% tout | Validation, coordination |
| **Académie (content)** | 20% Phase 4 | Textes, scénario, validation zones |

---

## 💡 Extensions Futures (Post-MVP)

- 🎙️ **Voix générée IA** (TTS, personnalité du robot)
- 👥 **Multi-robot** (plusieurs guides thématiques)
- 📊 **Analytics** (zones visitées, temps moyen, heatmap)
- 🌍 **Multilingue** (FR, EN, AR?)
- 🎮 **Gamification** (quiz, badges, leaderboard)
- 🏫 **Multi-sites** (autres académies/universités)

---

## 🎯 Prochaines Étapes

1. **Approbation du lead** ← *Vous êtes ici*
2. Réunion kickoff (Académie, design, dev)
3. Démarrage design & concept (Sem 1)
4. Validation design (Sem 2.5)
5. Lancement implémentation (Sem 3)

---

**Document préparé par** : Moussa Diakite  
**Date** : 4 juillet 2026  
**Technologie** : 8th Wall WebAR, Blender, Three.js, Web Audio API
