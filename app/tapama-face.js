/* ==========================================================
   VISAGE ANIMÉ DE TAPAMA — la bouche suit sa voix et les yeux clignent
   ----------------------------------------------------------
   Le portrait est une image fixe (assets/images/tapama/tapama-<humeur>.webp). Un calque (canvas) posé exactement sur l'image dessine par-dessus :
   • la BOUCHE : fermée au repos (les lèvres de l'image restent visibles) ; dès que Tapama parle, elle s'ouvre au rythme réel de la voix (intensité du son,
     lissée : ouverture rapide, fermeture plus douce) avec lèvres, intérieur sombre, dents du haut et langue ;
   • les YEUX : des paupières de la couleur de la peau (échantillonnée sur l'image elle-même) descendent sur les yeux : clignement naturel toutes les 2,5 à 5 s au repos,
     plus souvent (1,6 à 3 s) quand elle parle, et un clignement au début de chaque réplique ; paupières à demi baissées un instant après certains clignements (vivant).
   Les positions (en % de l'image) sont réglées humeur par humeur car les expressions déplacent légèrement bouche et yeux.
   API : attachTapamaFace(img) -> { detach(), blink() } ; tout ce qui est pur (placement, clignement) est exporté pour les tests.
   ========================================================== */

export const IMG_W = 600, IMG_H = 745;

/** Placement par humeur, en fraction de la largeur (x) / hauteur (y) de l'image : bouche (centre, largeur) et yeux (gauche, droit, largeur, hauteur). */
export const FACE = {
  neutre:    { mouth: [0.500, 0.497, 0.090], eyes: [[0.429, 0.401], [0.572, 0.401]], eye: [0.066, 0.034] },
  attentive: { mouth: [0.500, 0.505, 0.088], eyes: [[0.434, 0.396], [0.570, 0.396]], eye: [0.066, 0.034] },
  curieuse:  { mouth: [0.492, 0.490, 0.095], eyes: [[0.432, 0.399], [0.571, 0.399]], eye: [0.066, 0.034] },
  inquiete:  { mouth: [0.502, 0.500, 0.090], eyes: [[0.430, 0.397], [0.569, 0.397]], eye: [0.066, 0.034] },
  souriante: { mouth: [0.499, 0.497, 0.135], eyes: [[0.418, 0.402], [0.577, 0.402]], eye: [0.070, 0.022] },
  surprise:  { mouth: [0.492, 0.511, 0.082], eyes: [[0.437, 0.399], [0.561, 0.399]], eye: [0.070, 0.042] },
};
export const moodOf = (src) => { const m = /tapama-(\w+)\.webp/.exec(src || ''); return m && FACE[m[1]] ? m[1] : 'neutre'; };

/** Position d'objet CSS (« 0% 100% », « bottom left », « center »…) -> [px, py] en fraction (0..1). */
export function objPosFrac(pos) {
  const tok = String(pos || '50% 50%').trim().split(/\s+/), KW = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 };
  const val = (v, def) => (v == null ? def : v.endsWith('%') ? parseFloat(v) / 100 : v in KW ? KW[v] : def);
  let a = tok[0], b = tok[1];
  if (a === 'top' || a === 'bottom') [a, b] = [b, a];                      // « bottom left » : l'ordre des mots-clés est libre
  return [val(a, 0.5), val(b, tok.length === 1 && (tok[0] === 'top' || tok[0] === 'bottom') ? KW[tok[0]] : 0.5)];
}
/** Rectangle réellement dessiné par l'image dans son élément (object-fit contain ou cover, object-position), en pixels écran. */
export function drawnRect(r, objPos = '0% 100%', fit = 'contain') {
  const sc = (fit === 'cover' ? Math.max : Math.min)(r.width / IMG_W, r.height / IMG_H), w = IMG_W * sc, h = IMG_H * sc;
  const [fx, fy] = objPosFrac(objPos);
  return { x: r.left + (r.width - w) * fx, y: r.top + (r.height - h) * fy, w, h };
}

/** Prochain clignement : délai aléatoire (s) selon qu'elle parle ou non. */
export const nextBlinkDelay = (speaking, rnd = Math.random()) => (speaking ? 1.6 + rnd * 1.4 : 2.5 + rnd * 2.5);
/** Fermeture de la paupière (0 ouverte … 1 fermée) à l'instant t (s) depuis le début d'un clignement de durée dur. */
export function blinkAmount(t, dur = 0.17) {
  if (t < 0 || t > dur) return 0;
  const k = t / dur; return k < 0.4 ? k / 0.4 : 1 - (k - 0.4) / 0.6;      // ferme vite, rouvre un peu plus lentement
}
/** Ouverture de bouche lissée : s'ouvre vite, se ferme plus doucement. */
export function smoothMouth(cur, target, dt) {
  const k = target > cur ? 1 - Math.exp(-dt * 38) : 1 - Math.exp(-dt * 16);
  return cur + (target - cur) * k;
}
/** Intensité de la voix (0..1) -> ouverture de la bouche (0..1) : seuil bas (souffle ignoré), courbe douce. */
export const openingFromLevel = (lvl) => Math.min(1, Math.max(0, (lvl - 0.06) / 0.5) ** 0.8);

export function attachTapamaFace(img) {
  if (img && img.__tpFace) return img.__tpFace;                              // déjà animé
  if (!img || typeof document === 'undefined') return { detach() {}, blink() {} };
  const parent = img.offsetParent || img.parentElement || document.body;
  const cv = document.createElement('canvas');
  cv.className = 'tp-face-fx'; cv.setAttribute('aria-hidden', 'true');
  cv.style.cssText = 'position:absolute;pointer-events:none;z-index:2;left:0;top:0;transform-origin:0 0';
  img.insertAdjacentElement('afterend', cv);
  const ctx = cv.getContext('2d');
  const skin = {};                                                       // humeur -> [r,g,b] de la peau près des yeux
  let raf = 0, last = performance.now(), mouth = 0, blinkT = -1, blinkIn = nextBlinkDelay(false), alive = true, lastSrc = '';
  const probe = document.createElement('canvas'); probe.width = IMG_W; probe.height = IMG_H;

  function sampleSkin(mood) {
    if (skin[mood] || !img.complete || !img.naturalWidth) return skin[mood] || [190, 110, 50];
    try {
      const pc = probe.getContext('2d', { willReadFrequently: true }); pc.clearRect(0, 0, IMG_W, IMG_H); pc.drawImage(img, 0, 0, IMG_W, IMG_H);
      const f = FACE[mood], pts = [[0.5, f.eyes[0][1]], [f.eyes[0][0], f.eyes[0][1] + 0.052], [f.eyes[1][0], f.eyes[1][1] + 0.052]];   // arête du nez et joues : la peau autour des yeux (pas les sourcils)
      let r = 0, g = 0, b = 0, n = 0;
      for (const [px, py] of pts) { const d = pc.getImageData(Math.round(px * IMG_W) - 3, Math.round(py * IMG_H) - 3, 6, 6).data; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } }
      skin[mood] = n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [190, 110, 50];
    } catch (_) { skin[mood] = [190, 110, 50]; }                          // image « tainted » (file://) : couleur par défaut
    return skin[mood];
  }

  function drawMouth(g, dr, f, mood, open) {
    if (open < 0.08) return;
    const [mx, my, mw] = f.mouth, cx = dr.w * mx, cy = dr.h * my, w = dr.w * mw * (mood === 'souriante' ? 0.78 : 1);
    const h = w * (0.05 + 0.25 * open);                                  // hauteur de l'ouverture : légèrement ouverte (jamais grande ouverte)
    const topY = cy - h * 0.28, botY = cy + h * 0.72, half = w / 2 * (0.86 + 0.10 * open);
    g.save();
    // lèvres (contour) : forme en amande dont le bas est plus rond que le haut
    g.beginPath();
    g.moveTo(cx - half, cy);
    g.quadraticCurveTo(cx - half * 0.5, topY - h * 0.05, cx, topY);
    g.quadraticCurveTo(cx + half * 0.5, topY - h * 0.05, cx + half, cy);
    g.quadraticCurveTo(cx + half * 0.55, botY + h * 0.08, cx, botY);
    g.quadraticCurveTo(cx - half * 0.55, botY + h * 0.08, cx - half, cy);
    g.closePath();
    g.fillStyle = '#2a0d0b'; g.fill();
    g.save(); g.clip();
    if (open > 0.3) { g.fillStyle = '#f4ece0'; g.fillRect(cx - half, topY - 1, half * 2, Math.min(h * 0.3, w * 0.07)); }   // dents du haut
    g.fillStyle = '#8c2f2c'; g.beginPath(); g.ellipse(cx, botY - h * 0.08, half * 0.5, h * 0.22, 0, 0, Math.PI * 2); g.fill();   // langue
    g.restore();
    g.lineWidth = Math.max(1.2, w * 0.06); g.strokeStyle = '#a24f2c'; g.lineJoin = 'round'; g.stroke();
    g.restore();
  }
  function drawLids(g, dr, f, mood, amt) {
    if (amt < 0.04) return;
    const [r, gg, b] = sampleSkin(mood), [ew, eh] = f.eye, W = dr.w * ew * 1.35, H = dr.h * eh * 1.9;
    for (const [ex, ey] of f.eyes) {
      const cx = dr.w * ex, cy = dr.h * ey, top = cy - H * 0.55, drop = H * (0.12 + 0.98 * amt);
      g.save();
      g.beginPath(); g.ellipse(cx, cy, W / 2, H / 2, 0, 0, Math.PI * 2); g.clip();           // la paupière reste dans le contour de l'œil
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, W / 2); gr.addColorStop(0, `rgb(${r},${gg},${b})`); gr.addColorStop(0.72, `rgb(${r},${gg},${b})`); gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);   // bord fondu : pas de disque visible
      g.fillStyle = gr; g.fillRect(cx - W / 2, top, W, drop);
      g.restore();
      if (amt > 0.55) { g.strokeStyle = 'rgba(45,25,20,.8)'; g.lineWidth = Math.max(1.2, dr.w * 0.004); g.beginPath(); g.moveTo(cx - W * 0.42, top + drop); g.quadraticCurveTo(cx, top + drop + H * 0.1, cx + W * 0.42, top + drop); g.stroke(); }   // ligne des cils
    }
  }

  let lastSpeaking = false;
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const V = window.TapamaVoice, speaking = !!(V && V.speaking);
    const pr = img.getBoundingClientRect(), par = (cv.offsetParent || parent).getBoundingClientRect();
    if (!pr.width || !pr.height || getComputedStyle(img).display === 'none') { cv.style.display = 'none'; return; }
    cv.style.display = '';
    const cs = getComputedStyle(img), dr = drawnRect(pr, cs.objectPosition || '0% 100%', cs.objectFit === 'cover' ? 'cover' : 'contain');
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(pr.width * dpr), H = Math.round(pr.height * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    // le calque couvre exactement la boîte de l'image (rognée comme elle : médaillon rond, etc.) ; le dessin est décalé sur la partie visible du portrait
    cv.style.left = (pr.left - par.left) + 'px'; cv.style.top = (pr.top - par.top) + 'px'; cv.style.width = pr.width + 'px'; cv.style.height = pr.height + 'px';
    cv.style.borderRadius = cs.borderRadius; cv.style.opacity = cs.opacity; cv.style.filter = cs.filter === 'none' ? '' : cs.filter;
    const off = { x: dr.x - pr.left, y: dr.y - pr.top };
    const mood = moodOf(img.src), f = FACE[mood];
    if (img.src !== lastSrc) { lastSrc = img.src; if (speaking || lastSpeaking) blinkT = 0; }          // nouvelle réplique/humeur : petit clignement
    if (speaking && !lastSpeaking) blinkT = 0;                                                       // elle commence à parler : elle cligne
    lastSpeaking = speaking;
    if (window.__tpFaceBlink != null) blinkT = window.__tpFaceBlink;                                // diagnostic : fige le clignement à cet instant (s)
    // clignement
    if (blinkT >= 0) { blinkT += dt; if (blinkT > 0.17) { blinkT = -1; blinkIn = nextBlinkDelay(speaking); } }
    else { blinkIn -= dt; if (blinkIn <= 0) blinkT = 0; }
    // bouche
    mouth = smoothMouth(mouth, speaking && !document.hidden ? openingFromLevel(V.level()) : 0, dt);
    const gl = img.previousElementSibling; if (gl && gl.classList && gl.classList.contains('tp-d-glow')) gl.style.setProperty('--lvl', mouth.toFixed(3));   // la lueur suit la voix
    ctx.setTransform(dpr, 0, 0, dpr, off.x * dpr, off.y * dpr); ctx.clearRect(-off.x, -off.y, pr.width, pr.height);
    drawLids(ctx, dr, f, mood, blinkAmount(blinkT)); drawMouth(ctx, dr, f, mood, mouth);
  }
  raf = requestAnimationFrame(frame);
  const api = {
    detach() { alive = false; cancelAnimationFrame(raf); cv.remove(); try { delete img.__tpFace; } catch (_) {} },
    blink() { if (blinkT < 0) blinkT = 0; },
  };
  img.__tpFace = api;
  return api;
}

if (typeof window !== 'undefined') window.TapamaFace = { attach: attachTapamaFace };      // utilisable par le laboratoire, le dossier…
