export function buildRendererData({ commander, statistics, tribalSummary, score, archetype, winconSummary }) {
  return {
    commander: commander ? {
      displayName: commander.displayName,
      colorIdentity: commander.colorIdentity,
      typeLine: commander.typeLine
    } : null,
    summary: [
      { label: "Total na lista", value: String(statistics.totalCardsInDecklist) },
      { label: "Total com comandante", value: String(statistics.totalWithCommander) },
      { label: "Reconhecidas", value: `${statistics.recognizedCards}/${statistics.totalCardsInDecklist}` },
      { label: "Cores", value: statistics.colors.deckColorIdentityLabel },
      { label: "Custo medio", value: String(statistics.averageManaValue) }
    ],
    structure: [
      { label: "Terrenos", value: statistics.types.lands },
      { label: "Criaturas", value: statistics.types.creatures },
      { label: "Nao-criaturas", value: statistics.types.nonCreatures },
      { label: "Artefatos", value: statistics.types.artifacts },
      { label: "Encantamentos", value: statistics.types.enchantments },
      { label: "Instantaneas", value: statistics.types.instants },
      { label: "Feiticos", value: statistics.types.sorceries },
      { label: "Planeswalkers", value: statistics.types.planeswalkers }
    ],
    mana: [
      { label: "Terrenos", value: statistics.mana.lands },
      { label: "Ramp permanente", value: statistics.mana.permanentRamp },
      { label: "Criaturas de mana", value: statistics.mana.creatureRamp },
      { label: "Ramp de artefato", value: statistics.mana.artifactRamp },
      { label: "Ramp de terreno", value: statistics.mana.landRamp },
      { label: "Mana explosiva", value: statistics.mana.burstMana },
      { label: "Redutores", value: statistics.mana.costReducers },
      { label: "Fixing", value: statistics.mana.manaFixing }
    ],
    functions: [
      { label: "Compra", value: statistics.functions.cardDraw },
      { label: "Selecao", value: statistics.functions.cardSelection },
      { label: "Remocao", value: statistics.functions.removal },
      { label: "Wipes", value: statistics.functions.boardWipes },
      { label: "Protecao", value: statistics.functions.protection },
      { label: "Recursao", value: statistics.functions.recursion },
      { label: "Tutores", value: statistics.functions.tutors },
      { label: "Geradores de ficha", value: statistics.functions.tokenGenerators },
      { label: "Finalizadores", value: statistics.functions.finishers }
    ],
    tribal: tribalSummary ? [
      { label: "Tribo principal", value: tribalSummary.primaryTribe },
      { label: "Criaturas totais", value: tribalSummary.totalCreatures },
      { label: pluralizeTribe(tribalSummary.primaryTribe), value: tribalSummary.tribalCreatures },
      { label: `Nao-${tribalSummary.primaryTribe}`, value: tribalSummary.nonTribalCreatures },
      { label: "Densidade tribal", value: `${Math.round(tribalSummary.tribalCreatureRatio * 100)}%` },
      { label: "Lords/buffs", value: tribalSummary.tribalLords + tribalSummary.tribalAnthems },
      { label: "Geradores de ficha", value: tribalSummary.tribalTokenGenerators },
      { label: "Payoffs/finalizadores", value: tribalSummary.tribalPayoffs + tribalSummary.tribalFinishers },
      { label: "Ramp tribal", value: tribalSummary.tribalRampPieces }
    ] : [],
    verdict: {
      score: score.final,
      maxScore: score.maxScore,
      archetype: archetype.primary,
      wincons: (winconSummary.primaryWincons || []).map((item) => item.label)
    }
  };
}

function pluralizeTribe(tribe) {
  const map = {
    Elf: "Elfos",
    Ninja: "Ninjas",
    Zombie: "Zumbis",
    Vampire: "Vampiros",
    Dragon: "Dragoes"
  };
  return map[tribe] || `${tribe}s`;
}
