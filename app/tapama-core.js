/* ==========================================================
   TAPAMA — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   Tapama Traoré n'apparaît JAMAIS en 3D : uniquement un portrait
   2D accompagné de bulles de texte (document de conception §3.2).

   Ce module contient :
     • les dialogues clés du document (§8) et les appels radio ;
     • les moteurs sans DOM : séquence de dialogue (suivant / passer /
       historique) et file d'appels radio (durée selon la longueur) ;
     • les niveaux d'aide et les analyses d'indices.

   L'interface (portrait, bulles, touches) est dans tapama.js.
   Les textes marqués « proposition » ne viennent pas du document :
   à relire par l'équipe d'écriture.

   {nom} = le prénom du joueur (saisi à sa première partie) : voir fillName()
   dans player-profile.js. Sans prénom, la phrase reste correcte.
   ========================================================== */

export const PORTRAIT_DIR = 'assets/images/tapama/';
export const MOODS = ['neutre', 'curieuse', 'inquiete', 'surprise', 'attentive', 'souriante'];
export const DEFAULT_MOOD = 'neutre';

/** Expression valide (repli sur « neutre »). */
export function safeMood(mood) {
  return MOODS.includes(mood) ? mood : DEFAULT_MOOD;
}

export function portraitUrl(mood) {
  return `${PORTRAIT_DIR}tapama-${safeMood(mood)}.webp`;
}

/* ---------------------------------------------------------
   Dialogues avant la partie (document §8)
   who : 'tapama' | 'player'
   --------------------------------------------------------- */
export const SEQUENCES = {
  ouverture: {
    id: 'ouverture',
    chapter: 'Séquence 3',
    title: 'Ouverture · Tapama',
    lines: [
      { who: 'tapama', mood: 'souriante', text: 'Salut {nom} ! Je suis Tapama Traoré. Je porte le nom d’une héroïne de Djenné, Tapama Djénépo. Elle a veillé sur la ville, et je suis sa descendante.' },
      { who: 'tapama', mood: 'neutre', text: 'La légende raconte qu’elle s’est sacrifiée pour que Djenné tienne debout. Chez nous, on dit que les secrets de la ville appartiennent à ceux qui osent les chercher.' },
      { who: 'tapama', mood: 'curieuse', text: 'Depuis quelques années, je cherche un ancien dispositif caché dans la Grande Mosquée. Mon grand-père m’en parlait déjà quand j’étais petite, le soir, sous le ciel de Djenné.' },
      { who: 'tapama', mood: 'attentive', text: 'Mes recherches sont formelles : il existe, quelque part dans la mosquée. J’ignore ce qu’il fait. Je veux le découvrir, et pour ça j’ai besoin de toi, {nom}.' },
      { who: 'player', text: 'Je suis prêt. Qu’est-ce que je dois faire ?' },
      { who: 'tapama', mood: 'souriante', text: 'Fais décoller ton drone. Inspecte tous les recoins de la mosquée, en commençant par le haut. Je te guide par radio. Allez, on y va !' },
    ],
  },
  appel: {
    id: 'appel',
    chapter: 'Séquence 3',
    title: 'L’appel de Tapama',
    lines: [
      { who: 'tapama', mood: 'neutre', text: '{nom}, j’ai découvert quelque chose près de la mosquée. Je ne sais pas encore ce que c’est, mais certains détails ne correspondent à rien de ce que j’ai étudié.' },
      { who: 'player', text: 'Tu penses que c’est dangereux ?' },
      { who: 'tapama', mood: 'inquiete', text: 'Je ne sais pas. C’est justement pour cela que j’ai besoin de toi, {nom}. Viens examiner l’endroit avant que quelqu’un d’autre ne le découvre.' },
    ],
  },
  dispositif: {
    id: 'dispositif',
    chapter: 'Séquence 5',
    title: 'Le premier dispositif',
    lines: [
      { who: 'player', text: 'Tu vois ça ? On dirait une image… mais ce n’est pas un écran.' },
      { who: 'tapama', mood: 'curieuse', text: 'Ce n’est pas une projection ordinaire, {nom}. Regarde les détails. Tout semble lié à un événement précis.' },
      { who: 'player', text: 'Et pourquoi ça s’arrête ?' },
      { who: 'tapama', mood: 'attentive', text: 'Il manque quelque chose. Nous devons trouver l’autre dispositif.' },
    ],
  },
  vol: {
    id: 'vol',
    chapter: 'Séquence 7',
    title: 'Le vol',
    lines: [
      { who: 'player', text: 'Ils ont pris l’objet ! Je les ai vus partir vers les ruelles.' },
      { who: 'tapama', mood: 'inquiete', text: 'Ne les perds pas de vue, {nom}. Je vais essayer de comprendre ce qu’ils savent déjà. Fais attention, nous ne savons pas qui ils sont ni jusqu’où ils sont prêts à aller.' },
    ],
  },
  base: {
    id: 'base',
    chapter: 'Séquence 10',
    title: 'Dans la base',
    lines: [
      { who: 'player', text: 'Ils connaissaient déjà les autres emplacements. Ce n’est pas une découverte accidentelle.' },
      { who: 'tapama', mood: 'attentive', text: 'Alors ils ne sont pas ici pour revendre un objet. Ils cherchent quelque chose de précis.' },
    ],
  },
  revelation: {
    id: 'revelation',
    chapter: 'Séquence 11',
    title: 'La synchronisation',
    lines: [
      { who: 'tapama', mood: 'surprise', text: 'Regarde cette carte, {nom}. Djenné n’est qu’un point parmi d’autres.' },
      { who: 'player', text: 'Bandiagara… Ségou… et cette piste vers Lomé.' },
      { who: 'tapama', mood: 'attentive', text: 'Nous pensions avoir trouvé deux objets isolés. Mais ils font partie d’un ensemble.' },
      { who: 'player', text: 'Alors nous devons découvrir qui les a créés et pourquoi NÉANTIS les veut absolument.' },
    ],
  },
};

export const PLAYER_NAME = 'Toi';
export const TAPAMA_NAME = 'Tapama';

/* ---------------------------------------------------------
   Moteur de séquence de dialogue (sans DOM)
   --------------------------------------------------------- */
export function createSequence(seq) {
  const lines = (seq && seq.lines) || [];
  let index = 0;
  let finished = lines.length === 0;
  let skipped = false;

  return {
    get id() { return seq ? seq.id : ''; },
    get total() { return lines.length; },
    get index() { return index; },
    get done() { return finished; },
    get skipped() { return skipped; },
    current() { return finished ? null : lines[index]; },
    /** Réplique suivante (affichée juste après). */
    upcoming() { return finished ? null : (lines[index + 1] || null); },
    /** true si une nouvelle réplique est affichée, false si la séquence se termine. */
    next() {
      if (finished) return false;
      if (index >= lines.length - 1) { finished = true; return false; }
      index += 1;
      return true;
    },
    /** Termine la séquence sans parcourir les répliques restantes. */
    skip() {
      if (finished) return;
      finished = true;
      skipped = true;
    },
    /** Répliques déjà lues, y compris l'actuelle. */
    history() {
      const upTo = finished ? lines.length : index + 1;
      return lines.slice(0, upTo);
    },
  };
}

/* ---------------------------------------------------------
   Appels radio pendant la partie
   --------------------------------------------------------- */
export const RADIO = {
  suivre: { mood: 'inquiete', text: 'Ne les perds pas de vue, {nom}. Je vais essayer de comprendre ce qu’ils savent déjà.' },
  attention: { mood: 'inquiete', text: 'Fais attention, {nom}, ils sont plus rapides que toi.' },          // proposition
  base: { mood: 'attentive', text: 'Alors ils ne sont pas ici pour revendre un objet. Ils cherchent quelque chose de précis.' },
  reperage: { mood: 'curieuse', text: 'Prends une photo avec le drone, {nom}, je regarde ce que ça donne.' }, // proposition
  indice: { mood: 'curieuse', text: 'Tu as trouvé quelque chose, {nom} ? Montre-moi.' },                  // proposition
  // Scène 1 : vol d'inspection (bible de scénario, chapitre 1)
  inspection: { mood: 'curieuse', text: 'Commence par le toit, {nom}. Les secrets aiment les hauteurs. Prends des photos si quelque chose te semble bizarre.' },
  inspectionIndice: { mood: 'attentive', text: 'Cherche un objet qui ne ressemble pas à de la terre ou à du bois. Quelque chose de lisse, avec des motifs.' },
  inspectionRepere: { mood: 'surprise', text: 'Attends… zoome encore ! Là, à moitié enfoui. C’est ça, {nom} ! Atterris et va le chercher.' },
};

/** Durée d'affichage d'une bulle radio (secondes), selon la longueur du texte. */
export function radioDuration(text) {
  const n = String(text || '').length;
  return Math.min(9, Math.max(3.5, 2.5 + n * 0.045));
}

/**
 * File d'appels radio : un appel à la fois, les suivants attendent.
 * tick(dt) renvoie 'start' | 'end' | null pour que l'interface réagisse.
 */
export function createRadioQueue(maxQueued = 3) {
  let current = null;       // { text, mood, left, total }
  const queue = [];

  const shift = () => {
    const n = queue.shift();
    current = n ? { text: n.text, mood: safeMood(n.mood), left: n.duration, total: n.duration, quiet: !!n.quiet } : null;
    return n;
  };

  return {
    push(call) {
      if (!call || !call.text) return false;
      const item = { text: call.text, mood: call.mood, duration: call.duration || radioDuration(call.text), quiet: !!call.quiet };   // quiet : pas de notification sonore (relecture)
      if (!current) { queue.push(item); shift(); return true; }
      if (queue.length >= maxQueued) return false;
      queue.push(item);
      return true;
    },
    current() { return current; },
    pending() { return queue.length; },
    progress() { return current ? 1 - current.left / current.total : 0; },
    /** Ferme l'appel en cours et passe au suivant. Renvoie true s'il y en a un nouveau. */
    dismiss() {
      if (!current) return false;
      return !!shift();
    },
    clear() { current = null; queue.length = 0; },
    tick(dt) {
      if (!current) return null;
      current.left -= dt;
      if (current.left > 0) return null;
      return shift() ? 'start' : 'end';
    },
  };
}

/* ---------------------------------------------------------
   Aide de Tapama (facultative, 3 niveaux, jamais la solution)
   Textes : propositions à valider.
   --------------------------------------------------------- */
export const HELP_LEVELS = [
  { level: 1, title: 'Rappeler l’objectif', desc: 'Tapama résume ce que vous cherchez et où en est l’enquête.' },
  { level: 2, title: 'Donner un indice', desc: 'Elle attire ton attention sur un détail à observer.' },
  { level: 3, title: 'Réfléchir ensemble', desc: 'Elle propose une hypothèse que tu peux confirmer ou corriger.' },
];

export const PUZZLES = {
  dispositif1: {
    id: 'dispositif1',
    chapter: 'Séquence 5',
    title: 'Le premier dispositif',
    prompt: 'Regarde bien le dispositif. Certains motifs se répètent, et pas par hasard. Qu’est-ce qui change d’un côté à l’autre ?',
    levels: {
      1: { mood: 'neutre', text: 'On cherche à activer le premier dispositif trouvé près de la mosquée. Il doit réagir à une interaction précise.' },
      2: { mood: 'attentive', text: 'Observe les motifs gravés sur sa surface. Certains se répètent, d’autres non.' },
      3: { mood: 'curieuse', text: 'Je pense que les motifs qui changent indiquent un ordre à respecter. Tu veux essayer dans ce sens ?' },
    },
  },
  general: {
    id: 'general',
    chapter: 'Mode libre',
    title: 'Exploration',
    prompt: 'Prends ton temps, observe les lieux. Je suis là si tu as besoin de moi.',
    levels: {
      1: { mood: 'neutre', text: 'Observe les alentours, utilise le drone pour repérer ce qui sort de l’ordinaire.' },
      2: { mood: 'attentive', text: 'Regarde les détails de l’architecture : un élément qui ne ressemble pas aux autres vaut un coup d’œil.' },
      3: { mood: 'curieuse', text: 'Si une zone te paraît étrange, photographie-la avec le drone et nous en reparlerons.' },
    },
  },
};

export function helpFor(puzzleId, level) {
  const p = PUZZLES[puzzleId] || PUZZLES.general;
  const lv = Math.max(1, Math.min(3, Math.floor(level) || 1));
  const answer = p.levels[lv];
  return { puzzle: p, level: lv, mood: safeMood(answer.mood), text: answer.text };
}

/* ---------------------------------------------------------
   Analyse d'un indice (hypothèses qui évoluent)
   state : 'ok' (confirmée) | 'open' (question ouverte)
   --------------------------------------------------------- */
export const ANALYSES = {
  projection: {
    id: 'projection',
    title: 'La projection du dispositif',
    mood: 'curieuse',
    quote: 'Ce n’est pas une projection ordinaire. Regarde les détails. Tout semble lié à un événement précis.',
    hypotheses: [
      { state: 'ok', text: 'Ce n’est pas un écran' },
      { state: 'ok', text: 'La scène est liée à un événement précis' },
      { state: 'open', text: 'Pourquoi la séquence s’arrête-t-elle ?' },
    ],
  },
};

/** Statistiques d'une analyse : { confirmed, open } */
export function analysisSummary(analysis) {
  const hyps = (analysis && analysis.hypotheses) || [];
  return {
    confirmed: hyps.filter(h => h.state === 'ok').length,
    open: hyps.filter(h => h.state === 'open').length,
  };
}
