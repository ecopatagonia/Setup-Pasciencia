'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycby1rs6UObGzUGgp2I-vLt4W48V1tu2Jk8MIB066GdBynFTKjJXgBZHl8uptw3Gx_jLd/exec';
const state = { all: [], filtered: [], period: 'all', stats: null };
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const number2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent2 = value => `${number2.format(value)}%`;

function setText(key, value) {
  document.querySelectorAll(`[data-metric="${key}"]`).forEach(el => {
    el.textContent = value;
    el.classList.remove('skeleton');
  });
}

function groupByDay(operations) {
  const map = new Map();
  operations.forEach(op => {
    const key = op.dataHoraIso.slice(0, 10);
    if (!map.has(key)) map.set(key, { date: key, value: 0, count: 0 });
    const day = map.get(key);
    day.value += Number(op.financeiro);
    day.count += 1;
  });
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function calculateStats(operations) {
  const days = groupByDay(operations);
  let current = 0;
  let peak = 0;
  let trough = 0;
  let maxDrawdown = 0;
  let maxUpdraw = 0;
  const curve = [{ value: 0, date: operations[0]?.dataHoraIso || '' }];

  operations.forEach(op => {
    current += Number(op.financeiro);
    peak = Math.max(peak, current);
    trough = Math.min(trough, current);
    maxDrawdown = Math.max(maxDrawdown, peak - current);
    maxUpdraw = Math.max(maxUpdraw, current - trough);
    curve.push({ value: current, date: op.dataHoraIso });
  });

  const gains = operations.filter(op => op.resultado === 'GAIN').length;
  return {
    total: current,
    operations: operations.length,
    days,
    curve,
    gains,
    hitRate: operations.length ? gains / operations.length * 100 : 0,
    expOperation: operations.length ? current / operations.length : 0,
    expDay: days.length ? current / days.length : 0,
    maxDrawdown,
    maxUpdraw,
    max: Math.max(0, ...curve.map(p => p.value)),
    min: Math.min(0, ...curve.map(p => p.value)),
    positiveDays: days.filter(d => d.value > 0).length,
    negativeDays: days.filter(d => d.value < 0).length,
    neutralDays: days.filter(d => Math.abs(d.value) < .005).length
  };
}

function applyPeriod() {
  if (state.period === 'all' || !state.all.length) {
    state.filtered = [...state.all];
  } else {
    const latest = new Date(state.all[state.all.length - 1].dataHoraIso);
    const start = new Date(latest);
    start.setDate(start.getDate() - Number(state.period) + 1);
    state.filtered = state.all.filter(op => new Date(op.dataHoraIso) >= start);
  }

  state.stats = calculateStats(state.filtered);
  render();
}

function render() {
  const s = state.stats;
  setText('resultado', money.format(s.total));
  setText('exp-op', money.format(s.expOperation));
  setText('exp-dia', money.format(s.expDay));
  setText('taxa', `${number2.format(s.hitRate)}%`);
  setText('contagem', `${s.operations} operações`);
  setText('drawdown', money.format(-s.maxDrawdown));
  setText('updraw', money.format(s.maxUpdraw));
  setText('dias', String(s.days.length));
  setText('ops-dia', number2.format(s.days.length ? s.operations / s.days.length : 0));
  setText('dias-pos', String(s.positiveDays));
  setText('dias-neg', String(s.negativeDays));
  setText('dias-zero', String(s.neutralDays));
  document.querySelectorAll('[data-note="periodo"]').forEach(el => {
    el.textContent = state.period === 'all' ? 'Todo o período' : `Últimos ${state.period} dias`;
  });
  updatePatrimony();
  drawAll();
}

function updatePatrimony() {
  if (!state.stats) return;
  const capital = Math.max(1, Number(document.getElementById('capitalInput').value) || 1);
  const p = value => value / capital * 100;
  const s = state.stats;

  setText('pat-atual', percent2(p(s.total)));
  setText('pat-total', percent2(100 + p(s.total)));
  setText('pat-exp-op', percent2(p(s.expOperation)));
  setText('pat-exp-dia', percent2(p(s.expDay)));
  setText('pat-drawdown', percent2(-p(s.maxDrawdown)));
  setText('pat-updraw', percent2(p(s.maxUpdraw)));
  setText('pat-max', percent2(p(s.max)));
  setText('pat-min', percent2(p(s.min)));
  document.getElementById('capitalReference').textContent = money.format(s.maxDrawdown * 3);
  drawPatrimony();
}

function setupCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return { ctx, width: rect.width, height: rect.height };
}

function niceRange(values) {
  let min = Math.min(0, ...values);
  let max = Math.max(0, ...values);
  if (min === max) { min -= 1; max += 1; }
  const padding = (max - min) * .16;
  return { min: min - padding, max: max + padding };
}

function drawLineChart(canvas, values, options = {}) {
  if (!canvas || !values.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 35, right: 78, bottom: 35, left: 72 };
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = Math.max(1, height - pad.top - pad.bottom);
  const range = niceRange(values);
  const x = i => pad.left + (values.length === 1 ? 0 : i / (values.length - 1) * plotW);
  const y = value => pad.top + (range.max - value) / (range.max - range.min) * plotH;
  const zeroY = y(0);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  for (let i = 0; i <= 4; i++) {
    const value = range.max - (range.max - range.min) * i / 4;
    const yy = pad.top + plotH * i / 4;
    ctx.strokeStyle = 'rgba(99, 133, 147, .2)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillStyle = '#60757e';
    ctx.textAlign = 'right';
    ctx.fillText(options.formatAxis(value), pad.left - 12, yy);
  }

  if (zeroY >= pad.top && zeroY <= pad.top + plotH) {
    ctx.strokeStyle = values.some(v => v < 0) ? '#ff5164' : 'rgba(139,154,161,.55)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();
  }

  const fillSegment = (above, color) => {
    ctx.save();
    ctx.beginPath();
    if (above) ctx.rect(pad.left, pad.top, plotW, Math.max(0, zeroY - pad.top));
    else ctx.rect(pad.left, zeroY, plotW, Math.max(0, pad.top + plotH - zeroY));
    ctx.clip();
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(x(0), zeroY);
    values.forEach((v, i) => ctx.lineTo(x(i), y(v)));
    ctx.lineTo(x(values.length - 1), zeroY);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  };

  fillSegment(true, 'rgba(53,216,202,.28)');
  fillSegment(false, 'rgba(255,81,100,.3)');

  const strokeSegment = (above, color) => {
    ctx.save();
    ctx.beginPath();
    if (above) ctx.rect(pad.left - 4, pad.top - 4, plotW + 8, Math.max(0, zeroY - pad.top + 4));
    else ctx.rect(pad.left - 4, zeroY - 4, plotW + 8, Math.max(0, pad.top + plotH - zeroY + 8));
    ctx.clip();
    ctx.beginPath();
    values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  };

  strokeSegment(true, '#35d8ca');
  strokeSegment(false, '#ff5164');

  const markers = [
    { label: 'Máx.', value: Math.max(...values), index: values.indexOf(Math.max(...values)), color: '#35d8ca' },
    ...(Math.min(...values) < 0 ? [{ label: 'Mín.', value: Math.min(...values), index: values.indexOf(Math.min(...values)), color: '#ff5164' }] : []),
    { label: 'Atual', value: values[values.length - 1], index: values.length - 1, color: values[values.length - 1] < 0 ? '#ff5164' : '#e7f0f3' }
  ];

  markers.forEach((m, idx) => {
    const xx = x(m.index), yy = y(m.value);
    ctx.fillStyle = m.color;
    ctx.beginPath(); ctx.arc(xx, yy, 4, 0, Math.PI * 2); ctx.fill();
    const label = `${m.label} ${options.formatMarker(m.value)}`;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    const w = ctx.measureText(label).width + 14;
    let boxX = m.index === values.length - 1 ? Math.min(width - w - 5, xx + 9) : Math.max(3, Math.min(width - w - 3, xx - w / 2));
    let boxY = yy - 28 - (idx === 2 && markers.length > 2 ? 17 : 0);
    boxY = Math.max(4, Math.min(height - 25, boxY));
    ctx.fillStyle = '#0c1c26';
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(boxX, boxY, w, 22, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = m.color;
    ctx.textAlign = 'center';
    ctx.fillText(label, boxX + w / 2, boxY + 11);
  });
}

function drawDaily() {
  const canvas = document.getElementById('dailyChart');
  const days = state.stats?.days || [];
  if (!days.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 18, right: 15, bottom: 34, left: 62 };
  const values = days.map(d => d.value);
  const range = niceRange(values);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = value => pad.top + (range.max - value) / (range.max - range.min) * plotH;
  const zeroY = y(0);
  const slot = plotW / days.length;
  const barW = Math.max(3, Math.min(18, slot * .58));

  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const value = range.max - (range.max - range.min) * i / 4;
    const yy = pad.top + plotH * i / 4;
    ctx.strokeStyle = 'rgba(99,133,147,.18)';
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillStyle = '#60757e'; ctx.textAlign = 'right';
    ctx.fillText(money.format(value).replace(',00', ''), pad.left - 9, yy);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(139,154,161,.55)';
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();

  days.forEach((d, i) => {
    const xx = pad.left + slot * i + (slot - barW) / 2;
    let top = Math.min(y(d.value), zeroY);
    let h = Math.abs(y(d.value) - zeroY);
    if (Math.abs(d.value) < .005) { top = zeroY - 3; h = 6; }
    ctx.fillStyle = d.value > 0 ? '#35d8ca' : d.value < 0 ? '#ff5164' : '#8b9aa1';
    ctx.beginPath(); ctx.roundRect(xx, top, barW, Math.max(3, h), 3); ctx.fill();
  });

  const labelIndices = [0, Math.floor((days.length - 1) / 2), days.length - 1];
  ctx.fillStyle = '#60757e'; ctx.textAlign = 'center';
  [...new Set(labelIndices)].forEach(i => {
    const date = new Date(`${days[i].date}T12:00:00`);
    ctx.fillText(new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date), pad.left + slot * i + slot / 2, height - 12);
  });
}

function drawPatrimony() {
  if (!state.stats) return;
  const capital = Math.max(1, Number(document.getElementById('capitalInput').value) || 1);
  const values = state.stats.curve.map(p => p.value / capital * 100);
  drawLineChart(document.getElementById('patrimonyChart'), values, {
    formatAxis: value => `${number2.format(value)}%`,
    formatMarker: value => `${number2.format(value)}%`
  });
}

function drawAll() {
  if (!state.stats) return;
  drawLineChart(document.getElementById('resultChart'), state.stats.curve.map(p => p.value), {
    formatAxis: value => money.format(value).replace(',00', ''),
    formatMarker: value => money.format(value)
  });
  drawDaily();
  drawPatrimony();
}

async function loadData() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusDetail = document.getElementById('statusDetail');
  const notice = document.getElementById('notice');

  try {
    const response = await fetch(API_URL, { method: 'GET', redirect: 'follow', cache: 'no-store' });
    if (!response.ok) throw new Error(`Resposta HTTP ${response.status}`);
    const payload = await response.json();
    if (!payload.sucesso || !Array.isArray(payload.operacoes)) {
      throw new Error(payload.mensagem || 'A API não devolveu operações válidas.');
    }

    state.all = payload.operacoes;
    statusDot.className = 'status-dot ok';
    statusText.textContent = 'Dados atualizados';
    statusDetail.textContent = `${payload.meta.total} operações · ${payload.geradoEm.slice(0, 10)}`;
    applyPeriod();
  } catch (error) {
    console.error(error);
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Falha na conexão';
    statusDetail.textContent = 'Verifique a API publicada';
    notice.textContent = `Não foi possível carregar DADOS_SITE. ${error.message}`;
    notice.classList.add('visible');
    document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
  }
}

document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b === button));
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${button.dataset.page}`));
    document.getElementById('sidebar').classList.remove('open');
    requestAnimationFrame(drawAll);
  });
});

document.querySelectorAll('.period-filter').forEach(filter => {
  filter.addEventListener('change', event => {
    state.period = event.target.value;
    document.querySelectorAll('.period-filter').forEach(other => { other.value = state.period; });
    applyPeriod();
  });
});

document.querySelectorAll('.menu-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    button.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
  });
});

document.getElementById('capitalInput').addEventListener('input', updatePatrimony);
document.getElementById('useReference').addEventListener('click', () => {
  if (!state.stats) return;
  document.getElementById('capitalInput').value = Math.max(1, Math.ceil(state.stats.maxDrawdown * 3));
  updatePatrimony();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAll, 100);
});

loadData();
