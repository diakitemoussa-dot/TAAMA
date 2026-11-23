/* ==========================================================
   MISSION DU CRÉPISSAGE — en 3D, sur la vraie façade
   ----------------------------------------------------------
   • start() : le personnage se place face au mur le plus proche ; un panneau de « terre fraîche » épouse la façade devant lui
     (sa transparence est un masque peint par la main) ; la caméra se rapproche de la main droite.
   • Commandes : stick droit (manette), souris / doigt (la main suit le pointeur, clic maintenu pour crépir), flèches ou ZQSD + Espace.
   • Le bras suit le point visé (solveur à deux os : app/crepissage-logic.js). À la fin : fin du chapitre 1 et carte des destinations.
   • Logique pure (couverture, viseur, bras) : app/crepissage-logic.js, testée sous Node.
   ========================================================== */
import * as THREE from 'three';
import * as L from './crepissage-logic.js?v=1';
import { blackTransition } from './screen-fx.js?v=2';
import { t } from './i18n.js?v=3';

const PANEL_W = 0.98, PANEL_H = 0.57;          // dimensions du panneau (m), réduites d'un quart pour rester à portée du bras (avant : 1,3 × 0,76) : même proportion que la grille de couverture (48 × 28)
const SEG_X = 32, SEG_Y = 19;                // maillage du panneau (il épouse le relief du mur)
const MASK_W = 1024, MASK_H = 597;           // texture du masque (≈ 1024 × 1024 × 0,583)
const BRUSH_M = 0.1;                         // rayon de la main sur le mur (m)
const LEAN_PITCH = 24, LEAN_ROLL = 14, LEAN_TWIST = 30;   // limites (degrés) du buste qui accompagne la main : penché en avant, incliné et tourné vers elle
const LEAN_BASE = 7;                         // le personnage est toujours un peu penché vers le mur pendant le crépissage (degrés)
const BODY_DIST = 0.58;
const APPROACH_MAX = 0;                      // le personnage ne s'avance plus (pieds fixes sur le toron) : c'est le buste qui se penche ; mettre p. ex. 0.3 pour qu'il s'avance
const HAND_FOLLOW = 10;                     // vitesse à laquelle la main rejoint le point visé (plus grand = plus vif, plus petit = plus doux)
const HAND_SPRING = 11;                      // raideur du ressort amorti de la main (pulsation, rad/s) : mouvement fluide, sans à-coup ni rebond
const ORBIT = false;                         // orbite de la caméra désactivée pendant le crépissage (vue fixe) ; mettre true pour la réactiver
const CAM_AZ_MIN = -1.3, CAM_AZ_MAX = 2.7;     // le mur est derrière le personnage côté mur : la caméra tourne de l'arrière-gauche à l'avant-droit
const CAM_EL_MIN = -0.35, CAM_EL_MAX = 1.2, CAM_R_MIN = 0.7, CAM_R_MAX = 3.5;      // limites de l'orbite de la caméra
const CAM_HOME = { az: 0.75, el: 0.12, r: 1.3 };   // vue de départ : par-dessus l'épaule DROITE, tout près ; avant : { az: 0.3, el: 0.22, r: 2.3 } (derrière), puis { az: 1.44, el: 0.08, r: 1.17 } (de côté)
const YAW_MAX = 0.25;                        // le corps entier ne pivote presque plus (±14°, pieds stables) : les épaules tournent à sa place (LEAN_TWIST)                      // le corps reste à distance du mur : le bras droit est tendu, la paume ouverte vers le mur
const WALL_GAP = 0.9;                        // distance du personnage au mur (m)
const GAP_OFF = 0.015;                       // le panneau flotte à 1,5 cm du mur (pas de scintillement)

const LINES = {
  intro: { text: 'Regarde comment le toron te permet de tenir, et comment toute la communauté sort pour travailler en équipe. Passe la main sur le mur : la terre doit le couvrir partout.', mood: 'attentive', duration: 11 },
  mi: { text: 'C’est ça, doucement, avec toute la paume. Un mur bien crépi protège la mosquée toute l’année.', mood: 'souriante', duration: 7 },
  fin: { text: 'Voilà : la mosquée est prête pour la saison des pluies. Merci d’avoir pris soin de ce mur. Notre route continue vers Bandiagara.', mood: 'souriante', duration: 9 },
};

let S = null;                                // état de la mission en cours (null = aucune)

/* ---------- mur et placement ---------- */
function ray(colliders, origin, dir, far) {
  const rc = new THREE.Raycaster(origin, dir, 0, far);
  return rc.intersectObjects(colliders, false);
}
function wallNormal(hit, towards) {
  const n = (hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1)).transformDirection(hit.object.matrixWorld);
  if (n.dot(towards) < 0) n.negate();               // orientée vers le joueur
  return n;
}
/** Mur vertical le plus proche, cherché de la hauteur de la poitrine vers le bas (rayons horizontaux tout autour, portée 2,5 m).
 *  La première hauteur qui touche donne le HAUT du mur à crépir (au sommet d'un pilier à torons, le mur est sous les pieds). */
function findWall(info) {
  const feet = info.playerPos.y - info.eyeHeight;
  for (let dy = 1.4; dy >= -2.6; dy -= 0.2) {
    const o = new THREE.Vector3(info.playerPos.x, feet + dy, info.playerPos.z);
    let best = null;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2, d = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
      const h = ray(info.colliders, o, d, 2.5).find((x) => !/^Sol_|Toron/.test(x.object.name || ''));   // les torons (bois) sont devant le mur : on les traverse ; « Poteaux » = les pinacles EN TERRE de la façade : c'est bien le mur à crépir
      if (!h || !h.face) continue;
      const nf = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (nf.dot(d) > -0.2) continue;                 // face vue de dos (le rayon part de l'intérieur) : on l'ignore
      if (Math.abs(nf.y) > 0.4) continue;             // pas un mur vertical
      if (!best || h.distance < best.dist) best = { dist: h.distance, point: h.point.clone(), n: new THREE.Vector3(nf.x, 0, nf.z).normalize(), topY: o.y };
    }
    if (best) return best;
  }
  return null;
}
function groundAt(info, x, z, y0) {
  const h = ray(info.colliders, new THREE.Vector3(x, y0 + 2, z), new THREE.Vector3(0, -1, 0), 8)[0];
  return h ? h.point.y : y0;
}

/* ---------- panneau de terre fraîche ---------- */
/* Texture de banco frais (terre jaunâtre de Djenné) générée par code, raccordable sur ses bords :
   1. teinte ocre-jaune qui varie en nappes (bruit fractal), 2. grain fin de sable, 3. petits graviers,
   4. brins de paille (le banco en contient), 5. traces de paume lissées. */
function plasterTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d');
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const grid = (cells) => { const a = new Float32Array(cells * cells); for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; };
  const octaves = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([cells, w]) => ({ cells, w, a: grid(cells) }));
  const smooth = (t) => t * t * (3 - 2 * t);
  const noise = (o, x, y) => {                       // bruit de valeur périodique (la texture se répète sans couture)
    const fx = (x / N) * o.cells, fy = (y / N) * o.cells, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth(fx - x0), ty = smooth(fy - y0);
    const at = (i, j) => o.a[((j + o.cells) % o.cells) * o.cells + ((i + o.cells) % o.cells)];
    const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx, bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return top + (bot - top) * ty;
  };
  const DARK = [150, 112, 58], MID = [196, 156, 88], LIGHT = [222, 190, 126];   // ocre sombre → jaune banco → sable clair
  const img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let n = 0; for (const o of octaves) n += noise(o, x, y) * o.w;
    n = Math.min(1, Math.max(0, (n - 0.5) * 1.6 + 0.5));
    const k = n < 0.5 ? n * 2 : (n - 0.5) * 2, A = n < 0.5 ? DARK : MID, B = n < 0.5 ? MID : LIGHT;
    const grain = (rnd() - 0.5) * 18, i = (y * N + x) * 4;
    d[i] = A[0] + (B[0] - A[0]) * k + grain; d[i + 1] = A[1] + (B[1] - A[1]) * k + grain * 0.9; d[i + 2] = A[2] + (B[2] - A[2]) * k + grain * 0.7; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 900; i++) {                    // petits graviers et grains plus gros
    const x = rnd() * N, y = rnd() * N, r = 0.6 + rnd() * 1.6, dark = rnd() < 0.6;
    g.fillStyle = dark ? `rgba(105,74,38,${0.25 + rnd() * 0.3})` : `rgba(240,214,160,${0.2 + rnd() * 0.3})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  for (let i = 0; i < 260; i++) {                    // brins de paille mêlés à la terre
    const x = rnd() * N, y = rnd() * N, a = rnd() * Math.PI, len = 5 + rnd() * 14;
    g.strokeStyle = rnd() < 0.5 ? `rgba(232,200,120,${0.35 + rnd() * 0.3})` : `rgba(170,128,60,${0.3 + rnd() * 0.3})`;
    g.lineWidth = 0.6 + rnd() * 0.9; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  for (let i = 0; i < 55; i++) {                     // traces de paume : longs arcs lissés, plus clairs ou plus sombres
    g.strokeStyle = rnd() < 0.5 ? `rgba(120,86,42,${0.05 + rnd() * 0.07})` : `rgba(245,222,170,${0.05 + rnd() * 0.06})`; g.lineWidth = 6 + rnd() * 12;
    g.beginPath(); const y = rnd() * N; g.moveTo(-20, y); g.bezierCurveTo(N * 0.3, y + 24 - rnd() * 48, N * 0.65, y + 24 - rnd() * 48, N + 20, y + 12 - rnd() * 24); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1.3, 0.8); tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const NOT_WALL = /^Sol_|Toron|Voiture_Collider/;      // le panneau se pose sur le mur lui-même : ni sur le sol, ni sur les torons (qui restent devant)
/** Surfaces sur lesquelles poser la terre : les maillages AFFICHÉS proches du mur (les collisions sont des volumes simplifiés,
 *  parfois en retrait de la façade visible : une terre posée dessus restait cachée dans le minaret), puis les collisions en secours. */
function wallSurfaces(info, center) {
  const sc = window.MosqueScene && window.MosqueScene.scene; if (!sc) return info.colliders;
  sc.updateMatrixWorld(true);
  const player = new Set(); if (info.model) info.model.traverse((o) => player.add(o));
  const box = new THREE.Box3(), out = [];
  sc.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || player.has(o) || !o.geometry) return;
    if (NOT_WALL.test(o.name || '') || /Toron|PanneauCrepi/i.test(o.name || '')) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.isMeshBasicMaterial) return;                      // halos, repères, eau, verre : pas un mur
    for (let p = o; p; p = p.parent) if (!p.visible) return;                       // caché (lui ou un parent)
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    if (box.distanceToPoint(center) < 3) out.push(o);
  });
  return out.concat(info.colliders);
}
function buildPanel(info, center, right, n, targets = info.colliders, keep = null) {   // keep(x, y, z) : la case est-elle gardée (à portée de main) ?
  const NV = (SEG_X + 1) * (SEG_Y + 1);
  const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), idx = [], depth = new Float32Array(NV), ok = new Uint8Array(NV);
  const up = new THREE.Vector3(0, 1, 0), P = new THREE.Vector3(), O = new THREE.Vector3(), nd = n.clone().negate(), nf = new THREE.Vector3();
  for (let j = 0; j <= SEG_Y; j++) for (let i = 0; i <= SEG_X; i++) {
    const u = i / SEG_X, r = j / SEG_Y, k = j * (SEG_X + 1) + i;
    P.copy(center).addScaledVector(right, (u - 0.5) * PANEL_W).addScaledVector(up, (0.5 - r) * PANEL_H);
    O.copy(P).addScaledVector(n, 1.4);
    const h = ray(targets, O, nd, 5).find((x) => x.face && !NOT_WALL.test(x.object.name || ''));
    if (h) {                                         // le sommet se pose sur le mur, 1,5 cm devant, dans le sens de la face touchée (suit murs inclinés, marches, rebords)
      nf.copy(h.face.normal).transformDirection(h.object.matrixWorld); if (nf.dot(n) < 0) nf.negate();
      P.copy(h.point).addScaledVector(nf, GAP_OFF); depth[k] = h.distance; ok[k] = 1;
    }
    pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z;
    uv[k * 2] = u; uv[k * 2 + 1] = 1 - r;
  }
  // Un point sans mur (rayon passé dans un creux, une fente) est rempli à partir de ses voisins : la terre suit le creux au lieu de laisser un trou.
  for (let pass = 0; pass < 3; pass++) {
    const add = [];
    for (let j = 0; j <= SEG_Y; j++) for (let i = 0; i <= SEG_X; i++) {
      const k = j * (SEG_X + 1) + i; if (ok[k]) continue;
      const nb = [i > 0 ? k - 1 : -1, i < SEG_X ? k + 1 : -1, j > 0 ? k - (SEG_X + 1) : -1, j < SEG_Y ? k + (SEG_X + 1) : -1].filter((q) => q >= 0 && ok[q]);
      if (nb.length >= 2) add.push([k, nb]);
    }
    for (const [k, nb] of add) {
      for (let c = 0; c < 3; c++) pos[k * 3 + c] = nb.reduce((a, q) => a + pos[q * 3 + c], 0) / nb.length;
      depth[k] = nb.reduce((a, q) => a + depth[q], 0) / nb.length; ok[k] = 1;
    }
  }
  const validQuad = new Uint8Array(SEG_X * SEG_Y);
  for (let j = 0; j < SEG_Y; j++) for (let i = 0; i < SEG_X; i++) {
    const a = j * (SEG_X + 1) + i, b = a + 1, c = a + SEG_X + 1, d = c + 1;
    if (!(ok[a] && ok[b] && ok[c] && ok[d])) continue;                             // pas de mur derrière : pas de terre dans le vide
    if (keep && !keep(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2])) continue;         // hors de portée de la main : pas de terre à poser là
    if (Math.max(depth[a], depth[b], depth[c], depth[d]) - Math.min(depth[a], depth[b], depth[c], depth[d]) > 1.4) continue;    // saut de profondeur énorme (bord du mur, vide derrière) : on ne tend pas de toile
    validQuad[j * SEG_X + i] = 1; idx.push(a, c, b, b, c, d);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const mask = document.createElement('canvas'); mask.width = MASK_W; mask.height = MASK_H;
  const mctx = mask.getContext('2d'); mctx.fillStyle = '#000'; mctx.fillRect(0, 0, MASK_W, MASK_H);
  const maskTex = new THREE.CanvasTexture(mask);
  const mat = new THREE.MeshStandardMaterial({ map: plasterTexture(), alphaMap: maskTex, transparent: true, roughness: 0.78, metalness: 0,   /* terre fraîche : à peine brillante */ side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  const mesh = new THREE.Mesh(geo, mat); mesh.name = 'PanneauCrepi'; mesh.frustumCulled = false; mesh.renderOrder = 3;
  return { mesh, mask, mctx, maskTex, pos, validQuad };
}
function disposePanel(p) { try { p.mesh.geometry.dispose(); p.mesh.material.map?.dispose(); p.maskTex.dispose(); p.mesh.material.dispose(); } catch (_) {} }
/** Point 3D du panneau en (u, r) : interpolation des sommets. */
function panelPoint(u, r, out) {
  const fx = L.clamp01(u) * SEG_X, fy = L.clamp01(r) * SEG_Y, i = Math.min(SEG_X - 1, Math.floor(fx)), j = Math.min(SEG_Y - 1, Math.floor(fy)), tx = fx - i, ty = fy - j, p = S.panel.pos;
  const at = (ii, jj, c) => p[(jj * (SEG_X + 1) + ii) * 3 + c];
  for (let c = 0; c < 3; c++) {
    const top = at(i, j, c) * (1 - tx) + at(i + 1, j, c) * tx, bot = at(i, j + 1, c) * (1 - tx) + at(i + 1, j + 1, c) * tx;
    out.setComponent(c, top * (1 - ty) + bot * ty);
  }
  return out;
}
function paintMask(u, r) {
  const { mctx, maskTex } = S.panel, x = u * MASK_W, y = r * MASK_H, rx = (BRUSH_M / PANEL_W) * MASK_W, sy = (MASK_H / PANEL_H) / (MASK_W / PANEL_W);
  mctx.save(); mctx.translate(x, y); mctx.scale(1, sy);
  const g = mctx.createRadialGradient(0, 0, rx * 0.35, 0, 0, rx);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  mctx.fillStyle = g; mctx.beginPath(); mctx.arc(0, 0, rx, 0, Math.PI * 2); mctx.fill(); mctx.restore();
  maskTex.needsUpdate = true;
}


/* ---------- main tachée de boue (pendant le crépissage) ---------- */
const HAND_BONES = /RightHand/;                                    // la main droite et ses doigts (pas l'avant-bras)
function addMud(model) {
  const states = [];
  model.traverse((o) => {
    if (!o.isSkinnedMesh || !o.skeleton) return;
    const flags = o.skeleton.bones.map((b) => (HAND_BONES.test(b.name) ? 1 : 0));
    if (!flags.includes(1)) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material], orig = mats.slice();
    const uni = { uMudBones: { value: flags }, uMud: { value: 0 } };
    const clones = mats.map((m) => {
      const c = m.clone(), prev = m.onBeforeCompile;                // on garde les modifications déjà faites (fondu de la tête…)
      c.onBeforeCompile = (shader, renderer) => {
        if (prev) prev.call(c, shader, renderer);
        shader.uniforms.uMudBones = uni.uMudBones; shader.uniforms.uMud = uni.uMud;
        shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
uniform float uMudBones[${flags.length}];
varying float vMudW; varying vec3 vMudP;`)
          .replace('#include <skinning_vertex>', `#include <skinning_vertex>
#ifdef USE_SKINNING
 vMudW = skinWeight.x * uMudBones[int(skinIndex.x)] + skinWeight.y * uMudBones[int(skinIndex.y)] + skinWeight.z * uMudBones[int(skinIndex.z)] + skinWeight.w * uMudBones[int(skinIndex.w)];
#else
 vMudW = 0.0;
#endif
 vMudP = position;`);
        shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
uniform float uMud; varying float vMudW; varying vec3 vMudP;`)
          .replace('#include <color_fragment>', `#include <color_fragment>
  { float n = fract(sin(dot(floor(vMudP * 90.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float m = smoothstep(0.35, 0.75, vMudW) * clamp(uMud * (0.55 + 0.7 * n), 0.0, 1.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.30, 0.19, 0.10) * (0.8 + 0.4 * n), m * 0.92); }`);
      };
      c.customProgramCacheKey = () => 'mud' + (prev ? prev.toString().length : 0);
      c.needsUpdate = true;
      return c;
    });
    o.material = Array.isArray(o.material) ? clones : clones[0];
    states.push({ o, orig: Array.isArray(o.material) ? orig : orig[0], clones, uni });
  });
  return {
    set(a) { for (const s of states) s.uni.uMud.value = a; },
    dispose() { for (const s of states) { s.o.material = s.orig; for (const c of s.clones) c.dispose(); } states.length = 0; },
    get count() { return states.length; },
  };
}

/* ---------- bras ---------- */
const _v = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion() };
const arr = (v) => [v.x, v.y, v.z];
function aimBone(bone, childPos, wantPos) {
  bone.getWorldPosition(_v.a);
  _v.b.copy(childPos).sub(_v.a).normalize(); _v.c.copy(wantPos).sub(_v.a).normalize();
  _v.q.setFromUnitVectors(_v.b, _v.c);
  bone.getWorldQuaternion(_v.w); _v.w.premultiply(_v.q);
  bone.parent.getWorldQuaternion(_v.p);
  bone.quaternion.copy(_v.p.invert().multiply(_v.w));
  bone.updateWorldMatrix(false, true);
}
const _ax = new THREE.Vector3(), sh0 = new THREE.Vector3();
const PALM_SIGN = -1;                                // sens de la paume par rapport au produit vectoriel doigts × travers de la main (main droite Mixamo)
/** Main ouverte : la paume est tournée vers le mur, les doigts vers le haut (comme une main qui lisse le crépi). */
function palmToWall(weight) {
  const B = S.bones; if (!B.mid || !B.idx || !B.pky) return;
  S.model.updateMatrixWorld(true);
  const ph = B.hand.getWorldPosition(new THREE.Vector3()), pm = B.mid.getWorldPosition(new THREE.Vector3()), pi = B.idx.getWorldPosition(new THREE.Vector3()), pp = B.pky.getWorldPosition(new THREE.Vector3());
  const v1 = pm.clone().sub(ph).normalize(), v2 = pi.clone().sub(pp).normalize();
  const normal = new THREE.Vector3().crossVectors(v1, v2).multiplyScalar(PALM_SIGN).normalize();
  const want = S.n.clone().negate();
  const q1 = new THREE.Quaternion().setFromUnitVectors(normal, want);
  const f = v1.clone().applyQuaternion(q1); f.addScaledVector(want, -f.dot(want)).normalize();
  const up = new THREE.Vector3(0, 1, 0); up.addScaledVector(want, -up.dot(want)).normalize();
  const ang = Math.atan2(new THREE.Vector3().crossVectors(f, up).dot(want), f.dot(up));
  const q = new THREE.Quaternion().setFromAxisAngle(want, ang).multiply(q1);
  const cur = B.hand.quaternion.clone();
  B.hand.getWorldQuaternion(_v.w); _v.w.premultiply(q); B.hand.parent.getWorldQuaternion(_v.p);
  B.hand.quaternion.copy(cur).slerp(_v.p.invert().multiply(_v.w), weight);
  B.hand.updateWorldMatrix(false, true);
}
function setLean(base, pitch, roll, twist = 0, fwd = S.n.clone().negate(), right = S.right) {   // penche le buste (avant : `pitch`°, côté droit : `roll`°) et le tourne (vers la droite : `twist`°), réparti sur les 3 vertèbres, à partir de la pose d'animation
  const sp = S.bones.spine; if (!sp.length) return;
  const n = sp.length, f = fwd;
  const q = new THREE.Quaternion().setFromAxisAngle(_ax.copy(right).negate(), THREE.MathUtils.degToRad(pitch) / n)
    .premultiply(new THREE.Quaternion().setFromAxisAngle(f, THREE.MathUtils.degToRad(roll) / n))
    .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(twist) / n));
  sp.forEach((b, i) => { b.quaternion.copy(base[i]); });
  S.model.updateMatrixWorld(true);
  sp.forEach((b) => { b.getWorldQuaternion(_v.w); _v.w.premultiply(q); b.parent.getWorldQuaternion(_v.p); b.quaternion.copy(_v.p.invert().multiply(_v.w)); b.updateWorldMatrix(false, true); });
}
function applyArm(target, weight, dt) {
  const B = S.bones; if (!B) return;
  // Pose de départ des os que l'on pilote : mémorisée une fois, puis remise à chaque image. Sans cela, ce que l'animation ne réécrit pas
  // (ou réécrit par à-coups) s'additionnerait d'une image à l'autre : le buste dérivait puis revenait d'un coup (saccades).
  if (!S.rest) S.rest = [B.arm, B.fore, B.hand, B.clav, B.mid, B.idx, B.pky, ...B.spine].filter(Boolean).map((b) => [b, b.quaternion.clone()]);
  for (const [b, q] of S.rest) b.quaternion.copy(q);
  if (weight <= 0.001) return;
  S.model.updateWorldMatrix(true, true);
  if (B.spine.length) {                              // le buste accompagne le bras, en douceur : l'inclinaison est une fonction continue de la cible (pas de recherche, donc pas de saccade)
    const base = B.spine.map((b) => b.quaternion.clone());
    // repère du CORPS (il pivote pour suivre la main) : avant / droite du buste
    const fwd = new THREE.Vector3(Math.sin(S.yaw), 0, Math.cos(S.yaw)), rightB = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    if (!S.armLen && B.arm && B.fore && B.hand) {     // longueur du bras (épaule → coude → poignet), mesurée une fois
      const a = B.arm.getWorldPosition(new THREE.Vector3()), f2 = B.fore.getWorldPosition(new THREE.Vector3()), h2 = B.hand.getWorldPosition(new THREE.Vector3());
      S.armLen = a.distanceTo(f2) + f2.distanceTo(h2);
    }
    B.arm.getWorldPosition(sh0);
    const delta = _v.b.copy(target).sub(sh0), eLat = delta.dot(rightB), eUp = delta.y;
    const soft = (v, dead, k, max) => Math.sign(v) * Math.min(max, Math.max(0, Math.abs(v) - dead) * k);
    const manque = Math.max(0, delta.length() - 0.9 * (S.armLen || 0.55));                       // la main n'atteint pas le mur : le buste se penche pour combler l'écart
    S.manque = manque;                                                                            // (et le personnage s'avance : voir tick)
    const flat = _v.a.set(delta.x, 0, delta.z); if (flat.lengthSq() > 1e-6) { flat.normalize(); const rd = S.reachDir || (S.reachDir = flat.clone()); rd.lerp(flat, 1 - Math.exp(-6 * dt)).normalize(); }   // direction (au sol) de la main : le personnage s'avance de ce côté
    const wantRoll = soft(eLat, 0.06, 45, LEAN_ROLL);                                             // main à droite / à gauche : le buste s'incline de ce côté
    const wantTwist = soft(eLat, 0.03, 40, LEAN_TWIST);                                           // … et tourne les épaules vers la main
    const wantPitch = Math.max(-2, Math.min(LEAN_PITCH, LEAN_BASE - soft(eUp, 0.1, 30, 8) + manque * 60));   // toujours un peu penché vers le mur, plus si la main est basse ou loin
    S.pitch = L.damp(S.pitch, wantPitch, 5, dt); S.roll = L.damp(S.roll, wantRoll, 5, dt); S.twist = L.damp(S.twist || 0, wantTwist, 5, dt);
    setLean(base, S.pitch * weight, S.roll * weight, S.twist * weight, fwd, rightB);
    if (B.clav) {                                    // l'épaule avance un peu vers la cible (jusqu'à 6 cm)
      B.arm.getWorldPosition(sh0); _v.b.copy(target).sub(sh0); const dl = Math.min(0.06, _v.b.length());
      aimBone(B.clav, sh0, _v.c.copy(sh0).addScaledVector(_v.b.normalize(), dl));
    }
  }
  const qa = B.arm.quaternion.clone(), qf = B.fore.quaternion.clone();
  const sh = B.arm.getWorldPosition(new THREE.Vector3()), el = B.fore.getWorldPosition(new THREE.Vector3()), ha = B.hand.getWorldPosition(new THREE.Vector3());
  const l1 = sh.distanceTo(el), l2 = el.distanceTo(ha);
  const pole = S.right.clone().multiplyScalar(0.7).add(new THREE.Vector3(0, -1, 0)).addScaledVector(S.n, 0.5);
  const r = L.solveTwoBone(arr(sh), arr(target), l1, l2, arr(pole));
  const elbow = new THREE.Vector3(...r.elbow), hand = new THREE.Vector3(...r.hand);
  aimBone(B.arm, el, elbow);
  B.fore.getWorldPosition(el); B.hand.getWorldPosition(ha);
  aimBone(B.fore, ha, hand);
  palmToWall(weight);
  S.shoulder = B.arm.getWorldPosition(S.shoulder || new THREE.Vector3());
  if (weight < 1) { const ia = B.arm.quaternion.clone(), ifo = B.fore.quaternion.clone(); B.arm.quaternion.copy(qa).slerp(ia, weight); B.fore.quaternion.copy(qf).slerp(ifo, weight); B.arm.updateWorldMatrix(false, true); }
}

/* ---------- interface ---------- */
function buildUI() {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:50%;bottom:max(18px,env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:9000;width:min(520px,calc(100vw - 32px));pointer-events:none;font-family:system-ui,sans-serif;color:#F8F3EA;text-align:center;text-shadow:0 1px 3px rgba(0,0,0,.7)';
  const hint = document.createElement('div'); hint.style.cssText = 'font-size:14px;margin-bottom:8px';
  const pad = !!(window.GamepadKit?.connected?.());
  hint.textContent = t(pad ? 'Stick droit : passe la main sur le mur' : 'Glisse la main sur le mur (clic maintenu) · flèches + Espace · Échap pour quitter');
  const bar = document.createElement('div'); bar.style.cssText = 'height:12px;border-radius:99px;background:rgba(0,0,0,.45);border:2px solid #F8F3EA;overflow:hidden';
  const fill = document.createElement('div'); fill.style.cssText = 'height:100%;width:0;background:#F9D58B;transition:width .15s ease'; bar.appendChild(fill);
  const lab = document.createElement('div'); lab.style.cssText = 'font-size:13px;margin-top:4px;font-weight:600';
  box.append(hint, bar, lab); document.body.appendChild(box);
  return { box, fill, lab };
}

/* ---------- boucle ---------- */
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', KeyQ: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'u', KeyW: 'u', KeyZ: 'u', ArrowDown: 'd', KeyS: 'd' };
function onKey(e, down) {
  if (!S) return;
  if (e.code === 'Escape' && down) { e.preventDefault(); e.stopImmediatePropagation(); abort(); return; }
  if (ORBIT && e.code === 'KeyC' && down) { Object.assign(S.camT, CAM_HOME); return; }
  const k = KEYMAP[e.code];
  if (k) { S.keys[k] = down; e.preventDefault(); e.stopImmediatePropagation(); }
  else if (e.code === 'Space' || e.code === 'Enter') { S.keys.hold = down; e.preventDefault(); e.stopImmediatePropagation(); }
}
function onPointer(e, type) {
  if (!S || S.finishing) return;
  const P = S.ptr;
  if (ORBIT && type === 'move' && P.orbit) {                               // clic droit maintenu : la caméra tourne autour du personnage
    S.camT.az = Math.max(CAM_AZ_MIN, Math.min(CAM_AZ_MAX, S.camT.az - (e.clientX - P.x) * 0.006)); S.camT.el = Math.max(CAM_EL_MIN, Math.min(CAM_EL_MAX, S.camT.el + (e.clientY - P.y) * 0.005));
  }
  P.x = e.clientX; P.y = e.clientY;
  if (type === 'down') { if (e.button === 2) { if (ORBIT) P.orbit = true; } else { P.down = true; P.on = true; } }
  else if (type === 'up') { if (e.button === 2) P.orbit = false; else P.down = false; }
  else if (!P.orbit) { P.on = true; P.fresh = true; }                   // la souris a bougé : elle reprend la main sur le viseur
}
function onWheel(e) { if (!S) return; S.camT.r = Math.max(CAM_R_MIN, Math.min(CAM_R_MAX, S.camT.r * Math.exp(e.deltaY * 0.0012))); e.preventDefault(); }

/** Le point (u, r) du panneau est-il posé sur le mur (case gardée) ? */
function onWall(u, r) {
  const V = S.panel.validQuad, qi = Math.min(SEG_X - 1, Math.max(0, Math.floor(u * SEG_X))), qj = Math.min(SEG_Y - 1, Math.max(0, Math.floor(r * SEG_Y)));
  return !!V[qj * SEG_X + qi];
}
/** Part du mur réellement crépie (0 → 1), sans les cases sans mur comptées d'avance. */
function progress() {
  const p = L.percent(S.cov), pre = S.pre || 0;
  return pre >= 0.999 ? p : Math.max(0, (p - pre) / (1 - pre));
}
function tick(dt) {
  const info = S.info, cam = info.camera;
  S.t += dt;
  const gk = window.GamepadKit, raw = gk && gk.raw, st = raw && raw.state ? raw.state() : { rx: 0, ry: 0 };
  // 1. viseur
  let painting = false, moved = false;
  const sv = L.stickVelocity(st.rx || 0, st.ry || 0);
  const kx = (S.keys.r ? 1 : 0) - (S.keys.l ? 1 : 0), ky = (S.keys.d ? 1 : 0) - (S.keys.u ? 1 : 0);
  const kv = L.stickVelocity(kx, ky, 0.7);
  const vx = sv.vx + kv.vx, vy = sv.vy + kv.vy;
  // l'entrée (souris, clavier, manette) déplace une CIBLE ; la main (S.cur) la rejoint en douceur : plus de saut quand la souris bouge vite
  const T = S.tgt || (S.tgt = { u: S.cur.u, r: S.cur.r });
  if (vx || vy) {                                                     // clavier / manette : la main ne sort pas de la partie du panneau posée sur le mur (pas de geste dans le vide)
    const nu = L.clamp01(T.u + vx * dt * 0.9), nr = L.clamp01(T.r + vy * dt * 0.9 * (PANEL_W / PANEL_H) * 0.6);
    if (onWall(nu, nr)) { T.u = nu; T.r = nr; } else if (onWall(nu, T.r)) T.u = nu; else if (onWall(T.u, nr)) T.r = nr;
  }
  if (sv.mag > 0.05 || (raw && raw.down && raw.down('A'))) painting = true;
  if (S.keys.hold) painting = true;
  if (vx || vy) S.ptr.fresh = false;                                 // clavier / manette en action : la souris immobile ne ramène plus la main en arrière
  if (S.ptr.on && (S.ptr.fresh || S.ptr.down)) {                     // pointeur (seulement s'il bouge ou s'il est enfoncé) : rayon caméra → panneau
    S.ptr.fresh = false;
    const nd = new THREE.Vector2((S.ptr.x / innerWidth) * 2 - 1, -(S.ptr.y / innerHeight) * 2 + 1);
    const rc = new THREE.Raycaster(); rc.setFromCamera(nd, cam);
    const h = rc.intersectObject(S.panel.mesh, false)[0];
    if (h && h.uv) { T.u = h.uv.x; T.r = 1 - h.uv.y; }
    if (S.ptr.down) painting = true;
  }
  S.cur.u = L.damp(S.cur.u, T.u, HAND_FOLLOW, dt); S.cur.r = L.damp(S.cur.r, T.r, HAND_FOLLOW, dt);
  moved = Math.hypot(S.cur.u - S.last.u, S.cur.r - S.last.r) > 1e-4;
  // 2. peinture : on comble l'espace entre deux images pour que le trait soit continu
  if (painting && moved) {
    const steps = Math.max(1, Math.ceil(Math.hypot(S.cur.u - S.last.u, (S.cur.r - S.last.r) * (PANEL_H / PANEL_W)) / 0.012));
    for (let i = 1; i <= steps; i++) {
      const u = S.last.u + (S.cur.u - S.last.u) * (i / steps), r = S.last.r + (S.cur.r - S.last.r) * (i / steps);
      L.stamp(S.cov, u, r, BRUSH_M / PANEL_W); paintMask(u, r);
    }
    S.pressed = true;
  } else if (painting && !moved) { L.stamp(S.cov, S.cur.u, S.cur.r, BRUSH_M / PANEL_W, 0.25); paintMask(S.cur.u, S.cur.r); S.pressed = true; }
  else S.pressed = false;
  S.last.u = S.cur.u; S.last.r = S.cur.r;
  // 3. le corps suit la main le long du mur (la main n'a qu'une portée d'un bras)
  panelPoint(S.cur.u, S.cur.r, S.hand);                                          // le corps ne bouge pas : seuls les bras (et, un peu, le buste et l'épaule) suivent la main
  // 3 bis. tout le corps pivote sur l'axe vertical (pieds immobiles) pour accompagner la main : douce, sans à-coup (suit la main déjà lissée)
  { const eLat = _v.a.copy(S.handSmooth).sub(info.playerPos).dot(S.right);
    const want = S.yaw0 - Math.max(-YAW_MAX, Math.min(YAW_MAX, Math.atan2(eLat, BODY_DIST + 0.25) * 1.15));
    S.yaw = L.damp(S.yaw, want, 3.2, dt); info.sm.sceneSetYaw(S.yaw); }
  // 4. bras
  S.ik = Math.min(1, S.ik + dt / 0.7);
  const e = S.ik * S.ik * (3 - 2 * S.ik);
  // appui progressif contre le mur (avant : saut de 15 cm d'un coup quand on appuie / relâche)
  S.press = L.damp(S.press || 0, S.pressed ? 1 : 0, 9, dt);
  const reach = new THREE.Vector3().copy(S.hand).addScaledVector(S.n, 0.05 - 0.025 * S.press);   // la paume frôle le mur (5 cm), et s'y appuie (2,5 cm) quand on crépit ; avant : 20 cm → 5 cm
  // la main suit sa cible comme un ressort amorti (pas d'oscillation) : départ et arrêt en douceur, vitesse continue
  const hv = S.handVel || (S.handVel = new THREE.Vector3());
  for (let left = Math.min(dt, 0.1); left > 1e-6; ) {
    const h = Math.min(left, 1 / 120); left -= h;
    const acc = _v.c.copy(reach).sub(S.handSmooth).multiplyScalar(HAND_SPRING * HAND_SPRING).addScaledVector(hv, -2 * HAND_SPRING);
    hv.addScaledVector(acc, h); S.handSmooth.addScaledVector(hv, h);
  }
  // la main n'atteint pas le mur (en haut, au loin) : le personnage s'avance sur son toron (le toron s'avance vers le mur), jusqu'à 30 cm, puis recule doucement
  { const want = Math.min(APPROACH_MAX, Math.max(0, (S.manque || 0) * 1.1));
    S.approach = L.damp(S.approach || 0, want, want > (S.approach || 0) ? 4 : 2, dt);
    const dirX = S.reachDir ? S.reachDir.x : -S.n.x, dirZ = S.reachDir ? S.reachDir.z : -S.n.z;   // vers la main (le long du toron et du mur), pas seulement droit vers le mur
    info.sm.scenePlaceXZ(S.stand.x + dirX * S.approach, S.stand.z + dirZ * S.approach); }
  applyArm(S.handSmooth, e, dt);
  for (const [b, q] of (S.bones.leftRest || [])) { b.quaternion.copy(q); b.updateWorldMatrix(false, true); }   // bras gauche : pose de repos, pas tendu
  // 5. caméra en orbite autour du personnage (clic droit + glisser, molette, stick gauche ; C ou L3 : vue de départ)
  if (ORBIT && raw && raw.justPressed && raw.justPressed('L3')) Object.assign(S.camT, CAM_HOME);
  const ox = st.lx || 0, oy = st.ly || 0;
  if (ORBIT && Math.hypot(ox, oy) > 0.2) { S.camT.az = Math.max(CAM_AZ_MIN, Math.min(CAM_AZ_MAX, S.camT.az - ox * dt * 1.8)); S.camT.el = Math.max(CAM_EL_MIN, Math.min(CAM_EL_MAX, S.camT.el + oy * dt * 1.2)); }
  const kc = 1 - Math.exp(-6 * dt);
  S.cam.az += (S.camT.az - S.cam.az) * kc; S.cam.el += (S.camT.el - S.cam.el) * kc; S.cam.r += (S.camT.r - S.cam.r) * kc;
  const pivot = new THREE.Vector3(info.playerPos.x, info.playerPos.y - 0.25, info.playerPos.z);
  // la caméra ne traverse pas un mur : si l'axe voulu est bouché, elle monte (jusqu'à 0,9 rad) pour passer au-dessus, sinon elle se rapproche
  let dir = null, dist = S.cam.r, bestD = -1;
  // repère du CORPS (il pivote pour suivre la main) : la caméra reste au-dessus de l'épaule droite au lieu de finir dans son dos
  const bodyFwd = new THREE.Vector3(Math.sin(S.yaw), 0, Math.cos(S.yaw)), bodyBack = bodyFwd.clone().negate();
  const bodyRight = new THREE.Vector3().crossVectors(bodyFwd, new THREE.Vector3(0, 1, 0)).normalize();
  for (let k = 0; k <= 6; k++) {
    const el = Math.min(1.35, S.cam.el + k * 0.15), ce = Math.cos(el);
    const d = new THREE.Vector3().addScaledVector(bodyBack, ce * Math.cos(S.cam.az)).addScaledVector(bodyRight, ce * Math.sin(S.cam.az)).add(new THREE.Vector3(0, Math.sin(el), 0));
    const h = ray(info.colliders, pivot, d, S.cam.r + 0.2).find((x) => !NOT_WALL.test(x.object.name || '') || /Toron/.test(x.object.name || ''));
    const free = h ? h.distance : S.cam.r + 0.2;
    if (free > bestD) { bestD = free; dir = d; }
    if (free >= S.cam.r + 0.15) break;
  }
  if (bestD < S.cam.r + 0.1) dist = Math.max(0.5, bestD - 0.15);
  S.camHit = L.damp(S.camHit ?? dist, dist, 10, dt);
  const camGoal = pivot.clone().addScaledVector(dir, S.camHit);
  cam.position.x = L.damp(cam.position.x, camGoal.x, 8, dt); cam.position.y = L.damp(cam.position.y, camGoal.y, 8, dt); cam.position.z = L.damp(cam.position.z, camGoal.z, 8, dt);
  const look = panelPoint(0.5, 0.5, new THREE.Vector3()).lerp(S.hand, 0.8);
  S.look.lerp(look, 1 - Math.exp(-5 * dt));
  const fov = L.damp(cam.fov, 50, 3, dt); if (Math.abs(fov - cam.fov) > 0.01) { cam.fov = fov; cam.near = 0.05; cam.updateProjectionMatrix(); }
  cam.lookAt(S.look); cam.updateMatrixWorld();
  // 6. avancement
  S.mud.set(Math.min(1, 0.55 + 0.45 * S.pc / L.DONE_AT));                         // la main est déjà sale au départ et se couvre de terre au fil du crépissage
  const real = progress();
  S.pc += (real - S.pc) * Math.min(1, dt * 6);
  const shown = Math.min(100, Math.round(S.pc / L.DONE_AT * 100));
  S.ui.fill.style.width = shown + '%'; S.ui.lab.textContent = t('Crépissage') + ' · ' + shown + ' %';
  if (!S.said.mi && shown >= 50) { S.said.mi = true; window.Tapama?.radio?.(LINES.mi); }
  if (!S.finishing && real >= L.DONE_AT) finish();
}

/* ---------- début, fin ---------- */
function cleanup(keepPanel) {
  if (!S) return;
  window.removeEventListener('keydown', S.kd, true); window.removeEventListener('keyup', S.ku, true);
  window.removeEventListener('wheel', S.wh, true); window.removeEventListener('contextmenu', S.cm, true); window.removeEventListener('pointermove', S.pm, true); window.removeEventListener('pointerdown', S.pd, true); window.removeEventListener('pointerup', S.pu, true);
  S.ui.box.remove();
  try { S.mud.dispose(); } catch (_) {}
  if (!keepPanel) { S.info.scene.remove(S.panel.mesh); S.panel.mesh.geometry.dispose(); S.panel.mesh.material.dispose(); }
}
function restoreY() { if (!S) return; S.info.playerPos.y = S.baseY; S.info.sm.scenePlaceXZ(S.stand.x, S.stand.z); S.info.sm.sceneSetYaw(S.yaw0); }
function abort() {                                   // Échap : le joueur quitte le mur (le cercle reste pour recommencer)
  if (!S || S.finishing) return;
  restoreY(); window.SanctuaryMode.endSceneHook(); cleanup(false); S = null;
  window.dispatchEvent(new CustomEvent('taama:crepissage-quitte'));
}
function chapterEnd() {                              // fin directe du chapitre 1 (comme l'ancienne fin du labo 2)
  const ls = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  ls('taama.chapitre1', 'done'); ls('taama.next', 'bandiagara'); ls('taama.acte', '5:fin');
  try { window.GameUI?.completeSequence?.(13); } catch (_) {}
  window.dispatchEvent(new CustomEvent('taama:chapitre1-fin'));
  window.dispatchEvent(new CustomEvent('taama:crepissage-fini'));
}
function finish() {
  S.finishing = true;
  const done = () => {
    blackTransition(() => { restoreY(); window.SanctuaryMode.endSceneHook(); cleanup(true); S = null; chapterEnd(); })
      .then(() => { try { window.GameUI?.show?.('carte'); } catch (e) { console.warn('[GameUI]', e); } });
  };
  if (window.Dispositif1?.radioThen) window.Dispositif1.radioThen(LINES.fin, done); else { window.Tapama?.radio?.(LINES.fin); setTimeout(done, 10000); }
}

function start() {
  const SM = window.SanctuaryMode;
  if (S || !SM || !SM.sceneInfo || !SM.beginSceneHook) return false;
  const info = SM.sceneInfo(); info.sm = SM;
  if (!info.colliders || !info.colliders.length) return false;
  const wall = findWall(info);
  if (!wall) { window.GamepadKit?.toast?.(t('Aucun mur à crépir ici.')); return false; }
  const n = wall.n;
  let eyeY = info.playerPos.y;
  // Le personnage RESTE où il est (sur son toron, posé par la fin de la vidéo) : on le tourne seulement face au mur.
  // On ne le rapproche que s'il est vraiment loin du mur, et seulement si le nouveau point a un sol à la même hauteur (sinon il tomberait du toron).
  let stand = new THREE.Vector3(info.playerPos.x, 0, info.playerPos.z);
  if (wall.dist > 1.2) {
    const cand = wall.point.clone().addScaledVector(n, BODY_DIST);
    const under = ray(info.colliders, new THREE.Vector3(cand.x, info.playerPos.y + 0.5, cand.z), new THREE.Vector3(0, -1, 0), info.eyeHeight + 1)[0];
    if (under && Math.abs(under.point.y + info.eyeHeight - info.playerPos.y) < 0.6) { stand = cand; eyeY = under.point.y + info.eyeHeight; }
  }
  SM.teleportTo(stand.x, eyeY, stand.z, Math.atan2(-n.x, -n.z));
  const fresh = SM.sceneInfo(); Object.assign(info, fresh, { sm: SM });
  info.scene = info.camera.parent || null;
  const right = new THREE.Vector3().crossVectors(n.clone().negate(), new THREE.Vector3(0, 1, 0)).normalize();
  // Le panneau se pose là où le mur EXISTE : on part de la hauteur d'épaule et on descend (jusqu'aux genoux), un peu à gauche / à droite,
  // et on garde la position où il touche le plus de mur. (Sur le toron, le pinacle s'arrête vers 16,2 m : à hauteur d'épaule le panneau était dans le vide.)
  const surfaces = wallSurfaces(info, new THREE.Vector3(wall.point.x, eyeY - 0.8, wall.point.z));
  const feetY = eyeY - info.eyeHeight;
  // On essaie plusieurs positions (hauteur, côté) et on garde celle dont le plus de surface est À LA FOIS sur le mur ET à portée de la main droite
  // (épaule droite + longueur du bras + un peu de penché du buste) : le joueur peut crépir toute la zone sans bouger les pieds.
  const pnm = THREE.PropertyBinding.sanitizeNodeName;
  const shB = info.model && info.model.getObjectByName(pnm('mixamorig:RightArm')), elB = info.model && info.model.getObjectByName(pnm('mixamorig:RightForeArm')), haB = info.model && info.model.getObjectByName(pnm('mixamorig:RightHand'));
  let shoulder = new THREE.Vector3(info.playerPos.x, eyeY - 0.25, info.playerPos.z).addScaledVector(right, 0.18), reachR = 0.62;
  if (shB && elB && haB) { info.model.updateWorldMatrix(true, true);   /* parents compris : le personnage vient d'être téléporté */ shoulder = shB.getWorldPosition(new THREE.Vector3()); const e2 = elB.getWorldPosition(new THREE.Vector3()), h2 = haB.getWorldPosition(new THREE.Vector3()); reachR = 0.95 * (shoulder.distanceTo(e2) + e2.distanceTo(h2)) + 0.3;   /* + penché et rotation du buste (mesuré : la main atteint les coins à moins de 25 cm) */ }
  shoulder.addScaledVector(n, -0.22);               // pendant le crépissage le buste se penche : l'épaule avance d'environ 22 cm vers le mur
  const sideBase = shoulder.clone().sub(wall.point).dot(right);
  const score = (p) => {                             // part des cases : sur le mur ET à portée (coin haut-gauche de chaque case)
    let s = 0; const P = p.pos, V = p.validQuad;
    for (let j = 0; j < SEG_Y; j++) for (let i = 0; i < SEG_X; i++) {
      if (!V[j * SEG_X + i]) continue; const k = (j * (SEG_X + 1) + i) * 3;
      if (Math.hypot(P[k] - shoulder.x, P[k + 1] - shoulder.y, P[k + 2] - shoulder.z) <= reachR) s++;
    }
    return s / V.length;
  };
  let panel = null, center = null, best = -1, bestValid = 0;
  for (let y = shoulder.y + 0.1; y >= feetY + 0.35 - 1e-6; y -= 0.1) {
    for (const side of [sideBase - 0.1, sideBase - 0.25, sideBase, sideBase - 0.4, sideBase + 0.1]) {
      const c = new THREE.Vector3(wall.point.x, y, wall.point.z).addScaledVector(right, side);
      const p = buildPanel(info, c, right, n, surfaces);
      const sc = score(p);
      if (sc > best + 0.01) { if (panel) disposePanel(panel); panel = p; center = c; best = sc; bestValid = p.validQuad.reduce((a, v) => a + v, 0) / p.validQuad.length; } else disposePanel(p);
    }
  }
  // la zone retenue est reconstruite SANS les cases hors de portée : pas de terre là où la main ne peut pas aller, et elles ne comptent pas dans la barre
  if (best > 0.25) { const kept = buildPanel(info, center, right, n, surfaces, (x, y, z) => Math.hypot(x - shoulder.x, y - shoulder.y, z - shoulder.z) <= reachR); disposePanel(panel); panel = kept; }
  console.info('[Crépissage] panneau posé à', center.y.toFixed(2), 'm ·', Math.round(bestValid * 100) + ' % sur le mur ·', Math.round(best * 100) + ' % sur le mur et à portée de main · portée', reachR.toFixed(2), 'm · épaule', shoulder.x.toFixed(2), shoulder.y.toFixed(2), shoulder.z.toFixed(2));
  const sc = window.MosqueScene && window.MosqueScene.scene; if (!sc) return false;
  info.scene = sc; sc.add(panel.mesh);
  const pn = THREE.PropertyBinding.sanitizeNodeName;
  const bones = { arm: info.model.getObjectByName(pn('mixamorig:RightArm')), fore: info.model.getObjectByName(pn('mixamorig:RightForeArm')), hand: info.model.getObjectByName(pn('mixamorig:RightHand')) };
  if (!bones.arm || !bones.fore || !bones.hand) bones.arm = bones.fore = bones.hand = null;
  bones.mid = info.model.getObjectByName(pn('mixamorig:RightHandMiddle1')); bones.idx = info.model.getObjectByName(pn('mixamorig:RightHandIndex1')); bones.pky = info.model.getObjectByName(pn('mixamorig:RightHandPinky1'));
  bones.clav = info.model.getObjectByName(pn('mixamorig:RightShoulder'));
  // bras gauche : on garde la pose de repos prise au début de la mission (sinon l'animation peut le laisser tendu)
  const leftBones = ['mixamorig:LeftArm', 'mixamorig:LeftForeArm', 'mixamorig:LeftHand'].map((nm) => info.model.getObjectByName(pn(nm))).filter(Boolean);   // (ne pas nommer « L » : ça masquerait le module crepissage-logic.js)
  bones.leftRest = leftBones.map((b) => [b, b.quaternion.clone()]);
  bones.spine = ['mixamorig:Spine', 'mixamorig:Spine1', 'mixamorig:Spine2'].map((nm) => info.model.getObjectByName(pn(nm))).filter(Boolean);
  S = { info, panel, n, right, stand, bones, model: info.model, cov: L.createCoverage(), cur: { u: 0.5, r: 0.5 }, last: { u: 0.5, r: 0.5 }, hand: new THREE.Vector3(), handSmooth: new THREE.Vector3(), look: new THREE.Vector3(),
    mud: addMud(info.model), baseY: eyeY, yaw0: Math.atan2(-n.x, -n.z), yaw: Math.atan2(-n.x, -n.z), pitch: 0, roll: 0, keys: {}, ptr: { x: 0, y: 0, on: false, down: false, orbit: false }, cam: { ...CAM_HOME }, camT: { ...CAM_HOME }, camHit: null, slide: 0, ik: 0, pc: 0, t: 0, said: {}, pressed: false, finishing: false, ui: buildUI() };
  for (let cy = 0; cy < L.GRID_H; cy++) for (let cx = 0; cx < L.GRID_W; cx++) {            // cases sans mur : rien à crépir, elles comptent comme couvertes
    const qi = Math.min(SEG_X - 1, Math.floor(((cx + 0.5) / L.GRID_W) * SEG_X)), qj = Math.min(SEG_Y - 1, Math.floor(((cy + 0.5) / L.GRID_H) * SEG_Y));
    if (!panel.validQuad[qj * SEG_X + qi]) S.cov.a[cy * L.GRID_W + cx] = 1;
  }
  // Avancement mesuré sur la seule partie du mur à crépir : les cases sans mur ne font plus monter la barre toutes seules.
  // Si presque tout le panneau est dans le vide (mur mal détecté), on ne compte rien d'avance : le joueur doit tout crépir.
  const validFrac = panel.validQuad.reduce((a, v) => a + v, 0) / panel.validQuad.length;
  if (validFrac < 0.1) { S.cov.a.fill(0); console.warn('[Crépissage] mur peu détecté derrière le panneau :', Math.round(validFrac * 100) + ' %'); }
  S.pre = L.percent(S.cov);
  if (!onWall(0.5, 0.5)) {                           // le centre du panneau tombe dans le vide : la main démarre sur la case de mur la plus proche du centre
    let bd = 9;
    for (let j = 0; j < SEG_Y; j++) for (let i = 0; i < SEG_X; i++) {
      if (!panel.validQuad[j * SEG_X + i]) continue; const u = (i + 0.5) / SEG_X, r = (j + 0.5) / SEG_Y, d = Math.hypot(u - 0.5, r - 0.5);
      if (d < bd) { bd = d; S.cur.u = S.last.u = u; S.cur.r = S.last.r = r; }
    }
  }
  panelPoint(S.cur.u, S.cur.r, S.hand); S.handSmooth.copy(S.hand).addScaledVector(n, 0.3); S.look.copy(S.hand);
  S.kd = (e) => onKey(e, true); S.ku = (e) => onKey(e, false);
  S.pm = (e) => onPointer(e, 'move'); S.pd = (e) => onPointer(e, 'down'); S.pu = (e) => onPointer(e, 'up');
  window.addEventListener('keydown', S.kd, true); window.addEventListener('keyup', S.ku, true);
  window.addEventListener('pointermove', S.pm, true); window.addEventListener('pointerdown', S.pd, true); window.addEventListener('pointerup', S.pu, true);
  if (ORBIT) { S.wh = onWheel; S.cm = (e) => e.preventDefault(); window.addEventListener('wheel', S.wh, { capture: true, passive: false }); window.addEventListener('contextmenu', S.cm, true); }
  // Plan de caméra comme pour le dispositif 1 : la caméra survole la mosquée et se pose sur le mur à crépir ; « Commencer » la ramène à sa place.
  const begin = () => {
    if (!S) return;
    if (!SM.beginSceneHook({ tick })) { cleanup(false); S = null; return; }
    window.Tapama?.radio?.(LINES.intro);
  };
  begin();                                   // plus de plan de caméra ici : il est joué avant, à l'approche de la mosquée (app/crepissage-cercle.js)
  return !!S;
}

window.Crepissage = { start, abort, debug() { return S ? { u: S.cur.u, r: S.cur.r, pitch: S.pitch, roll: S.roll, hand: S.handSmooth.toArray(), ik: S.ik } : null; }, get active() { return !!S; }, get percent() { return S ? progress() : 0; },
  debugPaint(u0 = 0, u1 = 1) { if (!S) return false; for (let r = 0; r <= 1.0001; r += 0.05) for (let u = u0; u <= u1; u += 0.03) { L.stamp(S.cov, u, r, BRUSH_M / PANEL_W); L.stamp(S.cov, u, r, BRUSH_M / PANEL_W); paintMask(u, r); } return L.percent(S.cov); } };
