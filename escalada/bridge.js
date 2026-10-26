/* Preserve the approved standalone laboratory, loading it only after access is checked. */
(() => {
  'use strict';
  const button = document.querySelector('[data-page="escalada"]');
  const frame = document.getElementById('escaladaFrame');
  const loading = document.getElementById('escaladaLoading');
  const allowed = () => {
    const user = window.PuloAccess?.getUser();
    return !!user && (user.role !== 'ALUNO' || (user.permissions || []).includes('calibragem'));
  };
  function activate() {
    if (!allowed() || frame.getAttribute('src')) return;
    loading.hidden = false;
    frame.src = frame.dataset.src;
  }
  frame.addEventListener('load', () => { loading.hidden = true; });
  button.addEventListener('click', activate);
  document.addEventListener('pulo:session', () => {
    if (!allowed()) {
      frame.removeAttribute('src');
      return;
    }
    if (new URLSearchParams(location.search).get('page') === 'escalada') button.click();
  });
})();
