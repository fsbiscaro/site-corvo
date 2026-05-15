import { BASIC_LANDS_PT, PT_CARD_ALIASES } from "../../server/deck-analyzer/card-aliases.js";
import { analyzeDeckRequest, attachExternalBenchmark, buildAiPrompt, fetchExternalCommanderBenchmark, fixPtBrCopy, localizeReportPtBr, normalizeAiMode, parseAiAnalysisText, parseDeckRequest, parseDeckText, renderAiAnalysisAsText } from "../../server/deck-analyzer/index.js";

const SESSION_COOKIE = "corvo_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GrimorioDoCorvo/1.0 (site-corvo.fsbiscaro.workers.dev)"
};
const SCRYFALL_LOOKUP_BUDGET_MS = 12000;
const SCRYFALL_FETCH_TIMEOUT_MS = 3500;
const FUZZY_FALLBACK_LIMIT = 10;
const AI_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;
const AI_MEMORY_CACHE = new Map();
const ROLE_FEATURES = {
  admin: ["dashboard", "temas", "cartas", "decks", "admin", "deck_ai", "card_search"],
  member: ["dashboard", "decks", "deck_ai"],
  guest: ["dashboard"]
};

export async function onRequest(context) {
  return handleApiRequest(context.request, context.env);
}

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  const route = normalizeApiRoute(url.pathname);

  if (request.method === "OPTIONS") return emptyResponse(204);

  try {
    if (request.method === "GET" && route === "health") return health(env);
    if (request.method === "POST" && route === "deck-analyzer/parse") return await parseDeckAnalyzer(request);
    if (request.method === "POST" && route === "auth/login") return await login(request, env);
    if (request.method === "POST" && route === "auth/logout") return await logout(request, env);
    if (request.method === "GET" && route === "auth/me") return await me(request, env);
    if (request.method === "POST" && route === "decks/analyze") return await analyzeDeck(request, env);
    if (request.method === "GET" && route === "admin/users") return await listUsers(request, env);
    if (request.method === "POST" && route === "admin/users") return await createUser(request, env);

    return json({ error: "Rota nao encontrada." }, { status: 404 });
  } catch (error) {
    console.error(error);
    return json({ error: "O grimorio tropeçou na propria magia. Tente de novo.", detail: String(error.message || error).slice(0, 180) }, { status: 500 });
  }
}

function normalizeApiRoute(pathname) {
  return String(pathname || "").replace(/^\/api\/?/, "").replace(/\/+$/, "") || "health";
}


async function health(env) {
  const payload = {
    ok: true,
    name: "Grimorio do Corvo API",
    version: "2026-05-13.6",
    dbConfigured: Boolean(env.DB),
    openAiConfigured: Boolean(env.OPENAI_API_KEY),
    adminBootstrapConfigured: Boolean(env.CORVO_ADMIN_EMAIL && env.CORVO_ADMIN_PASSWORD),
    schemaReady: false
  };

  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 FROM users LIMIT 1").first();
      await env.DB.prepare("SELECT 1 FROM sessions LIMIT 1").first();
      await env.DB.prepare("SELECT 1 FROM deck_analyses LIMIT 1").first();
      payload.schemaReady = true;
    } catch (error) {
      payload.schemaReady = false;
      payload.schemaError = String(error.message || error).slice(0, 160);
    }
  }

  return json(payload);
}
async function login(request, env) {
  assertDb(env);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Informe email e senha." }, { status: 400 });

  let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  user = (await maybeBootstrapAdmin(env, email, password, user)) || user;
  if (!user) return json({ error: "Login ou senha invalido." }, { status: 401 });

  const hash = await hashPassword(password, user.password_salt);
  if (!constantTimeEqual(hash, user.password_hash)) return json({ error: "Login ou senha invalido." }, { status: 401 });

  const rawToken = randomHex(32);
  const tokenHash = await sha256Hex(rawToken);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await env.DB.prepare(
    "INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), user.id, tokenHash, now.toISOString(), expires.toISOString()).run();

  return json(sessionPayload(user), {
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=${rawToken}; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; HttpOnly; Secure; SameSite=Lax`
    }
  });
}


async function maybeBootstrapAdmin(env, email, password, currentUser = null) {
  const bootstrapEmail = normalizeEmail(env.CORVO_ADMIN_EMAIL);
  const bootstrapPassword = String(env.CORVO_ADMIN_PASSWORD || "").trim();
  if (!bootstrapEmail || !bootstrapPassword) return null;
  if (email !== bootstrapEmail || password.trim() !== bootstrapPassword) return null;

  const now = new Date().toISOString();
  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const existingUser = currentUser || await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();

  if (existingUser) {
    await env.DB.prepare(
      `UPDATE users
       SET display_name = ?, role = 'admin', plan = 'corvo', plan_status = 'active', catarse_tier = 'admin', paid_until = '', password_salt = ?, password_hash = ?, updated_at = ?
       WHERE id = ?`
    ).bind(existingUser.display_name || "Adm Corvo", salt, hash, now, existingUser.id).run();
    return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(existingUser.id).first();
  }

  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, password_salt, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, 'admin', 'corvo', 'active', 'admin', '', ?, ?, ?, ?)`
  ).bind(id, email, "Adm Corvo", salt, hash, now, now).run();

  return env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
}
async function logout(request, env) {
  assertDb(env);
  const token = getCookie(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return json({ ok: true }, {
    headers: { "Set-Cookie": `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax` }
  });
}

async function me(request, env) {
  const user = await getCurrentUser(request, env);
  if (!user) return json({ isAuthenticated: false, user: null, features: ROLE_FEATURES.guest });
  return json(sessionPayload(user));
}

async function listUsers(request, env) {
  const user = await requireAdmin(request, env);
  if (user instanceof Response) return user;

  const result = await env.DB.prepare(
    "SELECT id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, created_at FROM users ORDER BY created_at DESC LIMIT 100"
  ).all();
  return json({ users: result.results || [] });
}

async function createUser(request, env) {
  const current = await requireAdmin(request, env);
  if (current instanceof Response) return current;

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName || body.display_name || "Membro do Grimorio").trim();
  const role = ["admin", "member", "guest"].includes(body.role) ? body.role : "member";
  const plan = String(body.plan || "catarse").trim();
  const planStatus = String(body.planStatus || body.plan_status || "active").trim();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email e senha inicial sao obrigatorios." }, { status: 400 });

  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existingUser) return json({ error: "Ja existe um usuario com esse email." }, { status: 409 });

  const salt = randomHex(16);
  const hash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO users (id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, password_salt, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    email,
    displayName,
    role,
    plan,
    planStatus,
    body.catarseTier || body.catarse_tier || "",
    body.paidUntil || body.paid_until || "",
    salt,
    hash,
    now,
    now
  ).run();

  return json({ user: { id, email, display_name: displayName, role, plan, plan_status: planStatus } }, { status: 201 });
}

async function analyzeDeck(request, env) {
  const user = await requireFeature(request, env, "decks");
  if (user instanceof Response) return user;

  const body = await readJson(request);
  const decklist = String(body.deck_text ?? body.deckText ?? body.decklist ?? "");
  const format = String(body.format || "casual");
  const report = await analyzeDeckRequest({
    deckText: decklist,
    format,
    commander: body.commander || null
  }, { env, requestUrl: request.url });

  const aiMode = normalizeAiMode(body.ai_mode || body.aiMode || body.analysisMode);
  if (body.use_ai && report.status !== "error") {
    const externalBenchmark = await fetchExternalCommanderBenchmark({ commander: report.commander, mode: aiMode });
    if (externalBenchmark) attachExternalBenchmark(report, externalBenchmark);
    const aiResult = await generateAiDeckReading(env, report, { mode: aiMode, decklist, format, commander: body.commander || null });
    if (aiResult.analysis) {
      report.aiAnalysis = aiResult.analysis;
      report.aiText = aiResult.text;
      report.aiMode = aiMode;
      report.aiCached = Boolean(aiResult.cached);
    } else if (aiResult.error) {
      report.aiError = aiResult.error;
      if (report.status === "complete") report.status = "partial";
    }
  }
  report.aiEnabled = Boolean(report.aiAnalysis || report.aiText);
  report.aiStatus = buildAiStatus(report, { requested: Boolean(body.use_ai), mode: aiMode, env });
  report.scoring = buildScoringState(report);
  report.historySaved = await saveDeckAnalysis(env, user.id, decklist, report);
  return json(localizeReportPtBr(report), { status: report.status === "error" ? 400 : 200 });
}

async function parseDeckAnalyzer(request) {
  const body = await readJson(request);
  const deckText = String(body.deck_text ?? body.deckText ?? body.decklist ?? "");
  const format = String(body.format || "casual");
  if (!deckText.trim()) return json({ error: "Informe deck_text." }, { status: 400 });
  return json(parseDeckRequest(deckText, format));
}

function buildAiStatus(report, { requested, mode, env }) {
  if (report.aiAnalysis) {
    return {
      requested,
      status: "complete",
      provider: "openai",
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      mode,
      cached: Boolean(report.aiCached),
      message: report.aiCached ? "Análise premium recuperada do cache." : "Análise premium gerada pela IA do Corvo."
    };
  }

  if (!requested) {
    return {
      requested: false,
      status: "not_requested",
      provider: "openai",
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      mode,
      cached: false,
      message: "Modo local usado nesta leitura."
    };
  }

  return {
    requested: true,
    status: "unavailable",
    provider: "openai",
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    mode,
    cached: false,
    message: report.aiError || "A análise premium não foi gerada nesta leitura."
  };
}

function buildScoringState(report) {
  const premiumScore = report.aiAnalysis?.score?.value;
  const premiumAvailable = Number.isFinite(Number(premiumScore));
  const confidence = confidenceLabel(report.strategy?.confidenceLevel) || confidenceFromNumber(report.archetype?.confidence);
  return {
    localTechnicalScore: report.score?.final ?? null,
    localTechnicalMaxScore: report.score?.maxScore ?? null,
    localTechnicalReasons: report.score?.limitReasons || [],
    analysisConfidence: confidence,
    premiumScore: premiumAvailable ? Number(premiumScore) : null,
    premiumStatus: premiumAvailable ? "complete" : report.aiStatus?.status || (report.aiError ? "unavailable" : "not_requested"),
    finalPremiumScore: premiumAvailable ? Number(premiumScore) : null,
    finalPremiumMessage: premiumAvailable
      ? "Nota final premium gerada pela IA do Corvo dentro do teto técnico."
      : "Nota final premium indisponível nesta leitura; use a nota técnica local como referência parcial."
  };
}

function confidenceFromNumber(value) {
  const number = Number(value || 0);
  if (number >= 0.75) return "alta";
  if (number >= 0.55) return "média";
  return "baixa";
}

function confidenceLabel(value) {
  return ({ high: "alta", medium: "média", low: "baixa" })[value] || "";
}

async function getCurrentUser(request, env) {
  if (!env.DB) return null;
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const tokenHash = await sha256Hex(token);
  const row = await env.DB.prepare(
    `SELECT users.* FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token_hash = ? AND sessions.expires_at > ?`
  ).bind(tokenHash, new Date().toISOString()).first();
  return row || null;
}

async function requireFeature(request, env, feature) {
  assertDb(env);
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Entre para continuar.", code: "LOGIN_REQUIRED" }, { status: 401 });
  const features = featuresForUser(user);
  if (!features.includes(feature)) {
    return json({ error: "Seu acesso atual nao libera essa ferramenta.", code: "PLAN_REQUIRED" }, { status: 403 });
  }
  return user;
}

async function requireAdmin(request, env) {
  assertDb(env);
  const user = await getCurrentUser(request, env);
  if (!user) return json({ error: "Entre para continuar.", code: "LOGIN_REQUIRED" }, { status: 401 });
  if (user.role !== "admin" || user.plan_status !== "active") {
    return json({ error: "Somente administradores podem gerenciar usuarios.", code: "ADMIN_REQUIRED" }, { status: 403 });
  }
  return user;
}

function sessionPayload(user) {
  return { isAuthenticated: true, user: publicUser(user), features: featuresForUser(user) };
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    role: user.role,
    plan: user.plan,
    planStatus: user.plan_status,
    catarseTier: user.catarse_tier || "",
    paidUntil: user.paid_until || ""
  };
}

function featuresForUser(user) {
  if (!user) return ROLE_FEATURES.guest;
  if (user.role === "admin" && user.plan_status === "active") return ROLE_FEATURES.admin;
  if (user.role === "member" && user.plan_status === "active") return ROLE_FEATURES.member;
  return ROLE_FEATURES.guest;
}

async function fetchCards(entries) {
  const deadline = Date.now() + SCRYFALL_LOOKUP_BUDGET_MS;
  const uniqueEntries = mergeDeckEntries(entries);
  for (const entry of uniqueEntries) {
    entry.lookupName = PT_CARD_ALIASES.get(entry.key) || BASIC_LANDS_PT.get(entry.key) || entry.name;
  }
  const chunks = [];
  for (let i = 0; i < uniqueEntries.length; i += 75) chunks.push(uniqueEntries.slice(i, i + 75));

  const resolvedCards = new Map();
  const unresolved = new Map(uniqueEntries.map((entry) => [entry.key, entry]));
  for (const chunk of chunks) {
    if (timeExpired(deadline)) break;
    const response = await fetchWithTimeout("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { ...SCRYFALL_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((entry) => ({ name: entry.lookupName || entry.name })) })
    }, deadline);
    if (!response) break;
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Scryfall collection failed", response.status, detail.slice(0, 160));
      continue;
    }
    const data = await response.json();
    for (const card of data.data || []) {
      const key = matchCardToEntry(card, unresolved);
      if (!key) continue;
      resolvedCards.set(key, card);
      unresolved.delete(key);
    }
  }

  const fallbackMatches = await resolveCardsByFuzzyName([...unresolved.values()], deadline);
  for (const { entry, card } of fallbackMatches) {
    resolvedCards.set(entry.key, card);
    unresolved.delete(entry.key);
  }

  return {
    found: uniqueEntries
      .filter((entry) => resolvedCards.has(entry.key))
      .map((entry) => ({ ...resolvedCards.get(entry.key), quantity: entry.quantity, submitted_name: entry.name })),
    notFound: [...unresolved.values()].map((entry) => entry.name)
  };
}

function mergeDeckEntries(entries) {
  const byKey = new Map();
  for (const entry of entries) {
    const key = normalizeCardNameKey(entry.name);
    const current = byKey.get(key);
    if (current) current.quantity += entry.quantity;
    else byKey.set(key, { ...entry, key });
  }
  return [...byKey.values()];
}

function normalizeCardNameKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cardSearchNames(card) {
  const names = [card.name, card.printed_name];
  for (const face of card.card_faces || []) {
    names.push(face.name, face.printed_name);
  }
  return names.filter(Boolean).map(normalizeCardNameKey);
}

function matchCardToEntry(card, unresolved) {
  const names = cardSearchNames(card);
  for (const [key, entry] of unresolved) {
    const lookupKey = normalizeCardNameKey(entry.lookupName || "");
    if (names.includes(key) || (lookupKey && names.includes(lookupKey)) || names.some((name) => name.split(" // ").includes(entry.key))) return key;
  }
  return "";
}

async function resolveCardsByFuzzyName(entries, deadline) {
  if (!entries.length) return [];
  const matches = [];
  const unresolved = new Map(entries.map((entry) => [entry.key, entry]));
  const batchMatches = await resolveCardsByMultilingualSearch(entries, deadline);
  for (const { entry, card } of batchMatches) {
    matches.push({ entry, card });
    unresolved.delete(entry.key);
  }

  for (const entry of [...unresolved.values()].slice(0, FUZZY_FALLBACK_LIMIT)) {
    if (remainingMs(deadline) < 900) break;
    const card = await fetchCardByFuzzyName(entry.name, deadline);
    if (card) matches.push({ entry, card });
    await delay(Math.min(60, Math.max(0, remainingMs(deadline))));
  }
  return matches;
}

async function resolveCardsByMultilingualSearch(entries, deadline) {
  const matches = [];
  const chunkSize = 15;
  for (let i = 0; i < entries.length; i += chunkSize) {
    if (remainingMs(deadline) < 1200) break;
    const chunk = entries.slice(i, i + chunkSize);
    const unresolved = new Map(chunk.map((entry) => [entry.key, entry]));
    const query = `include:multilingual (${chunk.map((entry) => `"${escapeScryfallSearch(entry.name)}"`).join(" or ")})`;
    const cards = await fetchScryfallSearch(query, deadline);
    for (const card of cards) {
      const key = matchCardToEntry(card, unresolved);
      if (!key) continue;
      matches.push({ entry: unresolved.get(key), card });
      unresolved.delete(key);
    }
    await delay(Math.min(80, Math.max(0, remainingMs(deadline))));
  }
  return matches;
}

async function fetchScryfallSearch(query, deadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (remainingMs(deadline) < 800) return [];
    const response = await fetchWithTimeout(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=prints&include_multilingual=true`, {
      headers: SCRYFALL_HEADERS
    }, deadline);
    if (!response) return [];
    if (response.ok) {
      const data = await response.json();
      return data.data || [];
    }
    if (response.status === 400 || response.status === 404) return [];
    if (response.status === 429 || response.status >= 500) {
      await delay(Math.min(600, Math.max(0, remainingMs(deadline))));
      continue;
    }
    console.error("Scryfall multilingual search failed", response.status, await response.text().catch(() => ""));
    return [];
  }
  return [];
}

function escapeScryfallSearch(value) {
  return String(value || "").replace(/["\\]/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchCardByFuzzyName(name, deadline) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (remainingMs(deadline) < 800) return null;
    const response = await fetchWithTimeout(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, {
      headers: SCRYFALL_HEADERS
    }, deadline);
    if (!response) return null;
    if (response.ok) return await response.json();
    if (response.status === 400 || response.status === 404) return null;
    if (response.status === 429 || response.status >= 500) {
      await delay(Math.min(600, Math.max(0, remainingMs(deadline))));
      continue;
    }
    console.error("Scryfall fuzzy lookup failed", name, response.status, await response.text().catch(() => ""));
    return null;
  }
  console.error("Scryfall fuzzy lookup exhausted retries", name);
  return null;
}

async function fetchWithTimeout(url, options, deadline) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(SCRYFALL_FETCH_TIMEOUT_MS, Math.max(250, remainingMs(deadline))));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    console.error("Scryfall request timed out or failed", String(error?.message || error).slice(0, 160));
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function remainingMs(deadline) {
  return Math.max(0, deadline - Date.now());
}

function timeExpired(deadline) {
  return remainingMs(deadline) <= 0;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildNameOnlyDeckReport(entries, error) {
  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const emptyTypes = { Terrenos: 0, Criaturas: 0, Artefatos: 0, Encantamentos: 0, Instantaneas: 0, Feiticos: 0, Planeswalkers: 0 };
  const emptyRoles = { Ramp: 0, Compra: 0, Remocao: 0, Protecao: 0, Recursao: 0 };
  const emptyCurve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const scores = [
    { label: "Estrutura", score: total >= 99 ? 8 : total >= 90 ? 6 : 3, status: total >= 99 ? "ok" : "alerta", note: `${total} carta(s) informadas.` },
    { label: "Dados", score: 2, status: "alerta", note: "Consulta externa indisponivel nesta leitura." }
  ];

  return {
    summary: {
      total,
      foundTotal: 0,
      colors: "Nao identificado",
      averageManaValue: "-",
      notFound: entries.map((entry) => entry.name)
    },
    types: emptyTypes,
    roles: emptyRoles,
    curve: emptyCurve,
    advice: [
      "Nao consegui consultar o banco de cartas agora, entao esta leitura ficou limitada aos nomes da lista.",
      total < 90
        ? "A lista parece incompleta para Commander. Mire 100 cartas contando o comandante."
        : "A quantidade geral parece fechada. Quando a consulta voltar, o grimorio consegue avaliar curva, tipos e funcoes com mais precisao."
    ],
    commander: { name: entries[0]?.name || "Comandante nao identificado", colors: "Nao identificado", type: "", note: "Coloque o comandante na primeira linha para refinar a leitura." },
    verdict: {
      title: "Leitura limitada: consulta de cartas indisponivel",
      subtitle: `Recebi ${total} carta(s), mas nao consegui cruzar os dados tecnicos agora.`,
      score: Number((scores.reduce((sum, item) => sum + item.score, 0) / scores.length).toFixed(1)),
      tier: "leitura parcial"
    },
    identity: { headline: "Identidade ainda nao confirmada porque a consulta externa falhou.", colors: "Nao identificado", commander: entries[0]?.name || "", tags: ["leitura parcial"] },
    scores,
    strengths: ["A lista foi recebida e pode ser analisada assim que a consulta externa responder."],
    risks: ["Sem dados carta a carta, nao da para medir curva, funcoes e base de mana com confianca."],
    upgradePlan: [
      { title: "1. Preparar a lista", items: ["Confira nomes em ingles ou use nomes oficiais para aumentar a taxa de leitura.", "Coloque o comandante na primeira linha."] },
      { title: "2. Rodar novamente", items: ["Tente de novo em alguns instantes para liberar curva, funcoes e prioridades tecnicas."] }
    ],
    playtest: ["Confirme se a lista tem 100 cartas.", "Separe comandante, terrenos, ramp, compra e respostas em blocos antes da proxima leitura."],
    corvoNote: "O grimorio abriu a pagina, mas a consulta externa falhou. A leitura basica continua disponivel para voce nao ficar parado.",
    apiWarning: String(error?.message || error || "Erro desconhecido").slice(0, 180)
  };
}

function buildDeckReport(entries, cardResult) {
  const cards = cardResult.found;
  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const foundTotal = cards.reduce((sum, card) => sum + card.quantity, 0);
  if (!foundTotal) return buildNameOnlyDeckReport(entries, new Error("Nenhuma carta foi reconhecida pelo Scryfall."));
  const types = summarizeTypes(cards);
  const roles = summarizeRoles(cards);
  const curve = summarizeCurve(cards);
  const colors = summarizeColors(cards);
  const nonLands = Math.max(foundTotal - types.Terrenos, 1);
  const manaValueTotal = cards.reduce((sum, card) => {
    if ((card.type_line || "").includes("Land")) return sum;
    return sum + (Number(card.cmc || 0) * card.quantity);
  }, 0);
  const averageManaValue = Number((manaValueTotal / nonLands).toFixed(2));
  const advice = buildAdvice({ total, foundTotal, types, roles, curve, averageManaValue, notFound: cardResult.notFound });
  const commander = inferCommander(entries, cards);
  const scores = buildPillarScores({ total, foundTotal, types, roles, curve, averageManaValue, notFound: cardResult.notFound });
  const overallScore = Number((scores.reduce((sum, item) => sum + item.score, 0) / scores.length).toFixed(1));
  const identity = buildDeckIdentity({ cards, types, roles, commander, colors });

  return {
    summary: { total, foundTotal, colors, averageManaValue, notFound: cardResult.notFound },
    types,
    roles,
    curve,
    advice,
    commander,
    verdict: buildVerdict({ overallScore, commander, colors, averageManaValue, lands: types.Terrenos, roles, total }),
    identity,
    scores,
    strengths: buildStrengths({ total, foundTotal, types, roles, curve, averageManaValue }),
    risks: buildRisks({ total, foundTotal, types, roles, curve, averageManaValue, notFound: cardResult.notFound }),
    upgradePlan: buildUpgradePlan({ types, roles, curve, averageManaValue, total }),
    playtest: buildPlaytestPlan({ types, roles, curve, averageManaValue, total }),
    corvoNote: buildCorvoNote({ commander, total, foundTotal, averageManaValue, lands: types.Terrenos, roles, identity })
  };
}

function inferCommander(entries, cards) {
  const firstEntry = entries[0]?.name || "";
  const legendaryCreature = cards.find((card) => {
    const type = card.type_line || "";
    return type.includes("Legendary") && type.includes("Creature");
  });
  const card = legendaryCreature || cards.find((item) => item.name.toLowerCase() === firstEntry.toLowerCase()) || cards[0];
  const name = displayCardName(card) || firstEntry || "Comandante nao identificado";
  return {
    name,
    colors: summarizeColors(card ? [card] : []),
    type: card?.type_line || "",
    note: card
      ? `Leitura ancorada em ${name}. Se este nao for o comandante, coloque o comandante na primeira linha para refinar o diagnostico.`
      : "Nao consegui identificar o comandante com seguranca. Coloque o comandante na primeira linha para melhorar a leitura."
  };
}

function displayCardName(card) {
  return card?.submitted_name || card?.printed_name || card?.name || "";
}

function buildDeckIdentity({ cards, types, roles, commander, colors }) {
  const text = cards.map((card) => `${card.name || ""} ${card.oracle_text || ""} ${card.type_line || ""}`).join(" ").toLowerCase();
  const tags = [];
  if (text.includes("token") || text.includes("create ")) tags.push("tokens/mesa larga");
  if (text.includes("sacrifice") || text.includes("graveyard")) tags.push("cemiterio/recursao");
  if (text.includes("counter target") || roles.Remocao >= 8) tags.push("controle/interacao");
  if (text.includes("draw") || roles.Compra >= 8) tags.push("valor e compra");
  if (types.Criaturas >= 28) tags.push("criaturas como plano principal");
  if (types.Encantamentos >= 8) tags.push("encantamentos");
  if (types.Artefatos >= 10) tags.push("artefatos/ramp");

  return {
    headline: tags.length
      ? `O deck aponta para ${tags.slice(0, 3).join(", ")}.`
      : "O plano principal ainda nao apareceu com forca suficiente na lista parcial.",
    colors,
    commander: commander.name,
    tags: tags.length ? tags : ["estrutura inicial", "precisa de mais contexto"]
  };
}

function buildPillarScores({ total, foundTotal, types, roles, curve, averageManaValue, notFound }) {
  const lowDrops = (curve[1] || 0) + (curve[2] || 0);
  const landScore = scoreLands(types.Terrenos);
  const rampScore = scoreRange(roles.Ramp, 4, 8, 12);
  const drawScore = scoreRange(roles.Compra, 4, 8, 12);
  const removalScore = scoreRange(roles.Remocao, 4, 7, 11);
  const protectionScore = scoreRange(roles.Protecao + roles.Recursao, 2, 5, 8);
  const curveScore = Math.round((scoreAverageMana(averageManaValue) + scoreRange(lowDrops, 7, 12, 18)) / 2);
  const completeScore = total >= 99 ? 10 : total >= 90 ? 8 : total >= 70 ? 5 : 2;
  const lookupScore = foundTotal >= Math.min(total, 99) - Math.max(2, notFound.length) ? 10 : foundTotal >= total * 0.8 ? 7 : 4;

  return [
    { label: "Estrutura", score: Math.round((completeScore + lookupScore) / 2), note: total >= 99 ? "Lista praticamente fechada para Commander." : "A lista ainda parece parcial para Commander." },
    { label: "Mana", score: Math.round((landScore + rampScore) / 2), note: `${types.Terrenos} terrenos e ${roles.Ramp} ramp detectados.` },
    { label: "Curva", score: curveScore, note: `Valor medio ${averageManaValue}; ${lowDrops} jogadas entre custos 1 e 2.` },
    { label: "Folego", score: drawScore, note: `${roles.Compra} fontes de compra/valor detectadas.` },
    { label: "Interacao", score: removalScore, note: `${roles.Remocao} respostas/remocoes detectadas.` },
    { label: "Protecao", score: protectionScore, note: `${roles.Protecao} protecoes e ${roles.Recursao} recursos de recursao detectados.` }
  ].map((item) => ({ ...item, status: scoreStatus(item.score) }));
}

function scoreRange(value, low, good, great) {
  if (value >= great) return 10;
  if (value >= good) return 8;
  if (value >= low) return 6;
  if (value > 0) return 4;
  return 2;
}

function scoreLands(lands) {
  if (lands >= 35 && lands <= 38) return 10;
  if (lands >= 33 && lands <= 40) return 8;
  if (lands >= 30 && lands <= 42) return 6;
  if (lands > 0) return 3;
  return 1;
}

function scoreAverageMana(value) {
  if (!Number.isFinite(value)) return 4;
  if (value >= 2.2 && value <= 3.15) return 10;
  if (value >= 1.9 && value <= 3.45) return 8;
  if (value <= 3.8) return 6;
  return 3;
}

function scoreStatus(score) {
  if (score >= 8) return "forte";
  if (score >= 6) return "ok";
  return "alerta";
}

function buildVerdict({ overallScore, commander, colors, averageManaValue, lands, roles, total }) {
  const tier = overallScore >= 8 ? "bem encaminhado" : overallScore >= 6 ? "jogavel, mas pede lapidacao" : "precisa de base antes de upgrades caros";
  const title = `${commander.name}: ${tier}`;
  const subtitle = [
    `Nota Corvo ${overallScore}/10.`,
    `Identidade ${colors}.`,
    `Curva media ${averageManaValue}.`,
    `${lands} terrenos, ${roles.Ramp} ramp, ${roles.Compra} compra e ${roles.Remocao} interacoes em ${total} cartas.`
  ].join(" ");
  return { title, subtitle, score: overallScore, tier };
}

function buildStrengths({ total, foundTotal, types, roles, curve, averageManaValue }) {
  const strengths = [];
  if (foundTotal > 0) strengths.push("A lista foi lida carta por carta e cruzada com dados reais do Scryfall, nao apenas interpretada como texto solto.");
  if (foundTotal > 0 && averageManaValue <= 3.2) strengths.push("A curva media esta controlada, o que tende a melhorar os primeiros turnos.");
  if (roles.Ramp >= 8) strengths.push("O pacote de ramp ja aparece em quantidade saudavel.");
  if (roles.Compra >= 8) strengths.push("Ha uma base de compra/valor capaz de manter o deck respirando no meio da partida.");
  if (roles.Remocao >= 7) strengths.push("A quantidade de respostas detectadas ja permite interagir com a mesa.");
  if (types.Terrenos >= 35 && types.Terrenos <= 38) strengths.push("A base de terrenos esta dentro da faixa classica para Commander.");
  if (total >= 99) strengths.push("A lista esta no tamanho esperado para Commander, entao os ajustes ja podem ser mais finos.");
  if (!strengths.length) strengths.push("O ponto forte principal ainda nao esta nitido; a proxima versao deve reforcar uma identidade clara de vitoria.");
  return strengths;
}

function buildRisks({ total, foundTotal, types, roles, curve, averageManaValue, notFound }) {
  const risks = [];
  const lowDrops = (curve[1] || 0) + (curve[2] || 0);
  if (total < 99) risks.push("A lista esta incompleta para Commander; isso distorce curva, proporcao de terrenos e quantidade de respostas.");
  if (foundTotal < total) risks.push(`${total - foundTotal} carta(s) nao entraram na leitura tecnica. Nomes em portugues, abreviacoes ou erros de escrita podem afetar o resultado.`);
  if (types.Terrenos < 34) risks.push("A mana esta abaixo do piso recomendado. Antes de upgrades chamativos, corrija terrenos e fontes de cor.");
  if (roles.Ramp < 8) risks.push("Pouco ramp: o deck pode assistir a mesa acelerar enquanto fica preso no desenvolvimento.");
  if (roles.Compra < 8) risks.push("Pouca compra/valor: existe risco de ficar sem mao depois das primeiras trocas.");
  if (roles.Remocao < 7) risks.push("Interacao baixa: o deck pode perder para permanentes problematicas sem conseguir responder.");
  if (roles.Protecao + roles.Recursao < 4) risks.push("Baixa resiliencia: se a peca central cair, o plano pode demorar a voltar.");
  if (averageManaValue > 3.6) risks.push("Curva pesada: sem ramp alto, a lista pode comecar a jogar tarde.");
  if (lowDrops < 12) risks.push("Poucas jogadas baratas: os turnos 1 e 2 podem ficar passivos demais.");
  if (notFound.length) risks.push(`Revise estes nomes primeiro: ${notFound.slice(0, 6).join(", ")}.`);
  return risks;
}

function buildUpgradePlan({ types, roles, curve, averageManaValue, total }) {
  const plan = [];
  const foundation = [];
  const consistency = [];
  const power = [];
  const tuning = [];

  if (total < 99) foundation.push("Feche a lista em 100 cartas antes de comprar upgrades caros; uma lista parcial engana qualquer avaliacao.");
  if (types.Terrenos < 34 && roles.Ramp >= 10) foundation.push("A base tem poucos terrenos, mas o ramp/fast mana ajuda. Teste mulligans e corrija apenas se as cores travarem.");
  else if (types.Terrenos < 34) foundation.push("Suba a base para 35-38 terrenos ou compense com ramp real e fontes que entram desviradas.");
  if (roles.Ramp < 8) foundation.push("Priorize ramp barato nos custos 1 e 2 para estabilizar os primeiros turnos.");
  if (!foundation.length) foundation.push("A base minima parece ok; passe para ajustes de consistencia.");

  if (roles.Compra < 8) consistency.push("Inclua fontes recorrentes de compra/valor, nao apenas magicas pontuais.");
  if (roles.Remocao < 7) consistency.push("Adicione respostas flexiveis que resolvam criaturas, encantamentos/artefatos ou permanentes problemáticas.");
  if ((curve[1] || 0) + (curve[2] || 0) < 12) consistency.push("Troque algumas cartas caras por jogadas de custo 1 e 2 para o deck aparecer mais cedo na mesa.");
  if (!consistency.length) consistency.push("A consistencia basica esta aceitavel; os proximos ajustes podem mirar sinergia e fechamento de jogo.");

  if (roles.Protecao < 3) power.push("Adicione protecao para comandante ou peca-chave antes de investir em cartas de teto alto.");
  if (averageManaValue > 3.6) power.push("Corte efeitos caros redundantes e mantenha apenas os que vencem jogo ou viram completamente a mesa.");
  power.push("Depois da base e consistencia, escolha upgrades que reforcem exatamente o plano do comandante, nao cartas boas genericas.");

  tuning.push("Teste 3 partidas anotando: mana travou, faltou carta na mao, faltou remocao ou faltou condicao de vitoria.");
  tuning.push("A cada teste, troque no maximo 5 cartas. Isso evita baguncar o deck e deixa claro o que melhorou.");

  plan.push({ title: "1. Base antes de brilho", items: foundation });
  plan.push({ title: "2. Consistencia", items: consistency });
  plan.push({ title: "3. Protecao e teto de poder", items: power });
  plan.push({ title: "4. Teste guiado", items: tuning });
  return plan;
}

function buildPlaytestPlan({ types, roles, curve, averageManaValue, total }) {
  return [
    total < 99 ? "Complete 100 cartas e rode a leitura de novo." : "Jogue uma partida sem trocar cartas e anote onde o deck engasgou.",
    types.Terrenos < 34 ? "Conte quantas maos iniciais tiveram 2-3 terrenos. Se isso falhar muito, ajuste mana primeiro." : "Observe se as cores certas aparecem ate o turno 3.",
    roles.Compra < 8 ? "Marque em qual turno sua mao fica vazia; se for antes do turno 6, falta motor de valor." : "Veja se as compras aparecem quando voce ja gastou a mao inicial.",
    roles.Remocao < 7 ? "Anote permanentes que voce nao conseguiu responder." : "Teste se suas respostas resolvem diferentes tipos de ameaca.",
    averageManaValue > 3.6 ? "Separe as cartas de custo 5+ e pergunte: isso vence ou recupera jogo? Se nao, vira corte." : "Confira se as cartas baratas realmente avancam seu plano."
  ];
}

function summarizeColors(cards) {
  const order = ["W", "U", "B", "R", "G"];
  const names = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };
  const found = new Set();
  cards.forEach((card) => (card.color_identity || []).forEach((color) => found.add(color)));
  return order.filter((color) => found.has(color)).map((color) => names[color]).join(", ") || "Incolor / nao identificado";
}

function summarizeTypes(cards) {
  return cards.reduce((acc, card) => {
    const type = card.type_line || "";
    const quantity = card.quantity || 1;
    if (type.includes("Land")) acc.Terrenos += quantity;
    else if (type.includes("Creature")) acc.Criaturas += quantity;
    else if (type.includes("Artifact")) acc.Artefatos += quantity;
    else if (type.includes("Enchantment")) acc.Encantamentos += quantity;
    else if (type.includes("Instant")) acc.Instantaneas += quantity;
    else if (type.includes("Sorcery")) acc.Feiticos += quantity;
    else if (type.includes("Planeswalker")) acc.Planeswalkers += quantity;
    return acc;
  }, { Terrenos: 0, Criaturas: 0, Artefatos: 0, Encantamentos: 0, Instantaneas: 0, Feiticos: 0, Planeswalkers: 0 });
}

function summarizeCurve(cards) {
  return cards.reduce((acc, card) => {
    if ((card.type_line || "").includes("Land")) return acc;
    const cmc = Math.min(Math.floor(card.cmc || 0), 7);
    acc[cmc] = (acc[cmc] || 0) + (card.quantity || 1);
    return acc;
  }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
}

function summarizeRoles(cards) {
  const roles = { Ramp: 0, Compra: 0, Remocao: 0, Protecao: 0, Recursao: 0, Tutores: 0 };
  cards.forEach((card) => {
    const quantity = card.quantity || 1;
    const type = card.type_line || "";
    const text = `${card.oracle_text || ""} ${type} ${card.name || ""}`.toLowerCase();
    const isLand = type.includes("Land");
    if (!isLand && (text.includes("add ") || text.includes("treasure") || text.includes("signet") || text.includes("sol ring") || text.includes("mox") || text.includes("lotus") || text.includes("mana crypt") || text.includes("mana vault") || text.includes("ritual"))) roles.Ramp += quantity;
    if (text.includes("draw") || text.includes("investigate") || text.includes("surveil") || text.includes("impulse")) roles.Compra += quantity;
    if (text.includes("destroy") || text.includes("exile") || text.includes("counter target") || text.includes("deals") || text.includes("damage to")) roles.Remocao += quantity;
    if (text.includes("hexproof") || text.includes("indestructible") || text.includes("protection") || text.includes("phase out") || text.includes("can't be countered") || text.includes("opponents can't cast spells")) roles.Protecao += quantity;
    if (text.includes("return target") || text.includes("graveyard") || text.includes("reanimate")) roles.Recursao += quantity;
    if (text.includes("search your library") || text.includes("tutor") || text.includes("wish")) roles.Tutores += quantity;
  });
  return roles;
}

function buildAdvice({ total, foundTotal, types, roles, curve, averageManaValue, notFound }) {
  const advice = [];
  if (total < 90) advice.push("A lista parece incompleta. Para Commander, mire 100 cartas contando o comandante.");
  if (types.Terrenos < 34 && roles.Ramp >= 10) advice.push("A base tem poucos terrenos, mas o ramp/fast mana detectado pode justificar isso. Teste mulligans e consistencia de cores antes de aumentar terrenos.");
  else if (types.Terrenos < 34) advice.push("A base de mana parece curta. Teste subir para 35-38 terrenos ou compensar com ramp consistente.");
  if (types.Terrenos > 40) advice.push("Ha muitos terrenos para a maioria dos decks. Se o deck nao exige isso, transforme alguns slots em compra, ramp ou interacao.");
  if (roles.Ramp < 8) advice.push("O pacote de ramp esta baixo. Um deck Commander costuma respirar melhor com 8-12 aceleradores.");
  if (roles.Compra < 8) advice.push("Falta compra/geracao de valor. Sem isso, o deck tende a ficar sem mao no meio da partida.");
  if (roles.Remocao < 7) advice.push("A interacao parece pequena. Considere mais remocoes pontuais ou respostas flexiveis.");
  if (roles.Protecao < 3) advice.push("Pouca protecao detectada. Se o comandante e importante, inclua formas de proteger sua mesa ou sua peca-chave.");
  if (averageManaValue > 3.6) advice.push("A curva esta pesada. Cortar algumas magicas caras pode deixar o deck mais vivo nos primeiros turnos.");
  if ((curve[1] || 0) + (curve[2] || 0) < 12) advice.push("Poucas jogadas baratas apareceram. Reforcar custos 1 e 2 melhora bastante a consistencia.");
  if (notFound.length) advice.push(`Nao encontrei ${notFound.length} carta(s). Revise nomes, idioma ou abreviacoes: ${notFound.slice(0, 5).join(", ")}.`);
  if (!advice.length && foundTotal > 0) advice.push("A estrutura inicial parece saudavel. Agora vale lapidar sinergias, plano de vitoria e upgrades por orcamento.");
  return advice;
}

function buildCorvoNote({ commander, total, foundTotal, averageManaValue, lands, roles, identity }) {
  const subject = commander?.name ? `Li a lista de ${commander.name}` : "Li sua lista";
  const coverage = foundTotal < total ? ` e reconheci ${foundTotal} de ${total} cartas` : ` e reconheci as ${foundTotal} cartas principais`;
  const plan = identity?.tags?.length ? `O sinal mais forte agora e ${identity.tags.slice(0, 2).join(" + ")}.` : "O plano principal ainda pede confirmacao.";
  const mana = lands < 34 && roles.Ramp >= 10
    ? "A base e enxuta, mas o ramp/fast mana pode sustentar essa escolha."
    : lands < 34
      ? "A base de mana acendeu alerta e precisa ser testada antes de upgrades caros."
      : "A mana nao acendeu alerta vermelho imediato.";
  const tempo = averageManaValue > 3.6 ? "A curva pede atencao." : "A curva parece administravel.";
  return `${subject}${coverage}. ${plan} ${tempo} ${mana}`;
}


async function generateAiDeckReading(env, report, options = {}) {
  if (!env.OPENAI_API_KEY) {
    return { analysis: null, text: "", error: "A análise premium precisa da secret OPENAI_API_KEY no Worker. Mantive a leitura técnica local como parcial." };
  }

  const model = env.OPENAI_MODEL || "gpt-4.1-mini";
  const mode = normalizeAiMode(options.mode);
  const maxScore = Number(report.scoreLimits?.maxScore ?? report.score?.maxScore ?? 10);
  const cacheKey = await buildAiCacheKey({ decklist: options.decklist, commander: options.commander || report.commander, format: options.format || report.format, mode });
  const cached = await readAiCache(cacheKey);
  if (cached) return { ...cached, cached: true };

  const prompt = fixPtBrCopy(buildAiPrompt(report, { mode }));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mode === "DEEP_AI" ? 45000 : 25000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        instructions: "Você é o Corvo, analista de Commander do Grimório do Corvo. Use apenas o JSON técnico, escreva em português brasileiro com acentuação correta e respeite o teto de nota.",
        input: prompt,
        temperature: 0.35,
        max_output_tokens: mode === "DEEP_AI" ? 3600 : 2200
      })
    });

    if (!response.ok) {
      console.error("OpenAI error", response.status, await response.text());
      return { analysis: null, text: "", error: "A análise com IA não respondeu agora; mantive a leitura técnica local." };
    }

    const data = await response.json();
    const rawText = extractOpenAiText(data).trim();
    const analysis = parseAiAnalysisText(rawText, maxScore);
    const text = renderAiAnalysisAsText(analysis);
    const result = { analysis, text };
    await writeAiCache(cacheKey, result);
    return result;
  } catch (error) {
    console.error("OpenAI unavailable", error);
    return { analysis: null, text: "", error: "A análise com IA falhou sem travar o deck; a leitura local continua disponível." };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildAiCacheKey(payload) {
  return sha256Hex(JSON.stringify({
    v: "corvo-ai-review-v1",
    decklist: payload.decklist || "",
    commander: payload.commander?.canonicalName || payload.commander?.name || payload.commander?.displayName || "",
    format: payload.format || "casual",
    mode: payload.mode
  }));
}

async function readAiCache(key) {
  if (AI_MEMORY_CACHE.has(key)) return AI_MEMORY_CACHE.get(key);
  if (typeof caches === "undefined") return null;
  try {
    const response = await caches.default.match(aiCacheRequest(key));
    if (!response) return null;
    const payload = await response.json();
    AI_MEMORY_CACHE.set(key, payload);
    return payload;
  } catch {
    return null;
  }
}

async function writeAiCache(key, payload) {
  AI_MEMORY_CACHE.set(key, payload);
  if (typeof caches === "undefined") return;
  try {
    await caches.default.put(aiCacheRequest(key), new Response(JSON.stringify(payload), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${AI_CACHE_TTL_SECONDS}`
      }
    }));
  } catch {
    // Cache is an optimization; ignore failures.
  }
}

function aiCacheRequest(key) {
  return new Request(`https://grimorio.local/ai-cache/${key}`);
}

function extractOpenAiText(data) {
  if (typeof data.output_text === "string") return data.output_text;
  const pieces = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) pieces.push(content.text);
      if (content.type === "text" && content.text) pieces.push(content.text);
    }
  }
  return pieces.join("\n\n");
}
async function saveDeckAnalysis(env, userId, decklist, report) {
  if (!env.DB) return false;
  try {
    await env.DB.prepare(
      "INSERT INTO deck_analyses (id, user_id, decklist, report_json, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(crypto.randomUUID(), userId, decklist, JSON.stringify(report), new Date().toISOString()).run();
    return true;
  } catch (error) {
    console.error("Deck analysis history save failed", error);
    return false;
  }
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function assertDb(env) {
  if (!env.DB) throw new Error("Binding D1 DB ausente. Configure a variavel DB no Cloudflare Pages.");
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  return header.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: PASSWORD_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return toHex(new Uint8Array(bits));
}

async function sha256Hex(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(new Uint8Array(hash));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function randomHex(bytes) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return toHex(values);
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(localizeReportPtBr(payload)), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(init.headers || {}) }
  });
}

function emptyResponse(status) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
