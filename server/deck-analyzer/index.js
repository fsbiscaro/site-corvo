import { runBasicDiagnostics } from "./diagnostics.js";
import { parseDeckText } from "./parser.js";
import { buildDeckSummary } from "./statistics.js";

export { flattenDeckForAnalysis, parseDeckText } from "./parser.js";
export { buildDeckSummary } from "./statistics.js";
export { runBasicDiagnostics } from "./diagnostics.js";

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
