const STORAGE_KEY = "grimorio-corvo-state-v1";
const AUTH_GATE_KEY = "grimorio-corvo-auth-gate";

const defaultTopics = [
  { id: crypto.randomUUID(), title: "Upgrade de precon por ate R$50", series: "Commander barato", status: "pending" },
  { id: crypto.randomUUID(), title: "Cartas que parecem ruins ate ganharem a mesa", series: "Carta esquecida", status: "pending" },
  { id: crypto.randomUUID(), title: "Analisar um deck de comandante subestimado", series: "Decks", status: "pending" },
  { id: crypto.randomUUID(), title: "Top 10 remocoes pretas para Commander", series: "Cartas", status: "done" }
];

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll("[data-view-target]");
const saveStatus = document.querySelector("#saveStatus");
const state = loadState();
const API_BASE = "/api";
const LOGIN_ANIMATION_MS = 1100;
const ALL_FEATURES = ["dashboard", "temas", "cartas", "decks", "admin", "deck_ai", "card_search"];
const viewFeatures = { temas: "temas", cartas: "card_search" };
const authState = {
  loading: true,
  isAuthenticated: false,
  user: null,
  features: ["dashboard"],
  offline: false
};

function hasFeature(feature) {
  return authState.features.includes(feature);
}

function canOpenView(viewId) {
  if (!authState.isAuthenticated && !authState.offline) return viewId === "dashboard";
  if (viewId === "dashboard" || viewId === "decks") return true;
  const feature = viewFeatures[viewId];
  return !feature || hasFeature(feature);
}

function routeAuthenticatedUser() {
  if (!authState.isAuthenticated) return;
  setView("dashboard");
}

function applyAccess() {
  document.querySelectorAll("[data-feature]").forEach((element) => {
    const feature = element.dataset.feature;
    element.hidden = Boolean(feature && !hasFeature(feature));
  });

  const activeView = document.querySelector(".view.active");
  if (activeView && !canOpenView(activeView.id)) setView("dashboard");

  const authOpen = document.querySelector("#authOpen");
  const authLogout = document.querySelector("#authLogout");
  if (authOpen) {
    authOpen.textContent = "Entrar";
    authOpen.hidden = authState.isAuthenticated && !authState.offline;
  }
  if (authLogout) authLogout.hidden = !authState.isAuthenticated || authState.offline;

  updateDeckGate();
  renderAdminMembers();
}

async function initAuth() {
  bindAuthControls();

  if (shouldRequireLoginGate()) {
    setAuthState({ isAuthenticated: false, user: null, features: ["dashboard"] });
    applyAccess();
    setView("dashboard");
    openAuthModal({ required: true });
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/auth/me`, { headers: { Accept: "application/json" } });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("API indisponivel");
    const payload = await response.json();
    setAuthState(payload);
  } catch {
    setAuthState({
      isAuthenticated: true,
      user: { displayName: "Adm local", role: "admin" },
      features: ALL_FEATURES,
      offline: true
    });
  }
  applyAccess();
  if (authState.isAuthenticated) routeAuthenticatedUser();
  else if (!authState.offline) openAuthModal({ required: true });
}

function shouldRequireLoginGate() {
  return location.protocol !== "file:" && sessionStorage.getItem(AUTH_GATE_KEY) !== "open";
}

function bindAuthControls() {
  document.querySelector("#authOpen")?.addEventListener("click", openAuthModal);
  document.querySelector("#authClose")?.addEventListener("click", () => closeAuthModal());
  document.querySelector("#authLogout")?.addEventListener("click", logout);
  document.querySelector("#authModal")?.addEventListener("click", (event) => {
    if (event.target.id === "authModal") closeAuthModal();
  });
  document.querySelector("#loginForm")?.addEventListener("submit", login);
  document.querySelector("#memberForm")?.addEventListener("submit", createMember);
}

function setAuthState(payload) {
  authState.loading = false;
  authState.isAuthenticated = Boolean(payload.isAuthenticated);
  authState.user = payload.user || null;
  authState.features = Array.isArray(payload.features) ? payload.features : ["dashboard"];
  authState.offline = Boolean(payload.offline);
}

function openAuthModal({ required = false } = {}) {
  if (authState.offline) return;
  const modal = document.querySelector("#authModal");
  if (!modal) return;
  modal.hidden = false;
  modal.removeAttribute("hidden");
  modal.classList.add("is-open");
  modal.classList.toggle("is-required", required);
  document.querySelector("#loginEmail")?.focus();
}

function closeAuthModal({ resetForm = false, force = false } = {}) {
  const modal = document.querySelector("#authModal");
  if (!modal) return;
  if (!force && modal.classList.contains("is-required") && !authState.isAuthenticated) {
    setAuthFeedback("Entre para acessar o Grimorio.", "error");
    document.querySelector("#loginEmail")?.focus();
    return;
  }
  modal.classList.remove("is-open", "is-required");
  modal.hidden = true;
  modal.setAttribute("hidden", "");
  if (resetForm) document.querySelector("#loginForm")?.reset();
}

async function login(event) {
  event.preventDefault();
  const feedback = document.querySelector("#authFeedback");
  const button = event.currentTarget.querySelector("button[type='submit']");
  setAuthFeedback("Abrindo o grimorio...", "ok");
  showSpellLoader();
  if (button) button.disabled = true;

  try {
    const response = await withMinimumDelay(fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#loginEmail").value,
        password: document.querySelector("#loginPassword").value
      })
    }), LOGIN_ANIMATION_MS);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel entrar.");
    sessionStorage.setItem(AUTH_GATE_KEY, "open");
    setAuthState(payload);
    setAuthFeedback("Entrada liberada.", "ok");
    closeAuthModal({ resetForm: true, force: true });
    applyAccess();
    routeAuthenticatedUser();
    setTransientStatus("Entrada liberada");
  } catch (error) {
    setAuthFeedback(error.message, "error");
    if (feedback) feedback.classList.add("is-error");
  } finally {
    hideSpellLoader();
    if (button) button.disabled = false;
  }
}

function showSpellLoader() {
  const loader = document.querySelector("#spellLoader");
  if (!loader) return;
  loader.hidden = false;
  loader.removeAttribute("hidden");
  loader.classList.add("is-active");
}

function hideSpellLoader() {
  const loader = document.querySelector("#spellLoader");
  if (!loader) return;
  loader.classList.remove("is-active");
  window.setTimeout(() => {
    if (loader.classList.contains("is-active")) return;
    loader.hidden = true;
    loader.setAttribute("hidden", "");
  }, 240);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function withMinimumDelay(promise, ms) {
  const delay = wait(ms);
  try {
    const result = await promise;
    await delay;
    return result;
  } catch (error) {
    await delay;
    throw error;
  }
}

async function logout() {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: { Accept: "application/json" } });
  sessionStorage.removeItem(AUTH_GATE_KEY);
  setAuthState({ isAuthenticated: false, user: null, features: ["dashboard"] });
  applyAccess();
  setView("dashboard");
  openAuthModal({ required: true });
}

function setAuthFeedback(text, tone = "") {
  const feedback = document.querySelector("#authFeedback");
  if (!feedback) return;
  feedback.textContent = text;
  feedback.classList.toggle("is-error", tone === "error");
  feedback.classList.toggle("is-ok", tone === "ok");
}

function updateDeckGate() {
  const canUseDeck = hasFeature("decks");
  const gate = document.querySelector("#deckMemberGate");
  const form = document.querySelector("#deckForm");
  const chip = document.querySelector("#deckAccessChip");
  if (gate) gate.hidden = canUseDeck;
  if (form) {
    form.classList.toggle("is-locked", !canUseDeck);
    form.querySelectorAll("textarea, button[type='submit']").forEach((field) => {
      field.disabled = !canUseDeck;
    });
  }
  if (chip) {
    chip.textContent = canUseDeck ? "Acesso liberado" : "Acesso de membro";
    chip.classList.toggle("is-open", canUseDeck);
  }
  if (!canUseDeck && document.body.dataset.view === "decks") renderDeckLockedOutput();
}

function renderDeckLockedOutput() {
  const output = document.querySelector("#deckOutput");
  if (!output) return;
  output.innerHTML = `
    <h3>Ferramenta de membros</h3>
    <p>O analisador completo fica liberado para apoiadores ativos. Entre com sua conta do Catarse para receber a leitura do deck.</p>
  `;
}

async function analyzeDeckWithApi(decklist) {
  const output = document.querySelector("#deckOutput");
  output.innerHTML = "<p>Consultando o grimorio e lendo sua lista...</p>";

  try {
    const response = await fetch(`${API_BASE}/decks/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ decklist })
    });
    const report = await response.json();
    if (response.status === 401) {
      renderDeckLockedOutput();
      openAuthModal();
      return;
    }
    if (!response.ok) throw new Error(report.error || "Nao foi possivel analisar o deck agora.");
    output.innerHTML = renderDeckApiReport(report);
  } catch (error) {
    output.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderDeckApiReport(report) {
  return `
    <blockquote class="corvo-note">${escapeHtml(report.corvoNote || "O grimorio terminou a leitura.")}</blockquote>
    ${report.aiText ? `<h3>Leitura com IA</h3><div class="ai-reading">${renderAiText(report.aiText)}</div>` : ""}
    <h3>Resumo</h3>
    <dl class="deck-stats">
      <dt>Total</dt><dd>${report.summary.total} cartas na lista, ${report.summary.foundTotal} encontradas no Scryfall</dd>
      <dt>Cores</dt><dd>${escapeHtml(report.summary.colors || "Incolor / nao identificado")}</dd>
      <dt>Valor medio de mana</dt><dd>${escapeHtml(report.summary.averageManaValue ?? "-")}</dd>
      <dt>Tipos</dt><dd>${formatObject(report.types || {})}</dd>
      <dt>Funcoes</dt><dd>${formatObject(report.roles || {})}</dd>
    </dl>
    <h3>Prioridades do Corvo</h3>
    <ul class="deck-advice">${(report.advice || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h3>Curva de mana</h3>
    <div class="deck-bars">${renderCurveBars(report.curve || {})}</div>
  `;
}
function renderAiText(text) {
  return escapeHtml(text)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br>")}</p>`)
    .join("");
}


async function renderAdminMembers() {
  const list = document.querySelector("#memberList");
  const panel = document.querySelector("#adminMembersPanel");
  if (!list || !panel || !hasFeature("admin")) return;

  if (authState.offline) {
    list.innerHTML = '<div class="empty-state compact">Cadastro real de membros fica ativo quando o site estiver no Cloudflare com D1.</div>';
    return;
  }

  list.innerHTML = '<div class="empty-state compact">Carregando usuarios...</div>';
  try {
    const response = await fetch(`${API_BASE}/admin/users`, { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Nao consegui carregar os usuarios.");
    const members = payload.users || [];
    if (!members.length) {
      list.innerHTML = '<div class="empty-state compact">Nenhum usuario cadastrado ainda.</div>';
      return;
    }
    list.innerHTML = members.map(renderMemberRow).join("");
  } catch (error) {
    list.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

function renderMemberRow(member) {
  const roleLabel = formatRoleLabel(member.role);
  const statusLabel = formatStatusLabel(member.plan_status);
  const isActive = member.plan_status === "active";
  const tier = member.catarse_tier ? ` · ${member.catarse_tier}` : "";

  return `
    <article class="member-row">
      <div>
        <strong>${escapeHtml(member.display_name || member.email)}</strong>
        <span>${escapeHtml(member.email)} · ${escapeHtml(roleLabel)}${escapeHtml(tier)}</span>
      </div>
      <span class="access-chip ${isActive ? "is-open" : ""}">${escapeHtml(statusLabel)}</span>
    </article>
  `;
}

function formatRoleLabel(role) {
  return ({ admin: "Administrador", member: "Membro", guest: "Visitante" })[role] || role || "Usuario";
}

function formatStatusLabel(status) {
  return ({ active: "Ativo", inactive: "Inativo" })[status] || status || "Indefinido";
}

async function createMember(event) {
  event.preventDefault();
  const list = document.querySelector("#memberList");
  if (authState.offline) {
    if (list) list.innerHTML = '<p class="error-text">Cadastro real precisa do Cloudflare D1 ativo.</p>';
    return;
  }

  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  const role = document.querySelector("#memberRole")?.value || "member";
  const planStatus = document.querySelector("#memberStatus")?.value || "active";
  const plan = role === "admin" ? "corvo" : role === "member" ? "catarse" : "free";

  button.disabled = true;
  button.textContent = "Criando...";
  try {
    const response = await fetch(`${API_BASE}/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email: document.querySelector("#memberEmail").value,
        displayName: document.querySelector("#memberName").value,
        password: document.querySelector("#memberPassword").value,
        role,
        plan,
        planStatus,
        catarseTier: document.querySelector("#memberTier").value
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Nao consegui criar o usuario.");
    form.reset();
    document.querySelector("#memberRole").value = "member";
    document.querySelector("#memberStatus").value = "active";
    document.querySelector("#memberTier").value = "R$15";
    setTransientStatus("Usuario criado");
    await renderAdminMembers();
  } catch (error) {
    if (list) list.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Criar usuario";
  }
}
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { topics: defaultTopics };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      topics: normalizeTopics(Array.isArray(parsed.topics) ? parsed.topics : defaultTopics)
    };
  } catch {
    return { topics: defaultTopics };
  }
}

function normalizeTopics(topics) {
  return topics
    .filter((topic) => topic.series !== "Lore")
    .map((topic) => ({
      ...topic,
      status: topic.status === "done" ? "done" : "pending",
      scheduledDate: isValidDateKey(topic.scheduledDate) ? topic.scheduledDate : ""
    }));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setTransientStatus("Salvo");
  renderMetrics();
}

function setTransientStatus(text) {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  window.setTimeout(() => {
    saveStatus.textContent = "Pronto";
  }, 1200);
}

function setView(viewId) {
  if (!canOpenView(viewId)) viewId = "dashboard";
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.viewTarget === viewId));
  document.body.dataset.view = viewId;
  if (viewId === "decks") updateDeckGate();
  window.requestAnimationFrame(() => restartReveals(viewId));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function restartReveals(viewId) {
  const activeView = document.getElementById(viewId);
  if (!activeView) return;

  activeView.querySelectorAll(".reveal").forEach((element) => {
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.viewTarget));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.jump));
});

document.querySelectorAll("[data-auth-open]").forEach((button) => {
  button.addEventListener("click", openAuthModal);
});

function renderMetrics() {
  const total = state.topics.length;
  const done = state.topics.filter((topic) => topic.status === "done").length;
  const scheduled = state.topics.filter((topic) => topic.scheduledDate).length;
  const pending = total - done;

  document.querySelector("#metricThemes").textContent = pending;
  document.querySelector("#metricDone").textContent = done;
  setText("#metricTopicTotal", total);
  setText("#metricTopicPending", pending);
  setText("#metricTopicScheduled", scheduled);
  setText("#metricTopicDone", done);
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

const statusLabels = {
  pending: "Pendente",
  done: "Feito"
};

let activeTopicFilter = "all";
let calendarCursor = getMonthStart(new Date());

function renderTopics() {
  const list = document.querySelector("#topicList");
  const topics = getFilteredTopics().filter((topic) => !topic.scheduledDate);
  if (!list) return;

  renderMetrics();
  renderCalendar();

  if (!topics.length) {
    list.innerHTML = '<div class="empty-state topic-empty">Nenhum card sem data nesse filtro.</div>';
    bindTopicActions();
    return;
  }

  list.innerHTML = topics
    .map((topic, index) => renderTopicRow(topic, index))
    .join("");

  bindTopicActions();
}

function renderTopicRow(topic, index) {
  const isDone = topic.status === "done";
  const statusLabel = statusLabels[topic.status] || statusLabels.pending;
  const actionLabel = isDone ? "Reabrir" : "Marcar feito";
  const position = String(index + 1).padStart(2, "0");

  return `
    <article class="topic-row topic-draggable${isDone ? " is-done" : ""}" draggable="true" data-topic-drag="${topic.id}">
      <button class="topic-check" type="button" data-topic-toggle="${topic.id}" aria-pressed="${isDone}" aria-label="${isDone ? "Reabrir tema" : "Marcar tema como feito"}">
        <span></span>
      </button>
      <div class="topic-main">
        <div class="topic-kicker">#${position} · ${escapeHtml(topic.series)}</div>
        <div class="topic-title">${escapeHtml(topic.title)}</div>
      </div>
      <span class="topic-status ${isDone ? "done" : "pending"}">${statusLabel}</span>
      <div class="topic-actions">
        <button class="small-button" type="button" data-topic-toggle="${topic.id}">${actionLabel}</button>
        <button class="small-button danger" type="button" data-topic-delete="${topic.id}">Remover</button>
      </div>
    </article>
  `;
}

function bindTopicActions() {
  const topicsView = document.querySelector("#temas");
  if (!topicsView) return;

  topicsView.querySelectorAll("[data-topic-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = state.topics.find((item) => item.id === button.dataset.topicToggle);
      if (!topic) return;
      topic.status = topic.status === "done" ? "pending" : "done";
      persist();
      renderTopics();
    });
  });

  topicsView.querySelectorAll("[data-topic-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.topics = state.topics.filter((topic) => topic.id !== button.dataset.topicDelete);
      persist();
      renderTopics();
    });
  });

  topicsView.querySelectorAll("[data-topic-unschedule]").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = state.topics.find((item) => item.id === button.dataset.topicUnschedule);
      if (!topic) return;
      topic.scheduledDate = "";
      persist();
      renderTopics();
    });
  });
}

function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const title = document.querySelector("#calendarTitle");
  if (!grid || !title) return;

  title.textContent = formatMonthTitle(calendarCursor);
  grid.innerHTML = buildCalendarDays(calendarCursor).map((date) => renderCalendarDay(date)).join("");
}

function renderCalendarDay(date) {
  const dateKey = formatDateKey(date);
  const isOutside = date.getMonth() !== calendarCursor.getMonth();
  const isToday = dateKey === formatDateKey(new Date());
  const topics = getFilteredTopics().filter((topic) => topic.scheduledDate === dateKey);
  const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "long", year: "numeric" }).format(date);

  return `
    <div class="calendar-day${isOutside ? " outside-month" : ""}${isToday ? " today" : ""}" data-calendar-date="${dateKey}" aria-label="${escapeHtml(label)}">
      <div class="calendar-day-head">
        <span>${date.getDate()}</span>
        ${isToday ? '<strong>Hoje</strong>' : ""}
      </div>
      <div class="calendar-day-cards">
        ${topics.length ? topics.map(renderCalendarCard).join("") : '<span class="calendar-drop-hint">Solte aqui</span>'}
      </div>
    </div>
  `;
}

function renderCalendarCard(topic) {
  const isDone = topic.status === "done";
  return `
    <article class="calendar-topic-card${isDone ? " is-done" : ""}" draggable="true" data-topic-drag="${topic.id}">
      <div>
        <strong>${escapeHtml(topic.title)}</strong>
        <span>${escapeHtml(topic.series)}</span>
      </div>
      <div class="calendar-card-actions">
        <button class="calendar-card-action" type="button" data-topic-toggle="${topic.id}" aria-label="${isDone ? "Reabrir tema" : "Marcar como feito"}" title="${isDone ? "Reabrir" : "Feito"}">${isDone ? "RE" : "OK"}</button>
        <button class="calendar-card-action muted" type="button" data-topic-unschedule="${topic.id}" aria-label="Remover data" title="Sem data">X</button>
      </div>
    </article>
  `;
}

function getFilteredTopics() {
  return state.topics.filter((topic) => activeTopicFilter === "all" || topic.status === activeTopicFilter);
}

document.querySelectorAll("[data-topic-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTopicFilter = button.dataset.topicFilter;
    document.querySelectorAll("[data-topic-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderTopics();
  });
});

const calendarPrev = document.querySelector("#calendarPrev");
const calendarNext = document.querySelector("#calendarNext");
const calendarToday = document.querySelector("#calendarToday");

calendarPrev?.addEventListener("click", () => {
  calendarCursor = addMonths(calendarCursor, -1);
  renderTopics();
});

calendarNext?.addEventListener("click", () => {
  calendarCursor = addMonths(calendarCursor, 1);
  renderTopics();
});

calendarToday?.addEventListener("click", () => {
  calendarCursor = getMonthStart(new Date());
  renderTopics();
});

const topicsView = document.querySelector("#temas");
topicsView?.addEventListener("dragstart", handleTopicDragStart);
topicsView?.addEventListener("dragend", handleTopicDragEnd);
topicsView?.addEventListener("dragover", handleTopicDragOver);
topicsView?.addEventListener("dragleave", handleTopicDragLeave);
topicsView?.addEventListener("drop", handleTopicDrop);

document.querySelector("#topicForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#newTopic");
  const title = input.value.trim();
  if (!title) return;

  state.topics.unshift({
    id: crypto.randomUUID(),
    title,
    series: detectSeries(title),
    status: "pending",
    scheduledDate: ""
  });
  input.value = "";
  persist();
  renderTopics();
});

function handleTopicDragStart(event) {
  const card = event.target.closest("[data-topic-drag]");
  if (!card) return;

  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", card.dataset.topicDrag);
  window.requestAnimationFrame(() => card.classList.add("is-dragging"));
}

function handleTopicDragEnd() {
  clearDropTargets();
  document.querySelectorAll(".is-dragging").forEach((element) => element.classList.remove("is-dragging"));
}

function handleTopicDragOver(event) {
  const zone = getScheduleDropZone(event.target);
  if (!zone) return;

  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  zone.classList.add("is-drop-target");
}

function handleTopicDragLeave(event) {
  const zone = getScheduleDropZone(event.target);
  if (!zone || zone.contains(event.relatedTarget)) return;
  zone.classList.remove("is-drop-target");
}

function handleTopicDrop(event) {
  const zone = getScheduleDropZone(event.target);
  if (!zone) return;

  event.preventDefault();
  const topic = state.topics.find((item) => item.id === event.dataTransfer.getData("text/plain"));
  if (!topic) return;

  topic.scheduledDate = zone.dataset.calendarDate || "";
  persist();
  renderTopics();
  setTransientStatus(topic.scheduledDate ? `Agendado para ${formatDisplayDate(topic.scheduledDate)}` : "Sem data");
}

function getScheduleDropZone(target) {
  return target.closest("[data-calendar-date], [data-unschedule-drop]");
}

function clearDropTargets() {
  document.querySelectorAll(".is-drop-target").forEach((element) => element.classList.remove("is-drop-target"));
}

function buildCalendarDays(cursor) {
  const firstDay = getMonthStart(cursor);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const firstVisibleDay = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => new Date(firstVisibleDay.getFullYear(), firstVisibleDay.getMonth(), firstVisibleDay.getDate() + index));
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthTitle(date) {
  const title = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function formatDateKey(date) {
  return [date.getFullYear(), padDatePart(date.getMonth() + 1), padDatePart(date.getDate())].join("-");
}

function formatDisplayDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return `${padDatePart(day)}/${padDatePart(month)}/${String(year).slice(2)}`;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function detectSeries(title) {
  const lower = title.toLowerCase();
  if (lower.includes("top")) return "Cartas";
  if (lower.includes("carta") || lower.includes("spoiler")) return "Cartas";
  if (lower.includes("deck") || lower.includes("precon") || lower.includes("upgrade")) return "Decks";
  return "Temas";
}

const cardForm = document.querySelector("#cardForm");
const cardInput = document.querySelector("#cardName");
const cardSuggestions = document.querySelector("#cardSuggestions");
let suggestionTimer = 0;
let suggestionAbortController = null;
let suggestionCards = [];
let lastSuggestionQuery = "";

cardForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = cardInput.value.trim();
  if (!name) return;

  const canUseSuggestion = cardSuggestions.classList.contains("open") && suggestionCards.length && lastSuggestionQuery === normalizeQuery(name);
  if (canUseSuggestion) {
    selectSuggestedCard(suggestionCards[0]);
    return;
  }

  hideCardSuggestions();
  await searchCard(name);
});

cardInput.addEventListener("input", () => {
  const query = cardInput.value.trim();
  window.clearTimeout(suggestionTimer);

  if (query.length < 2) {
    hideCardSuggestions();
    return;
  }

  suggestionTimer = window.setTimeout(() => fetchCardSuggestions(query), 220);
});

cardInput.addEventListener("focus", () => {
  const query = cardInput.value.trim();
  if (query.length >= 2 && normalizeQuery(query) !== lastSuggestionQuery) {
    fetchCardSuggestions(query);
  } else if (suggestionCards.length) {
    renderCardSuggestions(suggestionCards, query);
  }
});

cardInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideCardSuggestions();
  }
});

cardSuggestions.addEventListener("click", (event) => {
  const option = event.target.closest("[data-card-id]");
  if (!option) return;

  const card = suggestionCards.find((item) => item.id === option.dataset.cardId);
  if (!card) return;
  selectSuggestedCard(card);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#cardForm")) {
    hideCardSuggestions();
  }
});

document.querySelector("#cardResult").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-download-image]");
  if (!button) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Baixando...";

  try {
    await downloadCardImage(button.dataset.downloadImage, button.dataset.downloadName);
    setTransientStatus("Download iniciado");
  } catch {
    triggerDirectDownload(button.dataset.downloadImage, button.dataset.downloadName);
    setTransientStatus("Download iniciado");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

async function fetchCardSuggestions(query) {
  if (suggestionAbortController) {
    suggestionAbortController.abort();
  }

  suggestionAbortController = new AbortController();
  lastSuggestionQuery = normalizeQuery(query);
  suggestionCards = [];
  renderSuggestionNote("Procurando em português e inglês...");

  try {
    const cards = await fetchSuggestionCandidates(query, suggestionAbortController.signal);
    if (lastSuggestionQuery !== normalizeQuery(cardInput.value.trim())) return;

    suggestionCards = rankCardSuggestions(cards, query).slice(0, 12);
    renderCardSuggestions(suggestionCards, query);
  } catch (error) {
    if (error.name === "AbortError") return;
    suggestionCards = [];
    renderSuggestionNote("Não consegui consultar as sugestões agora.");
  }
}

async function fetchSuggestionCandidates(query, signal) {
  const searches = [
    fetchScryfallSearch(buildSearchUrl(`lang:pt ${escapeScryfallLooseQuery(query)}`, true), signal),
    fetchScryfallSearch(buildSearchUrl(`name:"${escapeScryfallQuery(query)}"`, false), signal)
  ];

  const results = await Promise.allSettled(searches);
  const cards = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  return dedupeCards(cards).filter((card) => cardMatchesLookup(card, query));
}

async function fetchScryfallSearch(url, signal) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error("Falha na busca de cartas.");
  const data = await response.json();
  return data.data || [];
}

function buildSearchUrl(query, includeMultilingual) {
  const params = new URLSearchParams({
    q: query,
    unique: "prints",
    order: "released",
    dir: "desc",
    include_extras: "false"
  });

  if (includeMultilingual) {
    params.set("include_multilingual", "true");
  }

  return `https://api.scryfall.com/cards/search?${params.toString()}`;
}
function renderCardSuggestions(cards, query) {
  if (!cards.length) {
    renderSuggestionNote(`Nenhuma versão encontrada para "${query}".`);
    return;
  }

  cardSuggestions.innerHTML = cards
    .map((card) => {
      const image = getCardImage(card, "small") || getCardImage(card, "normal") || "";
      const setCode = (card.set || "").toUpperCase();
      const setLine = formatSuggestionSet(card);
      const releaseYear = card.released_at ? card.released_at.slice(0, 4) : "";
      const rarity = card.rarity ? capitalize(card.rarity) : "";
      const language = formatCardLanguage(card.lang);
      const primaryName = getCardDisplayName(card);
      const secondaryName = getCardSecondaryName(card);
      const nameLine = secondaryName ? `${secondaryName} · ${language}` : language;
      const detailLine = [nameLine, setLine, releaseYear, rarity].filter(Boolean).join(" · ");

      return `
        <button class="card-suggestion" type="button" role="option" aria-selected="false" data-card-id="${escapeHtml(card.id)}">
          ${image ? `<img class="suggestion-thumb" src="${escapeHtml(image)}" alt="" loading="lazy" />` : '<span class="suggestion-thumb suggestion-thumb-empty"></span>'}
          <span class="suggestion-copy">
            <strong>${escapeHtml(primaryName)}</strong>
            <span>${escapeHtml(detailLine || "Edição não identificada")}</span>
          </span>
          <span class="suggestion-code">${escapeHtml(setCode)}</span>
        </button>
      `;
    })
    .join("");

  openCardSuggestions();
}
function renderSuggestionNote(text) {
  cardSuggestions.innerHTML = `<div class="suggestion-note">${escapeHtml(text)}</div>`;
  openCardSuggestions();
}

function selectSuggestedCard(card) {
  cardInput.value = getCardDisplayName(card);
  hideCardSuggestions();
  renderCard(card);
  setTransientStatus("Carta selecionada");
}

function openCardSuggestions() {
  cardSuggestions.classList.add("open");
  cardInput.setAttribute("aria-expanded", "true");
}

function hideCardSuggestions() {
  window.clearTimeout(suggestionTimer);
  if (suggestionAbortController) {
    suggestionAbortController.abort();
    suggestionAbortController = null;
  }
  cardSuggestions.classList.remove("open");
  cardSuggestions.innerHTML = "";
  suggestionCards = [];
  cardInput.setAttribute("aria-expanded", "false");
}

function formatSuggestionSet(card) {
  const setName = card.set_name || "Coleção desconhecida";
  const collector = card.collector_number ? `#${card.collector_number}` : "";
  return [setName, collector].filter(Boolean).join(" ");
}

function dedupeCards(cards) {
  const seen = new Set();
  return cards.filter((card) => {
    if (!card?.id || seen.has(card.id)) return false;
    seen.add(card.id);
    return true;
  });
}

function rankCardSuggestions(cards, query) {
  return [...cards].sort((a, b) => {
    const scoreA = getCardMatchScore(a, query);
    const scoreB = getCardMatchScore(b, query);
    if (scoreA !== scoreB) return scoreA - scoreB;
    return (b.released_at || "").localeCompare(a.released_at || "");
  });
}

function getCardMatchScore(card, query) {
  const normalizedQuery = normalizeLookupText(query);
  const printedNames = getPrintedLookupNames(card);
  const englishNames = getEnglishLookupNames(card);
  const allNames = [...printedNames, ...englishNames];
  const best = Math.min(...allNames.map((name) => getTextMatchScore(name, normalizedQuery)), 99);
  let score = best;

  if (printedNames.some((name) => getTextMatchScore(name, normalizedQuery) <= best) && card.lang === "pt") {
    score -= 0.35;
  }

  if (englishNames.some((name) => getTextMatchScore(name, normalizedQuery) <= best) && card.lang === "en") {
    score -= 0.25;
  }

  if (card.image_status === "placeholder") {
    score += 0.5;
  }

  return score;
}

function getTextMatchScore(value, normalizedQuery) {
  const normalizedValue = normalizeLookupText(value);
  if (!normalizedValue || !normalizedQuery) return 99;
  if (normalizedValue === normalizedQuery) return 0;
  if (normalizedValue.startsWith(normalizedQuery)) return 1;
  if (normalizedValue.includes(normalizedQuery)) return 2;
  return 99;
}

function cardMatchesLookup(card, query) {
  const normalizedQuery = normalizeLookupText(query);
  return getLookupNames(card).some((name) => normalizeLookupText(name).includes(normalizedQuery));
}

function getLookupNames(card) {
  return [...getPrintedLookupNames(card), ...getEnglishLookupNames(card)];
}

function getPrintedLookupNames(card) {
  return [
    card.printed_name,
    ...(card.card_faces || []).map((face) => face.printed_name)
  ].filter(Boolean);
}

function getEnglishLookupNames(card) {
  return [
    card.name,
    ...(card.card_faces || []).map((face) => face.name)
  ].filter(Boolean);
}

function getCardDisplayName(card) {
  return card.printed_name || card.card_faces?.[0]?.printed_name || card.name;
}

function getCardSecondaryName(card) {
  const displayName = getCardDisplayName(card);
  return displayName !== card.name ? card.name : "";
}

function getCardRulesText(card) {
  if (card.printed_text || card.oracle_text) {
    return card.printed_text || card.oracle_text;
  }

  return card.card_faces?.map((face) => {
    const faceName = face.printed_name || face.name;
    const faceText = face.printed_text || face.oracle_text || "";
    return `${faceName}\n${faceText}`.trim();
  }).join("\n\n") || "Sem texto Oracle.";
}

function formatCardLanguage(lang) {
  const labels = { en: "EN", pt: "PT" };
  return labels[lang] || (lang ? lang.toUpperCase() : "EN");
}

function normalizeQuery(value) {
  return value.trim().toLowerCase();
}

function normalizeLookupText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeScryfallQuery(value) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeScryfallLooseQuery(value) {
  return value.replace(/[(){}\[\]^~*?:\\]/g, " ").replace(/"/g, " ").trim();
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

async function searchCard(name) {
  const result = document.querySelector("#cardResult");
  result.innerHTML = '<div class="empty-state">Buscando...</div>';

  try {
    const exactPortugueseCard = await fetchExactPortugueseCard(name);
    if (exactPortugueseCard) {
      renderCard(exactPortugueseCard);
      return;
    }

    try {
      const card = await fetchNamedCard(name);
      renderCard(card);
      return;
    } catch {
      const candidates = await fetchSuggestionCandidates(name, undefined);
      const [card] = rankCardSuggestions(candidates, name);
      if (!card) throw new Error("Carta não encontrada.");
      renderCard(card);
    }
  } catch (error) {
    result.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`;
  }
}

async function fetchExactPortugueseCard(name) {
  try {
    const cards = await fetchScryfallSearch(buildSearchUrl(`lang:pt !"${escapeScryfallQuery(name)}"`, true), undefined);
    const normalizedName = normalizeLookupText(name);
    return cards.find((card) => normalizeLookupText(card.printed_name || "") === normalizedName) || null;
  } catch {
    return null;
  }
}

async function fetchNamedCard(name) {
  const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Carta não encontrada.");
  return response.json();
}
function renderCard(card) {
  const displayImage = getCardImage(card, "large") || getCardImage(card, "normal") || "";
  const rulesText = getCardRulesText(card);
  const typeLine = card.printed_type_line || card.type_line || "";
  const legality = card.legalities?.commander || "unknown";
  const displayName = getCardDisplayName(card);
  const secondaryName = getCardSecondaryName(card);
  const language = formatCardLanguage(card.lang);
  const ligaSearch = `https://www.ligamagic.com.br/?view=cards/search&card=${encodeURIComponent(displayName)}`;
  const downloads = getCardDownloads(card);
  const setDescription = [card.set_name, card.set ? card.set.toUpperCase() : "", card.collector_number ? `#${card.collector_number}` : ""].filter(Boolean).join(" · ");

  document.querySelector("#cardResult").innerHTML = `
    <div class="card-display">
      ${displayImage ? `<img class="card-image" src="${displayImage}" alt="${escapeHtml(displayName)}" />` : ""}
      <article class="card-info">
        <h3>${escapeHtml(displayName)}</h3>
        ${secondaryName ? `<p class="card-subtitle">${escapeHtml(secondaryName)} · ${escapeHtml(language)}</p>` : `<p class="card-subtitle">${escapeHtml(language)}</p>`}
        <div class="download-panel">
          <strong>Imagem para vídeo</strong>
          <span>PNG em alta resolução. O arquivo vai para a pasta padrão de downloads do navegador.</span>
          <div class="download-actions">
            ${downloads.map((item) => `
              <button class="download-card-button" type="button" data-download-image="${escapeHtml(item.url)}" data-download-name="${escapeHtml(item.fileName)}">
                ${escapeHtml(item.label)}
              </button>
            `).join("")}
          </div>
        </div>
        <dl>
          <dt>Custo</dt>
          <dd>${escapeHtml(card.mana_cost || "Sem custo")}</dd>
          <dt>Tipo</dt>
          <dd>${escapeHtml(typeLine)}</dd>
          <dt>Edição</dt>
          <dd>${escapeHtml(setDescription || "N/D")}</dd>
          <dt>Lançamento</dt>
          <dd>${escapeHtml(card.released_at || "N/D")}</dd>
          <dt>Texto</dt>
          <dd>${escapeHtml(rulesText).replace(/\n/g, "<br>")}</dd>
          <dt>Commander</dt>
          <dd>${escapeHtml(legality)}</dd>
          <dt>Preço USD</dt>
          <dd>${escapeHtml(card.prices?.usd || card.prices?.usd_foil || "N/D")}</dd>
        </dl>
        <div class="link-row">
          <a href="${card.scryfall_uri}" target="_blank" rel="noreferrer">Scryfall</a>
          <a href="${ligaSearch}" target="_blank" rel="noreferrer">LigaMagic</a>
          <a href="https://edhrec.com/cards/${slugify(card.name)}" target="_blank" rel="noreferrer">EDHREC</a>
        </div>
      </article>
    </div>
  `;
}
function getCardImage(card, size) {
  return card.image_uris?.[size] || card.card_faces?.[0]?.image_uris?.[size] || "";
}

function getCardDownloads(card) {
  const baseName = buildCardFileBase(card);

  if (card.image_uris?.png) {
    return [{
      label: "Baixar PNG alta",
      url: card.image_uris.png,
      fileName: `${baseName}.png`
    }];
  }

  return (card.card_faces || [])
    .filter((face) => face.image_uris?.png)
    .map((face, index) => ({
      label: index === 0 ? "Baixar frente PNG" : "Baixar verso PNG",
      url: face.image_uris.png,
      fileName: `${baseName}-${index + 1}-${sanitizeFileName(face.name)}.png`
    }));
}

function buildCardFileBase(card) {
  const printCode = [card.set, card.collector_number].filter(Boolean).join("-");
  const displayName = getCardDisplayName(card);
  return sanitizeFileName(printCode ? `${displayName}-${printCode}` : displayName);
}

async function downloadCardImage(url, fileName) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Não consegui baixar a imagem.");

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerDirectDownload(objectUrl, fileName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function triggerDirectDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sanitizeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

document.querySelector("#loadSampleDeck").addEventListener("click", () => {
  document.querySelector("#deckInput").value = `1 Alela, Artful Provocateur
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Path to Exile
1 Swords to Plowshares
1 Counterspell
1 Rhystic Study
1 Smothering Tithe
1 Bitterblossom
1 Ghostly Prison
1 Watery Grave
1 Hallowed Fountain
1 Godless Shrine
1 Island
1 Plains
1 Swamp`;
});

document.querySelector("#deckForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const deckText = document.querySelector("#deckInput").value;
  const lines = parseDecklist(deckText);
  if (!lines.length) {
    document.querySelector("#deckOutput").innerHTML = '<p class="error-text">Cole uma lista válida.</p>';
    return;
  }

  if (!hasFeature("decks")) {
    renderDeckLockedOutput();
    openAuthModal();
    return;
  }

  if (authState.offline) await analyzeDeck(lines);
  else await analyzeDeckWithApi(deckText);
});

function parseDecklist(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("//") && !line.startsWith("#"))
    .map((line) => line.replace(/^(\d+)\s*x?\s+/i, "").replace(/\s+\(.+\)\s*\d*$/g, "").trim())
    .filter((line) => line && !["commander", "deck", "sideboard", "maybeboard"].includes(line.toLowerCase()));
}

async function analyzeDeck(names) {
  const output = document.querySelector("#deckOutput");
  output.innerHTML = "<p>Consultando cartas...</p>";

  try {
    const cards = await fetchCardsByName(names);
    const total = names.length;
    const found = cards.length;
    const colors = summarizeColors(cards);
    const types = summarizeTypes(cards);
    const curve = summarizeCurve(cards);
    const roles = summarizeRoles(cards);

    output.innerHTML = `
      <h3>Resumo</h3>
      <dl class="deck-stats">
        <dt>Total</dt><dd>${total} cartas na lista, ${found} encontradas no Scryfall</dd>
        <dt>Cores</dt><dd>${colors || "Incolor / não identificado"}</dd>
        <dt>Tipos</dt><dd>${formatObject(types)}</dd>
        <dt>Funções</dt><dd>${formatObject(roles)}</dd>
      </dl>
      <h3>Curva de mana</h3>
      <div class="deck-bars">${renderCurveBars(curve)}</div>
    `;
  } catch (error) {
    output.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

async function fetchCardsByName(names) {
  const uniqueNames = [...new Set(names)];
  const chunks = [];
  for (let i = 0; i < uniqueNames.length; i += 75) {
    chunks.push(uniqueNames.slice(i, i + 75));
  }

  const allCards = [];
  for (const chunk of chunks) {
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        identifiers: chunk.map((name) => ({ name }))
      })
    });

    if (!response.ok) throw new Error("Não consegui consultar a lista no Scryfall.");
    const data = await response.json();
    allCards.push(...(data.data || []));
  }
  return allCards;
}

function summarizeColors(cards) {
  const order = ["W", "U", "B", "R", "G"];
  const names = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };
  const found = new Set();
  cards.forEach((card) => (card.color_identity || []).forEach((color) => found.add(color)));
  return order.filter((color) => found.has(color)).map((color) => names[color]).join(", ");
}

function summarizeTypes(cards) {
  return cards.reduce((acc, card) => {
    const type = card.type_line || "";
    if (type.includes("Land")) acc.Terrenos += 1;
    else if (type.includes("Creature")) acc.Criaturas += 1;
    else if (type.includes("Artifact")) acc.Artefatos += 1;
    else if (type.includes("Enchantment")) acc.Encantamentos += 1;
    else if (type.includes("Instant")) acc.Instantaneas += 1;
    else if (type.includes("Sorcery")) acc.Feiticos += 1;
    else if (type.includes("Planeswalker")) acc.Planeswalkers += 1;
    return acc;
  }, { Terrenos: 0, Criaturas: 0, Artefatos: 0, Encantamentos: 0, Instantaneas: 0, Feiticos: 0, Planeswalkers: 0 });
}

function summarizeCurve(cards) {
  return cards.reduce((acc, card) => {
    if ((card.type_line || "").includes("Land")) return acc;
    const cmc = Math.min(Math.floor(card.cmc || 0), 7);
    acc[cmc] = (acc[cmc] || 0) + 1;
    return acc;
  }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
}

function summarizeRoles(cards) {
  const roles = { Ramp: 0, Compra: 0, Remocao: 0, Protecao: 0, Recursao: 0 };
  cards.forEach((card) => {
    const text = `${card.oracle_text || ""} ${card.type_line || ""}`.toLowerCase();
    if (text.includes("add ") || card.name.toLowerCase().includes("signet") || card.name.toLowerCase().includes("sol ring")) roles.Ramp += 1;
    if (text.includes("draw") || text.includes("investigate")) roles.Compra += 1;
    if (text.includes("destroy") || text.includes("exile") || text.includes("counter target")) roles.Remocao += 1;
    if (text.includes("hexproof") || text.includes("indestructible") || text.includes("protection")) roles.Protecao += 1;
    if (text.includes("return target") || text.includes("graveyard")) roles.Recursao += 1;
  });
  return roles;
}

function renderCurveBars(curve) {
  const max = Math.max(...Object.values(curve), 1);
  return Object.entries(curve)
    .map(([cost, count]) => {
      const label = cost === "7" ? "7+" : cost;
      return `
        <div class="bar-row">
          <span>CMC ${label}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
}

function formatObject(object) {
  return Object.entries(object)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") || "Nada destacado";
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function initVisualEffects() {
  const root = document.querySelector("[data-parallax-root]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!root || prefersReducedMotion) return;

  window.addEventListener("pointermove", (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;

    root.querySelectorAll("[data-parallax]").forEach((element) => {
      const strength = Number(element.dataset.parallax || 8);
      element.style.setProperty("--px", `${x * strength}px`);
      element.style.setProperty("--py", `${y * strength}px`);
    });
  }, { passive: true });
}

renderMetrics();
renderTopics();
initVisualEffects();
initAuth();
