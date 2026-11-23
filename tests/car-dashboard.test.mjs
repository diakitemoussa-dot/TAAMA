/**
 * Tests unitaires du tableau de bord de la voiture (logique pure).
 * Usage : node --test tests/car-dashboard.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { guideTone, speedKmh, speedNeedleAngle, gearOf, blinkerState, fuelAfter, scaleFor, bottomFor, heightScale, guideText, SPEED_MAX_KMH, FUEL_FLOOR, PANEL_W, MIN_HEIGHT_SCALE } from '../app/car-dashboard.js';
import { gaugeAngle, isUTurn, relativeDeg } from '../app/route-arrow.js';

test('speedKmh : m/s -> km/h, valeur absolue', () => { assert.equal(speedKmh(10), 36); assert.equal(speedKmh(-5), 18); });

test('speedNeedleAngle : -135° à l\'arrêt, +135° en fin d\'échelle, borné', () => {
  assert.equal(speedNeedleAngle(0), -135);
  assert.equal(speedNeedleAngle(SPEED_MAX_KMH), 135);
  assert.equal(speedNeedleAngle(SPEED_MAX_KMH / 2), 0);
  assert.equal(speedNeedleAngle(500), 135); assert.equal(speedNeedleAngle(-3), -135);
});

test('gearOf : R, N, puis 1 à 4 selon la vitesse', () => {
  assert.equal(gearOf('N', -3), 'R');
  assert.equal(gearOf('R', 0), 'N');
  assert.equal(gearOf('N', 5 / 3.6), 1);
  assert.equal(gearOf(1, 20 / 3.6), 2);
  assert.equal(gearOf(1, 40 / 3.6), 3);
  assert.equal(gearOf(1, 60 / 3.6), 4);
});

test('gearOf : hystérésis, pas de va-et-vient autour d\'un seuil', () => {
  assert.equal(gearOf(2, 13 / 3.6), 2);      // sous 14 mais au-dessus de 12 : on garde le 2
  assert.equal(gearOf(2, 11 / 3.6), 1);
  assert.equal(gearOf(1, 13 / 3.6), 1);      // monte seulement à 14
  // une accélération continue de 0 à 72 km/h ne redescend jamais de rapport
  let g = 'N', last = 0;
  for (let k = 0; k <= 72; k += 0.5) { g = gearOf(g, k / 3.6); if (typeof g === 'number') { assert.ok(g >= last); last = g; } }
  assert.equal(g, 4);
});

test('blinkerState : braquage, détresse, annonce de virage, phase éteinte', () => {
  assert.deepEqual(blinkerState({ steer: 0.5, phase: true }), { left: 'on', right: 'off' });      // steer > 0 = gauche
  assert.deepEqual(blinkerState({ steer: -0.5, phase: true }), { left: 'off', right: 'on' });
  assert.deepEqual(blinkerState({ steer: 0.05, phase: true }), { left: 'off', right: 'off' });    // sous le seuil
  assert.deepEqual(blinkerState({ hazard: true, phase: true }), { left: 'on', right: 'on' });
  assert.deepEqual(blinkerState({ hazard: true, phase: false }), { left: 'off', right: 'off' });  // phase éteinte du clignotement
  assert.deepEqual(blinkerState({ turn: { dist: 60, deg: 90 } }), { left: 'off', right: 'hint' });
  assert.deepEqual(blinkerState({ turn: { dist: 60, deg: -90 } }), { left: 'hint', right: 'off' });
  assert.deepEqual(blinkerState({ turn: { dist: 200, deg: 90 } }), { left: 'off', right: 'off' }); // trop loin
  assert.deepEqual(blinkerState({ turn: { dist: 30, deg: 20 } }), { left: 'off', right: 'off' });  // pas un vrai virage
  assert.deepEqual(blinkerState({ steer: 0.5, phase: false, turn: { dist: 30, deg: -90 } }), { left: 'hint', right: 'off' });
});

test('fuelAfter : baisse lente avec la distance, jamais sous le plancher ni au-dessus de 1', () => {
  assert.ok(fuelAfter(1, 250) < 1 && fuelAfter(1, 250) > 0.98);
  assert.equal(fuelAfter(1, 1e9), FUEL_FLOOR);
  assert.equal(fuelAfter(1, -50) <= 1, true);
  assert.equal(fuelAfter(0.5, 0), 0.5);
});

test('scaleFor : 1 sur grand écran, réduit sur petit écran, jamais sous 0,4', () => {
  assert.equal(scaleFor(1920), 1);
  assert.ok(Math.abs(scaleFor(PANEL_W + 16) - 1) < 1e-9);
  assert.ok(scaleFor(400) < 1 && scaleFor(400) > 0.4);
  assert.equal(scaleFor(100), 0.4);
});

test('scaleFor : la hauteur compte (téléphone en paysage : large mais peu haut)', () => {
  assert.equal(scaleFor(1920, PANEL_W, 1080), 1);                       // grand écran : inchangé
  assert.equal(scaleFor(1920, PANEL_W, 700), 1);                        // dès 700 px de haut : taille pleine
  assert.ok(scaleFor(1270, PANEL_W, 577) < 0.75);                       // fenêtre peu haute : nettement réduit
  assert.ok(scaleFor(850, PANEL_W, 385) < 0.45);                        // paysage de téléphone : très réduit
  assert.ok(scaleFor(900, PANEL_W, 400) < scaleFor(900, PANEL_W, 577)); // plus bas = plus petit
  assert.equal(scaleFor(2000, PANEL_W, 100), MIN_HEIGHT_SCALE);         // plancher dû à la hauteur
  assert.equal(scaleFor(500, PANEL_W, Infinity), scaleFor(500));        // sans hauteur : comportement d'avant
});

test('heightScale : continue et croissante, 1 à partir de 700 px', () => {
  assert.equal(heightScale(), 1);
  assert.equal(heightScale(700), 1);
  let prev = 0;
  for (let vh = 300; vh <= 700; vh += 20) { const s = heightScale(vh); assert.ok(s >= prev - 1e-9 && s <= 1 && s >= MIN_HEIGHT_SCALE - 1e-9, `vh=${vh}`); prev = s; }
});

test('bottomFor : 92 px sur grand écran, jusqu\'à 10 px sur écran peu haut', () => {
  assert.equal(bottomFor(), 92);
  assert.equal(bottomFor(1080), 92);
  assert.ok(bottomFor(577) < 92 && bottomFor(577) > 10);
  assert.equal(bottomFor(400), 10);
});

test('guideText : sans itinéraire, hors route, demi-tour, tout droit, virage', () => {
  assert.equal(guideText(null).dist, '—');
  assert.equal(guideText({ active: false }).dist, '—');
  const base = { active: true, off: false, bearing: 0, heading: 0, remaining: 480, offRoute: 0, turn: null };
  assert.deepEqual(guideText(base), { dist: '480 m', sub: 'Tout droit', uturn: false });
  assert.equal(guideText({ ...base, turn: { dist: 43, deg: 90 } }).sub, 'À droite dans 40 m');
  assert.deepEqual(guideText({ ...base, bearing: Math.PI }), { dist: '480 m', sub: 'Demi-tour', uturn: true });
  assert.equal(guideText({ ...base, off: true, offRoute: 60 }).sub, 'Reviens sur la route');
});

test('gaugeAngle / isUTurn / relativeDeg : demi-cercle borné à ±90°, demi-tour au-delà de 110°', () => {
  assert.equal(gaugeAngle(30), 30); assert.equal(gaugeAngle(150), 90); assert.equal(gaugeAngle(-170), -90);
  assert.equal(isUTurn(109), false); assert.equal(isUTurn(111), true); assert.equal(isUTurn(-120), true);
  assert.ok(Math.abs(relativeDeg(Math.PI / 2, 0) - 90) < 1e-9);          // but à l'est, cap nord : à droite
  assert.ok(Math.abs(relativeDeg(0, Math.PI / 2) + 90) < 1e-9);          // but au nord, cap est : à gauche
  assert.ok(Math.abs(relativeDeg(0.1, 2 * Math.PI - 0.1) - 11.459) < 0.01);   // passage par 0 : le plus court chemin
});

test('guideTone : vert-jaune sur la bonne voie, rouge à contresens ou hors route, jaune entre les deux', () => {
  assert.equal(guideTone('ok', 0), 'good'); assert.equal(guideTone('ok', 24), 'good'); assert.equal(guideTone('ok', -24), 'good');
  assert.equal(guideTone('ok', 50), 'ok');
  assert.equal(guideTone('ok', 80), 'bad'); assert.equal(guideTone('ok', -170), 'bad');
  assert.equal(guideTone('good', 5, true), 'bad');                         // hors route : rouge
});
test('guideTone : hystérésis, pas de papillotement autour des seuils', () => {
  assert.equal(guideTone('good', 30), 'good');                              // entre 25 et 38 : on reste vert
  assert.equal(guideTone('ok', 30), 'ok');
  assert.equal(guideTone('good', 40), 'ok');
  assert.equal(guideTone('bad', 65), 'bad');                                // entre 58 et 75 : on reste rouge
  assert.equal(guideTone('ok', 65), 'ok');
  assert.equal(guideTone('bad', 50), 'ok');
  let t = 'ok', changes = 0; for (let i = 0; i < 100; i++) { const n = guideTone(t, 30 + (i % 2 ? 4 : -4)); if (n !== t) changes++; t = n; }
  assert.ok(changes <= 1, `${changes} changements autour de 30°`);
});

test('roadProject / roadRibbon : perspective (la route rétrécit au loin, s’arrête derrière la voiture)', async () => {
  const { roadProject, roadRibbon, ROAD } = await import('../app/car-dashboard.js');
  const [x0, y0] = roadProject(0, 0); assert.equal(x0, 95); assert.equal(y0, ROAD.yCar);
  const far = roadProject(1000, 0); assert.ok(far[1] < ROAD.yCar && far[1] > ROAD.yHorizon);
  assert.ok(Math.abs(roadProject(100, 5)[0] - 95) < Math.abs(roadProject(5, 5)[0] - 95));      // même écart latéral : plus petit au loin
  const rb = roadRibbon([[0, 0], [50, 0], [100, 10]]); assert.ok(rb.poly.startsWith('M') && rb.poly.endsWith('Z') && rb.mid.startsWith('M'));
  assert.equal(roadRibbon([[0, 0]]).poly, '');
  const back = roadRibbon([[0, 0], [20, 0], [-30, 0]]); assert.ok(back.mid.split('L').length <= 8);      // la partie derrière la voiture n’est pas dessinée
});
