export function detectArchetype({ commander, commanderProfile, statistics, tribalSummary, enrichedDeck, winconSummary }) {
  const tagCounts = statistics.tagCounts || {};
  const recognizedAllCards = statistics.recognizedCards === statistics.totalCardsInDecklist;

  if (commanderProfile) {
    return detectProfileAnchoredArchetype({ commander, commanderProfile, statistics, tribalSummary, winconSummary });
  }

  if (tribalSummary && tribalSummary.tribalCreatureRatio >= 0.6) {
    const confidence = 0.62 + Math.min(0.22, tribalSummary.tribalCreatureRatio * 0.2);
    return {
      primary: `Tribal de ${tribalSummary.primaryTribe}`,
      secondary: buildSecondaryFromWincons(winconSummary),
      confidence: Number(confidence.toFixed(2)),
      evidence: [
        `A tribo ${tribalSummary.primaryTribe} domina ${Math.round(tribalSummary.tribalCreatureRatio * 100)}% das criaturas.`,
        `${tribalSummary.tribalPayoffs} payoffs tribais e ${tribalSummary.tribalTokenGenerators} geradores de ficha foram detectados.`
      ],
      rejectedArchetypes: [{
        name: "Plano em construção",
        reason: "Ha densidade tribal suficiente para definir um plano principal."
      }]
    };
  }

  if ((tagCounts.counterspell || 0) + (statistics.functions?.removal || 0) >= 12 && (statistics.types?.creatures || 0) <= 18) {
    return {
      primary: "Controle",
      secondary: ["Interação", "Valor"],
      confidence: 0.68,
      evidence: [
        "A lista tem alta densidade de respostas.",
        "A quantidade de criaturas e baixa para um plano combat-centric."
      ],
      rejectedArchetypes: []
    };
  }

  return {
    primary: "Plano em construção",
    secondary: ["Valor", "Midrange"],
    confidence: recognizedAllCards ? 0.48 : 0.4,
    evidence: [
      recognizedAllCards
        ? "O catalogo reconheceu as cartas, mas o detector ainda precisa de tags estratégicas mais específicas para classificar o plano."
        : "A leitura ainda esta limitada por cartas desconhecidas e densidade estratégica baixa."
    ],
    rejectedArchetypes: []
  };
}

function detectProfileAnchoredArchetype({ commander, commanderProfile, statistics, tribalSummary, winconSummary }) {
  const evidence = [
    `O comandante ${commander.displayName} tem profile estratégico conhecido no analisador.`,
    commanderProfile.expectedGamePlan
  ];
  const rejectedArchetypes = [];
  let confidence = 0.68;

  const tribeTarget = commanderProfile.tribe;
  if (tribeTarget && tribalSummary?.primaryTribe === tribeTarget) {
    confidence += 0.12;
    evidence.push(`A tribo principal detectada foi ${tribeTarget}, em linha com o plano esperado.`);
  }

  const satisfiedCounts = [];
  const weakCounts = [];
  for (const [tag, threshold] of Object.entries(commanderProfile.importantCounts || {})) {
    const value = readCount(tag, statistics, tribalSummary);
    if (value >= threshold.good) satisfiedCounts.push(`${tag} (${value})`);
    else if (value < threshold.min) weakCounts.push(`${tag} (${value}/${threshold.min})`);
  }

  if (satisfiedCounts.length) {
    confidence += Math.min(0.14, satisfiedCounts.length * 0.03);
    evidence.push(`Pilares já sustentados: ${satisfiedCounts.slice(0, 4).join(", ")}.`);
  }

  if (tribalSummary?.tribalCreatureRatio >= 0.7) {
    confidence += 0.04;
    evidence.push(`A densidade tribal esta em ${Math.round(tribalSummary.tribalCreatureRatio * 100)}% das criaturas.`);
  }

  const primaryWincons = winconSummary?.primaryWincons || [];
  if (primaryWincons.length) {
    evidence.push(`As condições de vitória mais prováveis são ${primaryWincons.slice(0, 2).map((item) => item.label.toLowerCase()).join(" e ")}.`);
    confidence += 0.04;
  }

  if (!weakCounts.length) {
    rejectedArchetypes.push({
      name: "Plano em construção",
      reason: "Comandante tem profile conhecido e a lista possui densidade suficiente para sustentar o plano principal."
    });
  } else {
    rejectedArchetypes.push({
      name: "Plano em construção",
      reason: "Mesmo com lacunas estruturais, o profile do comandante ancora o arquétipo melhor do que uma classificação genérica."
    });
    evidence.push(`As lacunas mais claras hoje estao em ${weakCounts.slice(0, 4).join(", ")}.`);
    confidence -= Math.min(0.1, weakCounts.length * 0.02);
  }

  return {
    primary: commanderProfile.primaryArchetype,
    secondary: commanderProfile.secondaryArchetypes,
    confidence: Number(Math.max(0.6, Math.min(0.96, confidence)).toFixed(2)),
    evidence,
    rejectedArchetypes
  };
}

function buildSecondaryFromWincons(winconSummary) {
  return (winconSummary?.primaryWincons || []).slice(0, 3).map((item) => item.label);
}

function readCount(tag, statistics, tribalSummary) {
  if (tag === "creature") return statistics.types?.creatures || 0;
  if (tag === "elf" && tribalSummary?.primaryTribe === "Elf") return tribalSummary.tribalCreatures || 0;
  if (tag === "ninja" && tribalSummary?.primaryTribe === "Ninja") return tribalSummary.tribalCreatures || 0;
  if (tag === "zombie" && tribalSummary?.primaryTribe === "Zombie") return tribalSummary.tribalCreatures || 0;
  if (tag === "vampire" && tribalSummary?.primaryTribe === "Vampire") return tribalSummary.tribalCreatures || 0;
  if (tag === "token_generator") return statistics.functions?.tokenGenerators || 0;
  if (tag === "tribal_token_generator") return tribalSummary?.tribalTokenGenerators || 0;
  if (tag === "interaction") return statistics.functions?.interaction || 0;
  return statistics.tagCounts?.[tag] || 0;
}
