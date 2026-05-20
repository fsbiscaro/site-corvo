import { buildAiPrompt, normalizeAiMode, parseAiAnalysisText, renderAiAnalysisAsText } from "../ai-analysis.js";
import { fixPtBrCopy } from "../i18n/pt-BR.js";

export function isCorvoAiConfigured(env = {}) {
  return Boolean(env.OPENAI_API_KEY);
}

export function getCorvoAiModel(env = {}) {
  return env.CORVO_AI_MODEL || env.OPENAI_MODEL || "gpt-4.1-mini";
}

export function buildCorvoAiPrompt(report, options = {}) {
  return fixPtBrCopy(buildAiPrompt(report, options));
}

export async function runCorvoAiAnalysis(report, env, options = {}) {
  if (!isCorvoAiConfigured(env)) {
    return fallbackToLocalReview("OPENAI_API_KEY não configurada.");
  }

  const mode = normalizeAiMode(options.mode);
  const maxScore = Number(report.scoreLimits?.maxScore ?? report.score?.maxScore ?? 10);
  const model = getCorvoAiModel(env);
  const fetchFn = options.fetchFn || fetch;

  if (mode !== "DEEP_AI") {
    return runCompactCorvoAiAnalysis(report, env, {
      ...options,
      mode,
      fetchFn,
      primary: true,
      reason: "Modo padrão usa leitura compacta para responder dentro dos limites do Worker."
    });
  }

  const prompt = buildCorvoAiPrompt(report, { mode });

  const response = await fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    signal: options.signal,
    body: JSON.stringify({
      model,
      instructions: "Você é o Corvo, analista de Commander do Grimório do Corvo. Use apenas o JSON técnico, escreva em português brasileiro com acentuação correta e respeite o teto de nota.",
      input: prompt,
      text: {
        format: {
          type: "json_object"
        }
      },
      temperature: 0.35,
      max_output_tokens: mode === "DEEP_AI" ? 2800 : 1700
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const reason = buildOpenAiErrorMessage(response.status, detail);
    if (shouldTryCompactFallback(response.status)) {
      return runCompactCorvoAiAnalysis(report, env, { ...options, mode, fetchFn, reason });
    }
    return fallbackToLocalReview(reason);
  }

  const data = await response.json();
  try {
    return parseCorvoAiResponse(data, maxScore);
  } catch (error) {
    return runCompactCorvoAiAnalysis(report, env, {
      ...options,
      mode,
      fetchFn,
      reason: `A OpenAI respondeu fora do JSON esperado: ${String(error?.message || error).slice(0, 140)}`
    });
  }
}

async function runCompactCorvoAiAnalysis(report, env, options = {}) {
  const mode = normalizeAiMode(options.mode);
  const maxScore = Number(report.scoreLimits?.maxScore ?? report.score?.maxScore ?? 10);
  const model = getCorvoAiModel(env);
  const fetchFn = options.fetchFn || fetch;
  const prompt = buildCompactCorvoAiPrompt(report, { mode, reason: options.reason, primary: options.primary });

  const response = await fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    signal: options.signal,
    body: JSON.stringify({
      model,
      instructions: "Você é o Corvo, analista de Commander do Grimório do Corvo. Gere uma análise estratégica compacta em português brasileiro usando apenas o JSON técnico.",
      input: prompt,
      text: {
        format: {
          type: "json_object"
        }
      },
      temperature: 0.3,
      max_output_tokens: options.primary ? 1600 : 1200
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    const compactError = buildOpenAiErrorMessage(response.status, detail);
    return fallbackToLocalReview(`${options.reason || "A análise completa falhou."} A análise compacta também falhou: ${compactError}`);
  }

  const data = await response.json();
  try {
    return {
      ...parseCorvoAiResponse(data, maxScore),
      fallbackMode: options.primary ? "strategy_compact_primary" : "strategy_compact",
      fallbackReason: options.reason || ""
    };
  } catch (error) {
    return fallbackToLocalReview(`${options.reason || "A análise completa falhou."} A análise compacta respondeu fora do JSON esperado: ${String(error?.message || error).slice(0, 140)}`);
  }
}

function buildCompactCorvoAiPrompt(report, options = {}) {
  const maxScore = Number(report.scoreLimits?.maxScore ?? report.score?.maxScore ?? 10);
  const payload = {
    mode: "COMPACT_STRATEGY_AI",
    fallbackReason: options.reason || null,
    format: report.format,
    commander: report.commander ? {
      name: report.commander.displayName || report.commander.canonicalName,
      canonicalName: report.commander.canonicalName,
      colorIdentity: report.commander.colorIdentity || [],
      tags: report.commander.tags || [],
      oracleText: report.commander.oracleText || ""
    } : null,
    catalogQuality: {
      recognized: report.catalogQuality?.recognized,
      total: report.catalogQuality?.total,
      recognitionRate: report.catalogQuality?.recognitionRate,
      unrecognizedCount: report.catalogQuality?.unrecognizedCount,
      unrecognizedCards: (report.catalogQuality?.unrecognizedCards || [])
        .slice(0, 16)
        .map((card) => card.inputName || card.name || card.normalizedName || String(card))
    },
    technicalSummary: {
      totalWithCommander: report.statistics?.totalWithCommander,
      lands: report.statistics?.types?.lands,
      creatures: report.statistics?.types?.creatures,
      averageManaValue: report.statistics?.averageManaValue,
      manaCurve: report.statistics?.manaCurve,
      categories: report.statistics?.categories,
      mana: report.manaAnalysis?.summary || report.manaAnalysis
    },
    archetype: report.strategy?.primaryArchetype || report.archetype,
    planA: report.strategy?.planA || report.corvoReview?.planA,
    planB: report.strategy?.planB || report.corvoReview?.planB,
    winConditions: report.winconSummary?.winConditions || report.strategy?.winConditions || [],
    packages: (report.packages || []).slice(0, 10).map((item) => ({
      label: item.label,
      count: item.count,
      status: item.status,
      interpretation: item.interpretation,
      action: item.action
    })),
    keyCards: compactAiRoleList([
      ...(report.cardRoles?.coreCards || []),
      ...(report.cardRoles?.payoffs || []),
      ...(report.cardRoles?.engines || []),
      ...(report.cardRoles?.enablers || [])
    ], 16),
    flexibleOrSuspicious: compactAiRoleList([
      ...(report.cardRoles?.flexCards || []),
      ...(report.cardRoles?.suspiciousCards || []),
      ...(report.cardRoles?.cutCandidates || [])
    ], 12),
    scoreLimits: report.scoreLimits || { maxScore, reasons: report.score?.limitReasons || [] },
    localReview: {
      summary: report.corvoReview?.summary,
      commanderUnderstanding: report.corvoReview?.commanderUnderstanding,
      finalVerdict: report.corvoReview?.finalVerdict
    }
  };

  return fixPtBrCopy([
    "Você é o Corvo, um analista profissional de Commander.",
    options.primary
      ? "Faça uma leitura estratégica compacta para caber nos limites do Worker."
      : "A análise premium completa falhou, então faça uma leitura estratégica compacta.",
    "Use SOMENTE o JSON abaixo. Não invente texto de carta, custo, tipo ou cor.",
    "Se houver cartas não reconhecidas, avise que a análise é parcial, mas ainda analise comandante, plano, estatísticas e cartas-chave reconhecidas.",
    "Respeite scoreLimits.maxScore. Não dê nota acima do teto.",
    "Escreva como consultor de deck, não como dashboard. Seja direto, útil e humano.",
    "",
    "JSON técnico compacto:",
    JSON.stringify(payload, null, 2),
    "",
    "Retorne apenas JSON válido. Seja conciso: listas com no máximo 4 itens e textos curtos.",
    "Formato:",
    JSON.stringify({
      summary: "...",
      planA: "...",
      planB: "...",
      howItWins: "...",
      manaBase: "...",
      curve: "...",
      ramp: "...",
      draw: "...",
      interaction: "...",
      protection: "...",
      commanderDependency: "...",
      keyCards: [],
      coreCards: [],
      flexCards: [],
      suspiciousCards: [],
      suggestedCuts: [],
      suggestedAdds: [],
      strengths: [],
      weaknesses: [],
      upgradePriorities: [],
      mulligan: { keep: [], mulligan: [] },
      testingPlan: [],
      finalVerdict: "...",
      score: { value: Math.min(7, maxScore), explanation: "..." }
    }, null, 2)
  ].join("\n"));
}

function compactAiRoleList(cards = [], limit = 12) {
  const seen = new Set();
  const result = [];
  for (const card of cards || []) {
    const name = card?.name || card?.displayName || card?.canonicalName || card?.inputName;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push({
      name,
      role: card.role,
      tags: card.tags || card.planContribution || [],
      reason: card.reason
    });
    if (result.length >= limit) break;
  }
  return result;
}

export function parseCorvoAiResponse(data, maxScore = 10) {
  const rawText = extractOpenAiText(data).trim();
  const analysis = parseAiAnalysisText(rawText, maxScore);
  if (!analysis) return fallbackToLocalReview("A OpenAI não devolveu JSON de análise.");
  return {
    analysis,
    text: renderAiAnalysisAsText(analysis),
    rawText,
    error: null
  };
}

export function fallbackToLocalReview(reason) {
  return {
    analysis: null,
    text: "",
    error: reason || "Análise premium indisponível no momento. Exibindo leitura técnica local."
  };
}

function extractOpenAiText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const pieces = [];
  for (const item of data?.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) pieces.push(content.text);
      if (content.type === "text" && content.text) pieces.push(content.text);
    }
  }
  return pieces.join("\n\n");
}

function buildOpenAiErrorMessage(status, detail = "") {
  if (status === 401 || status === 403) {
    return "A OpenAI recusou a chave configurada. Verifique se OPENAI_API_KEY está correta no Cloudflare.";
  }
  if (status === 429) {
    return "A OpenAI recusou a análise por limite de cota ou cobrança da conta. A leitura técnica local foi mantida.";
  }
  const cleanDetail = String(detail || "").replace(/\s+/g, " ").slice(0, 160);
  return `A OpenAI respondeu HTTP ${status}.${cleanDetail ? ` Detalhe: ${cleanDetail}` : ""}`;
}

function shouldTryCompactFallback(status) {
  return ![401, 403, 429].includes(Number(status));
}
