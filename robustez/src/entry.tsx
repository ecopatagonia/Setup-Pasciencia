import React from "react";
import { createRoot } from "react-dom/client";
import Home from "./page";
import { hydrateRuntimeData, type RealDay, type RealOperation, type RobustezPayload } from "./robustez-runtime-data";

declare global {
  interface Window {
    PuloAccess?: { validate?: () => Promise<void> };
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Contêiner #root não encontrado.");
const root = createRoot(rootElement);
const PANEL_CACHE_KEY = "pulo_robustez_base_cache_v1";
const PANEL_OPERATIONS_URL = "https://script.google.com/macros/s/AKfycby1rs6UObGzUGgp2I-vLt4W48V1tu2Jk8MIB066GdBynFTKjJXgBZHl8uptw3Gx_jLd/exec";

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

function payloadFromOperations(operations: PanelOperation[], source: string): RobustezPayload | null {
    if (!operations.length) return null;
    const sorted = [...operations].sort((a, b) => String(a.dataHoraIso || "").localeCompare(String(b.dataHoraIso || "")));
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
      });
    });
    if (!realDays.length || !realOperations.length) return null;
    return {
      realDays,
      realOperations,
      audit: {
        source,
        operations: realOperations.length,
        validDays: realDays.length,
        finalPoints: Math.round(cumulative * 100) / 100,
      },
    };
}

function payloadFromPanelCache(): RobustezPayload | null {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(PANEL_CACHE_KEY) || "null") as { operacoes?: PanelOperation[] } | null;
    return parsed && Array.isArray(parsed.operacoes) ? payloadFromOperations(parsed.operacoes, "Cache do painel principal") : null;
  } catch {
    return null;
  }
}

async function fetchPanelOperations(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(PANEL_OPERATIONS_URL, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`A base respondeu com HTTP ${response.status}.`);
    const payload = await response.json() as { sucesso?: boolean; mensagem?: string; operacoes?: PanelOperation[] };
    if (payload.sucesso === false || !Array.isArray(payload.operacoes)) throw new Error(payload.mensagem || "A base principal não devolveu operações válidas.");
    return payloadFromOperations(payload.operacoes, "Base de operações do painel principal");
  } finally {
    window.clearTimeout(timeout);
  }
}

async function load() {
  const savedTheme = localStorage.getItem("pulo-theme") === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = savedTheme;
  const cachedBase = payloadFromPanelCache();
  root.render(<Status title="Carregando Robustez" detail={cachedBase ? "Usando operações já carregadas pelo painel principal…" : "Buscando somente as operações do painel principal…"} />);

  try {
    const payload = cachedBase || await fetchPanelOperations(90000);
    if (!payload) throw new Error("Nenhuma operação principal está disponível para a análise.");
    hydrateRuntimeData(payload);
    root.render(<Home />);
    window.requestAnimationFrame(mountShellLinks);
    window.requestAnimationFrame(() => window.PuloAccess?.validate?.());
  } catch (error) {
    const message = error instanceof DOMException && error.name === "AbortError"
      ? "A base principal demorou mais de 90 segundos para responder. Tente novamente pelo painel principal."
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
