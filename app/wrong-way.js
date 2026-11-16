/* ==========================================================
   TAPAMA PRÉVIENT LE JOUEUR QUI SE TROMPE DE CHEMIN
   ----------------------------------------------------------
   Séance de test : des joueurs ont erré longtemps (dans le fleuve, loin de la mosquée…) sans savoir où aller.
   Règle : si le joueur reste 2 MINUTES SUR LE MAUVAIS CHEMIN, Tapama lui envoie un message radio, qu'il bouge ou non.
   Sur le BON chemin, jamais de message, même s'il ne fait rien.

   « Mauvais chemin » = l'itinéraire par les routes jusqu'à la cible de l'étape en cours (CityMap.pathLength) est devenu plus long de plus de
   120 m que le meilleur point déjà atteint depuis le début de l'étape : le joueur s'est éloigné de son objectif. Un joueur immobile sur le bon
   chemin garde la même distance : pas de message. À moins de 40 m de la cible, il est arrivé.
   • Étape = ce que dit l'histoire (clés taama.* du localStorage) : inspection → labo 1 → retour à la mosquée → (gadget) → base NÉANTIS → labo 2.
   • Rien n'est envoyé hors partie, menu ou pause ouverts, écran plein (labo, dossier), pendant un vol de drone, ni quand Tapama parle déjà.
   • Si le joueur est toujours perdu 2 minutes plus tard, Tapama le redit.
   API de diagnostic : window.WrongWay.setDelay(ms), .state()
   ========================================================== */
const OFF_MS = 2 * 60 * 1000;     // temps passé sur le mauvais chemin avant le message
const MARGIN = 120;               // m d'éloignement (par rapport au meilleur point) qui font basculer « sur le mauvais chemin »
const ARRIVED = 40;               // m : à moins de ça de la cible, on est arrivé
let delay = OFF_MS;
let stage = null, best = Infinity, offSince = null, lastLength = null, lastOff = false;

const flag = (k) => { try { return localStorage.getItem(k) === '1'; } catch (_) { return false; } };
const val = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };

const LABO = 'Tu fais fausse route, {nom}. Suis la ligne jaune de ta carte jusqu’à mon labo.';

/** Étape de l'histoire : { id, place (lieu de la carte à rejoindre), text (message de Tapama) }, ou null s'il n'y a rien à surveiller. */
function currentStage() {
  if (val('taama.lab2') === 'done' || flag('taama.chapitre1')) return null;                                                // chapitre terminé
  if (flag('taama.dispositif2')) return { id: 'labo2', place: 'deuxieme', text: LABO };
  if (flag('taama.tombe')) return { id: 'biblio', place: 'bibliotheque', text: 'Tu t’éloignes de Barey So, {nom}. Suis l’itinéraire de ta carte.' };
  if (val('taama.lab1') === 'done') return { id: 'tombe', place: 'tombe', text: 'Tu fais fausse route, {nom}. Suis l’itinéraire jusqu’à la tombe de Djenépo.' };
  if (flag('taama.dispositif1')) return { id: 'labo1', place: 'deuxieme', text: LABO };
  return { id: 'inspection', place: 'mosquee', text: 'Tu t’éloignes de la mosquée, {nom}. Reviens : le dispositif est sur le toit.' };
}

/** Le joueur est-il en train de jouer ? (sinon le compteur repart de zéro) */
function playing() {
  if (document.hidden) return false;
  const gu = window.GameUI;
  if (!(gu && gu.isInGame && gu.isInGame())) return false;
  if (gu.isOpen && gu.isOpen()) return false;                                   // menu principal, pause, écrans du jeu
  if (window.__storyFreeze) return false;                                       // labo, dossier : écran plein
  if (window.Guide && window.Guide.isOpen) return false;
  const dg = window.DroneGame;
  if (dg && dg.isActive && dg.isActive()) return false;                         // vol de drone : il fait justement ce qu'on lui demande
  return true;
}

function tick() {
  const st = currentStage();
  if (!st || !playing()) { offSince = null; lastOff = false; if (!st) stage = null; return; }
  if (st.id !== stage) { stage = st.id; best = Infinity; offSince = null; }      // nouvelle étape : on repart de zéro
  const CM = window.CityMap;
  const L = CM && CM.pathLength ? CM.pathLength(st.place) : null;
  if (L == null) return;                                                         // routes ou lieu pas encore prêts
  lastLength = L;
  if (L < best) best = L;
  const off = L > ARRIVED && L > best + MARGIN;                                  // plus loin qu'au meilleur moment : le joueur s'éloigne de l'objectif
  lastOff = off;
  if (!off) { offSince = null; return; }                                         // bon chemin (même immobile) : rien
  const now = performance.now();
  if (offSince == null) { offSince = now; return; }
  if (now - offSince < delay) return;
  const T = window.Tapama;
  if (!T || !T.radio || (T.isBusy && T.isBusy())) return;                        // Tapama parle déjà : on réessaie au prochain tour
  if (T.radio({ text: st.text, mood: 'inquiete', duration: 8 })) offSince = now; // et on redit dans 2 min s'il est toujours perdu
}

setInterval(tick, 1500);

window.WrongWay = {
  setDelay: (ms) => { delay = ms; },
  state: () => ({ stage, best, length: lastLength, off: lastOff, offForMs: offSince == null ? 0 : Math.round(performance.now() - offSince), delay }),
};
