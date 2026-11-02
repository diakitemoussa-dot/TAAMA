/* ==========================================================
   CYCLE JOUR / NUIT — « Les Gardiens de Djenné »
   ----------------------------------------------------------
   Le soleil décrit un arc naturel :
     • lever  à l'est    (azimut 70°,  6 h)
     • zénith à midi     (hauteur 60°, 12 h)
     • coucher à l'ouest (azimut 290°, 18 h)
     • nuit : soleil sous l'horizon (18 h → 6 h)

   Détail piloté par la hauteur du soleil :
     ciel atmosphérique (brume + bleu), disque et halo solaires,
     lumière du jour (couleur + intensité + ombres), hémisphère,
     ambiance, clair de lune, étoiles (rotation céleste + scintillement),
     nappe de brume au lever, fond, teinte ET opacité des nuages,
     horloge in-game en bas à gauche.

   Deux tables d'ambiance par « clés » (hauteur du soleil en degrés) :
   AUBE (plus rose, brume matinale) et COUCHANT (plus embrasé) —
   identiques à partir de +12° pour un passage de midi invisible.

   DURÉE PRÉCISE : un jour complet (24 h in-game) = 480 s réelles
   par défaut (8 min). Réglable :
     DayCycle.setDuration(secondes) / setDurationMinutes(minutes)
     DayCycle.setSpeed(4)           → temps ×4 (ou CLIC sur l'horloge :
                                      ×1 → ×2 → ×4 → ×8 → ×1…)

   API :
     DayCycle.now()                 → heure in-game (0–24)
     DayCycle.setTime(6.05)         → aller à une heure précise
     DayCycle.setDuration(600)      → durée réelle d'un jour (s)
     DayCycle.setDurationMinutes(m)
     DayCycle.setSpeed(4)           → vitesse du temps (aussi : clic sur l'horloge)
     DayCycle.pause() / DayCycle.resume()
     DayCycle.setClockVisible(false)
   ========================================================== */
import * as THREE from 'three';

const M  = window.MosqueScene;
const GS = window.GameSky;

/* ---------- Réglages du cycle ---------- */
const DAY_SECONDS = 480;    // durée réelle d'un jour complet (secondes)
const START_HOUR  = 6.05;   // départ à l'aube : lever → jour → coucher → nuit, en boucle
const SPEEDS      = [1, 2, 4, 8];   // vitesses du temps (clic sur l'horloge)
const MAX_ELEV    = 60;     // hauteur maximale du soleil (midi), en degrés
const AZ_RISE     = 70;     // azimut du lever de soleil
const AZ_SET      = 290;    // azimut du coucher de soleil
const MOON_MAX    = 55;     // hauteur maximale de la lune

let hour = START_HOUR;
let daySeconds = DAY_SECONDS;
let speed = 1;              // multiplicateur de temps (bouton horloge)
let running = true;

/* ---------- Clés d'ambiance ---------- */
const DEF = {
  sunI: 1.5, sunC: 0xfff3da,
  hemiI: 1.1, hemiSkyC: 0xcfe2f5, hemiGndC: 0xd8c49a,
  ambI: 0.32, ambC: 0xfff1e0,
  fogC: 0xead9b0, bgC: 0x8fb8de,
  cloudC: 0xffffff, cloudO: 0.78,
  haloI: 0.28, haloScale: 0.45, haloC: 0xffffff,
  stars: 0, moonOp: 0, mist: 0,
  turbidity: 5, rayleigh: 1.9,
};
const C_FIELDS = ['sunC', 'hemiSkyC', 'hemiGndC', 'ambC', 'fogC', 'bgC', 'cloudC', 'haloC'];
function key(e, over){
  const k = Object.assign({}, DEF, over, { e });
  C_FIELDS.forEach((f) => { k[f] = new THREE.Color(k[f]); });
  return k;
}

/* Clés communes au matin et au soir (invisibles à la bascule 12 h) */
const DAY_KEYS = [
  key(12, { sunI: 1.15, sunC: 0xffa965, hemiI: 0.95, hemiSkyC: 0xffd9b0, hemiGndC: 0xb98a5e, ambI: 0.28, ambC: 0xffe9d0, fogC: 0xefc9a0, bgC: 0xe9a06b, cloudC: 0xffd2a6, cloudO: 0.72, haloI: 0.5, haloScale: 0.62, haloC: 0xffb877, turbidity: 9, rayleigh: 3.0 }),
  key(30, { sunI: 1.45, sunC: 0xffe7c0, hemiI: 1.08, hemiSkyC: 0xd8e4f2, hemiGndC: 0xd0b992, ambI: 0.31, fogC: 0xead9b0, bgC: 0x9cc0e0, cloudO: 0.75, haloI: 0.32, haloScale: 0.5, haloC: 0xffe6c0, turbidity: 6, rayleigh: 2.2 }),
  key(60, { sunI: 1.6, sunC: 0xfff3da, hemiI: 1.12, hemiSkyC: 0xcfe2f5, hemiGndC: 0xd8c49a, ambI: 0.32, cloudO: 0.78, haloI: 0.28, haloScale: 0.45, haloC: 0xfff0d8, turbidity: 5, rayleigh: 1.8 }),
];

/* Nuit commune */
const NIGHT_KEY = key(-18, { sunI: 0, hemiI: 0.3, hemiSkyC: 0x1c2438, hemiGndC: 0x12131c, ambI: 0.16, ambC: 0x2a3550, fogC: 0x1b2233, bgC: 0x0d1420, cloudC: 0x2c3a55, cloudO: 0.45, haloI: 0, haloScale: 0.4, stars: 1, moonOp: 0.95, turbidity: 6, rayleigh: 1.2 });

/* Couchant : horizon embrasé, pourpre → rouge profond */
const SET_EVENING = [
  NIGHT_KEY,
  key(-6, { sunI: 0, hemiI: 0.38, hemiSkyC: 0x2a3350, hemiGndC: 0x1c1a1a, ambI: 0.18, ambC: 0x33405c, fogC: 0x2a2b3a, bgC: 0x1a2133, cloudC: 0x565072, cloudO: 0.55, haloI: 0.04, haloScale: 0.55, haloC: 0xffd9b0, stars: 0.4, moonOp: 0.75, turbidity: 10, rayleigh: 3.0 }),
  key(-1, { sunI: 0.05, sunC: 0xff7434, hemiI: 0.5, hemiSkyC: 0x6a5a74, hemiGndC: 0x3a2e28, ambI: 0.2, ambC: 0x4a4258, fogC: 0x7a5f5e, bgC: 0x9a5a50, cloudC: 0xa87e86, cloudO: 0.62, haloI: 0.32, haloScale: 0.75, haloC: 0xffb070, stars: 0.12, moonOp: 0.3, turbidity: 12, rayleigh: 4.2 }),
  key(3, { sunI: 0.55, sunC: 0xff7f3f, hemiI: 0.72, hemiSkyC: 0xff9f70, hemiGndC: 0x8a6a50, ambI: 0.24, ambC: 0xffd0b0, fogC: 0xe8a878, bgC: 0xe08a58, cloudC: 0xff9f70, cloudO: 0.7, haloI: 0.6, haloScale: 0.75, haloC: 0xff8f4a, moonOp: 0.06, turbidity: 11, rayleigh: 3.8 }),
  ...DAY_KEYS,
];

/* Aube : plus rose, brume dans les rues (mist) */
const SET_MORNING = [
  NIGHT_KEY,
  key(-6, { sunI: 0, hemiI: 0.38, hemiSkyC: 0x2e3a58, hemiGndC: 0x201e20, ambI: 0.18, ambC: 0x36425e, fogC: 0x2c2f42, bgC: 0x1c2438, cloudC: 0x5a5a7a, cloudO: 0.55, haloI: 0.04, haloScale: 0.55, haloC: 0xffd9b0, stars: 0.4, moonOp: 0.75, turbidity: 10, rayleigh: 3.2 }),
  key(-1, { sunI: 0.05, sunC: 0xff8050, hemiI: 0.5, hemiSkyC: 0x7a6480, hemiGndC: 0x40342c, ambI: 0.2, ambC: 0x504a60, fogC: 0x8a6a68, bgC: 0xb07060, cloudC: 0xbf8f96, cloudO: 0.62, haloI: 0.32, haloScale: 0.75, haloC: 0xffbc86, stars: 0.12, moonOp: 0.3, turbidity: 12, rayleigh: 3.6, mist: 0.5 }),
  key(3, { sunI: 0.55, sunC: 0xff9a55, hemiI: 0.72, hemiSkyC: 0xffb693, hemiGndC: 0x907058, ambI: 0.24, ambC: 0xffd8c0, fogC: 0xe8b48e, bgC: 0xdf9d78, cloudC: 0xffb693, cloudO: 0.7, haloI: 0.6, haloScale: 0.75, haloC: 0xffa060, moonOp: 0.06, turbidity: 11, rayleigh: 3.4, mist: 0.55 }),
  ...DAY_KEYS,
];

/* ---------- Utilitaires ---------- */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const _dir = new THREE.Vector3();
const _moon = new THREE.Vector3();
const _cT = new THREE.Color();
function mixC(target, a, b, t){ return target.copy(a).lerp(b, t); }

function elevFor(h){ return MAX_ELEV * Math.sin(Math.PI * (h - 6) / 12); }
function azFor(h){
  if (h >= 6 && h < 18) return AZ_RISE + (h - 6) / 12 * (AZ_SET - AZ_RISE);
  const hn = h < 6 ? h + 24 : h;
  return AZ_SET + (hn - 18) / 12 * (360 + AZ_RISE - AZ_SET);
}

/* ---------- Horloge in-game (chip bas-gauche au-dessus des boutons) ---------- */
const CLOCK_ICON_DAY   = '\u2600';   // ☀
const CLOCK_ICON_NIGHT = '\u263E';   // ☾
let clockTxtEl = null, clockIcoEl = null, clockSpdEl = null, lastClockTxt = '';
const clockEl = document.createElement('div');
clockEl.className = 'dc-clock';
clockIcoEl = document.createElement('i');
clockTxtEl = document.createElement('span');
clockSpdEl = document.createElement('em');
clockEl.appendChild(clockIcoEl);
clockEl.appendChild(clockTxtEl);
clockEl.appendChild(clockSpdEl);
clockEl.title = 'Vitesse du temps — cliquer pour accélérer';
clockEl.addEventListener('click', (e) => {
  e.stopPropagation();
  const i = SPEEDS.indexOf(speed);
  speed = SPEEDS[(i + 1) % SPEEDS.length];   // ×1 → ×2 → ×4 → ×8 → ×1…
  lastClockTxt = '';                          // force la mise à jour de l'affichage
});
(document.getElementById('mosqueStage') || document.body).appendChild(clockEl);

/* ---------- Application de l'ambiance ---------- */
function apply(){
  const elev = elevFor(hour);
  const az = azFor(hour);

  // Clés interpolées selon la hauteur du soleil (table aube ou couchant)
  const KEYS = hour < 12 ? SET_MORNING : SET_EVENING;
  let i = 0;
  while (i < KEYS.length - 2 && elev > KEYS[i + 1].e) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const t = smooth((elev - A.e) / (B.e - A.e));

  // 1) Soleil : ciel, lumière, halo
  _dir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(az));
  GS.setSunDirection(_dir.x, _dir.y, _dir.z);
  GS.setAtmosphere(lerp(A.turbidity, B.turbidity, t), lerp(A.rayleigh, B.rayleigh, t));
  GS.setSunHaloOpacity(lerp(A.haloI, B.haloI, t) * clamp01((elev + 2) / 4));
  GS.setSunHaloScale(lerp(A.haloScale, B.haloScale, t));
  GS.setSunHaloColor(mixC(_cT, A.haloC, B.haloC, t));

  // 2) Lune : opposée au soleil, visible la nuit
  const moonOp = lerp(A.moonOp, B.moonOp, t);
  const moonElev = Math.min(MOON_MAX, -elev);
  _moon.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - moonElev), THREE.MathUtils.degToRad((az + 180) % 360));
  GS.setMoonDirection(_moon.x, _moon.y, _moon.z);
  GS.setMoonOpacity(moonOp);
  const ML = M.moonLight;
  if (ML){
    ML.position.copy(_moon).multiplyScalar(354);
    ML.intensity = moonOp * 0.26;
  }

  // 3) Étoiles : opacité + rotation céleste (1 tour par jour in-game)
  const tw = 0.92 + 0.08 * Math.sin(performance.now() * 0.0011);   // scintillement doux
  GS.setStarsOpacity(lerp(A.stars, B.stars, t) * tw);
  GS.setStarsAngle(hour / 24 * Math.PI * 2);

  // 4) Lumières de la scène
  const L = M.sunLight, H = M.hemiLight, Am = M.ambLight;
  mixC(L.color, A.sunC, B.sunC, t);
  L.intensity = lerp(A.sunI, B.sunI, t);
  mixC(H.color, A.hemiSkyC, B.hemiSkyC, t);
  mixC(H.groundColor, A.hemiGndC, B.hemiGndC, t);
  H.intensity = lerp(A.hemiI, B.hemiI, t);
  mixC(Am.color, A.ambC, B.ambC, t);
  Am.intensity = lerp(A.ambI, B.ambI, t);

  // 5) Nuages : teinte + opacité
  GS.setCloudTint(mixC(_cT, A.cloudC, B.cloudC, t));
  GS.setCloudOpacity(lerp(A.cloudO, B.cloudO, t));

  // 6) Brume + fond (mist : nappe de brume au petit matin)
  mixC(M.scene.fog.color, A.fogC, B.fogC, t);
  const baseFar = M.fogFarBase || (M.domeRadius || 400) * 0.95;
  const mist = lerp(A.mist, B.mist, t);
  M.scene.fog.far = Math.max(M.scene.fog.near * 1.25, baseFar * (1 - 0.3 * mist));
  if (M.scene.background && M.scene.background.isColor) mixC(M.scene.background, A.bgC, B.bgC, t);

  // 7) Horloge in-game
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const txt = (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm;
  if (txt !== lastClockTxt){
    lastClockTxt = txt;
    clockTxtEl.textContent = txt;
    clockIcoEl.textContent = elev > 0 ? CLOCK_ICON_DAY : CLOCK_ICON_NIGHT;
    clockSpdEl.textContent = speed > 1 ? '×' + speed : '';
  }
}

/* ---------- Démarrage ---------- */
if (!M || !M.scene || !GS || !M.sunLight){
  console.warn('[daycycle] dépendances manquantes (MosqueScene/GameSky) — cycle inactif.');
} else {
  M.addFrameHook((dt) => {
    if (!running) return;
    hour = (hour + Math.min(dt, 0.25) * speed * 24 / daySeconds) % 24;   // dt borné (retour d'onglet)
    apply();
  });
  apply();
  console.log(`[daycycle] jour complet = ${(daySeconds / 60).toFixed(1)} min — heure de départ ${hour} h`);
}

/* ---------- API ---------- */
window.DayCycle = {
  now(){ return hour; },
  get sunElevation(){ return elevFor(hour); },     // hauteur du soleil en degrés (négative la nuit) — lampadaires, etc.
  setTime(h){ hour = ((h % 24) + 24) % 24; apply(); },
  setDuration(seconds){ daySeconds = Math.max(30, seconds); },
  setDurationMinutes(minutes){ daySeconds = Math.max(30, minutes * 60); },
  get duration(){ return daySeconds; },
  get durationMinutes(){ return daySeconds / 60; },
  pause(){ running = false; },
  resume(){ running = true; },
  get running(){ return running; },
  setSpeed(mult){ const v = Number(mult); speed = (v > 0 ? v : 1); lastClockTxt = ''; },
  get speed(){ return speed; },
  setClockVisible(on){ clockEl.style.display = on ? '' : 'none'; },
};
