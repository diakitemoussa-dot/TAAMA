/* ==========================================================
   CARGAISON DE LA BENNE — les caisses, bidons et la roue de secours glissent, rebondissent et se bousculent quand on roule
   ----------------------------------------------------------
   Physique simple dans le repère de la voiture (x : côté, z : avant, y : haut), un corps par objet (nœud `Cargo_*` du modèle,
   voir tools/split-car-cargo.mjs). Aucune dépendance (ni Three.js ni DOM) : testable sous Node (tests/car-cargo.test.mjs).
     · forces d'inertie : accélération → les objets glissent vers le hayon, freinage → vers la cabine, virage → vers l'extérieur ;
     · frottement de glissement (μ = 0,55) : un objet ne bouge pas tant que la voiture accélère de moins de 5,4 m/s² ;
     · cahots : au-dessus de ~5 m/s, les objets sautent de plus en plus (jusqu'à ~25 cm) et tournent en retombant ;
     · parois de la benne (rebond amorti), collisions entre objets (roulant seulement), inclinaison selon les efforts.
   ========================================================== */
export const BED = { x0: -0.80, x1: 0.80, z0: -2.58, z1: -0.80 };     // intérieur de la benne (repère voiture)
export const MU = 0.55, G = 9.8;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** items : [{ id, cx, cz, hx, hz }] (centre au repos et demi-dimensions, repère voiture). rand : () => [0,1[ (injectable pour les tests). */
export function createCargo(items, rand = Math.random) {
  const list = items.map((it) => ({ hy: Math.min(it.hx, it.hz), ...it, sx0: 0, sx1: 0, sz0: 0, sz1: 0, x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, yaw: 0, w: 0, rx: 0, rz: 0, hopT: 0.3 + rand() * 0.4 }));
  // emprise au sol de l'objet (lacet + inclinaison : une roue debout qui penche déborde de hy·sin(inclinaison)) ; MARGE : jeu avec la paroi
  const MARGE = 0.015;
  const ext = (it) => ({ ex: it.hx * Math.abs(Math.cos(it.yaw)) + it.hz * Math.abs(Math.sin(it.yaw)) + it.hy * Math.abs(Math.sin(it.rz)) + MARGE,
    ez: it.hx * Math.abs(Math.sin(it.yaw)) + it.hz * Math.abs(Math.cos(it.yaw)) + it.hy * Math.abs(Math.sin(it.rx)) + MARGE });
  for (const it of list) {                                  // débord au repos (emprise sans inclinaison) : toléré, jamais aggravé
    const ex = it.hx + MARGE, ez = it.hz + MARGE;
    it.sx0 = Math.max(0, BED.x0 + ex - it.cx); it.sx1 = Math.max(0, it.cx + ex - BED.x1);
    it.sz0 = Math.max(0, BED.z0 + ez - it.cz); it.sz1 = Math.max(0, it.cz + ez - BED.z1);
  }
  /** Garde l'objet dans la benne ; renvoie sans rien faire de plus si déjà dedans. */
  const clampToBed = (it) => {
    const { ex, ez } = ext(it);
    // bornes : la benne, élargie du léger débord de l'objet au repos dans le modèle (la roue de secours mord un peu dans la paroi gauche)
    const xmin = BED.x0 + ex - it.cx - it.sx0, xmax = BED.x1 - ex - it.cx + it.sx1, zmin = BED.z0 + ez - it.cz - it.sz0, zmax = BED.z1 - ez - it.cz + it.sz1;
    if (it.x < xmin) { it.x = xmin; if (it.vx < 0) { it.w += it.vz * 0.25; it.vx = -it.vx * 0.35; } }
    else if (it.x > xmax) { it.x = Math.max(xmin, xmax); if (it.vx > 0) { it.w -= it.vz * 0.25; it.vx = -it.vx * 0.35; } }
    if (it.z < zmin) { it.z = zmin; if (it.vz < 0) { it.w -= it.vx * 0.25; it.vz = -it.vz * 0.35; } }
    else if (it.z > zmax) { it.z = Math.max(zmin, zmax); if (it.vz > 0) { it.w += it.vx * 0.25; it.vz = -it.vz * 0.35; } }
  };
  return {
    items: list,
    /** aLong : accélération de la voiture vers l'avant (m/s²), aLat : vers sa droite (+x), speed : vitesse (m/s, signée). */
    step(dt, { aLong = 0, aLat = 0, speed = 0 } = {}) {
      dt = Math.min(dt, 0.05);
      if (dt <= 0) return;
      const hop = clamp((Math.abs(speed) - 5) / 15, 0, 1);
      const ax = -aLat, az = -aLong;                       // inertie : ce que « ressent » un objet dans le repère de la voiture
      for (const it of list) {
        const grounded = it.y <= 0.0005 && it.vy <= 0;
        if (grounded && hop > 0) {                         // cahots : un saut de temps en temps, plus souvent et plus haut quand on va vite
          it.hopT -= dt;
          if (it.hopT <= 0) {
            it.hopT = (0.12 + rand() * 0.45) / (0.35 + hop);
            if (rand() < 0.35 + 0.6 * hop) {
              it.vy = (1.0 + rand() * 1.4) * (0.45 + 0.75 * hop); it.w += (rand() - 0.5) * 4.5 * hop;
              it.vx += (rand() - 0.5) * 1.6 * hop; it.vz += (rand() - 0.5) * 1.3 * hop;
            }
          }
        }
        it.vx += ax * dt; it.vz += az * dt;
        if (grounded) {                                    // frottement de glissement
          const sp = Math.hypot(it.vx, it.vz);
          if (sp > 0) { const k = Math.max(0, sp - MU * G * dt) / sp; it.vx *= k; it.vz *= k; }
          it.w *= Math.exp(-3 * dt);
        } else it.w *= Math.exp(-0.6 * dt);
        if (it.y > 0 || it.vy > 0) {                       // vol
          it.vy -= G * dt; it.y += it.vy * dt;
          if (it.y <= 0) {
            it.y = 0;
            if (it.vy < -0.5) { it.vy = -it.vy * 0.28; it.w += (rand() - 0.5) * 2.2; it.vx += (rand() - 0.5) * 0.5; it.vz += (rand() - 0.5) * 0.5; } else it.vy = 0;
          }
        }
        it.x += it.vx * dt; it.z += it.vz * dt; it.yaw += it.w * dt;
        // inclinaison : penche dans le sens des efforts et à l'envol / à la retombée, rappel élastique (avant les parois : elle agrandit l'emprise)
        const trx = clamp(az * 0.02 + it.vy * 0.08, -0.22, 0.22), trz = clamp(-ax * 0.02 - it.vx * 0.05, -0.22, 0.22), k = 1 - Math.exp(-10 * dt);
        it.rx += (trx - it.rx) * k; it.rz += (trz - it.rz) * k;
        clampToBed(it);
      }
      if (Math.abs(speed) > 4) {                           // en roulant : les objets se bousculent (au repos certains se chevauchent dans le modèle : on ne les touche pas)
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const dx = (b.cx + b.x) - (a.cx + a.x), dz = (b.cz + b.z) - (a.cz + a.z), d = Math.hypot(dx, dz) || 1e-6;
          const r = 0.5 * (Math.min(a.hx, a.hz) + Math.min(b.hx, b.hz)) * 1.6 + 0.04;
          if (d < r) {
            const nx = dx / d, nz = dz / d, push = Math.min(r - d, 0.4 * dt) * 0.5;
            a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
            const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
            if (rv < 0) { const imp = -rv * 0.6; a.vx -= nx * imp; a.vz -= nz * imp; b.vx += nx * imp; b.vz += nz * imp; }
          }
        }
        for (const it of list) clampToBed(it);          // la poussée entre objets ne doit jamais les faire traverser une paroi
      }
    },
    reset() { for (const it of list) Object.assign(it, { x: 0, z: 0, vx: 0, vz: 0, y: 0, vy: 0, yaw: 0, w: 0, rx: 0, rz: 0 }); },
  };
}
