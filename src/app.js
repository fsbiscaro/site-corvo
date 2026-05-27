const STORAGE_KEY = "grimorio-corvo-state-v1";
const AUTH_GATE_KEY = "grimorio-corvo-auth-gate";
const APP_BUILD_VERSION = "2026-05-26.3";

const defaultTopics = [
  { id: crypto.randomUUID(), title: "Upgrade de precon por até R$50", series: "Commander barato", status: "pending" },
  { id: crypto.randomUUID(), title: "Cartas que parecem ruins até ganharem a mesa", series: "Carta esquecida", status: "pending" },
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
const viewFeatures = { temas: "temas", cartas: "card_search", usuarios: "admin" };
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

function isAdminUser() {
  return authState.isAuthenticated && authState.user?.role === "admin" && hasFeature("admin");
}

function isCommonUser() {
  return authState.isAuthenticated && !authState.offline && !isAdminUser() && hasFeature("decks");
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
    const allowed = feature === "admin" ? isAdminUser() : !feature || hasFeature(feature);
    element.hidden = !allowed;
    element.toggleAttribute("aria-hidden", !allowed);
  });

  applyRolePresentation();

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

function applyRolePresentation() {
  const mode = isAdminUser() ? "admin" : isCommonUser() ? "member" : "guest";
  document.body.dataset.accountMode = mode;

  document.querySelectorAll("[data-member-only]").forEach((element) => {
    const allowed = mode === "member";
    element.hidden = !allowed;
    element.toggleAttribute("aria-hidden", !allowed);
  });

  const intro = document.querySelector("#dashboardIntro");
  if (intro) {
    intro.textContent = mode === "member"
      ? `Olá, ${getUserFirstName()}. Seu grimório de análise está aberto: toque no livro, cole sua lista e receba uma leitura clara para ajustar curva, base de mana, funções e próximos upgrades.`
      : "Temas, cartas e decks reunidos num só lugar para transformar uma ideia solta em vídeo pronto.";
  }

  const deckTitle = document.querySelector("#deckTileTitle");
  const deckText = document.querySelector("#deckTileText");
  if (deckTitle) deckTitle.textContent = mode === "member" ? "Analise seu deck aqui" : "Decks";
  if (deckText) deckText.textContent = mode === "member" ? "cole sua lista e receba a leitura do Corvo" : "curva, cores, funções";
}

function getUserFirstName() {
  const rawName = authState.user?.displayName || authState.user?.email || "mago";
  const cleanName = String(rawName).split("@")[0].trim();
  return cleanName.split(/\s+/)[0] || "mago";
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
    if (!contentType.includes("application/json")) throw new Error("API indisponível");
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
    setAuthFeedback("Entre para acessar o Grimório.", "error");
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
  setAuthFeedback("Abrindo o grimório...", "ok");
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
    if (!response.ok) throw new Error(payload.error || "Não foi possível entrar.");
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
    form.querySelectorAll("textarea, input, select, button[type='submit']").forEach((field) => {
      field.disabled = !canUseDeck;
    });
  }
  if (chip) {
    chip.textContent = canUseDeck ? "Acesso liberado" : "Acesso de membro";
    chip.classList.toggle("is-open", canUseDeck);
  }
  updateDeckAnalyzeButton();
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

async function analyzeDeckWithApi({ decklist, format, commander, aiMode = "standard", submitButton }) {
  const output = document.querySelector("#deckOutput");
  const useAi = aiMode !== "local";
  const loadingMessages = [
    "Lendo lista...",
    "Cruzando com database local...",
    "Calculando estatísticas...",
    "Gerando diagnóstico...",
    useAi ? "Gerando análise do Corvo..." : "Preparando leitura local..."
  ];
  let loadingIndex = 0;
  output.innerHTML = `<p>${loadingMessages[loadingIndex]}</p>`;
  const loadingTimer = window.setInterval(() => {
    loadingIndex = Math.min(loadingIndex + 1, loadingMessages.length - 1);
    output.innerHTML = `<p>${loadingMessages[loadingIndex]}</p>`;
  }, 850);
  if (submitButton) submitButton.disabled = true;

  try {
    const resolveResponse = await fetch(`${API_BASE}/decks/resolve?build=${encodeURIComponent(APP_BUILD_VERSION)}&t=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "X-Corvo-Build": APP_BUILD_VERSION
      },
      body: JSON.stringify({ deck_text: decklist, format, commander })
    });
    const resolveText = await resolveResponse.text();
    const resolvePayload = parseApiResponse(resolveText);
    if (resolveResponse.status === 401) {
      renderDeckLockedOutput();
      openAuthModal();
      return;
    }
    if (!resolveResponse.ok) {
      output.innerHTML = renderDeckApiReport(normalizeFailedApiReport(resolvePayload, resolveResponse.status, resolveText));
      return;
    }

    output.innerHTML = `<p>${useAi ? "Deck resolvido. Chamando análise do Corvo..." : "Deck resolvido. Calculando leitura técnica..."}</p>`;

    const response = await fetch(`${API_BASE}/decks/analyze-resolved?build=${encodeURIComponent(APP_BUILD_VERSION)}&t=${Date.now()}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        "X-Corvo-Build": APP_BUILD_VERSION
      },
      body: JSON.stringify({
        deck_text: decklist,
        format,
        commander,
        use_ai: useAi,
        ai_mode: aiMode,
        resolvedDeck: resolvePayload.resolvedDeck
      })
    });
    const responseText = await response.text();
    const report = parseApiResponse(responseText);
    if (response.status === 401) {
      renderDeckLockedOutput();
      openAuthModal();
      return;
    }
    if (!response.ok) {
      output.innerHTML = renderDeckApiReport(normalizeFailedApiReport(report, response.status, responseText));
      return;
    }
    output.innerHTML = renderDeckApiReport(report);
  } catch (error) {
    output.innerHTML = renderDeckFatalError(error.message);
  } finally {
    window.clearInterval(loadingTimer);
    if (submitButton) submitButton.disabled = false;
    updateDeckAnalyzeButton();
  }
}

function normalizeFailedApiReport(report, status, responseText) {
  const normalized = report && typeof report === "object" ? { ...report } : {};
  const existingErrors = Array.isArray(normalized.errors) ? normalized.errors : [];
  const message = formatApiError(normalized) || normalized.error || normalized.message || "A API recusou a análise antes de devolver um relatório completo.";

  return {
    ...normalized,
    status: "error",
    errors: existingErrors.length ? existingErrors : [{
      code: `HTTP_${status}`,
      severity: "critical",
      message,
      evidence: normalized.detail || String(responseText || "").slice(0, 220) || `Resposta HTTP ${status}.`,
      suggestion: "Tente novamente. Se repetir, essa mensagem agora mostra o ponto exato para corrigirmos."
    }]
  };
}

function parseApiResponse(text) {
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {
      status: "error",
      errors: [{
        message: "A resposta do servidor veio em um formato inesperado.",
        evidence: String(text || "").slice(0, 180),
        suggestion: "Tente novamente em alguns instantes."
      }]
    };
  }
}

function renderDeckApiReport(report) {
  const verdict = report.verdict || {};
  if (report.status === "error") {
    return `
      ${renderDeckErrorSummary(report)}
      ${renderDeckMessages(report.errors || [], "error")}
      ${renderDeckMessages(report.warnings || [], "warning")}
      ${renderTechnicalPanel(report)}
      ${report.corvoReview ? renderCorvoReview(report.corvoReview, false, report) : ""}
    `;
  }

  return `
    ${renderDeckMessages(report.errors || [], "error")}
    ${renderDeckMessages(report.warnings || [], "warning")}
    ${report.aiError ? `<div class="deck-message is-warning"><p>${escapeHtml(report.aiError)}</p></div>` : ""}
    ${verdict.title ? `
      <section class="deck-verdict">
        <div>
          <span>Diagnóstico Corvo</span>
          <strong>${escapeHtml(verdict.title)}</strong>
        </div>
        <b>${escapeHtml(verdict.score ?? "-")}/10</b>
        <p>${escapeHtml(verdict.subtitle || "")}</p>
      </section>
    ` : ""}
    ${renderAiStatus(report)}
    ${renderTechnicalPanel(report)}
    ${renderCorvoReview(report.aiAnalysis || report.corvoReview, Boolean(report.aiAnalysis), report)}
  `;
}

function renderDeckErrorSummary(report) {
  const firstError = Array.isArray(report.errors) ? report.errors[0] : null;
  const title = firstError?.code === "COMMANDER_COLOR_IDENTITY_MISMATCH"
    ? "Comandante incompatível"
    : "Análise bloqueada";
  const message = firstError?.message || report.error || "O Corvo encontrou um bloqueio antes de analisar o deck.";

  return `
    <section class="deck-section deck-error-summary">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
      ${firstError?.evidence ? `<p><strong>Evidência:</strong> ${escapeHtml(firstError.evidence)}</p>` : ""}
      ${firstError?.suggestion ? `<p><strong>Como resolver:</strong> ${escapeHtml(firstError.suggestion)}</p>` : ""}
    </section>
  `;
}

function renderDeckFatalError(message) {
  return `
    <section class="deck-section deck-error-summary">
      <h3>Não foi possível analisar agora</h3>
      <p>${escapeHtml(message || "A conexão com o grimório falhou antes da resposta chegar.")}</p>
      <p>O botão foi liberado. Tente novamente ou rode a leitura local se a IA demorar.</p>
    </section>
  `;
}

function renderTechnicalPanel(report) {
  const renderData = report.renderData || {};
  return `
    <section class="deck-section technical-panel">
      <h3>Painel técnico</h3>
      ${renderMetricSection("Resumo geral", renderData.summary)}
      ${renderCurvePanel(report)}
      ${renderMetricSection("Estrutura", renderData.structure)}
      ${renderMetricSection("Mana e aceleração", renderData.mana)}
      ${renderMetricSection("Categorias funcionais", renderData.categories)}
      ${renderMetricSection("Produção de mana", renderData.manaProduction)}
      ${renderMetricSection("Demanda de mana", renderData.manaDemand)}
      ${renderMetricSection("Probabilidade", renderData.probability)}
      ${renderMetricSection("Cartas pendentes de reconhecimento", renderData.catalogQuality)}
      ${renderPackagePanel(renderData.packages || [])}
      ${renderDeckScores(report.scores || [])}
      ${renderScoringState(report.scoring)}
    </section>
  `;
}

function renderAiStatus(report) {
  if (!report.aiStatus && !report.scoring) return "";
  const status = report.aiStatus || {};
  const scoring = report.scoring || {};
  return `
    <section class="deck-section ai-status-panel">
      <h3>Status da análise</h3>
      <dl class="deck-stats">
        <dt>Versão</dt><dd>${escapeHtml(report.buildVersion || APP_BUILD_VERSION)}</dd>
        <dt>IA premium</dt><dd>${escapeHtml(formatPremiumStatus(status.status || "not_requested"))}</dd>
        <dt>Modo</dt><dd>${escapeHtml(status.mode || "-")}</dd>
        <dt>Nota técnica local</dt><dd>${escapeHtml(scoring.localTechnicalScore ?? report.score?.final ?? "-")}/10</dd>
        <dt>Confiança</dt><dd>${escapeHtml(scoring.analysisConfidence || report.strategy?.confidenceLevel || "-")}</dd>
        <dt>Nota premium</dt><dd>${escapeHtml(scoring.finalPremiumScore ?? "-")}${scoring.finalPremiumScore !== null && scoring.finalPremiumScore !== undefined ? "/10" : ""}</dd>
      </dl>
      ${status.message ? `<p>${escapeHtml(status.message)}</p>` : ""}
      ${scoring.finalPremiumMessage ? `<p>${escapeHtml(scoring.finalPremiumMessage)}</p>` : ""}
    </section>
  `;
}

function renderScoringState(scoring) {
  if (!scoring) return "";
  return `
    <h3>Nota local e premium</h3>
    <dl class="deck-stats">
      <dt>Nota técnica local</dt><dd>${escapeHtml(scoring.localTechnicalScore ?? "-")}/10</dd>
      <dt>Teto técnico local</dt><dd>${escapeHtml(scoring.localTechnicalMaxScore ?? "-")}/10</dd>
      <dt>Confiança da leitura</dt><dd>${escapeHtml(scoring.analysisConfidence || "-")}</dd>
      <dt>Status premium</dt><dd>${escapeHtml(formatPremiumStatus(scoring.premiumStatus || "-"))}</dd>
      <dt>Nota premium final</dt><dd>${escapeHtml(scoring.finalPremiumScore ?? "-")}${scoring.finalPremiumScore !== null && scoring.finalPremiumScore !== undefined ? "/10" : ""}</dd>
    </dl>
    ${Array.isArray(scoring.localTechnicalReasons) && scoring.localTechnicalReasons.length ? renderDeckList("Limites da nota técnica", scoring.localTechnicalReasons) : ""}
  `;
}

function formatPremiumStatus(status) {
  return ({
    complete: "completa",
    failed: "falhou",
    unavailable: "indisponível",
    not_requested: "não solicitada",
    partial: "parcial",
    error: "erro"
  })[status] || status || "-";
}

function renderCurvePanel(report) {
  return `
    <h3>Curva de mana</h3>
    <div class="deck-bars">${renderCurveBars(report.curve || report.manaCurve || {})}</div>
    ${renderCurveMiniGrid(report.statistics?.manaCurveByColor || {}, "Curva por cor")}
    ${renderCurveMiniGrid(report.statistics?.manaCurveByType || {}, "Curva por tipo")}
  `;
}

function renderCurveMiniGrid(curves, title) {
  const entries = Object.entries(curves || {}).filter(([, curve]) => Object.values(curve || {}).some((value) => Number(value) > 0));
  if (!entries.length) return "";
  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="curve-mini-grid">
      ${entries.slice(0, 8).map(([label, curve]) => `
        <article>
          <strong>${escapeHtml(formatCurveLabel(label))}</strong>
          <div class="mini-bars">${Object.entries(curve).map(([bucket, value]) => `<span style="height:${Math.max(8, Number(value || 0) * 6)}px" title="${escapeHtml(bucket)}: ${escapeHtml(value)}"></span>`).join("")}</div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderPackagePanel(packages) {
  if (!packages.length) return "";
  return `
    <h3>Pacotes do deck</h3>
    <div class="package-grid">
      ${packages.map((item) => `
        <article class="package-card ${escapeHtml(item.status || "")}">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
          <p>${escapeHtml(item.interpretation || "")}</p>
          <em>${escapeHtml(item.action || "")}</em>
        </article>
      `).join("")}
    </div>
  `;
}

function renderCorvoReview(review, isAi, report) {
  if (!review) {
    return `
      <section class="deck-section corvo-review">
        <h3>Análise do Corvo</h3>
        <p>A leitura humana aparece aqui quando o painel técnico terminar.</p>
      </section>
    `;
  }

  return `
    <section class="deck-section corvo-review">
      <h3>${isAi ? "Análise do Corvo" : "Análise local do Corvo"}</h3>
      ${isAi ? `<p class="deck-fallback-note">IA ${escapeHtml(report.aiMode || "STANDARD_AI")}${report.aiCached ? " · resposta em cache" : ""}</p>` : ""}
      <blockquote class="corvo-note">${escapeHtml(review.summary || report.corvoNote || "O grimório terminou a leitura.")}</blockquote>
      ${renderReviewParagraph("O que o comandante quer", review.commanderUnderstanding)}
      ${renderReviewParagraph("Plano A", review.planA)}
      ${renderReviewParagraph("Plano B", review.planB)}
      ${renderReviewParagraph("Como ganha", review.howItWins)}
      ${renderReviewParagraph("Base de mana", review.manaBase || review.manaBaseReview)}
      ${renderReviewParagraph("Curva", review.curve || review.curveReview)}
      ${renderReviewParagraph("Ramp", review.ramp || review.rampReview)}
      ${renderReviewParagraph("Compra", review.draw || review.cardAdvantageReview)}
      ${renderReviewParagraph("Interação", review.interaction || review.interactionReview)}
      ${renderReviewParagraph("Proteção", review.protection || review.protectionReview)}
      ${renderReviewParagraph("Dependência do comandante", review.commanderDependency)}
      ${renderReviewCardList("Cartas-chave", review.keyCards)}
      ${renderReviewCardList("Motores", review.engines)}
      ${renderReviewCardList("Payoffs", review.payoffs)}
      ${renderReviewCardList("Cartas núcleo", review.coreCards)}
      ${renderReviewCardList("Slots flexíveis", review.flexCards)}
      ${renderReviewCardList("Cartas suspeitas", review.suspiciousCards)}
      ${renderReviewCardList("Possíveis cortes", review.suggestedCuts || review.cutCandidates)}
      ${renderReviewCardList("Sugestões de adição", review.suggestedAdds)}
      ${renderDeckList("Pontos fortes", review.strengths)}
      ${renderDeckList("Pontos fracos", review.weaknesses)}
      ${renderDeckList("Prioridades de upgrade", review.upgradePriorities)}
      ${renderMulligan(review.mulligan || review.mulliganGuide)}
      ${renderMatchups(review.matchups)}
      ${renderDeckList("Plano de teste", review.testingPlan)}
      ${renderReviewParagraph("Veredito", review.finalVerdict)}
      ${review.score ? `<p class="deck-fallback-note">Nota explicada: ${escapeHtml(review.score.value ?? "-")}/10 · ${escapeHtml(review.score.explanation || "")}</p>` : ""}
    </section>
  `;
}

function renderReviewParagraph(title, value) {
  if (!value || (Array.isArray(value) && !value.length)) return "";
  const content = Array.isArray(value) ? value.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : escapeHtml(value);
  return Array.isArray(value)
    ? `<h3>${escapeHtml(title)}</h3><ul class="deck-advice">${content}</ul>`
    : `<h3>${escapeHtml(title)}</h3><p>${content}</p>`;
}

function renderReviewCardList(title, cards) {
  if (!Array.isArray(cards) || !cards.length) return "";
  return `
    <h3>${escapeHtml(title)}</h3>
    <div class="review-card-list">
      ${cards.slice(0, 10).map((card) => `
        <article>
          <strong>${escapeHtml(card.name || card.title || card.card || card)}</strong>
          ${card.reason || card.explanation ? `<span>${escapeHtml(card.reason || card.explanation)}</span>` : ""}
        </article>
      `).join("")}
    </div>
  `;
}

function renderMulligan(mulligan) {
  if (!mulligan) return "";
  return `
    <h3>Guia de mulligan</h3>
    <div class="mulligan-grid">
      ${renderDeckList("Manter", mulligan.keep)}
      ${renderDeckList("Mulligar", mulligan.mulligan)}
    </div>
  `;
}

function renderMatchups(matchups) {
  if (!matchups) return "";
  return `
    <h3>Matchups</h3>
    <div class="mulligan-grid">
      ${renderDeckList("Vai melhor contra", matchups.goodAgainst)}
      ${renderDeckList("Sofre contra", matchups.badAgainst)}
    </div>
  `;
}

function formatCurveLabel(label) {
  return ({ W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde", C: "Incolor" })[label] || label;
}

function renderDeckMessages(items, tone) {
  if (!Array.isArray(items) || !items.length) return "";
  const className = tone === "error" ? "deck-message is-error" : "deck-message is-warning";
  return `
    <div class="${className}">
      ${items.map((item) => `<p>${escapeHtml(formatApiMessage(item))}</p>`).join("")}
    </div>
  `;
}

function formatApiMessage(item) {
  if (!item || typeof item !== "object") return String(item || "");
  const parts = [];
  if (item.code) parts.push(`[${item.code}]`);
  if (item.message || item.error) parts.push(item.message || item.error);
  if (item.evidence) parts.push(`Evidência: ${item.evidence}`);
  if (item.suggestion) parts.push(`Como resolver: ${item.suggestion}`);
  return parts.filter(Boolean).join(" ");
}

function formatApiError(report) {
  if (!report || typeof report !== "object") return "";
  if (Array.isArray(report.errors) && report.errors.length) return formatApiMessage(report.errors[0]);
  return report.error || report.message || "";
}

function renderDeckScores(scores) {
  if (!scores.length) return "";
  return `
    <h3>Método Corvo</h3>
    <div class="deck-score-grid">
      ${scores.map((item) => `
        <article class="deck-score-card ${escapeHtml(item.status || "")}">
          <strong>${escapeHtml(item.label || "Pilar")}</strong>
          <span>${escapeHtml(item.score ?? "-")}/10</span>
          <em>${escapeHtml(item.note || "")}</em>
        </article>
      `).join("")}
    </div>
  `;
}

function renderScoreOverview(score) {
  if (!score || score.final === undefined || score.final === null) return "";
  return `
    <h3>Notas técnicas</h3>
    <dl class="deck-stats">
      <dt>Nota final</dt><dd>${escapeHtml(score.final)}/10</dd>
      <dt>Estrutura</dt><dd>${escapeHtml(score.structure ?? "-")}/10</dd>
      <dt>Estratégia</dt><dd>${escapeHtml(score.strategy ?? "-")}/10</dd>
      <dt>Consistência</dt><dd>${escapeHtml(score.consistency ?? "-")}/10</dd>
      <dt>Interação</dt><dd>${escapeHtml(score.interaction ?? "-")}/10</dd>
      <dt>Mana</dt><dd>${escapeHtml(score.mana ?? "-")}/10</dd>
      <dt>Sinergia com comandante</dt><dd>${escapeHtml(score.commanderSynergy ?? "-")}/10</dd>
      <dt>Teto atual</dt><dd>${escapeHtml(score.maxScore ?? "-")}/10${Array.isArray(score.limitReasons) && score.limitReasons.length ? ` · ${escapeHtml(score.limitReasons.join(" · "))}` : ""}</dd>
    </dl>
  `;
}

function renderMetricSection(title, items, fallbackText = "") {
  if ((!Array.isArray(items) || !items.length) && !fallbackText) return "";
  return `
    <h3>${escapeHtml(title)}</h3>
    <dl class="deck-stats">
      ${Array.isArray(items) ? items.map((item) => `
        <dt>${escapeHtml(item.label || "")}</dt><dd>${escapeHtml(item.value ?? "-")}</dd>
      `).join("") : ""}
      ${!items?.length && fallbackText ? `<dt>Resumo</dt><dd>${escapeHtml(fallbackText)}</dd>` : ""}
    </dl>
  `;
}

function renderWincons(winconSummary) {
  const items = winconSummary?.primaryWincons || [];
  if (!items.length) return "";
  return `
    <h3>Condições de vitória</h3>
    <ul class="deck-advice">
      ${items.map((item) => `<li>${escapeHtml(item.label)} (${escapeHtml(item.confidence)}) · ${escapeHtml((item.evidence || []).join(" · "))}</li>`).join("")}
    </ul>
  `;
}

function renderArchetypeEvidence(archetype) {
  if (!archetype) return "";
  return `
    <h3>Leitura do arquétipo</h3>
    <ul class="deck-advice">
      <li>${escapeHtml(`Principal: ${archetype.primary} · confiança ${archetype.confidence ?? "-"}`)}</li>
      ${(archetype.evidence || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      ${(archetype.rejectedArchetypes || []).map((item) => `<li>${escapeHtml(`Descartado: ${item.name} — ${item.reason}`)}</li>`).join("")}
    </ul>
  `;
}

function renderDeckList(title, items) {
  if (!Array.isArray(items) || !items.length) return "";
  return `
    <h3>${escapeHtml(title)}</h3>
    <ul class="deck-advice">${items.map((item) => `<li>${escapeHtml(formatListItem(item))}</li>`).join("")}</ul>
  `;
}

function formatListItem(item) {
  if (!item || typeof item !== "object") return item;
  if (item.name && item.reason) return `${item.name}: ${item.reason}`;
  if (item.name && item.explanation) return `${item.name}: ${item.explanation}`;
  if (item.title && item.items) return `${item.title}: ${[].concat(item.items).join("; ")}`;
  if (item.label && item.value) return `${item.label}: ${item.value}`;
  return item.name || item.title || item.label || JSON.stringify(item);
}

function renderUpgradePlan(plan) {
  if (!Array.isArray(plan) || !plan.length) return "";
  return `
    <h3>Plano de evolução</h3>
    <div class="deck-upgrade-plan">
      ${plan.map((block) => `
        <section>
          <strong>${escapeHtml(block.title || "Etapa")}</strong>
          <ul>${(block.items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>
      `).join("")}
    </div>
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
  if (!list || !panel || !isAdminUser()) {
    if (list) list.innerHTML = "";
    return;
  }

  if (authState.offline) {
    list.innerHTML = '<div class="empty-state compact">Cadastro real de membros fica ativo quando o site estiver no Cloudflare com D1.</div>';
    return;
  }

  list.innerHTML = '<div class="empty-state compact">Carregando usuários...</div>';
  try {
    const response = await fetch(`${API_BASE}/admin/users`, { headers: { Accept: "application/json" } });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Não consegui carregar os usuários.");
    const members = payload.users || [];
    if (!members.length) {
      list.innerHTML = '<div class="empty-state compact">Nenhum usuário cadastrado ainda.</div>';
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
  if (!isAdminUser()) {
    if (list) list.innerHTML = '<p class="error-text">Somente administradores podem criar usuários.</p>';
    return;
  }

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
    if (!response.ok) throw new Error(payload.error || "Não consegui criar o usuário.");
    form.reset();
    document.querySelector("#memberRole").value = "member";
    document.querySelector("#memberStatus").value = "active";
    document.querySelector("#memberTier").value = "R$15";
    setTransientStatus("Usuário criado");
    await renderAdminMembers();
  } catch (error) {
    if (list) list.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  } finally {
    button.disabled = false;
    button.textContent = "Criar usuário";
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

const commanderFormats = new Set(["commander", "brawl", "historic_brawl"]);
const deckFormatInput = document.querySelector("#deckFormat");
const deckCommanderInput = document.querySelector("#deckCommander");
const commanderPicker = document.querySelector("#commanderPicker");
const commanderSuggestions = document.querySelector("#commanderSuggestions");
const selectedCommanderPanel = document.querySelector("#selectedCommander");
let selectedCommanderCard = null;
let commanderSuggestionTimer = 0;
let commanderSuggestionAbortController = null;
let commanderSuggestionCards = [];

deckFormatInput?.addEventListener("change", () => {
  if (!isCommanderFormat()) clearSelectedCommander();
  updateCommanderPicker();
  updateDeckAnalyzeButton();
});

deckCommanderInput?.addEventListener("input", () => {
  selectedCommanderCard = null;
  renderSelectedCommander();
  window.clearTimeout(commanderSuggestionTimer);
  const query = deckCommanderInput.value.trim();
  if (query.length < 2) {
    hideCommanderSuggestions();
    updateDeckAnalyzeButton();
    return;
  }
  commanderSuggestionTimer = window.setTimeout(() => fetchCommanderSuggestions(query), 220);
  updateDeckAnalyzeButton();
});

deckCommanderInput?.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideCommanderSuggestions();
});

commanderSuggestions?.addEventListener("click", (event) => {
  const option = event.target.closest("[data-commander-id]");
  if (!option) return;
  const card = commanderSuggestionCards.find((item) => item.id === option.dataset.commanderId);
  if (card) selectCommanderCard(card);
});

selectedCommanderPanel?.addEventListener("click", (event) => {
  if (event.target.closest("[data-clear-commander]")) clearSelectedCommander();
});

document.addEventListener("click", (event) => {
  if (!event.target.closest("#commanderPicker")) hideCommanderSuggestions();
});

document.querySelector("#deckInput")?.addEventListener("input", updateDeckAnalyzeButton);

function isCommanderFormat() {
  return commanderFormats.has(deckFormatInput?.value || "");
}

function updateCommanderPicker() {
  if (!commanderPicker) return;
  const required = isCommanderFormat();
  commanderPicker.hidden = !required;
  deckCommanderInput?.toggleAttribute("required", required);
}

function updateDeckAnalyzeButton() {
  const button = document.querySelector("#deckForm button[type='submit']");
  const deckInput = document.querySelector("#deckInput");
  if (!button || !deckInput) return;
  const needsCommander = isCommanderFormat();
  const blocked = !hasFeature("decks") || !deckInput.value.trim() || (needsCommander && !selectedCommanderCard);
  button.disabled = blocked;
  if (needsCommander && !selectedCommanderCard) button.title = "Selecione seu comandante antes de analisar o deck.";
  else button.removeAttribute("title");
}

async function fetchCommanderSuggestions(query) {
  if (commanderSuggestionAbortController) commanderSuggestionAbortController.abort();
  commanderSuggestionAbortController = new AbortController();
  renderCommanderSuggestionNote("Procurando comandantes...");

  try {
    const cards = await fetchSuggestionCandidates(query, commanderSuggestionAbortController.signal);
    commanderSuggestionCards = rankCardSuggestions(cards.filter(isCommanderCandidate), query).slice(0, 8);
    renderCommanderSuggestions(commanderSuggestionCards, query);
  } catch (error) {
    if (error.name === "AbortError") return;
    commanderSuggestionCards = [];
    renderCommanderSuggestionNote("Não consegui buscar comandantes agora.");
  }
}

function isCommanderCandidate(card) {
  const type = card.type_line || card.card_faces?.map((face) => face.type_line || "").join(" ") || "";
  const oracle = card.oracle_text || card.card_faces?.map((face) => face.oracle_text || "").join(" ") || "";
  return (type.includes("Legendary") && type.includes("Creature")) || oracle.toLowerCase().includes("can be your commander");
}

function renderCommanderSuggestions(cards, query) {
  if (!commanderSuggestions) return;
  if (!cards.length) {
    renderCommanderSuggestionNote(`Nenhum comandante encontrado para "${query}".`);
    return;
  }

  commanderSuggestions.innerHTML = cards.map((card) => {
    const image = getCardImage(card, "small") || getCardImage(card, "normal") || "";
    const displayName = getCardDisplayName(card);
    const secondaryName = getCardSecondaryName(card);
    const type = card.printed_type_line || card.type_line || "";
    const colors = formatColorIdentity(card.color_identity || []);
    return `
      <button class="card-suggestion" type="button" role="option" data-commander-id="${escapeHtml(card.id)}">
        ${image ? `<img class="suggestion-thumb" src="${escapeHtml(image)}" alt="" loading="lazy" />` : '<span class="suggestion-thumb suggestion-thumb-empty"></span>'}
        <span class="suggestion-copy">
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml([secondaryName, type, colors].filter(Boolean).join(" · "))}</span>
        </span>
      </button>
    `;
  }).join("");
  commanderSuggestions.classList.add("open");
  deckCommanderInput?.setAttribute("aria-expanded", "true");
}

function renderCommanderSuggestionNote(text) {
  if (!commanderSuggestions) return;
  commanderSuggestions.innerHTML = `<div class="suggestion-note">${escapeHtml(text)}</div>`;
  commanderSuggestions.classList.add("open");
}

function hideCommanderSuggestions() {
  window.clearTimeout(commanderSuggestionTimer);
  if (commanderSuggestionAbortController) {
    commanderSuggestionAbortController.abort();
    commanderSuggestionAbortController = null;
  }
  commanderSuggestions?.classList.remove("open");
  if (commanderSuggestions) commanderSuggestions.innerHTML = "";
}

function selectCommanderCard(card) {
  selectedCommanderCard = card;
  if (deckCommanderInput) deckCommanderInput.value = getCardDisplayName(card);
  hideCommanderSuggestions();
  renderSelectedCommander();
  updateDeckAnalyzeButton();
}

function clearSelectedCommander() {
  selectedCommanderCard = null;
  if (deckCommanderInput) deckCommanderInput.value = "";
  renderSelectedCommander();
  updateDeckAnalyzeButton();
}

function renderSelectedCommander() {
  if (!selectedCommanderPanel) return;
  if (!selectedCommanderCard) {
    selectedCommanderPanel.hidden = true;
    selectedCommanderPanel.innerHTML = "";
    return;
  }

  const image = getCardImage(selectedCommanderCard, "small") || getCardImage(selectedCommanderCard, "normal") || "";
  selectedCommanderPanel.hidden = false;
  selectedCommanderPanel.innerHTML = `
    ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" />` : "<span></span>"}
    <span>
      <strong>${escapeHtml(getCardDisplayName(selectedCommanderCard))}</strong>
      <span>${escapeHtml(formatColorIdentity(selectedCommanderCard.color_identity || []))}</span>
    </span>
    <button type="button" data-clear-commander aria-label="Remover comandante">X</button>
  `;
}

function buildCommanderPayload() {
  if (!selectedCommanderCard) return null;
  return {
    id: selectedCommanderCard.id || null,
    name: selectedCommanderCard.name,
    printed_name: selectedCommanderCard.printed_name || selectedCommanderCard.card_faces?.[0]?.printed_name || "",
    manaValue: selectedCommanderCard.cmc ?? null,
    typeLine: selectedCommanderCard.type_line || selectedCommanderCard.card_faces?.[0]?.type_line || "",
    colors: selectedCommanderCard.colors || [],
    colorIdentity: selectedCommanderCard.color_identity || [],
    imageUrl: getCardImage(selectedCommanderCard, "normal") || "",
    thumbnailUrl: getCardImage(selectedCommanderCard, "small") || getCardImage(selectedCommanderCard, "normal") || "",
    canBeCommander: isCommanderCandidate(selectedCommanderCard)
  };
}

function formatColorIdentity(colors) {
  const labels = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };
  return colors?.length ? colors.map((color) => labels[color] || color).join(", ") : "Incolor";
}

document.querySelector("#loadSampleDeck").addEventListener("click", () => {
  deckFormatInput.value = "casual";
  updateCommanderPicker();
  clearSelectedCommander();
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
  updateDeckAnalyzeButton();
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

  if (isCommanderFormat() && !selectedCommanderCard) {
    document.querySelector("#deckOutput").innerHTML = '<p class="error-text">Selecione seu comandante antes de analisar o deck.</p>';
    updateDeckAnalyzeButton();
    return;
  }

  if (authState.offline) await analyzeDeck(lines);
  else await analyzeDeckWithApi({
    decklist: deckText,
    format: deckFormatInput.value,
    commander: buildCommanderPayload(),
    aiMode: document.querySelector("#deckAiMode")?.value || "standard",
    submitButton: event.submitter || event.currentTarget.querySelector("button[type='submit']")
  });
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
updateCommanderPicker();
updateDeckAnalyzeButton();
initAuth();
