import {
  classifyAristocratsFunction,
  isDeathOrDrainPayoff
} from "./function-taxonomy.js";

const ROLE_LIMIT = 14;

export function analyzeCardRoles({ cards = [], commander = null, commanderProfile = null, tribalSummary = null, winconSummary = null, archetype = null, strategy = null, strategySignals = null }) {
  const primaryId = strategy?.primaryArchetype?.id || inferPrimaryId(archetype);
  const roles = cards.map((card) => classifyCardRole({ card, commander, commanderProfile, tribalSummary, winconSummary, archetype, strategy, strategySignals, primaryId }));
  return {
    cards: roles,
    coreCards: takeByVerdict(roles, "keep", ["core", "payoff", "engine", "finisher"], ROLE_LIMIT),
    supportCards: takeByRole(roles, ["support", "card_advantage", "ramp"], ROLE_LIMIT),
    enablers: takeByRole(roles, ["enabler", "engine", "ramp"], ROLE_LIMIT),
    payoffs: takeByRole(roles, ["payoff", "finisher"], ROLE_LIMIT),
    flexCards: takeByRole(roles, ["flex"], ROLE_LIMIT),
    unknownCards: takeByRole(roles, ["unknown"], ROLE_LIMIT),
    suspiciousCards: roles.filter((item) => item.role === "suspicious" || (item.keepCutVerdict === "review" && item.role !== "unknown")).slice(0, ROLE_LIMIT),
    cutCandidates: roles.filter((item) => ["review", "cut_candidate"].includes(item.keepCutVerdict) && item.role !== "unknown").slice(0, ROLE_LIMIT)
  };
}

function classifyCardRole({ card, commanderProfile, tribalSummary, winconSummary, primaryId, strategySignals }) {
  const tags = new Set(card.tags || []);
  const name = card.displayName || card.canonicalName || card.inputName || "Carta";
  const planContribution = [...tags].filter((tag) => !["creature", "instant", "sorcery", "artifact", "enchantment", "land"].includes(tag)).slice(0, 8);
  const unknown = card.databaseStatus === "unknown";
  let role = "flex";
  let keepCutVerdict = "flex";
  let synergyWithCommander = "medium";
  let reason = "Carta reconhecida, mas sem papel central claro pelos dados atuais.";

  if (unknown) {
    role = "unknown";
    keepCutVerdict = "review";
    synergyWithCommander = "unknown";
    reason = "Carta pendente de reconhecimento no catalogo local; nao deve ser marcada como corte antes da revisao.";
  } else if (isAristocrats(primaryId) && classifyAristocratsFunction(card)) {
    const classified = classifyAristocratsRole(card);
    role = classified.role;
    keepCutVerdict = classified.keepCutVerdict;
    synergyWithCommander = classified.synergyWithCommander;
    reason = classified.reason;
  } else if (isStealEffect(card) && isAristocrats(primaryId) && (strategySignals?.signals?.sacrifice_outlet_count || 0) >= 2) {
    role = "enabler";
    keepCutVerdict = "support";
    synergyWithCommander = "medium";
    reason = "Roubo temporario fica melhor quando o deck consegue sacrificar a criatura antes de devolve-la.";
  } else if (isStealEffect(card)) {
    role = "suspicious";
    keepCutVerdict = "review";
    synergyWithCommander = "low";
    reason = "Efeito de roubo temporario sem outlets suficientes pode virar carta situacional demais.";
  } else if (isTribal(primaryId) && matchesTribe(card, tribalSummary)) {
    const isPayoff = hasAny(tags, ["tribal_payoff", "lord", "anthem", "payoff"]);
    role = isPayoff ? "payoff" : "support";
    keepCutVerdict = isPayoff ? "keep" : "support";
    synergyWithCommander = "high";
    reason = isPayoff
      ? "Payoff/lord tribal que transforma densidade de criaturas em vantagem real."
      : `Contribui para a densidade de ${tribalSummary?.primaryTribe}, mas precisa ser medido junto dos payoffs.`;
  } else if (primaryId === "control" && hasAny(tags, ["counterspell", "removal", "board_wipe", "card_draw", "card_selection"])) {
    role = hasAny(tags, ["card_draw", "card_selection"]) ? "card_advantage" : "interaction";
    keepCutVerdict = "support";
    synergyWithCommander = "medium";
    reason = "Em controle, resposta e compra sao parte do nucleo funcional para sobreviver e trocar recursos.";
  } else if (primaryId === "voltron" && (isEquipmentOrAura(card) || hasAny(tags, ["protection", "evasive", "trample"]))) {
    role = hasAny(tags, ["protection"]) ? "protection" : "enabler";
    keepCutVerdict = "support";
    synergyWithCommander = "high";
    reason = "Ajuda o plano de concentrar dano, evasao ou protecao em uma ameaca principal.";
  } else if (primaryId === "spellslinger" && (card.cardTypes?.includes("Instant") || card.cardTypes?.includes("Sorcery") || isSpellPayoff(card))) {
    role = isSpellPayoff(card) ? "payoff" : "support";
    keepCutVerdict = isSpellPayoff(card) ? "keep" : "support";
    synergyWithCommander = "high";
    reason = isSpellPayoff(card) ? "Payoff de spells que transforma instants/sorceries em valor." : "Mantem densidade de spells para payoffs e ritmo.";
  } else if (primaryId === "reanimator" && (hasAny(tags, ["recursion", "graveyard_synergy"]) || isReanimation(card) || isBigThreat(card))) {
    role = isReanimation(card) ? "enabler" : isBigThreat(card) ? "payoff" : "support";
    keepCutVerdict = "support";
    synergyWithCommander = "high";
    reason = "Contribui para colocar recursos no cemiterio, voltar ameacas ou oferecer alvo relevante.";
  } else if (hasAny(tags, ["finisher"])) {
    role = "finisher";
    keepCutVerdict = "keep";
    synergyWithCommander = "high";
    reason = "Aparece como uma forma de converter vantagem em vitoria.";
  } else if (hasAny(tags, ["payoff", "tribal_payoff", "anthem", "lord"]) || (tags.has("drain") && isDeathOrDrainPayoff(card))) {
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

  if (isGenericStaple(card, tags) && role === "core" && !classifyAristocratsFunction(card) && !["artifacts", "big_mana_ramp"].includes(primaryId)) {
    role = "support";
    keepCutVerdict = "support";
    reason = "Carta forte e util, mas nao define sozinha o plano principal do deck.";
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

function inferPrimaryId(archetype) {
  const primary = String(archetype?.primary || "").toLowerCase();
  if (primary.includes("aristocrat") || primary.includes("sacrificio") || primary.includes("sacrif")) return "aristocrats_sacrifice";
  if (primary.includes("control") || primary.includes("controle")) return "control";
  if (primary.includes("voltron")) return "voltron";
  if (primary.includes("spellslinger")) return "spellslinger";
  if (primary.includes("reanimator")) return "reanimator";
  if (primary.includes("tribal") || primary.includes("elfos") || primary.includes("zumbis") || primary.includes("ninjas")) return "tribal";
  if (primary.includes("goodstuff")) return "goodstuff_value";
  return "";
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

function isAristocrats(primaryId) {
  return ["aristocrats_sacrifice", "death_triggers", "theft_sac", "treasure_sacrifice_value"].includes(primaryId);
}

function isTribal(primaryId) {
  return primaryId === "tribal" || String(primaryId || "").startsWith("profile:");
}

function matchesTribe(card, tribalSummary) {
  if (!tribalSummary?.primaryTribe) return false;
  return (card.subtypes || []).includes(tribalSummary.primaryTribe) || hasAny(new Set(card.tags || []), ["tribal_payoff", "lord", "anthem"]);
}

function isStealEffect(card) {
  return /gain control of target|until end of turn/i.test(textOf(card));
}

function isEquipmentOrAura(card) {
  return /equipment|aura/i.test(card.typeLine || "");
}

function isSpellPayoff(card) {
  return /instant or sorcery|whenever you cast|magecraft|prowess/i.test(textOf(card));
}

function isReanimation(card) {
  return /return target creature card from your graveyard to the battlefield|reanimate/i.test(textOf(card));
}

function isBigThreat(card) {
  return card.cardTypes?.includes("Creature") && Number(card.manaValue || 0) >= 5;
}

function isGenericStaple(card, tags) {
  const name = String(card.displayName || card.canonicalName || card.inputName || "").toLowerCase();
  if (["sol ring", "arcane signet", "command tower"].includes(name)) return true;
  return hasAny(tags, ["removal", "counterspell", "board_wipe"]) && !hasAny(tags, ["payoff", "tribal_payoff"]);
}

function classifyAristocratsRole(card) {
  const type = classifyAristocratsFunction(card);
  const name = card.displayName || card.canonicalName || card.inputName || "Carta";

  if (type === "free_sacrifice_outlet" || type === "sacrifice_outlet") {
    return {
      role: "core",
      keepCutVerdict: "keep",
      synergyWithCommander: "high",
      reason: `${name} é outlet ${type === "free_sacrifice_outlet" ? "gratuito/recorrente" : "de sacrificio"}: permite transformar fodder em gatilhos de morte, dano ou valor no momento certo.`
    };
  }

  if (type === "sacrifice_payoff") {
    return {
      role: "payoff",
      keepCutVerdict: "keep",
      synergyWithCommander: "high",
      reason: `${name} é payoff central de aristocrats: converte mortes ou sacrificios em drain, dano ou vantagem, ajudando o deck a vencer sem depender de combate.`
    };
  }

  if (type === "engine") {
    return {
      role: "engine",
      keepCutVerdict: "keep",
      synergyWithCommander: "high",
      reason: `${name} é engine do plano: transforma criaturas, mortes ou artefatos em recurso repetido para manter o motor de sacrificio funcionando.`
    };
  }

  if (type === "draw_by_sacrifice") {
    return {
      role: "card_advantage",
      keepCutVerdict: "support",
      synergyWithCommander: "high",
      reason: `${name} compra cartas usando sacrificio como custo. E suporte forte, mas nao e outlet repetivel nem payoff de vitoria.`
    };
  }

  if (type === "recursion") {
    return {
      role: "support",
      keepCutVerdict: "support",
      synergyWithCommander: "high",
      reason: `${name} oferece recursao. Em aristocrats, isso ajuda a reconstruir a mesa ou transformar uma criatura sacrificada em novas pecas.`
    };
  }

  if (type === "treasure_value") {
    return {
      role: "support",
      keepCutVerdict: "support",
      synergyWithCommander: "medium",
      reason: `${name} gera tesouros/valor para acelerar jogadas e alimentar artefatos, mas nao e outlet de sacrificio.`
    };
  }

  if (type === "ramp_fixing") {
    return {
      role: "ramp",
      keepCutVerdict: "support",
      synergyWithCommander: "medium",
      reason: `${name} desenvolve mana ou corrige cores. Ajuda o deck a jogar, mas nao e peca central do motor de aristocrats.`
    };
  }

  if (type === "fling_effect") {
    return {
      role: "finisher",
      keepCutVerdict: "support",
      synergyWithCommander: "high",
      reason: `${name} pode converter uma criatura grande, como Juri acumulado, em dano direto para finalizar partidas.`
    };
  }

  return {
    role: "support",
    keepCutVerdict: "support",
    synergyWithCommander: "medium",
    reason: `${name} tem sacrificio como custo ou suporte pontual, mas nao funciona como outlet repetivel do motor.`
  };
}

function textOf(card) {
  return `${card.oracleText || ""} ${card.typeLine || ""} ${card.displayName || card.canonicalName || card.inputName || ""}`;
}
