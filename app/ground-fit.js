/* ==========================================================
   CALAGE SUR LE TERRAIN — pose un bâtiment pour qu'il ne s'enfonce pas et ne flotte pas
   ----------------------------------------------------------
   fitGround(M, cx, cz, w, d, yaw) : lance une grille de rayons verticaux sous l'emprise (w × d, tournée de `yaw`) et calcule un plan moyen
   y = a + bx·lx + bz·lz (moindres carrés) → { y, bx, bz, tilt (°), spread, min }.
   applyFit(root, fit, yaw) : place `root` à la hauteur du plan et l'incline selon la pente.
   ========================================================== */
import * as THREE from 'three';

const EXCLUDE = /^Fleuve|Glow|Points|Halo|Maison|Livre|Arbre|Plante|TD_|Tombe|Dispositif|Repere/i;

function solve3(A, B) {
  const m = A.map((r, i) => [...r, B[i]]);
  for (let c = 0; c < 3; c++) {
    let piv = c; for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    if (Math.abs(m[c][c]) < 1e-9) return null;
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  return [0, 1, 2].map((i) => m[i][3] / m[i][i]);
}

export function fitGround(M, cx, cz, w, d, yaw = 0, steps = 6) {
  const meshes = [];
  M.scene.traverse((o) => { if (o.isMesh && o.visible && !EXCLUDE.test(o.name || '')) meshes.push(o); });
  const ray = new THREE.Raycaster(), cs = Math.cos(yaw), sn = Math.sin(yaw), pts = [];
  for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
    const lx = (i / steps - 0.5) * w, lz = (j / steps - 0.5) * d;
    const x = cx + lx * cs + lz * sn, z = cz - lx * sn + lz * cs;
    ray.set(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) pts.push([lx, lz, hit.point.y]);
  }
  if (!pts.length) return { y: 0, bx: 0, bz: 0, tilt: 0, spread: 0, min: 0 };
  let n = pts.length, sx = 0, sz = 0, sxx = 0, szz = 0, sxz = 0, sy = 0, sxy = 0, szy = 0;
  for (const [x, z, y] of pts) { sx += x; sz += z; sxx += x * x; szz += z * z; sxz += x * z; sy += y; sxy += x * y; szy += z * y; }
  const sol = solve3([[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]], [sy, sxy, szy]) || [sy / n, 0, 0];
  const ys = pts.map((p) => p[2]).sort((u, v) => u - v);
  return { y: sol[0], bx: sol[1], bz: sol[2], tilt: Math.hypot(sol[1], sol[2]) * 180 / Math.PI, spread: ys[ys.length - 1] - ys[0], min: ys[0] };
}

export function applyFit(root, fit, yaw = 0) {
  const up = new THREE.Vector3(-fit.bx, 1, -fit.bz).normalize();
  const tilt = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  root.quaternion.copy(tilt.multiply(q));
}

/** Hauteur du sol sous un point (rayon vertical) : sert à poser un petit objet. */
export function groundAt(M, x, z) {
  const meshes = [];
  M.scene.traverse((o) => { if (o.isMesh && o.visible && !EXCLUDE.test(o.name || '')) meshes.push(o); });
  const hit = new THREE.Raycaster(new THREE.Vector3(x, 400, z), new THREE.Vector3(0, -1, 0)).intersectObjects(meshes, false)[0];
  return hit ? hit.point.y : 0;
}
