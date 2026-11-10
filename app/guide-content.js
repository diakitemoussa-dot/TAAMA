/* ==========================================================
   GUIDE « COMMENT JOUER » — TOUS LES TEXTES (à relire ici)
   ----------------------------------------------------------
   Règles d'écriture : tutoiement · 10 mots maximum par phrase · verbes
   simples · un seul message · mots positifs · pas de jargon.
   Chaque texte s'écrit  L('français', 'English')  : l'anglais est ajouté
   au dictionnaire du jeu (i18n-en.js) dès que ce fichier est chargé.
   {nom} = prénom du joueur.  Les touches (Z, Q, S, D…) ne sont pas des
   textes : elles sont dans les champs `g` (gestes) de chaque page.
   Testé : tests/guide.test.mjs (10 mots max, anglais présent partout).
   ========================================================== */

import { EN } from './i18n-en.js?v=2';
import { norm } from './i18n.js?v=1';

const reg = (fr, en) => { const k = norm(fr); if (!Object.prototype.hasOwnProperty.call(EN, k)) EN[k] = en; return fr; };
/** Un texte français et sa traduction anglaise. */
const L = reg;
/** Les trois modes : clavier + souris, manette, tactile. */
const M = (kbd, pad, touch) => ({ kbd, pad, touch });

/* ---------- Pages du guide : une page par sujet ---------- */
const CROSS = { fr: ['Z', 'Q', 'S', 'D'], en: ['W', 'A', 'S', 'D'] };
const ARROWS = ['↑', '←', '↓', '→'];
const SPACE = L('Espace', 'Space'), SHIFT = L('Maj', 'Shift'), ESC = L('Échap', 'Esc'), ENTER = L('Entrée', 'Enter');

/* g : geste montré dans chaque mode — k = touches (allumées l'une après l'autre), cross = disposition en croix,
   m = souris (move · l · r · rl · drag), s = sticks (L · R · LR), b = boutons de manette, kc/bc = légendes,
   touch : s = stick à gauche, sd = deux sticks du drone, look = zone caméra, b = boutons, ui = panneau à toucher */
export const PAGES = [
  { id: 'move', ico: 'foot', tm: 'foot', title: L('Marcher', 'Walk'),
    line: M(L('Appuie sur Z, Q, S, D pour marcher.', 'Press W, A, S, D to walk.'), L('Pousse le stick gauche pour marcher.', 'Push the left stick to walk.'), L('Pose le pouce à gauche et glisse.', 'Put your thumb on the left and slide.')),
    g: { kbd: { k: CROSS, cross: 1 }, pad: { s: 'L' }, touch: { s: 1 } } },
  { id: 'look', ico: 'eye', tm: 'foot', title: L('Regarder autour', 'Look around'),
    line: M(L('Glisse la souris pour regarder autour.', 'Drag the mouse to look around.'), L('Pousse le stick droit pour regarder.', 'Push the right stick to look.'), L('Glisse un doigt à droite de l’écran.', 'Slide a finger on the right of the screen.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'R' }, touch: { look: 1 } } },
  { id: 'run', ico: 'run', tm: 'foot', title: L('Courir', 'Run'),
    line: M(L('Garde Maj enfoncée pour courir.', 'Hold Shift down to run.'), L('Appuie sur le stick gauche (L3) pour courir.', 'Press the left stick (L3) to run.'), L('Touche le bouton Courir.', 'Tap the Run button.')),
    g: { kbd: { k: [SHIFT] }, pad: { s: 'L', b: ['L3'] }, touch: { b: ['run'] } } },
  { id: 'jump', ico: 'jump', tm: 'foot', title: L('Sauter', 'Jump'),
    line: M(L('Appuie sur X pour sauter.', 'Press X to jump.'), L('Appuie sur B pour sauter.', 'Press B to jump.'), L('Touche le bouton Sauter.', 'Tap the Jump button.')),
    g: { kbd: { k: ['X'] }, pad: { b: ['B'] }, touch: { b: ['jump'] } } },
  { id: 'kneel', ico: 'kneel', tm: 'foot', title: L('S’agenouiller', 'Kneel'),
    line: M(L('Appuie sur K pour t’agenouiller.', 'Press K to kneel.'), L('Appuie sur X pour t’agenouiller.', 'Press X to kneel.'), L('Touche le bouton S’agenouiller.', 'Tap the Kneel button.')),
    g: { kbd: { k: ['K'] }, pad: { b: ['X'] }, touch: { b: ['kneel'] } } },
  { id: 'drone', ico: 'drone', tm: 'foot', title: L('Lancer le drone', 'Launch the drone'),
    line: M(L('Appuie sur R pour lancer ton drone.', 'Press R to launch your drone.'), L('Appuie sur L1 pour lancer ton drone.', 'Press L1 to launch your drone.'), L('Touche le bouton Drone.', 'Tap the Drone button.')),
    g: { kbd: { k: ['R'] }, pad: { b: ['LB'] }, touch: { b: ['droneOn'] } } },
  { id: 'fly', ico: 'drone', tm: 'drone', title: L('Piloter le drone', 'Fly the drone'),
    line: M(L('Tire les deux ronds avec la souris.', 'Drag the two circles with the mouse.'), L('Les deux sticks font voler ton drone.', 'The two sticks make your drone fly.'), L('Glisse tes pouces sur les deux sticks.', 'Slide your thumbs on the two sticks.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'LR' }, touch: { sd: 1 } } },
  { id: 'dclimb', ico: 'drone', tm: 'drone', scene: 'fly', title: L('Monter et descendre', 'Go up and down'),
    line: M(L('Tire le rond gauche vers le haut ou le bas.', 'Drag the left circle up or down.'), L('Stick gauche : haut monte, bas descend.', 'Left stick: up climbs, down descends.'), L('Glisse le stick gauche vers le haut ou le bas.', 'Slide the left stick up or down.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'L', d: 'v' }, touch: { sk: 'dl', d: 'v' } } },
  { id: 'dturn', ico: 'drone', tm: 'drone', scene: 'fly', title: L('Tourner', 'Turn'),
    line: M(L('Tire le rond gauche vers la gauche ou la droite.', 'Drag the left circle left or right.'), L('Stick gauche : gauche ou droite pour tourner.', 'Left stick: left or right to turn.'), L('Glisse le stick gauche vers la gauche ou la droite.', 'Slide the left stick left or right.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'L', d: 'h' }, touch: { sk: 'dl', d: 'h' } } },
  { id: 'dmove', ico: 'drone', tm: 'drone', scene: 'fly', title: L('Avancer et reculer', 'Forward and back'),
    line: M(L('Tire le rond droit vers le haut ou le bas.', 'Drag the right circle up or down.'), L('Stick droit : haut avance, bas recule.', 'Right stick: up goes forward, down goes back.'), L('Glisse le stick droit vers le haut ou le bas.', 'Slide the right stick up or down.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'R', d: 'v' }, touch: { sk: 'dr', d: 'v' } } },
  { id: 'dside', ico: 'drone', tm: 'drone', scene: 'fly', title: L('Aller sur les côtés', 'Move sideways'),
    line: M(L('Tire le rond droit vers la gauche ou la droite.', 'Drag the right circle left or right.'), L('Stick droit : gauche ou droite pour glisser.', 'Right stick: left or right to slide.'), L('Glisse le stick droit vers la gauche ou la droite.', 'Slide the right stick left or right.')),
    g: { kbd: { m: 'drag' }, pad: { s: 'R', d: 'h' }, touch: { sk: 'dr', d: 'h' } } },
  { id: 'dback', ico: 'foot', tm: 'drone', scene: 'drone', title: L('Revenir au personnage', 'Back to the character'),
    line: M(L('Clique sur ✕ pour quitter le vol.', 'Click ✕ to end the flight.'), L('Appuie sur L1 pour revenir au personnage.', 'Press L1 to go back to the character.'), L('Touche le bouton Retour au personnage.', 'Tap the Back to character button.')),
    g: { kbd: { m: 'l' }, pad: { b: ['LB'] }, touch: { b: ['backChar'] } } },
  { id: 'photo', ico: 'photo', tm: 'drone', title: L('Prendre une photo', 'Take a photo'),
    line: M(L('Clique sur l’appareil photo.', 'Click the camera.'), L('Appuie sur ✕ pour prendre une photo.', 'Press ✕ to take a photo.'), L('Touche le bouton Photo.', 'Tap the Photo button.')),
    g: { kbd: { m: 'l' }, pad: { b: ['A'] }, touch: { b: ['photo'] } } },
  { id: 'interact', ico: 'interact', tm: 'foot', title: L('Examiner et ramasser', 'Look closely and pick up'),
    line: M(L('Appuie sur E devant l’objet.', 'Press E in front of the object.'), L('Appuie sur Y devant l’objet.', 'Press Y in front of the object.'), L('Touche le bouton Interagir.', 'Tap the Interact button.')),
    g: { kbd: { k: ['E'] }, pad: { b: ['Y'] }, touch: { b: ['interact'] } } },
  { id: 'doors', ico: 'door', tm: 'foot', title: L('Les portes de la base', 'The base doors'),
    line: M(L('Approche-toi : les portes s’ouvrent toutes seules.', 'Walk close: the doors open by themselves.'), L('Approche-toi : les portes s’ouvrent toutes seules.', 'Walk close: the doors open by themselves.'), L('Approche-toi : les portes s’ouvrent toutes seules.', 'Walk close: the doors open by themselves.')),
    g: { kbd: { k: CROSS, cross: 1 }, pad: { s: 'L' }, touch: { s: 1 } } },
  { id: 'carin', ico: 'car', tm: 'foot', title: L('Monter dans le pick-up', 'Get in the pick-up'),
    line: M(L('Approche-toi, puis appuie sur F.', 'Walk close, then press F.'), L('Approche-toi, puis appuie sur Y.', 'Walk close, then press Y.'), L('Approche-toi, puis touche Interagir.', 'Walk close, then tap Interact.')),
    g: { kbd: { k: ['F'] }, pad: { b: ['Y'] }, touch: { b: ['interact'] } } },
  { id: 'car', ico: 'car', tm: 'car', title: L('Conduire', 'Drive'),
    line: M(L('Z avance, Q et D tournent.', 'W goes forward, A and D turn.'), L('R2 avance ; le stick gauche ou la croix tourne.', 'R2 goes forward; the left stick or the D-pad turns.'), L('Touche les flèches pour avancer et tourner.', 'Tap the arrows to go and turn.')),
    g: { kbd: { k: CROSS, cross: 1 }, pad: { s: 'L', b: ['RT'] }, touch: { b: ['gas', 'steerL', 'steerR'] } } },
  { id: 'caraux', ico: 'lights', tm: 'car', title: L('Phares, frein à main, vue', 'Lights, handbrake, view'),
    line: M(L('Ces boutons t’aident à bien conduire.', 'These buttons help you drive well.'), L('Ces boutons t’aident à bien conduire.', 'These buttons help you drive well.'), L('Ces boutons t’aident à bien conduire.', 'These buttons help you drive well.')),
    g: { kbd: { k: ['L', SPACE, 'V', 'F'], kc: [L('Phares', 'Lights'), L('Frein à main', 'Handbrake'), L('Vue', 'View'), L('Descendre', 'Get out')] },
      pad: { b: ['RB', 'A', 'R3', 'Y'], bc: [L('L1 puis R1 : phares', 'L1 then R1: lights'), L('Frein à main', 'Handbrake'), L('Vue', 'View'), L('Descendre', 'Get out')] },
      touch: { b: ['lights', 'handbrake', 'view', 'exitCar'] } } },
  { id: 'swim', ico: 'wave', tm: 'foot', title: L('Nager', 'Swim'),
    line: M(L('Va dans l’eau : tu nages tout seul !', 'Go in the water: you swim all by yourself!'), L('Va dans l’eau : tu nages tout seul !', 'Go in the water: you swim all by yourself!'), L('Va dans l’eau : tu nages tout seul !', 'Go in the water: you swim all by yourself!')),
    g: { kbd: { k: CROSS, cross: 1 }, pad: { s: 'L' }, touch: { s: 1 } } },
  { id: 'map', ico: 'map', tm: 'foot', title: L('La carte', 'The map'),
    line: M(L('Clique sur la petite carte ou appuie sur M.', 'Click the small map or press M.'), L('Appuie sur la croix gauche pour la carte.', 'Press left on the D-pad for the map.'), L('Touche la petite carte.', 'Tap the small map.')),
    g: { kbd: { k: ['M'] }, pad: { b: ['LEFT'] }, touch: { b: ['map'] } } },
  { id: 'circle', ico: 'circle', tm: 'foot', title: L('Le cercle jaune', 'The yellow circle'),
    line: M(L('Suis la ligne jaune, entre dans le cercle.', 'Follow the yellow line, step in the circle.'), L('Suis la ligne jaune, entre dans le cercle.', 'Follow the yellow line, step in the circle.'), L('Suis la ligne jaune, entre dans le cercle.', 'Follow the yellow line, step in the circle.')),
    g: { kbd: { k: CROSS, cross: 1 }, pad: { s: 'L' }, touch: { s: 1 } } },
  { id: 'lab', ico: 'lab', tm: 'foot', title: L('Le laboratoire', 'The laboratory'),
    line: M(L('Tape le mot de passe, puis Entrée.', 'Type the password, then Enter.'), L('Choisis avec la croix, valide avec A.', 'Choose with the D-pad, confirm with A.'), L('Touche la case, écris, puis valide.', 'Tap the box, write, then confirm.')),
    g: { kbd: { k: [ENTER] }, pad: { b: ['A'] }, touch: { ui: 'lab' } } },
  { id: 'labhint', ico: 'bulb', tm: 'foot', title: L('Un petit indice', 'A little hint'),
    line: M(L('Appuie sur I pour un indice.', 'Press I for a hint.'), L('Appuie sur X pour un indice.', 'Press X for a hint.'), L('Touche Indice pour demander de l’aide.', 'Tap Hint to ask for help.')),
    g: { kbd: { k: ['I'] }, pad: { b: ['X'] }, touch: { ui: 'hint' } } },
  { id: 'dossier', ico: 'file', tm: 'foot', title: L('Le dossier NÉANTIS', 'The NÉANTIS file'),
    line: M(L('Appuie sur Entrée pour tourner la page.', 'Press Enter to turn the page.'), L('Appuie sur ✕ pour tourner la page.', 'Press ✕ to turn the page.'), L('Touche l’écran pour tourner la page.', 'Tap the screen to turn the page.')),
    g: { kbd: { k: [ENTER] }, pad: { b: ['A'] }, touch: { ui: 'page' } } },
  { id: 'gadget', ico: 'aim', tm: 'aim', title: L('Arrêter un robot gardien', 'Stop a guard robot'),
    line: M(L('Clic droit pour viser, clic gauche pour tirer.', 'Right-click to aim, left-click to shoot.'), L('Garde L2 pour viser, appuie sur R2.', 'Hold L2 to aim, press R2.'), L('Touche Viser, puis touche Tirer.', 'Tap Aim, then tap Fire.')),
    g: { kbd: { m: 'rl' }, pad: { b: ['LT', 'RT'] }, touch: { b: ['aim', 'fire'] } } },
  { id: 'pause', ico: 'pause', tm: 'foot', title: L('Pause et menu', 'Pause and menu'),
    line: M(L('Appuie sur Échap pour faire une pause.', 'Press Esc to take a break.'), L('Appuie sur START, puis sur Quitter.', 'Press START, then Quit.'), L('Touche le bouton Pause.', 'Tap the Pause button.')),
    g: { kbd: { k: [ESC] }, pad: { b: ['START'] }, touch: { b: ['pause'] } } },
  { id: 'mpan', ico: 'map', tm: 'foot', scene: 'map', title: L('Bouger la carte', 'Move the map'),
    line: M(L('Glisse la souris ou appuie sur les flèches.', 'Drag the mouse or press the arrows.'), L('Pousse le stick gauche pour bouger la carte.', 'Push the left stick to move the map.'), L('Glisse un doigt sur la carte.', 'Slide a finger on the map.')),
    g: { kbd: { k: ARROWS, cross: 1 }, pad: { s: 'L' }, touch: { ui: 'drag' } } },
  { id: 'mzoom', ico: 'map', tm: 'foot', scene: 'map', title: L('Zoomer', 'Zoom'),
    line: M(L('Tourne la molette, ou appuie sur + et −.', 'Turn the wheel, or press + and −.'), L('Pousse le stick droit vers le haut ou le bas.', 'Push the right stick up or down.'), L('Écarte ou rapproche deux doigts.', 'Spread or pinch two fingers.')),
    g: { kbd: { k: ['+', '−'] }, pad: { s: 'R', d: 'v' }, touch: { ui: 'pinch' } } },
  { id: 'mclose', ico: 'map', tm: 'foot', scene: 'map', title: L('Fermer la carte', 'Close the map'),
    line: M(L('Appuie sur Échap ou sur M.', 'Press Esc or M.'), L('Appuie sur B (○) pour fermer.', 'Press B (○) to close.'), L('Touche la croix pour fermer.', 'Tap the cross to close.')),
    g: { kbd: { k: [ESC, 'M'] }, pad: { b: ['B'] }, touch: { ui: 'x' } } },
  { id: 'nav', ico: 'list', tm: 'foot', scene: 'pause', title: L('Choisir dans un menu', 'Pick in a menu'),
    line: M(L('Appuie sur ↑ ou ↓, puis sur Entrée.', 'Press ↑ or ↓, then Enter.'), L('Croix pour choisir, A (✕) pour valider.', 'D-pad to choose, A (✕) to confirm.'), L('Touche le bouton que tu veux.', 'Tap the button you want.')),
    g: { kbd: { k: ['↑', '↓', ENTER] }, pad: { b: ['DPAD', 'A'] }, touch: { ui: 'menu' } } },
  { id: 'nback', ico: 'back', tm: 'foot', scene: 'pause', title: L('Revenir en arrière', 'Go back'),
    line: M(L('Appuie sur Échap pour revenir.', 'Press Esc to go back.'), L('Appuie sur B (○) pour revenir.', 'Press B (○) to go back.'), L('Touche Retour ou Reprendre.', 'Tap Back or Resume.')),
    g: { kbd: { k: [ESC] }, pad: { b: ['B'] }, touch: { ui: 'menu' } } },
  { id: 'dnext', ico: 'file', tm: 'foot', scene: 'help', title: L('Suivre l’histoire', 'Follow the story'),
    line: M(L('Appuie sur Entrée ou Espace pour continuer.', 'Press Enter or Space to continue.'), L('Appuie sur ✕ pour continuer.', 'Press ✕ to continue.'), L('Touche Suivant pour continuer.', 'Tap Next to continue.')),
    g: { kbd: { k: [ENTER, SPACE] }, pad: { b: ['A'] }, touch: { ui: 'page' } } },
  { id: 'dskip', ico: 'file', tm: 'foot', scene: 'help', title: L('Passer le dialogue', 'Skip the dialogue'),
    line: M(L('Appuie sur Échap pour passer.', 'Press Esc to skip.'), L('Appuie sur B (○) pour passer.', 'Press B (○) to skip.'), L('Touche Passer le dialogue.', 'Tap Skip the dialogue.')),
    g: { kbd: { k: [ESC] }, pad: { b: ['B'] }, touch: { ui: 'skip' } } },
  { id: 'begin', ico: 'file', tm: 'foot', scene: 'help', title: L('Commencer l’aventure', 'Start the adventure'),
    line: M(L('Clique sur « Commencer l’aventure » ou appuie sur Entrée.', 'Click “Start the adventure” or press Enter.'), L('Appuie sur ✕ pour commencer l’aventure.', 'Press ✕ to start the adventure.'), L('Touche « Commencer l’aventure ».', 'Tap “Start the adventure”.')),
    g: { kbd: { k: [ENTER] }, pad: { b: ['A'] }, touch: { ui: 'page' } } },
  { id: 'lplace', ico: 'lab', tm: 'foot', scene: 'lab', title: L('Déposer le dispositif', 'Place the device'),
    line: M(L('Clique sur le gros bouton, ou appuie sur P.', 'Click the big button, or press P.'), L('Appuie sur ✕ sur le gros bouton.', 'Press ✕ on the big button.'), L('Touche le gros bouton.', 'Tap the big button.')),
    g: { kbd: { k: ['P'], m: 'l' }, pad: { b: ['A'] }, touch: { ui: 'lab' } } },
  { id: 'lreread', ico: 'file', tm: 'foot', scene: 'lab', title: L('Relire les messages', 'Read the messages again'),
    line: M(L('Appuie sur H ou R pour relire.', 'Press H or R to read again.'), L('Appuie sur Y (△) pour relire.', 'Press Y (△) to read again.'), L('Touche Relire.', 'Tap Read again.')),
    g: { kbd: { k: ['H', 'R'] }, pad: { b: ['Y'] }, touch: { ui: 'reread' } } },
  { id: 'dosprev', ico: 'file', tm: 'foot', scene: 'dossier', title: L('Revenir dans le dossier', 'Go back in the file'),
    line: M(L('Appuie sur ← pour revenir à la page d’avant.', 'Press ← to go back one page.'), L('Appuie sur B (○) pour revenir en arrière.', 'Press B (○) to go back.'), L('Touche Retour.', 'Tap Back.')),
    g: { kbd: { k: ['←'] }, pad: { b: ['B'] }, touch: { ui: 'back' } } },
  { id: 'help', ico: 'help', tm: 'foot', title: L('Besoin d’aide ?', 'Need help?'),
    line: M(L('Clique sur le ? pour savoir quoi faire.', 'Click the ? to know what to do.'), L('Appuie sur BACK (Select) pour savoir quoi faire.', 'Press BACK (Select) to know what to do.'), L('Touche le ? pour savoir quoi faire.', 'Tap the ? to know what to do.')),
    g: { kbd: { m: 'l', help: 1 }, pad: { b: ['BACK'] }, touch: { ui: 'help' } } },
];

/* ---------- Que faire maintenant ? (voix de Tapama) ---------- */
export const OBJECTIVES = {
  start: L('Lance ton drone et explore la ville, {nom} !', 'Launch your drone and explore the city, {nom}!'),
  spot: L('Cherche un objet brillant sur le toit, {nom}.', 'Look for a shiny object on the roof, {nom}.'),
  ramasser: L('Rapproche-toi du dispositif et ramasse-le !', 'Get close to the device and pick it up!'),
  labo: L('Va au cercle jaune : c’est mon labo !', 'Go to the yellow circle: it’s my lab!'),
  devant: L('Retourne devant la grande mosquée.', 'Go back to the big mosque.'),
  base: L('Va à la base des robots avec ton gadget !', 'Go to the robots’ base with your gadget!'),
  retour: L('Rapporte le dispositif au cercle jaune.', 'Bring the device back to the yellow circle.'),
  fin: L('Bravo {nom} ! Choisis ta prochaine aventure sur la carte.', 'Well done {nom}! Pick your next adventure on the map.'),
};

/* ---------- Textes de l'interface du guide ---------- */
export const UI = {
  how: L('Comment jouer ?', 'How to play?'),
  close: L('Fermer', 'Close'),
  prev: L('Précédent', 'Previous'),
  next: L('Suivant', 'Next'),
  done: L('Terminer', 'Finish'),
  listen: L('Écouter', 'Listen'),
  topics: L('Sujets', 'Topics'),
  settings: L('Réglages', 'Settings'),
  kbd: L('Clavier', 'Keyboard'),
  pad: L('Manette', 'Gamepad'),
  touch: L('Tactile', 'Touch'),
  kbdLong: L('Je joue au clavier et à la souris', 'I play with keyboard and mouse'),
  padLong: L('Je joue à la manette', 'I play with a gamepad'),
  touchLong: L('Je joue avec les doigts', 'I play with my fingers'),
  large: L('Grand texte', 'Large text'),
  motion: L('Animations', 'Animations'),
  speak: L('Lire à voix haute', 'Read aloud'),
  tips: L('Conseils pendant le jeu', 'Tips while playing'),
  replay: L('Rejouer le guide', 'Replay the guide'),
  replayed: L('Le guide recommence !', 'The guide starts again!'),
  skip: L('Passer le guide', 'Skip the guide'),
  skipped: L('Guide passé. Le « ? » reste là pour t’aider.', 'Guide skipped. The "?" is still here to help.'),
  gotit: L('Compris !', 'Got it!'),
  cheer0: L('C’est parti !', 'Let’s go!'), cheer1: L('À toi de jouer !', 'Your turn!'), cheer2: L('Bonne aventure !', 'Enjoy the adventure!'),   // petite phrase à la fin de la dernière bulle d'un conseil
  whatNow: L('Que faire maintenant ?', 'What now?'),
  ask: L('Demander à Tapama', 'Ask Tapama'),
  help: L('Aide : que faire maintenant ?', 'Help: what now?'),
  portrait: L('Tourne ton téléphone en mode paysage', 'Rotate your phone to landscape'),
};

/* ---------- Touches : légendes des boutons du mode « tactile » (hors actions de touch-layout) ---------- */
export const UI_LABELS = { tapui: { lab: L('Valider', 'Confirm'), hint: L('Indice', 'Hint'), page: L('Suivant', 'Next'), skip: L('Passer le dialogue', 'Skip the dialogue'), reread: L('Relire', 'Read again'), back: L('Retour', 'Back') } };

/** Tous les textes français du guide (pour les tests et la relecture). */
export function allTexts() {
  const out = [];
  for (const p of PAGES) { out.push(['page ' + p.id + ' · titre', p.title]); for (const m of ['kbd', 'pad', 'touch']) out.push([`page ${p.id} · ${m}`, p.line[m]]); }
  for (const p of PAGES) for (const m of ['kbd', 'pad']) { const g = p.g[m]; for (const c of (g.kc || g.bc || [])) out.push([`page ${p.id} · légende ${m}`, c]); }
  for (const [k, v] of Object.entries(OBJECTIVES)) out.push(['objectif ' + k, v]);
  for (const [k, v] of Object.entries(UI)) out.push(['interface ' + k, v]);
  for (const [k, v] of Object.entries(UI_LABELS.tapui)) out.push(['bouton ' + k, v]);
  return out;
}
