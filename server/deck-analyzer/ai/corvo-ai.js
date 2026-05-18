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
  const prompt = buildCorvoAiPrompt(report, { mode });
  const model = getCorvoAiModel(env);
  const fetchFn = options.fetchFn || fetch;

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
      temperature: 0.35,
      max_output_tokens: mode === "DEEP_AI" ? 3200 : 2000
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return fallbackToLocalReview(`OpenAI respondeu HTTP ${response.status}. ${detail.slice(0, 160)}`);
  }

  const data = await response.json();
  return parseCorvoAiResponse(data, maxScore);
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
