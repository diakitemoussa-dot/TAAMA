/**
 * Retargeting d'animations Mixamo entre deux squelettes de même hiérarchie (mêmes noms d'os) mais de pose de repos différente
 * (ex. ancien personnage en pose en A, nouveau en pose en T). Les rotations locales ne sont donc pas transférables telles quelles
 * (écart de repos jusqu'à 36° aux bras) : on transfère l'écart *dans le repère monde*.
 *
 *   rotation monde animée (source) = Wa      rotation monde au repos (source) = Rs      rotation monde au repos (cible) = Rt
 *   D = Wa · Rs⁻¹                              (ce que l'animation fait tourner l'os, vu du monde)
 *   rotation monde voulue (cible) = D · Rt     puis  locale = (monde du parent déjà animé)⁻¹ · voulue
 *   bassin : le déplacement monde par rapport au repos est mis à l'échelle (taille du bassin cible / source).
 *
 * Fonctions pures de la géométrie ; les accesseurs glTF sont créés dans le document cible.
 */
import * as THREE from 'three';

/** Os dont la DIRECTION est recopiée de la source (os -> enfant) : quand les poses de repos diffèrent (bras à 45° vs à l'horizontale), appliquer
 *  seulement l'écart de rotation donne une autre direction finale ; on corrige donc par une rotation minimale vers la direction de la source.
 *  La torsion autour de l'axe de l'os reste celle de l'écart. */
const DIR_BONES = {};
for (const side of ['Left', 'Right']) {
  DIR_BONES[`mixamorig:${side}Arm`] = `mixamorig:${side}ForeArm`;
  DIR_BONES[`mixamorig:${side}ForeArm`] = `mixamorig:${side}Hand`;
  DIR_BONES[`mixamorig:${side}Hand`] = `mixamorig:${side}HandMiddle1`;
  DIR_BONES[`mixamorig:${side}UpLeg`] = `mixamorig:${side}Leg`;
  DIR_BONES[`mixamorig:${side}Leg`] = `mixamorig:${side}Foot`;
  DIR_BONES[`mixamorig:${side}Foot`] = `mixamorig:${side}ToeBase`;
}
export const retargetDirBones = DIR_BONES;
const depthOf = (n) => { let d = 0; for (let x = n.getParentNode(); x; x = x.getParentNode()) d++; return d; };

/** Arbre three.js miroir d'un document glTF (transformations locales de repos). Retourne { objs: Map<nom, Object3D>, byNode: Map<Node, Object3D>, root }. */
export function mirrorTree(doc) {
  const root = new THREE.Object3D();
  const byNode = new Map(), objs = new Map();
  const nodes = doc.getRoot().listNodes();
  for (const n of nodes) {
    const o = new THREE.Object3D();
    o.position.fromArray(n.getTranslation()); o.quaternion.fromArray(n.getRotation()); o.scale.fromArray(n.getScale());
    byNode.set(n, o); if (!objs.has(n.getName())) objs.set(n.getName(), o);
  }
  for (const n of nodes) { const p = n.getParentNode(); (p ? byNode.get(p) : root).add(byNode.get(n)); }
  root.updateMatrixWorld(true);
  return { root, byNode, objs, nodes };
}

/** Échantillonne une piste de rotation (interpolation sphérique) à l'instant t ; dest reçoit le résultat. Les pistes optimisées (2 images) valent aussi pour tout t. */
function bracket(tr, t) {
  const T = tr.times, n = T.length;
  if (n === 1 || t <= T[0]) return [0, 0, 0];
  if (t >= T[n - 1]) return [n - 1, n - 1, 0];
  let i = 0; while (i < n - 2 && T[i + 1] < t) i++;
  return [i, i + 1, (t - T[i]) / (T[i + 1] - T[i])];
}
function sampleAt(tr, t, out, tmp) {
  const [i, j, a] = bracket(tr, t);
  out.fromArray(tr.values, i * 4);
  if (j !== i && a > 0) { tmp.fromArray(tr.values, j * 4); out.slerp(tmp, a); }
  return true;
}
function sampleVec(tr, t, out) {
  const [i, j, a] = bracket(tr, t);
  out.fromArray(tr.values, i * 3);
  if (j !== i && a > 0) { out.x += (tr.values[j * 3] - out.x) * a; out.y += (tr.values[j * 3 + 1] - out.y) * a; out.z += (tr.values[j * 3 + 2] - out.z) * a; }
}

const sampleOf = (ch) => { const s = ch.getSampler(); return { times: s.getInput().getArray(), values: s.getOutput().getArray(), size: s.getOutput().getElementSize(), interp: s.getInterpolation() }; };

/**
 * Crée dans docT une animation `outName` qui rejoue `animS` (document docS) sur le squelette de docT.
 * Os appariés par nom (préfixe `mixamorig:`). Écrit une rotation par os et la translation du bassin (`mixamorig:Hips`).
 * opts.pelvisScale : échelle du déplacement du bassin (défaut : rapport des hauteurs de bassin cible / source).
 */
export function retargetAnimation(docS, animS, docT, outName, opts = {}) {
  const S = mirrorTree(docS), T = mirrorTree(docT);
  const names = [...S.objs.keys()].filter((k) => /^mixamorig:/.test(k) && T.objs.has(k));
  const tNodes = new Map(docT.getRoot().listNodes().map((n) => [n.getName(), n]));
  // ordre parents -> enfants dans la cible
  names.sort((a, b) => depthOf(tNodes.get(a)) - depthOf(tNodes.get(b)));
  // rotations monde au repos
  const restS = new Map(), restT = new Map(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3();
  for (const k of names) { restS.set(k, S.objs.get(k).getWorldQuaternion(new THREE.Quaternion())); restT.set(k, T.objs.get(k).getWorldQuaternion(new THREE.Quaternion())); }
  const hipsS = S.objs.get('mixamorig:Hips'), hipsT = T.objs.get('mixamorig:Hips');
  const hipsRestS = hipsS.getWorldPosition(new THREE.Vector3()), hipsRestT = hipsT.getWorldPosition(new THREE.Vector3());
  const pelvisScale = opts.pelvisScale ?? (hipsRestT.y / hipsRestS.y);

  // canaux de la source, par os
  const rot = new Map(), pos = new Map();
  for (const ch of animS.listChannels()) {
    const nm = ch.getTargetNode().getName(); if (!S.objs.has(nm)) continue;
    if (ch.getTargetPath() === 'rotation') rot.set(nm, sampleOf(ch));
    else if (ch.getTargetPath() === 'translation') pos.set(nm, sampleOf(ch));
  }
  const ref = rot.get('mixamorig:Hips'); if (!ref) throw new Error(`${animS.getName()} : pas de rotation du bassin`);
  const times = Array.from(ref.times), nF = times.length;

  const outRot = new Map(names.map((k) => [k, new Float32Array(nF * 4)])), outPos = new Float32Array(nF * 3);
  const dT = new THREE.Vector3(), sw = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), Wa = new THREE.Quaternion(), D = new THREE.Quaternion(), want = new THREE.Quaternion(), pW = new THREE.Quaternion(), pos3 = new THREE.Vector3();
  for (let f = 0; f < nF; f++) {
    // 1. pose source à l'image f
    for (const [k, r] of rot) sampleAt(r, times[f], qa, qb) && S.objs.get(k).quaternion.copy(qa);
    for (const [k, p] of pos) { sampleVec(p, times[f], pos3); S.objs.get(k).position.copy(pos3); }
    S.root.updateMatrixWorld(true);
    // 2. pose cible : repos, puis os par os (parents d'abord)
    for (const k of names) { const o = T.objs.get(k), n = tNodes.get(k); o.quaternion.fromArray(n.getRotation()); o.position.fromArray(n.getTranslation()); }
    T.root.updateMatrixWorld(true);
    for (const k of names) {
      Wa.copy(S.objs.get(k).getWorldQuaternion(tmpQ));
      D.copy(Wa).multiply(restS.get(k).clone().invert());
      want.copy(D).multiply(restT.get(k));
      const ck = DIR_BONES[k];
      if (ck && S.objs.has(ck) && T.objs.has(ck) && !opts.deltaOnly) {
        const dS = S.objs.get(ck).getWorldPosition(tmpP).sub(S.objs.get(k).getWorldPosition(pos3)).normalize();
        const d1 = dT.copy(T.objs.get(ck).position).normalize().applyQuaternion(want);
        want.premultiply(sw.setFromUnitVectors(d1, dS));
      }
      const o = T.objs.get(k);
      o.parent.updateWorldMatrix(true, false);
      o.parent.getWorldQuaternion(pW);
      o.quaternion.copy(pW.invert().multiply(want));
      if (k === 'mixamorig:Hips') {
        const wp = hipsS.getWorldPosition(tmpP).sub(hipsRestS).multiplyScalar(pelvisScale).add(hipsRestT);
        pos3.copy(wp); o.parent.worldToLocal(pos3); o.position.copy(pos3);
      }
      o.updateMatrixWorld(true);
      o.quaternion.toArray(outRot.get(k), f * 4);
      if (k === 'mixamorig:Hips') o.position.toArray(outPos, f * 3);
    }
  }
  // 3. animation glTF dans docT
  const buf = docT.getRoot().listBuffers()[0] || docT.createBuffer();
  const anim = docT.createAnimation(outName);
  const input = docT.createAccessor(`${outName}_t`).setType('SCALAR').setArray(new Float32Array(times)).setBuffer(buf);
  const add = (node, path, array, type) => {
    const out = docT.createAccessor(`${outName}_${node.getName()}_${path}`).setType(type).setArray(array).setBuffer(buf);
    const sampler = docT.createAnimationSampler().setInput(input).setOutput(out).setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(docT.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler));
  };
  for (const k of names) add(tNodes.get(k), 'rotation', outRot.get(k), 'VEC4');
  add(tNodes.get('mixamorig:Hips'), 'translation', outPos, 'VEC3');
  return { anim, frames: nF, duration: times[nF - 1], pelvisScale, bones: names.length };
}
