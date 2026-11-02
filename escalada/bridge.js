/* Load each capital laboratory only after the site session has been checked. */
(() => {
  'use strict';
  const routes = [
    { page: 'escalada', dataset: 'gatto', button: document.querySelector('[data-page="escalada"]'), frame: document.getElementById('escaladaFrame'), loading: document.getElementById('escaladaLoading') },
    { page: 'escaladaGio', dataset: 'gio', button: document.querySelector('[data-page="escaladaGio"]'), frame: document.getElementById('escaladaGioFrame'), loading: document.getElementById('escaladaGioLoading') }
  ];
  const allowed = () => {
    const user = window.PuloAccess?.getUser();
    return !!user && (user.role !== 'ALUNO' || (user.permissions || []).includes('calibragem'));
  };
  function activate(route) {
    if (!allowed() || route.frame.getAttribute('src')) return;
    if (route.dataset === 'gio') {
      const data = window.PuloEscaladaData?.getGioData?.();
      if (!data?.operations?.length) {
        const notice = document.getElementById('notice');
        notice.textContent = 'A base GIO ainda não entregou operações com EXECUTADO PROTEGENDO numérico.';
        notice.classList.add('visible');
        return;
      }
    }
    route.loading.hidden = false;
    route.frame.src = route.frame.dataset.src;
  }
  routes.forEach(route => {
    route.frame.addEventListener('load', () => {
      if (route.dataset !== 'gio') route.loading.hidden = true;
    });
    route.button.addEventListener('click', () => activate(route));
  });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const route = routes.find(item => item.frame.contentWindow === event.source);
    if (!route || route.dataset !== 'gio') return;
    if (event.data?.type === 'pulo:escalada:ready') {
      const payload = window.PuloEscaladaData?.getGioData?.();
      if (!payload?.operations?.length) return;
      route.frame.contentWindow.postMessage({ type: 'pulo:escalada:gio-data', payload }, event.origin);
    } else if (event.data?.type === 'pulo:escalada:loaded') {
      route.loading.hidden = true;
    }
  });
  document.addEventListener('pulo:session', () => {
    if (!allowed()) {
      routes.forEach(route => {
        route.frame.removeAttribute('src');
        route.loading.hidden = true;
      });
      return;
    }
    const page = new URLSearchParams(location.search).get('page');
    const route = routes.find(item => item.page === page);
    if (route) route.button.click();
  });
})();
