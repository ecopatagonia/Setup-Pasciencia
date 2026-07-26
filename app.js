'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycby1rs6UObGzUGgp2I-vLt4W48V1tu2Jk8MIB066GdBynFTKjJXgBZHl8uptw3Gx_jLd/exec';
const state = { all: [], filtered: [], period: 'custom', customFrom: '', customTo: '', mode: 'operations', stats: null, resultFilter: 'all' };
const MODE_PAGES = new Set(['visao', 'resultados', 'pontos', 'operacoes']);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const points0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const number2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent2 = value => `${number2.format(value)}%`;
const POINT_VALUE = 0.20;
const riskConfig = { contracts: 1, maxOperations: 3, lastLimitEdited: 'points' };
const cssColor = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function setText(key, value) {
  document.querySelectorAll(`[data-metric="${key}"]`).forEach(el => {
    el.textContent = value;
    el.classList.remove('skeleton');
    if (String(value).includes('R$')) {
      el.classList.toggle('negative', String(value).trim().startsWith('-'));
    }
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
  const analysisRows = state.mode === 'days'
    ? days.map(day => ({ value: day.value, date: day.date }))
    : operations.map(op => ({ value: Number(op.financeiro), date: op.dataHoraIso }));
  let current = 0;
  let peak = 0;
  let trough = 0;
  let maxDrawdown = 0;
  let maxUpdraw = 0;
  const curve = [{ value: 0, date: analysisRows[0]?.date || '' }];

  analysisRows.forEach(row => {
    current += row.value;
    peak = Math.max(peak, current);
    trough = Math.min(trough, current);
    maxDrawdown = Math.max(maxDrawdown, peak - current);
    maxUpdraw = Math.max(maxUpdraw, current - trough);
    curve.push({ value: current, date: row.date });
  });

  const gainOps = operations.filter(op => op.resultado === 'GAIN');
  const stopOps = operations.filter(op => op.resultado === 'STOP');
  const unitValues = analysisRows.map(row => row.value);
  const unitGains = unitValues.filter(value => value > 0);
  const unitLosses = unitValues.filter(value => value < 0);
  const gains = unitGains.length;
  const grossGain = unitGains.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(unitLosses.reduce((sum, value) => sum + value, 0));
  const average = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
  const dailyAverage = average(days.map(d => d.value));
  const dailyDeviation = Math.sqrt(average(days.map(d => (d.value - dailyAverage) ** 2)));
  const streak = result => {
    let best = 0, currentStreak = 0;
    operations.forEach(op => {
      currentStreak = op.resultado === result ? currentStreak + 1 : 0;
      best = Math.max(best, currentStreak);
    });
    return best;
  };
  const sortedDays = [...days].sort((a, b) => b.value - a.value);
  const topThree = sortedDays.slice(0, 3).reduce((sum, day) => sum + Math.max(0, day.value), 0);
  const totalPositiveDays = days.reduce((sum, day) => sum + Math.max(0, day.value), 0);
  return {
    total: current,
    operations: operations.length,
    days,
    curve,
    gains,
    hitRate: analysisRows.length ? analysisRows.filter(row => row.value > 0).length / analysisRows.length * 100 : 0,
    expOperation: operations.length ? current / operations.length : 0,
    expDay: days.length ? current / days.length : 0,
    maxDrawdown,
    maxUpdraw,
    max: Math.max(0, ...curve.map(p => p.value)),
    min: Math.min(0, ...curve.map(p => p.value)),
    positiveDays: days.filter(d => d.value > 0).length,
    negativeDays: days.filter(d => d.value < 0).length,
    neutralDays: days.filter(d => Math.abs(d.value) < .005).length
    ,
    grossGain,
    grossLoss,
    profitFactor: grossLoss ? grossGain / grossLoss : grossGain ? Infinity : 0,
    averageGain: average(unitGains),
    averageStop: average(unitLosses),
    payoff: unitLosses.length && average(unitLosses) ? average(unitGains) / Math.abs(average(unitLosses)) : 0,
    bestOperation: unitValues.length ? Math.max(...unitValues) : 0,
    worstOperation: unitValues.length ? Math.min(...unitValues) : 0,
    averagePoints: state.mode === 'days' ? average(groupByDay(operations.map(op => ({...op, financeiro: Number(op.pontos)}))).map(day => day.value)) : average(operations.map(op => Number(op.pontos))),
    gainCount: unitGains.length,
    stopCount: unitLosses.length,
    breakevenCount: unitValues.filter(value => Math.abs(value) < .005).length,
    dailyDeviation,
    bestDay: sortedDays[0] || null,
    worstDay: sortedDays[sortedDays.length - 1] || null,
    gainStreak: streak('GAIN'),
    stopStreak: streak('STOP'),
    daysAboveAverage: days.filter(d => d.value > dailyAverage).length,
    profitConcentration: totalPositiveDays ? topThree / totalPositiveDays * 100 : 0
  };
}

function applyPeriod() {
  if (!state.all.length) {
    state.filtered = [...state.all];
  } else {
    const latestIso = state.all[state.all.length - 1].dataHoraIso.slice(0, 10);
    const latest = new Date(`${latestIso}T12:00:00`);
    let start = new Date(latest), end = new Date(latest);
    if (state.period === 'last') start = new Date(latest);
    if (state.period === 'week') {
      const weekday = (latest.getDay() + 6) % 7;
      start.setDate(start.getDate() - weekday);
      end = new Date(start); end.setDate(end.getDate() + 4);
    }
    if (state.period === 'month') { start = new Date(latest.getFullYear(), latest.getMonth(), 1, 12); end = new Date(latest.getFullYear(), latest.getMonth() + 1, 0, 12); }
    if (state.period === 'year') { start = new Date(latest.getFullYear(), 0, 1, 12); end = new Date(latest.getFullYear(), 11, 31, 12); }
    if (state.period === 'custom') {
      const firstIso = state.all[0].dataHoraIso.slice(0, 10);
      start = new Date(`${state.customFrom || firstIso}T00:00:00`);
      end = new Date(`${state.customTo || latestIso}T23:59:59`);
    }
    state.filtered = state.all.filter(op => {
      const date = new Date(op.dataHoraIso);
      return date >= start && date <= end;
    });
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
  setText('contagem', state.mode === 'days' ? `${s.days.length} pregões` : `${s.operations} operações`);
  setText('drawdown', money.format(-s.maxDrawdown));
  setText('updraw', money.format(s.maxUpdraw));
  setText('dias', String(s.days.length));
  setText('ops-dia', number2.format(s.days.length ? s.operations / s.days.length : 0));
  const activeValues = state.mode === 'days' ? s.days.map(day => day.value) : state.filtered.map(op => Number(op.financeiro));
  setText('dias-pos', String(activeValues.filter(value => value > 0).length));
  setText('dias-neg', String(activeValues.filter(value => value < 0).length));
  setText('dias-zero', String(activeValues.filter(value => Math.abs(value) < .005).length));
  document.querySelector('[data-summary-positive]').textContent = state.mode === 'days' ? 'dias positivos' : 'operações gain';
  document.querySelector('[data-summary-negative]').textContent = state.mode === 'days' ? 'dias negativos' : 'operações loss';
  document.querySelector('[data-summary-neutral]').textContent = state.mode === 'days' ? 'dias neutros' : 'operações breakeven';
  setText('profit-factor', Number.isFinite(s.profitFactor) ? number2.format(s.profitFactor) : '∞');
  setText('payoff', number2.format(s.payoff));
  setText('gain-medio', money.format(s.averageGain));
  setText('stop-medio', money.format(s.averageStop));
  const unitName = state.mode === 'days' ? 'dias' : 'operações';
  setText('gains-count', `${s.gainCount} ${state.mode === 'days' ? 'dias positivos' : 'gains'}`);
  setText('stops-count', `${s.stopCount} ${state.mode === 'days' ? 'dias negativos' : 'losses'}`);
  setText('melhor-op', money.format(s.bestOperation));
  setText('pior-op', money.format(s.worstOperation));
  setText('pontos-medios', `${points0.format(s.averagePoints)} pts`);
  setText('be-count', String(s.breakevenCount));
  setText('cons-pos', `${number2.format(s.days.length ? s.positiveDays / s.days.length * 100 : 0)}%`);
  setText('cons-pos-count', `${s.positiveDays} pregões`);
  setText('melhor-dia', money0.format(s.bestDay?.value || 0));
  setText('pior-dia', money0.format(s.worstDay?.value || 0));
  setText('melhor-dia-data', s.bestDay ? formatDate(s.bestDay.date) : '—');
  setText('pior-dia-data', s.worstDay ? formatDate(s.worstDay.date) : '—');
  setText('desvio-dia', money0.format(s.dailyDeviation));
  setText('streak-gain', String(s.gainStreak));
  setText('streak-stop', String(s.stopStreak));
  const periodLabel = describePeriod();
  document.querySelectorAll('[data-note="periodo"]').forEach(el => { el.textContent = periodLabel; });
  const periodReference = document.getElementById('periodReference');
  if (periodReference) periodReference.textContent = periodLabel;
  document.querySelectorAll('[data-dynamic-label="hit-rate"]').forEach(el => { el.textContent = state.mode === 'days' ? 'Taxa de acerto por dia' : 'Taxa de acerto por operação'; });
  document.querySelectorAll('[data-unit-note]').forEach(el => { el.textContent = state.mode === 'days' ? 'Calculado por fechamento diário' : 'Calculado por operação'; });
  document.querySelectorAll('#periodSelector button').forEach(button => {
    const active = button.dataset.period === state.period;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('#analysisMode button').forEach(button => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  document.querySelectorAll('[data-metric="melhor-op"]').forEach(el => el.previousElementSibling.textContent = state.mode === 'days' ? 'Melhor dia' : 'Melhor operação');
  document.querySelectorAll('[data-metric="pior-op"]').forEach(el => el.previousElementSibling.textContent = state.mode === 'days' ? 'Pior dia' : 'Pior operação');
  document.getElementById('distributionTitle').textContent = `Distribuição por ${state.mode === 'days' ? 'dia' : 'operação'}`;
  document.getElementById('distributionCopy').textContent = `Quantidade de ${unitName} em cada faixa de resultado.`;
  updatePatrimony();
  renderSideComparison();
  renderConsistency();
  renderHours();
  renderOperations();
  renderPoints();
  renderEvolution();
  renderExtended();
  drawAll();
}

function describePeriod() {
  if (!state.filtered.length) return 'Nenhum registro no período selecionado.';
  const first = state.filtered[0].dataHoraIso.slice(0, 10);
  const last = state.filtered[state.filtered.length - 1].dataHoraIso.slice(0, 10);
  const days = groupByDay(state.filtered).length;
  const longDate = iso => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`)).replace('.', '');
  if (state.period === 'last') return `${longDate(last)} · 1 dia operado`;
  if (state.period === 'week') return `${longDate(first)} a ${longDate(last)} · ${days} ${days === 1 ? 'dia operado' : 'dias operados'}`;
  if (state.period === 'month') return `${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${first}T12:00:00`))} a ${new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(`${last}T12:00:00`))} · ${days} dias operados`;
  if (state.period === 'year') return `${formatDate(first)} a ${formatDate(last)} · ${days} dias operados`;
  return `Personalizado: ${formatDate(first)} a ${formatDate(last)} · ${days} ${days === 1 ? 'dia operado' : 'dias operados'}`;
}

function calculatePointsStats(operations) {
  const values = operations.map(op => Number(op.pontos));
  const gainValues = operations.filter(op => op.resultado === 'GAIN').map(op => Number(op.pontos));
  const stopValues = operations.filter(op => op.resultado === 'STOP').map(op => Number(op.pontos));
  const average = list => list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
  const dayMap = new Map();
  let current = 0, peak = 0, trough = 0, drawdown = 0, updraw = 0;
  operations.forEach((op, index) => {
    const value = values[index];
    const date = op.dataHoraIso.slice(0, 10);
    dayMap.set(date, (dayMap.get(date) || 0) + value);
  });
  const days = [...dayMap].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  const analysisValues = state.mode === 'days' ? days.map(day => day.value) : values;
  const analysisGains = analysisValues.filter(value => value > 0);
  const analysisLosses = analysisValues.filter(value => value < 0);
  const curve = [0];
  analysisValues.forEach(value => {
    current += value;
    peak = Math.max(peak, current);
    trough = Math.min(trough, current);
    drawdown = Math.max(drawdown, peak - current);
    updraw = Math.max(updraw, current - trough);
    curve.push(current);
  });
  const sortedDays = [...days].sort((a, b) => b.value - a.value);
  const grossGain = analysisGains.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(analysisLosses.reduce((sum, value) => sum + value, 0));
  const sortedAnalysis = [...analysisValues].sort((a,b) => a-b);
  const median = sortedAnalysis.length ? (sortedAnalysis[Math.floor((sortedAnalysis.length-1)/2)] + sortedAnalysis[Math.ceil((sortedAnalysis.length-1)/2)]) / 2 : 0;
  return {
    total: current, curve, days, drawdown, updraw,
    expOperation: average(values), expDay: average(days.map(day => day.value)),
    profitFactor: grossLoss ? grossGain / grossLoss : grossGain ? Infinity : 0,
    averageGain: average(analysisGains), averageStop: average(analysisLosses),
    best: analysisValues.length ? Math.max(...analysisValues) : 0, worst: analysisValues.length ? Math.min(...analysisValues) : 0,
    bestDay: sortedDays[0] || null, worstDay: sortedDays[sortedDays.length - 1] || null,
    median,
    positive: analysisValues.filter(value => value > 0).length,
    negative: analysisValues.filter(value => value < 0).length,
    neutral: analysisValues.filter(value => Math.abs(value) < .005).length
  };
}

function renderPoints() {
  const s = calculatePointsStats(state.filtered);
  state.pointsStats = s;
  const pts = value => `${points0.format(value)} pts`;
  setText('pts-total', pts(s.total));
  setText('pts-exp-active', pts(state.mode === 'days' ? s.expDay : s.expOperation));
  setText('pts-exp-label', state.mode === 'days' ? 'Expectativa por dia' : 'Expectativa por operação');
  setText('pts-median-label', state.mode === 'days' ? 'Mediana por dia' : 'Mediana por operação');
  setText('pts-median', pts(s.median));
  setText('pts-pf', Number.isFinite(s.profitFactor) ? number2.format(s.profitFactor) : '∞');
  setText('pts-dd', pts(-s.drawdown)); setText('pts-up', pts(s.updraw));
  setText('pts-gain', pts(s.averageGain)); setText('pts-stop', pts(s.averageStop));
  setText('pts-best', pts(s.best)); setText('pts-worst', pts(s.worst));
  setText('pts-best-day', pts(s.bestDay?.value || 0)); setText('pts-worst-day', pts(s.worstDay?.value || 0));
  setText('pts-best-day-date', s.bestDay ? formatDate(s.bestDay.date) : '—');
  setText('pts-worst-day-date', s.worstDay ? formatDate(s.worstDay.date) : '—');
  setText('pts-days-pos', String(s.positive)); setText('pts-days-neg', String(s.negative)); setText('pts-days-zero', String(s.neutral));
  document.querySelector('[data-pts-positive]').textContent = state.mode === 'days' ? 'dias positivos' : 'operações positivas';
  document.querySelector('[data-pts-negative]').textContent = state.mode === 'days' ? 'dias negativos' : 'operações negativas';
  document.querySelector('[data-pts-neutral]').textContent = state.mode === 'days' ? 'dias neutros' : 'operações neutras';
}

function formatDate(isoDate) {
  if (!isoDate) return '—';
  return new Intl.DateTimeFormat('pt-BR').format(new Date(`${isoDate.slice(0, 10)}T12:00:00`));
}

function sideStats(side) {
  const ops = state.filtered.filter(op => op.lado === side);
  const total = ops.reduce((sum, op) => sum + Number(op.financeiro), 0);
  const gainOps = ops.filter(op => Number(op.financeiro) > 0), lossOps = ops.filter(op => Number(op.financeiro) < 0);
  const gains = gainOps.length;
  const grossGain = gainOps.reduce((sum, op) => sum + Number(op.financeiro), 0);
  const grossLoss = Math.abs(lossOps.reduce((sum, op) => sum + Number(op.financeiro), 0));
  const avgGain = gains ? grossGain / gains : 0, avgLoss = lossOps.length ? grossLoss / lossOps.length : 0;
  return { ops, total, gains, rate: ops.length ? gains / ops.length * 100 : 0, average: ops.length ? total / ops.length : 0, payoff: avgLoss ? avgGain / avgLoss : 0, pf: grossLoss ? grossGain / grossLoss : 0 };
}

function renderSideComparison() {
  const container = document.getElementById('sideComparison');
  if (!container) return;
  if (state.mode === 'days') {
    container.innerHTML = '<p class="info-banner">O desempenho por lado é uma leitura própria das operações. No modo por dia, esta seção permanece baseada nas operações para não misturar compras e vendas do mesmo pregão.</p>';
    return;
  }
  container.innerHTML = ['COMPRA', 'VENDA'].map(side => {
    const s = sideStats(side);
    return `<article class="comparison-card">
      <div class="comparison-title"><span>${side}</span><strong class="${s.total >= 0 ? 'positive' : 'negative'}">${money.format(s.total)}</strong></div>
      <dl><div><dt>Operações</dt><dd>${s.ops.length}</dd></div><div><dt>Acerto</dt><dd>${number2.format(s.rate)}%</dd></div><div><dt>Expectativa</dt><dd>${money.format(s.average)}</dd></div><div><dt>Payoff</dt><dd>${number2.format(s.payoff)}</dd></div><div><dt>Profit factor</dt><dd>${number2.format(s.pf)}</dd></div></dl>
    </article>`;
  }).join('');
}

function renderConsistency() {
  const map = document.getElementById('dayMap');
  if (!map || !state.stats) return;
  map.innerHTML = state.stats.days.map(day => {
    const kind = day.value > 0 ? 'positive' : day.value < 0 ? 'negative' : 'neutral';
    return `<div class="day-cell ${kind}" title="${formatDate(day.date)} · ${money0.format(day.value)}"><span>${new Date(`${day.date}T12:00:00`).getDate()}</span><small>${money0.format(day.value)}</small></div>`;
  }).join('');
  const values = state.mode === 'days' ? state.stats.days.map(day => day.value) : state.filtered.map(op => Number(op.financeiro));
  const sorted = [...values].sort((a,b) => a-b);
  const median = sorted.length ? (sorted[Math.floor((sorted.length-1)/2)] + sorted[Math.ceil((sorted.length-1)/2)]) / 2 : 0;
  const average = values.length ? values.reduce((sum,value)=>sum+value,0)/values.length : 0;
  setText('cons-mediana', money.format(median));
  setText('cons-media-mediana', `Mediana · média ${money.format(average)}`);
}

function groupByHour() {
  const map = new Map();
  state.filtered.forEach(op => {
    const hour = `${String(op.hora || op.dataHoraIso.slice(11, 16)).slice(0, 2)}:00`;
    if (!map.has(hour)) map.set(hour, { hour, value: 0, count: 0, gains: 0 });
    const row = map.get(hour);
    row.value += Number(op.financeiro);
    row.count += 1;
    if (op.resultado === 'GAIN') row.gains += 1;
  });
  return [...map.values()].sort((a, b) => a.hour.localeCompare(b.hour));
}

function operationDurationMinutes(op) {
  const explicit = [op.duracaoMinutos, op.duracao_minutos, op.tempoMinutos, op.tempo_minutos]
    .map(Number).find(Number.isFinite);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const entryCandle = Number(op.candleEntrada);
  const exitCandle = Number(op.candleSaida);
  if (Number.isFinite(entryCandle) && Number.isFinite(exitCandle)) {
    return Math.max(0, exitCandle - entryCandle) * 5;
  }
  const parseClock = value => {
    const match = String(value || '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return match ? Number(match[1]) * 60 + Number(match[2]) + Number(match[3] || 0) / 60 : null;
  };
  const start = parseClock(op.horaEntrada || op.hora_entrada || op.hora);
  const end = parseClock(op.horaSaida || op.hora_saida);
  return start !== null && end !== null ? Math.max(0, end - start) : null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
}

function minutesLabel(value) {
  if (value < 60) return `${points0.format(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return `${hours}h${minutes ? ` ${minutes}min` : ''}`;
}

const DURATION_BANDS = [
  { label: 'Até 5 min', min: 0, max: 5 },
  { label: '6–15 min', min: 6, max: 15 },
  { label: '16–30 min', min: 16, max: 30 },
  { label: '31–60 min', min: 31, max: 60 },
  { label: 'Mais de 60 min', min: 61, max: Infinity }
];

function durationBandFor(minutes) {
  if (!Number.isFinite(minutes)) return null;
  return DURATION_BANDS.find(band => minutes >= band.min && minutes <= band.max) || DURATION_BANDS[0];
}

function renderHours() {
  const rows = groupByHour();
  const list = document.getElementById('hourList');
  if (!list) return;
  if (!rows.length) { list.innerHTML = '<p class="empty">Nenhuma operação no período.</p>'; return; }
  const best = [...rows].sort((a, b) => b.value - a.value)[0];
  const worst = [...rows].sort((a, b) => a.value - b.value)[0];
  const busiest = [...rows].sort((a, b) => b.count - a.count)[0];
  setText('melhor-hora', best.hour); setText('melhor-hora-res', money.format(best.value));
  setText('pior-hora', worst.hour); setText('pior-hora-res', money.format(worst.value));
  setText('mais-operado', busiest.hour); setText('mais-operado-count', `${busiest.count} operações`);
  setText('primeira-hora', rows[0].hour);
  const maxAbs = Math.max(...rows.map(row => Math.abs(row.value)), 1);
  list.innerHTML = rows.map(row => `<div class="hour-row">
    <strong>${row.hour}</strong>
    <div class="hour-track"><i class="${row.value >= 0 ? 'positive' : 'negative'}" style="width:${Math.max(2, Math.abs(row.value) / maxAbs * 100)}%"></i></div>
    <span class="${row.value >= 0 ? 'positive' : 'negative'}">${money0.format(row.value)}</span>
    <small>${row.count} operações · ${number2.format(row.count ? row.gains / row.count * 100 : 0)}% de acerto · <span class="${row.value < 0 ? 'negative' : ''}">${money0.format(row.value / row.count)}</span> por operação${row.count < 5 ? ' · Amostra reduzida' : ''}</small>
  </div>`).join('');

  const profiles = document.getElementById('durationProfiles');
  const profileRows = [
    { label: 'OPERAÇÕES POSITIVAS', ops: state.filtered.filter(op => Number(op.financeiro) > 0), kind: 'positive' },
    { label: 'OPERAÇÕES NEGATIVAS', ops: state.filtered.filter(op => Number(op.financeiro) < 0), kind: 'negative' }
  ];
  if (profiles) profiles.innerHTML = profileRows.map(profile => {
    const startMinutes = profile.ops.map(op => {
      const time = String(op.hora || op.dataHoraIso.slice(11, 16)).slice(0, 5).split(':').map(Number);
      return (time[0] || 0) * 60 + (time[1] || 0);
    });
    const start = median(startMinutes);
    const startLabel = profile.ops.length ? `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(Math.round(start % 60)).padStart(2, '0')}` : '—';
    const durations = profile.ops.map(operationDurationMinutes).filter(Number.isFinite);
    const duration = median(durations);
    const result = median(profile.ops.map(op => Number(op.financeiro)));
    return `<article class="comparison-card"><div class="comparison-title"><span>${profile.label}</span><strong class="${profile.kind}">${profile.ops.length}</strong></div><dl><div><dt>Início mediano</dt><dd>${startLabel}</dd></div><div><dt>Duração mediana</dt><dd>${durations.length ? minutesLabel(duration) : 'Não disponível'}</dd></div><div><dt>Resultado mediano</dt><dd class="${profile.kind}">${money.format(result)}</dd></div></dl></article>`;
  }).join('');

  const bands = document.getElementById('durationBands');
  if (bands) bands.innerHTML = DURATION_BANDS.map(band => {
    const ops = state.filtered.filter(op => durationBandFor(operationDurationMinutes(op)) === band);
    const values = ops.map(op => Number(op.financeiro));
    const total = values.reduce((sum, value) => sum + value, 0);
    const gains = values.filter(value => value > 0).length;
    return `<article class="duration-card"><h3>${band.label}</h3><strong class="${total >= 0 ? 'positive' : 'negative'}">${money0.format(total)}</strong><dl><div><dt>Amostra</dt><dd>${ops.length}</dd></div><div><dt>Acerto</dt><dd>${number2.format(ops.length ? gains / ops.length * 100 : 0)}%</dd></div><div><dt>Expectativa</dt><dd>${money0.format(ops.length ? total / ops.length : 0)}</dd></div><div><dt>Mediana</dt><dd>${money0.format(median(values))}</dd></div></dl>${ops.length < 5 ? '<p>Amostra reduzida</p>' : ''}</article>`;
  }).join('');
}

function streakRuns(values, isMatch) {
  const runs = []; let current = 0, sum = 0;
  values.forEach(value => {
    if (isMatch(value)) { current++; sum += value; }
    else if (current) { runs.push({ length: current, sum }); current = 0; sum = 0; }
  });
  if (current) runs.push({ length: current, sum });
  return runs;
}

function groupPeriods(type) {
  const map = new Map();
  state.filtered.forEach(op => {
    const date = new Date(`${op.dataHoraIso.slice(0, 10)}T12:00:00`);
    let key, label;
    if (type === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      label = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' }).format(date);
    } else {
      const monday = new Date(date); monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      key = monday.toISOString().slice(0, 10);
      label = `Sem. ${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(monday)}`;
    }
    if (!map.has(key)) map.set(key, { key, label, value: 0, count: 0, gains: 0 });
    const row = map.get(key); row.value += Number(op.financeiro); row.count++;
    if (Number(op.financeiro) > 0) row.gains++;
  });
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function renderPeriodTable(id, rows) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = rows.map(row => `<div><strong>${row.label}</strong><span class="${row.value >= 0 ? 'positive' : 'negative'}">${money0.format(row.value)}</span><small>${row.count} operações · ${number2.format(row.count ? row.gains / row.count * 100 : 0)}% de acerto</small></div>`).join('') || '<p class="empty">Sem períodos suficientes.</p>';
}

function renderExtended() {
  const opValues = state.filtered.map(op => Number(op.financeiro));
  const dayValues = state.stats.days.map(day => day.value);
  const sequenceValues = state.mode === 'days' ? dayValues : opValues;
  const gainRuns = streakRuns(sequenceValues, value => value > 0);
  const lossRuns = streakRuns(sequenceValues, value => value < 0);
  const streakEl = document.getElementById('streakAnalysis');
  if (streakEl) {
    const bestRun = gainRuns.sort((a,b) => b.length-a.length || b.sum-a.sum)[0] || {length:0,sum:0};
    const worstRun = lossRuns.sort((a,b) => b.length-a.length || a.sum-b.sum)[0] || {length:0,sum:0};
    const unit = state.mode === 'days' ? 'dias' : 'operações';
    streakEl.innerHTML = `<article class="comparison-card"><div class="comparison-title"><span>MAIOR SEQUÊNCIA POSITIVA</span><strong class="positive">${bestRun.length} ${unit}</strong></div><p>Resultado acumulado da sequência: ${money.format(bestRun.sum)}.</p></article><article class="comparison-card"><div class="comparison-title"><span>MAIOR SEQUÊNCIA NEGATIVA</span><strong class="negative">${worstRun.length} ${unit}</strong></div><p>Resultado acumulado da sequência: ${money.format(worstRun.sum)}.</p></article>`;
  }

  const sourceValues = state.mode === 'days' ? dayValues : opValues;
  const pos = sourceValues.filter(value=>value>0).sort((a,b)=>b-a);
  const neg = sourceValues.filter(value=>value<0);
  const grossPos = pos.reduce((s,value)=>s+value,0), grossNeg = Math.abs(neg.reduce((s,value)=>s+value,0));
  let covered = 0, coverCount = 0;
  while (coverCount < pos.length && covered < grossNeg) covered += pos[coverCount++];
  const originalTotal = sourceValues.reduce((s,value)=>s+value,0);
  const withoutBest = originalTotal - (pos[0] || 0);
  const withoutTop3 = originalTotal - pos.slice(0,3).reduce((s,value)=>s+value,0);
  setText('cons-cover-count', `${coverCount} de ${pos.length}`);
  setText('cons-cover-share', `${number2.format(pos.length ? coverCount/pos.length*100 : 0)}% dos gains`);
  const concentration = document.getElementById('concentrationAnalysis');
  if (concentration) {
    concentration.innerHTML = `<article class="comparison-card"><div class="comparison-title"><span>COBERTURA DAS PERDAS</span><strong class="positive">${coverCount} de ${pos.length} gains</strong></div><dl><div><dt>Perdas brutas</dt><dd class="negative">${money0.format(-grossNeg)}</dd></div><div><dt>Gains usados</dt><dd>${money0.format(covered)}</dd></div><div><dt>Participação</dt><dd>${number2.format(pos.length ? coverCount/pos.length*100 : 0)}%</dd></div></dl><p><strong>Como interpretar:</strong> estes são os maiores gains mínimos necessários para compensar todos os losses.</p></article><article class="comparison-card"><div class="comparison-title"><span>TESTE DE DEPENDÊNCIA</span><strong>${money0.format(originalTotal)}</strong></div><dl><div><dt>Sem o maior gain</dt><dd class="${withoutBest<0?'negative':'positive'}">${money0.format(withoutBest)}</dd></div><div><dt>Sem os 3 maiores</dt><dd class="${withoutTop3<0?'negative':'positive'}">${money0.format(withoutTop3)}</dd></div><div><dt>Unidade</dt><dd>${state.mode==='days'?'dias':'operações'}</dd></div></dl><p><strong>Como interpretar:</strong> se o resultado muda de sinal ao retirar poucos gains, o histórico depende mais desses extremos.</p></article>`;
  }

  const byDay = new Map();
  state.filtered.forEach(op => { const k=op.dataHoraIso.slice(0,10); if(!byDay.has(k))byDay.set(k,[]); byDay.get(k).push(op); });
  const orderEl = document.getElementById('operationOrder');
  if (orderEl) orderEl.innerHTML = [0,1,2].map(index => {
    const ops=[...byDay.values()].map(rows=>rows[index]).filter(Boolean), total=ops.reduce((s,o)=>s+Number(o.financeiro),0), gains=ops.filter(o=>Number(o.financeiro)>0).length;
    return `<article class="comparison-card"><div class="comparison-title"><span>${index+1}ª OPERAÇÃO</span><strong class="${total>=0?'positive':'negative'}">${money.format(total)}</strong></div><dl><div><dt>Amostra</dt><dd>${ops.length}</dd></div><div><dt>Acerto</dt><dd>${number2.format(ops.length?gains/ops.length*100:0)}%</dd></div><div><dt>Expectativa</dt><dd>${money.format(ops.length?total/ops.length:0)}</dd></div></dl></article>`;
  }).join('');

  const weeks=groupPeriods('week'), months=groupPeriods('month');
  renderPeriodTable('weeklyTable', weeks); renderPeriodTable('monthlyTable', months);
  renderRisk(dayValues);
}

function renderRisk(dayValues) {
  const losses = streakRuns(dayValues, value => value < 0);
  const pointDays = groupByDay(state.filtered.map(op => ({...op, financeiro: Number(op.pontos)}))).map(day => day.value);
  const pointLosses = streakRuns(pointDays, value => value < 0);
  const pointStats = calculateCurve(pointDays);
  const worstDayPoints = Math.min(0, ...pointDays);
  const worstSequencePoints = Math.min(0, ...pointLosses.map(run => run.sum));
  const worstOperationPoints = Math.min(0, ...state.filtered.map(op => Number(op.pontos)));
  const factor = Number(document.getElementById('safetyFactor')?.value)||3;
  const stopPoints = Math.max(0, numericInputValue('technicalStop'));
  const chosenPoints = Math.max(0, numericInputValue('dailyLimitPoints'));
  const technicalDailyPoints = stopPoints * riskConfig.maxOperations;
  const technicalDailyValue = technicalDailyPoints * riskConfig.contracts * POINT_VALUE;
  const technicalCapital = technicalDailyValue * factor;
  const historicalRiskPoints = Math.max(pointStats.drawdown, Math.abs(worstSequencePoints));
  const statisticalCapital = historicalRiskPoints * riskConfig.contracts * POINT_VALUE * factor;
  const difference = Math.abs(technicalCapital - statisticalCapital);
  const differencePercent = Math.max(technicalCapital, statisticalCapital) ? difference / Math.max(technicalCapital, statisticalCapital) * 100 : 0;
  const fullStops = stopPoints > 0 ? Math.floor(chosenPoints / stopPoints) : 0;
  let operationLossStreak = 0, currentOperationLossStreak = 0;
  state.filtered.forEach(op => {
    currentOperationLossStreak = op.resultado === 'STOP' ? currentOperationLossStreak + 1 : 0;
    operationLossStreak = Math.max(operationLossStreak, currentOperationLossStreak);
  });
  setText('risk-worst-operation', `${points0.format(worstOperationPoints)} pts`);
  setText('risk-worst-day-points', `${points0.format(worstDayPoints)} pts`);
  setText('risk-drawdown-points', `${points0.format(-pointStats.drawdown)} pts`);
  setText('risk-loss-streak', `${Math.max(0,...losses.map(run=>run.length))} dias negativos`);
  setText('risk-sample', `${state.filtered.length} operações · ${pointDays.length} pregões`);
  setText('risk-technical-points', `${points0.format(technicalDailyPoints)} pts`);
  setText('risk-technical-value', money.format(technicalDailyValue));
  setText('risk-technical-formula', `${points0.format(stopPoints)} pts × ${riskConfig.contracts} ${riskConfig.contracts===1?'contrato':'contratos'} × ${riskConfig.maxOperations} operações`);
  setText('risk-limit-message', stopPoints ? `Seu limite comporta ${fullStops} ${fullStops===1?'stop técnico completo':'stops técnicos completos'}.${fullStops < riskConfig.maxOperations ? ` A ${fullStops + 1}ª operação pode atingir o limite diário.` : ''}` : 'Informe o stop inicial máximo para comparar os limites.');
  setText('risk-technical-capital', money.format(technicalCapital));
  setText('risk-statistical-capital', money.format(statisticalCapital));
  setText('risk-capital-difference', `${money.format(difference)} · ${percent2(differencePercent)}`);
}

function calculateCurve(values) {
  let current=0, peak=0, trough=0, drawdown=0, updraw=0;
  values.forEach(value=>{current+=value;peak=Math.max(peak,current);trough=Math.min(trough,current);drawdown=Math.max(drawdown,peak-current);updraw=Math.max(updraw,current-trough);});
  return {current,drawdown,updraw};
}

function renderOperations() {
  const body = document.getElementById('operationsBody');
  if (!body) return;
  const filtered = [...state.filtered].reverse().filter(op => {
    const resultOk = state.resultFilter === 'all' || op.resultado === state.resultFilter;
    return resultOk;
  });
  const head = document.getElementById('operationsHead');
  if (state.mode === 'days') {
    const rows = groupByDay(state.filtered).reverse().filter(day => {
      const result = day.value > 0 ? 'GAIN' : day.value < 0 ? 'STOP' : 'BREAKEVEN';
      const resultOk = state.resultFilter === 'all' || result === state.resultFilter;
      return resultOk;
    });
    head.innerHTML = '<th>Data</th><th>Operações</th><th>Resultado do dia</th><th>Financeiro</th>';
    body.innerHTML = rows.map(day => {
      const result = day.value > 0 ? 'GAIN' : day.value < 0 ? 'STOP' : 'BREAKEVEN';
      const label = result === 'STOP' ? 'LOSS' : result;
      return `<tr><td>${formatDate(day.date)}</td><td>${day.count}</td><td><span class="result-badge ${result.toLowerCase()}">${label}</span></td><td class="${day.value >= 0 ? 'positive' : 'negative'}">${money.format(day.value)}</td></tr>`;
    }).join('');
    if (!rows.length) body.innerHTML = '<tr><td colspan="4" class="empty">Nenhum pregão encontrado.</td></tr>';
    document.getElementById('operationsCount').textContent = `${rows.length} pregões exibidos`;
    return;
  }
  head.innerHTML = '<th>Data</th><th>Hora</th><th>Lado</th><th>Resultado</th><th>Pontos</th><th>Financeiro</th><th>Stop</th><th>Duração</th>';
  body.innerHTML = filtered.map(op => {
    const duration = Math.max(0, Number(op.candleSaida) - Number(op.candleEntrada));
    const label = op.resultado === 'STOP' ? 'LOSS' : op.resultado;
    return `<tr><td>${op.data}</td><td>${op.hora}</td><td>${op.lado}</td><td><span class="result-badge ${op.resultado.toLowerCase()}">${label}</span></td><td>${points0.format(Number(op.pontos))}</td><td class="${Number(op.financeiro) >= 0 ? 'positive' : 'negative'}">${money.format(Number(op.financeiro))}</td><td>${points0.format(Number(op.stopTotal))}</td><td>${duration} candles</td></tr>`;
  }).join('');
  if (!filtered.length) body.innerHTML = '<tr><td colspan="8" class="empty">Nenhuma operação encontrada.</td></tr>';
  document.getElementById('operationsCount').textContent = `${filtered.length} operações exibidas`;
}

function numericInputValue(id) {
  return Number(document.getElementById(id)?.value.replace(/\D/g, '')) || 0;
}

function formatIntegerInput(event) {
  const digits = event.target.value.replace(/\D/g, '');
  event.target.value = digits ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(digits)) : '0';
}

function syncModeVisibility(pageName) {
  const toolbar = document.querySelector('.analysis-toolbar');
  toolbar.classList.toggle('no-mode', !MODE_PAGES.has(pageName));
}

function updatePatrimony() {
  if (!state.stats) return;
  const rawCapital = document.getElementById('capitalInput').value.replace(/\D/g, '');
  const capitalValue = Number(rawCapital) || 0;
  const p = value => capitalValue > 0 ? value / capitalValue * 100 : 0;
  const s = state.stats;

  const display = value => percent2(capitalValue > 0 ? value : 0);
  setText('pat-atual', display(p(s.total)));
  setText('pat-total', display(100 + p(s.total)));
  setText('pat-exp-op', display(p(s.expOperation)));
  setText('pat-exp-dia', display(p(s.expDay)));
  setText('pat-drawdown', display(-p(s.maxDrawdown)));
  setText('pat-updraw', display(p(s.maxUpdraw)));
  setText('pat-max', display(p(s.max)));
  setText('pat-min', display(p(s.min)));
  const firstDate = state.filtered[0]?.dataHoraIso?.slice(0, 10);
  const lastDate = state.filtered[state.filtered.length - 1]?.dataHoraIso?.slice(0, 10);
  const elapsedDays = firstDate && lastDate
    ? Math.max(1, Math.round((new Date(`${lastDate}T12:00:00`) - new Date(`${firstDate}T12:00:00`)) / 86400000) + 1)
    : 0;
  const finalRatio = capitalValue > 0 ? (capitalValue + s.total) / capitalValue : 0;
  const equivalent30 = elapsedDays > 0 && finalRatio > 0
    ? (Math.pow(finalRatio, 30 / elapsedDays) - 1) * 100
    : null;
  setText('pat-30d', equivalent30 === null ? 'Não disponível' : percent2(equivalent30));
  setText('pat-30d-note', elapsedDays
    ? `Equivalente histórico calculado sobre ${elapsedDays} ${elapsedDays === 1 ? 'dia corrido' : 'dias corridos'}`
    : 'Período sem datas disponíveis');
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
  const range = options.range || niceRange(values);
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
    ctx.fillStyle = cssColor('--muted');
    ctx.textAlign = 'right';
    ctx.fillText(options.formatAxis(value), pad.left - 12, yy);
  }

  if (zeroY >= pad.top && zeroY <= pad.top + plotH) {
    ctx.strokeStyle = options.prominentZero ? '#ff5164' : (values.some(v => v < 0) ? '#ff5164' : 'rgba(139,154,161,.55)');
    ctx.lineWidth = options.prominentZero ? 2.4 : 1.3;
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

  if (values.length <= 100) {
    values.forEach((value, index) => {
      ctx.fillStyle = value < 0 ? '#ff5164' : '#35d8ca';
      ctx.beginPath(); ctx.arc(x(index), y(value), 3.8, 0, Math.PI * 2); ctx.fill();
    });
  }

  const markers = [
    { label: 'Máx.', value: Math.max(...values), index: values.indexOf(Math.max(...values)), color: '#35d8ca' },
    ...(Math.min(...values) < 0 ? [{ label: 'Mín.', value: Math.min(...values), index: values.indexOf(Math.min(...values)), color: '#ff5164' }] : []),
    { label: 'Atual', value: values[values.length - 1], index: values.length - 1, color: values[values.length - 1] < 0 ? '#ff5164' : cssColor('--text') }
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
    ctx.fillStyle = cssColor('--panel-2');
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
  const rows = state.mode === 'days'
    ? (state.stats?.days || []).map(day => ({ date: day.date, label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day.date}T12:00:00`)), value: day.value }))
    : state.filtered.map((op, index) => ({ label: `Op. ${index + 1}`, value: Number(op.financeiro) }));
  if (!rows.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 18, right: 15, bottom: 34, left: 62 };
  const values = rows.map(d => d.value);
  const range = niceRange(values);
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const y = value => pad.top + (range.max - value) / (range.max - range.min) * plotH;
  const zeroY = y(0);
  const slot = plotW / rows.length;
  const barW = Math.max(3, Math.min(18, slot * .58));

  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  const average = values.reduce((sum,value)=>sum+value,0)/values.length;
  const deviation = Math.sqrt(values.reduce((sum,value)=>sum+(value-average)**2,0)/values.length);
  const bandTop = y(Math.min(range.max, average + deviation));
  const bandBottom = y(Math.max(range.min, average - deviation));
  ctx.fillStyle = 'rgba(244,185,66,.09)';
  ctx.fillRect(pad.left, bandTop, plotW, Math.max(0, bandBottom-bandTop));
  for (let i = 0; i <= 4; i++) {
    const value = range.max - (range.max - range.min) * i / 4;
    const yy = pad.top + plotH * i / 4;
    ctx.strokeStyle = 'rgba(99,133,147,.18)';
    ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillStyle = cssColor('--muted'); ctx.textAlign = 'right';
    ctx.fillText(money.format(value).replace(',00', ''), pad.left - 9, yy);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(139,154,161,.55)';
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();
  [
    {value:average,label:`Média ${money.format(average).replace(',00','')}`,color:'#f4b942'},
    {value:average+deviation,label:'+1 DP',color:'rgba(244,185,66,.8)'},
    {value:average-deviation,label:'−1 DP',color:'rgba(244,185,66,.8)'}
  ].forEach(line=>{
    const yy=y(line.value);
    if (yy < pad.top || yy > pad.top+plotH) return;
    ctx.strokeStyle=line.color; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.moveTo(pad.left,yy); ctx.lineTo(width-pad.right,yy); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle=line.color; ctx.textAlign='right'; ctx.fillText(line.label,width-pad.right,Math.max(10,yy-8));
  });

  rows.forEach((d, i) => {
    const xx = pad.left + slot * i + (slot - barW) / 2;
    let top = Math.min(y(d.value), zeroY);
    let h = Math.abs(y(d.value) - zeroY);
    if (Math.abs(d.value) < .005) { top = zeroY - 3; h = 6; }
    ctx.fillStyle = d.value > 0 ? '#35d8ca' : d.value < 0 ? '#ff5164' : '#8b9aa1';
    ctx.beginPath(); ctx.roundRect(xx, top, barW, Math.max(3, h), 3); ctx.fill();
  });

  const labelIndices = [0, Math.floor((rows.length - 1) / 2), rows.length - 1];
  ctx.fillStyle = cssColor('--muted'); ctx.textAlign = 'center';
  [...new Set(labelIndices)].forEach(i => {
    ctx.fillText(rows[i].label, pad.left + slot * i + slot / 2, height - 12);
  });
}

function drawPatrimony() {
  if (!state.stats) return;
  const capital = Math.max(0, Number(document.getElementById('capitalInput').value.replace(/\D/g, '')) || 0);
  const values = state.stats.curve.map(p => capital + p.value);
  const max = Math.max(capital, ...values, 1);
  const padding = Math.max(max * .06, 1);
  drawLineChart(document.getElementById('patrimonyChart'), values, {
    range: { min: 0, max: max + padding },
    prominentZero: true,
    formatAxis: value => money0.format(value),
    formatMarker: value => money.format(value)
  });
}

function drawBarChart(canvas, rows, formatAxis, options = {}) {
  if (!canvas || !rows.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  ctx.font = '11px Inter, system-ui, sans-serif';
  const labelLines = rows.map(row => String(row.label).split(' · '));
  const maxLabelWidth = Math.max(...labelLines.flat().map(line => ctx.measureText(line).width));
  const labelAngle = -.58;
  const labelLineHeight = 14;
  const projectedLabelHeight = Math.sin(Math.abs(labelAngle)) * maxLabelWidth
    + Math.cos(Math.abs(labelAngle)) * labelLines.reduce((max, lines) => Math.max(max, lines.length * labelLineHeight), labelLineHeight);
  const bottomPadding = Math.min(118, Math.max(52, Math.ceil(projectedLabelHeight + 18)));
  const pad = { top: 20, right: 18, bottom: bottomPadding, left: 68 };
  const values = rows.map(row => row.value);
  const range = niceRange(values);
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const y = value => pad.top + (range.max - value) / (range.max - range.min) * plotH;
  const zeroY = y(0), slot = plotW / rows.length, barW = Math.max(5, Math.min(32, slot * .6));
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
  for (let i = 0; i <= 4; i++) {
    const value = range.max - (range.max - range.min) * i / 4, yy = pad.top + plotH * i / 4;
    ctx.strokeStyle = 'rgba(99,133,147,.18)'; ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillStyle = cssColor('--muted'); ctx.textAlign = 'right'; ctx.fillText(formatAxis(value), pad.left - 9, yy);
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(139,154,161,.75)';
  ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(pad.left, zeroY); ctx.lineTo(width - pad.right, zeroY); ctx.stroke();
  rows.forEach((row, i) => {
    const xx = pad.left + slot * i + (slot - barW) / 2;
    const top = Math.min(y(row.value), zeroY), h = Math.max(3, Math.abs(y(row.value) - zeroY));
    ctx.fillStyle = row.color || (row.value > 0 ? '#35d8ca' : row.value < 0 ? '#ff5164' : '#8b9aa1');
    ctx.beginPath(); ctx.roundRect(xx, top, barW, h, 3); ctx.fill();
    if (row.showCount) {
      ctx.fillStyle = cssColor('--text'); ctx.textAlign = 'center';
      ctx.fillText(String(row.value), xx + barW / 2, Math.max(10, top - 9));
    }
    const labelStep = width < 560 ? Math.max(1, Math.ceil(rows.length / 6)) : Math.max(1, Math.ceil(rows.length / 12));
    if (rows.length <= 6 || i % labelStep === 0 || i === rows.length - 1) {
      ctx.save();
      ctx.translate(xx + barW / 2, height - 10);
      ctx.rotate(labelAngle);
      ctx.fillStyle = cssColor('--muted');
      ctx.textAlign = 'right';
      labelLines[i].forEach((line, lineIndex) => {
        ctx.fillText(line, 0, -((labelLines[i].length - 1 - lineIndex) * labelLineHeight));
      });
      ctx.restore();
    }
  });
  if (rows.length > 1) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const yy = y(average);
    ctx.strokeStyle = '#f4b942'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width-pad.right, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f4b942'; ctx.textAlign = 'right'; ctx.fillText(`Média ${formatAxis(average)}`, width-pad.right, Math.max(10, yy-9));
    if (options.cumulativeAverage) {
      let cumulative = 0;
      const cumulativeValues = values.map((value, index) => (cumulative += value) / (index + 1));
      ctx.strokeStyle = '#35d8ca'; ctx.lineWidth = 2.2; ctx.setLineDash([]);
      ctx.beginPath();
      cumulativeValues.forEach((value, index) => {
        const xx = pad.left + slot * index + slot / 2;
        const yy2 = y(value);
        index ? ctx.lineTo(xx, yy2) : ctx.moveTo(xx, yy2);
      });
      ctx.stroke();
      cumulativeValues.forEach((value, index) => {
        const xx = pad.left + slot * index + slot / 2;
        ctx.fillStyle = '#35d8ca'; ctx.beginPath(); ctx.arc(xx, y(value), 3, 0, Math.PI * 2); ctx.fill();
      });
    }
  }
}

function drawDistribution() {
  if (!state.filtered.length) return;
  const values = state.mode === 'days' ? state.stats.days.map(day => day.value) : state.filtered.map(op => Number(op.financeiro));
  const min = Math.min(...values), max = Math.max(...values);
  const bins = 9, size = Math.max(1, (max - min) / bins);
  const rows = Array.from({ length: bins }, (_, i) => ({ start:min+i*size,end:min+(i+1)*size, values:[] }));
  values.forEach(value => { rows[Math.min(bins - 1, Math.floor((value - min) / size))].values.push(value); });
  const formatted=rows.map(row=>{
    const average=row.values.length?row.values.reduce((sum,value)=>sum+value,0)/row.values.length:(row.start+row.end)/2;
    return {label:`${money0.format(row.start)}–${money0.format(row.end)} · média ${money0.format(average)}`,value:row.values.length,color:average<0?'#ff5164':average>0?'#35d8ca':'#8b9aa1',showCount:true};
  });
  drawBarChart(document.getElementById('distributionChart'), formatted, value => points0.format(Math.max(0,Math.round(value))));
}

function drawCoverage() {
  const canvas = document.getElementById('coverageChart');
  if (!canvas) return;
  const values = (state.mode === 'days' ? state.stats.days.map(day=>day.value) : state.filtered.map(op=>Number(op.financeiro)));
  const gains = values.filter(value=>value>0).sort((a,b)=>b-a);
  const lossTotal = Math.abs(values.filter(value=>value<0).reduce((sum,value)=>sum+value,0));
  let cumulative=0;
  const rows=gains.map((value,index)=>({label:`Gain ${index+1}`,value:(cumulative+=value)}));
  drawMultiLineChart(canvas, [
    { values: rows.map(row=>row.value), color:'#35d8ca' },
    { values: rows.map(()=>lossTotal), color:'#ff5164', dashed:true }
  ], rows.map(row=>row.label), value=>money0.format(value));
}

function drawMultiLineChart(canvas, series, labels, formatAxis, options = {}) {
  if (!canvas || !labels.length) return;
  const {ctx,width,height}=setupCanvas(canvas);
  const pad={top:24,right:options.endLabels?190:20,bottom:58,left:72};
  const all=series.flatMap(item=>item.values);
  const range=niceRange(all.concat(0));
  const plotW=width-pad.left-pad.right, plotH=height-pad.top-pad.bottom;
  const x=i=>pad.left+(labels.length===1?plotW/2:i*plotW/(labels.length-1));
  const y=value=>pad.top+(range.max-value)/(range.max-range.min)*plotH;
  ctx.clearRect(0,0,width,height); ctx.font='11px Inter, system-ui, sans-serif'; ctx.textBaseline='middle';
  for(let i=0;i<=4;i++){const value=range.max-(range.max-range.min)*i/4,yy=pad.top+plotH*i/4;ctx.strokeStyle='rgba(99,133,147,.18)';ctx.setLineDash([5,7]);ctx.beginPath();ctx.moveTo(pad.left,yy);ctx.lineTo(width-pad.right,yy);ctx.stroke();ctx.fillStyle=cssColor('--muted');ctx.textAlign='right';ctx.fillText(formatAxis(value),pad.left-9,yy);}
  const zeroY=y(0);
  ctx.setLineDash([]);
  ctx.strokeStyle='rgba(255,81,100,.82)';
  ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(pad.left,zeroY);ctx.lineTo(width-pad.right,zeroY);ctx.stroke();
  ctx.fillStyle='#ff5164';ctx.textAlign='right';ctx.fillText('Zero',pad.left-9,zeroY);
  series.forEach(item=>{ctx.strokeStyle=item.color;ctx.lineWidth=2.3;ctx.setLineDash(item.dashed?[7,6]:[]);ctx.beginPath();item.values.forEach((value,index)=>index?ctx.lineTo(x(index),y(value)):ctx.moveTo(x(index),y(value)));ctx.stroke();});
  ctx.setLineDash([]); ctx.fillStyle=cssColor('--muted');ctx.textAlign='center';
  const indices=[0,Math.floor((labels.length-1)/2),labels.length-1];
  [...new Set(indices)].forEach(index=>ctx.fillText(labels[index],x(index),height-18));
  if (options.endLabels) {
    const endX=x(labels.length-1);
    const labelRows=[
      {value:series[0].values.at(-1),color:series[1]?.color||series[0].color,text:`Fixa / acumulada: ${formatAxis(series[0].values.at(-1))}`},
      {value:series.at(-1).values.at(-1),color:series.at(-1).color,text:`Recente: ${formatAxis(series.at(-1).values.at(-1))}`}
    ].sort((a,b)=>y(a.value)-y(b.value));
    if (Math.abs(y(labelRows[1].value)-y(labelRows[0].value))<24) labelRows[1].offset=24;
    labelRows.forEach(item=>{
      const yy=Math.max(pad.top+8,Math.min(pad.top+plotH-8,y(item.value)+(item.offset||0)));
      ctx.strokeStyle=item.color;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(endX+5,y(item.value));ctx.lineTo(endX+18,yy);ctx.stroke();
      ctx.fillStyle=item.color;ctx.textAlign='left';ctx.font='700 11px Inter, system-ui, sans-serif';ctx.fillText(item.text,endX+23,yy);
    });
  }
}

function renderEvolution() {
  const values=state.mode==='days'?state.stats.days.map(day=>day.value):state.filtered.map(op=>Number(op.financeiro));
  const average=list=>list.length?list.reduce((sum,value)=>sum+value,0)/list.length:0;
  const sorted=[...values].sort((a,b)=>a-b);
  const median=sorted.length?(sorted[Math.floor((sorted.length-1)/2)]+sorted[Math.ceil((sorted.length-1)/2)])/2:0;
  const split=Math.ceil(values.length/2), first=average(values.slice(0,split)), second=average(values.slice(split));
  setText('evo-average',money.format(average(values))); setText('evo-median',money.format(median));
  setText('evo-average-unit',state.mode==='days'?'Por dia':'Por operação');
  setText('evo-first-half',money.format(first)); setText('evo-second-half',money.format(second));
  const difference=first?((second-first)/Math.abs(first))*100:0;
  setText('evo-comparison',values.length>1?`${difference>=0?'Melhora':'Queda'} de ${number2.format(Math.abs(difference))}%`:'Amostra insuficiente');
  const movingLegend = document.getElementById('movingAverageLegend');
  if (movingLegend) movingLegend.textContent = state.mode === 'days' ? 'Média móvel · 5 dias' : 'Média móvel · 10 operações';
}

function drawHourDurationHeatmap() {
  const canvas = document.getElementById('hourDurationChart');
  if (!canvas) return;
  const hours = [...new Set(state.filtered.map(op => `${String(op.hora || op.dataHoraIso.slice(11,16)).slice(0,2)}:00`))].sort();
  if (!hours.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 22, right: 18, bottom: 54, left: 104 };
  const plotW = width - pad.left - pad.right, plotH = height - pad.top - pad.bottom;
  const cellW = plotW / hours.length, cellH = plotH / DURATION_BANDS.length;
  const cells = DURATION_BANDS.flatMap((band, row) => hours.map((hour, col) => {
    const ops = state.filtered.filter(op => `${String(op.hora || op.dataHoraIso.slice(11,16)).slice(0,2)}:00` === hour && durationBandFor(operationDurationMinutes(op)) === band);
    return { band, row, col, ops, value: median(ops.map(op => Number(op.financeiro))) };
  }));
  const maxAbs = Math.max(1, ...cells.map(cell => Math.abs(cell.value)));
  ctx.clearRect(0, 0, width, height);
  ctx.font = '11px Inter, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  DURATION_BANDS.forEach((band, row) => {
    ctx.fillStyle = cssColor('--muted'); ctx.textAlign = 'right';
    ctx.fillText(band.label, pad.left - 10, pad.top + row * cellH + cellH / 2);
  });
  hours.forEach((hour, col) => {
    ctx.fillStyle = cssColor('--muted'); ctx.textAlign = 'center';
    ctx.fillText(hour, pad.left + col * cellW + cellW / 2, height - 22);
  });
  cells.forEach(cell => {
    const intensity = Math.min(.82, .18 + Math.abs(cell.value) / maxAbs * .64);
    ctx.fillStyle = !cell.ops.length ? 'rgba(99,133,147,.08)' : cell.value >= 0 ? `rgba(53,216,202,${intensity})` : `rgba(255,81,100,${intensity})`;
    const x = pad.left + cell.col * cellW + 2, y = pad.top + cell.row * cellH + 2;
    ctx.fillRect(x, y, Math.max(1, cellW - 4), Math.max(1, cellH - 4));
    if (cell.ops.length) {
      ctx.fillStyle = intensity >= .48 ? '#fff' : (cell.value >= 0 ? '#061417' : '#fff');
      ctx.textAlign = 'center'; ctx.font = '700 12px Inter, system-ui, sans-serif';
      ctx.fillText(`${cell.ops.length} op.`, x + (cellW - 4) / 2, y + (cellH - 4) / 2 - 7);
      ctx.font = '10px Inter, system-ui, sans-serif';
      ctx.fillText(`${money0.format(cell.value)}${cell.ops.length < 5 ? ' · *' : ''}`, x + (cellW - 4) / 2, y + (cellH - 4) / 2 + 10);
    }
  });
}

function drawAverages() {
  const values=state.mode==='days'?state.stats.days.map(day=>day.value):state.filtered.map(op=>Number(op.financeiro));
  if(!values.length)return;
  const fixed=values.reduce((sum,value)=>sum+value,0)/values.length;
  let cumulative=0; const cumulativeAverage=values.map((value,index)=>(cumulative+=value)/(index+1));
  const windowSize=state.mode==='days'?5:10;
  const moving=values.map((_,index)=>{const slice=values.slice(Math.max(0,index-windowSize+1),index+1);return slice.reduce((sum,value)=>sum+value,0)/slice.length;});
  const labels=values.map((_,index)=>state.mode==='days'?`Dia ${index+1}`:`Op. ${index+1}`);
  drawMultiLineChart(document.getElementById('averagesChart'),[
    {values:values.map(()=>fixed),color:'#f4b942',dashed:true},
    {values:cumulativeAverage,color:'#35d8ca'},
    {values:moving,color:'#b58ad9'}
  ],labels,value=>money0.format(value),{endLabels:true});
}

function drawPoints() {
  const s = state.pointsStats;
  if (!s) return;
  const curveFromZero = s.curve[0] === 0 ? s.curve : [0, ...s.curve];
  drawLineChart(document.getElementById('pointsChart'), curveFromZero, {
    formatAxis: value => `${points0.format(value)} pts`,
    formatMarker: value => `${points0.format(value)} pts`
  });
  const rows = state.mode === 'days'
    ? s.days.map(day => ({ label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day.date}T12:00:00`)), value: day.value }))
    : state.filtered.map((op, index) => ({ label: `Op. ${index + 1}`, value: Number(op.pontos) }));
  drawBarChart(document.getElementById('pointsDailyChart'), rows, value => `${points0.format(value)} pts`);
}

function drawAll() {
  if (!state.stats) return;
  drawLineChart(document.getElementById('resultChart'), state.stats.curve.map(p => p.value), {
    formatAxis: value => money.format(value).replace(',00', ''),
    formatMarker: value => money.format(value)
  });
  drawDaily();
  drawPatrimony();
  drawDistribution();
  drawPoints();
  drawCoverage();
  drawAverages();
  drawHourDurationHeatmap();
  const weeks = groupPeriods('week'), months = groupPeriods('month');
  drawBarChart(document.getElementById('weeklyChart'), weeks, value => money.format(value).replace(',00',''), { cumulativeAverage: true });
  drawBarChart(document.getElementById('monthlyChart'), months, value => money.format(value).replace(',00',''), { cumulativeAverage: true });
}

async function loadData() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusDetail = document.getElementById('statusDetail');
  const notice = document.getElementById('notice');
  const loadingState = document.getElementById('loadingState');
  const loadingDetail = document.getElementById('loadingDetail');

  try {
    loadingState?.classList.remove('loaded', 'error');
    notice.classList.remove('visible');
    let response;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      if (loadingDetail) {
        loadingDetail.textContent = attempt === 1
          ? 'Conectando à base de operações…'
          : `A conexão demorou. Nova tentativa ${attempt} de 3…`;
      }
      try {
        response = await fetch(API_URL, {
          method: 'GET',
          redirect: 'follow',
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (response.ok) break;
        lastError = new Error(`Resposta HTTP ${response.status}`);
      } catch (error) {
        clearTimeout(timeout);
        lastError = error;
      }
    }
    if (!response?.ok) throw lastError || new Error('A base não respondeu.');
    const payload = await response.json();
    if (!payload.sucesso || !Array.isArray(payload.operacoes)) {
      throw new Error(payload.mensagem || 'A API não devolveu operações válidas.');
    }

    state.all = payload.operacoes.sort((a, b) => a.dataHoraIso.localeCompare(b.dataHoraIso));
    if (state.all.length) {
      state.customFrom = state.all[0].dataHoraIso.slice(0, 10);
      state.customTo = state.all[state.all.length - 1].dataHoraIso.slice(0, 10);
      const customFrom = document.getElementById('customFrom');
      const customTo = document.getElementById('customTo');
      customFrom.value = state.customFrom;
      customTo.value = state.customTo;
      customFrom.min = state.customFrom;
      customFrom.max = state.customTo;
      customTo.min = state.customFrom;
      customTo.max = state.customTo;
    }
    statusDot.className = 'status-dot ok';
    statusText.textContent = 'Dados atualizados';
    statusDetail.textContent = `${payload.meta.total} operações · ${payload.geradoEm.slice(0, 10)}`;
    loadingState?.classList.add('loaded');
    applyPeriod();
  } catch (error) {
    console.error(error);
    statusDot.className = 'status-dot error';
    statusText.textContent = 'Falha na conexão';
    statusDetail.textContent = 'Verifique a API publicada';
    if (loadingState) loadingState.classList.add('error');
    if (loadingDetail) loadingDetail.textContent = 'Não foi possível concluir a conexão.';
    notice.textContent = `Não foi possível carregar os dados. ${error.name === 'AbortError' ? 'A conexão excedeu o tempo de espera.' : error.message}`;
    notice.classList.add('visible');
    document.querySelectorAll('.skeleton').forEach(el => el.classList.remove('skeleton'));
  }
}

document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.nav-button').forEach(b => b.classList.toggle('active', b === button));
    document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${button.dataset.page}`));
    syncModeVisibility(button.dataset.page);
    document.getElementById('sidebar').classList.remove('open');
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    requestAnimationFrame(drawAll);
  });
});

document.querySelectorAll('.menu-toggle').forEach(button => {
  button.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    button.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
  });
});

document.getElementById('capitalInput').addEventListener('input', event => {
  const digits = event.target.value.replace(/\D/g, '');
  event.target.value = digits ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Number(digits)) : '0';
  updatePatrimony();
});
document.getElementById('useReference').addEventListener('click', () => {
  if (!state.stats) return;
  document.getElementById('capitalInput').value = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.max(1, Math.ceil(state.stats.maxDrawdown * 3)));
  updatePatrimony();
});

document.querySelectorAll('#periodSelector button').forEach(button => {
  button.addEventListener('click', () => {
    state.period = button.dataset.period;
    document.querySelectorAll('#periodSelector button').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    applyPeriod();
  });
});
['customFrom', 'customTo'].forEach(id => document.getElementById(id)?.addEventListener('change', event => {
  const fromInput = document.getElementById('customFrom');
  const toInput = document.getElementById('customTo');
  if (id === 'customFrom') {
    state.customFrom = event.target.value;
    toInput.min = state.customFrom;
    if (!state.customTo || state.customTo < state.customFrom) {
      state.customTo = state.customFrom;
      toInput.value = state.customTo;
    }
  } else {
    if (event.target.value < state.customFrom) {
      event.target.value = state.customFrom;
    }
    state.customTo = event.target.value;
  }
  fromInput.max = state.customTo;
  state.period = 'custom';
  applyPeriod();
}));
document.querySelectorAll('#analysisMode button').forEach(button => {
  button.addEventListener('click', () => {
    state.mode = button.dataset.mode;
    document.body.classList.toggle('mode-days', state.mode === 'days');
    document.querySelectorAll('#analysisMode button').forEach(item => {
      const active = item === button;
      item.classList.toggle('active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    state.stats = calculateStats(state.filtered); render();
  });
});
['technicalStop','dailyLimitPoints','dailyLimitValue'].forEach(id => document.getElementById(id)?.addEventListener('input', event => {
  formatIntegerInput(event);
  if (id === 'dailyLimitPoints') {
    riskConfig.lastLimitEdited = 'points';
    const value = numericInputValue('dailyLimitPoints') * riskConfig.contracts * POINT_VALUE;
    document.getElementById('dailyLimitValue').value = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value));
  }
  if (id === 'dailyLimitValue') {
    riskConfig.lastLimitEdited = 'value';
    const points = numericInputValue('dailyLimitValue') / (riskConfig.contracts * POINT_VALUE);
    document.getElementById('dailyLimitPoints').value = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(points));
  }
  if (state.stats) renderRisk(state.stats.days.map(day=>day.value));
}));
document.getElementById('safetyFactor')?.addEventListener('input', () => state.stats && renderRisk(state.stats.days.map(day=>day.value)));
document.querySelectorAll('[data-stepper]').forEach(button => {
  button.addEventListener('click', () => {
    const delta = Number(button.dataset.delta) || 0;
    if (button.dataset.stepper === 'contracts') {
      riskConfig.contracts = Math.min(100, Math.max(1, riskConfig.contracts + delta));
      document.getElementById('contractCount').textContent = String(riskConfig.contracts);
      document.getElementById('contractLabel').textContent = riskConfig.contracts === 1 ? 'contrato' : 'contratos';
      const value = numericInputValue('dailyLimitPoints') * riskConfig.contracts * POINT_VALUE;
      document.getElementById('dailyLimitValue').value = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value));
      riskConfig.lastLimitEdited = 'points';
    } else {
      riskConfig.maxOperations = Math.min(20, Math.max(1, riskConfig.maxOperations + delta));
      document.getElementById('maxOperations').textContent = String(riskConfig.maxOperations);
    }
    if (state.stats) renderRisk(state.stats.days.map(day=>day.value));
  });
});

document.querySelectorAll('#resultFilter button').forEach(button => {
  button.addEventListener('click', () => {
    state.resultFilter = button.dataset.result;
    document.querySelectorAll('#resultFilter button').forEach(item => item.classList.toggle('active', item === button));
    renderOperations();
  });
});
function setTheme(theme) {
  const selectedTheme = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = selectedTheme;
  try {
    localStorage.setItem('pulo-theme', selectedTheme);
  } catch (error) {
    console.warn('Não foi possível salvar a preferência visual.', error);
  }
  document.querySelectorAll('.theme-switch button[data-theme-option]').forEach(button => {
    const active = button.dataset.themeOption === selectedTheme;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  requestAnimationFrame(drawAll);
}
document.querySelectorAll('.theme-switch button[data-theme-option]').forEach(button => {
  button.addEventListener('click', () => setTheme(button.dataset.themeOption));
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAll, 100);
});

syncModeVisibility('visao');
let savedTheme = 'dark';
try {
  savedTheme = localStorage.getItem('pulo-theme') === 'light' ? 'light' : 'dark';
} catch (error) {
  console.warn('Preferência visual indisponível.', error);
}
setTheme(savedTheme);
loadData();
