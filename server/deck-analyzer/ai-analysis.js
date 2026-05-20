import { localizeReportPtBr } from "./i18n/pt-BR.js";

export const AI_MODES = {
  STANDARD: "STANDARD_AI",
  DEEP: "DEEP_AI"
};

const STANDARD_ORACLE_LIMIT = 4;
const DEEP_ORACLE_LIMIT = 45;
const STANDARD_CARD_LIMIT = 30;
const DEEP_CARD_LIMIT = 120;
const STANDARD_ROLE_LIMIT = 8;
const DEEP_ROLE_LIMIT = 24;

export function normalizeAiMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["deep", "deep_ai", "profunda", "profundo"].includes(normalized)) return AI_MODES.DEEP;
  return AI_MODES.STANDARD;
}

export function buildAiTechnicalPayload(report, options = {}) {
  const mode = normalizeAiMode(options.mode);
  const relevantNames = pickOracleTextNames(report, mode);
  const cards = selectAiCards(report, mode, relevantNames).map((card) => compactCard(card, relevantNames));
  const roleLimit = mode === AI_MODES.DEEP ? DEEP_ROLE_LIMIT : STANDARD_ROLE_LIMIT;

  return {
    mode,
    format: report.format,
    commander: report.commander ? {
      name: report.commander.displayName || report.commander.canonicalName,
      canonicalName: report.commander.canonicalName,
      colorIdentity: report.commander.colorIdentity || [],
      oracleText: report.commander.oracleText || "",
      tags: report.commander.tags || []
    } : null,
    statistics: report.statistics,
    catalogQuality: report.catalogQuality,
    archetype: report.archetype,
    strategy: report.strategy,
    strategySignals: report.strategySignals,
    wincons: report.winconSummary,
    manaAnalysis: report.manaAnalysis,
    probabilityAnalysis: report.probabilityAnalysis,
    packages: report.packages,
    cardRoles: {
      coreCards: compactRoleCards(report.cardRoles?.coreCards, roleLimit),
      payoffs: compactRoleCards(report.cardRoles?.payoffs, roleLimit),
      enablers: compactRoleCards(report.cardRoles?.enablers, roleLimit),
      flexSlots: compactRoleCards(report.cardRoles?.flexCards, roleLimit),
      suspiciousCards: compactRoleCards(report.cardRoles?.suspiciousCards, roleLimit)
    },
    cards,
    diagnostics: (report.diagnostics || []).map((item) => ({
      code: item.code,
      severity: item.severity,
      message: item.message,
      evidence: item.evidence,
      suggestion: item.suggestion
    })),
    scoreLimits: report.scoreLimits || { maxScore: report.score?.maxScore ?? 10, reasons: [] },
    localCorvoReview: compactLocalCorvoReview(report.corvoReview),
    externalBenchmark: mode === AI_MODES.DEEP ? report.externalBenchmark || null : null
  };
}

export function buildAiPrompt(report, options = {}) {
  const mode = normalizeAiMode(options.mode);
  const payload = buildAiTechnicalPayload(report, { mode });
  const maxScore = payload.scoreLimits?.maxScore ?? 10;

  return [
    "Você é o Corvo, um analista profissional de Magic: The Gathering Commander.",
    "",
    "Você recebeu uma decklist já resolvida pelo catálogo local do Grimório do Corvo.",
    "Sua função não é repetir números. Sua função é interpretar os números como um jogador experiente faria.",
    "",
    "Regras obrigatórias:",
    "- Use SOMENTE o JSON técnico fornecido como fonte de verdade.",
    "- Não invente carta, texto, custo, cor, tipo ou função.",
    "- Não altere números calculados pelo backend.",
    "- Não sugira cartas fora da identidade de cor do comandante.",
    "- Não mude o arquétipo principal definido pelo strategy engine.",
    "- Se houver cartas desconhecidas, diga que a análise pode estar incompleta.",
    "- Respeite scoreLimits.maxScore.",
    `- A nota final nunca pode passar de ${maxScore}.`,
    "- Escreva em português brasileiro natural, com acentuação correta.",
    "- Não escreva como dashboard. Escreva como consultor de deck.",
    "- Seja direto: strings de 1 a 3 frases e arrays com no máximo 4 itens.",
    "- Retorne JSON puro e completo, sem markdown.",
    "- Quando usar contexto externo, trate como comparação estratégica, não como fonte dos cálculos.",
    "",
    mode === AI_MODES.DEEP
      ? "Modo DEEP_AI: você recebeu mais texto de cartas relevantes e, quando disponível, comparação externa de decks publicados."
      : "Modo STANDARD_AI: você recebeu estatísticas, tags e apenas texto de cartas relevantes para economizar custo.",
    "",
    "A análise precisa responder de forma compacta: plano A, plano B, como ganha, base de mana, curva, ramp, compra, interação, proteção, dependência do comandante, núcleo, flex slots, cortes, upgrades, mulligan e plano de teste.",
    "",
    "Dados técnicos:",
    JSON.stringify(payload, null, 2),
    "",
    "Retorne apenas JSON válido neste formato:",
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
      engines: [],
      payoffs: [],
      coreCards: [],
      flexCards: [],
      suspiciousCards: [],
      cutCandidates: [],
      suggestedCuts: [],
      suggestedAdds: [],
      strengths: [],
      weaknesses: [],
      upgradePriorities: [],
      mulligan: {
        keep: [],
        mulligan: []
      },
      matchups: {
        goodAgainst: [],
        badAgainst: []
      },
      testingPlan: [],
      finalVerdict: "...",
      score: {
        value: Math.min(7, maxScore),
        explanation: "..."
      }
    }, null, 2)
  ].join("\n");
}

export function parseAiAnalysisText(text, maxScore = 10) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const jsonText = extractJson(raw);
  const parsed = JSON.parse(jsonText);
  return normalizeAiAnalysis(parsed, maxScore);
}

export function renderAiAnalysisAsText(analysis) {
  if (!analysis) return "";
  const parts = [
    analysis.summary,
    analysis.planA ? `Plano A: ${analysis.planA}` : "",
    analysis.planB ? `Plano B: ${analysis.planB}` : "",
    analysis.howItWins ? `Como ganha: ${analysis.howItWins}` : "",
    analysis.finalVerdict,
    analysis.score?.value !== undefined ? `Nota do Corvo: ${analysis.score.value}/10. ${analysis.score.explanation || ""}` : ""
  ].filter(Boolean);
  return parts.join("\n\n");
}

function pickOracleTextNames(report, mode) {
  const limit = mode === AI_MODES.DEEP ? DEEP_ORACLE_LIMIT : STANDARD_ORACLE_LIMIT;
  const names = new Set();
  if (report.commander?.displayName) names.add(report.commander.displayName);
  for (const group of [
    report.cardRoles?.coreCards,
    report.cardRoles?.payoffs,
    report.cardRoles?.enablers,
    report.cardRoles?.suspiciousCards,
    report.cardRoles?.cutCandidates
  ]) {
    for (const card of group || []) {
      if (names.size >= limit) return names;
      names.add(card.name);
    }
  }
  for (const card of report.deck?.mainboard || []) {
    if (names.size >= limit) break;
    if (card.tags?.some((tag) => ["engine", "payoff", "finisher", "protection", "removal", "card_draw"].includes(tag))) {
      names.add(card.displayName || card.canonicalName || card.inputName);
    }
  }
  return names;
}

function compactCard(card, oracleNames) {
  const name = card.displayName || card.canonicalName || card.inputName;
  const item = {
    quantity: card.quantity,
    inputName: card.inputName,
    canonicalName: card.canonicalName,
    name,
    manaValue: card.manaValue,
    typeLine: card.typeLine,
    colorIdentity: card.colorIdentity || [],
    tags: card.tags || [],
    role: null,
    databaseStatus: card.databaseStatus
  };
  if (oracleNames.has(name)) item.oracleText = card.oracleText || "";
  return item;
}

function compactRoleCards(cards = [], limit = STANDARD_ROLE_LIMIT) {
  return cards.slice(0, limit).map((card) => ({
    name: card.name,
    role: card.role,
    synergyWithCommander: card.synergyWithCommander,
    planContribution: card.planContribution,
    verdict: card.keepCutVerdict,
    reason: card.reason
  }));
}

function selectAiCards(report, mode, oracleNames) {
  const limit = mode === AI_MODES.DEEP ? DEEP_CARD_LIMIT : STANDARD_CARD_LIMIT;
  if (mode === AI_MODES.DEEP) return (report.deck?.mainboard || []).slice(0, limit);

  const picked = new Map();
  const add = (card) => {
    if (!card || picked.size >= limit) return;
    const key = card.displayName || card.canonicalName || card.inputName || card.name;
    if (key && !picked.has(key)) picked.set(key, card);
  };

  for (const group of [
    report.cardRoles?.coreCards,
    report.cardRoles?.payoffs,
    report.cardRoles?.enablers,
    report.cardRoles?.suspiciousCards,
    report.cardRoles?.cutCandidates,
    report.cardRoles?.flexCards
  ]) {
    for (const card of group || []) add(card);
  }

  for (const card of report.deck?.mainboard || []) {
    const name = card.displayName || card.canonicalName || card.inputName;
    if (oracleNames.has(name) || card.databaseStatus !== "found") add(card);
  }

  for (const card of report.deck?.mainboard || []) {
    if (picked.size >= limit) break;
    if (card.tags?.some((tag) => ["engine", "payoff", "finisher", "protection", "removal", "card_draw", "tutor", "permanent_ramp"].includes(tag))) {
      add(card);
    }
  }

  return [...picked.values()];
}

function compactLocalCorvoReview(review) {
  if (!review) return null;
  return {
    summary: review.summary,
    commanderUnderstanding: review.commanderUnderstanding,
    planA: review.planA,
    planB: review.planB,
    finalVerdict: review.finalVerdict
  };
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) return text.slice(first, last + 1);
  return text;
}

function normalizeAiAnalysis(analysis, maxScore) {
  const value = Number(analysis?.score?.value);
  if (Number.isFinite(value) && value > maxScore) {
    analysis.score.value = maxScore;
    analysis.score.explanation = `${analysis.score.explanation || ""} Nota limitada pelo teto técnico calculado pelo backend.`.trim();
  }
  return localizeReportPtBr(analysis);
}
