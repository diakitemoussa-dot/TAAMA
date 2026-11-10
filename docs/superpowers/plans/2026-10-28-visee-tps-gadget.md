# Visée précise aux yeux (mode Sanctuaire) — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** En mode Sanctuaire, maintenir L2/LT ou le clic droit fait passer la caméra aux yeux du personnage (bras et gadget visibles, tête masquée, FOV ~40°) et chaque tir part de la bouche du gadget vers le point exact désigné par le réticule.

**Architecture :** Un petit module sans dépendance `app/aim-system.js` (constantes + fonctions pures testables sous Node) est importé par `app/sanctuary-mode.js`. Un unique scalaire lissé `_aimBlend` (0 = 3e personne, 1 = visée) pilote la position de la caméra, le FOV et le masquage de la tête. Hors visée, rien ne change.

**Tech Stack :** JavaScript ES modules (sans bundler), Three.js 0.165, three-mesh-bvh, Node 24 pour le test unitaire, Puppeteer (`puppeteer-core`) pour la vérification navigateur.

**Spec :** `docs/superpowers/specs/2026-10-28-visee-tps-gadget-design.md`

**Précisions par rapport au spec :**
- En visée, la touche `V` / bouton « CÔTÉ » déclenche un tir normal (le tir latéral n'a pas de sens quand le buste suit la caméra). Hors visée, ils restent inchangés.
- Le réticule `#snAimReticle` passe de 180 px à 96 px de diamètre (180 px est trop large pour viser précisément).

**Commits :** ce dépôt contient déjà beaucoup de travail non commité dans `app/sanctuary-mode.js` (hors de ce plan). Aucune étape ne commite : demande à l'utilisateur quand et comment regrouper les commits.

**Vérification de syntaxe (réutilisée dans les tâches) :** `sanctuary-mode.js` est un module ES sans `"type": "module"` dans `package.json`, donc on le copie en `.mjs` avant `node --check` :

```bash
cp app/sanctuary-mode.js "$TEMP/sm-check.mjs" && node --check "$TEMP/sm-check.mjs" && echo SYNTAXE_OK
```

---

## Structure des fichiers

| Fichier | Rôle |
|---|---|
| **Créer** `app/aim-system.js` | Constantes de réglage + fonctions pures (lissage, FOV, test segment/sphère, multiplicateur de sensibilité). Aucune dépendance. |
| **Créer** `tests/aim-system.test.mjs` | Tests unitaires Node du module ci-dessus. |
| **Créer** `tools/aim-check.mjs` | Vérification dans Chrome : entre en Sanctuaire, vise, tire, relâche, capture d'écran. |
| **Modifier** `app/sanctuary-mode.js` | État de visée, entrées, caméra aux yeux, corps, point visé, tir, debug. |
| **Modifier** `styles/sanctuary.css` | Réticule rouge quand il est sur le drone. |
| **Modifier** `index.html` | Cache-busting : `sanctuary-mode.js?v=38`, `sanctuary.css?v=4`. |
| **Modifier** `package.json` | Scripts `test:aim-logic` et `test:aim`. |

---

### Task 1: Module pur `aim-system.js` (TDD)

**Files:**
- Create: `app/aim-system.js`
- Create: `tests/aim-system.test.mjs`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Écrire le test qui échoue**

Créer `tests/aim-system.test.mjs` :

```js
/**
 * Tests unitaires de la logique de visée (aucune dépendance navigateur).
 * Usage : node tests/aim-system.test.mjs
 */
import assert from 'node:assert/strict';
import * as A from '../app/aim-system.js';

let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };
const v = (x, y, z) => ({ x, y, z });

test('approach : dt = 0 ne bouge pas', () => {
  assert.equal(A.approach(0.3, 1, 9, 0), 0.3);
});

test('approach : converge vers la cible sans la dépasser', () => {
  let x = 0;
  let prev = 0;
  for (let i = 0; i < 60; i++) {
    x = A.approach(x, 1, A.AIM_BLEND_SPEED, 1 / 60);
    assert.ok(x >= prev && x <= 1);
    prev = x;
  }
  assert.ok(x > 0.99);
});

test('approach : revient vers 0', () => {
  let x = 1;
  for (let i = 0; i < 60; i++) x = A.approach(x, 0, A.AIM_BLEND_SPEED, 1 / 60);
  assert.ok(x < 0.01);
});

test('aimFov : blend 0 rend exactement le FOV d\'origine (pas 60 codé en dur)', () => {
  assert.equal(A.aimFov(55, 0), 55);
  assert.equal(A.aimFov(72, 0), 72);
});

test('aimFov : blend 1 rend AIM_FOV, blend 0.5 le milieu', () => {
  assert.equal(A.aimFov(60, 1), A.AIM_FOV);
  assert.equal(A.aimFov(60, 0.5), (60 + A.AIM_FOV) / 2);
});

test('headScale : visible sous le seuil, masquée à partir du seuil', () => {
  assert.equal(A.headScale(0), 1);
  assert.equal(A.headScale(A.AIM_HIDE_HEAD_AT - 0.01), 1);
  assert.equal(A.headScale(A.AIM_HIDE_HEAD_AT), A.HEAD_HIDDEN_SCALE);
  assert.equal(A.headScale(1), A.HEAD_HIDDEN_SCALE);
  assert.ok(A.HEAD_HIDDEN_SCALE > 0, 'échelle non nulle (matrices inversibles)');
});

test('lookMultiplier : 1 hors visée, AIM_LOOK_MULT en visée', () => {
  assert.equal(A.lookMultiplier(false), 1);
  assert.equal(A.lookMultiplier(true), A.AIM_LOOK_MULT);
  assert.ok(A.AIM_LOOK_MULT > 0 && A.AIM_LOOK_MULT < 1);
});

test('segmentHitsSphere : segment qui traverse le centre', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 0, 0), 0.6), true);
});

test('segmentHitsSphere : segment qui passe à côté', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 2, 0), 0.6), false);
});

test('segmentHitsSphere : effleure dans le rayon de tolérance', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(5, 0.5, 0), 0.6), true);
});

test('segmentHitsSphere : sphère après la fin du segment (mur avant la cible)', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(4, 0, 0), v(9, 0, 0), 0.6), false);
});

test('segmentHitsSphere : sphère derrière le départ', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 0, 0), v(-5, 0, 0), 0.6), false);
});

test('segmentHitsSphere : segment dégénéré (départ = arrivée)', () => {
  assert.equal(A.segmentHitsSphere(v(1, 1, 1), v(1, 1, 1), v(1, 1.2, 1), 0.6), true);
  assert.equal(A.segmentHitsSphere(v(1, 1, 1), v(1, 1, 1), v(5, 5, 5), 0.6), false);
});

test('segmentHitsSphere : segment oblique en 3D', () => {
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 10, 10), v(5, 5.3, 4.8), 0.6), true);
  assert.equal(A.segmentHitsSphere(v(0, 0, 0), v(10, 10, 10), v(5, 9, 1), 0.6), false);
});

console.log(`\n${passed} tests OK`);
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `node tests/aim-system.test.mjs`
Expected: échec avec `ERR_MODULE_NOT_FOUND` (le fichier `app/aim-system.js` n'existe pas).

- [ ] **Step 3: Écrire l'implémentation minimale**

Créer `app/aim-system.js` :

```js
/* ==========================================================
   VISÉE PRÉCISE — logique pure (mode Sanctuaire)
   Aucune dépendance (ni Three.js ni DOM) : testable sous Node.
   Réglages à ajuster après l'essai visuel : AIM_FOV, AIM_EYE_*,
   AIM_CAM_BACK, AIM_LOOK_MULT, AIM_HIT_RADIUS.
   ========================================================== */

export const AIM_FOV           = 40;    // FOV en visée (plus petit = plus zoomé)
export const AIM_BLEND_SPEED   = 9;     // vitesse du fondu 3e personne <-> visée (exponentiel)
export const AIM_LOOK_MULT     = 0.6;   // sensibilité souris/stick en visée (1 = normale)
export const AIM_RANGE         = 60;    // m — portée du rayon de visée
export const AIM_HIT_RADIUS    = 0.6;   // m — tolérance de touche sur le drone ennemi
export const AIM_EYE_UP        = 0.10;  // m — des os de la tête aux yeux (vers le haut)
export const AIM_EYE_FORWARD   = 0.04;  // m — des os de la tête aux yeux (vers l'avant)
export const AIM_CAM_BACK      = 0.22;  // m — recul de la caméra derrière les yeux (bras visibles)
export const AIM_HIDE_HEAD_AT  = 0.5;   // fondu à partir duquel la tête est masquée
export const HEAD_BONE_NAME    = 'mixamorig:Head';
export const HEAD_HIDDEN_SCALE = 0.001; // jamais 0 : une matrice dégénérée casse le skinning

/** Rapproche `current` de `target` (lissage exponentiel indépendant du framerate). */
export function approach(current, target, speed, dt) {
  return current + (target - current) * (1 - Math.exp(-speed * dt));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** FOV pour un fondu donné : `baseFov` à 0, AIM_FOV à 1. */
export function aimFov(baseFov, blend) {
  return lerp(baseFov, AIM_FOV, blend);
}

/** Échelle de l'os de la tête : masquée dès que la caméra est assez proche des yeux. */
export function headScale(blend) {
  return blend >= AIM_HIDE_HEAD_AT ? HEAD_HIDDEN_SCALE : 1;
}

/** Multiplicateur de sensibilité de la souris, du toucher et du stick droit. */
export function lookMultiplier(aiming) {
  return aiming ? AIM_LOOK_MULT : 1;
}

/**
 * Le segment [a, b] passe-t-il à moins de `r` du point `c` ?
 * Points : objets { x, y, z }.
 */
export function segmentHitsSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + dx * t - c.x;
  const py = a.y + dy * t - c.y;
  const pz = a.z + dz * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `node tests/aim-system.test.mjs`
Expected: 14 lignes `ok - …` puis `14 tests OK`. Si Node affiche un avertissement `MODULE_TYPELESS_PACKAGE_JSON` ou de détection de module, c'est sans gravité : le test doit quand même passer.

- [ ] **Step 5: Ajouter les scripts npm**

Dans `package.json`, remplacer :

```json
    "test:app": "node tools/app-check.mjs"
```

par :

```json
    "test:app": "node tools/app-check.mjs",
    "test:aim-logic": "node tests/aim-system.test.mjs",
    "test:aim": "node tools/aim-check.mjs"
```

Run: `npm run test:aim-logic`
Expected: `14 tests OK`.

---

### Task 2: État de visée, entrées et caméra aux yeux

Cette tâche remplace l'ancien `_toggleAim` (qui modifiait la distance et le FOV d'un coup) par un fondu `_aimBlend`. Elle contient plusieurs modifications de `app/sanctuary-mode.js` qui doivent toutes être faites avant de tester (le code ne compile qu'à la fin de la tâche).

**Files:**
- Modify: `app/sanctuary-mode.js` (import, bloc d'état ~l.355, pointermove ~l.797, contextmenu ~l.810, listeners fenêtre ~l.3294, `_computeDesiredCamera` ~l.3136, `_updateThirdPersonCamera` ~l.3192, tickFPS ~l.3563 et ~l.3573, `_ensureAimReticle`/`_toggleAim` ~l.3513-3550, `exit()` ~l.3898)

- [ ] **Step 1: Importer le module**

Remplacer :

```js
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
```

par :

```js
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import * as Aim from './aim-system.js?v=1';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
```

- [ ] **Step 2: Remplacer le bloc d'état de la visée**

Remplacer :

```js
/* ---------- Visée / zoom (L2/LT manette ou clic droit souris) ---------- */
let _aiming = false;
const AIM_FOV      = 25;      // FOV en visée (plus petit = plus zoomé)
const AIM_DIST     = 2.2;     // distance caméra en visée (au lieu de PLAYER_CAM_DIST = 4.8)
let _savedCamDist   = null;   // distance d'origine pour restauration
let _aimMouseRight  = false;  // état clic droit souris
```

par :

```js
/* ---------- Visée précise (L2/LT manette ou clic droit souris) ---------- */
let _aiming        = false;
let _aimMouseRight = false;   // état clic droit souris
let _aimBlend      = 0;       // 0 = caméra 3e personne, 1 = caméra aux yeux
let _baseFov       = null;    // FOV d'origine de la caméra (capturé hors visée)
let _headBone      = null;    // os mixamorig:Head, masqué en visée
let _headBoneMissing = false;
let _aimLocked     = false;   // réticule posé sur le drone ennemi
let _aimAnchorInit = false;
const _aimPoint        = new THREE.Vector3();   // point désigné par le réticule
const _aimEye          = new THREE.Vector3();   // position cible de la caméra de visée
const _aimAnchor       = new THREE.Vector3();   // position de la tête, lissée
const _aimAnchorTarget = new THREE.Vector3();
const _aimLook         = new THREE.Vector3();
const _aimSegEnd       = new THREE.Vector3();
const _aimDronePos     = new THREE.Vector3();
const _camLookAt       = new THREE.Vector3();
const _aimRay          = new THREE.Raycaster();
const _aimNdc          = new THREE.Vector2(0, 0);
```

- [ ] **Step 3: Sensibilité réduite en visée (souris / toucher)**

Remplacer :

```js
    cameraYaw   -= dx * LOOK_SENSITIVITY;
    playerPitch -= dy * LOOK_SENSITIVITY;
```

par :

```js
    const lookMul = Aim.lookMultiplier(_aiming);
    cameraYaw   -= dx * LOOK_SENSITIVITY * lookMul;
    playerPitch -= dy * LOOK_SENSITIVITY * lookMul;
```

- [ ] **Step 4: Le clic droit ne tire plus sur le côté**

Remplacer :

```js
  // Clic droit = tir latéral, sans menu contextuel.
  canvas.addEventListener('contextmenu', (e) => {
    if (state !== S_FPS) return;
    e.preventDefault();
    _startGadgetShot(true);
  });
```

par :

```js
  // Clic droit = viser (géré au niveau de la fenêtre) : ici on supprime
  // seulement le menu contextuel.
  canvas.addEventListener('contextmenu', (e) => {
    if (state !== S_FPS) return;
    e.preventDefault();
  });
```

- [ ] **Step 5: Les listeners souris ne touchent plus qu'au drapeau**

L'application de la visée est faite par `tickFPS` (source unique : `_aiming`). Remplacer :

```js
  window.addEventListener('blur', () => {
    keys.w = keys.a = keys.s = keys.d = keys.shift = false;
    _aimMouseRight = false;
    _toggleAim(false);
  });
  window.addEventListener('mousedown', (e) => {
    if (state !== S_FPS) return;
    if (e.button === 2) { _aimMouseRight = true; _toggleAim(true); }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) { _aimMouseRight = false; _toggleAim(false); }
  });
```

par :

```js
  window.addEventListener('blur', () => {
    keys.w = keys.a = keys.s = keys.d = keys.shift = false;
    _aimMouseRight = false;
  });
  window.addEventListener('mousedown', (e) => {
    if (state !== S_FPS) return;
    if (e.button === 2) _aimMouseRight = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) _aimMouseRight = false;
  });
```

- [ ] **Step 6: tickFPS applique la visée et capture le FOV d'origine**

Remplacer :

```js
  const wantAim = wantAimGP || _aimMouseRight;
  if (wantAim !== _aiming){
    _aiming = wantAim;
    _toggleAim(_aiming);
  }
```

par :

```js
  const wantAim = wantAimGP || _aimMouseRight;
  if (wantAim !== _aiming) _setAiming(wantAim);
  // FOV d'origine de la caméra, mémorisé hors visée pour le restituer à l'identique.
  if (_baseFov === null && !_aiming) _baseFov = M.camera.fov;
```

- [ ] **Step 7: Sensibilité réduite en visée (stick droit)**

Remplacer :

```js
    cameraYaw   -= gp.rx * GP_LOOK_SPEED * dt;
    playerPitch -= gp.ry * GP_LOOK_SPEED * dt;
```

par :

```js
    const lookMul = Aim.lookMultiplier(_aiming);
    cameraYaw   -= gp.rx * GP_LOOK_SPEED * dt * lookMul;
    playerPitch -= gp.ry * GP_LOOK_SPEED * dt * lookMul;
```

- [ ] **Step 8: Remplacer `_toggleAim` par `_setAiming` / `_resetAim`, et réduire le réticule**

Dans `_ensureAimReticle`, remplacer :

```js
    'width:180px','height:180px','pointer-events:none','z-index:60',
```

par :

```js
    'width:96px','height:96px','pointer-events:none','z-index:60',
```

Puis remplacer toute la fonction `_toggleAim` :

```js
function _toggleAim(on){
  _ensureAimReticle();
  const ret = document.getElementById('snAimReticle');
  if (on){
    _savedCamDist = _camDist;
    _camDist = AIM_DIST;
    M.camera.fov = AIM_FOV;
    M.camera.updateProjectionMatrix();
    ret.style.display = 'block';
  } else {
    if (_savedCamDist !== null){
      _camDist = _savedCamDist;
      _savedCamDist = null;
    }
    M.camera.fov = 60; // FOV par défaut Three.js
    M.camera.updateProjectionMatrix();
    ret.style.display = 'none';
  }
}
```

par :

```js
function _setAiming(on){
  _ensureAimReticle();
  _aiming = on;
  const ret = document.getElementById('snAimReticle');
  ret.style.display = on ? 'block' : 'none';
  if (!on) _setAimLock(false);
}

function _setAimLock(on){
  _aimLocked = on;
  document.getElementById('snAimReticle')?.classList.toggle('is-lock', on);
}

/** Retour immédiat à la caméra normale (sortie du mode, mort, etc.). */
function _resetAim(){
  _setAiming(false);
  _aimBlend = 0;
  _aimAnchorInit = false;
  if (_baseFov !== null && M?.camera){
    M.camera.fov = _baseFov;
    M.camera.updateProjectionMatrix();
  }
  _baseFov = null;
  _headBone?.scale.setScalar(1);
}
```

- [ ] **Step 9: `exit()` réinitialise la visée**

Remplacer :

```js
  active = false; state = S_IDLE;
  _aimMouseRight = false;
  _aiming = false;
  _toggleAim(false);
```

par :

```js
  active = false; state = S_IDLE;
  _aimMouseRight = false;
  _resetAim();
```

- [ ] **Step 10: Position de la caméra aux yeux (`_computeDesiredCamera`)**

Remplacer :

```js
function _computeDesiredCamera(out) {
  _camTarget.copy(playerPos);
  _camTarget.y -= 0.1;

  const cp = Math.cos(playerPitch);
  _camDir.set(Math.sin(cameraYaw) * cp, Math.sin(playerPitch), Math.cos(cameraYaw) * cp);
  out.copy(_camTarget).addScaledVector(_camDir, -_camDistView);
```

par :

```js
/**
 * Position cible de la caméra de visée : tête du personnage (os), lissée pour que
 * les animations du buste ne secouent pas la vue, puis décalée vers les yeux
 * et légèrement en retrait pour laisser entrer les bras et le gadget dans le champ.
 */
function _aimEyePosition(out, dt) {
  if (_headBone) _headBone.getWorldPosition(_aimAnchorTarget);
  else _aimAnchorTarget.copy(playerPos);   // repli : hauteur des yeux

  if (!_aimAnchorInit || dt <= 0) {
    _aimAnchor.copy(_aimAnchorTarget);
    _aimAnchorInit = true;
  } else {
    _aimAnchor.lerp(_aimAnchorTarget, 1 - Math.exp(-PLAYER_CAM_SMOOTH * dt));
  }

  const along = Aim.AIM_EYE_FORWARD - Aim.AIM_CAM_BACK;
  out.copy(_aimAnchor);
  out.y += Aim.AIM_EYE_UP;
  out.x += Math.sin(cameraYaw) * along;
  out.z += Math.cos(cameraYaw) * along;
  return out;
}

function _computeDesiredCamera(out, dt = 0) {
  _camTarget.copy(playerPos);
  _camTarget.y -= 0.1;

  const cp = Math.cos(playerPitch);
  _camDir.set(Math.sin(cameraYaw) * cp, Math.sin(playerPitch), Math.cos(cameraYaw) * cp);
  out.copy(_camTarget).addScaledVector(_camDir, -_camDistView);

  // Visée : la caméra glisse jusqu'aux yeux du personnage.
  if (_aimBlend > 0) {
    _aimEyePosition(_aimEye, dt);
    out.lerp(_aimEye, _aimBlend);
  }
```

- [ ] **Step 11: Fondu, FOV et regard (`_updateThirdPersonCamera`)**

Remplacer :

```js
function _updateThirdPersonCamera(dt, snap = false) {
  // Zoom fluide pendant le tir : la caméra se rapproche du personnage,
  // puis revient doucement à la distance choisie par le joueur.
  const targetDist = _aiming
    ? AIM_DIST
    : (_gadgetShooting
        ? Math.min(_camDist, PLAYER_CAM_SHOOT_DIST)
        : _camDist);
  const zoomK = 1 - Math.exp(-PLAYER_CAM_ZOOM_SPEED * dt);
  _camDistView += (targetDist - _camDistView) * zoomK;

  _computeDesiredCamera(_camDesired);
  if (snap || _camSnap) {
    M.camera.position.copy(_camDesired);
    _camSnap = false;
  } else {
    const k = 1 - Math.exp(-PLAYER_CAM_SMOOTH * dt);
    M.camera.position.lerp(_camDesired, k);
  }
  M.camera.lookAt(_camTarget);
  M.camera.updateMatrixWorld();
}
```

par :

```js
function _updateThirdPersonCamera(dt, snap = false) {
  // Zoom fluide pendant le tir hors visée : la caméra se rapproche du
  // personnage, puis revient doucement à la distance choisie par le joueur.
  const targetDist = _gadgetShooting
    ? Math.min(_camDist, PLAYER_CAM_SHOOT_DIST)
    : _camDist;
  const zoomK = 1 - Math.exp(-PLAYER_CAM_ZOOM_SPEED * dt);
  _camDistView += (targetDist - _camDistView) * zoomK;

  // Fondu 3e personne <-> caméra aux yeux : position, FOV et tête suivent _aimBlend.
  const blendTarget = _aiming ? 1 : 0;
  _aimBlend = snap ? blendTarget : Aim.approach(_aimBlend, blendTarget, Aim.AIM_BLEND_SPEED, dt);
  if (Math.abs(_aimBlend - blendTarget) < 0.002) _aimBlend = blendTarget;
  if (_aimBlend === 0) _aimAnchorInit = false;
  if (_baseFov !== null) {
    const fov = Aim.aimFov(_baseFov, _aimBlend);
    if (Math.abs(M.camera.fov - fov) > 0.01) {
      M.camera.fov = fov;
      M.camera.updateProjectionMatrix();
    }
  }

  _computeDesiredCamera(_camDesired, dt);
  if (snap || _camSnap) {
    M.camera.position.copy(_camDesired);
    _camSnap = false;
  } else {
    const k = 1 - Math.exp(-PLAYER_CAM_SMOOTH * dt);
    M.camera.position.lerp(_camDesired, k);
  }

  // Regard : vers le joueur en 3e personne, droit devant (axe du réticule) en visée.
  _aimLook.copy(M.camera.position).addScaledVector(_camDir, 8);
  _camLookAt.copy(_camTarget).lerp(_aimLook, _aimBlend);
  M.camera.lookAt(_camLookAt);
  M.camera.updateMatrixWorld();
}
```

- [ ] **Step 12: Vérifier la syntaxe et l'absence de références orphelines**

Run :

```bash
cp app/sanctuary-mode.js "$TEMP/sm-check.mjs" && node --check "$TEMP/sm-check.mjs" && echo SYNTAXE_OK
grep -n "_toggleAim\|AIM_DIST\|_savedCamDist\|AIM_FOV" app/sanctuary-mode.js
```

Expected: `SYNTAXE_OK`, et le `grep` ne renvoie **aucune ligne** (`AIM_FOV` n'existe plus que dans `app/aim-system.js` et le préfixe `Aim.`). Si une ligne apparaît, la remplacer avant de continuer.

---

### Task 3: Corps du personnage en visée (orientation et tête masquée)

**Files:**
- Modify: `app/sanctuary-mode.js` (tickFPS ~l.3618, ~l.3624 et ~l.3673 ; nouvelle fonction `_applyAimBody`)

- [ ] **Step 1: Ne plus pivoter vers la direction de marche en visée**

Remplacer :

```js
    if (!_gadgetShooting) {
      const targetYaw = Math.atan2(_move.x, _move.z);
```

par :

```js
    if (!_gadgetShooting && !_aiming) {
      const targetYaw = Math.atan2(_move.x, _move.z);
```

- [ ] **Step 2: Le buste suit la caméra en visée (strafe)**

Remplacer :

```js
  } else {
    _move.set(0, 0, 0);
  }

  if (isMoving && !_playerJumping) {
```

par :

```js
  } else {
    _move.set(0, 0, 0);
  }

  // En visée, le corps reste orienté vers la caméra : le déplacement devient un strafe.
  if (_aiming) {
    let dYaw = cameraYaw - playerYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    playerYaw += dYaw * Math.min(1, PLAYER_TURN_RATE * dt);
  }

  if (isMoving && !_playerJumping) {
```

- [ ] **Step 3: Appliquer la tête masquée après la mise à jour du mixer**

Remplacer :

```js
  _syncPlayerRoot();
  _updatePlayerAnimation(dt, isMoving, running);
  _updateThirdPersonCamera(dt);
  _applyCameraShake(dt);
```

par :

```js
  _syncPlayerRoot();
  _updatePlayerAnimation(dt, isMoving, running);
  _applyAimBody();
  _updateThirdPersonCamera(dt);
  _applyCameraShake(dt);
```

- [ ] **Step 4: Ajouter `_applyAimBody`**

Juste avant la fonction `_aimEyePosition` (ajoutée à la tâche 2), insérer :

```js
/**
 * Masque la tête (et les cheveux, skinnés sur le même os) quand la caméra est aux yeux.
 * CW_Body est un maillage unique : on réduit l'échelle de l'os plutôt que de cacher un mesh.
 * Appelé après mixer.update(), sinon l'animation réécrit l'échelle.
 */
function _applyAimBody() {
  if (!_headBone && !_headBoneMissing && _playerModel) {
    _headBone = _playerModel.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(Aim.HEAD_BONE_NAME)) || null;
    if (!_headBone) {
      _headBoneMissing = true;
      console.warn('[Sanctuaire] Os de la tête introuvable : visée à hauteur de playerPos, tête non masquée.');
    }
  }
  _headBone?.scale.setScalar(Aim.headScale(_aimBlend));
}

```

- [ ] **Step 5: Vérifier la syntaxe**

Run : `cp app/sanctuary-mode.js "$TEMP/sm-check.mjs" && node --check "$TEMP/sm-check.mjs" && echo SYNTAXE_OK`
Expected: `SYNTAXE_OK`.

---

### Task 4: Point visé et tir vers le réticule

**Files:**
- Modify: `app/sanctuary-mode.js` (`_startGadgetShot` ~l.1420, `_fireGadgetShotOnce` ~l.1548, tickFPS ~l.3675, nouvelles fonctions `_updateAimPoint`, `_fireAimedShot`)

- [ ] **Step 1: Pas de verrouillage automatique en visée, et pas de tir latéral**

Dans `_startGadgetShot`, remplacer :

```js
  const target = _getGadgetTarget();
  _gadgetSideShot = !!side;
  _gadgetTarget = target;

  if (target) {
```

par :

```js
  // En visée, le buste suit la caméra : un tir latéral n'a pas de sens, et la
  // visée est 100 % manuelle (aucun verrouillage sur le drone).
  if (_aiming) side = false;
  const target = _aiming ? null : _getGadgetTarget();
  _gadgetSideShot = !!side;
  _gadgetTarget = target;

  if (_aiming) {
    playerYaw = cameraYaw;   // le buste pointe là où regarde la caméra
  } else if (target) {
```

Puis, à la fin de la même fonction, remplacer :

```js
  _syncPlayerRoot();
  _updateThirdPersonCamera(0, true);
  window.GamepadKit?.rumble?.(35, 0.18);
}
```

par :

```js
  _syncPlayerRoot();
  // En visée, ne pas « claquer » la caméra si le fondu est en cours.
  _updateThirdPersonCamera(0, !_aiming);
  window.GamepadKit?.rumble?.(35, 0.18);
}
```

- [ ] **Step 2: Calculer le point visé à chaque image**

Dans `tickFPS`, remplacer :

```js
  _applyAimBody();
  _updateThirdPersonCamera(dt);
  _applyCameraShake(dt);
```

par :

```js
  _applyAimBody();
  _updateThirdPersonCamera(dt);
  _updateAimPoint();
  _applyCameraShake(dt);
```

Puis, juste avant la fonction `_setAiming` (tâche 2), insérer :

```js
/**
 * Point désigné par le réticule : rayon du centre de l'écran contre le décor
 * (BVH), portée AIM_RANGE. Indique aussi si le réticule est sur le drone ennemi.
 */
function _updateAimPoint() {
  if (!_aiming || _aimBlend < 0.5) {
    if (_aimLocked) _setAimLock(false);
    return;
  }
  _aimRay.setFromCamera(_aimNdc, M.camera);
  _aimRay.near = 0.05;
  _aimRay.far = Aim.AIM_RANGE;
  const hits = (colliders && colliders.length) ? _aimRay.intersectObjects(colliders, false) : [];
  if (hits.length) _aimPoint.copy(hits[0].point);
  else _aimPoint.copy(_aimRay.ray.origin).addScaledVector(_aimRay.ray.direction, Aim.AIM_RANGE);

  let lock = false;
  const d = _sanctuaryDroneN;
  if (d?.group?.visible && !_droneNDead) {
    d.group.getWorldPosition(_aimDronePos);
    _aimDronePos.y += 0.15;
    lock = Aim.segmentHitsSphere(_aimRay.ray.origin, _aimPoint, _aimDronePos, Aim.AIM_HIT_RADIUS);
  }
  if (lock !== _aimLocked) _setAimLock(lock);
}

/**
 * Tir en visée : de la bouche du gadget vers le point visé, arrêté par le premier
 * obstacle. Le drone n'est touché que si ce trajet le traverse réellement.
 */
function _fireAimedShot() {
  _gadgetDir.copy(_aimPoint).sub(_gadgetOrigin);
  const dist = _gadgetDir.length();
  _aimSegEnd.copy(_aimPoint);
  if (dist > 0.05) {
    _gadgetDir.multiplyScalar(1 / dist);
    if (colliders && colliders.length) {
      _gadgetRay.set(_gadgetOrigin, _gadgetDir);
      _gadgetRay.near = 0.05;
      _gadgetRay.far = dist;
      const wallHits = _gadgetRay.intersectObjects(colliders, false);
      if (wallHits.length) _aimSegEnd.copy(wallHits[0].point);
    }
  }

  let hit = false;
  const d = _sanctuaryDroneN;
  if (d?.group?.visible && !_droneNDead) {
    d.group.getWorldPosition(_aimDronePos);
    _aimDronePos.y += 0.15;
    hit = Aim.segmentHitsSphere(_gadgetOrigin, _aimSegEnd, _aimDronePos, Aim.AIM_HIT_RADIUS);
  }

  _spawnGadgetBeam(_gadgetOrigin, hit ? _aimDronePos : _aimSegEnd);
  _playGadgetShotSound(false);
  if (hit) _damageDroneN(GADGET_SHOT_DAMAGE);
}

```

- [ ] **Step 3: Brancher le tir visé dans `_fireGadgetShotOnce`**

Remplacer :

```js
  if (!_getGadgetWorldPosition(_gadgetOrigin)) {
    _gadgetOrigin.copy(playerPos);
    _gadgetOrigin.y -= 0.55;
  }

  let hit = false;
  const d = _gadgetTarget;
```

par :

```js
  if (!_getGadgetWorldPosition(_gadgetOrigin)) {
    _gadgetOrigin.copy(playerPos);
    _gadgetOrigin.y -= 0.55;
  }

  if (_aiming && _aimBlend >= 0.5) {
    _fireAimedShot();
    return;
  }

  let hit = false;
  const d = _gadgetTarget;
```

- [ ] **Step 4: Vérifier la syntaxe**

Run : `cp app/sanctuary-mode.js "$TEMP/sm-check.mjs" && node --check "$TEMP/sm-check.mjs" && echo SYNTAXE_OK`
Expected: `SYNTAXE_OK`.

---

### Task 5: Réticule rouge sur le drone, debug et cache-busting

**Files:**
- Modify: `styles/sanctuary.css` (fin de fichier)
- Modify: `app/sanctuary-mode.js` (`window.SanctuaryMode.debug`)
- Modify: `index.html` (lignes 19 et 691)

- [ ] **Step 1: Style du réticule verrouillé**

À la fin de `styles/sanctuary.css`, ajouter (les styles du réticule étant en ligne, `!important` est nécessaire) :

```css

/* Réticule de visée précise : passe au rouge quand il est sur le drone ennemi. */
#snAimReticle.is-lock > div:first-child {
  border-color: rgba(255, 96, 72, .95) !important;
  box-shadow: 0 0 22px rgba(255, 96, 72, .6) !important;
}
```

- [ ] **Step 2: Exposer l'état de visée dans `debug()`**

Dans `window.SanctuaryMode = { … debug: () => ({ … }) }`, remplacer :

```js
    camDist: _camDistView,
    camDistBase: _camDist,
```

par :

```js
    camDist: _camDistView,
    camDistBase: _camDist,
    aiming: _aiming,
    aimBlend: +_aimBlend.toFixed(3),
    aimLocked: _aimLocked,
    aimPoint: _aimPoint.toArray(),
    fov: M?.camera?.fov ?? null,
    baseFov: _baseFov,
    camPos: M?.camera ? M.camera.position.toArray() : null,
    headScale: _headBone ? _headBone.scale.x : null,
```

- [ ] **Step 3: Cache-busting**

Dans `index.html`, remplacer :

```html
  <link rel="stylesheet" href="styles/sanctuary.css?v=3" />
```

par :

```html
  <link rel="stylesheet" href="styles/sanctuary.css?v=4" />
```

et remplacer :

```html
  <script type="module" src="app/sanctuary-mode.js?v=37"></script>
```

par :

```html
  <script type="module" src="app/sanctuary-mode.js?v=38"></script>
```

- [ ] **Step 4: Vérifier la syntaxe**

Run : `cp app/sanctuary-mode.js "$TEMP/sm-check.mjs" && node --check "$TEMP/sm-check.mjs" && echo SYNTAXE_OK`
Expected: `SYNTAXE_OK`.

---

### Task 6: Vérification dans Chrome (`tools/aim-check.mjs`)

**Files:**
- Create: `tools/aim-check.mjs`

- [ ] **Step 1: Écrire le script de vérification**

Créer `tools/aim-check.mjs` :

```js
/**
 * Vérification de la visée précise (mode Sanctuaire) dans Chrome.
 * Prérequis : `npm run serve` (http://localhost:8123)
 * Usage : node tools/aim-check.mjs
 * Sortie : captures dans %TEMP% (aim-off-0.png, aim-on.png, aim-off-1.png), code 1 si une vérification échoue.
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));
const TMP = process.env.TEMP || '.';
const S_FPS = 3;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'shell',
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1000, height: 640 });

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => { if (m.type() === 'warning' && /Sanctuaire/.test(m.text())) console.log(`  [warn] ${m.text()}`); });

const failures = [];
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dbg = () => page.evaluate(() => window.SanctuaryMode.debug());
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const shot = async (name) => {
  const p = path.join(TMP, name);
  await page.screenshot({ path: p });
  console.log(`  capture : ${p}`);
};

await page.goto('http://localhost:8123/?tiles=0', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  `!!(window.MosqueScene && window.MosqueScene.scene.getObjectByName('Mosquee_Base'))`,
  { timeout: 120000 },
);

await page.evaluate(() => {
  for (const id of ['videoOverlay', 'boot']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  const gm = document.getElementById('gmRoot');
  if (gm) gm.style.setProperty('display', 'none', 'important');
  const lo = document.getElementById('mosqueLoading');
  if (lo) lo.style.setProperty('display', 'none', 'important');
  const v = document.getElementById('introVideo');
  if (v) { try { v.pause(); } catch (e) {} }
  window.startMosqueScene();
});
await sleep(3000);
await page.evaluate(() => window.SanctuaryMode.enter());
await page.waitForFunction(
  `(() => { const d = window.SanctuaryMode.debug(); return d.state === ${S_FPS} && d.ready; })()`,
  { timeout: 180000 },
);
await sleep(1500);

// --- Hors visée -----------------------------------------------------------
let d0 = await dbg();
check('hors visée : aiming = false', d0.aiming === false);
check('hors visée : caméra en 3e personne (> 2,5 m du joueur)', dist(d0.camPos, d0.pos) > 2.5, `distance ${dist(d0.camPos, d0.pos).toFixed(2)} m`);
check('hors visée : tête visible (échelle 1)', d0.headScale === null || d0.headScale === 1, `échelle ${d0.headScale}`);
const baseFov = d0.fov;
await shot('aim-off-0.png');

// --- Visée (clic droit maintenu) ------------------------------------------
await page.mouse.move(500, 320);
await page.mouse.down({ button: 'right' });
await sleep(1500);
const d1 = await dbg();
check('visée : aiming = true', d1.aiming === true);
check('visée : fondu terminé', d1.aimBlend === 1, `aimBlend ${d1.aimBlend}`);
check('visée : FOV réduit à ~40°', Math.abs(d1.fov - 40) < 0.5, `fov ${d1.fov?.toFixed(2)} (base ${baseFov})`);
check('visée : caméra aux yeux (< 1,2 m de playerPos)', dist(d1.camPos, d1.pos) < 1.2, `distance ${dist(d1.camPos, d1.pos).toFixed(2)} m`);
check('visée : tête masquée', d1.headScale !== null && d1.headScale < 0.01, `échelle ${d1.headScale}`);
check('visée : aucun tir latéral parasite', d1.shooting === false && d1.sideShot === false);
const reticleVisible = await page.evaluate(() => getComputedStyle(document.getElementById('snAimReticle')).display !== 'none');
check('visée : réticule affiché', reticleVisible);
await shot('aim-on.png');

// --- Tir en visée ---------------------------------------------------------
await page.evaluate(() => window.SanctuaryMode.shoot(false));
await sleep(300);
const d2 = await dbg();
check('tir en visée : la rafale démarre', d2.shooting === true);
check('tir en visée : jamais de tir latéral', d2.sideShot === false);
await sleep(2000);

// --- Relâchement ----------------------------------------------------------
await page.mouse.up({ button: 'right' });
await sleep(1500);
const d3 = await dbg();
check('relâché : aiming = false', d3.aiming === false);
check('relâché : FOV identique à l\'origine', Math.abs(d3.fov - baseFov) < 0.05, `fov ${d3.fov?.toFixed(2)} vs ${baseFov}`);
check('relâché : tête de nouveau visible', d3.headScale === 1, `échelle ${d3.headScale}`);
check('relâché : caméra de retour en 3e personne', dist(d3.camPos, d3.pos) > 2.5, `distance ${dist(d3.camPos, d3.pos).toFixed(2)} m`);
await shot('aim-off-1.png');

check('aucune erreur JavaScript', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(failures.length ? `\n${failures.length} vérification(s) en échec` : '\nToutes les vérifications passent');
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 2: Démarrer le serveur de dev en arrière-plan**

Run : `npm run serve` (en tâche de fond). Expected : `up — http://localhost:8123` (ou `déjà lancé — http://localhost:8123` si déjà actif).

- [ ] **Step 3: Lancer la vérification**

Run : `npm run test:aim`
Expected : toutes les lignes `OK`, `Toutes les vérifications passent`, code de sortie 0, et trois captures dans `%TEMP%`. Le chargement en rendu logiciel peut prendre plus d'une minute.

Si une ligne `FAIL` apparaît : ne pas ajuster le test pour le faire passer. Lire la valeur affichée après `—`, corriger le code correspondant (tâches 2 à 4) et relancer.

- [ ] **Step 4: Regarder la capture de visée**

Ouvrir `aim-on.png` (chemin affiché par le script) avec l'outil `Read` et vérifier : le canon/gadget et les bras visibles en bas de l'écran, pas de tête ni de cheveux devant le réticule, réticule dégagé au centre.

---

### Task 7: Réglage visuel et essai manuel

**Files:**
- Modify (si besoin): `app/aim-system.js` (constantes `AIM_FOV`, `AIM_EYE_UP`, `AIM_EYE_FORWARD`, `AIM_CAM_BACK`, `AIM_LOOK_MULT`, `AIM_HIT_RADIUS`)

- [ ] **Step 1: Ajuster les constantes d'après la capture**

Selon `aim-on.png` :
- le bord de la tête ou le col apparaît en haut du champ → augmenter `AIM_EYE_UP` (ex. 0,14) ;
- les bras et le gadget ne sont pas visibles → augmenter `AIM_CAM_BACK` (ex. 0,35) ;
- la caméra voit l'intérieur du buste → réduire `AIM_CAM_BACK` ou augmenter `AIM_EYE_FORWARD` ;
- trop ou pas assez zoomé → modifier `AIM_FOV`.

Après chaque changement : `npm run test:aim-logic`, puis relancer `npm run test:aim` et regarder à nouveau `aim-on.png`. Si `aim-system.js` change, incrémenter `?v=1` dans l'import de `sanctuary-mode.js` (`'./aim-system.js?v=2'`) et le `?v=38` de `index.html`.

- [ ] **Step 2: Essai manuel avec l'utilisateur (souris puis manette)**

Faire tester par l'utilisateur dans le jeu, en actualisant la page en vidant le cache (Ctrl+F5) :
1. Entrer en Sanctuaire, maintenir le clic droit : la caméra passe aux yeux en douceur, FOV réduit, bras et gadget visibles, tête masquée, réticule rouge sur le drone.
2. Clic gauche ou `F` : le faisceau part de la bouche du gadget et arrive au centre du réticule.
3. Viser le drone ennemi puis tirer : il perd de la vie. Viser à côté : il ne perd rien.
4. Viser derrière un pilier : le tir s'arrête sur le pilier.
5. Relâcher le clic droit : retour fluide à la 3e personne, tête visible, FOV d'origine.
6. Hors visée : verrouillage automatique et tir à 18 m comme avant ; `V` = tir latéral.
7. Manette : `L2` vise, `R2` tire, stick droit oriente (plus lent en visée).

Noter ses retours et ajuster les constantes, ou ouvrir une nouvelle itération pour les demandes hors périmètre (niveaux de zoom, bouton de visée tactile).

---

## Auto-relecture du plan

**Couverture du spec :**
- Entrées (manette L2/R2/stick, souris clic droit/gauche/F, V, molette inchangée) → Tâche 2 (étapes 3-7), Tâche 4 (étape 1 pour V).
- Caméra aux yeux, ancre `mixamorig:Head`, lissage, retrait, orientation indépendante de l'animation → Tâche 2 (étapes 10-11).
- FOV doux et retour au FOV réel → Tâche 2 (étapes 6, 8, 11) ; testé Tâche 1 et Tâche 6.
- Collisions caméra : le rayon `_camRay` existant s'applique inchangé après le calcul de la position (étape 10).
- Corps vers la caméra, tête masquée → Tâche 3.
- Point visé, tir bouche → point visé, touche segment/sphère, parallaxe, réticule rouge → Tâches 4 et 5.
- Hors visée inchangé → étape 1 de la Tâche 4 (`_aiming ? null : _getGadgetTarget()`).
- Cas limites : sortie de mode (`_resetAim` dans `exit`), os introuvable (repli `playerPos`), tir agenouillé (ancre = tête).
- Sensibilité réduite en visée → Tâche 2 (étapes 3 et 7).
- Hors périmètre respecté : aucun niveau de zoom, aucune bascule, aucun bouton tactile.

**Cohérence des noms :** `_aiming`, `_aimBlend`, `_aimPoint`, `_aimLocked`, `_baseFov`, `_headBone`, `_setAiming`, `_setAimLock`, `_resetAim`, `_applyAimBody`, `_aimEyePosition`, `_updateAimPoint`, `_fireAimedShot` et les exports `Aim.approach`, `Aim.aimFov`, `Aim.headScale`, `Aim.lookMultiplier`, `Aim.segmentHitsSphere`, `Aim.AIM_*` sont définis avant d'être utilisés.

**Risque connu :** la tête masquée suppose que `CW_Hair` et le crâne de `CW_Body` sont skinnés sur `mixamorigHead`. Si la capture de la Tâche 6 montre des cheveux ou un crâne visibles, ajouter les os enfants (`mixamorigHeadTop_End`) ou masquer explicitement le mesh `CW_Hair`.
