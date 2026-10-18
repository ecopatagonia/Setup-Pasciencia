const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');
const code = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
function parentHarness() {
  const callbacks = {}, calls = [];
  const api = { setTheme: v => calls.push(['theme', v]), setPage: v => calls.push(['page', v]), acceptPayload: v => calls.push(['payload', v]) };
  const attrs = {};
  const frame = { dataset: { src: 'comparativo/index.html?v=1.0' }, contentWindow: { PuloComparativo: api }, style: {}, getAttribute: n => attrs[n], set src(v) { attrs.src = v; }, addEventListener: (k, fn) => callbacks['frame:' + k] = fn };
  const user = { role: 'ALUNO', permissions: ['resultados'] };
  const window = { location: { origin: 'https://example.org', search: '' }, PuloAccess: { getUser: () => user }, addEventListener: (k, fn) => callbacks[k] = fn };
  const document = { getElementById: id => id === 'comparisonFrame' ? frame : {}, addEventListener: (k, fn) => callbacks[k] = fn };
  vm.runInNewContext(code('bridge.js'), { window, document, URLSearchParams, console });
  callbacks.DOMContentLoaded();
  return { window, frame, callbacks, calls, user, attrs };
}
test('one payload reaches a lazily loaded iframe; four pages preserve the same instance', () => {
  const h = parentHarness();
  const payload = { operacoes: [], comparativoGio: [] };
  h.window.PuloComparativoBridge.setPayload(payload);
  assert.equal(h.attrs.src, undefined);
  h.window.PuloComparativoBridge.activate('overview');
  assert.equal(h.attrs.src, 'comparativo/index.html?v=1.0');
  assert.equal(h.calls.length, 0);
  h.callbacks['frame:load']();
  for (const page of ['results', 'risk', 'data']) h.window.PuloComparativoBridge.activate(page);
  assert.deepEqual(h.calls.filter(c => c[0] === 'page').map(c => c[1]), ['overview', 'results', 'risk', 'data']);
  assert.equal(h.calls.filter(c => c[0] === 'payload').length, 1);
  h.window.PuloComparativoBridge.setTheme('light');
  assert.deepEqual(h.calls.filter(c => c[0] === 'theme').at(-1), ['theme', 'light']);
});
test('existing results permission gates the new menu; height messages validate both origin and source', () => {
  const h = parentHarness();
  h.user.permissions = [];
  h.window.PuloComparativoBridge.activate('overview');
  assert.equal(h.attrs.src, undefined);
  h.user.role = 'ADMINISTRADOR';
  h.window.PuloComparativoBridge.activate('risk');
  assert(h.attrs.src);
  const message = { source: h.frame.contentWindow, origin: 'https://evil.example', data: { type: 'pulo:comparativo-height', height: 1600 } };
  h.callbacks.message(message);
  assert.equal(h.frame.style.height, undefined);
  message.origin = 'https://example.org';
  message.source = {};
  h.callbacks.message(message);
  assert.equal(h.frame.style.height, undefined);
  message.source = h.frame.contentWindow;
  h.callbacks.message(message);
  assert.equal(h.frame.style.height, '1600px');
});
test('paired analysis preserves zero, excludes pending replays, and does not replace GIO baseline', () => {
  const input = [
    { id: 'OP_01-01-2026__1', date: '2026-01-01', side: 'COMPRA', original: -20, protected: 0 },
    { id: 'OP_01-01-2026__2', date: '2026-01-01', side: 'VENDA', original: 100, protected: null },
    { id: 'OP_02-01-2026__1', date: '2026-01-02', side: 'COMPRA', original: 50, protected: 80 }
  ];
  const r = E.normalize(input).filter(r => r.protected !== null);
  const p = E.paired(r, 'operations');
  assert.equal(p.a.n, 2);
  assert.equal(p.a.total, 30);
  assert.equal(p.b.total, 80);
  assert.equal(p.b.zero, 1);
  assert.equal(p.a.maxDD, 20);
  assert.equal(E.paired(r, 'days').a.total, p.a.total);
});
function childHarness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: '', classList: { add() {}, remove() {} }, addEventListener() {} });
    return elements.get(id);
  };
  element('embedded-data').textContent = JSON.stringify({ exportedAt: '2026-10-18T00:00:00Z', rows: [] });
  const data = { rows: null };
  const api = { setPage() {}, setData(rows) {
    const parsed = E.normalize(rows);
    const ids = parsed.map(r => r.id);
    if (new Set(ids).size !== ids.length) throw Error('ID duplicado');
    if (!parsed.length) throw Error('Sem operações');
    data.rows = parsed;
    return { operations: parsed.length };
  } };
  const parent = { postMessage() {} };
  const window = { parent, PuloComparativo: api, location: { origin: 'https://example.org' }, addEventListener() {} };
  const document = { getElementById: element, querySelector: () => ({ getBoundingClientRect: () => ({ height: 1200 }) }) };
  vm.runInNewContext(code('embedded.js'), { window, document, Date, requestAnimationFrame: fn => fn(), console });
  return { window, api, data, elements };
}
test('missing API field remains an explicitly dated snapshot; live payload replaces it without a fetch', () => {
  const h = childHarness();
  assert(h.elements.get('datasetNotice').textContent.includes('não se atualizam automaticamente'));
  assert.equal(h.api.acceptPayload({ sucesso: true, operacoes: [] }), false);
  const rows = [{ id: 'OP_01-01-2026__1', date: '2026-01-01', side: 'COMPRA', original: -10, protected: 0 }];
  assert.equal(h.api.acceptPayload({ comparativoGio: rows, geradoEm: '2026-10-18T00:00:00Z' }), true);
  assert.equal(h.data.rows[0].protected, 0);
  assert(h.elements.get('datasetNotice').textContent.includes('mesma carga'));
  assert.equal(h.api.acceptPayload({ comparativoGio: [...rows, ...rows] }), false);
  assert(h.elements.get('datasetNotice').textContent.includes('Falha ao validar'));
});
test('navigation and assets are wired to the existing sidebar and loader', () => {
  const index = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '../../app.js'), 'utf8');
  for (const page of ['overview', 'results', 'risk', 'data']) assert(index.includes(`data-comparison-page="${page}"`));
  assert(index.includes('comparativo/bridge.js?v=1.0'));
  assert(index.includes('id="page-comparativo"'));
  assert(app.includes('window.PuloComparativoBridge?.setPayload(payload)'));
  const child = code('index.html');
  assert(!child.includes('__DATA__'));
  assert(!child.includes('__ENGINE__'));
  assert(!child.includes('__APP__'));
  for (const file of ['engine.js', 'app.js', 'embedded.js', 'styles.css']) assert(child.includes(file + '?v=1.0'));
  assert(code('styles.css').includes('heat-positive'));
  assert(code('app.js').includes('weeklyHeatmap'));
  assert(code('app.js').includes('var(--bar-original-negative)'));
});
