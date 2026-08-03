(() => {
  "use strict";

  const config = window.PULO_ACCESS_CONFIG || {};
  let currentUser = null;
  let checkTimer = 0;

  function token() {
    return localStorage.getItem(config.TOKEN_KEY || "pulo_gatto_session") || "";
  }

  function setToken(value) {
    if (value) localStorage.setItem(config.TOKEN_KEY || "pulo_gatto_session", value);
    else localStorage.removeItem(config.TOKEN_KEY || "pulo_gatto_session");
  }

  async function api(payload) {
    if (!config.API_URL || config.API_URL.includes("COLE_AQUI")) {
      throw new Error("A URL do Apps Script ainda não foi configurada.");
    }
    const response = await fetch(config.API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("Não foi possível conectar ao serviço de acesso.");
    return response.json();
  }

  function createGate() {
    const gate = document.createElement("section");
    gate.id = "pulo-auth-gate";
    gate.className = "pulo-auth-gate";
    gate.innerHTML = `
      <div class="pulo-auth-visual">
        <small>ÁREA DE PARTICIPANTES</small>
        <h1>Disciplina transforma método em resultado.</h1>
        <p>Acompanhe sua evolução, compreenda seus números e opere com mais consistência.</p>
      </div>
      <div class="pulo-auth-form-wrap">
        <form class="pulo-auth-card" id="pulo-login-form">
          <small>O PULO DO GATTO</small>
          <h2>Acesse sua conta</h2>
          <p>Informe o e-mail cadastrado e sua chave de 4 números.</p>
          <label>E-mail<input id="pulo-login-email" type="email" autocomplete="email" required></label>
          <label>Chave de acesso<input id="pulo-login-pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="4" pattern="[0-9]{4}" required></label>
          <div class="pulo-auth-message" id="pulo-auth-message" role="alert" hidden></div>
          <button class="pulo-auth-submit" type="submit">Entrar</button>
          <div class="pulo-auth-links">
            <span>Esqueceu a chave? Contate o administrador.</span>
            ${config.REGISTRATION_URL && !config.REGISTRATION_URL.includes("COLE_AQUI") ? `<a href="${escapeAttribute(config.REGISTRATION_URL)}">Cadastro</a>` : ""}
          </div>
        </form>
      </div>`;
    document.body.prepend(gate);
    document.documentElement.classList.add("pulo-auth-lock");
    const pin = gate.querySelector("#pulo-login-pin");
    pin.addEventListener("input", () => { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); });
    gate.querySelector("#pulo-login-form").addEventListener("submit", login);
    return gate;
  }

  function createLoadingGate() {
    const gate = document.createElement("section");
    gate.id = "pulo-auth-loading-gate";
    gate.className = "pulo-auth-loading-gate";
    gate.innerHTML = `
      <div class="pulo-auth-loading-card">
        <span class="pulo-auth-spinner" aria-hidden="true"></span>
        <small>O PULO DO GATTO</small>
        <h1>Aguarde um instante</h1>
        <p>Estamos validando sua sessão e carregando a nova tela.</p>
      </div>`;
    document.body.prepend(gate);
    return gate;
  }

  function escapeAttribute(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function gate() {
    return document.querySelector("#pulo-auth-gate") || createGate();
  }

  function loadingGate() {
    return document.querySelector("#pulo-auth-loading-gate") || createLoadingGate();
  }

  function showLoadingGate() {
    const element = loadingGate();
    element.hidden = false;
    document.querySelector("#pulo-auth-gate")?.setAttribute("hidden", "");
    document.documentElement.classList.add("pulo-auth-lock");
  }

  function hideLoadingGate() {
    document.querySelector("#pulo-auth-loading-gate")?.setAttribute("hidden", "");
  }

  function showGate(message = "") {
    hideLoadingGate();
    const element = gate();
    element.hidden = false;
    document.documentElement.classList.add("pulo-auth-lock");
    const box = element.querySelector("#pulo-auth-message");
    box.textContent = message;
    box.hidden = !message;
  }

  function hideGate() {
    hideLoadingGate();
    const element = gate();
    element.hidden = true;
    document.documentElement.classList.remove("pulo-auth-lock");
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const message = form.querySelector("#pulo-auth-message");
    button.disabled = true;
    button.textContent = "Entrando...";
    message.hidden = true;
    try {
      const result = await api({
        action: "login",
        email: form.querySelector("#pulo-login-email").value,
        pin: form.querySelector("#pulo-login-pin").value,
        userAgent: navigator.userAgent
      });
      if (!result.ok) throw new Error(result.message || "Não foi possível entrar.");
      setToken(result.token);
      currentUser = result.user;
      const adminSiteView = new URLSearchParams(window.location.search).get("view") === "site";
      if (currentUser.role === "ADMINISTRADOR" && !adminSiteView && config.ADMIN_URL && !config.ADMIN_URL.includes("COLE_AQUI")) {
        window.location.assign(config.ADMIN_URL);
        return;
      }
      activateUser(currentUser);
    } catch (error) {
      message.textContent = error.message;
      message.hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = "Entrar";
    }
  }

  function activateUser(user) {
    hideGate();
    applyPermissions(user);
    renderSessionControl(user);
    document.dispatchEvent(new CustomEvent("pulo:session", { detail: user }));
    window.clearInterval(checkTimer);
    checkTimer = window.setInterval(validate, Number(config.SESSION_CHECK_MS) || 60000);
  }

  function renderSessionControl(user) {
    let control = document.querySelector("#pulo-session-control");
    if (!control) {
      control = document.createElement("div");
      control.id = "pulo-session-control";
      control.className = "pulo-session-control";
      document.querySelector(".topbar")?.appendChild(control);
    }
    const adminLink = user.role === "ADMINISTRADOR" && config.ADMIN_URL
      ? `<a href="${escapeAttribute(config.ADMIN_URL)}">Painel</a>`
      : "";
    control.innerHTML = `
      <span><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.role)}</small></span>
      ${adminLink}
      <button type="button">Sair</button>`;
    control.querySelector("button")?.addEventListener("click", logout);
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }

  function applyPermissions(user) {
    const allowed = new Set(user.permissions || []);
    document.querySelectorAll("[data-permission]").forEach((element) => {
      const permission = element.dataset.permission;
      const locked = user.role === "ALUNO" && !allowed.has(permission);
      element.classList.toggle("pulo-permission-locked", locked);
      element.setAttribute("aria-disabled", locked ? "true" : "false");
      if (locked && !element.dataset.puloLockBound) {
        element.dataset.puloLockBound = "true";
        element.addEventListener("click", (event) => {
          if (!element.classList.contains("pulo-permission-locked")) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          toast("Este recurso está disponível para mentorados ou mediante liberação do administrador.");
        }, true);
      }
    });
  }

  function toast(message) {
    document.querySelector(".pulo-access-toast")?.remove();
    const element = document.createElement("div");
    element.className = "pulo-access-toast";
    element.textContent = message;
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), 4200);
  }

  async function validate() {
    const activeToken = token();
    if (!activeToken) {
      showGate();
      return;
    }
    try {
      const result = await api({ action: "validateSession", token: activeToken });
      if (!result.ok) throw new Error(result.message || "Sua sessão expirou.");
      currentUser = result.user;
      const adminSiteView = new URLSearchParams(window.location.search).get("view") === "site";
      if (currentUser.role === "ADMINISTRADOR" && !adminSiteView && config.ADMIN_URL && !config.ADMIN_URL.includes("COLE_AQUI")) {
        window.location.assign(config.ADMIN_URL);
        return;
      }
      activateUser(currentUser);
    } catch (error) {
      setToken("");
      currentUser = null;
      window.clearInterval(checkTimer);
      showGate(error.message);
    }
  }

  async function logout() {
    const activeToken = token();
    setToken("");
    currentUser = null;
    window.clearInterval(checkTimer);
    document.querySelector("#pulo-session-control")?.remove();
    showGate();
    if (activeToken) {
      try { await api({ action: "logout", token: activeToken }); } catch (_) {}
    }
  }

  window.PuloAccess = Object.freeze({
    validate,
    logout,
    getUser: () => currentUser,
    getToken: token
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (token()) showLoadingGate();
    else showGate();
    validate();
  });
})();
