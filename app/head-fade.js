import * as THREE from 'three';

/**
 * Installe la dissolution tramée (dither) de la tête sur tous les matériaux des maillages skinnés de `model`.
 * Les fragments dont les sommets sont pondérés sur les os de la tête sont retirés (discard) selon un motif tramé,
 * pilotés par un scalaire. Pas de transparence ; les ombres (matériau de profondeur) restent inchangées.
 * Retourne { setFade(v), ok, boneIndices } où v ∈ [0,1] (0 = tête visible, 1 = dissoute).
 */
export function installHeadFade(model, boneNames = ['mixamorigHead', 'mixamorigHeadTop_End']) {
  const meshes = [];
  model.traverse((o) => { if (o.isSkinnedMesh) meshes.push(o); });
  const none = { setFade() {}, ok: false, boneIndices: [] };
  if (!meshes.length) { console.warn('[HeadFade] os de la tête introuvables'); return none; }

  const uHeadFade = { value: 0 };
  const idxOf = (mesh) => {
    const bones = mesh.skeleton.bones;
    return boneNames.map((n) => bones.findIndex((b) => b.name === n)).filter((i) => i >= 0);
  };
  const first = meshes[0];
  const firstIdx = idxOf(first);
  if (!firstIdx.length) { console.warn('[HeadFade] os de la tête introuvables'); return none; }
  const sharedBones = { value: new THREE.Vector2(firstIdx[0] ?? -1, firstIdx[1] ?? -1) };

  for (const mesh of meshes) {
    let uBones = sharedBones;
    if (mesh.skeleton !== first.skeleton) {
      const ix = idxOf(mesh);
      uBones = { value: new THREE.Vector2(ix[0] ?? -1, ix[1] ?? -1) };
    }
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of mats) {
      if (!material || material.userData._headFade) continue;
      material.userData._headFade = true;
      const prev = material.onBeforeCompile;
      material.onBeforeCompile = function (shader, renderer) {
        if (prev) prev.call(this, shader, renderer);
        shader.uniforms.uHeadFade = uHeadFade;
        shader.uniforms.uHeadBones = uBones;
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec2 uHeadBones;\nvarying float vHeadW;')
          .replace('#include <skinbase_vertex>', `#include <skinbase_vertex>
#ifdef USE_SKINNING
  vHeadW = 0.0;
  vHeadW += (abs(skinIndex.x - uHeadBones.x) < 0.5 || abs(skinIndex.x - uHeadBones.y) < 0.5) ? skinWeight.x : 0.0;
  vHeadW += (abs(skinIndex.y - uHeadBones.x) < 0.5 || abs(skinIndex.y - uHeadBones.y) < 0.5) ? skinWeight.y : 0.0;
  vHeadW += (abs(skinIndex.z - uHeadBones.x) < 0.5 || abs(skinIndex.z - uHeadBones.y) < 0.5) ? skinWeight.z : 0.0;
  vHeadW += (abs(skinIndex.w - uHeadBones.x) < 0.5 || abs(skinIndex.w - uHeadBones.y) < 0.5) ? skinWeight.w : 0.0;
#else
  vHeadW = 0.0;
#endif`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uHeadFade;\nvarying float vHeadW;')
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  float hw = smoothstep(0.1, 0.6, vHeadW) * uHeadFade;
  float n = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  if (hw > n) discard;
}`);
      };
      const prevKey = material.customProgramCacheKey;
      material.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + 'headfade'; };
      material.needsUpdate = true;
    }
  }

  return {
    setFade(v) { uHeadFade.value = THREE.MathUtils.clamp(v, 0, 1); },
    ok: true,
    boneIndices: firstIdx,
  };
}
