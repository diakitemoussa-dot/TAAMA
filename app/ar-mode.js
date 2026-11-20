/* Mode AR — Android (Scene Viewer / WebXR) + iOS (Quick Look)
 * Utilise <model-viewer> de Google — un seul GLB gère tout.
 */

export async function enter() {
  const viewer = document.getElementById('mosqueArViewer');
  if (!viewer) {
    _toast('Composant AR non trouvé');
    return;
  }

  // Attendre que le custom element soit complètement défini
  await customElements.whenDefined('model-viewer');

  // Vérifier si AR est supporté sur cet appareil
  if (!viewer.canActivateAR) {
    _showArUnavailable();
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
