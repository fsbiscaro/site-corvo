const ROLE_LIMIT = 14;

export function analyzeCardRoles({ cards = [], commander = null, commanderProfile = null, tribalSummary = null, winconSummary = null }) {
  const roles = cards.map((card) => classifyCardRole({ card, commander, commanderProfile, tribalSummary, winconSummary }));
  return {
    cards: roles,
    coreCards: takeByVerdict(roles, "keep", ["core", "payoff", "finisher"], ROLE_LIMIT),
    supportCards: takeByRole(roles, ["support", "card_advantage", "ramp"], ROLE_LIMIT),
    enablers: takeByRole(roles, ["enabler", "ramp"], ROLE_LIMIT),
    payoffs: takeByRole(roles, ["payoff", "finisher"], ROLE_LIMIT),
    flexCards: takeByRole(roles, ["flex"], ROLE_LIMIT),
    suspiciousCards: roles.filter((item) => item.role === "suspicious" || item.keepCutVerdict === "review").slice(0, ROLE_LIMIT),
    cutCandidates: roles.filter((item) => ["review", "cut_candidate"].includes(item.keepCutVerdict)).slice(0, ROLE_LIMIT)
  };
}

function classifyCardRole({ card, commanderProfile, tribalSummary, winconSummary }) {
  const tags = new Set(card.tags || []);
  const name = card.displayName || card.canonicalName || card.inputName || "Carta";
  const planContribution = [...tags].filter((tag) => !["creature", "instant", "sorcery", "artifact", "enchantment", "land"].includes(tag)).slice(0, 8);
  const unknown = card.databaseStatus === "unknown";
  let role = "flex";
  let keepCutVerdict = "flex";
  let synergyWithCommander = "medium";
  let reason = "Carta reconhecida, mas sem papel central claro pelos dados atuais.";

  if (unknown) {
    role = "suspicious";
    keepCutVerdict = "review";
    synergyWithCommander = "unknown";
    reason = "Nao foi reconhecida no catalogo local, entao precisa de revisao antes de conclusoes confiaveis.";
  } else if (hasAny(tags, ["finisher"])) {
    role = "finisher";
    keepCutVerdict = "keep";
    synergyWithCommander = "high";
    reason = "Aparece como uma forma de converter vantagem em vitoria.";
  } else if (hasAny(tags, ["payoff", "tribal_payoff", "drain", "anthem", "lord"])) {
    role = "payoff";
    keepCutVerdict = "keep";
    synergyWithCommander = "high";
    reason = "Recompensa o plano do deck e ajuda a transformar sinergia em pressao real.";
  } else if (hasAny(tags, ["permanent_ramp", "land_ramp", "creature_ramp", "ramp"])) {
    role = "ramp";
    keepCutVerdict = "support";
    reason = hasAny(tags, ["permanent_ramp", "land_ramp", "creature_ramp"])
      ? "Desenvolve mana de forma persistente, um pacote essencial para Commander."
      : "Ajuda a acelerar, mas vale separar ramp permanente de efeitos explosivos.";
  } else if (hasAny(tags, ["card_draw", "card_selection", "tutor", "recursion", "engine"])) {
    role = "card_advantage";
    keepCutVerdict = "support";
    reason = "Ajuda o deck a manter folego, encontrar pecas ou recuperar recursos.";
  } else if (hasAny(tags, ["removal", "counterspell", "discard", "board_wipe", "artifact_hate", "enchantment_hate", "graveyard_hate"])) {
    role = "interaction";
    keepCutVerdict = "support";
    reason = "Interage com a mesa e reduz a chance do deck perder para uma peca especifica.";
  } else if (hasAny(tags, ["protection", "hexproof_grant", "indestructible_grant"])) {
    role = "protection";
    keepCutVerdict = "support";
    reason = "Protege comandante, motor ou mesa em pontos importantes.";
  } else if (hasAny(tags, ["token_generator", "sacrifice_outlet", "ninjutsu", "evasive", "unblockable", "combat_damage_trigger"])) {
    role = "enabler";
    keepCutVerdict = "support";
    synergyWithCommander = "high";
    reason = "Liga o plano do deck e facilita que os payoffs funcionem.";
  } else if (card.cardTypes?.includes("Land")) {
    role = "support";
    keepCutVerdict = "support";
    synergyWithCommander = "medium";
    reason = "Base de mana; deve ser avaliada pelo equilibrio de cores e velocidade.";
  }

  if (commanderProfile && matchesCommanderPlan(tags, commanderProfile, tribalSummary)) {
    synergyWithCommander = "high";
    if (role === "flex") {
      role = "core";
      keepCutVerdict = "keep";
      reason = "As tags conversam diretamente com o plano esperado do comandante.";
    }
  }

  if (role === "flex" && Number(card.manaValue || 0) >= 6) {
    role = "suspicious";
    keepCutVerdict = "review";
    reason = "Carta cara sem funcao central detectada; pode ser boa, mas precisa provar impacto em jogo.";
  }

  const winconLabels = (winconSummary?.primaryWincons || []).map((item) => item.label);
  return {
    name,
    inputName: card.inputName || name,
    quantity: Number(card.quantity || 0),
    role,
    synergyWithCommander,
    planContribution,
    keepCutVerdict,
    reason,
    tags: [...tags],
    manaValue: card.manaValue,
    typeLine: card.typeLine,
    winconContext: winconLabels
  };
}

function matchesCommanderPlan(tags, commanderProfile, tribalSummary) {
  for (const tag of Object.keys(commanderProfile.importantCounts || {})) {
    if (tags.has(tag)) return true;
  }
  if (commanderProfile.tribe && tribalSummary?.primaryTribe) {
    const tribeTag = String(tribalSummary.primaryTribe).toLowerCase();
    if (tags.has(tribeTag) || tags.has("tribal_payoff")) return true;
  }
  for (const hint of commanderProfile.winconHints || []) {
    if (tags.has(hint) || tags.has(hint.replace(/_/g, "-"))) return true;
  }
  return false;
}

function takeByRole(roles, roleNames, limit) {
  return roles.filter((item) => roleNames.includes(item.role)).slice(0, limit);
}

function takeByVerdict(roles, verdict, roleNames, limit) {
  return roles.filter((item) => item.keepCutVerdict === verdict && roleNames.includes(item.role)).slice(0, limit);
}

function hasAny(tags, values) {
  return values.some((value) => tags.has(value));
}
