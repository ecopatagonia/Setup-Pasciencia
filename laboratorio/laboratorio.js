(function () {
  "use strict";

  const config = window.LABORATORIO_CONFIG || {};
  const state = {
    candles: [],
    byDay: new Map(),
    loadedTf: null,
    lastA: null,
    lastB: null,
    compare: false,
  };

  const $ = (selector) => document.querySelector(selector);

  function render() {
    $("#root").innerHTML = `
      <main class="lab-shell">
        <header class="lab-header">
          <div>
            <p class="eyebrow">O PULO DO GATTO</p>
            <h1>Laboratorio</h1>
            <p class="subtitle">Backtest educativo com trailing stop. A pagina carrega somente a Sheet v2; sem snapshot local.</p>
          </div>
          <a class="back-link" href="../index.html?view=site">Voltar ao painel</a>
        </header>

        <section class="status" id="sourceStatus">
          <span class="status-dot" aria-hidden="true"></span>
          <div>
            <strong id="sourceTitle">Nao carregado</strong>
            <small id="sourceDetail">Aguardando conexao com a Sheet v2.</small>
          </div>
        </section>

        <section class="grid">
          <aside class="panel">
            <h2>Configuracao</h2>
            <div class="config-stack">
              ${configCard("a", "Simulacao A")}
              ${configCard("b", "Simulacao B")}
              <div class="actions">
                <button class="primary" id="runBtn" type="button" disabled>Rodar simulacao</button>
                <button class="secondary" id="compareBtn" type="button" disabled>Ativar comparacao A/B</button>
              </div>
            </div>
          </aside>

          <section class="results">
            <div id="resultArea" class="empty">
              Inicie a simulacao para ver metricas, curva, barras mensais e extremos.
            </div>
          </section>
        </section>
      </main>`;

    $("#runBtn").addEventListener("click", run);
    $("#compareBtn").addEventListener("click", activateCompare);
    $("#tfA").addEventListener("change", loadFromSheet);
    loadFromSheet();
  }

  function configCard(id, title) {
    const upper = id.toUpperCase();
    const tf = Number(config.DEFAULT_TIMEFRAME) || 5;
    const time = config.DEFAULT_ENTRY_TIME || "10:30";
    return `
      <article class="config-card ${id}">
        <h3>${title}</h3>
        <div class="fields">
          <label>Timeframe
            <select id="tf${upper}">
              ${[1,5,10,15,20,30,45,60].map((value) => `<option value="${value}" ${value === tf ? "selected" : ""}>${value}m</option>`).join("")}
            </select>
          </label>
          <label>Horario
            <input id="time${upper}" type="time" step="300" value="${time}">
          </label>
          <label>Lado
            <select id="side${upper}">
              <option value="compra">Compra</option>
              <option value="venda">Venda</option>
              <option value="aleatorio">Aleatorio</option>
              <option value="continuidade">Continuidade</option>
            </select>
          </label>
          <label>Entrada
            <select id="entry${upper}">
              <option value="abertura">Abertura</option>
              <option value="fechamento">Fechamento</option>
            </select>
          </label>
          <label>SL inicial
            <select id="stopLookback${upper}">
              <option value="1">1 vela atras</option>
              <option value="2">2 velas atras</option>
              <option value="3">3 velas atras</option>
            </select>
          </label>
          <label>Inicio trailing
            <select id="trailStart${upper}">
              <option value="1">1 vela fechada</option>
              <option value="2" selected>2 velas fechadas</option>
              <option value="3">3 velas fechadas</option>
            </select>
          </label>
          <label>Regra trailing
            <select id="trailRule${upper}">
              <option value="2">Ultimas 2 velas</option>
              <option value="3">Ultimas 3 velas</option>
              <option value="2de3">2 de 3</option>
            </select>
          </label>
          <label>SL maximo
            <select id="maxStop${upper}">
              ${[250,300,350,400,450,500,550,600,650,700].map((value) => `<option value="${value}" ${value === 500 ? "selected" : ""}>${value} pts</option>`).join("")}
            </select>
          </label>
          <label>Semente
            <input id="seed${upper}" type="number" value="2408" min="1" step="1">
          </label>
          <label>TP seguranca
            <select id="takeProfit${upper}">
              <option value="0">Sem TP</option>
              <option value="1500" selected>1500 pts</option>
            </select>
          </label>
        </div>
      </article>`;
  }

  function setStatus(kind, title, detail) {
    const box = $("#sourceStatus");
    box.className = `status ${kind || ""}`;
    $("#sourceTitle").textContent = title;
    $("#sourceDetail").textContent = detail;
  }

  function jsonp(url, timeoutMs = 25000) {
    return new Promise((resolve, reject) => {
      const callback = `labJsonp_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script = document.createElement("script");
      const separator = url.includes("?") ? "&" : "?";
      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error("Tempo limite ao carregar a Sheet v2."));
      }, timeoutMs);

      function cleanup() {
        window.clearTimeout(timer);
        delete window[callback];
        script.remove();
      }

      window[callback] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("Falha ao conectar com Apps Script."));
      };
      script.src = `${url}${separator}callback=${callback}`;
      document.body.appendChild(script);
    });
  }

  async function loadFromSheet() {
    try {
      const tf = Number($("#tfA")?.value || config.DEFAULT_TIMEFRAME || 5);
      if (!config.API_URL || config.API_URL.includes("PEGAR_AQUI")) {
        throw new Error("Configure a URL /exec do Apps Script em laboratorio-config.js.");
      }
      $("#runBtn").disabled = true;
      $("#compareBtn").disabled = true;
      setStatus("", "Carregando Sheet v2...", `Solicitando candles ${tf}m.`);
      const response = await jsonp(`${config.API_URL}?action=candles&tf=${tf}&limit=70000`);
      if (!response || !response.ok || !Array.isArray(response.candles)) {
        throw new Error(response?.message || "Resposta invalida da Sheet v2.");
      }
      state.candles = normalizeCandles(response.candles);
      state.byDay = groupByDay(state.candles);
      state.loadedTf = tf;
      $("#runBtn").disabled = state.candles.length === 0;
      $("#compareBtn").disabled = state.candles.length === 0;
      setStatus("ok", `Sheet v2 carregada para ${tf}m`, `${state.candles.length.toLocaleString("pt-BR")} candles em ${state.byDay.size.toLocaleString("pt-BR")} pregoes.`);
    } catch (error) {
      state.candles = [];
      state.byDay = new Map();
      $("#runBtn").disabled = true;
      $("#compareBtn").disabled = true;
      setStatus("error", "Erro de carga da Sheet v2", error.message);
      $("#resultArea").className = "empty";
      $("#resultArea").textContent = "Sem dados carregados. A simulacao fica bloqueada ate corrigir a conexao com a planilha.";
    }
  }

  function normalizeCandles(rows) {
    return rows.map((row) => ({
      date: row.date || row.data,
      time: row.time || row.hora || String(row.data || "").slice(11, 16),
      abertura: Number(row.abertura),
      maxima: Number(row.maxima),
      minima: Number(row.minima),
      fechamento: Number(row.fechamento),
    })).filter((row) => row.date && row.time && [row.abertura, row.maxima, row.minima, row.fechamento].every(Number.isFinite))
      .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  }

  function groupByDay(candles) {
    const map = new Map();
    candles.forEach((candle) => {
      if (!map.has(candle.date)) map.set(candle.date, []);
      map.get(candle.date).push(candle);
    });
    return map;
  }

  function readConfig(suffix) {
    const value = (id) => $(`#${id}${suffix}`).value;
    return {
      tf: Number(value("tf")),
      time: value("time"),
      side: value("side"),
      entry: value("entry"),
      stopLookback: Number(value("stopLookback")),
      trailStart: Number(value("trailStart")),
      trailRule: value("trailRule"),
      maxStop: Number(value("maxStop")),
      seed: Number(value("seed")) || 1,
      takeProfit: Number(value("takeProfit")),
    };
  }

  function activateCompare() {
    state.compare = true;
    document.body.classList.add("compare-on");
    ["tf", "time", "side", "entry", "stopLookback", "trailStart", "trailRule", "maxStop", "seed", "takeProfit"].forEach((name) => {
      const a = $(`#${name}A`);
      const b = $(`#${name}B`);
      if (a && b) b.value = a.value;
    });
    $("#compareBtn").textContent = "Comparacao A/B ativa";
    $("#compareBtn").disabled = true;
  }

  function run() {
    if (!state.candles.length) return;
    const a = simulate(readConfig("A"));
    const b = state.compare ? simulate(readConfig("B")) : null;
    state.lastA = a;
    state.lastB = b;
    drawResults(a, b);
  }

  function simulate(cfg) {
    const trades = [];
    const discarded = {};
    for (const [date, candles] of state.byDay.entries()) {
      const trade = simulateDay(date, candles, cfg);
      if (trade.discarded) discarded[trade.reason] = (discarded[trade.reason] || 0) + 1;
      else trades.push(trade);
    }
    let equity = 0;
    let peak = 0;
    let maxDd = 0;
    trades.forEach((trade) => {
      equity += trade.result;
      trade.equity = equity;
      peak = Math.max(peak, equity);
      maxDd = Math.min(maxDd, equity - peak);
    });
    const wins = trades.filter((t) => t.result > 0);
    const losses = trades.filter((t) => t.result < 0);
    const grossWin = wins.reduce((sum, t) => sum + t.result, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.result, 0));
    return {
      cfg,
      trades,
      discarded,
      total: equity,
      maxDd,
      winrate: trades.length ? wins.length / trades.length : 0,
      pf: grossLoss ? grossWin / grossLoss : null,
      wins: wins.length,
      losses: losses.length,
    };
  }

  function simulateDay(date, candles, cfg) {
    const entryIndex = candles.findIndex((c) => c.time === cfg.time);
    if (entryIndex < 0) return discard(date, "Candle de entrada ausente");
    if (entryIndex < cfg.stopLookback) return discard(date, "Dados insuficientes");
    const entry = candles[entryIndex];
    const side = resolveSide(candles, entryIndex, cfg, date);
    if (!side) return discard(date, "Continuidade nao ativada");
    const entryPrice = entry[cfg.entry];
    const stopCandle = candles[entryIndex - cfg.stopLookback];
    let stop = side === "compra" ? stopCandle.minima : stopCandle.maxima;
    const initialRisk = side === "compra" ? entryPrice - stop : stop - entryPrice;
    if (!Number.isFinite(initialRisk) || initialRisk <= 0) return discard(date, "Stop invalido");
    if (initialRisk > cfg.maxStop) return discard(date, "SL inicial maior que o permitido");

    let bestClose = entry.fechamento;
    let exit = null;
    let exitReason = "Fechamento 18:00";
    for (let i = entryIndex + 1; i < candles.length; i += 1) {
      const candle = candles[i];
      if (side === "compra" && candle.minima <= stop) {
        exit = stop;
        exitReason = stop < entryPrice ? "SL inicial/trailing negativo" : "Trailing protegido";
        break;
      }
      if (side === "venda" && candle.maxima >= stop) {
        exit = stop;
        exitReason = stop > entryPrice ? "SL inicial/trailing negativo" : "Trailing protegido";
        break;
      }
      if (cfg.takeProfit > 0) {
        if (side === "compra" && candle.maxima >= entryPrice + cfg.takeProfit) {
          exit = entryPrice + cfg.takeProfit;
          exitReason = "TP seguranca";
          break;
        }
        if (side === "venda" && candle.minima <= entryPrice - cfg.takeProfit) {
          exit = entryPrice - cfg.takeProfit;
          exitReason = "TP seguranca";
          break;
        }
      }
      if (i - entryIndex >= cfg.trailStart && shouldTrail(candles, i, side, cfg, bestClose)) {
        const candidate = trailCandidate(candles, i, side, cfg);
        if (side === "compra" && candidate > stop && candidate < candle.fechamento) stop = candidate;
        if (side === "venda" && candidate < stop && candidate > candle.fechamento) stop = candidate;
      }
      if (side === "compra") bestClose = Math.max(bestClose, candle.fechamento);
      else bestClose = Math.min(bestClose, candle.fechamento);
    }
    const last = candles[candles.length - 1];
    if (exit === null) exit = last.fechamento;
    const result = side === "compra" ? exit - entryPrice : entryPrice - exit;
    return { date, side, entryTime: cfg.time, entryPrice, stopInitial: stopCandle, initialRisk, exit, exitReason, result };
  }

  function discard(date, reason) {
    return { date, discarded: true, reason };
  }

  function resolveSide(candles, entryIndex, cfg, date) {
    if (cfg.side === "compra" || cfg.side === "venda") return cfg.side;
    if (cfg.side === "aleatorio") return seededRandom(`${cfg.seed}-${date}`) >= .5 ? "compra" : "venda";
    const prev = candles[entryIndex - 1];
    if (!prev) return null;
    if (prev.fechamento > prev.abertura) return "compra";
    if (prev.fechamento < prev.abertura) return "venda";
    return null;
  }

  function seededRandom(text) {
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
    return ((hash >>> 0) % 100000) / 100000;
  }

  function shouldTrail(candles, i, side, cfg, bestClose) {
    const current = candles[i];
    if (side === "compra" && current.fechamento <= bestClose) return false;
    if (side === "venda" && current.fechamento >= bestClose) return false;
    if (cfg.trailRule !== "2de3") return true;
    if (i < 3) return false;
    let ok = 0;
    for (let n = i - 2; n <= i; n += 1) {
      const candle = candles[n];
      const prev = candles[n - 1];
      if (side === "compra" && candle.maxima > prev.maxima) ok += 1;
      if (side === "venda" && candle.minima < prev.minima) ok += 1;
    }
    return ok >= 2;
  }

  function trailCandidate(candles, i, side, cfg) {
    const windowSize = cfg.trailRule === "3" || cfg.trailRule === "2de3" ? 3 : 2;
    const from = Math.max(0, i - windowSize);
    const base = candles.slice(from, i);
    return side === "compra"
      ? Math.max(...base.map((c) => c.minima))
      : Math.min(...base.map((c) => c.maxima));
  }

  function drawResults(a, b) {
    const area = $("#resultArea");
    area.className = "";
    area.innerHTML = `
      <div class="metrics">
        ${metric("Resultado A", formatPts(a.total), a.total >= 0 ? "positive" : "negative")}
        ${metric("Drawdown A", formatPts(a.maxDd), "negative")}
        ${metric("Winrate A", pct(a.winrate))}
        ${metric("Validadas A", a.trades.length.toLocaleString("pt-BR"))}
        ${b ? metric("Resultado B", formatPts(b.total), b.total >= 0 ? "positive" : "negative") : ""}
        ${b ? metric("Diferenca B-A", formatPts(b.total - a.total), b.total - a.total >= 0 ? "positive" : "negative") : ""}
        ${b ? metric("Drawdown B", formatPts(b.maxDd), "negative") : ""}
        ${b ? metric("Winrate B", pct(b.winrate)) : ""}
      </div>
      <div class="charts">
        <article class="panel"><h2>Curva acumulada</h2><canvas id="equityCanvas" width="900" height="320"></canvas></article>
        <article class="panel"><h2>Barras mensais</h2><canvas id="monthlyCanvas" width="480" height="320"></canvas></article>
      </div>
      <article class="panel">
        <h2>Extremos</h2>
        <div class="table-wrap">${extremesTable(a, b)}</div>
      </article>`;
    drawEquity($("#equityCanvas"), a, b);
    drawMonthly($("#monthlyCanvas"), a, b);
  }

  function metric(label, value, cls = "") {
    return `<article class="metric"><span>${label}</span><strong class="${cls}">${value}</strong></article>`;
  }

  function extremesTable(a, b) {
    const rows = [];
    [ ["A", a], ["B", b] ].forEach(([label, result]) => {
      if (!result) return;
      result.trades.slice().sort((x, y) => y.result - x.result).slice(0, 5).forEach((trade) => rows.push(row(label, trade)));
      result.trades.slice().sort((x, y) => x.result - y.result).slice(0, 5).forEach((trade) => rows.push(row(label, trade)));
    });
    return `<table><thead><tr><th>Config</th><th>Data</th><th>Lado</th><th>Entrada</th><th>Resultado</th><th>Saida</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  }

  function row(label, trade) {
    return `<tr><td>${label}</td><td>${trade.date}</td><td>${trade.side}</td><td>${trade.entryTime}</td><td class="${trade.result >= 0 ? "positive" : "negative"}">${formatPts(trade.result)}</td><td>${trade.exitReason}</td></tr>`;
  }

  function drawEquity(canvas, a, b) {
    drawLineChart(canvas, [
      { label: "A", color: "#35d8ca", values: a.trades.map((t) => t.equity) },
      b ? { label: "B", color: "#f4b942", values: b.trades.map((t) => t.equity) } : null,
    ].filter(Boolean));
  }

  function drawMonthly(canvas, a, b) {
    const labels = Array.from(new Set([ ...monthly(a).keys(), ...(b ? monthly(b).keys() : []) ])).sort();
    const series = [
      { label: "A", color: "#35d8ca", values: labels.map((key) => monthly(a).get(key) || 0) },
      b ? { label: "B", color: "#f4b942", values: labels.map((key) => monthly(b).get(key) || 0) } : null,
    ].filter(Boolean);
    drawBarChart(canvas, labels, series);
  }

  function monthly(result) {
    const map = new Map();
    result.trades.forEach((trade) => {
      const key = trade.date.slice(0, 7);
      map.set(key, (map.get(key) || 0) + trade.result);
    });
    return map;
  }

  function drawLineChart(canvas, series) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, p = 34;
    ctx.clearRect(0, 0, w, h);
    const values = series.flatMap((s) => s.values);
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const scaleY = (v) => h - p - ((v - min) / (max - min || 1)) * (h - p * 2);
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.moveTo(p, scaleY(0)); ctx.lineTo(w - p, scaleY(0)); ctx.stroke();
    series.forEach((s) => {
      ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
      s.values.forEach((value, i) => {
        const x = p + (i / Math.max(1, s.values.length - 1)) * (w - p * 2);
        const y = scaleY(value);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function drawBarChart(canvas, labels, series) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height, p = 34;
    ctx.clearRect(0, 0, w, h);
    const values = series.flatMap((s) => s.values);
    const min = Math.min(0, ...values), max = Math.max(0, ...values);
    const scaleY = (v) => h - p - ((v - min) / (max - min || 1)) * (h - p * 2);
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.beginPath(); ctx.moveTo(p, scaleY(0)); ctx.lineTo(w - p, scaleY(0)); ctx.stroke();
    const groupW = (w - p * 2) / Math.max(1, labels.length);
    series.forEach((s, si) => {
      ctx.fillStyle = s.color;
      s.values.forEach((value, i) => {
        const barW = Math.max(4, groupW / (series.length + 1));
        const x = p + i * groupW + si * barW + 4;
        const y0 = scaleY(0), y1 = scaleY(value);
        ctx.fillRect(x, Math.min(y0, y1), barW, Math.max(2, Math.abs(y1 - y0)));
      });
    });
  }

  function formatPts(value) {
    return `${Math.round(value).toLocaleString("pt-BR")} pts`;
  }

  function pct(value) {
    return `${(value * 100).toFixed(1).replace(".", ",")}%`;
  }

  document.addEventListener("DOMContentLoaded", render);
})();
