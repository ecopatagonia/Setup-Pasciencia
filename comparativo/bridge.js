/* The main dashboard owns the single spreadsheet request and authenticated navigation. */
(() => {
  'use strict';
  const pages = new Set(['overview', 'results', 'risk', 'profit', 'data']);
  let currentPage = 'overview';
  let theme = 'dark';
  let payload = null;
  let ready = false;
  let appliedPayload = null;
  const frame = () => document.getElementById('comparisonFrame');
  const allowed = () => {
    const user = window.PuloAccess?.getUser();
    return !!user && (user.role !== 'ALUNO' || (user.permissions || []).includes('resultados'));
  };
  function child() {
    try { return ready ? frame()?.contentWindow?.PuloComparativo : null; }
    catch (_) { return null; }
  }
  function flush() {
    if (!allowed()) return;
    const api = child();
    if (!api) return;
    api.setTheme(theme);
    api.setPage(currentPage);
    if (payload && payload !== appliedPayload) {
      api.acceptPayload(payload);
      appliedPayload = payload;
    }
  }
  function activate(page) {
    if (!pages.has(page) || !allowed()) return;
    currentPage = page;
    const iframe = frame();
    if (!iframe) return;
    if (!iframe.getAttribute('src')) iframe.src = iframe.dataset.src;
    flush();
  }
  window.PuloComparativoBridge = Object.freeze({
    activate,
    setPayload(value) { payload = value; flush(); },
    setTheme(value) { theme = value === 'light' ? 'light' : 'dark'; flush(); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    frame()?.addEventListener('load', () => {
      ready = true;
      appliedPayload = null;
      const loading = document.getElementById('comparisonLoading');
      if (loading) loading.hidden = true;
      flush();
    });
  });
  window.addEventListener('message', event => {
    const iframe = frame();
    if (!iframe || event.source !== iframe.contentWindow || event.origin !== window.location.origin) return;
    if (event.data?.type !== 'pulo:comparativo-height') return;
    const height = Number(event.data.height);
    if (Number.isFinite(height) && height >= 300 && height <= 30000) iframe.style.height = Math.ceil(height) + 'px';
  });
  let restored = false;
  document.addEventListener('pulo:session', () => {
    if (restored || !allowed()) return;
    restored = true;
    const page = new URLSearchParams(window.location.search).get('comparativo');
    if (!pages.has(page)) return;
    document.querySelector(`[data-comparison-page="${page}"]`)?.click();
  });
})();

