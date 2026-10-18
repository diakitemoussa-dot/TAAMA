/* ==========================================================
   CYCLE JOUR / NUIT — « Les Gardiens de Djenné »
   ----------------------------------------------------------
   Le soleil décrit un arc naturel :
     • lever  à l'est   (azimut 70°,  6 h)
     • zénith à midi    (hauteur 60°, 12 h)
     • coucher à l'ouest (azimut 290°, 18 h)
     • nuit : soleil sous l'horizon (18 h → 6 h)

   Le ciel 3D, la lumière du jour, l'hémisphère, l'ambiance,
   la brume, le fond et la teinte des nuages suivent la hauteur
   du soleil → lever et coucher de soleil naturels.

   DURÉE PRÉCISE : un jour complet (24 h in-game) dure 480 s
   réelles par défaut (8 min). Réglable :
     DayCycle.setDuration(secondes)
     DayCycle.setDurationMinutes(10)

   API :
     DayCycle.now()                 → heure in-game (0–24)
     DayCycle.setTime(6.05)         → aller à une heure précise
     DayCycle.setDuration(600)      → durée réelle d'un jour (s)
     DayCycle.setDurationMinutes(m)
     DayCycle.pause() / DayCycle.resume()
   ========================================================== */
import * as THREE from 'three';

const M  = window.MosqueScene;
const GS = window.GameSky;

/* ---------- Réglages du cycle ---------- */
const DAY_SECONDS = 480;    // durée réelle d'un jour complet (secondes)
const START_HOUR  = 17.0;   // départ en fin d'après-midi : le coucher arrive vite
const MAX_ELEV    = 60;     // hauteur maximale du soleil (midi), en degrés
const AZ_RISE     = 70;     // azimut du lever de soleil
const AZ_SET      = 290;    // azimut du coucher de soleil

let hour = START_HOUR;
let daySeconds = DAY_SECONDS;
let running = true;

/* ---------- Palettes [nuit, heure dorée, plein jour] ---------- */
const P = {
  sunI:     [0.0,  1.25, 1.60],    // intensité de la lumière du soleil
  hemiI:    [0.30, 1.00, 1.12],    // intensité hémisphère
  ambI:     [0.16, 0.30, 0.32],    // intensité ambiance
  haloI:    [0.0,  0.50, 0.28],    // opacité du halo solaire
  sunC:     [0xff8a4a, 0xff9a52, 0xfff3da],
  hemiSkyC: [0x1c2438, 0xffd9b0, 0xcfe2f5],
  hemiGndC: [0x12131c, 0xb98a5e, 0xd8c49a],
  ambC:     [0x2a3550, 0xfff1e0, 0xfff1e0],
  fogC:     [0x1b2233, 0xefc9a0, 0xead9b0],
  bgC:      [0x121a2c, 0xe9a06b, 0x8fb8de],
  cloudC:   [0x33405c, 0xffd2a6, 0xffffff],
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, c, t1, t2) => lerp(lerp(a, b, t1), c, t2);

const _dir = new THREE.Vector3();
const _cT  = new THREE.Color();
const _c1  = new THREE.Color(), _c2 = new THREE.Color();
function mixColor(target, trip, t1, t2){
  target.setHex(trip[0]).lerp(_c1.setHex(trip[1]), t1).lerp(_c2.setHex(trip[2]), t2);
  return target;
}

/* ---------- Position du soleil pour une heure donnée ---------- */
function elevFor(h){ return MAX_ELEV * Math.sin(Math.PI * (h - 6) / 12); }
function azFor(h){
  if (h >= 6 && h < 18) return AZ_RISE + (h - 6) / 12 * (AZ_SET - AZ_RISE);
  const hn = h < 6 ? h + 24 : h;
  return AZ_SET + (hn - 18) / 12 * (360 + AZ_RISE - AZ_SET);
}

/* ---------- Applique l'heure courante ---------- */
function apply(){
  const elev = elevFor(hour);
  const t1 = clamp01((elev + 8) / 12);      // nuit → heure dorée
  const t2 = clamp01((elev - 6) / 22);      // heure dorée → plein jour

  // 1) Soleil : ciel 3D + position de la lumière + halo (synchro via GameSky)
  _dir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(azFor(hour)));
  GS.setSunDirection(_dir.x, _dir.y, _dir.z);
  GS.setSunHaloOpacity(mix3(P.haloI[0], P.haloI[1], P.haloI[2], t1, t2) * clamp01((elev + 2) / 4));
  GS.setCloudTint(mixColor(_cT, P.cloudC, t1, t2));

  // 2) Lumières de la scène
  const L = M.sunLight, H = M.hemiLight, A = M.ambLight;
  mixColor(L.color, P.sunC, t1, t2);
  L.intensity = mix3(P.sunI[0], P.sunI[1], P.sunI[2], t1, t2);
  mixColor(H.color, P.hemiSkyC, t1, t2);
  mixColor(H.groundColor, P.hemiGndC, t1, t2);
  H.intensity = mix3(P.hemiI[0], P.hemiI[1], P.hemiI[2], t1, t2);
  mixColor(A.color, P.ambC, t1, t2);
  A.intensity = mix3(P.ambI[0], P.ambI[1], P.ambI[2], t1, t2);

  // 3) Brume + fond (visible si le ciel 3D est masqué)
  mixColor(M.scene.fog.color, P.fogC, t1, t2);
  if (M.scene.background && M.scene.background.isColor) mixColor(M.scene.background, P.bgC, t1, t2);
}

/* ---------- Démarrage ---------- */
if (!M || !M.scene || !GS || !M.sunLight){
  console.warn('[daycycle] dépendances manquantes (MosqueScene/GameSky) — cycle inactif.');
} else {
  M.addFrameHook((dt) => {
    if (!running) return;
    hour = (hour + Math.min(dt, 0.25) * 24 / daySeconds) % 24;   // dt borné (retour d'onglet)
    apply();
  });
  apply();
  console.log(`[daycycle] jour complet = ${(daySeconds / 60).toFixed(1)} min — heure de départ ${hour} h`);
}

/* ---------- API ---------- */
window.DayCycle = {
  now(){ return hour; },
  setTime(h){ hour = ((h % 24) + 24) % 24; apply(); },
  setDuration(seconds){ daySeconds = Math.max(30, seconds); },
  setDurationMinutes(minutes){ daySeconds = Math.max(30, minutes * 60); },
  get duration(){ return daySeconds; },
  get durationMinutes(){ return daySeconds / 60; },
  pause(){ running = false; },
  resume(){ running = true; },
  get running(){ return running; },
};
