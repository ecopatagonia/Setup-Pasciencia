'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycby1rs6UObGzUGgp2I-vLt4W48V1tu2Jk8MIB066GdBynFTKjJXgBZHl8uptw3Gx_jLd/exec';
const state = { all: [], filtered: [], period: 'all', mode: 'operations', customFrom: '', customTo: '', stats: null, resultFilter: 'all', search: '' };
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
  const gains = gainOps.length;
  const grossGain = gainOps.reduce((sum, op) => sum + Math.max(0, Number(op.financeiro)), 0);
  const grossLoss = Math.abs(stopOps.reduce((sum, op) => sum + Math.min(0, Number(op.financeiro)), 0));
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
    averageGain: average(gainOps.map(op => Number(op.financeiro))),
    averageStop: average(stopOps.map(op => Number(op.financeiro))),
    payoff: stopOps.length && average(stopOps.map(op => Number(op.financeiro))) ? average(gainOps.map(op => Number(op.financeiro))) / Math.abs(average(stopOps.map(op => Number(op.financeiro)))) : 0,
    bestOperation: operations.length ? Math.max(...operations.map(op => Number(op.financeiro))) : 0,
    worstOperation: operations.length ? Math.min(...operations.map(op => Number(op.financeiro))) : 0,
    averagePoints: average(operations.map(op => Number(op.pontos))),
    gainCount: gainOps.length,
    stopCount: stopOps.length,
    breakevenCount: operations.filter(op => op.resultado === 'BREAKEVEN').length,
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
  if (state.period === 'all' || !state.all.length) {
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
      start = new Date(`${state.customFrom || latestIso}T00:00:00`);
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
  setText('dias-pos', String(s.positiveDays));
  setText('dias-neg', String(s.negativeDays));
  setText('dias-zero', String(s.neutralDays));
  setText('profit-factor', Number.isFinite(s.profitFactor) ? number2.format(s.profitFactor) : '∞');
  setText('payoff', number2.format(s.payoff));
  setText('gain-medio', money.format(s.averageGain));
  setText('stop-medio', money.format(s.averageStop));
  setText('gains-count', `${s.gainCount} gains`);
  setText('stops-count', `${s.stopCount} stops`);
  setText('melhor-op', money.format(s.bestOperation));
  setText('pior-op', money.format(s.worstOperation));
  setText('pontos-medios', number2.format(s.averagePoints));
  setText('be-count', String(s.breakevenCount));
  setText('cons-pos', `${number2.format(s.days.length ? s.positiveDays / s.days.length * 100 : 0)}%`);
  setText('cons-pos-count', `${s.positiveDays} pregões`);
  setText('melhor-dia', money.format(s.bestDay?.value || 0));
  setText('pior-dia', money.format(s.worstDay?.value || 0));
  setText('melhor-dia-data', s.bestDay ? formatDate(s.bestDay.date) : '—');
  setText('pior-dia-data', s.worstDay ? formatDate(s.worstDay.date) : '—');
  setText('desvio-dia', money.format(s.dailyDeviation));
  setText('streak-gain', String(s.gainStreak));
  setText('streak-stop', String(s.stopStreak));
  setText('acima-media', String(s.daysAboveAverage));
  setText('concentracao', `${number2.format(s.profitConcentration)}%`);
  const periodNames = { all: 'Todo o período', last: 'Último dia carregado', week: 'Semana da última data', month: 'Mês da última data', year: 'Ano da última data', custom: 'Período personalizado' };
  document.querySelectorAll('[data-note="periodo"]').forEach(el => { el.textContent = periodNames[state.period]; });
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
  updatePatrimony();
  renderSideComparison();
  renderConsistency();
  renderHours();
  renderOperations();
  renderPoints();
  renderExtended();
  drawAll();
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
  const grossGain = gainValues.reduce((sum, value) => sum + Math.max(0, value), 0);
  const grossLoss = Math.abs(stopValues.reduce((sum, value) => sum + Math.min(0, value), 0));
  return {
    total: current, curve, days, drawdown, updraw,
    expOperation: average(values), expDay: average(days.map(day => day.value)),
    profitFactor: grossLoss ? grossGain / grossLoss : grossGain ? Infinity : 0,
    averageGain: average(gainValues), averageStop: average(stopValues),
    best: values.length ? Math.max(...values) : 0, worst: values.length ? Math.min(...values) : 0,
    bestDay: sortedDays[0] || null, worstDay: sortedDays[sortedDays.length - 1] || null,
    positiveDays: days.filter(day => day.value > 0).length,
    negativeDays: days.filter(day => day.value < 0).length,
    neutralDays: days.filter(day => Math.abs(day.value) < .005).length
  };
}

function renderPoints() {
  const s = calculatePointsStats(state.filtered);
  state.pointsStats = s;
  const pts = value => `${number2.format(value)} pts`;
  setText('pts-total', pts(s.total)); setText('pts-exp-op', pts(s.expOperation)); setText('pts-exp-dia', pts(s.expDay));
  setText('pts-pf', Number.isFinite(s.profitFactor) ? number2.format(s.profitFactor) : '∞');
  setText('pts-dd', pts(-s.drawdown)); setText('pts-up', pts(s.updraw));
  setText('pts-gain', pts(s.averageGain)); setText('pts-stop', pts(s.averageStop));
  setText('pts-best', pts(s.best)); setText('pts-worst', pts(s.worst));
  setText('pts-best-day', pts(s.bestDay?.value || 0)); setText('pts-worst-day', pts(s.worstDay?.value || 0));
  setText('pts-best-day-date', s.bestDay ? formatDate(s.bestDay.date) : '—');
  setText('pts-worst-day-date', s.worstDay ? formatDate(s.worstDay.date) : '—');
  setText('pts-days-pos', String(s.positiveDays)); setText('pts-days-neg', String(s.negativeDays)); setText('pts-days-zero', String(s.neutralDays));
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
    return `<div class="day-cell ${kind}" title="${formatDate(day.date)} · ${money.format(day.value)}"><span>${new Date(`${day.date}T12:00:00`).getDate()}</span><small>${money.format(day.value).replace(',00', '')}</small></div>`;
  }).join('');
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
    <span class="${row.value >= 0 ? 'positive' : 'negative'}">${money.format(row.value)}</span>
    <small>${row.count} operações · ${number2.format(row.count ? row.gains / row.count * 100 : 0)}% de acerto · ${money.format(row.value / row.count)} por operação${row.count < 5 ? ' · Amostra reduzida' : ''}</small>
  </div>`).join('');
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
  el.innerHTML = rows.map(row => `<div><strong>${row.label}</strong><span class="${row.value >= 0 ? 'positive' : 'negative'}">${money.format(row.value)}</span><small>${row.count} operações · ${number2.format(row.count ? row.gains / row.count * 100 : 0)}% de acerto</small></div>`).join('') || '<p class="empty">Sem períodos suficientes.</p>';
}

function renderExtended() {
  const opValues = state.filtered.map(op => Number(op.financeiro));
  const dayValues = state.stats.days.map(day => day.value);
  const gainRuns = streakRuns(opValues, value => value > 0);
  const lossRuns = streakRuns(opValues, value => value < 0);
  const streakEl = document.getElementById('streakAnalysis');
  if (streakEl) {
    const maxGain = Math.max(0, ...gainRuns.map(run => run.length)), maxLoss = Math.max(0, ...lossRuns.map(run => run.length));
    const worstRun = lossRuns.sort((a, b) => a.sum - b.sum)[0] || { sum: 0 };
    streakEl.innerHTML = `<article class="comparison-card"><div class="comparison-title"><span>GAINS</span><strong class="positive">${maxGain} consecutivos</strong></div><p>${gainRuns.length} sequências positivas observadas.</p></article><article class="comparison-card"><div class="comparison-title"><span>LOSSES</span><strong class="negative">${maxLoss} consecutivos</strong></div><p>${lossRuns.length} sequências negativas · pior impacto ${money.format(worstRun.sum)}.</p></article>`;
  }

  const pos = state.stats.days.filter(d => d.value > 0).sort((a,b) => b.value-a.value);
  const neg = state.stats.days.filter(d => d.value < 0).sort((a,b) => a.value-b.value);
  const grossPos = pos.reduce((s,d)=>s+d.value,0), grossNeg = Math.abs(neg.reduce((s,d)=>s+d.value,0));
  const concentration = document.getElementById('concentrationAnalysis');
  if (concentration) {
    const sum = (rows,n) => rows.slice(0,n).reduce((s,d)=>s+Math.abs(d.value),0);
    const withoutBest = state.stats.total - pos.slice(0,3).reduce((s,d)=>s+d.value,0);
    const withoutWorst = state.stats.total - neg.slice(0,3).reduce((s,d)=>s+d.value,0);
    concentration.innerHTML = `<article class="comparison-card"><div class="comparison-title"><span>GANHOS</span><strong class="positive">${pos.length} dias</strong></div><dl><div><dt>Ganho bruto</dt><dd>${money.format(grossPos)}</dd></div><div><dt>Melhor dia</dt><dd>${money.format(pos[0]?.value||0)}</dd></div><div><dt>Top 3</dt><dd>${number2.format(grossPos ? sum(pos,3)/grossPos*100:0)}%</dd></div><div><dt>Sem top 3</dt><dd>${money.format(withoutBest)}</dd></div></dl></article><article class="comparison-card"><div class="comparison-title"><span>PERDAS</span><strong class="negative">${neg.length} dias</strong></div><dl><div><dt>Perda bruta</dt><dd>${money.format(-grossNeg)}</dd></div><div><dt>Pior dia</dt><dd>${money.format(neg[0]?.value||0)}</dd></div><div><dt>Top 3</dt><dd>${number2.format(grossNeg ? sum(neg,3)/grossNeg*100:0)}%</dd></div><div><dt>Sem piores 3</dt><dd>${money.format(withoutWorst)}</dd></div></dl></article>`;
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
  const worstDay = Math.min(0, ...dayValues), worstSequence = Math.min(0, ...losses.map(run=>run.sum));
  const dayStats = calculateCurve(dayValues);
  const capital = Number(document.getElementById('riskCapital')?.value)||0;
  const dailyLimit = Number(document.getElementById('dailyLimit')?.value)||0;
  const factor = Number(document.getElementById('safetyFactor')?.value)||3;
  setText('risk-worst-day', money.format(worstDay));
  setText('risk-loss-streak', `${Math.max(0,...losses.map(run=>run.length))} dias`);
  setText('risk-reference', money.format(dayStats.drawdown*factor));
  setText('risk-days', capital>0&&dailyLimit>0 ? number2.format(capital/dailyLimit) : number2.format(0));
  setText('risk-dd-percent', capital>0 ? percent2(-dayStats.drawdown/capital*100) : percent2(0));
  setText('risk-reserve', capital>0 ? money.format(capital+worstSequence) : money.format(0));
}

function calculateCurve(values) {
  let current=0, peak=0, trough=0, drawdown=0, updraw=0;
  values.forEach(value=>{current+=value;peak=Math.max(peak,current);trough=Math.min(trough,current);drawdown=Math.max(drawdown,peak-current);updraw=Math.max(updraw,current-trough);});
  return {current,drawdown,updraw};
}

function renderOperations() {
  const body = document.getElementById('operationsBody');
  if (!body) return;
  const search = state.search.toLowerCase();
  const filtered = [...state.filtered].reverse().filter(op => {
    const resultOk = state.resultFilter === 'all' || op.resultado === state.resultFilter;
    const haystack = `${op.id} ${op.data} ${op.hora} ${op.lado} ${op.resultado}`.toLowerCase();
    return resultOk && (!search || haystack.includes(search));
  });
  body.innerHTML = filtered.map(op => {
    const duration = Math.max(0, Number(op.candleSaida) - Number(op.candleEntrada));
    return `<tr><td>${op.data}</td><td>${op.hora}</td><td>${op.lado}</td><td><span class="result-badge ${op.resultado.toLowerCase()}">${op.resultado}</span></td><td>${number2.format(Number(op.pontos))}</td><td class="${Number(op.financeiro) >= 0 ? 'positive' : 'negative'}">${money.format(Number(op.financeiro))}</td><td>${number2.format(Number(op.stopTotal))}</td><td>${duration} candles</td></tr>`;
  }).join('');
  if (!filtered.length) body.innerHTML = '<tr><td colspan="8" class="empty">Nenhuma operação encontrada.</td></tr>';
  document.getElementById('operationsCount').textContent = `${filtered.length} operações exibidas`;
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

  if (values.length <= 100) {
    values.forEach((value, index) => {
      ctx.fillStyle = value < 0 ? '#ff5164' : '#35d8ca';
      ctx.beginPath(); ctx.arc(x(index), y(value), 2.6, 0, Math.PI * 2); ctx.fill();
    });
  }

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
  const capital = Math.max(1, Number(document.getElementById('capitalInput').value.replace(/\D/g, '')) || 1);
  const values = state.stats.curve.map(p => p.value / capital * 100);
  drawLineChart(document.getElementById('patrimonyChart'), values, {
    formatAxis: value => `${number2.format(value)}%`,
    formatMarker: value => `${number2.format(value)}%`
  });
}

function drawBarChart(canvas, rows, formatAxis) {
  if (!canvas || !rows.length) return;
  const { ctx, width, height } = setupCanvas(canvas);
  const pad = { top: 20, right: 18, bottom: 48, left: 68 };
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
    ctx.fillStyle = '#60757e'; ctx.textAlign = 'right'; ctx.fillText(formatAxis(value), pad.left - 9, yy);
  }
  ctx.setLineDash([]);
  rows.forEach((row, i) => {
    const xx = pad.left + slot * i + (slot - barW) / 2;
    const top = Math.min(y(row.value), zeroY), h = Math.max(3, Math.abs(y(row.value) - zeroY));
    ctx.fillStyle = row.value > 0 ? '#35d8ca' : row.value < 0 ? '#ff5164' : '#8b9aa1';
    ctx.beginPath(); ctx.roundRect(xx, top, barW, h, 3); ctx.fill();
    if (rows.length <= 18 || i % Math.ceil(rows.length / 12) === 0) {
      ctx.save(); ctx.translate(xx + barW / 2, height - 13); ctx.rotate(-.55);
      ctx.fillStyle = '#60757e'; ctx.textAlign = 'right'; ctx.fillText(row.label, 0, 0); ctx.restore();
    }
  });
  if (rows.length > 1) {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const yy = y(average);
    ctx.strokeStyle = '#f4b942'; ctx.lineWidth = 1.5; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width-pad.right, yy); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#f4b942'; ctx.textAlign = 'right'; ctx.fillText(`Média ${formatAxis(average)}`, width-pad.right, Math.max(10, yy-9));
  }
}

function drawDistribution() {
  if (!state.filtered.length) return;
  const values = state.filtered.map(op => Number(op.financeiro));
  const min = Math.min(...values), max = Math.max(...values);
  const bins = 9, size = Math.max(1, (max - min) / bins);
  const rows = Array.from({ length: bins }, (_, i) => ({ label: money.format(min + i * size).replace(',00', ''), value: 0 }));
  values.forEach(value => { rows[Math.min(bins - 1, Math.floor((value - min) / size))].value += 1; });
  drawBarChart(document.getElementById('distributionChart'), rows, value => number2.format(value));
}

function drawPoints() {
  const s = state.pointsStats;
  if (!s) return;
  drawLineChart(document.getElementById('pointsChart'), s.curve, {
    formatAxis: value => `${number2.format(value)} pts`,
    formatMarker: value => `${number2.format(value)} pts`
  });
  drawBarChart(document.getElementById('pointsDailyChart'), s.days.map(day => ({
    label: new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${day.date}T12:00:00`)),
    value: day.value
  })), value => `${number2.format(value)} pts`);
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
  const weeks = groupPeriods('week'), months = groupPeriods('month');
  drawBarChart(document.getElementById('weeklyChart'), weeks, value => money.format(value).replace(',00',''));
  drawBarChart(document.getElementById('monthlyChart'), months, value => money.format(value).replace(',00',''));
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
    document.getElementById('customRange').hidden = state.period !== 'custom';
    if (state.period !== 'custom') applyPeriod();
  });
});
document.getElementById('applyCustom').addEventListener('click', () => {
  state.customFrom = document.getElementById('dateFrom').value;
  state.customTo = document.getElementById('dateTo').value;
  if (state.customFrom && state.customTo && state.customFrom > state.customTo) {
    const temp = state.customFrom; state.customFrom = state.customTo; state.customTo = temp;
  }
  applyPeriod();
});
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
['riskCapital','dailyLimit','safetyFactor'].forEach(id => document.getElementById(id)?.addEventListener('input', () => state.stats && renderRisk(state.stats.days.map(day=>day.value))));

document.querySelectorAll('#resultFilter button').forEach(button => {
  button.addEventListener('click', () => {
    state.resultFilter = button.dataset.result;
    document.querySelectorAll('#resultFilter button').forEach(item => item.classList.toggle('active', item === button));
    renderOperations();
  });
});
document.getElementById('operationSearch').addEventListener('input', event => {
  state.search = event.target.value.trim();
  renderOperations();
});

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawAll, 100);
});

loadData();
