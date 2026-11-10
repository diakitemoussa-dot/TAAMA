/* ==========================================================
   LANGUE : FRANÇAIS / ENGLISH
   ----------------------------------------------------------
   Le français est la langue d'écriture : les textes du jeu sont écrits en
   français dans le code et dans les écrans. En anglais, chaque texte est
   cherché dans le dictionnaire (i18n-en.js) ; s'il n'y est pas, il reste
   en français (jamais de texte vide).

   • t(texte, valeurs)      traduit un texte fabriqué par le code
   • translateTree(racine)  traduit tous les textes et attributs d'une page
                            (aria-label, alt, placeholder, title)
   • observeDocument()      traduit aussi les textes que le jeu ajoute ensuite
   • le français d'origine est retenu : on peut revenir de EN à FR sans recharger

   Module sans dépendance au navigateur (le DOM n'est touché que par
   translateTree / observeDocument), donc testable sous Node.
   ========================================================== */

import { EN } from './i18n-en.js?v=2';

export const LANGS = ['fr', 'en'];
let lang = 'fr';
const listeners = new Set();

export const getLang = () => lang;
export function setLang(l) {
  const next = l === 'en' ? 'en' : 'fr';
  if (next === lang) return lang;
  lang = next;
  listeners.forEach((fn) => { try { fn(lang); } catch (_) {} });
  return lang;
}
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** Espaces normalisés + apostrophe courbe : forme de référence des clés. */
export const norm = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').replace(/'/g, '’').trim();

const MONTHS_FR = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Nom court d'un mois (0–11) dans la langue courante. */
export function monthShort(i) { return (lang === 'en' ? MONTHS_EN : MONTHS_FR)[i]; }

const fill = (str, vars) => (vars ? str.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : str);

/** Traduction anglaise d'un texte français, ou undefined. Gère aussi les phrases à trous (« Séquence 4 sur 13 »…). */
function lookup(fr) {
  const key = norm(fr);
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(EN, key)) return EN[key];
  let m;
  if ((m = key.match(/^Séquence (\d+) sur (\d+)$/))) return `Sequence ${m[1]} of ${m[2]}`;
  if ((m = key.match(/^Séquence (\d+) · (.+)$/))) return `Sequence ${m[1]} · ${lookup(m[2]) ?? m[2]}`;
  if ((m = key.match(/^Séquence (\d+)$/))) return `Sequence ${m[1]}`;
  if ((m = key.match(/^(\d+) sur (\d+)$/))) return `${m[1]} of ${m[2]}`;
  if ((m = key.match(/^Aujourd’hui · (.+)$/))) return `Today · ${m[1]}`;
  if ((m = key.match(/^Hier · (.+)$/))) return `Yesterday · ${m[1]}`;
  if ((m = key.match(/^(\d{1,2}) (janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\.) · (.+)$/))) return `${MONTHS_EN[MONTHS_FR.indexOf(m[2])]} ${m[1]} · ${m[3]}`;
  if ((m = key.match(/^Verrouillée · (.+)$/))) return `Locked · ${lookup(m[1]) ?? m[1]}`;
  if ((m = key.match(/^Objectif · (.+)$/))) return `Objective · ${lookup(m[1]) ?? m[1]}`;
  if ((m = key.match(/^Appareil détecté : (.+)$/))) return `Detected device: ${lookup(m[1]) ?? m[1]}`;
  return undefined;
}

/** Le texte a-t-il une traduction (ou est-il identique dans les deux langues) ? */
export function has(fr) { return lookup(fr) !== undefined; }

/** Traduit un texte du code. En français, ne fait que remplir les {valeurs}. */
export function t(fr, vars) {
  if (lang === 'fr') return fill(fr, vars);
  const en = lookup(fr);
  return fill(en !== undefined ? en : fr, vars);
}

/** Traduit un texte en gardant les espaces qui l'entourent (nœuds de texte du DOM). */
export function translateText(text) {
  const m = String(text).match(/^(\s*)([\s\S]*?)(\s*)$/);
  const en = lookup(m[2]);
  return en === undefined ? text : m[1] + en + m[3];
}

/* ---------------- DOM ---------------- */

const ATTRS = ['aria-label', 'alt', 'placeholder', 'title'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA', 'NOSCRIPT']);

function setTextNode(node) {
  const known = node.__en !== undefined && node.nodeValue === node.__en;      // valeur posée par nous : le français d'origine est retenu
  const fr = known ? node.__fr : node.nodeValue;                                // sinon le code vient d'écrire un nouveau texte français
  const out = lang === 'en' ? translateText(fr) : fr;
  if (out === fr) { delete node.__fr; delete node.__en; if (node.nodeValue !== fr) node.nodeValue = fr; return; }
  node.__fr = fr;
  node.__en = out;
  if (node.nodeValue !== out) node.nodeValue = out;
}

function setAttrs(el) {
  for (const a of ATTRS) {
    if (!el.hasAttribute || !el.hasAttribute(a)) continue;
    const store = el.__i18n || (el.__i18n = {});
    const cur = el.getAttribute(a);
    const rec = store[a];
    const fr = rec && cur === rec.en ? rec.fr : cur;
    const out = lang === 'en' ? translateText(fr) : fr;
    if (out === fr) { delete store[a]; if (cur !== fr) el.setAttribute(a, fr); continue; }
    store[a] = { fr, en: out };
    if (cur !== out) el.setAttribute(a, out);
  }
}

/** Traduit (ou remet en français) tous les textes et attributs sous `root`. */
export function translateTree(root) {
  if (!root) return;
  const doc = root.ownerDocument || root;
  const SHOW_ALL = 1 | 4;                           // éléments + texte
  const walker = doc.createTreeWalker(root, SHOW_ALL, {
    acceptNode(n) {
      if (n.nodeType === 1 && (SKIP.has(n.tagName) || (n.hasAttribute && n.hasAttribute('data-no-i18n')))) return 2;   // saute l'élément et ses enfants
      return 1;
    },
  });
  if (root.nodeType === 1) setAttrs(root);
  let n;
  while ((n = walker.nextNode())) {
    if (n.nodeType === 3) setTextNode(n); else setAttrs(n);
  }
}

let observer = null;
/** Traduit aussi les textes ajoutés ou modifiés par le jeu après coup (messages, fiches, boutons créés en JS). */
export function observeDocument(doc = document) {
  if (observer || typeof MutationObserver === 'undefined') return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') { if (r.target.parentElement && !SKIP.has(r.target.parentElement.tagName)) setTextNode(r.target); }
      else if (r.type === 'attributes') setAttrs(r.target);
      else r.addedNodes.forEach((nd) => { if (nd.nodeType === 3) { if (nd.parentElement && !SKIP.has(nd.parentElement.tagName)) setTextNode(nd); } else if (nd.nodeType === 1) translateTree(nd); });
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Arrête de suivre les textes ajoutés (en français il n'y a rien à traduire : on évite de surveiller le HUD à chaque image). */
export function stopObserving() {
  if (observer) { observer.disconnect(); observer = null; }
}

/** Applique la langue courante à toute la page (appelé quand la langue change). */
export function applyToDocument(doc = document) {
  translateTree(doc.body);
}
