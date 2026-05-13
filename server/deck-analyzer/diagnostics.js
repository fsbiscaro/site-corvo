import { COMMANDER_FORMATS } from "./types.js";

export function runBasicDiagnostics(parsedDeck, format = "casual") {
  const normalizedFormat = String(format || "casual").trim().toLowerCase();
  const warnings = [];
  const mainboardCards = count(parsedDeck.mainboard);
  const sideboardCards = count(parsedDeck.sideboard);
  const commanderCards = count(parsedDeck.commander);
  const isCommanderLike = COMMANDER_FORMATS.has(normalizedFormat);

  if (isCommanderLike && commanderCards === 0) {
    warnings.push({
      message: "Formato Commander/Brawl informado, mas nenhuma carta foi encontrada na secao Commander."
    });
  }
  if (!isCommanderLike && mainboardCards < 60) warnings.push({ message: "O mainboard tem menos de 60 cartas." });
  if (!isCommanderLike && mainboardCards > 60) warnings.push({ message: "O mainboard tem mais de 60 cartas. Isso e permitido, mas geralmente reduz consistencia." });
  if (!isCommanderLike && sideboardCards > 15) warnings.push({ message: "O sideboard tem mais de 15 cartas." });
  if (normalizedFormat === "commander" && mainboardCards + commanderCards !== 100) warnings.push({ message: "Deck Commander normalmente deve ter 100 cartas incluindo o comandante." });

  return warnings;
}

export function buildDiagnostics({ format, commander, commanderProfile, statistics, validation, tribalSummary, winconSummary, archetype }) {
  const diagnostics = [];
  const isCommanderLike = COMMANDER_FORMATS.has(format);

  diagnostics.push(...validation.blockingErrors, ...validation.warnings);

  if (statistics.unknownCardNames.length) {
    diagnostics.push({
      code: statistics.unknownRatio > 0.2 ? "MANY_UNKNOWN_CARDS" : "UNKNOWN_CARDS",
      severity: statistics.unknownRatio > 0.2 ? "warning" : "info",
      message: statistics.unknownRatio > 0.2
        ? "Ha cartas demais fora do catalogo para sustentar uma leitura confiavel."
        : "Existem cartas desconhecidas no catalogo local.",
      evidence: `${statistics.unknownCards} carta(s) sem identificacao tecnica: ${statistics.unknownCardNames.slice(0, 6).join(", ")}.`,
      suggestion: "Revise nomes, idioma ou complete o catalogo para evitar leitura incompleta."
    });
  }

  if (isCommanderLike) {
    if (statistics.types.lands < 34) {
      diagnostics.push({
        code: "LOW_LANDS",
        severity: "warning",
        message: "A base de terrenos parece baixa para Commander.",
        evidence: `Foram detectados ${statistics.types.lands} terrenos na lista.`,
        suggestion: "Suba para 35-38 terrenos ou compense com aceleracao muito consistente."
      });
    }
    if (statistics.types.lands > 40) {
      diagnostics.push({
        code: "HIGH_LANDS",
        severity: "info",
        message: "A lista tem terrenos demais para a maioria dos decks Commander.",
        evidence: `Foram detectados ${statistics.types.lands} terrenos.`,
        suggestion: "Transforme parte desses slots em compra, interacao ou payoffs, se isso nao for intencional."
      });
    }
    if (statistics.mana.permanentRamp < 8) {
      diagnostics.push({
        code: "LOW_PERMANENT_RAMP",
        severity: "warning",
        message: "O ramp permanente esta abaixo do esperado para Commander.",
        evidence: `Foram detectadas ${statistics.mana.permanentRamp} pecas de ramp permanente.`,
        suggestion: "Priorize fontes que ficam em campo para estabilizar a mana."
      });
    }
    if (statistics.mana.burstMana >= 3 && statistics.mana.permanentRamp < 6) {
      diagnostics.push({
        code: "BURST_MANA_WITHOUT_BASE",
        severity: "warning",
        message: "A lista depende demais de mana explosiva sem base permanente suficiente.",
        evidence: `${statistics.mana.burstMana} pecas de mana explosiva contra ${statistics.mana.permanentRamp} fontes permanentes.`,
        suggestion: "Troque parte dos rituais por ramp persistente."
      });
    }
    if (statistics.colors.deckColorIdentity.length >= 3 && statistics.mana.manaFixing < 5) {
      diagnostics.push({
        code: "LOW_FIXING",
        severity: "warning",
        message: "O fixing parece curto para um deck multicolorido.",
        evidence: `A identidade do deck usa ${statistics.colors.deckColorIdentity.join(", ")} e so ${statistics.mana.manaFixing} fontes de fixing foram detectadas.`,
        suggestion: "Inclua terrenos e rochas que ajudem a estabilizar as cores."
      });
    }
  }

  if (statistics.averageManaValue > 3.6) {
    diagnostics.push({
      code: "HIGH_CURVE",
      severity: "warning",
      message: "A curva media esta alta.",
      evidence: `Valor medio de mana em ${statistics.averageManaValue}.`,
      suggestion: "Corte parte das cartas caras que nao viram o jogo sozinhas."
    });
  }

  if (statistics.functions.cardDraw < 6) {
    diagnostics.push({
      code: "LOW_CARD_DRAW",
      severity: "warning",
      message: "A lista tem pouca compra ou selecao de cartas.",
      evidence: `${statistics.functions.cardDraw} compras e ${statistics.functions.cardSelection} selecoes detectadas.`,
      suggestion: "Adicione mais motores de compra para nao perder folego."
    });
  }

  if (statistics.functions.interaction < 6) {
    diagnostics.push({
      code: "LOW_INTERACTION",
      severity: "warning",
      message: "A lista tem pouca interacao.",
      evidence: `${statistics.functions.interaction} respostas detectadas entre remocoes, counters, descartes e wipes.`,
      suggestion: "Aumente o pacote de respostas para nao depender so do seu plano."
    });
  }

  if (commanderProfile?.wantsProtection && statistics.functions.protection < 2) {
    diagnostics.push({
      code: "LOW_COMMANDER_PROTECTION",
      severity: "warning",
      message: "A lista protege pouco um comandante central para o plano.",
      evidence: `${statistics.functions.protection} pecas de protecao detectadas para ${commander?.displayName}.`,
      suggestion: "Inclua mais protecao para manter o comandante em campo."
    });
  }

  if (tribalSummary) {
    if (tribalSummary.tribalCreatureRatio < 0.55 && commanderProfile?.tribe) {
      diagnostics.push({
        code: "LOW_TRIBAL_DENSITY",
        severity: "warning",
        message: `A comandante e tribal de ${tribalSummary.primaryTribe}, mas a lista tem baixa densidade dessa tribo.`,
        evidence: `Foram detectadas ${tribalSummary.tribalCreatures} criaturas da tribo entre ${tribalSummary.totalCreatures} criaturas.`,
        suggestion: `Aumente a densidade de ${tribalSummary.primaryTribe}s para melhorar a consistencia do plano.`
      });
    } else if (commanderProfile?.tribe) {
      diagnostics.push({
        code: "TRIBAL_DENSITY_OK",
        severity: "info",
        message: "A densidade tribal sustenta bem o plano da comandante.",
        evidence: `${tribalSummary.tribalCreatures} criaturas da tribo em ${tribalSummary.totalCreatures} criaturas.`,
        suggestion: "Agora a lapidacao principal e converter essa base em mais payoffs e finalizadores."
      });
    }

    if (commanderProfile?.tribe && tribalSummary.tribalPayoffs < 3) {
      diagnostics.push({
        code: "LOW_TRIBAL_PAYOFFS",
        severity: "warning",
        message: "A lista ainda tem poucos payoffs tribais claros.",
        evidence: `${tribalSummary.tribalPayoffs} payoffs tribais detectados.`,
        suggestion: "Inclua mais cartas que convertam a densidade tribal em vantagem real ou letal."
      });
    }
    if (commanderProfile?.tribe && commanderProfile.secondaryArchetypes.includes("Mesa larga") && tribalSummary.tribalTokenGenerators < 2) {
      diagnostics.push({
        code: "LOW_TRIBAL_TOKEN_GENERATORS",
        severity: "warning",
        message: "O plano pede mesa larga, mas faltam geradores de ficha tribais.",
        evidence: `${tribalSummary.tribalTokenGenerators} geradores de ficha tribais detectados.`,
        suggestion: "Aumente a geração de fichas para pressionar a mesa com mais consistencia."
      });
    }
    if (commanderProfile?.tribe && tribalSummary.tribalFinishers < 2) {
      diagnostics.push({
        code: "LOW_GO_WIDE_FINISHERS",
        severity: "warning",
        message: "Ha densidade de mesa, mas faltam finalizadores claros.",
        evidence: `${tribalSummary.tribalFinishers} finalizadores tribais detectados.`,
        suggestion: "Inclua mais lords, anthems ou payoffs que fechem a partida."
      });
    }
  }

  if (winconSummary?.missingWinconWarning) {
    diagnostics.push({
      code: "UNCLEAR_WINCON",
      severity: "warning",
      message: "A condicao de vitoria ainda esta pouco clara.",
      evidence: "O detector nao encontrou um eixo de finalizacao com confianca alta.",
      suggestion: "Reforce um plano de encerramento especifico em vez de depender so de valor incremental."
    });
  }

  if ((archetype?.confidence || 0) < 0.55) {
    diagnostics.push({
      code: "LOW_ARCHETYPE_CONFIDENCE",
      severity: "info",
      message: "O arquétipo ainda esta com confianca baixa.",
      evidence: archetype?.evidence?.[0] || "O detector ainda nao encontrou densidade suficiente para cravar o plano.",
      suggestion: "Melhore a densidade de tags e funcoes para deixar o plano mais evidente."
    });
  }

  return diagnostics;
}

function count(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}
