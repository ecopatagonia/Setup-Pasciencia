(() => {
  'use strict';
  const pages = { overview: 'Visão comparativa', results: 'Resultados', risk: 'Risco e estabilidade', profit: 'Evolução do lucro', data: 'Operações e dados' };
  if (window.parent === window) {
    window.location.replace('../index.html?view=site&comparativo=overview');
    return;
  }
  const api = window.PuloComparativo;
  const snapshot = JSON.parse(document.getElementById('embedded-data').textContent);
  const notice = document.getElementById('datasetNotice');
  const timestamp = value => {
    if (!value) return 'data não informada';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'data não informada' : date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  };
  function snapshotNotice(extra = '') {
    notice.classList.add('warn');
    notice.textContent = `Corte de SETUP_GIO / PARA_SITE Q:Y lido em ${timestamp(snapshot.exportedAt)}. A API atual ainda não fornece o bloco GIO; os replays deste corte não se atualizam automaticamente. Importe CSV/JSON para atualizar esta sessão. ${extra}`;
  }
  snapshotNotice();
  const originalSetPage = api.setPage;
  api.setPage = page => {
    if (!Object.hasOwn(pages, page)) return;
    originalSetPage(page);
    document.getElementById('comparisonHeading').textContent = pages[page];
    requestHeight();
  };
  let settingFromAPI = false;
  let currentSource = 'snapshot';
  const originalSetData = api.setData;
  api.setData = input => {
    const result = originalSetData(input);
    if (!settingFromAPI) {
      notice.classList.add('warn');
      notice.textContent = 'Base importada nesta sessão. Exporte JSON para conservar a atualização; recarregar a página volta aos dados fornecidos pelo site.';
      document.getElementById('snapshotDate').textContent = 'Base importada nesta sessão';
    }
    requestHeight();
    return result;
  };
  api.acceptPayload = payload => {
    const rows = payload?.comparativoGio ?? payload?.comparativoProtegido;
    if (rows === undefined || rows === null) { if (currentSource === 'snapshot') snapshotNotice(); return false; }
    if (!Array.isArray(rows) || !rows.length) {
      snapshotNotice('O campo comparativo recebido está vazio ou inválido.');
      return false;
    }
    try {
      settingFromAPI = true;
      originalSetData(rows);
      currentSource = 'live';
      const date = payload.geradoEm || null;
      notice.classList.remove('warn');
      notice.textContent = `Dados GIO recebidos na mesma carga da base principal. Atualização da API: ${timestamp(date)}. Somente replays com resultado numérico entram na comparação.`;
      document.getElementById('snapshotDate').textContent = 'Dados da API · ' + timestamp(date);
      document.getElementById('sourceStatus').textContent = 'Base integrada à carga principal';
      requestHeight();
      return true;
    } catch (error) {
      snapshotNotice('Falha ao validar o bloco recebido: ' + error.message);
      return false;
    } finally { settingFromAPI = false; }
  };
  window.PuloComparisonProvenance = () => {
    if (settingFromAPI) return;
    currentSource = 'manual';
    notice.classList.add('warn');
    notice.textContent = 'Base importada nesta sessão. Exporte JSON para conservar a atualização; recarregar volta à base fornecida pelo site.';
    document.getElementById('snapshotDate').textContent = 'Base importada nesta sessão';
    requestHeight();
  };
  document.getElementById('reset').addEventListener('click', () => { currentSource = 'snapshot'; snapshotNotice(); });
  let heightPending = false;
  let lastHeight = 0;
  function requestHeight() {
    if (heightPending) return;
    heightPending = true;
    requestAnimationFrame(() => {
      heightPending = false;
      const height = Math.max(800, Math.ceil(document.querySelector('.shell').getBoundingClientRect().height));
      if (Math.abs(height - lastHeight) < 2) return;
      lastHeight = height;
      window.parent.postMessage({ type: 'pulo:comparativo-height', height }, window.location.origin);
    });
  }
  if (typeof ResizeObserver === 'function') new ResizeObserver(requestHeight).observe(document.body);
  window.addEventListener('resize', requestHeight);
  requestHeight();
})();

