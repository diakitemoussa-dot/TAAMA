/**
 * Tests unitaires de la flèche-guide de l'itinéraire (logique pure).
 * Usage : node --test tests/route-arrow.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { routeMetrics, pointAt, projectOnRoute, bearingTo, relativeAngle, smoothAngle, nextTurn, guideState, turnLabel, lookAhead,
  LOOK_AHEAD, OFF_ROUTE, ARRIVED } from '../app/route-arrow.js';
import { createRouter, PLACES } from '../app/city-routes.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
// route en « L » : 100 m vers le nord, puis 100 m vers l'est
const L = [[0, 0], [0, 100], [100, 100]];

test('routeMetrics : longueurs cumulées et total', () => {
  const m = routeMetrics(L);
  assert.deepEqual(m.cum, [0, 100, 200]); assert.equal(m.total, 200);
});

test('pointAt : début, milieu d’un tronçon, après le virage, borné', () => {
  assert.deepEqual([pointAt(L, 0).e, pointAt(L, 0).n], [0, 0]);
  const a = pointAt(L, 50); close(a.e, 0); close(a.n, 50);
  const b = pointAt(L, 150); close(b.e, 50); close(b.n, 100);
  const c = pointAt(L, 999); close(c.e, 100); close(c.n, 100);
  const d = pointAt(L, -5); close(d.e, 0); close(d.n, 0);
});

test('projectOnRoute : abscisse le long de la route et écart', () => {
  const p = projectOnRoute(L, 12, 40);                 // à 12 m à l'est du premier tronçon, à mi-chemin
  close(p.along, 40); close(p.dist, 12); assert.equal(p.seg, 0);
  const q = projectOnRoute(L, 60, 90);                 // sous le second tronçon
  close(q.along, 160); close(q.dist, 10); assert.equal(q.seg, 1);
  const r = projectOnRoute(L, -30, -30);               // avant le départ : ramené au début
  close(r.along, 0);
});

test('bearingTo / relativeAngle : nord = 0, est = 90°, et angle relatif au cap de la caméra', () => {
  close(bearingTo({ e: 0, n: 0 }, { e: 0, n: 10 }), 0);
  close(bearingTo({ e: 0, n: 0 }, { e: 10, n: 0 }), Math.PI / 2);
  close(relativeAngle(0, { e: 0, n: 0 }, { e: 10, n: 0 }), 90);                 // caméra au nord, but à l'est : à droite
  close(relativeAngle(Math.PI / 2, { e: 0, n: 0 }, { e: 10, n: 0 }), 0);       // caméra à l'est : tout droit
  close(relativeAngle(Math.PI / 2, { e: 0, n: 0 }, { e: 0, n: 10 }), -90);     // caméra à l'est, but au nord : à gauche
  close(Math.abs(relativeAngle(0, { e: 0, n: 0 }, { e: 0, n: -10 })), 180);    // derrière
});

test('smoothAngle : chemin le plus court, converge sans dépasser, dt = 0 immobile', () => {
  assert.equal(smoothAngle(30, 90, 0), 30);
  let a = 170; for (let i = 0; i < 120; i++) a = smoothAngle(a, -170, 1 / 60);   // 170° -> -170° : 20° par la droite, pas 340°
  assert.ok(Math.abs(((a + 180) % 360 + 360) % 360 - 190) < 1 || Math.abs(a + 170) < 1 || Math.abs(a - 190) < 1, `a = ${a}`);
  let b = 0; for (let i = 0; i < 90; i++) { const n = smoothAngle(b, 80, 1 / 60); assert.ok(n >= b && n <= 80); b = n; }
  assert.ok(b > 70);
});

test('nextTurn : le virage du « L » est annoncé à droite, à la bonne distance ; aucun virage après', () => {
  const t = nextTurn(L, 30);
  assert.ok(t && Math.abs(t.dist - 70) < 1e-6 && Math.abs(t.deg - 90) < 1e-6, JSON.stringify(t));
  assert.equal(nextTurn(L, 150), null);                                          // déjà passé
  const left = nextTurn([[0, 0], [0, 100], [-100, 100]], 0);
  assert.ok(left && left.deg < -80, JSON.stringify(left));                       // à gauche : angle négatif
});

test('nextTurn : un virage trop loin, ou un faible changement de cap, n’est pas annoncé', () => {
  assert.equal(nextTurn([[0, 0], [0, 500], [500, 500]], 0), null);               // 500 m : trop loin
  assert.equal(nextTurn([[0, 0], [0, 100], [10, 200]], 0), null);                // ~6° : pas un virage
});

test('guideState : sur la route, vise 22 m en avant ; distance restante ; pas hors route', () => {
  const g = guideState(L, { e: 0, n: 40 });
  close(g.target.e, 0); close(g.target.n, 40 + LOOK_AHEAD);
  close(g.remaining, 160); assert.equal(g.off, false); assert.equal(g.arrived, false);
  assert.ok(g.turn && Math.abs(g.turn.dist - 60) < 1e-6);
});

test('guideState : le point visé suit la route après le virage (et non la ligne droite vers l’arrivée)', () => {
  const g = guideState(L, { e: 0, n: 90 });
  close(g.target.n, 100); close(g.target.e, 12);                                 // 10 m jusqu'au coin, puis 12 m vers l'est
});

test('guideState : hors route -> vise le point de la route le plus proche et le signale', () => {
  const g = guideState(L, { e: 60, n: 40 });                                     // 60 m à l'est du premier tronçon
  assert.equal(g.off, true); assert.ok(g.offRoute > OFF_ROUTE);
  close(g.target.e, 0); close(g.target.n, 40); assert.equal(g.turn, null);
  assert.ok(g.remaining > 160);
});

test('guideState : arrivée à moins de ARRIVED mètres du bout', () => {
  assert.equal(guideState(L, { e: 100 - ARRIVED + 1, n: 100 }).arrived, true);
  assert.equal(guideState(L, { e: 50, n: 100 }).arrived, false);
});

test('guideState : tracé invalide -> null', () => { assert.equal(guideState([[0, 0]], { e: 0, n: 0 }), null); assert.equal(guideState(null, { e: 0, n: 0 }), null); });

test('lookAhead : 22 m à l’arrêt, plus loin quand on roule vite, plafonné à 48 m', () => {
  assert.equal(lookAhead(0), LOOK_AHEAD);
  assert.ok(lookAhead(10) > lookAhead(2));
  assert.equal(lookAhead(200), 48);
  assert.equal(lookAhead(-10), lookAhead(10));            // marche arrière : même distance
});

test('la boussole : à l’écran l’aiguille pointe (cap du trajet − cap de la caméra), comme sur une vraie boussole', () => {
  // rose tournée de −cap, aiguille tournée du cap du trajet dans la rose : angle écran = cap du trajet − cap caméra
  const screen = (bearingDeg, headingDeg) => { const a = (bearingDeg - headingDeg + 540) % 360 - 180; return a; };
  assert.equal(screen(90, 0), 90);          // trajet vers l'est, caméra vers le nord : à droite
  assert.equal(screen(90, 90), 0);          // caméra vers l'est : tout droit
  assert.equal(screen(0, 90), -90);         // trajet vers le nord, caméra vers l'est : à gauche
  assert.ok(Math.abs(Math.abs(screen(180, 0)) - 180) < 1e-9);
  close(relativeAngle(Math.PI / 2, { e: 0, n: 0 }, { e: 0, n: 10 }), screen(0, 90));   // même résultat que la fonction du module
});

test('turnLabel : côté, intensité et distance arrondie', () => {
  assert.equal(turnLabel(null), '');
  assert.equal(turnLabel({ dist: 43, deg: 90 }), 'À droite dans 40 m');
  assert.equal(turnLabel({ dist: 100, deg: -90 }), 'À gauche dans 100 m');
  assert.equal(turnLabel({ dist: 5, deg: 50 }), 'Légèrement à droite dans 10 m');
  assert.equal(turnLabel({ dist: 60, deg: 160 }), 'Demi-tour dans 60 m');
});

test('sur un vrai itinéraire de la carte : la flèche reste cohérente de bout en bout et annonce de vrais virages', () => {
  const R = createRouter(JSON.parse(fs.readFileSync(new URL('../assets/data/routes-djenne-voiture.json', import.meta.url))));
  const K = 0.84, me0 = { e: K * (47 + 5.2), n: K * (-21.5 + 12) };
  const school = PLACES.find((p) => p.id === 'ecole');
  const r = R.route(me0.e, me0.n, school.e, school.n);
  assert.equal(r.roads, true);
  const total = routeMetrics(r.pts).total;
  let turns = 0, prevRem = Infinity;
  for (let s = 0; s < total - ARRIVED; s += 15) {
    const p = pointAt(r.pts, s);
    const g = guideState(r.pts, { e: p.e, n: p.n });
    assert.ok(g && !g.off, `hors route à ${s} m`);
    assert.ok(g.remaining <= prevRem + 0.5, 'la distance restante ne doit jamais augmenter en avançant');
    prevRem = g.remaining;
    if (g.turn) turns++;
  }
  assert.ok(turns > 5, `seulement ${turns} relevés avec un virage annoncé`);
  const end = guideState(r.pts, pointAt(r.pts, total));
  assert.equal(end.arrived, true);
});
