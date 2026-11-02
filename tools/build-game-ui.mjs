/**
 * Convertit les écrans du canvas (design/ecrans/*.dc.html) en module du jeu
 * (app/game-screens.js) : markup + styles de chaque écran, images remappées,
 * zones cliquables (data-act) et textes dynamiques (data-bind).
 *
 * Usage : node tools/build-game-ui.mjs
 * Les écrans se modifient dans le canvas / design/ecrans, puis on relance ce script.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'design', 'ecrans');
const OUT = path.join(ROOT, 'app', 'game-screens.js');

/* Images du canvas (/_blob/…) → fichiers du jeu */
const BLOBS = {
  ead7075047fea84b5a3e1bd4523adc9d: 'assets/images/menu-djenne-couchant.jpg',
  '9cde849d86e9fcdf5ecd8b36137d5ee4': 'assets/images/menu-personnage.png',
};
const ACCENT = '#F9D58B';
const CHAR3D = ['main', 'nouvelle'];     // écrans où le personnage est un vrai modèle 3D qui tourne

/* écran → fichier source */
const FILES = {
  lancement: 'Lancement',
  chargement: 'Chargement',
  cinematique: 'Cinematique',
  main: 'Main',
  nouvelle: 'NouvellePartie',
  continuer: 'Continuer',
  carte: 'Carte',
  pause: 'Pause',
  'options-audio': 'OptionsAudio',
  'options-commandes': 'OptionsCommandes',
  'options-affichage': 'OptionsAffichage',
  'options-jeu': 'OptionsJeu',
  credits: 'Credits',
  profil: 'Profil',
};

const OPTION_TABS = [
  [/^Audio$/, 'options:audio'],
  [/^Commandes$/, 'options:commandes'],
  [/^Affichage$/, 'options:affichage'],
  [/^Jeu et langue$/, 'options:jeu'],
  [/^Menu principal$/, 'back'],
  [/^Rétablir/, 'reset-settings'],
];

/* Règles de câblage : texte (ou aria-label) du bouton → action */
const ACTS = {
  lancement: [[/^Son activé$/, 'sound'], [/^FR$/, 'lang:fr'], [/^EN$/, 'lang:en'], [/^Appuie pour commencer$/, 'start']],
  cinematique: [[/^Passer la cinématique/, 'cine-skip'], [/^Pause$/, 'cine-pause'], [/^Sous-titres/, 'cine-subs']],
  main: [[/^Nouvelle partie$/, 'new'], [/^Continuer/, 'continue'], [/^Destinations/, 'map'], [/^Exploration libre$/, 'explore'], [/^Options$/, 'options:audio'],
    [/^Crédits$/, 'credits'], [/^FR$/, 'lang:fr'], [/^EN$/, 'lang:en']],
  nouvelle: [[/^Menu principal$/, 'back'], [/^Annuler$/, 'back'], [/^Commencer l’aventure$/, 'begin']],
  continuer: [[/^Menu principal$/, 'back'], [/^Reprendre la partie$/, 'resume'], [/^Voir les destinations$/, 'map'],
    [/^Choisir une séquence$/, 'map'], [/^Ouvrir le journal$/, 'journal'], [/^Supprimer$/, 'delete-save']],
  carte: [[/^Menu principal$/, 'back'], [/^Reprendre le chapitre$/, 'resume'], [/^Revoir la cinématique/, 'cine-replay']],
  pause: [[/^Reprendre/, 'resume-game'], [/^Journal d’enquête$/, 'journal'], [/^Commandes$/, 'options:commandes'],
    [/^Options$/, 'options:audio'], [/^Carte des destinations$/, 'map'], [/^Retour au menu principal$/, 'to-main']],
  'options-audio': [...OPTION_TABS, [/^Tester le son$/, 'test-sound']],
  'options-commandes': [...OPTION_TABS, [/^Personnaliser les commandes tactiles$/, 'touch-settings']],
  'options-affichage': OPTION_TABS,
  'options-jeu': OPTION_TABS,
  credits: [[/^Menu principal$/, 'back']],
  profil: [[/^Annuler$/, 'back'], [/^Commencer l’aventure$/, 'profile-save']],
};

/* Textes d'exemple du canvas → liaisons dynamiques (data-bind) */
const SEQ = 'Séquence 4 · Le premier repérage';
const BINDS = {
  main: [[SEQ, 'seqLabel'], ['1 sur 5', 'destProgress']],
  nouvelle: [[SEQ, 'seqLabel']],
  continuer: [
    ['Séquence 4<br>Le premier repérage', 'seqTwoLines'],
    ['4 sur 13', 'progress'],
    ['Aujourd’hui · 18:42', 'lastPlayed'],
    ['47 minutes', 'playtime'],
  ],
  carte: [['Séquence 4 sur 13', 'progressLong']],
  'options-affichage': [
    ['Appareil détecté : ordinateur', 'deviceLabel'],
    ['<b style="font-family:inherit">Élevée</b>', 'autoQuality'],
  ],
  pause: [
    ['« J’ai découvert quelque chose près de la mosquée. Je ne sais pas encore ce que c’est, mais certains détails ne correspondent à rien de ce que j’ai étudié. »', 'tapamaQuote'],
    [SEQ, 'seqLabel'],
    ['Séquence 4 sur 13', 'progressLong'],
    ['Examiner l’emplacement près de la mosquée et utiliser le drone pour observer un détail éloigné.', 'objective'],
  ],
};

/* Remplacements ciblés (littéral → littéral), pour les éléments qui doivent bouger */
const EXTRA = {
  chargement: [
    ['<span style="font-family:\'Rubik\',sans-serif;font-weight:800;font-size:30px;color:#F9D58B">62 %</span>',
      '<span data-bind="loadPct" style="font-family:\'Rubik\',sans-serif;font-weight:800;font-size:30px;color:#F9D58B">62 %</span>'],
    ['<span style="font-size:18px;font-weight:600">Chargement de la maquette de Djenné…</span>',
      '<span data-bind="loadLabel" style="font-size:18px;font-weight:600">Chargement de la maquette de Djenné…</span>'],
    ['<div style="width:62%;height:100%', '<div data-bind-width="loadPct" style="width:62%;height:100%'],
  ],
  cinematique: [
    ['<div style="position:absolute;left:0;top:0;width:1440px;height:92px;background:#55415D"></div>', '<div style="position:absolute;left:-3000px;top:0;width:7440px;height:92px;background:#55415D"></div>'],
    ['<div style="position:absolute;left:0;top:718px;width:1440px;height:92px;background:#55415D"></div>', '<div style="position:absolute;left:-3000px;top:718px;width:7440px;height:92px;background:#55415D"></div>'],
    ['<img src="assets/images/menu-djenne-couchant.jpg" alt="Plan large', '<img data-cine-bg src="assets/images/menu-djenne-couchant.jpg" alt="Plan large'],
    ['Djenné. Un lieu où la terre garde la mémoire.', '<span data-bind="caption">Djenné. Un lieu où la terre garde la mémoire.</span>'],
    ['<span style="font-size:15px;font-weight:600;width:50px">0:08</span>', '<span data-bind="cineTime" style="font-size:15px;font-weight:600;width:50px">0:08</span>'],
    ['<span style="font-size:15px;width:50px;text-align:right">0:32</span>', '<span data-bind="cineTotal" style="font-size:15px;width:50px;text-align:right">0:32</span>'],
    ['<div style="width:26%;height:100%', '<div data-bind-width="cinePct" style="width:26%;height:100%'],
    ['<div style="position:absolute;left:26%;top:-5px', '<div data-bind-left="cinePct" style="position:absolute;left:26%;top:-5px'],
  ],
  main: [
    // « Ton équipe » : le prénom du joueur, et la carte ouvre le profil
    ['<span style="font-weight:700">Personnage</span> · À définir', '<span style="font-weight:700">Personnage</span> · <span data-bind="playerName">À définir</span>'],
    ['<section aria-label="Ton équipe" style="position:absolute;', '<section data-act="profile-edit" role="button" tabindex="0" aria-label="Ton équipe : modifier ton nom" style="cursor:pointer;position:absolute;'],
    ['text-transform:uppercase;color:#F9D58B">Ton équipe</div>', 'text-transform:uppercase;color:#F9D58B">Ton équipe <span style="margin-left:6px;color:#F8F3EA;letter-spacing:.04em;text-transform:none;font-weight:600">· modifier</span></div>'],
  ],
  'options-commandes': [
    // le bouton « Personnaliser les touches : bientôt » devient le vrai accès aux commandes tactiles (app/touch-controls.js)
    ['<span style="align-self:flex-start;font-size:13px;font-weight:700;padding:6px 14px;border-radius:999px;border:1px dashed rgba(248,243,234,.7)">Personnaliser les touches : bientôt</span>',
      '<button type="button" class="btn glass" style="align-self:flex-start;height:40px;padding:0 16px;border-radius:14px;font-size:13px;font-weight:700">Personnaliser les commandes tactiles</button>'],
  ],
  profil: [],
  nouvelle: [
    ['font-size:28px;line-height:1">À définir</div>', 'font-size:28px;line-height:1"><span data-bind="playerName">À définir</span></div>'],
    ['<div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-radius:18px;background:rgba(249,213,139,.2);border:1px solid #F9D58B">',
      '<div data-warn style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-radius:18px;background:rgba(249,213,139,.2);border:1px solid #F9D58B">'],
    ['<label style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;white-space:nowrap">',
      '<label data-confirm style="display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600;white-space:nowrap;cursor:pointer">'],
  ],
};

/**
 * Les fonds plein cadre (image, voiles, dégradés) qui ouvrent chaque écran sont extraits du cadre 16:9 :
 * ils couvrent toute la fenêtre (aucune bordure), l'interface reste centrée dans sa zone de 1440 × 810.
 */
function extractBackground(html) {
  const m = html.match(/^<div style="position:relative;width:1440px;height:810px;overflow:hidden;background:#55415D;([^"]*)">/);
  if (!m) return { html, bg: '' };
  let rest = html.slice(m[0].length);
  const parts = [];
  for (;;) {
    const t = rest.replace(/^\s+/, '');
    let mm = t.match(/^<img\b[^>]*>/);
    if (mm) {
      const st = (mm[0].match(/style="([^"]*)"/) || [])[1] || '';
      const g = st.match(/^position:absolute;left:(-?\d+)(?:px)?;top:(-?\d+)(?:px)?;width:(\d+)px;height:(\d+)px;?(.*)$/);
      if (!g || +g[3] < 1440 || +g[4] < 810) break;
      const l = +g[1], tp = +g[2];
      const box = (l < 0 || tp < 0)
        ? `left:${l}px;top:${tp}px;width:calc(100% + ${-2 * l}px);height:calc(100% + ${-2 * tp}px);`
        : 'left:0;top:0;width:100%;height:100%;';
      parts.push(mm[0].replace(/style="[^"]*"/, `style="position:absolute;${box}${g[5]}"`));
      rest = t.slice(mm[0].length);
      continue;
    }
    mm = t.match(/^<div data-leaflet([^>]*?) style="position:absolute;left:0;top:0;width:1440px;height:810px;([^"]*)"><\/div>/);
    if (mm) {                                    // la carte interactive : plein cadre
      parts.push(`<div data-leaflet${mm[1]} style="position:absolute;left:0;top:0;width:100%;height:100%;${mm[2]}"></div>`);
      rest = t.slice(mm[0].length);
      continue;
    }
    mm = t.match(/^<div style="position:absolute;left:0;top:0;width:1440px;height:810px;(background:[^"]*)"><\/div>/);
    if (mm) {
      parts.push(`<div style="position:absolute;left:0;top:0;width:100%;height:100%;${mm[1]}"></div>`);
      rest = t.slice(mm[0].length);
      continue;
    }
    break;
  }
  if (!parts.length) return { html, bg: '' };
  return {
    html: `<div style="position:relative;width:1440px;height:810px;overflow:hidden;background:transparent;${m[1]}">${rest}`,
    bg: parts.join('\n'),
  };
}

const stripTags = (s) => s.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function addAct(html, rules) {
  return html.replace(/<button\b([^>]*)>([\s\S]*?)<\/button>/g, (all, attrs, inner) => {
    const label = (attrs.match(/aria-label="([^"]*)"/) || [])[1] || '';
    const text = stripTags(inner);
    for (const [re, act] of rules) {
      if (re.test(text) || (label && re.test(label))) return `<button data-act="${act}"${attrs}>${inner}</button>`;
    }
    return all;
  });
}

function addBinds(html, rules, name) {
  for (const [literal, bind] of rules) {
    const n = html.split(literal).length - 1;
    if (!n) throw new Error(`[${name}] texte introuvable pour la liaison « ${bind} » : ${literal}`);
    html = html.split(literal).join(`<span data-bind="${bind}">${literal}</span>`);
  }
  // barres de progression (31 % dans le canvas)
  html = html.replace(/<div style="width:31%;height:100%/g, '<div data-bind-width="progressPct" style="width:31%;height:100%');
  return html;
}

function build(id, file) {
  const src = fs.readFileSync(path.join(SRC, `${file}.dc.html`), 'utf8');
  const css = ((src.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '').replace(/body\{margin:0\}/, '').trim();
  const start = src.indexOf('<div style="position:relative;width:1440px;height:810px');
  const end = src.lastIndexOf('</x-dc>');
  if (start < 0 || end < 0) throw new Error(`[${id}] structure inattendue`);
  let html = src.slice(start, end).trim();

  html = html.replace(/\/_blob\/([0-9a-f]{32})/g, (m, b) => {
    if (!BLOBS[b]) throw new Error(`[${id}] image inconnue : ${b}`);
    return BLOBS[b];
  });
  html = html.replace(/\{\{accent\}\}/g, ACCENT);

  // Le personnage : l'image devient un cadre « 3D » (l'image reste en secours si le 3D est impossible)
  if (CHAR3D.includes(id)) {
    const before = html;
    html = html.replace(/<img src="assets\/images\/menu-personnage\.png" alt="([^"]*)" style="([^"]*)">/,
      (m, alt, style) => `<div data-char3d role="img" aria-label="${alt}" style="${style}"><img src="assets/images/menu-personnage.png" alt="" style="width:100%;height:100%;object-fit:contain;transition:opacity .5s"></div>`);
    if (html === before) throw new Error(`[${id}] image du personnage introuvable`);
  }

  if (id === 'pause') {
    // la partie reste visible derrière : on retire le faux décor (fond + faux HUD)
    html = html.replace(/<img src="assets\/images\/menu-djenne-couchant\.jpg"[^>]*>\s*/, '');
    html = html.replace('<div style="position:absolute;left:0;top:0;width:1440px;height:810px;background:rgba(85,65,93,.72)"></div>\n', '');   // le voile est posé par l'hôte
    html = html.replace('overflow:hidden;background:#55415D;', 'overflow:hidden;background:transparent;');                                  // fond du cadre : la partie reste visible
    html = html.replace(/<div aria-hidden="true" style="position:absolute;[\s\S]*?(?=<section aria-label="Menu pause")/, '');
  }

  for (const [from, to] of EXTRA[id] || []) {
    if (!html.includes(from)) throw new Error(`[${id}] remplacement introuvable : ${from.slice(0, 70)}`);
    html = html.replace(from, () => to);
  }
  html = addAct(html, ACTS[id] || []);
  if (BINDS[id]) html = addBinds(html, BINDS[id], id);
  // « Taille du texte » (Options) : chaque taille en px devient proportionnelle à --ts (0,9 · 1 · 1,18)
  const scaleFonts = (x) => x.replace(/font-size:\s*([\d.]+)px/g, 'font-size:calc($1px * var(--ts,1))');
  const split = extractBackground(scaleFonts(html));
  return { css: scaleFonts(css), html: split.html, bg: split.bg };
}

const screens = {};
for (const [id, file] of Object.entries(FILES)) screens[id] = build(id, file);

const body =
  '/* GÉNÉRÉ par tools/build-game-ui.mjs à partir de design/ecrans/*.dc.html — ne pas modifier à la main. */\n' +
  `export const SCREENS = ${JSON.stringify(screens, null, 1)};\n`;
fs.writeFileSync(OUT, body);

const kb = (Buffer.byteLength(body) / 1024).toFixed(0);
const acts = Object.entries(screens).map(([k, v]) => `${k}:${(v.html.match(/data-act=/g) || []).length}`).join(' ');
console.log(`app/game-screens.js écrit (${kb} Ko) · zones cliquables : ${acts}`);
