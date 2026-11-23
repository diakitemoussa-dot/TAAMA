/* ==========================================================
   ITINÉRAIRES DE DJENNÉ — logique pure (sans DOM ni Three.js, testable sous Node)
   Graphe routier : assets/data/routes-djenne-voiture.json = { n: [[est, nord], …], e: [[a, b] ou [a, b, classe], …] } (mètres réels par
   rapport à la Grande Mosquée). Extrait d'OpenStreetMap (Documents\Djenne3D\osm\djenne.osm) PUIS filtré par tools/analyze-roads.mjs :
   ne restent que les tronçons que la voiture du jeu peut vraiment prendre (pas de maison du modèle 3D en travers, pas d'eau profonde, pas
   de pente excessive). `classe` (omise = 0) : 0 route sèche, 1 gué peu profond (< 0,8 m), 2 gué profond (jusqu'à 1,3 m : voiture ralentie).
   Plus court chemin par A*, avec un surcoût pour les gués : on préfère toujours les routes sèches.
   ========================================================== */
export const PLACES = [
  { id: 'mosquee', name: 'Grande Mosquée de Djenné', short: 'Grande Mosquée', e: 0, n: 0, kind: 'mosquee', info: 'Plus grand édifice en banco du monde (UNESCO).' },
  { id: 'marche', name: 'Marché du lundi', short: 'Marché', e: 95, n: 5, kind: 'marche', approx: true, info: 'Face à la mosquée : chaque lundi, le plus grand marché de la région.' },
  { id: 'ecole', name: 'École FA AID', short: 'École FA AID', e: 715, n: -82, kind: 'ecole', info: 'École du quartier nord-est.' },
  { id: 'barrage', name: 'Barrage du Seuil de Djenné', short: 'Barrage', e: 595, n: 114, kind: 'barrage', info: 'Ouvrage sur le Bani, au nord-est de la ville.' },
  { id: 'tonombo', name: 'Tonombo', short: 'Tonombo', e: 832, n: 172, kind: 'site', info: 'Site archéologique voisin de Djenné.' },
  { id: 'stade', name: 'Stade Koïkoumboro', short: 'Stade', e: 1221, n: 16, kind: 'stade', info: 'Stade de la ville.' },
  { id: 'kaniana', name: 'Kaniana', short: 'Kaniana', e: -1618, n: 816, kind: 'site', info: 'Site archéologique, au nord-ouest.' },
  { id: 'hambarketolo', name: 'Hambarkétolo', short: 'Hambarkétolo', e: 1600, n: -1008, kind: 'site', info: 'Site archéologique, au sud-est.' },
  { id: 'djennodjeno', name: 'Djenné-Djenno', short: 'Djenné-Djenno', e: 1655, n: -1669, kind: 'site', info: 'Plus ancienne ville connue d’Afrique subsaharienne (UNESCO).' },
];

/** Surcoût d'un tronçon (fois sa longueur) selon sa classe d'eau : 0 sec, 1 gué peu profond, 2 gué profond.
 *  Le gué peu profond (< 0,8 m) est praticable par la voiture : on ne le pénalise plus fortement,
 *  sinon le routeur fait de grands détours pour l'éviter et l'itinéraire s'allonge inutilement. */
export const WET_COST = [0, 0.25, 2.0];

export function createRouter(data) {
  const N = data.n, adj = Array.from({ length: N.length }, () => []);
  for (const [a, b, cls = 0] of data.e) {
    const d = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
    adj[a].push([b, d, cls]); adj[b].push([a, d, cls]);
  }
  // grille pour trouver le nœud le plus proche
  const CELL = 120, grid = new Map();
  N.forEach((p, i) => { const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL); let cell = grid.get(k); if (!cell) { cell = []; grid.set(k, cell); } cell.push(i); });
  function nearest(e, n, maxR = 1000) {
    let best = -1, bd = Infinity;
    const r = Math.ceil(maxR / CELL), cx = Math.floor(e / CELL), cy = Math.floor(n / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy)); if (!l) continue;
      for (const i of l) { if (!adj[i].length) continue; const d = Math.hypot(N[i][0] - e, N[i][1] - n); if (d < bd) { bd = d; best = i; } }
    }
    return best < 0 ? null : { i: best, d: bd };
  }
  /** Tous les nœuds routiers à moins de R mètres : le départ peut être n'importe lequel d'entre eux (on prend le meilleur, vers la destination). */
  function near(e, n, R) {
    const out = [], r = Math.ceil(R / CELL), cx = Math.floor(e / CELL), cy = Math.floor(n / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy)); if (!l) continue;
      for (const i of l) { if (!adj[i].length) continue; const d = Math.hypot(N[i][0] - e, N[i][1] - n); if (d <= R) out.push({ i, d }); }
    }
    return out;
  }
  /** itinéraire { pts: [[e, n], …], length, roads, wet, deep } ; wet = mètres dans l'eau (gués), deep = dont gué profond ; ligne droite si le réseau n'est pas joignable. */
  function route(fe, fn, te, tn) {
    const B = nearest(te, tn);
    let C = near(fe, fn, 60);                                   // départ : tous les accès routiers proches (ex. sortie de la mosquée), pas seulement le plus proche
    if (!C.length) { const A0 = nearest(fe, fn); C = A0 ? [A0] : []; }
    const straight = () => ({ pts: [[fe, fn], [te, tn]], length: Math.hypot(te - fe, tn - fn), roads: false, wet: 0, deep: 0 });
    if (!C.length || !B) return straight();
    const g = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1), done = new Uint8Array(N.length);
    const prevCls = new Uint8Array(N.length), prevLen = new Float64Array(N.length);
    const h = (i) => Math.hypot(N[i][0] - N[B.i][0], N[i][1] - N[B.i][1]);
    const heap = [];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let m = i; const a = 2 * i + 1, b = a + 1; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
    for (const c of C) { if (c.d < g[c.i]) { g[c.i] = c.d; push([c.d + h(c.i), c.i]); } }
    while (heap.length) {
      const [, u] = pop(); if (done[u]) continue; done[u] = 1;
      if (u === B.i) break;
      for (const [v, d, c] of adj[u]) { const ng = g[u] + d * (1 + WET_COST[c]); if (ng < g[v]) { g[v] = ng; prev[v] = u; prevCls[v] = c; prevLen[v] = d; push([ng + h(v), v]); } }
    }
    if (!isFinite(g[B.i])) return straight();
    const ids = []; let wet = 0, deep = 0;
    for (let i = B.i; i !== -1; i = prev[i]) { ids.push(i); if (prev[i] !== -1 && prevCls[i] > 0) { wet += prevLen[i]; if (prevCls[i] === 2) deep += prevLen[i]; } }
    ids.reverse();
    const pts = [[fe, fn], ...ids.map((i) => N[i]), [te, tn]];
    let length = 0; for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, length, roads: true, wet, deep };
  }
  return { route, nearest, nodes: N.length };
}

export function formatDistance(m) { return m >= 1000 ? (m / 1000).toFixed(1).replace('.', ',') + ' km' : Math.round(m / 10) * 10 + ' m'; }
export function etaMinutes(m, speed) { return Math.max(1, Math.round(m / speed / 60)); }

/** Longueurs cumulées d'une ligne brisée [[e,n],…] : { cum: [0, d1, …], total }. */
function cumsum(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { cum, total: cum[cum.length - 1] || 0 };
}

/**
 * Cherche des raccourcis sur un itinéraire : pour chaque paire de points (i, j)
 * de la ligne (j > i), compare la distance par la route (cum[j] - cum[i]) à la
 * distance en ligne droite (« à travers »). Retourne les coupes qui ferait gagner
 * au moins `minSave` mètres et `minPct` % par rapport à la route.
 *
 * @param {Array<[number,number]>} pts - points de l'itinéraire (répère {e, n} en mètres)
 * @param {Object} opts - { minSave (m), minPct (%), maxStep (m, ignore les sauts < maxStep) }
 * @returns {Array<{i, j, from, to, routeDist, directDist, save, pct}>} trié par économie décroissante
 */
export function findShortcuts(pts, opts = {}) {
  const { minSave = 25, minPct = 25, maxStep = 6 } = opts;
  if (!pts || pts.length < 3) return [];
  const { cum } = cumsum(pts);
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = i + 2; j < pts.length; j++) {                    // au moins un sommet entre i et j
      const routeDist = cum[j] - cum[i];
      if (routeDist < maxStep) continue;
      const directDist = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      const save = routeDist - directDist;
      const pct = routeDist > 0 ? (save / routeDist) * 100 : 0;
      if (save >= minSave && pct >= minPct && directDist < routeDist) {
        out.push({ i, j, from: pts[i], to: pts[j], routeDist: Math.round(routeDist), directDist: Math.round(directDist), save: Math.round(save), pct: Math.round(pct) });
      }
    }
  }
  out.sort((a, b) => b.save - a.save || b.pct - a.pct);
  return out;
}
