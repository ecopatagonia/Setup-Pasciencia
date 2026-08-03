import React from "react";
import { createRoot } from "react-dom/client";
import Home from "./page";
import { hydrateRuntimeData, type MarketDay, type RealDay, type RealOperation, type RobustezPayload } from "./robustez-runtime-data";

declare global {
  interface Window {
    PULO_ROBUSTEZ_CONFIG?: { API_URL?: string };
    PuloAccess?: { validate?: () => Promise<void> };
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Contêiner #root não encontrado.");
const root = createRoot(rootElement);
const PANEL_CACHE_KEY = "pulo_robustez_base_cache_v1";

type PanelOperation = {
  id?: string;
  idOperacao?: string;
  data?: string;
  hora?: string;
  dataHoraIso?: string;
  pontos?: number | string;
  resultado?: string;
  stopTotal?: number | string;
  stop?: number | string;
  tamanhoStop?: number | string;
  lado?: string;
  aluno?: string;
  observacao?: string;
};

function Status({ title, detail, error = false }: { title: string; detail: string; error?: boolean }) {
  return <main className="data-gate"><section className={error ? "data-card error" : "data-card"}><span className="data-spinner" aria-hidden="true" /><h1>{title}</h1><p>{detail}</p>{error ? <button onClick={() => location.reload()}>Tentar novamente</button> : null}<a href="../index.html?view=site">Voltar ao painel principal</a></section></main>;
}

function AccessDenied() {
  return <main className="data-gate"><section className="data-card error"><h1>Acesso não liberado</h1><p>O módulo Teste de Robustez precisa ser liberado pelo administrador para esta conta.</p><a href="../index.html?view=site">Voltar ao painel principal</a></section></main>;
}

function mountShellLinks() {
  const sidebar = document.querySelector(".app-shell .sidebar");
  const nav = sidebar?.querySelector("nav");
  if (!sidebar || !nav || sidebar.querySelector(".module-links")) return;
  const controls = document.createElement("div");
  controls.className = "module-links";
  controls.innerHTML = '<a href="../index.html?view=site">← Painel principal</a><button type="button">Alternar tema</button>';
  controls.querySelector("button")?.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("pulo-theme", next);
  });
  sidebar.insertBefore(controls, nav);
}

function numberFrom(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function labelFromDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}/${month}/${year}` : date;
}

function resultFromOperation(operation: PanelOperation, points: number): RealOperation["result"] {
  const raw = String(operation.resultado || "").toUpperCase();
  if (points === 0 || raw.includes("BREAK")) return "BREAKEVEN";
  if (points > 0 || raw === "GAIN") return "GAIN";
  return "LOSS";
}

function payloadFromPanelCache(): RobustezPayload | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PANEL_CACHE_KEY) || "null") as { operacoes?: PanelOperation[]; geradoEm?: string } | null;
    if (!parsed || !Array.isArray(parsed.operacoes) || parsed.operacoes.length === 0) return null;
    const sorted = [...parsed.operacoes].sort((a, b) => String(a.dataHoraIso || "").localeCompare(String(b.dataHoraIso || "")));
    const grouped = new Map<string, PanelOperation[]>();
    for (const operation of sorted) {
      const date = String(operation.dataHoraIso || "").slice(0, 10);
      if (!date) continue;
      grouped.set(date, [...(grouped.get(date) || []), operation]);
    }
    const realOperations: RealOperation[] = [];
    const realDays: RealDay[] = [];
    let cumulative = 0;
    [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([date, operations]) => {
      const dayOperations = operations.map((operation, index) => {
        const points = numberFrom(operation.pontos);
        const result = resultFromOperation(operation, points);
        const converted: RealOperation = {
          id: String(operation.idOperacao || operation.id || `${date}-${index + 1}`),
          date,
          label: labelFromDate(date),
          position: index + 1,
          points,
          result,
          stop: Math.abs(numberFrom(operation.stopTotal ?? operation.stop ?? operation.tamanhoStop)),
          side: String(operation.lado || "").toUpperCase(),
          student: String(operation.aluno || operation.observacao || ""),
        };
        realOperations.push(converted);
        return converted;
      });
      const points = dayOperations.reduce((sum, operation) => sum + operation.points, 0);
      const stops = dayOperations.map((operation) => operation.stop).filter(Number.isFinite);
      cumulative += points;
      realDays.push({
        date,
        label: labelFromDate(date),
        points: Math.round(points * 100) / 100,
        cumulative: Math.round(cumulative * 100) / 100,
        operations: dayOperations.length,
        gains: dayOperations.filter((operation) => operation.result === "GAIN").length,
        losses: dayOperations.filter((operation) => operation.result === "LOSS").length,
        breakevens: dayOperations.filter((operation) => operation.result === "BREAKEVEN").length,
        avgStop: stops.length ? Math.round((stops.reduce((sum, value) => sum + value, 0) / stops.length) * 100) / 100 : 0,
        students: [...new Set(dayOperations.map((operation) => operation.student).filter(Boolean))].join(", "),
        marketRange: null,
        marketMove: null,
        marketCandles: null,
      });
    });
    if (!realDays.length || !realOperations.length) return null;
    return {
      realDays,
      realOperations,
      marketDays: [],
      audit: {
        source: "Cache do painel principal",
        operations: realOperations.length,
        validDays: realDays.length,
        marketDays: 0,
        validDaysWithMarket: 0,
        finalPoints: Math.round(cumulative * 100) / 100,
      },
    };
  } catch {
    return null;
  }
}

function withMarket(basePayload: RobustezPayload, marketPayload: Partial<RobustezPayload> & { audit?: Partial<RobustezPayload["audit"]> }): RobustezPayload {
  const marketDays = Array.isArray(marketPayload.marketDays) ? marketPayload.marketDays as MarketDay[] : [];
  const marketByDate = new Map(marketDays.map((day) => [day.date, day]));
  const realDays = basePayload.realDays.map((day) => {
    const market = marketByDate.get(day.date);
    return market ? { ...day, marketRange: market.range, marketMove: market.move, marketCandles: market.candles } : day;
  });
  return {
    ...basePayload,
    realDays,
    marketDays,
    audit: {
      ...basePayload.audit,
      source: `${basePayload.audit.source} + mercado 5m`,
      marketDays: marketDays.length,
      validDaysWithMarket: realDays.filter((day) => day.marketRange !== null).length,
    },
  };
}

async function fetchRobustezAction(apiUrl: string, action: "robustez" | "market", timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiUrl}${apiUrl.includes("?") ? "&" : "?"}action=${action}`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`A base respondeu com HTTP ${response.status}.`);
    const payload = await response.json() as Partial<RobustezPayload> & { sucesso?: boolean; mensagem?: string };
    if (payload.sucesso === false) throw new Error(payload.mensagem || "A API de Robustez recusou a leitura.");
    return payload;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function load() {
  const savedTheme = localStorage.getItem("pulo-theme") === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = savedTheme;
  const cachedBase = payloadFromPanelCache();
  root.render(<Status title="Carregando Robustez" detail={cachedBase ? "Base real já carregada. Lendo somente mercado de 5 minutos…" : "Lendo operações reais e mercado de 5 minutos…"} />);

  try {
    const apiUrl = window.PULO_ROBUSTEZ_CONFIG?.API_URL || "";
    if (!apiUrl || apiUrl.includes("COLE_AQUI")) {
      throw new Error("Publique robustez.gs como aplicativo da web e informe a URL em robustez-config.js.");
    }
    let payload: RobustezPayload;
    if (cachedBase) {
      try {
        const marketPayload = await fetchRobustezAction(apiUrl, "market", 90000);
        payload = withMarket(cachedBase, marketPayload);
      } catch (error) {
        console.warn("Leitura leve de mercado indisponível. Usando carga completa de Robustez.", error);
        payload = await fetchRobustezAction(apiUrl, "robustez", 120000) as RobustezPayload;
      }
    } else {
      payload = await fetchRobustezAction(apiUrl, "robustez", 120000) as RobustezPayload;
    }
    hydrateRuntimeData(payload);
    root.render(<Home />);
    window.requestAnimationFrame(mountShellLinks);
    window.requestAnimationFrame(() => window.PuloAccess?.validate?.());
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "A API demorou mais de 120 segundos para responder. Tente novamente ou reduza a base processada no Apps Script."
      : error instanceof Error ? error.message : "Falha desconhecida ao carregar a base.";
    root.render(<Status error title="Não foi possível carregar os dados" detail={message} />);
  }
}

let loadStarted = false;
root.render(<Status title="Validando acesso" detail="Confirmando sua sessão e permissões…" />);
document.addEventListener("pulo:session", (event) => {
  const user = (event as CustomEvent<{ role?: string; permissions?: string[] }>).detail || {};
  const allowed = user.role !== "ALUNO" || (user.permissions || []).includes("robustez");
  if (!allowed) {
    root.render(<AccessDenied />);
    return;
  }
  if (loadStarted) return;
  loadStarted = true;
  load();
});
