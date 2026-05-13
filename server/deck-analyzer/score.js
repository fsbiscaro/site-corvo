import { COMMANDER_FORMATS } from "./types.js";

export function buildDeckScore({ format, statistics, validation, archetype, commanderProfile, tribalSummary, winconSummary }) {
  const isCommanderLike = COMMANDER_FORMATS.has(format);
  let maxScore = 10;
  const limitReasons = [];

  if (validation.blockingErrors.length) {
    return {
      final: null,
      structure: 0,
      strategy: 0,
      consistency: 0,
      interaction: 0,
      mana: 0,
      commanderSynergy: 0,
      maxScore: 0,
      limitReasons: ["A analise foi bloqueada por erro estrutural."]
    };
  }

  if (isCommanderLike && statistics.totalCardsInDecklist !== 99) {
    maxScore = Math.min(maxScore, 7);
    limitReasons.push("A lista nao bate as 99 cartas do formato com o comandante separado.");
  }
  if (validation.warnings.some((item) => item.code === "COMMANDER_INCLUDED_IN_DECKLIST")) {
    maxScore = Math.min(maxScore, 7.5);
    limitReasons.push("O comandante aparece dentro da decklist principal.");
  }
  if (statistics.unknownRatio > 0.2) {
    maxScore = Math.min(maxScore, 6.5);
    limitReasons.push("Muitas cartas ainda nao foram reconhecidas pelo catalogo local.");
  }
  if (commanderProfile && scoreCommanderSynergy(statistics, commanderProfile, tribalSummary) < 6.4) {
    maxScore = Math.min(maxScore, 7);
    limitReasons.push("A lista ainda nao sustenta bem o plano esperado do comandante.");
  }
  if (winconSummary?.missingWinconWarning) {
    maxScore = Math.min(maxScore, 7.5);
    limitReasons.push("A condicao de vitoria ainda esta pouco definida.");
  }
  if (commanderProfile?.wantsProtection && (statistics.functions?.protection || 0) < 2) {
    maxScore = Math.min(maxScore, 7.5);
    limitReasons.push("A protecao esta baixa para um deck dependente do comandante.");
  }
  if (isCommanderLike && (statistics.mana?.permanentRamp || 0) < 8) {
    maxScore = Math.min(maxScore, 7.5);
    limitReasons.push("O ramp permanente esta abaixo do esperado para Commander.");
  }
  if ((archetype?.confidence || 0) < 0.6) {
    maxScore = Math.min(maxScore, 8);
    limitReasons.push("O arquétipo ainda esta com confianca baixa.");
  }

  const structure = scoreStructure(statistics, isCommanderLike);
  const mana = scoreMana(statistics, isCommanderLike);
  const interaction = scoreInteraction(statistics);
  const commanderSynergy = scoreCommanderSynergy(statistics, commanderProfile, tribalSummary);
  const strategy = scoreStrategy(archetype, winconSummary, commanderSynergy);
  const consistency = scoreConsistency(statistics, archetype);
  const final = Number(Math.min(maxScore, average([structure, mana, interaction, commanderSynergy, strategy, consistency])).toFixed(1));

  return {
    final,
    structure,
    strategy,
    consistency,
    interaction,
    mana,
    commanderSynergy,
    maxScore,
    limitReasons
  };
}

export function buildScoreCards(score, statistics) {
  return [
    {
      label: "Estrutura",
      score: score.structure,
      note: `${statistics.totalCardsInDecklist} cartas na lista; ${statistics.recognizedCards} reconhecidas.`,
      status: scoreStatus(score.structure)
    },
    {
      label: "Mana",
      score: score.mana,
      note: `${statistics.mana.lands} terrenos e ${statistics.mana.permanentRamp} ramp permanente.`,
      status: scoreStatus(score.mana)
    },
    {
      label: "Interacao",
      score: score.interaction,
      note: `${statistics.functions.interaction} respostas detectadas.`,
      status: scoreStatus(score.interaction)
    },
    {
      label: "Sinergia",
      score: score.commanderSynergy,
      note: "Aderencia ao plano principal do deck.",
      status: scoreStatus(score.commanderSynergy)
    },
    {
      label: "Estrategia",
      score: score.strategy,
      note: "Arquétipo e condição de vitória.",
      status: scoreStatus(score.strategy)
    },
    {
      label: "Consistencia",
      score: score.consistency,
      note: "Cobertura do catálogo e curva geral.",
      status: scoreStatus(score.consistency)
    }
  ];
}

function scoreStructure(statistics, isCommanderLike) {
  let score = 5;
  if (statistics.recognitionRatio >= 0.98) score += 1.4;
  if (!isCommanderLike || statistics.totalCardsInDecklist === 99) score += 1.2;
  if (statistics.types.lands >= 34 && statistics.types.lands <= 39) score += 1.2;
  if (statistics.averageManaValue <= 3.3) score += 0.7;
  if (!statistics.unknownCardNames.length) score += 0.5;
  return clamp(score);
}

function scoreMana(statistics, isCommanderLike) {
  let score = 4.5;
  if (statistics.mana.lands >= 34 && statistics.mana.lands <= 38) score += 1.4;
  if ((statistics.mana.permanentRamp || 0) >= (isCommanderLike ? 8 : 4)) score += 1.6;
  if ((statistics.mana.manaFixing || 0) >= 4 || statistics.colors.deckColorIdentity.length <= 2) score += 1;
  if (statistics.mana.averageManaValue <= 3.2) score += 1;
  return clamp(score);
}

function scoreInteraction(statistics) {
  let score = 4;
  if ((statistics.functions.interaction || 0) >= 8) score += 2.1;
  if ((statistics.functions.protection || 0) >= 2) score += 1;
  if ((statistics.functions.cardDraw || 0) >= 6) score += 1.2;
  if ((statistics.functions.boardWipes || 0) >= 1) score += 0.7;
  return clamp(score);
}

function scoreCommanderSynergy(statistics, commanderProfile, tribalSummary) {
  if (!commanderProfile) return 6;
  let score = 5;
  let checks = 0;

  for (const [tag, threshold] of Object.entries(commanderProfile.importantCounts || {})) {
    const value = readCount(tag, statistics, tribalSummary);
    checks += 1;
    if (value >= threshold.good) score += 0.65;
    else if (value >= threshold.min) score += 0.35;
    else score -= 0.15;
  }

  if (commanderProfile.tribe && tribalSummary?.primaryTribe === commanderProfile.tribe) score += 0.8;
  if (checks < 4) score += 0.4;
  return clamp(score);
}

function scoreStrategy(archetype, winconSummary, commanderSynergy) {
  let score = 4.5;
  score += Math.min(2, (archetype?.confidence || 0) * 2.2);
  if ((winconSummary?.primaryWincons || []).length) score += 1.4;
  if (!winconSummary?.missingWinconWarning) score += 0.8;
  score += Math.max(0, (commanderSynergy - 6) * 0.2);
  return clamp(score);
}

function scoreConsistency(statistics, archetype) {
  let score = 4.5;
  score += Math.min(2, statistics.recognitionRatio * 2);
  if (statistics.averageManaValue > 0 && statistics.averageManaValue <= 3.2) score += 1.2;
  if ((statistics.types.creatures || 0) >= 24 || (statistics.functions.cardDraw || 0) >= 6) score += 0.8;
  score += Math.min(1.2, (archetype?.confidence || 0) * 1.4);
  return clamp(score);
}

function readCount(tag, statistics, tribalSummary) {
  if (tag === "creature") return statistics.types.creatures || 0;
  if (tag === "token_generator") return statistics.functions.tokenGenerators || 0;
  if (tag === "tribal_token_generator") return tribalSummary?.tribalTokenGenerators || 0;
  if (tag === "interaction") return statistics.functions.interaction || 0;
  if (tag === "elf" && tribalSummary?.primaryTribe === "Elf") return tribalSummary.tribalCreatures || 0;
  if (tag === "ninja" && tribalSummary?.primaryTribe === "Ninja") return tribalSummary.tribalCreatures || 0;
  if (tag === "zombie" && tribalSummary?.primaryTribe === "Zombie") return tribalSummary.tribalCreatures || 0;
  if (tag === "vampire" && tribalSummary?.primaryTribe === "Vampire") return tribalSummary.tribalCreatures || 0;
  return statistics.tagCounts[tag] || 0;
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value) {
  return Number(Math.max(0, Math.min(10, value)).toFixed(1));
}

function scoreStatus(score) {
  if (score >= 8) return "forte";
  if (score >= 6) return "ok";
  return "alerta";
}
