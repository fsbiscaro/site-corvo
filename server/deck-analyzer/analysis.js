import { detectArchetype } from "./archetype-detector.js";
import { findAiCandidateNames } from "./analysis-helpers.js";
import { analyzeCardRoles } from "./card-role-analyzer.js";
import { findCommanderProfile } from "./commander-profiles.js";
import { buildCorvoStrategy, strategyToLegacyArchetype } from "./corvo-strategy-engine.js";
import { enrichCardsWithCatalog, normalizeCardName, resolveCommanderCard } from "./catalog.js";
import { buildCorvoReview } from "./corvo-review-engine.js";
import { buildDiagnostics } from "./diagnostics.js";
import { expectedTotalSize, formatLabel, normalizeFormat, validateFormatRules } from "./format-rules.js";
import { buildManaAnalysis } from "./mana-analysis.js";
import { buildPackageAnalysis } from "./package-analyzer.js";
import { parseDeckText } from "./parser.js";
import { buildProbabilityAnalysis } from "./probability-analysis.js";
import { buildRendererData } from "./renderer-data.js";
import { buildScoreCards, buildDeckScore } from "./score.js";
import { detectStrategySignals } from "./strategy-signal-detector.js";
import { buildDeckStatistics } from "./statistics.js";
import { buildTribalSummary } from "./tribal-analyzer.js";
import { detectWincons } from "./wincon-detector.js";

export async function analyzeDeckRequest({ deckText, format = "casual", commander = null }, context = {}) {
  const includeTechnicalJson = Boolean(context.includeTechnicalJson);
  const normalizedFormat = normalizeFormat(format);
  const parsed = parseDeckText(deckText);
  const rawDeckCards = [...parsed.mainboard];
  if (!rawDeckCards.length) return errorReport("DECKLIST_REQUIRED", "Cole uma decklist valida.", normalizedFormat, parsed);

  const selectedCommander = await resolveCommanderCard(commander, context.env, context.requestUrl);
  const enrichedDeck = mergeCards(await enrichCardsWithCatalog(rawDeckCards, context.env, context.requestUrl, context.catalogOptions || {}));
  const statistics = buildDeckStatistics({ cards: enrichedDeck, parsedDeck: parsed, commander: selectedCommander, format: normalizedFormat });
  const commanderProfile = findCommanderProfile(selectedCommander);
  const tribalSummary = buildTribalSummary({ cards: enrichedDeck, commanderProfile });
  const validation = validateFormatRules({ format: normalizedFormat, commander: selectedCommander, statistics, cards: enrichedDeck, parsedDeck: parsed });
  let winconSummary = detectWincons({ statistics, tribalSummary, commanderProfile, commander: selectedCommander });
  const strategySignals = detectStrategySignals({ cards: enrichedDeck, commander: selectedCommander, commanderProfile, tribalSummary, statistics, winconSummary });
  const strategy = applyRecognitionGateToStrategy(buildCorvoStrategy({
    signals: strategySignals.signals,
    signalDetails: strategySignals.details,
    commander: selectedCommander,
    commanderProfile,
    tribalSummary,
    statistics,
    winconSummary,
    cards: enrichedDeck
  }), statistics);
  winconSummary = mergeStrategyWincons(winconSummary, strategy);
  const legacyArchetype = detectArchetype({ commander: selectedCommander, commanderProfile, statistics, tribalSummary, tagCounts: statistics.tagCounts, enrichedDeck, winconSummary });
  const archetype = strategyToLegacyArchetype(strategy, legacyArchetype);
  const diagnostics = buildDiagnostics({ format: normalizedFormat, commander: selectedCommander, commanderProfile, statistics, validation, tribalSummary, winconSummary, archetype });
  const score = buildDeckScore({ format: normalizedFormat, statistics, validation, archetype, commanderProfile, tribalSummary, winconSummary });
  const scoreLimits = { maxScore: score.maxScore, reasons: score.limitReasons };
  const manaAnalysis = buildManaAnalysis({ cards: enrichedDeck, commander: selectedCommander, statistics });
  const probabilityAnalysis = buildProbabilityAnalysis({ statistics });
  const cardRoles = analyzeCardRoles({ cards: enrichedDeck, commander: selectedCommander, commanderProfile, tribalSummary, winconSummary, archetype, strategy, strategySignals });
  const packages = buildPackageAnalysis({ statistics, manaAnalysis, probabilityAnalysis, cardRoles, commanderProfile, tribalSummary, winconSummary, strategy });
  const catalogQuality = buildCatalogQuality(statistics, enrichedDeck);
  const corvoReview = buildCorvoReview({ commander: selectedCommander, statistics, manaAnalysis, probabilityAnalysis, cardRoles, packages, winconSummary, archetype, strategy, tribalSummary, score, diagnostics, externalBenchmark: null });
  const scores = buildScoreCards(score, statistics);
  const renderData = buildRendererData({ commander: selectedCommander, statistics, tribalSummary, score, archetype, winconSummary, strategy, manaAnalysis, probabilityAnalysis, packages, cardRoles, catalogQuality });

  if (validation.blockingErrors.length) {
    return {
      status: "error",
      analysisLevel: "local_catalog",
      format: normalizedFormat,
      errors: validation.blockingErrors,
      warnings: [...parsed.warnings, ...validation.warnings],
      commander: selectedCommander,
      commanderProfile,
      deckColorIdentity: statistics.colorIdentity,
      statistics,
      tribalSummary,
      winconSummary,
      strategy,
      strategySignals,
      manaAnalysis,
      probabilityAnalysis,
      cardRoles,
      packages,
      catalogQuality,
      corvoReview,
      diagnostics,
      score,
      scoreLimits,
      scores,
      summary: buildSummary(statistics),
      types: statistics.types,
      roles: statistics.roles,
      curve: statistics.mana.curve,
      archetype,
      renderData,
      advice: diagnostics.map((item) => item.message),
      aiAnalysis: null,
      aiText: ""
    };
  }

  const status = validation.warnings.length || statistics.unknownCards ? "partial" : "complete";
  const report = {
    status,
    analysisLevel: "local_catalog",
    format: normalizedFormat,
    commander: selectedCommander,
    commanderProfile,
    deckColorIdentity: statistics.colorIdentity,
    deck: {
      mainboard: enrichedDeck,
      sideboard: parsed.sideboard,
      commanderSection: parsed.commander
    },
    statistics,
    tribalSummary,
    winconSummary,
    strategy,
    strategySignals,
    manaAnalysis,
    probabilityAnalysis,
    cardRoles,
    packages,
    catalogQuality,
    corvoReview,
    diagnostics,
    warnings: [...parsed.warnings, ...validation.warnings],
    errors: parsed.errors,
    archetype,
    score,
    scoreLimits,
    summary: buildSummary(statistics),
    types: statistics.types,
    roles: statistics.roles,
    curve: statistics.mana.curve,
    verdict: buildVerdict({ commander: selectedCommander, statistics, archetype, score }),
    identity: buildIdentity(archetype, statistics, selectedCommander, tribalSummary),
    scores,
    strengths: buildStrengths({ statistics, archetype, tribalSummary, winconSummary }),
    risks: diagnostics.filter((item) => item.severity !== "info").map((item) => item.message),
    advice: buildAdvice({ statistics, diagnostics, archetype, commanderProfile, tribalSummary }),
    upgradePlan: buildUpgradePlan({ statistics, diagnostics, commanderProfile, tribalSummary }),
    playtest: buildPlaytestPlan({ statistics, winconSummary }),
    corvoNote: buildCorvoNote({ commander: selectedCommander, commanderProfile, statistics, archetype, tribalSummary }),
    renderData,
    technicalJson: includeTechnicalJson ? buildTechnicalJson({ commander: selectedCommander, commanderProfile, statistics, tribalSummary, winconSummary, strategy, strategySignals, diagnostics, archetype, score, scoreLimits, format: normalizedFormat, deck: enrichedDeck, manaAnalysis, probabilityAnalysis, cardRoles, packages, catalogQuality, corvoReview, externalBenchmark: null }) : null,
    aiAnalysis: null,
    aiText: ""
  };

  return report;
}

export function generateDatabaseDraftForUnknownCards(unknownCards = []) {
  return {
    prompt: [
      "Voce esta ajudando a preencher uma database local de cartas de Magic: The Gathering para um analisador de decks.",
      "Para cada carta, gere um objeto CardInfo. Se nao tiver certeza, use null e marque needsReview: true.",
      "Nao invente dados e nao aprove automaticamente nenhuma carta."
    ].join("\n"),
    payload: { unknown_cards: [...new Set(unknownCards)].filter(Boolean) },
    requiredReview: true
  };
}

function buildSummary(statistics) {
  return {
    total: statistics.totalCardsInDecklist,
    totalWithCommander: statistics.totalWithCommander,
    foundTotal: statistics.recognizedCards,
    colors: statistics.colors.deckColorIdentityLabel,
    averageManaValue: statistics.averageManaValue || "-",
    notFound: statistics.unknownCardNames,
    source: "Catalogo local"
  };
}

function buildVerdict({ commander, statistics, archetype, score }) {
  const title = commander?.displayName ? `${commander.displayName}: ${scoreTitle(score.final)}` : scoreTitle(score.final);
  const subtitle = `Nota tecnica ${score.final ?? "-"}/10 (teto ${score.maxScore}/10). ${statistics.types.lands} terrenos, ${statistics.mana.permanentRamp} ramp permanente, ${statistics.functions.cardDraw} compra e ${statistics.functions.interaction} interacoes. Arquétipo: ${archetype.primary}.`;
  return { title, subtitle, score: score.final, tier: scoreTitle(score.final) };
}

function buildIdentity(archetype, statistics, commander, tribalSummary) {
  const tags = [archetype.primary, ...(archetype.secondary || [])];
  if (tribalSummary?.primaryTribe) tags.push(`Tribo: ${tribalSummary.primaryTribe}`);
  return {
    headline: commander?.displayName
      ? `O deck foi lido como ${archetype.primary}, ancorado em ${commander.displayName}.`
      : `O deck aponta para ${archetype.primary}.`,
    colors: statistics.colors.deckColorIdentityLabel,
    commander: commander?.displayName || null,
    tags
  };
}

function buildStrengths({ statistics, archetype, tribalSummary, winconSummary }) {
  const strengths = [];
  if (statistics.recognitionRatio >= 0.98) strengths.push("A lista foi reconhecida quase por completo pelo catalogo local, sem depender de estimativa textual.");
  if (tribalSummary?.primaryTribe) strengths.push(`O pacote tribal de ${tribalSummary.primaryTribe} ja aparece com densidade mensuravel.`);
  if (statistics.mana.permanentRamp >= 8) strengths.push("O pacote de ramp permanente esta em faixa saudavel para sustentar o plano.");
  if (statistics.functions.cardDraw >= 6) strengths.push("Ha compra/valor suficiente para o deck nao morrer so da mao inicial.");
  if ((winconSummary?.primaryWincons || []).length) strengths.push(`O deck ja mostra linhas de vitoria em ${winconSummary.primaryWincons.slice(0, 2).map((item) => item.label.toLowerCase()).join(" e ")}.`);
  if (archetype.confidence >= 0.7) strengths.push(`O plano de ${archetype.primary} aparece com evidencias claras.`);
  return strengths;
}

function buildAdvice({ diagnostics, archetype, commanderProfile, tribalSummary }) {
  const advice = [];
  if (archetype?.evidence?.length) advice.push(archetype.evidence[0]);
  if (commanderProfile?.tribe && tribalSummary) {
    advice.push(tribalSummary.tribalCreatureRatio >= 0.6
      ? `A densidade tribal de ${tribalSummary.primaryTribe} sustenta bem o plano da comandante.`
      : `Apesar da comandante ser tribal de ${tribalSummary.primaryTribe}, a lista ainda tem densidade tribal baixa.`);
  }
  for (const item of diagnostics.filter((entry) => entry.severity !== "info").slice(0, 5)) advice.push(item.message);
  return [...new Set(advice)].slice(0, 6);
}

function buildUpgradePlan({ statistics, diagnostics, commanderProfile, tribalSummary }) {
  const urgent = diagnostics.filter((item) => item.severity === "warning").slice(0, 3).map((item) => item.message);
  const polish = [];
  if (commanderProfile?.tribe && tribalSummary?.tribalPayoffs < 3) polish.push(`Aumente os payoffs de ${tribalSummary.primaryTribe} para converter a densidade tribal em letal.`);
  if (statistics.mana.permanentRamp < 8) polish.push("Reforce ramp permanente antes de upgrades chamativos.");
  if (statistics.functions.cardDraw < 6) polish.push("Inclua mais motores de compra para o deck respirar depois do turno 4.");
  if (statistics.functions.interaction < 6) polish.push("Suba a densidade de interação para nao depender so da corrida do proprio plano.");
  if (!polish.length) polish.push("Com a base em ordem, teste slots flexiveis alinhados ao arquétipo detectado.");

  return [
    { title: "1. Prioridade tecnica", items: urgent.length ? urgent : ["Nenhum bloqueio estrutural grave apareceu na leitura local."] },
    { title: "2. Lapidacao estrategica", items: polish },
    { title: "3. Plano de teste", items: ["Jogue tres partidas anotando mana travada, mao vazia e momento em que o deck tenta fechar.", "Troque poucas cartas por rodada para medir impacto real em vez de ruído."] }
  ];
}

function buildPlaytestPlan({ statistics, winconSummary }) {
  const lines = [
    "Anote se as cores certas aparecem ate o turno 3.",
    statistics.functions.cardDraw < 6 ? "Marque em qual turno sua mao fica vazia." : "Observe se as compras aparecem em janelas realmente relevantes.",
    statistics.functions.interaction < 6 ? "Liste permanentes ou linhas de combo que voce nao conseguiu responder." : "Cheque se as respostas cobrem mesa, stack e permanentes problematicas."
  ];
  if (winconSummary?.missingWinconWarning) lines.push("Anote toda partida em que voce estabiliza, mas nao consegue transformar vantagem em finalizacao.");
  return lines;
}

function buildCorvoNote({ commander, commanderProfile, statistics, archetype, tribalSummary }) {
  const subject = commander?.displayName ? `Li sua lista com ${commander.displayName} como comandante` : "Li sua lista";
  const coverage = ` e reconheci ${statistics.recognizedCards} de ${statistics.totalCardsInDecklist} cartas no catalogo local.`;
  if (commanderProfile?.secondaryArchetypes?.length) {
    return `${subject}${coverage} O plano mais provavel e ${archetype.primary}, com foco em ${joinNatural(commanderProfile.secondaryArchetypes.map((item) => item.toLowerCase()))}.`;
  }
  const plan = ` O plano mais provavel e ${archetype.primary}`;
  const tribalText = tribalSummary
    ? `, com ${Math.round(tribalSummary.tribalCreatureRatio * 100)}% das criaturas focadas em ${tribalSummary.primaryTribe}.`
    : ".";
  return `${subject}${coverage}${plan}${tribalText}`;
}

export function attachExternalBenchmark(report, externalBenchmark = null) {
  if (!report || report.status === "error") return report;
  report.externalBenchmark = externalBenchmark;
  if (externalBenchmark) {
    report.corvoReview = buildCorvoReview({
      commander: report.commander,
      statistics: report.statistics,
      manaAnalysis: report.manaAnalysis,
      probabilityAnalysis: report.probabilityAnalysis,
      cardRoles: report.cardRoles,
      packages: report.packages,
      winconSummary: report.winconSummary,
      archetype: report.archetype,
      strategy: report.strategy,
      tribalSummary: report.tribalSummary,
      score: report.score,
      diagnostics: report.diagnostics,
      externalBenchmark
    });
  }
  report.technicalJson = buildTechnicalJson({
    commander: report.commander,
    commanderProfile: report.commanderProfile,
    statistics: report.statistics,
    tribalSummary: report.tribalSummary,
    winconSummary: report.winconSummary,
    strategy: report.strategy,
    strategySignals: report.strategySignals,
    diagnostics: report.diagnostics,
    archetype: report.archetype,
    score: report.score,
    scoreLimits: report.scoreLimits,
    format: report.format,
    deck: report.deck?.mainboard || [],
    manaAnalysis: report.manaAnalysis,
    probabilityAnalysis: report.probabilityAnalysis,
    cardRoles: report.cardRoles,
    packages: report.packages,
    catalogQuality: report.catalogQuality,
    corvoReview: report.corvoReview,
    externalBenchmark
  });
  return report;
}

function buildTechnicalJson({ commander, commanderProfile, statistics, tribalSummary, winconSummary, strategy, strategySignals, diagnostics, archetype, score, scoreLimits, format, deck = [], manaAnalysis, probabilityAnalysis, cardRoles, packages, catalogQuality, corvoReview, externalBenchmark }) {
  return {
    commander: commander ? {
      displayName: commander.displayName,
      canonicalName: commander.canonicalName,
      colorIdentity: commander.colorIdentity,
      oracleText: commander.oracleText || "",
      tags: commander.tags || []
    } : null,
    commanderProfile,
    format,
    statistics,
    catalogQuality,
    deck: {
      cards: deck.map(compactCardForTechnicalJson)
    },
    manaAnalysis,
    probabilityAnalysis,
    cardRoles,
    packages,
    tribalSummary,
    winconSummary,
    strategy,
    strategySignals,
    diagnostics,
    archetype,
    score,
    scoreLimits,
    corvoReview,
    externalBenchmark,
    aiCandidates: findAiCandidateNames({ diagnostics, statistics })
  };
}

function compactCardForTechnicalJson(card) {
  return {
    quantity: card.quantity,
    inputName: card.inputName,
    canonicalName: card.canonicalName,
    printedName: card.printedName,
    displayName: card.displayName,
    manaValue: card.manaValue,
    typeLine: card.typeLine,
    oracleText: card.oracleText || "",
    colorIdentity: card.colorIdentity || [],
    tags: card.tags || [],
    databaseStatus: card.databaseStatus
  };
}

function mergeStrategyWincons(winconSummary, strategy) {
  const current = Array.isArray(winconSummary?.primaryWincons) ? [...winconSummary.primaryWincons] : [];
  const labels = new Set(current.map((item) => item.label));
  for (const label of strategy?.winConditions || []) {
    if (!label || labels.has(label)) continue;
    current.push({
      label,
      confidence: strategy?.confidenceLevel || "medium",
      evidence: strategy?.primaryArchetype?.evidence?.slice?.(0, 2) || ["Linha detectada pelo motor estratégico."]
    });
    labels.add(label);
  }
  return {
    ...(winconSummary || {}),
    primaryWincons: current,
    missingWinconWarning: current.length ? false : Boolean(winconSummary?.missingWinconWarning)
  };
}

function applyRecognitionGateToStrategy(strategy, statistics) {
  const ratio = Number(statistics?.recognitionRatio || 0);
  if (!strategy?.primaryArchetype || ratio >= 0.98) return strategy;

  const gate = ratio >= 0.95
    ? { maxConfidence: 0.74, level: "medium_high", message: "Confiança limitada porque algumas cartas não foram reconhecidas." }
    : ratio >= 0.9
      ? { maxConfidence: 0.65, level: "medium", message: "Confiança limitada por reconhecimento abaixo de 95%." }
      : { maxConfidence: 0.54, level: "low_medium", message: "Confiança baixa porque menos de 90% da lista foi reconhecida." };

  const primary = {
    ...strategy.primaryArchetype,
    confidence: Number(Math.min(Number(strategy.primaryArchetype.confidence || 0), gate.maxConfidence).toFixed(2)),
    evidence: [...(strategy.primaryArchetype.evidence || []), gate.message],
    missing: [...(strategy.primaryArchetype.missing || []), `${statistics.unknownCards} carta(s) pendente(s) de reconhecimento.`]
  };

  return {
    ...strategy,
    primaryArchetype: primary,
    confidenceLevel: gate.level,
    archetypeScores: (strategy.archetypeScores || []).map((item, index) => index === 0 ? { ...item, confidence: primary.confidence } : item)
  };
}

function buildCatalogQuality(statistics, cards = []) {
  const unknownCards = (cards || []).filter((card) => card.databaseStatus === "unknown");
  return {
    recognized: statistics.recognizedCards,
    total: statistics.totalCardsInDecklist,
    unrecognized: statistics.unknownCards,
    unrecognizedCount: statistics.unknownCards,
    recognitionRatio: Number((statistics.recognitionRatio || 0).toFixed(4)),
    recognitionRate: Number((statistics.recognitionRatio || 0).toFixed(4)),
    unrecognizedCards: statistics.unknownCardNames || [],
    unrecognizedDetails: buildUnrecognizedDetails(statistics, unknownCards),
    catalogUpdateSuggestions: buildCatalogUpdateSuggestions(statistics, unknownCards)
  };
}

function buildUnrecognizedDetails(statistics, unknownCards = []) {
  const byName = new Map(unknownCards.map((card) => [String(card.inputName || card.name || "").trim(), card]));
  return (statistics.unknownCardNames || []).map((name) => {
    const card = byName.get(name) || {};
    const debug = card.resolutionDebug || {};
    const attempts = Array.isArray(debug.attempts) ? debug.attempts : [];
    return {
      inputName: name,
      normalizedName: normalizeCardName(name),
      reason: debug.reason || "Nao houve match exato em nome canonico, nomes impressos traduzidos ou fallback local.",
      attempts,
      resolutionAttempts: attempts,
      suggestions: buildAliasSuggestions(name, attempts),
      checks: {
        accentInsensitiveName: true,
        englishCanonicalName: true,
        printedNamesAliases: true,
        parentheticalName: true,
        splitCardFaces: true
      }
    };
  });
}

function buildCatalogUpdateSuggestions(statistics, unknownCards = []) {
  const byName = new Map(unknownCards.map((card) => [String(card.inputName || card.name || "").trim(), card]));
  return (statistics.unknownCardNames || []).map((name) => ({
    inputName: name,
    normalizedName: normalizeCardName(name),
    attempts: byName.get(name)?.resolutionDebug?.attempts || [],
    suggestions: buildAliasSuggestions(name, byName.get(name)?.resolutionDebug?.attempts || []),
    action: "review_alias_or_add_card",
    needsReview: true
  }));
}

function buildAliasSuggestions(name, attempts = []) {
  const clean = String(name || "").trim();
  const fromAttempts = attempts
    .map((item) => item?.value || item?.name || item)
    .filter(Boolean)
    .map((item) => String(item).trim())
    .filter((item) => item && normalizeCardName(item) !== normalizeCardName(clean));
  return [...new Set(fromAttempts)].slice(0, 6);
}

function mergeCards(cards) {
  const byKey = new Map();
  for (const card of cards) {
    const key = normalizeCardName(card.canonicalName || card.inputName || card.name);
    const current = byKey.get(key);
    if (current) current.quantity += Number(card.quantity || 0);
    else byKey.set(key, { ...card, quantity: Number(card.quantity || 0) });
  }
  return [...byKey.values()];
}

function scoreTitle(score) {
  if (score >= 8) return "bem encaminhado";
  if (score >= 6) return "jogavel, mas pede lapidacao";
  if (score > 0) return "precisa de base antes de upgrades caros";
  return "analise bloqueada";
}

function joinNatural(items = []) {
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} e ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

function errorReport(code, message, format, parsed) {
  return {
    status: "error",
    analysisLevel: "local_catalog",
    format,
    errors: [{ code, severity: "critical", message }],
    warnings: parsed?.warnings || [],
    summary: buildSummary({
      totalCardsInDecklist: 0,
      totalWithCommander: 0,
      recognizedCards: 0,
      colors: { deckColorIdentityLabel: "Nao identificado" },
      averageManaValue: 0,
      unknownCardNames: []
    })
  };
}
