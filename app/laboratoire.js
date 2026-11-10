/* ==========================================================
   LABORATOIRE DE TAPAMA — scènes S4, S5, S6, S12, S13
   ----------------------------------------------------------
   Interface plein écran 2D : établi, cartes de Djenné, écrans, machine
   à deux alvéoles. Le joueur y « place » un dispositif, résout 3 énigmes
   (mots de passe), regarde la projection (qui saute), puis Tapama annonce
   la suite. Tapama n'est JAMAIS en 3D : portrait 2D + bulles de texte.

   API (window.Lab) :
     open({ stage: 1|2, onDone })   ouvre le labo et enchaîne toute la scène
     close()                        ferme (sans appeler onDone)
     state()                        { stage, solved:[…], hintsUsed, phase, isOpen }
     isOpen                         booléen
   Événements window : 'lab:open' {stage} · 'lab:enigme-resolue' {stage,index}
                       'lab:done' {stage}
   Sauvegarde : taama.lab1 / taama.lab1.q / taama.lab2 / taama.lab2.q
                (+ taama.revelation = '1' à la fin du stade 2).

   Clavier : saisie directe · Entrée = valider · Échap = quitter le champ
             (le labo ne se quitte pas) · H ou R = relire les messages
             (hors champ de saisie) · I = indice · Entrée/P = placer.
   Manette : croix = naviguer · A = valider/cliquer · B = effacer ·
             X = indice · Y = relire.
   La logique pure des énigmes (normaliser, lireNombre, verifier) est
   exportée : voir tests/lab-enigmes.test.mjs.
   ========================================================== */

import { fillName } from './player-profile.js?v=1';
import { mediaUrl } from './device-quality.js?v=6';
import { t, translateTree } from './i18n.js?v=1';

/* ==========================================================
   1. LOGIQUE PURE DES ÉNIGMES (aucun DOM)
   ========================================================== */

/** Minuscules, sans accents, ponctuation → espaces, espaces compactés. */
export function normaliser(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNITES = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};
const DIZAINES = { vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60 };

/** Nombre écrit en lettres (« quatre-vingt-dix », « mille neuf cent sept ») → entier, sinon null. */
export function motsEnNombre(texte) {
  const toks = normaliser(texte).split(' ').filter(Boolean)
    .map((w) => (/^(vingt|cent)s$/.test(w) ? w.slice(0, -1) : w));
  let total = 0, cur = 0, vu = false, prev = '';
  for (const w of toks) {
    if (w === 'et') { prev = w; continue; }
    if (w in UNITES) { cur += UNITES[w]; vu = true; }
    else if (w in DIZAINES) {
      if (w === 'vingt' && prev === 'quatre') cur = cur - 4 + 80;   // quatre-vingt
      else cur += DIZAINES[w];
      vu = true;
    } else if (w === 'cent') { cur = (cur || 1) * 100; vu = true; }
    else if (w === 'mille') { total += (cur || 1) * 1000; cur = 0; vu = true; }
    prev = w;                                                        // mots inconnus (« piliers », « ans »…) ignorés
  }
  return vu ? total + cur : null;
}

/** Entier lu dans une saisie : « 90 », « 90 piliers », « 1 907 », « cent quatre ». null si illisible. */
export function lireNombre(saisie) {
  const s = String(saisie == null ? '' : saisie).replace(/[  ]/g, ' ');
  if (/\d/.test(s)) {
    const compact = s.replace(/(\d)[ .](?=\d{3}(?!\d))/g, '$1');
    const m = compact.match(/\d+/g);
    return m && m.length === 1 ? parseInt(m[0], 10) : null;
  }
  return motsEnNombre(s);
}

function distanceEdition(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

/**
 * Énigmes du labo (bible §5). kind : 'nombre' (réponse entière) | 'mot' (mots acceptés).
 * proches : nombres qui déclenchent le message « tu y es presque » (E1 : 100).
 * Les textes peuvent contenir {nom}.
 */
export const ENIGMES = [
  {
    id: 'E1', stage: 1, index: 0, kind: 'nombre', reponse: 90, proches: [100], affichee: '90',
    titre: 'Les piliers',
    question: 'Mot de passe 1 : combien de piliers soutiennent le toit à l’intérieur de la mosquée ?',
    indices: [
      'Ils sont rangés comme des soldats. Tu en as vu beaucoup, mais moins de cent !',
      'Pense à des rangées bien régulières : neuf fois dix, si ça t’aide à compter.',
    ],
    succes: '90 ! Le premier verrou saute. Ces piliers portent tout le toit, {nom}.',
    erreur: 'Hmm, pas tout à fait. Reprends le plan de la salle de prière, je t’aide.',
    proche: 'Tu y es presque. Certains livres disent 100, mais pour notre dispositif, c’est un peu moins.',
    apres: { mood: 'souriante', text: 'Le premier verrou saute ! Tu vois, ensemble on avance vite. Plus que deux.' },
  },
  {
    id: 'E2', stage: 1, index: 1, kind: 'nombre', reponse: 104, proches: [], affichee: '104',
    titre: 'Les canaris',
    question: 'Mot de passe 2 : combien de canaris (les pots de terre cuite) coiffent les trous d’aération du toit ?',
    indices: [
      'Un peu plus d’une centaine. Chaque pot laisse l’air circuler et protège de la pluie.',
      'Cent… plus quatre. Cherche près de la ligne de crête du toit.',
    ],
    succes: '104 ! Bien vu. Tu as bien regardé là-haut avec ton drone.',
    erreur: 'Presque ! Il y en a un peu plus ou un peu moins. Je te redonne un coup de pouce ?',
    apres: { mood: 'curieuse', text: 'Deux sur trois ! Le dernier est une date. Pense à la mosquée que tu vois aujourd’hui, pas à l’ancienne.' },
  },
  {
    id: 'E3', stage: 1, index: 2, kind: 'nombre', reponse: 1907, proches: [], affichee: '1907',
    titre: 'La reconstruction',
    question: 'Mot de passe 3 : en quelle année la mosquée actuelle a-t-elle été reconstruite ?',
    indices: [
      'Ni très ancienne, ni récente : le début du XXe siècle.',
      'On a commencé en 1906. Les maçons ont fini l’année suivante.',
    ],
    succes: '1907 ! La mosquée que tu vois aujourd’hui a plus de cent ans.',
    erreur: 'Pas cette année-là. Souviens-toi : c’est la troisième mosquée à cet endroit.',
    apres: null,
  },
  {
    id: 'E4', stage: 2, index: 0, kind: 'mot', mots: ['toron', 'torons'], affichee: 'torons',
    titre: 'Les torons',
    question: 'Mot de passe 4 : les poutres de bois qui dépassent des murs servent d’échafaudage permanent pour le crépissage annuel. Comment les appelle-t-on ?',
    indices: [
      'Regarde les murs : ces bâtons en saillie, c’est le secret des maçons. Ils sont en palmier rônier.',
      'Un mot de cinq lettres, qui commence par T. Au pluriel, ils hérissent tout le mur.',
    ],
    succes: 'Les torons ! Grâce à eux, tout le monde grimpe pour recrépir la mosquée chaque année.',
    erreur: 'Presque ! Ce n’est pas un nom de pierre. Pense à ce qui dépasse des murs.',
    apres: { mood: 'souriante', text: 'Un de moins ! Les maçons de Djenné seraient fiers de toi. Encore deux.' },
  },
  {
    id: 'E5', stage: 2, index: 1, kind: 'nombre', reponse: 3, proches: [], affichee: '3',
    titre: 'Les tours de la façade',
    question: 'Mot de passe 5 : combien de grandes tours (minarets) as-tu vues sur la façade principale ?',
    indices: [
      'Regarde la façade qui fait face à la place du marché. Elles dominent tout.',
      'Moins que les doigts d’une main, plus que deux.',
    ],
    succes: 'Trois tours ! Elles dominent toute la façade, tu as l’œil, {nom}.',
    erreur: 'Hmm, compte encore. Va voir la façade avec ton drone si tu veux.',
    apres: { mood: 'curieuse', text: 'Plus qu’un verrou, {nom}. Celui-là demande un petit calcul : prends ton temps.' },
  },
  {
    id: 'E6', stage: 2, index: 2, kind: 'nombre', reponse: 81, proches: [], affichee: '81',
    titre: 'Un calcul d’années',
    question: 'Mot de passe 6 : la mosquée actuelle date de 1907 ; Djenné est classée au patrimoine mondial par l’UNESCO en 1988. Combien d’années les séparent ?',
    indices: [
      'C’est une soustraction. Tu pars de 1988 et tu remontes jusqu’à 1907.',
      '1988 moins 1900 donne 88. Retire encore les 7 années qu’il y a entre 1900 et 1907.',
    ],
    succes: '81 ans ! Tout se recoupe, {nom}. Les deux dispositifs s’allument.',
    erreur: 'Pas tout à fait. Écris les deux dates et soustrais lentement, je suis là.',
    apres: null,
  },
];

export const enigmesDuStade = (stage) => ENIGMES.filter((e) => e.stage === stage);

/**
 * Valide une saisie. Retourne { statut: 'vide' | 'ok' | 'proche' | 'faux' }.
 * enigme : objet ENIGMES ou identifiant ('E1'…).
 */
export function verifier(enigme, saisie) {
  const e = typeof enigme === 'string' ? ENIGMES.find((x) => x.id === enigme) : enigme;
  if (!e) return { statut: 'faux' };
  const brut = String(saisie == null ? '' : saisie).trim();
  if (!brut) return { statut: 'vide' };
  if (e.kind === 'nombre') {
    const n = lireNombre(brut);
    if (n == null) return { statut: 'faux' };
    if (n === e.reponse) return { statut: 'ok' };
    if ((e.proches || []).includes(n)) return { statut: 'proche' };
    return { statut: 'faux' };
  }
  // mot : un mot de la saisie, à une faute de frappe près (« toron », « les torons », « torrons »)
  const mots = normaliser(brut).split(' ').filter((w) => !/^(le|les|un|des|du|de|la|l|d|ce|ces|sont|appelle|on|c|est)$/.test(w));
  if (!mots.length || mots.length > 3) return { statut: 'faux' };
  const cibles = e.mots.map(normaliser);
  const ok = mots.some((w) => w.length >= 4 && cibles.some((c) => distanceEdition(w, c) <= 1));
  return { statut: ok ? 'ok' : 'faux' };
}

/* ==========================================================
   2. RÉPLIQUES DU LABO (bible §4)
   ========================================================== */

const LIGNES = {
  intro1: [
    { who: 'tapama', mood: 'souriante', text: 'Bienvenue chez moi, {nom} ! Pose le dispositif dans la machine, là, au centre. Doucement…' },
    { who: 'tapama', mood: 'attentive', text: 'Il est verrouillé. Trois mots de passe, et ils parlent tous de la mosquée. On les trouve ensemble : tu observes, je cherche dans mes notes.' },
  ],
  intro2: [
    { who: 'tapama', mood: 'surprise', text: 'Il est là ! {nom}, tu es incroyable. Pose-le dans la machine, à côté du premier.' },
    { who: 'tapama', mood: 'attentive', text: 'Cette fois les verrous sont plus costauds. Trois nouveaux mots de passe. On y va, calmement.' },
  ],
  proj1: { who: 'tapama', mood: 'surprise', text: 'Regarde ! Ce n’est pas un écran, ça sort de l’objet lui-même… {nom}, tu vois cette scène ?' },
  coupure1: [
    { who: 'player', text: 'Hé ! Elle a disparu d’un coup !' },
    { who: 'tapama', mood: 'inquiete', text: 'Attends, attends… Je regarde ce qui s’est passé.' },
  ],
  fin1: [
    { who: 'tapama', mood: 'attentive', text: 'Le dispositif n’a pas tout montré. Il manque une pièce : un autre dispositif est caché dans la mosquée. C’est lui qu’il nous faut, {nom}.' },
    { who: 'tapama', mood: 'inquiete', text: 'Retourne vers la mosquée avec le pick-up. Et fais vite, j’ai un mauvais pressentiment.' },
  ],
  proj2: { who: 'tapama', mood: 'surprise', text: 'Regarde cette carte, {nom}. Djenné n’est qu’un point parmi d’autres.' },
  coupure2: [
    { who: 'tapama', mood: 'inquiete', text: 'Non, non, non… Reste avec moi, je relance les écrans.' },
  ],
  fin2: [
    { who: 'tapama', mood: 'attentive', text: 'Les deux dispositifs ne sont qu’un début. Il y en a d’autres, cachés ailleurs en Afrique de l’Ouest. NÉANTIS le sait aussi.' },
    { who: 'player', text: 'Alors on doit les trouver avant eux.' },
    { who: 'tapama', mood: 'souriante', text: 'Exactement. Prochaine étape : Bandiagara, dans les falaises. Prépare ton sac, {nom} !' },
  ],
};

const MSG = {
  reprise: { mood: 'souriante', text: 'On reprend où on s’était arrêtés, {nom}.' },
  placer: { mood: 'curieuse', text: 'Glisse le dispositif jusqu’à l’alvéole lumineuse. Ou appuie sur « Placer le dispositif ».' },
  place: { mood: 'souriante', text: 'Parfait, il est bien en place. Les verrous s’affichent… regardons le premier.' },
  vide: { mood: 'attentive', text: 'Écris d’abord une réponse, {nom}. Même une idée, on l’essaie.' },
  illisible: { mood: 'curieuse', text: 'Je n’ai pas bien compris ta réponse. Tu peux l’écrire autrement ?' },
  autoIndice: { mood: 'attentive', text: 'On bute un peu, ce n’est pas grave. Je te donne un coup de pouce.' },
  proposer: { mood: 'souriante', text: 'On a fait le tour des indices, {nom}. Si tu veux, je te donne la réponse : tu l’écris et on avance ensemble.' },
  revele: { mood: 'neutre', text: 'La réponse, c’est « {r} ». Écris-la et valide, on garde le rythme.' },
  refus: { mood: 'souriante', text: 'D’accord, prends ton temps. Je suis là si tu changes d’avis.' },
  plusIndice: { mood: 'attentive', text: 'Je n’ai plus d’indice à te donner, mais je peux te dire la réponse si tu veux.' },
};

/* ==========================================================
   3. OUTILS DOM, AUDIO
   ========================================================== */

const PORTRAIT = (mood) => `assets/images/tapama/tapama-${['neutre', 'curieuse', 'inquiete', 'surprise', 'attentive', 'souriante'].includes(mood) ? mood : 'neutre'}.webp`;
const VIDEO_SRC = 'assets/videos/intro-drone format pc.mp4';
const PROJ_MS = 5200;      // durée de la projection avant la coupure
const SVG_NS = 'http://www.w3.org/2000/svg';
const browser = typeof window !== 'undefined' && typeof document !== 'undefined';

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = t(text);
  return n;
}
const playerName = () => {
  const p = window.GameUI && window.GameUI.player && window.GameUI.player();
  return p ? p.name : '';
};
const nm = (s) => fillName(t(s), playerName());

function store(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* mode privé */ } }
function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

let actx = null;
function audio() {
  try {
    if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); window.GameAudio?.ctx?.(actx, 'effects'); }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
  } catch (e) { actx = null; }
  return actx;
}
function noiseBuffer(c, sec) {
  const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * sec)), c.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
const sfx = {
  crackle(sec = 1.0, vol = 0.22) {                 // grésillement de coupure
    const c = audio(); if (!c) return;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c, sec);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
    const g = c.createGain(); const t0 = c.currentTime;
    g.gain.setValueAtTime(0, t0);
    for (let i = 0; i < sec * 24; i++) g.gain.linearRampToValueAtTime(Math.random() < 0.55 ? vol * Math.random() : 0, t0 + (i + 1) / 24);
    g.gain.linearRampToValueAtTime(0, t0 + sec);
    src.connect(hp); hp.connect(g); g.connect(c.destination); src.start(t0);
  },
  key(vol = 0.06) {                                // touche de clavier
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(c, 0.03);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 1600; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.035);
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t0);
  },
  powerDown() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t0); o.frequency.exponentialRampToValueAtTime(34, t0 + 1.3);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const g = c.createGain(); g.gain.setValueAtTime(0.14, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 1.4);
    o.connect(lp); lp.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 1.5);
  },
  unlock() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    [[660, 0], [880, 0.09], [1320, 0.18]].forEach(([f, dt]) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(0.1, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0005, t0 + dt + 0.4);
      o.connect(g); g.connect(c.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.45);
    });
  },
  buzz() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 150;
    const g = c.createGain(); g.gain.setValueAtTime(0.06, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.22);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.25);
  },
  place() {
    const c = audio(); if (!c) return;
    const t0 = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(180, t0); o.frequency.exponentialRampToValueAtTime(70, t0 + 0.25);
    const g = c.createGain(); g.gain.setValueAtTime(0.18, t0); g.gain.exponentialRampToValueAtTime(0.0005, t0 + 0.3);
    o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + 0.32);
  },
  hum(on) {                                        // ronronnement de la projection
    const c = audio(); if (!c) return null;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 72;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
    const g = c.createGain(); g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(on || 0.05, c.currentTime + 0.8);
    o.connect(lp); lp.connect(g); g.connect(c.destination); o.start();
    return () => { try { g.gain.cancelScheduledValues(c.currentTime); g.gain.setValueAtTime(g.gain.value, c.currentTime); g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.05); o.stop(c.currentTime + 0.08); } catch (e) { /* déjà arrêté */ } };
  },
};

/* ==========================================================
   4. DÉCOR SVG (établi, cartes de Djenné, écrans, machine)
   ========================================================== */

function sceneSVG() {
  // Sommets de la crête en créneaux (style soudanais) pour la frise du haut
  let crest = 'M0 0 H1600 V34 ';
  for (let x = 1600; x > 0; x -= 64) crest += `L${x - 14} 34 L${x - 32} 14 L${x - 50} 34 `;
  crest += 'L0 34 Z';
  const toron = (x, y, h = 26) => `<rect x="${x}" y="${y}" width="5" height="${h}" rx="2.5" fill="#6d4a30"/>`;
  let torons = '';
  for (let i = 0; i < 9; i++) torons += toron(18 + i * 11, 36 + (i % 2) * 5, 22 - (i % 3) * 4);
  for (let i = 0; i < 9; i++) torons += toron(1480 + i * 11, 36 + (i % 2) * 5, 22 - (i % 3) * 4);
  const pots = [0, 1, 2, 3, 4, 5, 6].map((i) =>
    `<g transform="translate(${96 + i * 62} 482)"><path d="M-22 0 Q-26 -26 0 -34 Q26 -26 22 0 Z" fill="#b5593a"/><path d="M-22 0 Q-26 -26 0 -34 Q26 -26 22 0 Z" fill="url(#potShade)"/><ellipse cx="0" cy="-34" rx="9" ry="3" fill="#4a2616"/></g>`).join('');
  const books = [0, 1, 2, 3, 4].map((i) =>
    `<rect x="${480 + i * 16}" y="${448 - (i % 2) * 6}" width="13" height="${40 + (i % 2) * 6}" rx="2" fill="${['#2d6a8f', '#c9a24b', '#8f3d2d', '#3d7a4c', '#55415d'][i]}"/>`).join('');
  // silhouette de la Grande Mosquée : tracée d'après le modèle 3D du jeu (façade à trois tours, vue de face, projection orthographique), 180 points
  const mosque = `
    <g transform="translate(206 330)">
      <path d="M-105 0 L-105 -9.7 L-104.5 -11.8 L-103.6 -11.8 L-103 -14.8 L-99 -14.8 L-98.5 -11.8 L-97.9 -11.8 L-97.5 -9.7 L-94.7 -9.7 L-94.6 -29 L-93.2 -29 L-92.4 -31.6 L-91.6 -31.6 L-90.6 -28.9 L-89.4 -28.9 L-89.2 -27.9 L-86.9 -27.9 L-86.8 -29.3 L-86.1 -29.3 L-85.7 -37.4 L-85.5 -37.8 L-83.4 -37.8 L-82.6 -41.3 L-81.3 -41.6 L-70 -41.6 L-69.3 -40.7 L-67.7 -40.5 L-66.7 -37.3 L-65.6 -37.3 L-65.4 -34.5 L-59.6 -34.5 L-59 -35.2 L-58.9 -36.7 L-58.2 -37.4 L-56.6 -37.1 L-56.2 -34.5 L-53.9 -34.5 L-53.1 -36.9 L-51.8 -37.3 L-50.1 -37.3 L-49.1 -35.5 L-48.2 -35.5 L-47.5 -37.2 L-46.6 -37.3 L-45.5 -34.6 L-43.9 -34.5 L-43.4 -37.1 L-41.9 -37.4 L-41.3 -37 L-41.1 -35.1 L-40 -35 L-39.9 -39.7 L-38.5 -39.7 L-38.4 -40.4 L-37.2 -40.6 L-37 -43.4 L-35.6 -43.4 L-35.2 -48.4 L-33.6 -48.4 L-33.5 -48.9 L-30.2 -48.9 L-30.1 -48.4 L-28.3 -48.4 L-28 -43.4 L-26.8 -43.4 L-26.7 -40.6 L-25.4 -40.5 L-25.1 -39.8 L-23.7 -39.5 L-23.6 -35 L-22.5 -35 L-22.3 -36.4 L-21.6 -37.3 L-19.1 -37.2 L-18.7 -35.9 L-17.8 -35.9 L-17 -37.3 L-16.2 -37.3 L-15.2 -34.5 L-14.1 -34.6 L-13.2 -37.3 L-11.9 -36.9 L-11.2 -34.5 L-10.4 -34.5 L-9.3 -37.2 L-7.9 -37 L-7.3 -34.9 L-6.3 -35.1 L-5.2 -37.4 L-3.3 -37.2 L-2.7 -35.2 L-1.5 -35.1 L-1.4 -41.9 L0.1 -41.9 L1.2 -47.5 L2.3 -47.4 L2.9 -43.7 L3.7 -43.7 L3.9 -47.4 L5.1 -47.4 L5.6 -48.9 L13.1 -48.9 L13.5 -47.4 L14.8 -47.4 L14.9 -43.6 L15.8 -43.6 L16.3 -47.4 L17.4 -47.6 L18.6 -41.9 L19.5 -41.9 L20.5 -35.2 L21.4 -34.6 L22.5 -34.6 L22.9 -36.6 L23.5 -37.3 L24.9 -37.1 L25.3 -34.5 L27.7 -34.5 L29.2 -37.3 L30.1 -37.3 L30.6 -36.9 L31.4 -34.5 L32.7 -34.5 L34 -37.3 L35.9 -37.2 L37 -35.6 L37.9 -35.6 L38.2 -36.9 L39.6 -37.3 L40.3 -37 L40.7 -34.8 L42.8 -34.8 L42.9 -38.6 L44.3 -38.6 L44.6 -40.2 L45.9 -40.6 L46.1 -43.4 L47.5 -43.4 L47.6 -48.4 L49.4 -48.4 L49.5 -48.9 L52.7 -48.9 L52.9 -48.4 L54.5 -48.4 L55 -43.4 L56.6 -43.4 L56.7 -40.6 L57.8 -40.2 L57.9 -38.6 L59.3 -38.5 L59.7 -34.5 L62.5 -34.9 L63.9 -37.6 L70.5 -37.2 L71.2 -36.5 L71.8 -34.3 L72.7 -34.4 L74 -37.2 L75.5 -37 L76 -35.1 L76.9 -35.1 L78.6 -41.2 L88.7 -41.3 L88.8 -42.3 L89.6 -42.3 L89.7 -41.3 L91.1 -41.2 L92.3 -40 L92.5 -37.4 L93.2 -37.4 L93.7 -36.9 L93.9 -31.8 L95 -31.8 L95.1 -14.8 L97.2 -14.8 L98 -11.8 L98.8 -11.8 L99.2 -9.7 L104.8 -9.7 L104.9 -10.7 L104.9 0 Z" fill="#8b5a3a" stroke="#4a2c1a" stroke-width="1.1" stroke-linejoin="round"/>
      <g fill="#3b2216" opacity=".55"><rect x="-86" y="-12" width="14" height="12" rx="7"/><rect x="72" y="-12" width="14" height="12" rx="7"/><rect x="-7" y="-14" width="14" height="14" rx="7"/></g>
    </g>`;
  const monitor = (x, y, w, h, kind) => {
    let body = '';
    if (kind === 0) body = `<polyline points="${x + 14},${y + h - 20} ${x + 50},${y + h - 54} ${x + 90},${y + h - 36} ${x + 130},${y + 34} ${x + 170},${y + 58} ${x + w - 14},${y + 22}" fill="none" stroke="#7fd0ff" stroke-width="3"/>
      <polyline points="${x + 14},${y + h - 30} ${x + 70},${y + h - 24} ${x + 120},${y + h - 62} ${x + 190},${y + h - 40} ${x + w - 14},${y + h - 70}" fill="none" stroke="#f9d58b" stroke-width="2.5" opacity=".8"/>`;
    else if (kind === 1) body = [0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${x + 18 + i * 26}" y="${y + h - 18 - (14 + (i * 37) % 70)}" width="16" height="${14 + (i * 37) % 70}" fill="#4aa8ff" opacity=".85"/>`).join('');
    else body = `<circle cx="${x + w / 2}" cy="${y + h / 2}" r="${h / 2 - 20}" fill="none" stroke="#7fd0ff" stroke-width="2.5"/><circle cx="${x + w / 2}" cy="${y + h / 2}" r="${h / 2 - 40}" fill="none" stroke="#f9d58b" stroke-width="2" stroke-dasharray="6 6"/><line x1="${x + w / 2}" y1="${y + h / 2}" x2="${x + w / 2 + 40}" y2="${y + h / 2 - 28}" stroke="#7fd0ff" stroke-width="3"/>`;
    return `<g><rect x="${x - 10}" y="${y - 10}" width="${w + 20}" height="${h + 20}" rx="12" fill="#14181f" stroke="#3a4352" stroke-width="3"/>
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#screenG)"/>${body}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="url(#scan)" opacity=".5"/></g>`;
  };
  const alcove = (cx, cy, id) => `
    <g id="${id}" transform="translate(${cx} ${cy})">
      <polygon points="0,-104 90,-52 90,52 0,104 -90,52 -90,-52" fill="#12161d" stroke="#c9a24b" stroke-width="5"/>
      <polygon points="0,-88 76,-44 76,44 0,88 -76,44 -76,-44" fill="url(#alcoveG)" stroke="#1e90ff" stroke-width="2.5" opacity=".95"/>
      <polygon points="0,-62 54,-31 54,31 0,62 -54,31 -54,-31" fill="none" stroke="#9fd4ff" stroke-width="1.5" stroke-dasharray="4 7" class="lab-alc-ring"/>
    </g>`;

  return `
  <svg class="lab-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wallG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#523829"/><stop offset=".6" stop-color="#3b2a21"/><stop offset="1" stop-color="#271a14"/></linearGradient>
      <linearGradient id="benchG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5f3d"/><stop offset=".08" stop-color="#6d4a30"/><stop offset="1" stop-color="#2d1f16"/></linearGradient>
      <linearGradient id="metalG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c3340"/><stop offset=".5" stop-color="#1c212b"/><stop offset="1" stop-color="#12161d"/></linearGradient>
      <linearGradient id="screenG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#103756"/><stop offset="1" stop-color="#07131f"/></linearGradient>
      <linearGradient id="potShade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".25"/><stop offset=".4" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
      <linearGradient id="paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6c88d"/><stop offset="1" stop-color="#c9a46a"/></linearGradient>
      <radialGradient id="lampGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd98a" stop-opacity=".7"/><stop offset=".5" stop-color="#ffb347" stop-opacity=".22"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
      <radialGradient id="blueGlow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#3aa0ff" stop-opacity=".55"/><stop offset="1" stop-color="#3aa0ff" stop-opacity="0"/></radialGradient>
      <radialGradient id="alcoveG" cx=".5" cy=".5" r=".6"><stop offset="0" stop-color="#2b8fe6"/><stop offset=".45" stop-color="#0d3556"/><stop offset="1" stop-color="#050b12"/></radialGradient>
      <pattern id="scan" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.5" fill="#000" opacity=".35"/></pattern>
      <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4"/><feColorMatrix values="0 0 0 0 .1  0 0 0 0 .06  0 0 0 0 .03  0 0 0 .55 0"/></filter>
      <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
      <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
    </defs>

    <rect width="1600" height="900" fill="url(#wallG)"/>
    <rect width="1600" height="900" filter="url(#grain)" opacity=".45"/>
    <g opacity=".13" stroke="#000" stroke-width="2"><line x1="0" y1="210" x2="1600" y2="210"/><line x1="0" y1="420" x2="1600" y2="420"/></g>
    <path d="${crest}" fill="#241710"/>${torons}

    <!-- tableaux de recherche de Tapama : carte de Djenné et plan de la salle de prière -->
    <g transform="translate(372 -6)">
    <g>
      <rect x="62" y="108" width="296" height="260" rx="10" fill="#2a1a12" stroke="#c9a24b" stroke-width="4"/>
      <rect x="76" y="122" width="268" height="232" rx="4" fill="url(#paper)"/>
      <!-- relief du papier : plis -->
      <g stroke="#7a5a30" stroke-width="1" opacity=".18"><line x1="210" y1="122" x2="210" y2="354"/><line x1="76" y1="238" x2="344" y2="238"/></g>
      <!-- bras du fleuve : Niger au nord, Bani au sud, et leurs noms -->
      <path d="M76 150 C140 190 180 140 240 170 S320 140 344 160" fill="none" stroke="#3b82b8" stroke-width="5" opacity=".55"/>
      <path d="M76 300 C130 270 150 330 210 312 S300 270 344 300" fill="none" stroke="#3b82b8" stroke-width="9" opacity=".8"/>
      <text x="98" y="148" font-family="Rubik,sans-serif" font-size="8" font-style="italic" fill="#2b5f8a" letter-spacing="2" transform="rotate(14 98 148)">NIGER</text>
      <text x="306" y="297" font-family="Rubik,sans-serif" font-size="7.5" font-style="italic" fill="#1f4e78" letter-spacing="1.5" transform="rotate(-12 306 297)">BANI</text>
      <!-- l'île de Djenné et ses ruelles -->
      <path d="M118 214 C150 196 250 196 296 214 C318 232 308 262 280 276 C240 292 160 292 126 276 C104 260 104 228 118 214 Z" fill="#c79a5a" opacity=".42" stroke="#8b5a3a" stroke-width="1.2" stroke-dasharray="3 3"/>
      <g stroke="#7a4a2a" stroke-width="1" opacity=".5" fill="none"><path d="M130 232 H290 M140 252 H282 M170 206 V284 M214 200 V288 M256 204 V282"/></g>
      <rect x="226" y="222" width="28" height="18" rx="2" fill="#a86a3a" opacity=".6"/><text x="240" y="234" text-anchor="middle" font-family="Rubik,sans-serif" font-size="6" font-weight="700" fill="#3a2010">MARCHÉ</text>
      <g fill="#8b5a3a" opacity=".5"><rect x="92" y="200" width="16" height="12"/><rect x="112" y="196" width="12" height="10"/><rect x="300" y="196" width="18" height="12"/><rect x="316" y="214" width="12" height="10"/></g>
      ${mosque}
      <!-- parcours de Tapama : labo -> mosquée -> dispositif, et branche vers la base -->
      <path d="M150 198 L206 282 L288 268" fill="none" stroke="#b3261e" stroke-width="2" stroke-dasharray="6 5"/>
      <g fill="#b3261e"><circle cx="150" cy="198" r="5"/><circle cx="288" cy="268" r="5"/></g>
      <g font-family="Rubik,sans-serif" font-size="8" font-weight="800" fill="#7a1a14" letter-spacing=".5">
        <text x="158" y="194">LABO TAPAMA</text><text x="236" y="259">DISPOSITIF 1</text>
      </g>
      <!-- titre, note, rose des vents, échelle -->
      <text x="88" y="138" font-family="Rubik,sans-serif" font-size="9" font-weight="800" fill="#5a3a1e" letter-spacing="2">RECHERCHES · DJENNÉ</text>
      <path d="M88 142 H214" stroke="#5a3a1e" stroke-width="1" opacity=".5"/>
      <text x="262" y="348" text-anchor="middle" font-family="'Caveat','Rubik',cursive" font-size="9.5" font-style="italic" fill="#5a2a1a" transform="rotate(-2 262 348)">Grande Mosquée · 1907</text>
      <g transform="translate(322 146)"><circle r="12" fill="#e9d3a2" stroke="#7a5a30" stroke-width="1"/><path d="M0 -10 L3 0 L0 10 L-3 0 Z" fill="#b3261e"/><path d="M-10 0 L0 -2.4 L10 0 L0 2.4 Z" fill="#7a5a30" opacity=".7"/><text y="-14" text-anchor="middle" font-family="Rubik,sans-serif" font-size="7" font-weight="800" fill="#5a3a1e">N</text></g>
      <g transform="translate(92 348)" stroke="#5a3a1e" stroke-width="1.5"><path d="M0 0 H44 M0 -3 V3 M22 -2 V2 M44 -3 V3"/><text x="22" y="-5" text-anchor="middle" stroke="none" font-family="Rubik,sans-serif" font-size="6.5" font-weight="700" fill="#5a3a1e">500 m</text></g>
    </g>
    <g>
      <rect x="392" y="130" width="170" height="150" rx="8" fill="#2a1a12" stroke="#7a5a3a" stroke-width="3"/>
      <rect x="402" y="140" width="150" height="130" rx="3" fill="#d9bc86"/>
      <!-- plan de la salle de prière : cour ouverte à gauche, salle couverte (champ de piliers) à droite, mur de la qibla et trois minarets -->
      <defs><pattern id="labPillars" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="1.5" fill="#5a3418"/></pattern></defs>
      <text x="412" y="154" font-family="Rubik,sans-serif" font-size="7.5" font-weight="800" fill="#5a3a1e" letter-spacing="1.2">PLAN · SALLE DE PRIÈRE</text>
      <rect x="412" y="162" width="52" height="94" fill="none" stroke="#6a4a2a" stroke-width="1.6" stroke-dasharray="4 3"/>
      <text x="438" y="212" text-anchor="middle" font-family="Rubik,sans-serif" font-size="7" font-weight="700" fill="#6a4a2a" letter-spacing="1" transform="rotate(-90 438 212)">COUR</text>
      <rect x="466" y="162" width="76" height="94" fill="#e8d2a0" stroke="#4a2c1a" stroke-width="2.2"/>
      <rect x="470" y="168" width="64" height="82" fill="url(#labPillars)" opacity=".85"/>
      <rect x="538" y="162" width="6" height="94" fill="#4a2c1a"/>
      <g fill="#4a2c1a"><rect x="536" y="166" width="10" height="14"/><rect x="536" y="203" width="10" height="14"/><rect x="536" y="240" width="10" height="14"/></g>
      <text x="476" y="266" font-family="'Caveat','Rubik',cursive" font-size="9" font-style="italic" fill="#8a1d14">piliers : à compter…</text>
      <circle cx="502" cy="209" r="16" fill="none" stroke="#b3261e" stroke-width="2.2" stroke-dasharray="3 3"/>
      <text x="551" y="209" text-anchor="middle" font-family="Rubik,sans-serif" font-size="5.5" font-weight="800" fill="#6a4a2a" letter-spacing="1" transform="rotate(90 551 209)">QIBLA</text>
    </g>
    </g>
    <!-- étagère aux canaris -->
    <rect x="60" y="486" width="540" height="14" rx="4" fill="#6d4a30"/><rect x="60" y="498" width="540" height="6" fill="#241710" opacity=".6"/>
    ${pots}${books}

    <!-- écrans à droite -->
    <ellipse cx="1290" cy="300" rx="320" ry="200" fill="url(#blueGlow)"/>
    ${monitor(1080, 120, 250, 150, 0)}
    ${monitor(1370, 120, 170, 150, 2)}
    ${monitor(1120, 330, 210, 120, 1)}
    <rect x="1370" y="330" width="170" height="120" rx="6" fill="#0c1a2a" stroke="#3a4352" stroke-width="3"/>
    <g fill="#4aa8ff" opacity=".7">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="1384" y="${346 + i * 17}" width="${60 + (i * 41) % 90}" height="6" rx="3"/>`).join('')}</g>

    <!-- lampe suspendue -->
    <g transform="translate(560 0)"><ellipse cx="480" cy="360" rx="480" ry="360" fill="url(#lampGlow)"/>
    <line x1="470" y1="34" x2="470" y2="86" stroke="#241710" stroke-width="4"/>
    <path d="M430 118 Q470 70 510 118 Z" fill="#c9a24b"/><ellipse cx="470" cy="120" rx="40" ry="6" fill="#ffe6a8"/></g>

    <!-- établi -->
    <rect x="0" y="690" width="1600" height="210" fill="url(#benchG)"/>
    <rect x="0" y="690" width="1600" height="7" fill="#b98a5a" opacity=".6"/>
    <g opacity=".1" stroke="#000" stroke-width="2">${[0, 1, 2, 3, 4, 5].map((i) => `<line x1="0" y1="${730 + i * 34}" x2="1600" y2="${730 + i * 34}"/>`).join('')}</g>
    <!-- ordinateur de Tapama -->
    <g transform="translate(1240 628)"><path d="M-20 62 L0 -4 H180 L200 62 Z" fill="#1d232d" stroke="#3a4352" stroke-width="3"/><rect x="6" y="-110" width="168" height="106" rx="8" fill="#14181f" stroke="#3a4352" stroke-width="3"/><rect x="14" y="-102" width="152" height="90" rx="4" fill="url(#screenG)"/><g fill="#9fd4ff" opacity=".8">${[0, 1, 2, 3, 4].map((i) => `<rect x="24" y="${-92 + i * 16}" width="${50 + (i * 31) % 80}" height="5" rx="2.5"/>`).join('')}</g></g>
    <!-- tasse, carnet -->
    <g transform="translate(1000 676)"><rect x="-17" y="-26" width="34" height="30" rx="6" fill="#e8d7b0"/><path d="M17 -18 q14 4 0 16" fill="none" stroke="#e8d7b0" stroke-width="5"/><path d="M-6 -34 q4 -8 0 -14 M6 -34 q4 -8 0 -14" stroke="#fff" stroke-width="2.5" fill="none" opacity=".4"/></g>
    <g transform="translate(110 706) rotate(-6)"><rect width="150" height="96" rx="6" fill="#e9dcc0"/><g stroke="#8b6b3d" stroke-width="2" opacity=".7"><line x1="14" y1="24" x2="130" y2="24"/><line x1="14" y1="44" x2="110" y2="44"/><line x1="14" y1="64" x2="124" y2="64"/></g></g>

    <!-- machine centrale -->
    <ellipse cx="700" cy="560" rx="330" ry="220" fill="url(#blueGlow)" opacity=".5"/>
    <g>
      <rect x="400" y="372" width="620" height="336" rx="30" fill="url(#metalG)" stroke="#c9a24b" stroke-width="5"/>
      <rect x="418" y="388" width="584" height="46" rx="14" fill="#0b0f15" stroke="#3a4352" stroke-width="2"/>
      <g id="lab-lights">${[0, 1, 2].map((i) => `<circle class="lab-led" data-i="${i}" cx="${640 + i * 70}" cy="411" r="10" fill="#3a1713" stroke="#6a2a22" stroke-width="2"/>`).join('')}</g>
      <text x="476" y="418" font-family="Rubik,sans-serif" font-size="15" font-weight="700" fill="#c9a24b" letter-spacing="4">TAPAMA·LAB</text>
      <rect x="880" y="398" width="96" height="26" rx="6" fill="#06101a"/><g fill="#4aa8ff">${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${886 + i * 15}" y="${418 - (5 + (i * 7) % 14)}" width="9" height="${5 + (i * 7) % 14}"/>`).join('')}</g>
      ${alcove(560, 560, 'lab-alc1')}
      ${alcove(840, 560, 'lab-alc2')}
      <g fill="none" stroke="#3a4352" stroke-width="10" stroke-linecap="round"><path d="M410 650 H380 V560"/><path d="M1010 650 H1040 V560"/></g>
      <rect x="474" y="676" width="472" height="10" rx="5" fill="#0b0f15"/>
    </g>
  </svg>`;
}

/* Carte lumineuse de l'Afrique de l'Ouest (stade 2) : 1° = 20 unités, x=(lon+18)*20, y=(25-lat)*20 */
const GEO = (lon, lat) => [Math.round((lon + 18) * 20), Math.round((25 - lat) * 20)];
function mapSVG() {
  const coast = [
    [-17, 21], [-17.4, 18], [-16.4, 16.2], [-17.5, 14.7], [-16.7, 13.4], [-15.6, 11.9], [-13.7, 9.5], [-13.2, 8.5], [-10.8, 6.3],
    [-7.6, 4.4], [-4, 5.3], [-0.2, 5.6], [1.2, 6.1], [2.4, 6.4], [3.4, 6.4], [6, 4.3], [8.5, 4.6], [9.8, 6.5], [11.5, 7], [13.5, 10.5], [14, 13], [14.5, 16], [15.5, 19.5],
    [12, 23.5], [4, 24.5], [-4.5, 24.6], [-5.5, 21], [-10, 21], [-13, 23],
  ].map(([lo, la]) => GEO(lo, la).join(',')).join(' ');
  const river = [[-10.8, 10.5], [-8.5, 12.2], [-6.2, 13.4], [-4.55, 13.9], [-3, 15.5], [-1, 16.7], [1, 16.7], [3, 14.5], [5, 11.8], [6, 9.2], [6.2, 6.2]].map(([lo, la]) => GEO(lo, la).join(',')).join(' ');
  const villes = [
    ['Djenné', -4.55, 13.9, 1], ['Bandiagara', -3.6, 14.35, 0], ['Ségou', -6.27, 13.43, 0], ['Bamako', -8, 12.65, 0],
    ['Tombouctou', -3, 16.77, 0], ['Dakar', -17.4, 14.7, 0], ['Ouagadougou', -1.5, 12.37, 0], ['Niamey', 2.1, 13.5, 0],
    ['Lomé', 1.2, 6.13, 0], ['Accra', -0.2, 5.6, 0], ['Abidjan', -4, 5.3, 0], ['Conakry', -13.7, 9.5, 0],
  ];
  const pts = villes.map(([nom, lo, la, big], i) => {
    const [x, y] = GEO(lo, la);
    const lab = nom === 'Dakar' || nom === 'Conakry' ? `<text x="${x + 10}" y="${y + 4}" text-anchor="start">${nom}</text>` : (nom === 'Djenné' ? `<text x="${x}" y="${y - 22}" text-anchor="middle" class="big">${nom}</text>` : `<text x="${x + 11}" y="${y + 4}">${nom}</text>`);
    return `<g class="lab-city${big ? ' big' : ''}" style="--d:${(0.9 + i * 0.28).toFixed(2)}s"><circle cx="${x}" cy="${y}" r="${big ? 7 : 4.5}"/>${big ? `<circle class="pulse" cx="${x}" cy="${y}" r="7"/>` : ''}${lab}</g>`;
  }).join('');
  const grid = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="420"/>`).join('') + [0, 1, 2, 3, 4].map((i) => `<line x1="0" y1="${i * 100 + 20}" x2="680" y2="${i * 100 + 20}"/>`).join('');
  return `<svg class="lab-map" viewBox="-10 -10 700 440" aria-hidden="true" focusable="false">
    <g class="lab-map-grid">${grid}</g>
    <polygon class="lab-map-fill" points="${coast}"/>
    <polygon class="lab-map-line" points="${coast}" pathLength="1"/>
    <polyline class="lab-map-river" points="${river}" pathLength="1"/>
    <g class="lab-map-cities">${pts}</g>
  </svg>`;
}

/* ==========================================================
   5. ÉTAT ET INTERFACE
   ========================================================== */

const KEYPAD_NUM = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', '↵'];
const KEYPAD_ABC = 'azertyuiopqsdfghjklmwxcvbn'.split('');
const PAD_LOCK_MS = 450;

let root = null, ui = null;
let S = null;                  // état de la scène en cours
let runId = 0;
let lockUntil = 0;
let padLoopOn = false;
let cssPromise = null;

class Annule extends Error {}

function ensureCss() {
  if (cssPromise) return cssPromise;
  cssPromise = new Promise((resolve) => {
    const href = new URL('../styles/laboratoire.css', import.meta.url).href + '?v=7';
    let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find((l) => /laboratoire\.css/.test(l.getAttribute('href') || ''));
    if (link) { resolve(); return; }
    link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.addEventListener('load', () => resolve());
    link.addEventListener('error', () => resolve());
    document.head.appendChild(link);
    setTimeout(resolve, 2500);
  });
  return cssPromise;
}

function tapamaBusy() { return !!(window.Tapama && window.Tapama.isBusy && window.Tapama.isBusy()); }
const locked = () => performance.now() < lockUntil;
const lock = (ms = PAD_LOCK_MS) => { lockUntil = performance.now() + ms; };

function buildUI(stage) {
  root = el('div', `lab-root stage${stage}`);
  root.id = 'labRoot';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', t('Laboratoire de Tapama'));
  root.innerHTML = `
    <div class="lab-scene" id="labScene">
      ${sceneSVG()}
      <div class="lab-slot" id="labSlot" aria-hidden="true"></div>
      <div class="lab-device" id="labDevice" tabindex="-1" aria-hidden="true">
        <svg viewBox="0 0 100 100"><polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill="#c9a24b" stroke="#f9d58b" stroke-width="3"/>
        <polygon points="50,16 80,33 80,67 50,84 20,67 20,33" fill="#0d2238" stroke="#1e90ff" stroke-width="2"/>
        <path d="M50 28 V50 L66 60 M50 50 L34 60 M50 50 V72" fill="none" stroke="#7fd0ff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="6" fill="#9fd4ff"/></svg>
      </div>
      <div class="lab-device is-fixed" id="labDevice1" hidden aria-hidden="true">
        <svg viewBox="0 0 100 100"><polygon points="50,4 91,27 91,73 50,96 9,73 9,27" fill="#c9a24b" stroke="#f9d58b" stroke-width="3"/>
        <polygon points="50,16 80,33 80,67 50,84 20,67 20,33" fill="#0d2238" stroke="#1e90ff" stroke-width="2"/>
        <path d="M50 28 V50 L66 60 M50 50 L34 60 M50 50 V72" fill="none" stroke="#7fd0ff" stroke-width="3" stroke-linecap="round"/>
        <circle cx="50" cy="50" r="6" fill="#9fd4ff"/></svg>
      </div>
      <div class="lab-holo" id="labHolo" hidden>
        <div class="lab-beam"></div>
        <div class="lab-holo-screen"><video muted playsinline preload="auto" tabindex="-1"></video><div class="lab-holo-map"></div><canvas class="lab-noise" width="160" height="90"></canvas><div class="lab-holo-scan"></div></div>
      </div>
    </div>

    <header class="lab-top">
      <div class="lab-title"><span class="lab-kicker">Laboratoire de Tapama</span><b id="labStageName"></b></div>
      <ol class="lab-locks" id="labLocks" aria-label="Verrous"></ol>
      <button type="button" class="lab-btn lab-glass lab-relire" id="labRelire" aria-label="Relire les messages de Tapama"><span class="lab-ico" aria-hidden="true">💬</span><span class="lab-l">Relire</span><kbd>H</kbd></button>
    </header>

    <aside class="lab-visio" id="labVisio" aria-live="polite">
      <div class="lab-visio-screen"><img id="labFace" alt="" draggable="false"><span class="lab-live"><i></i>en ligne</span></div>
      <div class="lab-bubble" id="labBubble"><div class="lab-b-name">Tapama</div><p id="labBubbleText"></p><div class="lab-b-actions" id="labBubbleActions"></div></div>
    </aside>

    <section class="lab-panel" id="labPanel" hidden></section>

    <div class="lab-typing" id="labTyping" hidden>
      <div class="lab-typing-card"><img alt="" draggable="false" id="labTypingFace"><div><b>Tapama tape sur son clavier…</b><div class="lab-kbd" id="labKbd"></div></div></div>
    </div>

    <div class="lab-history" id="labHistory" role="dialog" aria-label="Messages de Tapama" hidden></div>
    <div class="lab-blackout" id="labBlackout"></div>
    <div class="lab-emergency" id="labEmergency"></div>
    <div class="lab-sr" role="status" aria-live="assertive" id="labSr"></div>`;
  document.body.appendChild(root);

  const q = (id) => root.querySelector('#' + id);
  ui = {
    scene: q('labScene'), slot: q('labSlot'), device: q('labDevice'), device1: q('labDevice1'),
    holo: q('labHolo'), video: root.querySelector('.lab-holo video'), holoMap: root.querySelector('.lab-holo-map'),
    noise: root.querySelector('.lab-noise'),
    top: root.querySelector('.lab-top'), stageName: q('labStageName'), locks: q('labLocks'), relire: q('labRelire'),
    visio: q('labVisio'), face: q('labFace'), bubble: q('labBubble'), bubbleText: q('labBubbleText'), bubbleActions: q('labBubbleActions'),
    panel: q('labPanel'), typing: q('labTyping'), typingFace: q('labTypingFace'), kbd: q('labKbd'),
    history: q('labHistory'), black: q('labBlackout'), sr: q('labSr'),
  };
  ui.stageName.textContent = stage === 1 ? t('Dispositif n° 1') : t('Dispositif n° 2');
  for (let i = 0; i < 3; i++) {
    const li = el('li', 'lab-lock');
    li.dataset.i = i;
    li.setAttribute('aria-label', `${t('Verrou')} ${i + 1} : ${t('fermé')}`);
    li.innerHTML = '<svg viewBox="0 0 24 28" width="26" height="30"><path class="shackle" d="M6 12 V8 a6 6 0 0 1 12 0 V12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><rect x="3" y="12" width="18" height="14" rx="3.5" fill="currentColor"/><circle cx="12" cy="19" r="2.2" fill="#1b1410"/></svg>';
    ui.locks.appendChild(li);
  }
  // positions des alvéoles / du dispositif, en % de la scène 1600×900
  const pos = (node, cx, cy, w) => { node.style.left = (cx / 16) + '%'; node.style.top = (cy / 9) + '%'; node.style.width = (w / 16) + '%'; };
  const slotX = stage === 1 ? 560 : 840;
  pos(ui.slot, slotX, 560, 190);
  const portrait = !!(window.matchMedia && matchMedia('(max-aspect-ratio: 1/1)').matches);
  if (portrait) pos(ui.device, slotX, 735, 150); else pos(ui.device, 250, 760, 150);   // posé sur l'établi (visible quelle que soit l'orientation)
  ui.device.dataset.home = '1';
  pos(ui.device1, 560, 560, 150);
  ui.device1.hidden = stage !== 2;
  if (stage === 2) root.classList.add('has-d1');
  ui.relire.addEventListener('click', () => toggleHistory());
  ui.face.src = PORTRAIT('neutre');
  try { ui.faceFx = window.TapamaFace && window.TapamaFace.attach(ui.face); } catch (_) {}      // bouche animée + clignements (tapama-face.js)
  translateTree(root);
  return root;
}

/* ---------------- Tapama : bulle intégrée + dialogue plein écran ---------------- */

function say(mood, text, opts = {}) {
  const line = { who: 'tapama', mood: mood || 'neutre', text };
  S.log.push(line);
  ui.face.src = PORTRAIT(mood);
  window.TapamaVoice?.line(text, mood || 'neutre', nm(text));      // sa voix (audio préenregistré ou synthèse selon l'humeur)
  ui.bubbleText.textContent = `« ${nm(text)} »`;
  ui.bubble.classList.remove('pop'); void ui.bubble.offsetWidth; ui.bubble.classList.add('pop');
  ui.visio.dataset.mood = mood || 'neutre';
  ui.sr.textContent = nm(text);
  if (!opts.keepActions) ui.bubbleActions.replaceChildren();
}

function sceneTitle() { return S.stage === 1 ? 'Dispositif n° 1' : 'Dispositif n° 2'; }

/** Dialogue plein écran (même composant que le reste du jeu) ; résolu à la fin. */
function dialogue(id, lines) {
  guard();
  lines.forEach((l) => S.log.push({ ...l }));
  return new Promise((resolve) => {
    let done = false;
    const fin = () => { if (done) return; done = true; lock(); resolve(); };
    const seq = { id: `lab-${id}`, chapter: t('Laboratoire de Tapama'), title: t(sceneTitle()), lines };
    if (window.Tapama && typeof window.Tapama.play === 'function' && window.Tapama.play(seq, { onEnd: fin })) return;
    // Repli autonome si le composant de dialogue du jeu n'est pas là
    let i = 0;
    const show = () => {
      const l = lines[i];
      if (l.who === 'tapama') say(l.mood, l.text); else { ui.bubbleText.textContent = `« ${nm(l.text)} »`; ui.bubbleActions.replaceChildren(); }
      const b = el('button', 'lab-btn lab-gold', i >= lines.length - 1 ? 'Terminer' : 'Suivant');
      b.type = 'button';
      b.addEventListener('click', () => { i++; if (i >= lines.length) { ui.bubbleActions.replaceChildren(); fin(); } else show(); });
      ui.bubbleActions.replaceChildren(b);
      b.focus();
    };
    show();
  });
}

function guard() { if (!S || S.run !== runId) throw new Annule(); }
/** Pause du déroulé du labo : Tapama finit d'abord sa phrase (voix), puis le délai prévu s'écoule : jamais de passage à la suite en pleine réplique. */
async function pause(ms) {
  if (window.TapamaVoice && window.TapamaVoice.busy) {
    const t0 = performance.now();
    await window.TapamaVoice.whenDone(20000); guard();
    const rest = Math.max(Math.min(ms, 600), ms - (performance.now() - t0));       // le délai prévu court pendant qu'elle parle ; si elle est plus longue, un court souffle après sa dernière phrase
    await new Promise((r) => setTimeout(r, rest)); guard(); return;
  }
  await new Promise((r) => setTimeout(r, ms)); guard();
}

/* ---------------- Historique (relire) ---------------- */

function toggleHistory() {
  if (!ui) return;
  if (!ui.history.hidden) { ui.history.hidden = true; refocus(); return; }
  ui.history.replaceChildren();
  ui.history.append(el('div', 'lab-kicker', 'Messages de Tapama'));
  const list = el('div', 'lab-h-list');
  const rows = S ? S.log.slice(-14) : [];
  if (!rows.length) list.append(el('p', 'lab-h-empty', 'Rien à relire pour le moment.'));
  for (const l of rows) {
    const row = el('div', 'lab-h-row' + (l.who === 'player' ? ' is-player' : ''));
    row.append(el('b', null, l.who === 'tapama' ? 'Tapama' : (playerName() || 'Toi')), el('span', null, `« ${nm(l.text)} »`));
    list.appendChild(row);
  }
  const close = el('button', 'lab-btn lab-gold', 'Fermer');
  close.type = 'button';
  close.addEventListener('click', toggleHistory);
  ui.history.append(list, close);
  ui.history.hidden = false;
  list.scrollTop = list.scrollHeight;
  close.focus();
}

/* ---------------- Panneau : placement du dispositif ---------------- */

function setLed(i, on) {
  const led = root.querySelectorAll('.lab-led')[i];
  if (led) led.classList.toggle('on', on);
}

function markLock(i, solved) {
  const li = ui.locks.children[i];
  if (!li) return;
  li.classList.toggle('is-open', solved);
  li.setAttribute('aria-label', `${t('Verrou')} ${i + 1} : ${t(solved ? 'ouvert' : 'fermé')}`);
  setLed(i, solved);
}

function phasePlacement() {
  return new Promise((resolve) => {
    S.phase = 'placement';
    const panel = ui.panel;
    panel.hidden = false;
    panel.className = 'lab-panel lab-place';
    panel.replaceChildren();
    const k = el('div', 'lab-kicker', 'Étape 1 · installer');
    const h = el('h2', 'lab-q', 'Place le dispositif dans la machine');
    const p = el('p', 'lab-hint-text', 'Glisse-le jusqu’à l’alvéole qui brille, ou utilise le bouton.');
    const b = el('button', 'lab-btn lab-gold lab-big', 'Placer le dispositif');
    b.type = 'button';
    b.append(el('kbd', null, 'Entrée'));
    panel.append(k, h, p, b);
    translateTree(panel);
    root.classList.add('wants-device');
    const done = () => {
      if (S.placed) return;
      S.placed = true;
      root.classList.remove('wants-device');
      placeDevice().then(resolve);
    };
    S.placeNow = done;
    b.addEventListener('click', done);
    setupDrag(done);
    setTimeout(() => b.focus({ preventScroll: true }), 50);
  });
}

function setupDrag(onDrop) {
  const d = ui.device;
  let drag = null;
  d.setAttribute('aria-hidden', 'false');
  d.setAttribute('role', 'img');
  d.setAttribute('aria-label', t('Dispositif à placer'));
  d.addEventListener('pointerdown', (e) => {
    if (S.placed) return;
    drag = { sx: e.clientX, sy: e.clientY };
    d.setPointerCapture(e.pointerId);
    d.classList.add('is-drag');
    ui.slot.classList.add('is-hot');
  });
  d.addEventListener('pointermove', (e) => {
    if (!drag) return;
    d.style.transform = `translate(-50%,-50%) translate(${e.clientX - drag.sx}px,${e.clientY - drag.sy}px) scale(1.12)`;
    const r = d.getBoundingClientRect(), s = ui.slot.getBoundingClientRect();
    ui.slot.classList.toggle('is-over', near(r, s));
  });
  const end = (e) => {
    if (!drag) return;
    const r = d.getBoundingClientRect(), s = ui.slot.getBoundingClientRect();
    const ok = near(r, s);
    drag = null;
    d.classList.remove('is-drag');
    ui.slot.classList.remove('is-hot', 'is-over');
    try { d.releasePointerCapture(e.pointerId); } catch (x) { /* déjà relâché */ }
    if (ok) onDrop();
    else { d.style.transform = ''; sfx.buzz(); }
  };
  d.addEventListener('pointerup', end);
  d.addEventListener('pointercancel', end);
}
function near(a, b) {
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2, bx = b.left + b.width / 2, by = b.top + b.height / 2;
  return Math.hypot(ax - bx, ay - by) < Math.max(b.width, b.height) * 0.55;
}

async function placeDevice() {
  const d = ui.device;
  d.classList.add('is-placing');
  d.style.transform = '';
  d.style.left = ui.slot.style.left; d.style.top = ui.slot.style.top;
  sfx.place();
  window.GamepadKit?.rumble?.(120, 0.5);
  await pause(650);
  d.classList.remove('is-placing');
  d.classList.add('is-seated');
  root.classList.add('is-armed');
  ui.panel.hidden = true;
  say(MSG.place.mood, MSG.place.text);
  await pause(1500);
}

/* ---------------- Énigmes ---------------- */

function renderEnigme(e, n, total) {
  const panel = ui.panel;
  panel.hidden = false;
  panel.className = 'lab-panel lab-enigme';
  panel.replaceChildren();
  const top = el('div', 'lab-p-top');
  top.append(el('span', 'lab-kicker', `Mot de passe ${n} sur ${total}`), el('span', 'lab-chip', e.titre));
  const q = el('h2', 'lab-q', e.question);
  q.id = 'labQ';
  const row = el('div', 'lab-answer');
  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'labInput';
  input.autocomplete = 'off'; input.autocapitalize = 'none'; input.spellcheck = false;
  input.maxLength = 40;
  input.setAttribute('aria-labelledby', 'labQ');
  input.setAttribute('aria-label', t('Ta réponse'));
  input.placeholder = t(e.kind === 'nombre' ? 'Un nombre…' : 'Un mot…');
  if (e.kind === 'nombre') input.inputMode = 'numeric';
  if (window.matchMedia && matchMedia('(pointer: coarse)').matches) input.inputMode = 'none';   // tactile : clavier du labo
  const ok = el('button', 'lab-btn lab-gold lab-valider', 'Valider');
  ok.type = 'button';
  ok.append(el('kbd', null, 'Entrée'));
  row.append(input, ok);

  const pad = el('div', 'lab-keypad ' + (e.kind === 'nombre' ? 'is-num' : 'is-abc'));
  pad.setAttribute('role', 'group');
  pad.setAttribute('aria-label', t('Clavier'));
  const keys = e.kind === 'nombre' ? KEYPAD_NUM : [...KEYPAD_ABC, '⌫', '↵'];
  for (const k of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lab-key' + (k === '↵' ? ' enter' : '') + (k === '⌫' ? ' back' : '');
    b.textContent = k;
    b.setAttribute('aria-label', k === '⌫' ? t('Effacer') : k === '↵' ? t('Valider') : k);
    b.addEventListener('click', () => {
      if (k === '⌫') input.value = input.value.slice(0, -1);
      else if (k === '↵') { submit(); return; }
      else if (input.value.length < input.maxLength) input.value += k;
      sfx.key(0.04);
    });
    pad.appendChild(b);
  }
  const status = el('div', 'lab-status');
  status.setAttribute('aria-live', 'polite');
  const help = el('button', 'lab-btn lab-glass lab-indice');
  help.type = 'button';
  const dots = el('span', 'lab-hdots');
  help.append(dots, el('span', 'lab-ico', '💡'), el('span', 'lab-l-long', 'Demander un indice à Tapama'), el('span', 'lab-l-short', 'Indice'), el('kbd', null, 'I'));
  help.querySelector('.lab-ico').setAttribute('aria-hidden', 'true');
  const foot = el('div', 'lab-p-foot');
  foot.append(help);
  panel.append(top, q, row, pad, status, foot);
  translateTree(panel);

  const cur = S.cur = { e, input, status, help, dots, wrong: 0, hints: 0, offered: false, busy: false };
  updateHelpButton();
  ok.addEventListener('click', submit);
  help.addEventListener('click', askHint);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); submit(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); input.blur(); }   // le labo ne se quitte pas
  });
  input.addEventListener('input', () => { cur.status.textContent = ''; cur.status.className = 'lab-status'; });
  if (!(window.matchMedia && matchMedia('(pointer: coarse)').matches)) setTimeout(() => input.focus({ preventScroll: true }), 60);
}

function updateHelpButton() {
  const c = S.cur; if (!c) return;
  const label = c.help.querySelector('.lbl') || document.createElement('span');
  c.dots.replaceChildren();
  for (let i = 0; i < 2; i++) c.dots.appendChild(el('i', i < c.hints ? 'on' : ''));
  c.help.setAttribute('aria-label', `${t(c.hints >= 2 ? 'Demander la réponse à Tapama' : 'Demander un indice à Tapama')} (${c.hints}/2)`);
  const lg = c.help.querySelector('.lab-l-long'), sh = c.help.querySelector('.lab-l-short');
  if (lg) lg.textContent = t(c.hints >= 2 ? 'Demander la réponse à Tapama' : 'Demander un indice à Tapama');
  if (sh) sh.textContent = t(c.hints >= 2 ? 'Réponse' : 'Indice');
  void label;
}

function giveHint(auto) {
  const c = S.cur, e = c.e;
  if (c.hints < 2) {
    const text = e.indices[c.hints];
    c.hints++; S.hintsUsed++;
    updateHelpButton();
    say(c.hints === 1 ? 'curieuse' : 'attentive', text);
    if (auto) { /* le message d'encouragement est déjà passé */ }
    return;
  }
  // 3e demande : Tapama propose de révéler la réponse (jamais bloqué)
  say(MSG.proposer.mood, MSG.proposer.text);
  c.offered = true;
  const yes = el('button', 'lab-btn lab-gold', 'Oui, donne-la-moi');
  const no = el('button', 'lab-btn lab-glass', 'Non, je cherche encore');
  yes.type = no.type = 'button';
  yes.addEventListener('click', () => {
    say(MSG.revele.mood, MSG.revele.text.replace('{r}', e.affichee));
    c.input.value = e.affichee;
    c.input.focus({ preventScroll: true });
  });
  no.addEventListener('click', () => { say(MSG.refus.mood, MSG.refus.text); c.input.focus({ preventScroll: true }); });
  ui.bubbleActions.append(yes, no);
  setTimeout(() => yes.focus({ preventScroll: true }), 30);
}

function askHint() {
  if (!S || !S.cur || S.cur.busy || S.phase !== 'enigme') return;
  giveHint(false);
}

function submit() {
  if (!S || !S.cur || S.cur.busy || S.phase !== 'enigme' || locked()) return;
  const c = S.cur, e = c.e;
  const res = verifier(e, c.input.value);
  if (res.statut === 'vide') { say(MSG.vide.mood, MSG.vide.text); c.input.focus({ preventScroll: true }); return; }
  if (res.statut === 'ok') { c.busy = true; c.resolve(); return; }
  // mauvaise réponse
  c.wrong++;
  c.status.textContent = t('Ce n’est pas ça. Essaie encore !');
  c.status.className = 'lab-status is-bad';
  ui.panel.classList.remove('shake'); void ui.panel.offsetWidth; ui.panel.classList.add('shake');
  { const h = c.help; h.classList.remove('call'); void h.offsetWidth; h.classList.add('call'); }       // le bouton d'indice se secoue et brille : « clique sur moi »
  sfx.buzz();
  window.GamepadKit?.rumble?.(160, 0.4);
  const illisible = e.kind === 'nombre' && lireNombre(c.input.value) == null;
  say('inquiete', illisible ? MSG.illisible.text : (res.statut === 'proche' && e.proche ? e.proche : e.erreur));
  if (c.wrong % 2 === 0 && c.hints < 2) {
    // après 2 erreurs, Tapama propose d'elle-même l'indice suivant
    setTimeout(() => { if (S && S.cur === c && !c.busy) { say(MSG.autoIndice.mood, MSG.autoIndice.text); setTimeout(() => { if (S && S.cur === c && !c.busy) giveHint(true); }, 1400); } }, 2200);
  }
  c.input.select();
}

function burst(host) {
  const box = el('div', 'lab-sparks');
  for (let i = 0; i < 16; i++) {
    const s = document.createElement('i');
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4, r = 46 + Math.random() * 60;
    s.style.setProperty('--x', Math.cos(a) * r + 'px');
    s.style.setProperty('--y', Math.sin(a) * r + 'px');
    s.style.setProperty('--c', ['#f9d58b', '#7fd0ff', '#fff'][i % 3]);
    box.appendChild(s);
  }
  host.appendChild(box);
  setTimeout(() => box.remove(), 1000);
}

async function runEnigme(e, n, total) {
  S.phase = 'enigme';
  renderEnigme(e, n, total);
  say(n === 1 && !S.sawEnigme ? 'curieuse' : 'attentive', n === 1 ? 'Lis bien la question, {nom}. Tu peux m’appeler à l’aide quand tu veux.' : 'Au suivant. Ta réponse, {nom} ?');
  S.sawEnigme = true;
  await new Promise((resolve) => { S.cur.resolve = resolve; });
  guard();
  const c = S.cur;
  // réussite : le verrou saute
  c.input.disabled = true;
  ui.panel.classList.add('is-win');
  const li = ui.locks.children[e.index];
  markLock(e.index, true);
  li.classList.add('pop');
  burst(li);
  burst(ui.panel);
  sfx.unlock();
  window.GamepadKit?.rumble?.(220, 0.7);
  say('souriante', e.succes);
  S.solved.push(e.index);
  store(`taama.lab${S.stage}.q`, S.solved.length);
  window.dispatchEvent(new CustomEvent('lab:enigme-resolue', { detail: { stage: S.stage, index: e.index } }));
  await pause(2600);
  if (e.apres && n < total) { say(e.apres.mood, e.apres.text); await pause(2600); }
  S.cur = null;
}

/* ---------------- Projections ---------------- */

function noiseLoop(canvas, getIntensity) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  let raf = 0, stop = false;
  const frame = () => {
    if (stop) return;
    const k = getIntensity();
    const img = g.createImageData(w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() < k ? 150 + Math.random() * 105 : 0;
      d[i] = v * 0.55; d[i + 1] = v * 0.85; d[i + 2] = v; d[i + 3] = v ? 200 : 0;
    }
    g.putImageData(img, 0, 0);
    raf = requestAnimationFrame(frame);
  };
  frame();
  return () => { stop = true; cancelAnimationFrame(raf); g.clearRect(0, 0, w, h); };
}

async function projection1() {
  S.phase = 'projection';
  ui.panel.hidden = true;
  root.classList.add('is-dim');
  ui.holo.hidden = false;
  ui.holo.className = 'lab-holo is-video';
  const v = ui.video;
  v.src = new URL('../' + mediaUrl('introVideo').replace(/ /g, '%20'), import.meta.url).href;
  v.muted = true; v.playsInline = true; v.loop = true;
  try { v.currentTime = 2; } catch (e) { /* métadonnées pas prêtes */ }
  const playing = v.play();
  if (playing && playing.catch) playing.catch(() => ui.holo.classList.add('no-video'));
  const stopHum = sfx.hum(0.05);
  let k = 0.01;
  const stopNoise = noiseLoop(ui.noise, () => k);
  window.GamepadKit?.rumble?.(300, 0.3);
  requestAnimationFrame(() => ui.holo.classList.add('on'));
  await pause(1100);
  say(LIGNES.proj1.mood, LIGNES.proj1.text);
  S.log[S.log.length - 1] = { ...LIGNES.proj1 };
  await pause(PROJ_MS - 3300);
  k = 0.12;
  ui.holo.classList.add('glitch');
  await pause(1500);
  k = 0.6;
  await pause(700);
  // coupure brutale
  coupure(stopNoise, stopHum, 1000);
  await pause(1100);
  v.pause();
  ui.holo.hidden = true; ui.holo.className = 'lab-holo';
  root.classList.remove('is-dim');
  await pause(300);
}

function coupure(stopNoise, stopHum, ms) {
  stopNoise(); stopHum && stopHum();
  ui.black.classList.add('on');
  ui.holo.classList.add('cut');
  sfx.crackle(ms / 1000 + 0.2, 0.25);
  window.GamepadKit?.rumble?.(260, 0.9);
  setTimeout(() => { if (ui) ui.black.classList.remove('on'); }, ms);
}

async function projection2() {
  S.phase = 'projection';
  ui.panel.hidden = true;
  root.classList.add('is-dim', 'is-big');
  ui.holo.hidden = false;
  ui.holo.className = 'lab-holo is-map is-big';
  ui.holoMap.innerHTML = mapSVG();
  const stopHum = sfx.hum(0.07);
  let k = 0.01;
  const stopNoise = noiseLoop(ui.noise, () => k);
  window.GamepadKit?.rumble?.(300, 0.35);
  requestAnimationFrame(() => ui.holo.classList.add('on'));
  await pause(1000);
  ui.holo.classList.add('draw');
  await pause(2200);
  say(LIGNES.proj2.mood, LIGNES.proj2.text);
  S.log[S.log.length - 1] = { ...LIGNES.proj2 };
  await pause(2800);
  k = 0.12;
  ui.holo.classList.add('glitch');
  await pause(1300);
  k = 0.65;
  await pause(600);
  // la projection plante : noir total 2 s, puis lumière d'urgence rouge
  coupure(stopNoise, stopHum, 2000);
  sfx.powerDown();
  await pause(1000);
  ui.holo.hidden = true; ui.holo.className = 'lab-holo';
  ui.holoMap.replaceChildren();
  root.classList.remove('is-dim', 'is-big');
  root.classList.add('is-emergency');
  await pause(1300);
}

async function typing(ms = 3200) {
  guard();
  ui.typingFace.src = PORTRAIT('attentive');
  ui.kbd.replaceChildren();
  for (let i = 0; i < 36; i++) ui.kbd.appendChild(el('i'));
  ui.typing.hidden = false;
  requestAnimationFrame(() => ui.typing.classList.add('on'));
  const t0 = performance.now();
  const keys = [...ui.kbd.children];
  while (performance.now() - t0 < ms) {
    const k = keys[Math.floor(Math.random() * keys.length)];
    k.classList.add('hit'); setTimeout(() => k.classList.remove('hit'), 90);
    sfx.key(0.05 + Math.random() * 0.03);
    await pause(70 + Math.random() * 110);
  }
  ui.typing.classList.remove('on');
  await pause(250);
  ui.typing.hidden = true;
}

/* ---------------- Scénario ---------------- */

async function scene(stage, onDone) {
  const myRun = S.run;
  try {
    await ensureCss();
    guard();
    const list = enigmesDuStade(stage);
    const resume = S.solved.length;
    root.classList.add('on');
    window.dispatchEvent(new CustomEvent('lab:open', { detail: { stage } }));
    store(`taama.lab${stage}`, 'open');
    list.slice(0, resume).forEach((e) => markLock(e.index, true));

    await pause(500);
    if (resume === 0) {
      await dialogue(`intro${stage}`, stage === 1 ? LIGNES.intro1 : LIGNES.intro2);
      say(MSG.placer.mood, MSG.placer.text);
      await phasePlacement();
    } else {
      ui.device.classList.add('is-seated'); ui.device.style.left = ui.slot.style.left; ui.device.style.top = ui.slot.style.top;
      root.classList.add('is-armed');
      S.placed = true;
      say(MSG.reprise.mood, MSG.reprise.text);
      await pause(900);
    }
    if (resume < 3) {
      for (let i = resume; i < 3; i++) await runEnigme(list[i], i + 1, 3);
    }
    ui.panel.hidden = true;
    await (stage === 1 ? projection1() : projection2());
    await dialogue(`coupure${stage}`, stage === 1 ? LIGNES.coupure1 : LIGNES.coupure2);
    await typing();
    await dialogue(`fin${stage}`, stage === 1 ? LIGNES.fin1 : LIGNES.fin2);

    guard();
    store(`taama.lab${stage}`, 'done');
    store(`taama.lab${stage}.q`, 3);
    if (stage === 2) store('taama.revelation', '1');
    window.dispatchEvent(new CustomEvent('lab:done', { detail: { stage } }));
    cleanup(myRun);
    try { onDone && onDone(); } catch (e) { console.error(e); }
  } catch (err) {
    if (!(err instanceof Annule)) { console.error('[Lab]', err); cleanup(myRun); }
  }
}

function cleanup(myRun) {
  if (S && S.run !== myRun) return;
  if (ui && ui.video) { try { ui.video.pause(); ui.video.removeAttribute('src'); ui.video.load(); } catch (e) { /* rien */ } }
  if (root) { root.classList.remove('on'); const r = root; setTimeout(() => r.remove(), 450); }
  if (S) S.open = false;
  root = null; ui = null;
  api.isOpen = false;
}

function open(opts = {}) {
  if (!browser) return false;
  const stage = opts.stage === 2 ? 2 : 1;
  if (S && S.open) close();
  runId++;
  const saved = load(`taama.lab${stage}`) === 'done' ? 0 : Math.min(3, Math.max(0, parseInt(load(`taama.lab${stage}.q`), 10) || 0));
  S = { run: runId, stage, open: true, phase: 'intro', solved: Array.from({ length: saved }, (_, i) => i), hintsUsed: 0, log: [], cur: null, placed: false };
  buildUI(stage);
  api.isOpen = true;
  startPadLoop();
  scene(stage, opts.onDone);
  return true;
}

function close() {
  if (!S || !S.open) return;
  runId++;
  const r = root, v = ui && ui.video;
  if (v) { try { v.pause(); } catch (e) { /* rien */ } }
  try { if (ui && ui.faceFx) ui.faceFx.detach(); if (window.TapamaVoice) window.TapamaVoice.stop(); } catch (e) { /* rien */ }
  if (r) r.remove();
  S.open = false;
  root = null; ui = null;
  api.isOpen = false;
}

function state() {
  if (!S) return { stage: 0, solved: [], hintsUsed: 0, phase: 'closed', isOpen: false };
  return { stage: S.stage, solved: [...S.solved], hintsUsed: S.hintsUsed, phase: S.open ? S.phase : 'closed', isOpen: !!S.open };
}

/* ==========================================================
   6. ENTRÉES : clavier + manette
   ========================================================== */

function typingTarget(e) {
  const x = e.target;
  return x && x.nodeType === 1 && (/^(input|textarea|select)$/i.test(x.tagName) || x.isContentEditable);
}

if (browser) {
  window.addEventListener('tapama:dialogue-end', () => { if (S && S.open) { lock(); setTimeout(refocus, 60); } });

  window.addEventListener('keydown', (e) => {
    if (!S || !S.open || !root) return;
    if (tapamaBusy()) return;                              // le dialogue du jeu garde le clavier
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    // Échap ne quitte pas le labo : on referme seulement l'historique
    if (k === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!ui.history.hidden) toggleHistory();
      return;
    }
    if (typingTarget(e)) return;                           // saisie : les raccourcis ne s'appliquent pas
    if (!ui.history.hidden) {
      if (k === 'Enter' || k === 'h' || k === 'H' || k === 'r' || k === 'R') { e.preventDefault(); e.stopImmediatePropagation(); toggleHistory(); }
      return;
    }
    if ((k === 'h' || k === 'H' || k === 'r' || k === 'R') && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); toggleHistory(); return; }
    if (S.phase === 'placement' && (k === 'p' || k === 'P') && S.placeNow) { e.preventDefault(); S.placeNow(); return; }
    if (S.phase === 'enigme' && S.cur) {
      if ((k === 'i' || k === 'I') && !e.repeat) { e.preventDefault(); askHint(); return; }
      // un caractère tapé hors du champ : on le renvoie dans le champ
      const inp = S.cur.input;
      if (!inp.disabled && document.activeElement && !document.activeElement.closest('.lab-keypad') && (/^[0-9a-zA-Zà-ÿ]$/.test(k))) { inp.focus(); }
    }
  }, true);
}

function refocus() {
  if (!S || !S.open || !ui || tapamaBusy()) return;
  const c = S.cur;
  if (S.phase === 'enigme' && c && c.input && !c.input.disabled && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) c.input.focus({ preventScroll: true });
  else if (S.phase === 'placement') { const b = ui.panel.querySelector('.lab-big'); b && b.focus({ preventScroll: true }); }
}

/** Navigation spatiale à la croix directionnelle. */
function padNav(dir) {
  const scope = !ui.history.hidden ? ui.history : root;
  let cands = [...scope.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter((n) => n.offsetParent !== null && !n.closest('[hidden]'));
  if (scope === root && S && S.phase === 'enigme') {            // pendant une énigme, la croix ne parcourt que le pavé, « valider » et « indice » (Relire = bouton Y)
    const only = cands.filter((n) => n.classList.contains('lab-key') || n.classList.contains('lab-btn') && n !== (ui && ui.relire) || n.tagName === 'INPUT');
    if (only.length) cands = only;
  }
  if (!cands.length) return;
  const cur = document.activeElement && cands.includes(document.activeElement) ? document.activeElement : null;
  if (!cur) { (cands.find((n) => n.classList.contains('lab-key')) || cands[0]).focus(); return; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const n of cands) {
    if (n === cur) continue;
    const b = n.getBoundingClientRect();
    const dx = b.left + b.width / 2 - ax, dy = b.top + b.height / 2 - ay;
    const along = dir === 'LEFT' ? -dx : dir === 'RIGHT' ? dx : dir === 'UP' ? -dy : dy;
    if (along < 4) continue;
    const across = dir === 'LEFT' || dir === 'RIGHT' ? Math.abs(dy) : Math.abs(dx);
    const score = along + across * 2.2;
    if (score < bestScore) { bestScore = score; best = n; }
  }
  if (best) best.focus();
}

let stickDir = null, stickT = 0;
function startPadLoop() {
  if (padLoopOn) return;
  padLoopOn = true;
  const loop = () => {
    if (!S || !S.open) { padLoopOn = false; return; }
    requestAnimationFrame(loop);
    const gk = window.GamepadKit;       // le labo gèle le monde (GamepadKit.capture) : on lit la manette en DIRECT (raw), sinon rien ne passe
    const p = gk && { connected: () => gk.connected(), justPressed: (n) => (gk.raw || gk).justPressed(n) };
    if (!p || !p.connected() || locked() || tapamaBusy() || !ui) return;
    if (p.justPressed('Y')) { toggleHistory(); return; }
    if (!ui.history.hidden) { if (p.justPressed('A') || p.justPressed('B')) toggleHistory(); return; }
    for (const d of ['UP', 'DOWN', 'LEFT', 'RIGHT']) if (p.justPressed(d)) { padNav(d); return; }
    // stick gauche : même navigation que la croix (un cran par bascule, répétition lente si maintenu)
    const st = (gk.raw || gk).state(), now = performance.now();
    const sd = Math.abs(st.lx) > 0.6 && Math.abs(st.lx) >= Math.abs(st.ly) ? (st.lx > 0 ? 'RIGHT' : 'LEFT') : Math.abs(st.ly) > 0.6 ? (st.ly > 0 ? 'DOWN' : 'UP') : null;
    if (!sd) stickDir = null;
    else if (sd !== stickDir || now - stickT > 320) { stickDir = sd; stickT = now; padNav(sd); return; }
    if (p.justPressed('A')) {
      const f = document.activeElement;
      if (f && f.closest && f.closest('#labRoot') && f.tagName === 'BUTTON') f.click();
      else if (S.phase === 'placement' && S.placeNow) S.placeNow();
      else if (S.phase === 'enigme') submit();
    } else if (p.justPressed('B')) {
      if (S.phase === 'enigme' && S.cur && !S.cur.busy) S.cur.input.value = S.cur.input.value.slice(0, -1);
    } else if (p.justPressed('X')) askHint();
    else if (p.justPressed('START') && S.phase === 'enigme') submit();
  };
  requestAnimationFrame(loop);
}

/* ---------------- API publique ---------------- */

const api = { open, close, state, isOpen: false, ENIGMES, verifier };
if (browser) window.Lab = api;
export default api;
