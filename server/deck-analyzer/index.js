import { runBasicDiagnostics } from "./diagnostics.js";
import { parseDeckText } from "./parser.js";
import { buildDeckSummary } from "./statistics.js";

export { flattenDeckForAnalysis, parseDeckText } from "./parser.js";
export { buildDeckStatistics, buildDeckSummary } from "./statistics.js";
export { buildDiagnostics, runBasicDiagnostics } from "./diagnostics.js";
export { analyzeDeckRequest, attachExternalBenchmark, generateDatabaseDraftForUnknownCards } from "./analysis.js";
export { detectArchetype } from "./archetype-detector.js";
export { ARCHETYPE_MODELS, getArchetypeModel } from "./archetype-models.js";
export { AI_MODES, buildAiPrompt, buildAiTechnicalPayload, normalizeAiMode, parseAiAnalysisText, renderAiAnalysisAsText } from "./ai-analysis.js";
export { buildCorvoAiPrompt, fallbackToLocalReview, getCorvoAiModel, isCorvoAiConfigured, parseCorvoAiResponse, runCorvoAiAnalysis } from "./ai/corvo-ai.js";
export { findCommanderProfile } from "./commander-profiles.js";
export { findCatalogCards, formatCardDisplayName, normalizeCardName, resolveCommanderCard, extractSubtypesFromTypeLine } from "./catalog.js";
export { expectedMainboardSize, expectedTotalSize, formatLabel, normalizeFormat, validateFormatRules } from "./format-rules.js";
export { buildRendererData } from "./renderer-data.js";
export { buildManaAnalysis } from "./mana-analysis.js";
export { buildPackageAnalysis } from "./package-analyzer.js";
export { buildProbabilityAnalysis, calculateHypergeometricProbability } from "./probability-analysis.js";
export { analyzeCardRoles } from "./card-role-analyzer.js";
export { buildCorvoStrategy, scoreArchetypes, strategyToLegacyArchetype } from "./corvo-strategy-engine.js";
export { buildCorvoReview } from "./corvo-review-engine.js";
export { fetchExternalCommanderBenchmark } from "./external-benchmark.js";
export { fixPtBrCopy, localizeReportPtBr } from "./i18n/pt-BR.js";
export { buildDeckScore, buildScoreCards } from "./score.js";
export { buildTribalSummary } from "./tribal-analyzer.js";
export { COMMANDER_FORMATS } from "./types.js";
export { detectStrategySignals } from "./strategy-signal-detector.js";
export { classifyAristocratsFunction, isRealSacrificeOutlet, isDeathOrDrainPayoff } from "./function-taxonomy.js";
export { detectWincons } from "./wincon-detector.js";

export function parseDeckRequest(deckText, format = "casual") {
  const parsed = parseDeckText(deckText);
  const summary = buildDeckSummary(parsed);
  const diagnosticWarnings = runBasicDiagnostics(parsed, format);

  return {
    format: String(format || "casual").trim().toLowerCase() || "casual",
    mainboard: parsed.mainboard,
    sideboard: parsed.sideboard,
    commander: parsed.commander,
    companion: parsed.companion,
    maybeboard: parsed.maybeboard,
    summary,
    warnings: [...parsed.warnings, ...diagnosticWarnings],
    errors: parsed.errors
  };
}
