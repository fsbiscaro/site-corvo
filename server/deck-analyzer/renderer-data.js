export function buildRendererData({ commander, statistics, tribalSummary, score, archetype, winconSummary, manaAnalysis, probabilityAnalysis, packages, cardRoles }) {
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
      { label: "Nao reconhecidas", value: String(statistics.unknownCards) },
      { label: "Cores", value: statistics.colors.deckColorIdentityLabel },
      { label: "Identidade do comandante", value: statistics.colors.commanderColorIdentityLabel },
      { label: "Custo medio", value: String(statistics.averageManaValue) },
      { label: "Valor total de mana", value: String(statistics.totalManaValue ?? "-") },
      { label: "Legalidade", value: formatLegality(statistics.legality) }
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
    categories: Object.entries(statistics.categories || {}).map(([key, value]) => ({ label: categoryLabel(key), value })),
    manaProduction: Object.entries(manaAnalysis?.colorProduction || {}).map(([color, item]) => ({
      label: colorLabel(color),
      value: `${item.sources || 0} fontes (${Math.round((item.percentage || 0) * 100)}%)`
    })),
    manaDemand: Object.entries(manaAnalysis?.colorDemand || {}).map(([color, item]) => ({
      label: colorLabel(color),
      value: `${item.pips || 0} pips estimados (${Math.round((item.percentage || 0) * 100)}%)`
    })),
    probability: (probabilityAnalysis?.drawOdds || []).map((item) => ({
      label: item.label,
      value: `${item.percentage}%`
    })),
    packages: (packages || []).map((item) => ({
      label: item.label,
      value: `${item.count} · ${statusLabel(item.status)}`,
      status: item.status,
      interpretation: item.interpretation,
      action: item.action
    })),
    cardRoles: {
      coreCards: cardRoles?.coreCards || [],
      payoffs: cardRoles?.payoffs || [],
      flexCards: cardRoles?.flexCards || [],
      suspiciousCards: cardRoles?.suspiciousCards || []
    },
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

function formatLegality(legality) {
  if (!legality || legality.status === "not_applicable") return "Nao aplicada";
  if (legality.status === "legal") return "Sem problemas detectados";
  if (legality.status === "issues") return `${legality.bannedCards?.length || 0} banidas/restritas, ${legality.notLegalCards?.length || 0} nao legais`;
  return "Nao confirmada";
}

function colorLabel(color) {
  return ({ W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde", C: "Incolor" })[color] || color;
}

function categoryLabel(key) {
  return ({
    ramp: "Ramp total",
    permanentRamp: "Ramp permanente",
    burstMana: "Mana explosiva",
    costReducers: "Redutores",
    draw: "Compra",
    selection: "Selecao",
    removal: "Remocao",
    wipes: "Wipes",
    protection: "Protecao",
    recursion: "Recursao",
    tutors: "Tutores",
    tokens: "Fichas",
    sacOutlets: "Sac outlets",
    payoffs: "Payoffs",
    finishers: "Finalizadores",
    graveyardHate: "Graveyard hate",
    artifactHate: "Artifact hate",
    enchantmentHate: "Enchantment hate",
    counterspells: "Counterspells",
    discard: "Descarte",
    lifegain: "Lifegain",
    drain: "Drain",
    engines: "Engines"
  })[key] || key;
}

function statusLabel(status) {
  return ({ weak: "fraco", ok: "ok", strong: "forte", excess: "excesso", needs_review: "revisar" })[status] || status || "-";
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
