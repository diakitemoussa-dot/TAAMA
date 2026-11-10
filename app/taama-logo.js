/* ==========================================================
   LOGO « TAAMA » — lettres en terre (banco) avec poutres de bois (torons) et œufs d'autruche, comme les mosquées du Sahel.
   Le mot « TAAMA » des écrans du jeu (lancement, menu, nouvelle partie…) est remplacé par ce dessin vectoriel (SVG filtré : relief, grain, ombre des poutres).
   Il suit la taille du texte d'origine (hauteur = 0,95 em). Chaque exemplaire a ses propres identifiants (dégradés, filtres) : aucune collision.
   API : taamaLogo(uid) -> chaîne SVG ; applyTaamaLogo(racine) : remplace chaque élément dont le texte est exactement « TAAMA ».
   ========================================================== */
const WOOD = (items) => items.map(([x, y, w, c]) => `<rect${c ? ' class="end"' : ''} x="${x}" y="${y}" width="${w}" height="${c ? 8 : 6.5}" rx="${c ? 3 : 2.5}"></rect>`).join('');
const EGGS = (i, list) => `<g fill="url(#eggG)" stroke="#b89a70" stroke-width=".8" style="--i:${i}">${list.map(([cx, cy, rx, ry]) => `<ellipse class="egg" cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"></ellipse>`).join('')}</g>`;
const letter = (x, i, mud, wood, eggs) => `<g transform="translate(${x},0)"><g class="tl-l" style="--i:${i}"><g filter="url(#mud)" fill="url(#mudG)">${mud}</g><g class="tl-w" fill="url(#woodG)" filter="url(#woodSh)">${WOOD(wood)}</g>${EGGS(i, eggs)}</g></g>`;

// A (3 fois) : triangle évidé, trois flèches (minarets) et trois œufs
const A_MUD = '<path fill-rule="evenodd" d="M0,260 L56,60 L114,60 L170,260 L112,260 L103,222 L67,222 L58,260 Z M85,110 L100,180 L70,180 Z"></path><path d="M53,64 C53,52.8 58.4,43.2 59.12,36 L64.88,36 C65.6,43.2 71,52.8 71,64 Z"></path><path d="M68,64 C68,43.8 78.2,22.2 79.56,6 L90.44,6 C91.8,22.2 102,43.8 102,64 Z"></path><path d="M99,64 C99,52.8 104.4,43.2 105.12,36 L110.88,36 C111.6,43.2 117,52.8 117,64 Z"></path>';
const A_WOOD = [[29.2, 117], [127.8, 117], [13.8, 172], [143.2, 172], [-2.16, 229], [159.16, 229]].map(([x, y]) => [x, y, 13]).concat([[81, 82, 8, 1], [30, 196, 8, 1], [132, 196, 8, 1]]);
const A_EGGS = [[62, 32.5, 3.85, 4.9], [85, 0.25, 6.325, 8.05], [108, 32.5, 3.85, 4.9]];

// T
const T_MUD = '<path d="M0,60 L170,60 L170,118 L113,118 L120,260 L50,260 L57,118 L0,118 Z"></path><circle cx="42" cy="61" r="7"></circle><circle cx="62" cy="61" r="6"></circle><circle cx="108" cy="61" r="6"></circle><circle cx="128" cy="61" r="7"></circle><path d="M3,64 C3,49.8 10.8,36.2 11.84,26 L20.16,26 C21.2,36.2 29,49.8 29,64 Z"></path><path d="M69,64 C69,45 78.6,25 79.88,10 L90.12,10 C91.4,25 101,45 101,64 Z"></path><path d="M141,64 C141,49.8 148.8,36.2 149.84,26 L158.16,26 C159.2,36.2 167,49.8 167,64 Z"></path>';
const T_WOOD = [[-12, 86, 15], [167, 86, 15], [44.42, 147, 14], [111.58, 147, 14], [42.2, 192, 14], [113.8, 192, 14], [40.08, 235, 14], [115.92, 235, 14], [26, 85, 8, 1], [54, 85, 8, 1], [108, 85, 8, 1], [136, 85, 8, 1], [81, 161, 8, 1], [81, 208, 8, 1]];
const T_EGGS = [[16, 21.5, 4.95, 6.3], [85, 4.5, 6.05, 7.7], [154, 21.5, 4.95, 6.3]];

// M
const M_MUD = '<path d="M2,60 L56,60 L85,126 L114,60 L168,60 L172,260 L118,260 L118,152 L96,202 L74,202 L52,152 L52,260 L-2,260 Z"></path><path d="M12,64 C12,46.2 21,27.8 22.2,14 L31.8,14 C33,27.8 42,46.2 42,64 Z"></path><path d="M128,64 C128,46.2 137,27.8 138.2,14 L147.8,14 C149,27.8 158,46.2 158,64 Z"></path>';
const M_WOOD = [[-8.4, 97, 13], [165.4, 97, 13], [-8.9, 147, 13], [165.9, 147, 13], [-9.4, 197, 13], [166.4, 197, 13], [-9.85, 242, 13], [166.85, 242, 13], [23, 101, 8, 1], [23, 151, 8, 1], [23, 201, 8, 1], [139, 101, 8, 1], [139, 151, 8, 1], [139, 201, 8, 1]];
const M_EGGS = [[27, 9, 5.5, 7], [143, 9, 5.5, 7]];

const DEFS = `<defs>
<linearGradient id="mudG" gradientUnits="userSpaceOnUse" x1="0" y1="10" x2="0" y2="262"><stop offset="0" stop-color="#f7cf98"></stop><stop offset=".3" stop-color="#e3a061"></stop><stop offset=".7" stop-color="#c67640"></stop><stop offset="1" stop-color="#94471f"></stop></linearGradient>
<linearGradient id="woodG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a35"></stop><stop offset="1" stop-color="#3f2414"></stop></linearGradient>
<radialGradient id="eggG" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"></stop><stop offset=".6" stop-color="#f6ead2"></stop><stop offset="1" stop-color="#d6c09c"></stop></radialGradient>
<filter id="mud" filterUnits="userSpaceOnUse" x="-50" y="-20" width="280" height="300" color-interpolation-filters="sRGB">
<feGaussianBlur in="SourceGraphic" stdDeviation="3.4" result="b"></feGaussianBlur>
<feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9" result="goo"></feColorMatrix>
<feTurbulence type="fractalNoise" baseFrequency=".14" numOctaves="5" seed="11" result="n"></feTurbulence>
<feDiffuseLighting in="n" surfaceScale="1.1" lighting-color="#ffffff" result="tex"><feDistantLight azimuth="235" elevation="62"></feDistantLight></feDiffuseLighting>
<feComposite in="tex" in2="goo" operator="in" result="texIn"></feComposite>
<feBlend in="goo" in2="texIn" mode="multiply" result="mudT"></feBlend>
<feGaussianBlur in="goo" stdDeviation="5" result="ab"></feGaussianBlur>
<feSpecularLighting in="ab" surfaceScale="6" specularConstant=".75" specularExponent="16" lighting-color="#ffe8c4" result="sp"><feDistantLight azimuth="235" elevation="38"></feDistantLight></feSpecularLighting>
<feComposite in="sp" in2="goo" operator="in" result="spIn"></feComposite>
<feComposite in="mudT" in2="spIn" operator="arithmetic" k2="1" k3=".6" result="lit"></feComposite>
<feMorphology in="goo" operator="erode" radius="3" result="er"></feMorphology>
<feComposite in="goo" in2="er" operator="out" result="rim"></feComposite>
<feFlood flood-color="#6e3518" flood-opacity=".55"></feFlood><feComposite in2="rim" operator="in" result="rimC"></feComposite>
<feOffset in="rimC" dx="1.5" dy="2" result="rimO"></feOffset><feComposite in="rimO" in2="goo" operator="in" result="rimIn"></feComposite>
<feMerge><feMergeNode in="lit"></feMergeNode><feMergeNode in="rimIn"></feMergeNode></feMerge>
</filter>
<filter id="woodSh" x="-30%" y="-60%" width="160%" height="260%"><feDropShadow dx="0" dy="3" stdDeviation="1.3" flood-color="#3a1a0c" flood-opacity=".6"></feDropShadow></filter>
</defs>`;

/* Animation d'apparition : les lettres montent de la terre l'une après l'autre (T-A-A-M-A), avec un petit rebond ; puis les poutres de bois apparaissent et les œufs « éclosent » (pop) du bas vers le haut.
   Rejouée à chaque affichage de l'écran (le logo est recréé). Désactivée si le joueur préfère moins de mouvement. */
const STYLE = `<style>
.tl-l,.tl-w,.egg{transform-box:fill-box}
.tl-l{transform-origin:50% 100%;opacity:0;animation:tlRise .9s cubic-bezier(.2,.9,.3,1.25) both;animation-delay:calc(.15s + var(--i,0) * .16s)}
.tl-w{opacity:0;animation:tlFade .5s ease-out both;animation-delay:calc(.75s + var(--i,0) * .16s)}
.egg{transform-origin:50% 100%;opacity:0;animation:tlPop .55s cubic-bezier(.2,1.6,.4,1) both;animation-delay:calc(1.05s + var(--i,0) * .16s)}
@keyframes tlRise{0%{opacity:0;transform:translateY(70px) scale(.9,.55)}55%{opacity:1;transform:translateY(-10px) scale(1,1.06)}78%{transform:translateY(3px) scale(1,.98)}100%{opacity:1;transform:none}}
@keyframes tlFade{from{opacity:0}to{opacity:1}}
@keyframes tlPop{0%{opacity:0;transform:scale(0)}100%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.tl-l,.tl-w,.egg{animation:none;opacity:1}}
</style>`;

let counter = 0;
/** Chaîne SVG du logo ; uid rend les identifiants uniques (plusieurs logos dans la même page). */
export function taamaLogo(uid = ++counter) {
  const svg = `<svg viewBox="-40 -10 1040 300" role="img" aria-label="TAAMA" xmlns="http://www.w3.org/2000/svg" style="height:.95em;width:auto;display:inline-block;vertical-align:middle;overflow:visible">${STYLE}${DEFS}` +
    letter(0, 0, T_MUD, T_WOOD, T_EGGS) + letter(192, 1, A_MUD, A_WOOD, A_EGGS) + letter(384, 2, A_MUD, A_WOOD, A_EGGS) +
    letter(576, 3, M_MUD, M_WOOD, M_EGGS) + letter(768, 4, A_MUD, A_WOOD, A_EGGS) + '</svg>';
  return svg.replace(/\bid="(mudG|woodG|eggG|mud|woodSh)"/g, `id="$1-${uid}"`).replace(/url\(#(mudG|woodG|eggG|mud|woodSh)\)/g, `url(#$1-${uid})`);
}

/** Remplace chaque élément (sans enfant) dont le texte est « TAAMA » par le logo. */
export function applyTaamaLogo(root) {
  if (!root || !root.querySelectorAll) return 0;
  let n = 0;
  root.querySelectorAll('h1, div, span, p').forEach((el) => {
    if (el.children.length || (el.textContent || '').trim() !== 'TAAMA') return;
    el.innerHTML = taamaLogo(); el.style.letterSpacing = '0'; el.setAttribute('aria-label', 'TAAMA'); n++;
  });
  return n;
}
