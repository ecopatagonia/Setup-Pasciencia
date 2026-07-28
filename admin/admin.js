(() => {
  "use strict";

  const permissions = [
    ["patrimonio", "Estatísticas", "Patrimônio"],
    ["resultados", "Estatísticas", "Resultados"],
    ["pontos", "Estatísticas", "Pontos"],
    ["consistencia", "Estatísticas", "Consistência"],
    ["evolucao_temporal", "Estatísticas", "Evolução temporal"],
    ["horarios", "Estatísticas", "Horários"],
    ["calibragem", "Controle de risco", "Calibragem"],
    ["projecao_risco", "Controle de risco", "Projeção de risco"]
  ];
  const permissionGroups = ["Estatísticas", "Controle de risco"];
  const config = window.PULO_ACCESS_CONFIG || {};
  const tokenKey = config.TOKEN_KEY || "pulo_gatto_session";
  let users = [];
  let selectedId = "";

  function token() { return localStorage.getItem(tokenKey) || ""; }
  function h(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    })[char]);
  }
  async function api(payload) {
    const response = await fetch(config.API_URL, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, token: token() })
    });
    return response.json();
  }
  function showMessage(text, danger = false) {
    const box = document.querySelector("#message");
    box.textContent = text;
    box.classList.toggle("danger", danger);
    box.hidden = false;
    window.setTimeout(() => { box.hidden = true; }, 3500);
  }
  async function load() {
    if (!token()) return goToSite();
    const result = await api({ action: "adminListUsers" });
    if (!result.ok) return goToSite();
    users = result.users;
    render();
    if (!selectedId && users[0]) select(users[0].id);
  }
  function goToSite() { window.location.assign(config.SITE_URL || "/"); }
  function render() {
    const active = users.filter((user) => user.status === "ATIVO").length;
    const pending = users.filter((user) => user.status === "PENDENTE").length;
    const blocked = users.filter((user) => user.status === "BLOQUEADO").length;
    document.querySelector("#summary").innerHTML = `
      <article><span>Total</span><strong>${users.length}</strong></article>
      <article><span>Ativos</span><strong>${active}</strong></article>
      <article><span>Pendentes</span><strong>${pending}</strong></article>
      <article><span>Bloqueados</span><strong>${blocked}</strong></article>`;
    renderList();
  }
  function renderList() {
    const query = document.querySelector("#search").value.trim().toLowerCase();
    const filtered = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(query));
    document.querySelector("#people").innerHTML = filtered.map((user) => `
      <button class="person ${selectedId === user.id ? "selected" : ""}" data-id="${h(user.id)}">
        <span class="avatar">${h(user.name.split(/\s+/).slice(0,2).map(part => part[0]).join("").toUpperCase())}</span>
        <span><strong>${h(user.name)}</strong><small>${h(user.email)}</small></span>
        <i class="${h(user.status.toLowerCase())}">${h(user.status)}</i>
      </button>`).join("") || '<p class="empty">Nenhum participante encontrado.</p>';
    document.querySelectorAll(".person").forEach((button) => button.addEventListener("click", () => select(button.dataset.id)));
  }
  function select(id) {
    selectedId = id;
    renderList();
    const user = users.find((item) => item.id === id);
    const detail = document.querySelector("#detail");
    detail.innerHTML = `
      <div class="detail-head">
        <div><span class="status ${h(user.status.toLowerCase())}">${h(user.status)}</span><h2>${h(user.name)}</h2><p>${h(user.id)}</p></div>
        <a class="whatsapp" href="${h(user.whatsappUrl)}" target="_blank" rel="noopener">Abrir no WhatsApp ↗</a>
      </div>
      <section><h3>01 · Dados de acesso</h3>
        <div class="data-grid"><label>E-mail<strong>${h(user.email)}</strong></label><label>Celular<strong>${h(user.phoneE164)}</strong></label></div>
        <label>Chave de 4 números<input name="pin" value="${h(user.pin)}" maxlength="4" inputmode="numeric" pattern="[0-9]{4}" required></label>
      </section>
      <section><h3>02 · Nível e situação</h3><div class="data-grid">
        <label>Nível<select name="role"><option value="ALUNO">Aluno</option><option value="MENTORADO">Mentorado</option><option value="ADMINISTRADOR">Administrador</option></select></label>
        <label>Situação<select name="status"><option value="PENDENTE">Pendente</option><option value="ATIVO">Ativo</option><option value="BLOQUEADO">Bloqueado</option></select></label>
      </div>
      <label class="check"><input type="checkbox" name="resetAttempts"> Zerar tentativas e desbloqueio por erros</label></section>
      <section><h3>03 · Permissões de visualização</h3><p>Visão geral e Operações estão sempre disponíveis.</p>
        <div class="permission-groups">${permissionGroups.map((group) => `<label class="group-toggle"><span>${h(group)} — todo o menu</span><input type="checkbox" data-permission-group="${h(group)}"></label>`).join("")}</div>
        <div class="permission-list">${permissions.map(([code, group, name]) => `<label><span><small>${h(group)}</small>${h(name)}</span><input type="checkbox" name="permissions" data-group="${h(group)}" value="${h(code)}" ${user.permissions.includes(code) ? "checked" : ""}></label>`).join("")}</div>
      </section>
      <div class="actions"><button type="button" class="end-session">Encerrar sessão ativa</button><button type="submit">Salvar alterações</button></div>`;
    detail.elements.role.value = user.role;
    detail.elements.status.value = user.status;
    detail.elements.pin.addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0,4); });
    detail.querySelector(".end-session").addEventListener("click", endSession);
    detail.querySelectorAll("[data-permission-group]").forEach((toggle) => {
      const groupInputs = Array.from(detail.querySelectorAll(`[name="permissions"][data-group="${toggle.dataset.permissionGroup}"]`));
      const sync = () => {
        const checked = groupInputs.filter((input) => input.checked).length;
        toggle.checked = checked === groupInputs.length;
        toggle.indeterminate = checked > 0 && checked < groupInputs.length;
      };
      toggle.addEventListener("change", () => {
        groupInputs.forEach((input) => { input.checked = toggle.checked; });
        sync();
      });
      groupInputs.forEach((input) => input.addEventListener("change", sync));
      sync();
    });
  }
  async function save(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!selectedId || !form.reportValidity()) return;
    const result = await api({
      action: "adminUpdateUser",
      userId: selectedId,
      pin: form.elements.pin.value,
      role: form.elements.role.value,
      status: form.elements.status.value,
      resetAttempts: form.elements.resetAttempts.checked,
      permissions: Array.from(form.querySelectorAll('[name="permissions"]:checked')).map(input => input.value)
    });
    if (!result.ok) return showMessage(result.message, true);
    users = users.map((user) => user.id === selectedId ? result.user : user);
    render();
    select(selectedId);
    showMessage("Alterações salvas com sucesso.");
  }
  async function endSession() {
    const result = await api({ action: "adminEndSession", userId: selectedId });
    showMessage(result.ok ? "Sessão encerrada." : result.message, !result.ok);
  }
  document.querySelector("#search").addEventListener("input", renderList);
  document.querySelector("#detail").addEventListener("submit", save);
  document.querySelector("#open-site").addEventListener("click", (event) => { event.preventDefault(); goToSite(); });
  document.querySelector("#logout").addEventListener("click", async () => {
    try { await api({ action: "logout" }); } catch (_) {}
    localStorage.removeItem(tokenKey);
    goToSite();
  });
  load();
})();
