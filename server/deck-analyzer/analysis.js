import { enrichCardsWithCatalog, normalizeCardName, normalizeColors, resolveCommanderCard } from "./catalog.js";
import { parseDeckText } from "./parser.js";

export const COMMANDER_FORMATS = new Set(["commander", "brawl", "historic_brawl"]);
const COLOR_LABELS = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };

export async function analyzeDeckRequest({ deckText, format = "casual", commander = null }, context = {}) {
  const normalizedFormat = normalizeFormat(format);
  const parsed = parseDeckText(deckText);
  const rawDeckCards = [...parsed.commander, ...parsed.mainboard];
  if (!rawDeckCards.length) {
    return errorReport("DECKLIST_REQUIRED", "Cole uma decklist valida.", normalizedFormat, parsed);
  }

  const selectedCommander = await resolveCommanderCard(commander, context.env, context.requestUrl);
  const enrichedCards = mergeCards(await enrichCardsWithCatalog(rawDeckCards, context.env, context.requestUrl));
  const statistics = buildLocalStatistics(enrichedCards, selectedCommander, normalizedFormat);
  const validation = validateDeck({ format: normalizedFormat, commander: selectedCommander, statistics, cards: enrichedCards });
  const archetype = detectArchetype({ cards: enrichedCards, commander: selectedCommander, statistics });
  const diagnostics = runLocalDiagnostics({ format: normalizedFormat, commander: selectedCommander, statistics, validation, archetype });
  const scoreLimits = buildScoreLimits({ format: normalizedFormat, statistics, validation, archetype });
  const scores = buildScores({ statistics, scoreLimits });
  const overallScore = Math.min(scoreLimits.maxScore, average(scores.map((score) => score.score)));

  if (validation.blockingErrors.length) {
    return {
      status: "error",
      analysisLevel: "local_catalog",
      format: normalizedFormat,
      errors: validation.blockingErrors,
      warnings: [...parsed.warnings, ...validation.warnings],
      commander: selectedCommander,
      deckColorIdentity: statistics.colorIdentity,
      statistics,
      diagnostics,
      scoreLimits,
      summary: buildSummary(statistics),
      types: statistics.types,
      roles: statistics.roles,
      curve: statistics.manaCurve,
      advice: diagnostics.map((item) => item.message)
    };
  }

  const status = validation.warnings.some((warning) => warning.code === "COMMANDER_INCLUDED_IN_DECKLIST") ? "partial" : "complete";
  const report = {
    status,
    analysisLevel: "local_catalog",
    format: normalizedFormat,
    commander: selectedCommander,
    deckColorIdentity: statistics.colorIdentity,
    deck: {
      mainboard: enrichedCards,
      sideboard: parsed.sideboard,
      commanderSection: parsed.commander
    },
    statistics,
    diagnostics,
    warnings: [...parsed.warnings, ...validation.warnings],
    errors: parsed.errors,
    archetype,
    scoreLimits,
    summary: buildSummary(statistics),
    types: statistics.types,
    roles: statistics.roles,
    curve: statistics.manaCurve,
    verdict: buildVerdict({ commander: selectedCommander, statistics, archetype, overallScore }),
    identity: buildIdentity(archetype, statistics, selectedCommander),
    scores,
    strengths: buildStrengths({ statistics, archetype }),
    risks: diagnostics.map((item) => item.message),
    advice: buildAdvice({ statistics, diagnostics, archetype }),
    upgradePlan: buildUpgradePlan({ statistics, diagnostics }),
    playtest: buildPlaytestPlan({ statistics }),
    corvoNote: buildCorvoNote({ commander: selectedCommander, statistics, archetype, status }),
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

function validateDeck({ format, commander, statistics, cards }) {
  const blockingErrors = [];
  const warnings = [];
  const isCommanderLike = COMMANDER_FORMATS.has(format);

  if (!isCommanderLike) {
    if (statistics.sideboardCards > 15) warnings.push({ code: "SIDEBOARD_TOO_LARGE", message: "O sideboard tem mais de 15 cartas." });
    return { blockingErrors, warnings };
  }

  if (!commander?.name) {
    blockingErrors.push({ code: "COMMANDER_REQUIRED", message: "Selecione seu comandante antes de analisar o deck." });
    return { blockingErrors, warnings };
  }

  if (commander.canBeCommander === false) {
    blockingErrors.push({ code: "COMMANDER_NOT_LEGAL", message: "A carta selecionada nao parece ser valida como comandante." });
  }

  const missingColors = statistics.colorIdentity.filter((color) => !commander.colorIdentity.includes(color));
  if (missingColors.length) {
    blockingErrors.push({
      code: "COMMANDER_COLOR_IDENTITY_MISMATCH",
      message: `O comandante selecionado tem identidade ${formatColors(commander.colorIdentity)}, mas o deck contem ${formatColors(missingColors)}.`
    });
  }

  if (commanderAppearsInDecklist(commander, cards)) {
    warnings.push({
      code: "COMMANDER_INCLUDED_IN_DECKLIST",
      message: "O comandante selecionado tambem aparece na decklist. Em Commander, normalmente ele fica separado das 99 cartas."
    });
  }

  const expectedDecklistSize = expectedMainboardSize(format);
  if (statistics.totalCardsInDecklist !== expectedDecklistSize) {
    blockingErrors.push({
      code: "COMMANDER_DECK_SIZE_INVALID",
      message: `Para ${formatLabel(format)}, cole ${expectedDecklistSize} cartas na lista e deixe o comandante no campo separado. Recebi ${statistics.totalCardsInDecklist}.`
    });
  }

  return { blockingErrors, warnings };
}

function buildLocalStatistics(cards, commander, format) {
  const totalCardsInDecklist = sumQuantities(cards);
  const tagCounts = {};
  const manaCurve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  const colorIdentitySet = new Set();
  const unknownCards = [];
  const types = {
    Terrenos: 0,
    Criaturas: 0,
    Artefatos: 0,
    Encantamentos: 0,
    Instantaneas: 0,
    Feiticos: 0,
    Planeswalkers: 0,
    Batalhas: 0
  };

  let knownCards = 0;
  let nonLandCards = 0;
  let manaValueTotal = 0;

  for (const card of cards) {
    const quantity = Number(card.quantity || 0);
    if (card.databaseStatus === "unknown") {
      unknownCards.push(card.inputName || card.name);
      continue;
    }

    knownCards += quantity;
    for (const color of card.colorIdentity || []) colorIdentitySet.add(color);
    for (const tag of card.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + quantity;

    if (hasType(card, "Land")) types.Terrenos += quantity;
    if (hasType(card, "Creature")) types.Criaturas += quantity;
    if (hasType(card, "Artifact")) types.Artefatos += quantity;
    if (hasType(card, "Enchantment")) types.Encantamentos += quantity;
    if (hasType(card, "Instant")) types.Instantaneas += quantity;
    if (hasType(card, "Sorcery")) types.Feiticos += quantity;
    if (hasType(card, "Planeswalker")) types.Planeswalkers += quantity;
    if (hasType(card, "Battle")) types.Batalhas += quantity;

    if (!hasType(card, "Land")) {
      nonLandCards += quantity;
      const manaValue = Number(card.manaValue || 0);
      manaValueTotal += manaValue * quantity;
      const bucket = Math.min(Math.floor(manaValue), 7);
      manaCurve[bucket] = (manaCurve[bucket] || 0) + quantity;
    }
  }

  const roles = {
    "Ramp permanente": tagCounts.permanent_ramp || 0,
    "Mana explosiva": tagCounts.burst_mana || 0,
    "Redutores": tagCounts.cost_reducer || 0,
    Compra: tagCounts.card_draw || 0,
    Selecao: tagCounts.card_selection || 0,
    Remocao: tagCounts.removal || 0,
    Protecao: tagCounts.protection || 0,
    Recursao: tagCounts.recursion || 0,
    Tutores: tagCounts.tutor || 0
  };

  return {
    totalCardsInDecklist,
    totalWithCommander: totalCardsInDecklist + (COMMANDER_FORMATS.has(format) && commander?.name ? 1 : 0),
    sideboardCards: 0,
    knownCards,
    foundTotal: knownCards,
    unknownCards: [...new Set(unknownCards)],
    unknownRatio: totalCardsInDecklist ? unknownCards.length / cards.length : 0,
    colorIdentity: normalizeColors([...colorIdentitySet]),
    colorsLabel: formatColors([...colorIdentitySet]),
    averageManaValue: nonLandCards ? Number((manaValueTotal / nonLandCards).toFixed(2)) : 0,
    manaCurve,
    types,
    tagCounts,
    roles
  };
}

function detectArchetype({ cards, commander, statistics }) {
  const tags = statistics.tagCounts;
  const evidence = [];
  const rejectedArchetypes = [];
  const commanderName = normalizeCardName(commander?.name || "");

  if (commanderName.includes("yuriko") || ((tags.ninja || 0) >= 6 && ((tags.evasive || 0) + (tags.unblockable || 0)) >= 6)) {
    if (commanderName.includes("yuriko")) evidence.push("O comandante escolhido puxa o plano de Ninjas e dano de combate.");
    if ((tags.ninja || 0) >= 6) evidence.push("Ha densidade real de cartas com ninja/ninjutsu.");
    if (((tags.evasive || 0) + (tags.unblockable || 0)) >= 6) evidence.push("Varias criaturas ajudam a conectar dano em combate.");
    return archetype("Dimir Ninjas/Evasao", ["Tempo", "Valor por dano de combate"], 0.82, evidence, rejectedArchetypes);
  }

  const tribalBig = (tags.angel || 0) + (tags.demon || 0) + (tags.dragon || 0);
  if (commanderName.includes("kaalia") || tribalBig >= 8) {
    evidence.push("A lista concentra criaturas de alto impacto para pressionar a mesa.");
    if (commanderName.includes("kaalia")) evidence.push("O comandante escolhido combina com anjos, demonios e dragoes.");
    return archetype("Mardu criaturas de impacto", ["Midrange", "Ameacas voadoras"], 0.72, evidence, rejectedArchetypes);
  }

  if ((tags.counterspell || 0) + (tags.removal || 0) >= 16 && (tags.creature || 0) < 24) {
    evidence.push("A lista tem alta densidade de respostas e poucas criaturas.");
    return archetype("Controle", ["Interacao", "Card advantage"], 0.68, evidence, rejectedArchetypes);
  }

  if ((tags.token_generator || 0) < 6) {
    rejectedArchetypes.push({ name: "Tokens/mesa larga", reason: "Pouca densidade de geradores de fichas para sustentar esse plano como principal." });
  }
  if ((tags.recursion || 0) < 6) {
    rejectedArchetypes.push({ name: "Cemiterio/Recursao", reason: "Existem sinais pontuais, mas nao em quantidade suficiente para definir o arquetipo." });
  }

  evidence.push("O plano principal ainda precisa de mais cartas reconhecidas ou de uma densidade mais clara.");
  return archetype("Plano em construcao", ["Midrange", "Valor"], 0.42, evidence, rejectedArchetypes);
}

function runLocalDiagnostics({ format, commander, statistics, validation, archetype }) {
  const diagnostics = [...validation.blockingErrors.map((error) => ({ ...error, severity: "error" }))];
  const isCommanderLike = COMMANDER_FORMATS.has(format);

  for (const warning of validation.warnings) diagnostics.push({ ...warning, severity: "warning" });
  if (statistics.unknownCards.length) {
    diagnostics.push({
      code: "UNKNOWN_CARDS",
      severity: statistics.unknownRatio > 0.2 ? "warning" : "info",
      message: `${statistics.unknownCards.length} carta(s) ainda nao existem no catalogo local: ${statistics.unknownCards.slice(0, 6).join(", ")}.`
    });
  }

  if (isCommanderLike) {
    if (statistics.types.Terrenos < 34) diagnostics.push({ code: "LOW_LANDS", severity: "warning", message: "A base de terrenos parece baixa para Commander. Teste subir para 35-38 terrenos ou compensar com aceleracao consistente." });
    if (statistics.types.Terrenos > 40) diagnostics.push({ code: "HIGH_LANDS", severity: "info", message: "A lista tem muitos terrenos para a maioria dos Commanders. Confira se isso faz parte do plano." });
    if ((statistics.tagCounts.permanent_ramp || 0) < 8) diagnostics.push({ code: "LOW_PERMANENT_RAMP", severity: "warning", message: "O pacote de aceleracao permanente parece baixo. Priorize rochas de mana e fontes que ficam na mesa." });
    if ((statistics.tagCounts.card_draw || 0) < 8) diagnostics.push({ code: "LOW_CARD_DRAW", severity: "warning", message: "Pouca compra/valor detectada. O deck pode ficar sem mao no meio da partida." });
    if ((statistics.tagCounts.removal || 0) < 7) diagnostics.push({ code: "LOW_INTERACTION", severity: "warning", message: "A interacao parece pequena. Inclua respostas flexiveis para criaturas e permanentes problematicas." });
    if (commander?.name && (statistics.tagCounts.protection || 0) < 2) diagnostics.push({ code: "LOW_PROTECTION", severity: "info", message: "Pouca protecao detectada. Se o comandante for peca central, ele precisa sobreviver." });
  } else {
    if (statistics.totalCardsInDecklist < 60) diagnostics.push({ code: "LOW_MAINBOARD_SIZE", severity: "warning", message: "O mainboard tem menos de 60 cartas." });
    if (statistics.totalCardsInDecklist > 60) diagnostics.push({ code: "HIGH_MAINBOARD_SIZE", severity: "info", message: "O mainboard tem mais de 60 cartas. Isso e permitido, mas geralmente reduz consistencia." });
  }

  if (statistics.averageManaValue > 3.6) diagnostics.push({ code: "HIGH_CURVE", severity: "warning", message: "A curva esta pesada. Sem ramp suficiente, o deck pode comecar a jogar tarde." });
  if (archetype.confidence < 0.55) diagnostics.push({ code: "LOW_ARCHETYPE_CONFIDENCE", severity: "info", message: "O arquetipo ainda nao apareceu com muita seguranca nos dados reconhecidos." });

  return diagnostics;
}

function buildScoreLimits({ format, statistics, validation, archetype }) {
  let maxScore = 10;
  const reasons = [];

  if (validation.blockingErrors.length) {
    maxScore = 0;
    reasons.push("A analise foi bloqueada por erro estrutural.");
  }
  if (COMMANDER_FORMATS.has(format) && statistics.totalWithCommander !== expectedTotalSize(format)) {
    maxScore = Math.min(maxScore, 7);
    reasons.push("Quantidade de cartas fora do esperado para o formato.");
  }
  if ((statistics.tagCounts.permanent_ramp || 0) < 5 && COMMANDER_FORMATS.has(format)) {
    maxScore = Math.min(maxScore, 7.5);
    reasons.push("Pouco ramp permanente detectado.");
  }
  if ((statistics.tagCounts.protection || 0) < 2 && COMMANDER_FORMATS.has(format)) {
    maxScore = Math.min(maxScore, 7.5);
    reasons.push("Pouca protecao para um deck dependente do comandante.");
  }
  if (statistics.unknownRatio > 0.2) {
    maxScore = Math.min(maxScore, 6.5);
    reasons.push("Muitas cartas ainda desconhecidas no catalogo local.");
  }
  if (archetype.confidence < 0.55) {
    maxScore = Math.min(maxScore, 8);
    reasons.push("Arquetipo com baixa confianca.");
  }

  return { maxScore, reasons };
}

function buildScores({ statistics, scoreLimits }) {
  return [
    { label: "Estrutura", score: scoreStructure(statistics), note: `${statistics.totalCardsInDecklist} cartas na lista; ${statistics.foundTotal} reconhecidas.` },
    { label: "Mana", score: Math.round((scoreLands(statistics.types.Terrenos) + scoreRange(statistics.tagCounts.permanent_ramp || 0, 5, 8, 12)) / 2), note: `${statistics.types.Terrenos} terrenos e ${statistics.tagCounts.permanent_ramp || 0} ramp permanente.` },
    { label: "Curva", score: scoreAverageMana(statistics.averageManaValue), note: `Valor medio ${statistics.averageManaValue}.` },
    { label: "Folego", score: scoreRange(statistics.tagCounts.card_draw || 0, 4, 8, 12), note: `${statistics.tagCounts.card_draw || 0} fontes de compra/valor.` },
    { label: "Interacao", score: scoreRange(statistics.tagCounts.removal || 0, 4, 7, 11), note: `${statistics.tagCounts.removal || 0} respostas detectadas.` },
    { label: "Protecao", score: scoreRange(statistics.tagCounts.protection || 0, 2, 4, 7), note: `${statistics.tagCounts.protection || 0} protecoes detectadas.` }
  ].map((score) => ({ ...score, score: Math.min(score.score, scoreLimits.maxScore), status: scoreStatus(Math.min(score.score, scoreLimits.maxScore)) }));
}

function buildSummary(statistics) {
  return {
    total: statistics.totalCardsInDecklist,
    totalWithCommander: statistics.totalWithCommander,
    foundTotal: statistics.foundTotal,
    colors: statistics.colorsLabel,
    averageManaValue: statistics.averageManaValue || "-",
    notFound: statistics.unknownCards,
    source: "Catalogo local"
  };
}

function buildVerdict({ commander, statistics, archetype, overallScore }) {
  const title = commander?.name
    ? `${commander.name}: ${scoreTitle(overallScore)}`
    : scoreTitle(overallScore);
  return {
    title,
    subtitle: `Nota Corvo ${overallScore}/10. ${statistics.types.Terrenos} terrenos, ${statistics.roles["Ramp permanente"]} ramp permanente, ${statistics.roles.Compra} compra e ${statistics.roles.Remocao} interacoes. Arquetipo: ${archetype.primary}.`,
    score: overallScore,
    tier: scoreTitle(overallScore)
  };
}

function buildIdentity(archetype, statistics, commander) {
  return {
    headline: commander?.name
      ? `O deck foi lido como ${archetype.primary}, ancorado no comandante selecionado.`
      : `O deck aponta para ${archetype.primary}.`,
    colors: statistics.colorsLabel,
    commander: commander?.name || null,
    tags: [archetype.primary, ...archetype.secondary]
  };
}

function buildStrengths({ statistics, archetype }) {
  const strengths = [];
  if (statistics.foundTotal > 0) strengths.push("A lista foi cruzada com o catalogo local, sem depender de consulta externa durante a analise.");
  if (statistics.averageManaValue && statistics.averageManaValue <= 3.2) strengths.push("A curva media esta controlada, o que ajuda os primeiros turnos.");
  if ((statistics.tagCounts.permanent_ramp || 0) >= 8) strengths.push("O pacote de aceleracao permanente ja aparece em boa quantidade.");
  if ((statistics.tagCounts.card_draw || 0) >= 8) strengths.push("Ha uma base de compra/valor capaz de manter o deck respirando.");
  if (archetype.confidence >= 0.7) strengths.push(`O plano de ${archetype.primary} aparece com evidencias claras.`);
  return strengths.length ? strengths : ["A estrutura foi lida; o proximo passo e reforcar uma identidade principal mais nitida."];
}

function buildAdvice({ statistics, diagnostics, archetype }) {
  const advice = diagnostics.filter((item) => item.severity !== "error").slice(0, 6).map((item) => item.message);
  if (archetype.evidence.length) advice.unshift(archetype.evidence[0]);
  if (!advice.length) advice.push("A estrutura inicial parece saudavel. Agora vale lapidar sinergias, plano de vitoria e upgrades por orcamento.");
  return advice;
}

function buildUpgradePlan({ statistics, diagnostics }) {
  const urgent = diagnostics.filter((item) => item.severity === "warning").slice(0, 3).map((item) => item.message);
  const polish = [];
  if ((statistics.tagCounts.permanent_ramp || 0) < 8) polish.push("Reforce ramp permanente de custo baixo antes de upgrades chamativos.");
  if ((statistics.tagCounts.card_draw || 0) < 8) polish.push("Inclua motores de compra/valor que continuem funcionando depois da mao inicial.");
  if ((statistics.tagCounts.removal || 0) < 7) polish.push("Adicione respostas flexiveis para diferentes tipos de permanentes.");
  if (!polish.length) polish.push("Com a base em ordem, teste slots flexiveis por sinergia e plano de vitoria.");

  return [
    { title: "1. Prioridade tecnica", items: urgent.length ? urgent : ["Nenhum bloqueio estrutural grave apareceu na leitura local."] },
    { title: "2. Lapidacao", items: polish },
    { title: "3. Plano de teste", items: ["Jogue tres partidas anotando mana travada, falta de carta, falta de resposta e condicao de vitoria.", "Troque no maximo cinco cartas por rodada de teste para medir o que realmente melhorou."] }
  ];
}

function buildPlaytestPlan({ statistics }) {
  return [
    "Anote se as cores certas aparecem ate o turno 3.",
    statistics.roles.Compra < 8 ? "Marque em qual turno sua mao fica vazia." : "Observe se as compras aparecem quando voce ja gastou a mao inicial.",
    statistics.roles.Remocao < 7 ? "Liste permanentes que voce nao conseguiu responder." : "Teste se suas respostas resolvem diferentes tipos de ameaca.",
    statistics.averageManaValue > 3.6 ? "Separe cartas de custo 5+ e corte as que nao vencem ou recuperam jogo." : "Confira se as cartas baratas realmente avancam seu plano."
  ];
}

function buildCorvoNote({ commander, statistics, archetype, status }) {
  const subject = commander?.name ? `Li sua lista com ${commander.name} como comandante` : "Li sua lista";
  const coverage = ` e reconheci ${statistics.foundTotal} de ${statistics.totalCardsInDecklist} cartas no catalogo local`;
  const caveat = status === "partial" ? " Ha um ajuste pendente antes da leitura ficar perfeita." : "";
  return `${subject}${coverage}. O plano mais provavel e ${archetype.primary}. ${archetype.evidence[0] || ""}${caveat}`;
}

function commanderAppearsInDecklist(commander, cards) {
  const commanderNames = [commander.name, commander.inputName, commander.printedName].filter(Boolean).map(normalizeCardName);
  return cards.some((card) => {
    const names = [card.inputName, card.name, card.canonicalName].filter(Boolean).map(normalizeCardName);
    return names.some((name) => commanderNames.includes(name));
  });
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

function hasType(card, type) {
  return (card.cardTypes || []).includes(type) || String(card.typeLine || "").includes(type);
}

function sumQuantities(cards) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}

function expectedMainboardSize(format) {
  return format === "brawl" ? 59 : 99;
}

function expectedTotalSize(format) {
  return format === "brawl" ? 60 : 100;
}

function normalizeFormat(format) {
  return String(format || "casual").trim().toLowerCase().replace(/[\s-]+/g, "_") || "casual";
}

function formatLabel(format) {
  return ({ commander: "Commander", brawl: "Brawl", historic_brawl: "Historic Brawl" })[format] || format;
}

function formatColors(colors = []) {
  const normalized = normalizeColors(colors);
  return normalized.length ? normalized.map((color) => COLOR_LABELS[color] || color).join(", ") : "Incolor";
}

function archetype(primary, secondary, confidence, evidence, rejectedArchetypes) {
  return { primary, secondary, confidence, evidence, rejectedArchetypes };
}

function scoreStructure(statistics) {
  if (!statistics.totalCardsInDecklist) return 0;
  const coverage = statistics.totalCardsInDecklist ? statistics.foundTotal / statistics.totalCardsInDecklist : 0;
  if (coverage >= 0.95) return 10;
  if (coverage >= 0.85) return 8;
  if (coverage >= 0.65) return 6;
  return 4;
}

function scoreLands(lands) {
  if (lands >= 35 && lands <= 38) return 10;
  if (lands >= 33 && lands <= 40) return 8;
  if (lands >= 30 && lands <= 42) return 6;
  if (lands > 0) return 3;
  return 1;
}

function scoreRange(value, low, good, great) {
  if (value >= great) return 10;
  if (value >= good) return 8;
  if (value >= low) return 6;
  if (value > 0) return 4;
  return 2;
}

function scoreAverageMana(value) {
  if (!Number.isFinite(value) || value <= 0) return 4;
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

function scoreTitle(score) {
  if (score >= 8) return "bem encaminhado";
  if (score >= 6) return "jogavel, mas pede lapidacao";
  return "precisa de base antes de upgrades caros";
}

function average(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function errorReport(code, message, format, parsed) {
  return {
    status: "error",
    analysisLevel: "local_catalog",
    format,
    errors: [{ code, message }],
    warnings: parsed?.warnings || [],
    summary: buildSummary({
      totalCardsInDecklist: 0,
      totalWithCommander: 0,
      foundTotal: 0,
      colorsLabel: "Nao identificado",
      averageManaValue: 0,
      unknownCards: []
    })
  };
}
