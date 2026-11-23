# 📁 Structure du Projet — Organisation Standardisée

## Arborescence

```
MES PROJETS/
├── projects/
│   ├── active/                    # Projets en développement actif
│   │   ├── Le coeur de Bananin/   # Expérience 3D/AR Dogon (multiparties)
│   │   └── mosquee-djenne/        # Expérience 3D/AR mosque de Djenné
│   │
│   └── archive/                   # Projets terminés / archivés
│       └── Grenier Dogon/         # Archive - sources anciennes
│
├── shared/                        # Ressources partagées entre projets
│   ├── assets/                    # Modèles GLB, images, audio communs
│   ├── components/                # Modules JS réutilisables
│   ├── styles/                    # CSS partagés
│   └── tools/                     # Utilitaires web
│
├── sources/                       # Fichiers sources (Blender, etc.)
│   └── blender/                   # Fichiers .blend sources (non versionné)
│
├── docs/                          # Documentation du projet
│   └── superpowers/               # Docs skills/agents
│
└── [Divers: node_modules, .claude, .playwright-mcp, screenshots]
```

## Convention de Nommage

### Assets Utilisés Uniquement
- **Images**: `sky.png`, `logo.png`, `la coline ..jpg`, `la falaise ..png`, `les roches ..png`
- **Audio**: `bike.mp3`, `eagle-cry.mp3`, `pilon (1).mp3`, `son d'entre.mp3`, `transition plane 2.mp3`, `wind-ambience.mp3`
- **Modèles**: `scene-bananin.glb`, `scene-bananin-mobile.glb`, `scene-partie2.glb`

### ❌ Fichiers Supprimés (Nettoyage)
- ❌ 69 fichiers PNG/JPEG temporaires (bananin-*.png, bubble-*.png, etc.)
- ❌ 30+ images de test non utilisées (1.png, 2-removebg-preview.png, etc.)
- ❌ 3 dossiers archives vides (Grenier Dogon - Copie, dome-musgum, tombeau-des-askia)
- ❌ Fichiers de debug (roof-texture-debug.png, wall-texture-debug.png)
- ❌ Scripts temporaires (remove-bg.js, paper-transition.js)

## Mise à Jour .gitignore

```
# Fichiers temporaires
*.png
*.jpg
*.jpeg
!asset/image/*.png
!asset/image/*.jpg

# Sources Blender (ne pas versioner)
sources/blender/**

# Logs et cache
node_modules/
.DS_Store
```

## Prochaines Étapes

1. **Redémarrer l'IDE** pour débloquer "Le coeur de Bananin" au root et le supprimer manuellement
2. **Mettre à jour les imports** des fichiers qui utilisaient les anciens chemins
3. **Vérifier les références** dans le code (assets, modules partagés)

---

*Structure créée le 22 juil. 2026 | Organisation standardisée pour scalabilité*
