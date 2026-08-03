import React from "react";
import { createRoot } from "react-dom/client";
import Home from "./page";
import { hydrateRuntimeData, type RobustezPayload } from "./robustez-runtime-data";

declare global {
  interface Window {
    PULO_ROBUSTEZ_CONFIG?: { API_URL?: string };
    PuloAccess?: { validate?: () => Promise<void> };
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Contêiner #root não encontrado.");
const root = createRoot(rootElement);

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

async function load() {
  const savedTheme = localStorage.getItem("pulo-theme") === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = savedTheme;
  root.render(<Status title="Carregando Robustez" detail="Lendo operações reais e mercado de 5 minutos…" />);

  try {
    const apiUrl = window.PULO_ROBUSTEZ_CONFIG?.API_URL || "";
    if (!apiUrl || apiUrl.includes("COLE_AQUI")) {
      throw new Error("Publique robustez.gs como aplicativo da web e informe a URL em robustez-config.js.");
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    const response = await fetch(`${apiUrl}${apiUrl.includes("?") ? "&" : "?"}action=robustez`, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: controller.signal,
    });
    window.clearTimeout(timeout);
    if (!response.ok) throw new Error(`A base respondeu com HTTP ${response.status}.`);
    const payload = await response.json() as RobustezPayload & { sucesso?: boolean; mensagem?: string };
    if (payload.sucesso === false) throw new Error(payload.mensagem || "A API de Robustez recusou a leitura.");
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
