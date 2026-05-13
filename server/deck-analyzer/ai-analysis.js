export function buildAiTechnicalPayload(report, entries = []) {
  return {
    commander: report.commander ? {
      displayName: report.commander.displayName,
      canonicalName: report.commander.canonicalName,
      colorIdentity: report.commander.colorIdentity
    } : null,
    format: report.format,
    status: report.status,
    statistics: report.statistics,
    archetype: report.archetype,
    tribalSummary: report.tribalSummary,
    winconSummary: report.winconSummary,
    diagnostics: report.diagnostics,
    score: report.score,
    scoreLimits: report.scoreLimits,
    deckPreview: entries.slice(0, 120).map((entry) => `${entry.quantity} ${entry.name}`)
  };
}

export function buildAiPrompt(report, entries = []) {
  return [
    "Voce e o analista de decks do Grimorio do Corvo.",
    "",
    "Analise o deck usando SOMENTE os dados tecnicos fornecidos.",
    "",
    "Regras:",
    "- Nao altere numeros.",
    "- Nao invente custo, tipo, cor ou texto de carta.",
    "- Nao diga que uma carta faz algo se essa informacao nao estiver nos dados.",
    "- Nao invente comandante.",
    "- Nao altere o arquetipo detectado pelo backend, exceto para destacar baixa confianca quando indicado.",
    "- Se houver cartas desconhecidas, diga que a analise pode estar incompleta.",
    "- Se houver erro de identidade de cor, destaque isso como prioridade maxima.",
    "- Dê sugestoes coerentes com o formato e com a identidade de cor do comandante.",
    "- Nao sugira cartas fora da identidade de cor.",
    "- Nao elogie demais se houver problemas estruturais.",
    `- Respeite scoreLimits.maxScore = ${report.scoreLimits?.maxScore ?? report.score?.maxScore ?? 0}.`,
    "- Nao use frases genericas quando houver dados especificos.",
    "",
    "Dados tecnicos:",
    JSON.stringify(buildAiTechnicalPayload(report, entries), null, 2),
    "",
    "Formato da resposta:",
    JSON.stringify({
      summary: "...",
      gamePlan: "...",
      strengths: [],
      weaknesses: [],
      whatIsMissing: [],
      suggestedAdds: [{ name: "...", reason: "..." }],
      suggestedCuts: [{ name: "...", reason: "..." }],
      upgradePlan: [],
      finalVerdict: "...",
      score: { value: report.score?.final ?? 0, reason: "..." }
    }, null, 2)
  ].join("\n");
}
