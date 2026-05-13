import { detectArchetype } from "./archetype-detector.js";
import { findAiCandidateNames } from "./analysis-helpers.js";
import { findCommanderProfile } from "./commander-profiles.js";
import { enrichCardsWithCatalog, normalizeCardName, resolveCommanderCard } from "./catalog.js";
import { buildDiagnostics } from "./diagnostics.js";
import { expectedTotalSize, formatLabel, normalizeFormat, validateFormatRules } from "./format-rules.js";
import { parseDeckText } from "./parser.js";
import { buildRendererData } from "./renderer-data.js";
import { buildScoreCards, buildDeckScore } from "./score.js";
import { buildDeckStatistics } from "./statistics.js";
import { buildTribalSummary } from "./tribal-analyzer.js";
import { detectWincons } from "./wincon-detector.js";

export async function analyzeDeckRequest({ deckText, format = "casual", commander = null }, context = {}) {
  const normalizedFormat = normalizeFormat(format);
  const parsed = parseDeckText(deckText);
  const rawDeckCards = [...parsed.mainboard];
  if (!rawDeckCards.length) return errorReport("DECKLIST_REQUIRED", "Cole uma decklist valida.", normalizedFormat, parsed);

  const selectedCommander = await resolveCommanderCard(commander, context.env, context.requestUrl);
  const enrichedDeck = mergeCards(await enrichCardsWithCatalog(rawDeckCards, context.env, context.requestUrl));
  const statistics = buildDeckStatistics({ cards: enrichedDeck, parsedDeck: parsed, commander: selectedCommander, format: normalizedFormat });
  const commanderProfile = findCommanderProfile(selectedCommander);
  const tribalSummary = buildTribalSummary({ cards: enrichedDeck, commanderProfile });
  const validation = validateFormatRules({ format: normalizedFormat, commander: selectedCommander, statistics, cards: enrichedDeck, parsedDeck: parsed });
  const winconSummary = detectWincons({ statistics, tribalSummary, commanderProfile, commander: selectedCommander });
  const archetype = detectArchetype({ commander: selectedCommander, commanderProfile, statistics, tribalSummary, tagCounts: statistics.tagCounts, enrichedDeck, winconSummary });
  const diagnostics = buildDiagnostics({ format: normalizedFormat, commander: selectedCommander, commanderProfile, statistics, validation, tribalSummary, winconSummary, archetype });
  const score = buildDeckScore({ format: normalizedFormat, statistics, validation, archetype, commanderProfile, tribalSummary, winconSummary });
  const scoreLimits = { maxScore: score.maxScore, reasons: score.limitReasons };
  const scores = buildScoreCards(score, statistics);
  const renderData = buildRendererData({ commander: selectedCommander, statistics, tribalSummary, score, archetype, winconSummary });

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

  const status = validation.warnings.length ? "partial" : "complete";
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
    technicalJson: buildTechnicalJson({ commander: selectedCommander, commanderProfile, statistics, tribalSummary, winconSummary, diagnostics, archetype, score, format: normalizedFormat }),
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

function buildTechnicalJson({ commander, commanderProfile, statistics, tribalSummary, winconSummary, diagnostics, archetype, score, format }) {
  return {
    commander: commander ? {
      displayName: commander.displayName,
      canonicalName: commander.canonicalName,
      colorIdentity: commander.colorIdentity
    } : null,
    commanderProfile,
    format,
    statistics,
    tribalSummary,
    winconSummary,
    diagnostics,
    archetype,
    score,
    aiCandidates: findAiCandidateNames({ diagnostics, statistics })
  };
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
