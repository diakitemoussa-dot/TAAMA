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

/** Surcoût d'un tronçon (fois sa longueur) selon sa classe d'eau : 0 sec, 1 gué peu profond, 2 gué profond. */
export const WET_COST = [0, 0.6, 2.0];

export function createRouter(data) {
  const N = data.n, adj = Array.from({ length: N.length }, () => []);
  for (const [a, b, cls = 0] of data.e) {
    const d = Math.hypot(N[a][0] - N[b][0], N[a][1] - N[b][1]);
    adj[a].push([b, d, cls]); adj[b].push([a, d, cls]);
  }
  // grille pour trouver le nœud le plus proche
  const CELL = 120, grid = new Map();
  N.forEach((p, i) => { const k = Math.floor(p[0] / CELL) + ',' + Math.floor(p[1] / CELL); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  function nearest(e, n, maxR = 600) {
    let best = -1, bd = Infinity;
    const r = Math.ceil(maxR / CELL), cx = Math.floor(e / CELL), cy = Math.floor(n / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      const l = grid.get((cx + dx) + ',' + (cy + dy)); if (!l) continue;
      for (const i of l) { if (!adj[i].length) continue; const d = Math.hypot(N[i][0] - e, N[i][1] - n); if (d < bd) { bd = d; best = i; } }
    }
    return best < 0 ? null : { i: best, d: bd };
  }
  /** itinéraire { pts: [[e, n], …], length, roads, wet, deep } ; wet = mètres dans l'eau (gués), deep = dont gué profond ; ligne droite si le réseau n'est pas joignable. */
  function route(fe, fn, te, tn) {
    const A = nearest(fe, fn), B = nearest(te, tn);
    const straight = () => ({ pts: [[fe, fn], [te, tn]], length: Math.hypot(te - fe, tn - fn), roads: false, wet: 0, deep: 0 });
    if (!A || !B) return straight();
    const g = new Float64Array(N.length).fill(Infinity), prev = new Int32Array(N.length).fill(-1), done = new Uint8Array(N.length);
    const prevCls = new Uint8Array(N.length), prevLen = new Float64Array(N.length);
    const h = (i) => Math.hypot(N[i][0] - N[B.i][0], N[i][1] - N[B.i][1]);
    g[A.i] = 0;
    const heap = [[h(A.i), A.i]];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { let m = i; const a = 2 * i + 1, b = a + 1; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return t; };
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
