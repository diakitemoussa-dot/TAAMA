/* ==========================================================
   GUIDE « COMMENT JOUER » — logique pure (aucune dépendance navigateur)
   ----------------------------------------------------------
   • mode de commande : tactile / manette / clavier-souris
   • objectif du moment selon l'avancement de l'histoire (clés taama.*)
   • état mémorisé (taama.guide.v1) : sujets vus, préférences
   • comptage de mots (les textes français tiennent en 10 mots)
   Testé sous Node : tests/guide.test.mjs
   ========================================================== */

export const STORE_KEY = 'taama.guide.v1';
export const MODES = ['kbd', 'pad', 'touch'];
export const MAX_WORDS = 10;

/* ---------- Mode de commande ---------- */

/** Le téléphone / la tablette : pointeur « coarse » + écran tactile, ou ?touch=1 ; ?touch=0 le refuse. */
export function isTouch({ touchParam = null, coarse = false, maxTouchPoints = 0 } = {}) {
  if (touchParam === '0') return false;
  if (touchParam === '1') return true;
  return !!coarse && maxTouchPoints > 0;
}

/** Mode à afficher. `last` = dernier périphérique RÉELLEMENT utilisé ('kbd' | 'pad' | 'touch' | null) : il prime si ce mode existe ;
    sans entrée : tactile si écran tactile, sinon clavier (la simple présence d'une manette ne change rien). */
export function pickMode({ touchParam = null, coarse = false, maxTouchPoints = 0, pad = false, last = null } = {}) {
  const touch = isTouch({ touchParam, coarse, maxTouchPoints });
  const ok = { touch, pad: !!pad, kbd: true };
  if (last && ok[last]) return last;
  return touch ? 'touch' : 'kbd';                                    // valeur de départ : une manette branchée ne suffit pas (il faut une vraie entrée de manette : `last`)
}

/* ---------- Avancement → objectif ---------- */

/** flags : valeurs brutes des clés taama.* (chaînes ou null) → { id, topic, action }. */
export function chooseObjective(f = {}) {
  const is = (v, x = '1') => v === x;
  if (is(f.chapitre1, 'done') || is(f.lab2, 'done')) return OBJ.fin;
  if (is(f.dispositif2)) return OBJ.retour;                              // le deuxième dispositif est récupéré : retour au labo
  if (is(f.gadget)) return OBJ.base;                                     // gadget débloqué : direction la base
  if (is(f.lab1, 'done')) return OBJ.devant;                             // labo 1 fini : retour devant la mosquée
  if (is(f.dispositif1)) return OBJ.labo;                                // dispositif en poche : cercle jaune
  if (is(f.spotted)) return OBJ.ramasser;                                // repéré par le drone
  if (f.acte === '0:done' || f.acte === '1:vol') return f.drone ? OBJ.spot : OBJ.start;   // f.drone : le joueur a déjà piloté son drone
  return OBJ.start;
}
export const OBJ = {
  start: { id: 'start', topic: 'drone', action: 'drone' },
  spot: { id: 'spot', topic: 'fly', action: 'drone' },
  ramasser: { id: 'ramasser', topic: 'interact', action: 'interact' },
  labo: { id: 'labo', topic: 'circle', action: 'map' },
  devant: { id: 'devant', topic: 'map', action: 'map' },
  base: { id: 'base', topic: 'gadget', action: 'gadget' },
  retour: { id: 'retour', topic: 'circle', action: 'map' },
  fin: { id: 'fin', topic: 'map', action: 'map' },
};
/** Sujet du guide à proposer d'abord, selon l'avancement. */
export const suggestTopic = (f) => chooseObjective(f).topic;

/* ---------- État mémorisé ---------- */

/** Version du schéma : les conseils vus (ou « Passer le guide ») mémorisés par une ANCIENNE version du guide ne comptent plus ; les préférences d'accessibilité restent. */
export const STATE_VERSION = 2;
export const defaultState = () => ({ v: STATE_VERSION, seen: {}, prefs: { large: false, reduce: null, speak: false, off: false } });

export function parseState(raw) {
  const out = defaultState();
  let o = raw;
  if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (_) { o = null; } }
  if (!o || typeof o !== 'object') return out;
  const fresh = o.v === STATE_VERSION;
  if (fresh && o.seen && typeof o.seen === 'object') for (const k of Object.keys(o.seen)) if (typeof k === 'string' && k.length < 40 && o.seen[k]) out.seen[k] = 1;
  const p = o.prefs && typeof o.prefs === 'object' ? o.prefs : {};
  out.prefs.large = p.large === true;
  out.prefs.reduce = typeof p.reduce === 'boolean' ? p.reduce : null;     // null = suivre le système (prefers-reduced-motion)
  out.prefs.speak = p.speak === true;
  out.prefs.off = fresh && p.off === true;
  return out;
}
export const serializeState = (s) => JSON.stringify(parseState(s));
export const hasSeen = (s, id) => !!(s && s.seen && s.seen[id]);
export const markSeen = (s, id) => ({ ...s, seen: { ...s.seen, [id]: 1 } });
export const resetSeen = (s) => ({ ...s, seen: {}, prefs: { ...s.prefs, off: false } });
/** Un conseil en jeu peut-il s'afficher ? (guide non passé, pas déjà vu) */
export const canHint = (s, id) => !s.prefs.off && !hasSeen(s, id);

/** Animations réduites : choix du joueur, sinon préférence du système. */
export const reducedMotion = (s, system = false) => (typeof s.prefs.reduce === 'boolean' ? s.prefs.reduce : !!system);

/* ---------- Textes ---------- */

/** Nombre de mots d'un texte (les signes de ponctuation seuls ne comptent pas). */
export const wordCount = (text) => String(text == null ? '' : text).split(/\s+/).filter((w) => /[A-Za-zÀ-ÿ0-9]/.test(w)).length;
