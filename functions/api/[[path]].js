const SESSION_COOKIE = "corvo_session";
const SESSION_DAYS = 30;
const PASSWORD_ITERATIONS = 100000;

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
  const route = url.pathname.replace(/^\/api\/?/, "") || "health";

  if (request.method === "OPTIONS") return emptyResponse(204);

  try {
    if (request.method === "GET" && route === "health") return health(env);
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


async function health(env) {
  const payload = {
    ok: true,
    name: "Grimorio do Corvo API",
    version: "2026-05-06.4",
    dbConfigured: Boolean(env.DB),
    adminBootstrapConfigured: Boolean(env.CORVO_ADMIN_EMAIL && env.CORVO_ADMIN_PASSWORD),
    schemaReady: false
  };

  if (env.DB) {
    try {
      await env.DB.prepare("SELECT 1 FROM users LIMIT 1").first();
      await env.DB.prepare("SELECT 1 FROM sessions LIMIT 1").first();
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
  const user = await requireFeature(request, env, "admin");
  if (user instanceof Response) return user;

  const result = await env.DB.prepare(
    "SELECT id, email, display_name, role, plan, plan_status, catarse_tier, paid_until, created_at FROM users ORDER BY created_at DESC LIMIT 100"
  ).all();
  return json({ users: result.results || [] });
}

async function createUser(request, env) {
  const current = await requireFeature(request, env, "admin");
  if (current instanceof Response) return current;

  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName || body.display_name || "Membro do Grimorio").trim();
  const role = ["admin", "member", "guest"].includes(body.role) ? body.role : "member";
  const plan = String(body.plan || "catarse").trim();
  const planStatus = String(body.planStatus || body.plan_status || "active").trim();
  const password = String(body.password || "");
  if (!email || !password) return json({ error: "Email e senha inicial sao obrigatorios." }, { status: 400 });

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
  const decklist = String(body.decklist || "");
  const entries = parseDecklist(decklist);
  if (!entries.length) return json({ error: "Cole uma decklist valida." }, { status: 400 });

  const cards = await fetchCards(entries);
  const report = buildDeckReport(entries, cards);
  report.aiText = await generateAiDeckReading(env, report, entries);
  report.aiEnabled = Boolean(report.aiText);
  await saveDeckAnalysis(env, user.id, decklist, report);
  return json(report);
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
  if (user.role === "admin") return ROLE_FEATURES.admin;
  if (user.role === "member" && user.plan_status === "active") return ROLE_FEATURES.member;
  return ROLE_FEATURES.guest;
}

function parseDecklist(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("//") && !line.startsWith("#"))
    .filter((line) => !["commander", "deck", "sideboard", "maybeboard"].includes(line.toLowerCase()))
    .map((line) => {
      const clean = line.replace(/\s+\(.+\)\s*\d*$/g, "").trim();
      const match = clean.match(/^(\d+)\s*x?\s+(.+)$/i);
      return { quantity: match ? Number(match[1]) : 1, name: (match ? match[2] : clean).trim() };
    })
    .filter((entry) => entry.name && entry.quantity > 0);
}

async function fetchCards(entries) {
  const uniqueNames = [...new Set(entries.map((entry) => entry.name))];
  const chunks = [];
  for (let i = 0; i < uniqueNames.length; i += 75) chunks.push(uniqueNames.slice(i, i + 75));

  const found = [];
  const notFound = [];
  for (const chunk of chunks) {
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) })
    });
    if (!response.ok) throw new Error("Nao consegui consultar o Scryfall agora.");
    const data = await response.json();
    found.push(...(data.data || []));
    notFound.push(...(data.not_found || []).map((item) => item.name).filter(Boolean));
  }

  const counts = new Map(entries.map((entry) => [entry.name.toLowerCase(), entry.quantity]));
  return { found: found.map((card) => ({ ...card, quantity: counts.get(card.name.toLowerCase()) || 1 })), notFound };
}

function buildDeckReport(entries, cardResult) {
  const cards = cardResult.found;
  const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  const foundTotal = cards.reduce((sum, card) => sum + card.quantity, 0);
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

  return {
    summary: { total, foundTotal, colors, averageManaValue, notFound: cardResult.notFound },
    types,
    roles,
    curve,
    advice,
    corvoNote: buildCorvoNote(advice, averageManaValue, types.Terrenos)
  };
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
  const roles = { Ramp: 0, Compra: 0, Remocao: 0, Protecao: 0, Recursao: 0 };
  cards.forEach((card) => {
    const quantity = card.quantity || 1;
    const text = `${card.oracle_text || ""} ${card.type_line || ""} ${card.name || ""}`.toLowerCase();
    if (text.includes("add ") || text.includes("treasure") || text.includes("signet") || text.includes("sol ring")) roles.Ramp += quantity;
    if (text.includes("draw") || text.includes("investigate") || text.includes("surveil")) roles.Compra += quantity;
    if (text.includes("destroy") || text.includes("exile") || text.includes("counter target") || text.includes("deals") || text.includes("damage to")) roles.Remocao += quantity;
    if (text.includes("hexproof") || text.includes("indestructible") || text.includes("protection") || text.includes("phase out")) roles.Protecao += quantity;
    if (text.includes("return target") || text.includes("graveyard") || text.includes("reanimate")) roles.Recursao += quantity;
  });
  return roles;
}

function buildAdvice({ total, foundTotal, types, roles, curve, averageManaValue, notFound }) {
  const advice = [];
  if (total < 90) advice.push("A lista parece incompleta. Para Commander, mire 100 cartas contando o comandante.");
  if (types.Terrenos < 34) advice.push("A base de mana parece curta. Teste subir para 35-38 terrenos ou compensar com ramp consistente.");
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

function buildCorvoNote(advice, averageManaValue, lands) {
  const opening = "O grimorio leu sua lista e encontrou alguns caminhos.";
  const tempo = averageManaValue > 3.6 ? "A curva pede um pouco mais de leveza." : "A curva parece administravel.";
  const mana = lands < 34 ? "A mana merece cuidado antes de qualquer upgrade chamativo." : "A base de mana nao acendeu alerta vermelho imediato.";
  return `${opening} ${tempo} ${mana} Comece pelas recomendacoes de consistencia antes de comprar cartas caras.`;
}


async function generateAiDeckReading(env, report, entries) {
  if (!env.OPENAI_API_KEY) return "";

  const model = env.OPENAI_MODEL || "gpt-5";
  const compactDeck = entries.slice(0, 120).map((entry) => `${entry.quantity} ${entry.name}`).join("\n");
  const prompt = [
    "Analise este deck de Magic: The Gathering para um apoiador do Grimorio do Corvo.",
    "Use portugues do Brasil, tom direto e levemente tematico, sem exagerar.",
    "Entregue 4 blocos curtos: Diagnostico, O que melhorar primeiro, Cortes/ajustes possiveis, Upgrade por prioridade.",
    "Nao invente precos. Se faltar contexto do comandante, diga como isso afeta a leitura.",
    "Resumo tecnico:",
    JSON.stringify(report, null, 2),
    "Decklist:",
    compactDeck
  ].join("\n\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        instructions: "Voce e o analisador de decks do Grimorio do Corvo. Seja util, claro e honesto sobre incertezas.",
        input: prompt
      })
    });

    if (!response.ok) {
      console.error("OpenAI error", response.status, await response.text());
      return "";
    }

    const data = await response.json();
    return extractOpenAiText(data).trim();
  } catch (error) {
    console.error("OpenAI unavailable", error);
    return "";
  }
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
  if (!env.DB) return;
  await env.DB.prepare(
    "INSERT INTO deck_analyses (id, user_id, decklist, report_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, decklist, JSON.stringify(report), new Date().toISOString()).run();
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
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(init.headers || {}) }
  });
}

function emptyResponse(status) {
  return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
}
