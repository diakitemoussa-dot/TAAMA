# Choix de drone (classique ↔ vaisseau) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter dans le mode GAME un bouton HUD qui bascule à chaud entre le drone classique (existant) et un nouveau drone-vaisseau animé, sans changer la physique de vol.

**Architecture:** Généraliser le chargement de `drone-game.js` via un **registre de modèles** (chaque modèle = url, offset d'orientation, clip idle, sélecteur de clip, gestion hélices). Le `rig` (position + cap) reste le pilote du vol ; on n'échange que le mesh enfant + son `AnimationMixer`. Choix mémorisé en `localStorage`, défaut = drone.

**Tech Stack:** three.js 0.165 (ESM via importmap CDN), DRACOLoader, GLTFLoader, `_serve.cjs` (port 8123), vérification Playwright. Pas de framework de test unitaire → vérification par observation navigateur + inspection GLB avec `@gltf-transform/core` (déjà en devDependencies).

**Convention Blender→Three.js du projet :** `X=BX, Y=BZ, Z=-BY`.

---

## Structure des fichiers

- `assets/models/vaisseau.glb` — **créé** (copie depuis `mosquee-djenne/assets/models/vaisseau.glb`).
- `app/drone-game.js` — **modifié** : registre de modèles, chargement générique, swap, sélecteurs de clip, câblage bouton. Zones : ~330-335 (globals), ~455-489 (loadDrone), ~486/580-604 (clips), ~500 (enter), ~717-724 (update anim).
- `index.html` — **modifié** : bouton `dgModel` dans `.dg-toolbar` (~ligne 561-565).
- `tools/inspect-glb.mjs` — **créé** (jetable) : inspection des clips/nœuds/bbox du GLB.

---

## Task 1 : Copier l'asset et vérifier ses métadonnées (clips, nœud, orientation)

But : verrouiller les **noms de clips réels**, l'existence de `Ship_Root`, et l'axe du nez, pour fixer `yaw` et le mapping des clips sans deviner.

**Files:**
- Create: `assets/models/vaisseau.glb` (copie)
- Create: `tools/inspect-glb.mjs`

- [ ] **Step 1 : Copier le GLB à la racine**

```bash
cp "mosquee-djenne/assets/models/vaisseau.glb" "assets/models/vaisseau.glb"
ls -la assets/models/vaisseau.glb
```
Expected : fichier présent (~206 Ko).

- [ ] **Step 2 : Écrire le script d'inspection**

```js
// tools/inspect-glb.mjs — inspecte clips, nœuds racine et bbox d'un GLB Draco
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3d';

const path = process.argv[2];
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const doc = await io.read(path);
const root = doc.getRoot();

console.log('=== ANIMATIONS ===');
for (const a of root.listAnimations()) console.log('-', JSON.stringify(a.getName()));

console.log('=== NŒUDS (top-level scene) ===');
for (const s of root.listScenes())
  for (const n of s.listChildren()) console.log('-', JSON.stringify(n.getName()));

console.log('=== TOUS LES NŒUDS ===');
for (const n of root.listNodes()) console.log('-', JSON.stringify(n.getName()));
```

- [ ] **Step 3 : Lancer l'inspection**

```bash
node tools/inspect-glb.mjs assets/models/vaisseau.glb
```
Expected : la liste des animations contient exactement `Hover`, `Forward`, `Reverse`, `TurnLeft`, `TurnRight` ; un nœud `Ship_Root` existe.

- [ ] **Step 4 : Noter les écarts éventuels**

Si un nom de clip diffère (ex. `Turn_Left`), **noter la correspondance réelle** — elle sera utilisée telle quelle dans `pickClipVaisseau` (Task 3) et `MODELS.vaisseau.idle` (Task 3). Ne pas inventer : utiliser les noms retournés.

- [ ] **Step 5 : Commit**

```bash
git add assets/models/vaisseau.glb tools/inspect-glb.mjs
git commit -m "feat(game): ajoute l'asset vaisseau.glb + script d'inspection GLB"
```

---

## Task 2 : Refactor — registre de modèles (drone seul, comportement inchangé)

But : remplacer le chargement mono-drone par une abstraction multi-modèle, **sans changer le rendu** (drone toujours par défaut, vol identique).

**Files:**
- Modify: `app/drone-game.js` (globals ~330-335 ; loadDrone ~455-489 ; enter ~500 ; update ~717-724 ; pickClip/setClip ~580-604)

- [ ] **Step 1 : Remplacer les globals du modèle (~330-335)**

Remplacer :
```js
const DRONE_URL = 'assets/models/drone.glb';
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';
let droneModel = null, droneMixer = null;
const actions = {};       // nom de clip -> AnimationAction
let currentClip = '';
let modelLoading = false, modelLoaded = false;
```
par :
```js
const DRACO_DECODER = 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/libs/draco/';

// Registre des modèles pilotables. yaw = offset d'orientation pour aligner le nez sur le
// sens de vol (+Z monde). pick = fonction de sélection du clip selon les entrées.
// spinProps = true si l'anim doit être modulée par propSpeed (hélices qui ralentissent au sol).
const MODELS = {
  drone: {
    url: 'assets/models/drone.glb',
    yaw: Math.PI / 2,          // le drone a son nez sur +X -> +90° pour viser +Z
    idle: 'Idle_Hover',
    spinProps: true,
    pick: pickClipDrone,
  },
  vaisseau: {
    url: `assets/models/vaisseau.glb?v=${Date.now()}`, // cache-buster (ré-exports fréquents)
    yaw: 0,                    // nez = +Z (à confirmer via Task 1 ; ajuster ici si besoin)
    idle: 'Hover',
    spinProps: false,          // hélices déjà en boucle continue dans chaque clip
    pick: pickClipVaisseau,
  },
};

// État par modèle chargé : id -> { root, mixer, actions, currentClip, loaded, loading }
const modelState = {};
let activeModelId = 'drone';   // (localStorage appliqué en Task 4)
```

- [ ] **Step 2 : Remplacer `loadDrone` par `ensureModel` + `attachActive` (~455-489)**

Remplacer toute la fonction `loadDrone(){...}` par :
```js
/* ---------- Chargement générique d'un modèle ---------- */
function ensureModel(id, onReady){
  let st = modelState[id];
  if (st && st.loaded){ onReady && onReady(st); return; }
  if (st && st.loading) return;                 // chargement déjà en cours
  st = modelState[id] = { root:null, mixer:null, actions:{}, currentClip:'', loaded:false, loading:true };
  const def = MODELS[id];
  const draco = new DRACOLoader(); draco.setDecoderPath(DRACO_DECODER);
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);
  loader.load(def.url, (gltf)=>{
    const root = gltf.scene;
    // Normaliser la taille à ~DRONE_SIZE unités (échelle de la maquette)
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(center);
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    root.scale.setScalar(DRONE_SIZE / maxDim);
    root.rotation.y = def.yaw;                  // aligne le nez sur le sens du vol
    root.traverse((o) => { if (o.isMesh){ o.castShadow = true; o.receiveShadow = true; } });
    st.mixer = new THREE.AnimationMixer(root);
    gltf.animations.forEach((clip)=>{
      const a = st.mixer.clipAction(clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      st.actions[clip.name] = a;
    });
    if (st.actions[def.idle]){ st.actions[def.idle].play(); st.currentClip = def.idle; }
    st.root = root; st.loaded = true; st.loading = false;
    onReady && onReady(st);
  }, undefined, (err)=>{
    console.error('Erreur chargement modèle "'+id+'" :', err);
    st.loading = false;
    if (id !== 'drone'){          // repli automatique sur le drone
      activeModelId = 'drone';
      ensureModel('drone', attachActive);
      if (typeof window.updateModelButton === 'function') window.updateModelButton();
    }
  });
}

// Attache le modèle actif au rig et détache les autres (le rig conserve pos/vitesse/cap)
function attachActive(st){
  for (const k in modelState){
    const s = modelState[k];
    if (s && s.root && s !== st) rig.remove(s.root);
  }
  if (st && st.root && st.root.parent !== rig) rig.add(st.root);
}

function activeState(){ return modelState[activeModelId]; }
```

- [ ] **Step 3 : Mettre à jour `enter()` (~500)**

Remplacer la ligne :
```js
  loadDrone();
```
par :
```js
  ensureModel(activeModelId, attachActive);
```

- [ ] **Step 4 : Renommer `pickClip` en `pickClipDrone` (~580)**

Changer la signature :
```js
function pickClip(){
```
en :
```js
function pickClipDrone(){
```
(le corps reste identique.)

- [ ] **Step 5 : Généraliser `setClip` en `setClipOn(st, name)` (~596-604)**

Remplacer :
```js
function setClip(name){
  if (name === currentClip || !actions[name]) return;
  const next = actions[name];
  const prev = actions[currentClip];
  next.reset().play();
  if (prev) prev.crossFadeTo(next, 0.25, false);
  else next.fadeIn(0.25);
  currentClip = name;
}
```
par :
```js
function setClipOn(st, name){
  if (!st || !name || name === st.currentClip || !st.actions[name]) return;
  const next = st.actions[name];
  const prev = st.actions[st.currentClip];
  next.reset().play();
  if (prev) prev.crossFadeTo(next, 0.25, false);
  else next.fadeIn(0.25);
  st.currentClip = name;
}
```

- [ ] **Step 6 : Mettre à jour le bloc d'animation dans `update()` (~717-724)**

Remplacer :
```js
  if (droneMixer){
    const target = landed ? 0 : 1;                       // hélices à l'arrêt quand le drone est posé
    propSpeed += (target - propSpeed) * Math.min(1, 6 * dt);
    if (target === 0 && propSpeed < 0.03) propSpeed = 0;  // arrêt complet
    droneMixer.timeScale = propSpeed;
    droneMixer.update(dt);
    setClip(pickClip());
  }
```
par :
```js
  const _st = activeState();
  if (_st && _st.mixer){
    const _def = MODELS[activeModelId];
    if (_def.spinProps){
      const target = landed ? 0 : 1;                       // hélices à l'arrêt quand posé
      propSpeed += (target - propSpeed) * Math.min(1, 6 * dt);
      if (target === 0 && propSpeed < 0.03) propSpeed = 0;
      _st.mixer.timeScale = propSpeed;
    } else {
      _st.mixer.timeScale = 1;                             // vaisseau : vitesse d'anim constante
    }
    _st.mixer.update(dt);
    setClipOn(_st, _def.pick());
  }
```

- [ ] **Step 7 : Ajouter un `pickClipVaisseau` provisoire (au-dessus de `pickClipDrone`)**

Placeholder minimal pour que `MODELS.vaisseau.pick` existe (complété en Task 3) :
```js
function pickClipVaisseau(){ return 'Hover'; }
```

- [ ] **Step 8 : Vérifier que le drone fonctionne toujours (aucune régression)**

```bash
node _serve.cjs   # port 8123, en arrière-plan
```
Via Playwright : ouvrir `http://localhost:8123/`, démarrer, DÉCOLLE LE DRONE, cliquer **GAME**, attendre le chargement.
Vérifier dans la console : **aucune** nouvelle erreur JS. Observer que le drone s'affiche et vole comme avant (capture d'écran).
Expected : drone visible, hélices tournent, vol/caméra identiques.

- [ ] **Step 9 : Commit**

```bash
git add app/drone-game.js
git commit -m "refactor(game): registre de modèles générique (drone inchangé)"
```

---

## Task 3 : Ajouter le vaisseau + fonction de swap

But : rendre le vaisseau réellement chargeable/sélectionnable avec sa logique d'animation.

**Files:**
- Modify: `app/drone-game.js` (pickClipVaisseau ~au-dessus de pickClipDrone ; ajout `setModel` près de `attachActive`)

- [ ] **Step 1 : Implémenter `pickClipVaisseau` (remplacer le placeholder de Task 2 Step 7)**

Utiliser les **noms de clips réels notés en Task 1**. Priorité au virage (yaw) sur l'avance.
```js
function pickClipVaisseau(){
  const alx = Math.abs(input.lx);   // lx = yaw (virage)
  const ary = Math.abs(input.ry);   // ry = avance (ry<0 = haut = avancer)
  if (alx > 0.15) return input.lx < 0 ? 'TurnLeft' : 'TurnRight';   // sens à confirmer en Task 5
  if (ary > 0.15) return input.ry < 0 ? 'Forward'  : 'Reverse';
  return 'Hover';
}
```

- [ ] **Step 2 : Ajouter la fonction de bascule `setModel` (après `attachActive`)**

```js
// Bascule le modèle actif (charge à la demande), conserve pos/vitesse/cap du rig
function setModel(id){
  if (!MODELS[id] || id === activeModelId) return;
  activeModelId = id;
  try { localStorage.setItem('djenne.droneModel', id); } catch(_){}
  ensureModel(id, attachActive);
  if (typeof window.updateModelButton === 'function') window.updateModelButton();
}
```

- [ ] **Step 3 : Vérifier le swap en console (sans bouton encore)**

Serveur lancé, en mode GAME, via Playwright `browser_evaluate` :
```js
() => { window.DroneGame && window.DroneGame.setModel && window.DroneGame.setModel('vaisseau'); return 'ok'; }
```
(Nécessite d'exposer `setModel` — voir Step 4.)

- [ ] **Step 4 : Exposer `setModel` sur l'API publique (~1174)**

Remplacer :
```js
window.DroneGame = { enter, exit };
```
par :
```js
window.DroneGame = { enter, exit, setModel, getModel: () => activeModelId };
```

- [ ] **Step 5 : Vérifier visuellement le vaisseau**

Relancer le swap (Step 3) puis capture d'écran : le **vaisseau** doit remplacer le drone, en vol stationnaire (`Hover`). Piloter (flèches) et vérifier que le vaisseau bouge (le rig porte le vol) et que les clips changent (avance/recul/virage) sans coupure brute.
Expected : vaisseau visible et animé ; console sans erreur.

- [ ] **Step 6 : Commit**

```bash
git add app/drone-game.js
git commit -m "feat(game): vaisseau chargeable + bascule setModel"
```

---

## Task 4 : Bouton HUD + persistance

But : exposer le choix à l'utilisateur et le mémoriser.

**Files:**
- Modify: `index.html` (`.dg-toolbar` ~561-565)
- Modify: `app/drone-game.js` (init bouton dans `enter()` ou init global ; lecture localStorage)

- [ ] **Step 1 : Ajouter le bouton dans la toolbar (`index.html` ~564)**

Après la ligne du bouton `dgList` :
```html
          <button type="button" class="dg-tool" id="dgList" aria-label="Points d'intérêt">☰</button>
```
ajouter :
```html
          <button type="button" class="dg-tool" id="dgModel" aria-label="Changer de drone">🚁</button>
```

- [ ] **Step 2 : Lire le choix mémorisé au démarrage (`drone-game.js`, près de `let activeModelId = 'drone';`)**

Remplacer :
```js
let activeModelId = 'drone';   // (localStorage appliqué en Task 4)
```
par :
```js
let activeModelId = (() => {
  try { const v = localStorage.getItem('djenne.droneModel'); if (v === 'drone' || v === 'vaisseau') return v; } catch(_){}
  return 'drone';
})();
```

- [ ] **Step 3 : Ajouter `updateModelButton` + câblage du clic (dans `enter()`, après les autres listeners du HUD)**

```js
  // Bouton bascule de modèle (drone <-> vaisseau)
  const _modelBtn = document.getElementById('dgModel');
  window.updateModelButton = function updateModelButton(){
    if (!_modelBtn) return;
    _modelBtn.textContent = activeModelId === 'vaisseau' ? '🛸' : '🚁';
    _modelBtn.setAttribute('aria-label',
      activeModelId === 'vaisseau' ? 'Passer au drone' : 'Passer au vaisseau');
  };
  if (_modelBtn && !_modelBtn._wired){
    _modelBtn._wired = true;
    _modelBtn.addEventListener('click', () => {
      setModel(activeModelId === 'vaisseau' ? 'drone' : 'vaisseau');
    });
  }
  updateModelButton();
```

- [ ] **Step 4 : Vérifier le bouton (Playwright)**

En mode GAME : le bouton `🚁` est visible dans la toolbar. Cliquer → devient `🛸`, le vaisseau apparaît. Re-cliquer → revient `🚁` + drone. Recharger la page, ré-entrer en GAME → le **dernier modèle choisi** est actif (persistance).
Expected : bascule visuelle correcte + persistance confirmée.

- [ ] **Step 5 : Commit**

```bash
git add index.html app/drone-game.js
git commit -m "feat(game): bouton HUD de choix de drone + persistance localStorage"
```

---

## Task 5 : Vérification E2E + ajustements orientation/mapping

But : valider l'ensemble et corriger les 2 inconnues (offset `yaw` du vaisseau, sens `TurnLeft`/`TurnRight`).

**Files:**
- Modify: `app/drone-game.js` (`MODELS.vaisseau.yaw` et/ou `pickClipVaisseau` si nécessaire)

- [ ] **Step 1 : Vérifier l'orientation du nez**

En vol vaisseau, pousser « avancer ». Le **nez** doit pointer dans le sens du déplacement.
Si le vaisseau avance de profil/à l'envers : ajuster `MODELS.vaisseau.yaw` (essayer `0`, `Math.PI/2`, `Math.PI`, `-Math.PI/2`) jusqu'au bon alignement.
Expected : nez aligné sur la trajectoire.

- [ ] **Step 2 : Vérifier le sens des virages**

Tourner à gauche : l'inclinaison visible du clip doit correspondre. Si `TurnLeft`/`TurnRight` sont inversés, permuter les deux retours dans `pickClipVaisseau`.
Expected : virage visuel cohérent avec le sens réel.

- [ ] **Step 3 : Vérifier le repli d'erreur**

Simuler l'absence de l'asset (renommer temporairement) → en cliquant vers vaisseau, la console log l'erreur et le **drone reste actif** (bouton repasse `🚁`). Restaurer l'asset ensuite.
Expected : pas de blocage du jeu.

- [ ] **Step 4 : Non-régression drone**

`localStorage.removeItem('djenne.droneModel')`, recharger : le **drone** est le modèle par défaut, vol identique à l'origine.
Expected : comportement d'origine intact.

- [ ] **Step 5 : Nettoyage + commit final**

```bash
rm tools/inspect-glb.mjs
git add -A
git commit -m "test(game): vérifie orientation/virages vaisseau + ajustements finaux"
```

---

## Notes de vérification (rappel environnement)

- Serveur réel : `node _serve.cjs` → `http://localhost:8123/` (PAS vite : vite ignore l'importmap et casse three-mesh-bvh).
- Parcours pour atteindre le jeu : clic écran d'accueil → **DÉCOLLE LE DRONE** → bouton **GAME**.
- Toujours vérifier la **console** (0 erreur hors favicon 404) après chaque changement.
