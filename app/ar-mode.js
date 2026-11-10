/* Mode AR — Android (Scene Viewer / WebXR) + iOS (Quick Look)
 * Utilise <model-viewer> de Google — un seul GLB gère tout.
 */

const MV_SCRIPT = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
async function ensureModelViewer(viewer) {
  if (!customElements.get('model-viewer') && !document.querySelector('script[data-mv]')) {
    const s = document.createElement('script');
    s.type = 'module'; s.src = MV_SCRIPT; s.dataset.mv = '1';
    document.head.appendChild(s);
  }
  await customElements.whenDefined('model-viewer');
  const src = viewer.dataset.src;
  if (src && !viewer.getAttribute('src')) {
    viewer.setAttribute('src', src);
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (coarse) {   // sur téléphone, canActivateAR n'est connu qu'une fois le modèle chargé
      await new Promise((res) => { viewer.addEventListener('load', res, { once: true }); setTimeout(res, 15000); });
    }
  }
}

export async function enter() {
  const viewer = document.getElementById('mosqueArViewer');
  if (!viewer) {
    _toast('Composant AR non trouvé');
    return;
  }

  // <model-viewer> (script Google 0,25 Mo + mosquée 1,4 Mo) n'est chargé qu'à la première entrée en AR
  await ensureModelViewer(viewer);

  // Ordinateur (ou appareil sans AR) : la mosquée se pose sur la main de l'utilisateur, grâce à la webcam et au suivi de la main
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!viewer.canActivateAR || !coarse) {
    try { const mod = await import('./ar-hand.js?v=2'); await mod.start(); }
    catch (e) { console.warn('[AR] suivi de la main indisponible :', e); _showArUnavailable(); }
    return;
  }

  viewer.addEventListener('ar-status', (e) => {
    if (e.detail.status === 'failed') {
      _showArUnavailable();
    }
  }, { once: true });

  viewer.activateAR();
}

function _showArUnavailable() {
  const stage = document.getElementById('mosqueStage');
  if (!stage) return;

  // Supprimer un éventuel message déjà affiché
  stage.querySelector('.ar-unavailable-msg')?.remove();

  const el = document.createElement('div');
  el.className = 'ar-unavailable-msg';
  el.innerHTML = `
    <span class="ar-unavail-icon">⬡</span>
    <strong>AR non disponible</strong>
    <p>Votre appareil ne supporte pas la réalité augmentée.<br>
    Un smartphone Android avec ARCore ou un iPhone (iOS 12+) est requis.</p>
    <button class="ar-unavail-close" aria-label="Fermer">✕</button>
  `;
  el.querySelector('.ar-unavail-close').onclick = () => el.remove();
  stage.appendChild(el);

  setTimeout(() => el.remove(), 6000);
}

function _toast(msg) {
  const stage = document.getElementById('mosqueStage');
  if (!stage) return;
  const el = document.createElement('div');
  el.className = 'mq-toast';
  el.textContent = msg;
  stage.appendChild(el);
  void el.offsetWidth;
  el.classList.add('visible');
  setTimeout(() => el.remove(), 3500);
}
