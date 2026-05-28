import { ARCHETYPE_MODELS, getArchetypeModel } from "./archetype-models.js";
import { GENERIC_TRIBES } from "./types.js";

const THRESHOLDS = { high: 0.75, medium: 0.55 };

export function buildCorvoStrategy({ archetypeModels = ARCHETYPE_MODELS, signals = {}, signalDetails = {}, commander = null, commanderProfile = null, tribalSummary = null, statistics = {}, winconSummary = null, cards = [] } = {}) {
  const scored = archetypeModels
    .map((model) => scoreArchetypeModel({ model, signals, signalDetails, commander, commanderProfile, tribalSummary, statistics, winconSummary, cards }))
    .sort((a, b) => b.score - a.score);

  const profileResult = scoreCommanderProfile({ commanderProfile, signals, tribalSummary, winconSummary, statistics });
  if (profileResult) scored.unshift(profileResult);

  const deduped = dedupeScores(scored);
  const rejectedArchetypes = buildRejectedArchetypes({ scores: deduped, signals, tribalSummary, commanderProfile });
  const primary = pickPrimary(deduped);
  const secondary = mergeSecondaryArchetypes(
    commanderProfile?.secondaryArchetypes || [],
    deduped
      .filter((item) => item.id !== primary.id && item.score >= 0.5 && !isHardRejected(item.id, rejectedArchetypes))
      .slice(0, 4)
      .map(formatSecondary)
  );

  const confidenceLevel = confidenceLevelFor(primary.confidence);
  const winConditions = buildStrategyWincons({ primary, secondary, winconSummary, signals });
  const plans = buildPlans({ primary, secondary, commander, commanderProfile, signals, tribalSummary, winConditions });

  return {
    primaryArchetype: formatPrimary(primary),
    secondaryArchetypes: secondary,
    rejectedArchetypes,
    planA: plans.planA,
    planB: plans.planB,
    winConditions,
    confidenceLevel,
    archetypeScores: deduped.slice(0, 12).map((item) => ({
      id: item.id,
      label: item.label,
      score: Number(item.score.toFixed(2)),
      confidence: Number(item.confidence.toFixed(2)),
      evidence: item.evidence,
      missing: item.missing
    })),
    signals,
    signalDetails
  };
}

export function strategyToLegacyArchetype(strategy, fallback = null) {
  const primary = strategy?.primaryArchetype;
  if (!primary) return fallback || { primary: "Plano em construcao", secondary: [], confidence: 0.3, evidence: [], missing: [] };
  return {
    primary: primary.label,
    secondary: (strategy.secondaryArchetypes || []).map((item) => item.label),
    confidence: primary.confidence,
    evidence: primary.evidence || [],
    missing: primary.missing || [],
    rejectedArchetypes: strategy.rejectedArchetypes || [],
    planA: strategy.planA,
    planB: strategy.planB,
    winConditions: strategy.winConditions || []
  };
}

export function scoreArchetypes(args) {
  return (args?.archetypeModels || ARCHETYPE_MODELS)
    .map((model) => scoreArchetypeModel({ ...args, model }))
    .sort((a, b) => b.score - a.score);
}

function scoreCommanderProfile({ commanderProfile, signals, tribalSummary, winconSummary, statistics }) {
  if (!commanderProfile?.primaryArchetype) return null;
  const evidence = [`Profile manual do comandante aponta para ${commanderProfile.primaryArchetype}.`];
  const missing = [];
  let score = 0.76;

  if (commanderProfile.tribe && tribalSummary?.primaryTribe === commanderProfile.tribe) {
    score += 0.08;
    evidence.push(`A tribo ${tribalSummary.primaryTribe} aparece com ${tribalSummary.tribalCreatures} criaturas.`);
  }
  if (commanderProfile.winconHints?.some((hint) => (winconSummary?.primaryWincons || []).some((wincon) => wincon.type === hint))) score += 0.05;
  if ((statistics.unknownRatio || 0) > 0.2) {
    score -= 0.08;
    missing.push("Catalogo incompleto reduz a confianca no profile.");
  }
  if (commanderProfile.winconHints?.includes("combo") && (signals.combo_line_count || 0) === 0 && !String(commanderProfile.primaryArchetype).includes("K'rrik")) {
    score -= 0.08;
    missing.push("Profile menciona combo, mas nenhuma linha concreta foi detectada.");
  }

  return result({
    id: `profile:${commanderProfile.primaryArchetype}`,
    label: commanderProfile.primaryArchetype,
    score,
    evidence,
    missing,
    source: "commander_profile"
  });
}

function scoreArchetypeModel({ model, signals, signalDetails, commander, commanderProfile, tribalSummary, statistics, winconSummary, cards }) {
  switch (model.id) {
    case "aristocrats_sacrifice":
      return scoreAristocrats(model, signals, commander, signalDetails);
    case "tribal":
      return scoreTribal(model, signals, tribalSummary, commanderProfile, commander);
    case "combo":
      return scoreCombo(model, signals);
    case "control":
      return scoreControl(model, signals, statistics);
    case "midrange":
      return scoreMidrange(model, signals, statistics);
    case "aggro":
      return scoreAggro(model, signals, statistics);
    case "burn":
      return scoreBurn(model, signals);
    case "voltron":
      return scoreVoltron(model, signals);
    case "spellslinger":
      return scoreSpellslinger(model, signals);
    case "reanimator":
      return scoreReanimator(model, signals);
    case "graveyard_value":
      return scoreGraveyard(model, signals);
    case "tokens_go_wide":
      return scoreTokens(model, signals);
    case "blink":
      return scoreBlink(model, signals);
    case "artifacts":
      return scoreArtifacts(model, signals, statistics);
    case "enchantress":
      return scoreEnchantress(model, signals, statistics);
    case "lands":
      return scoreLands(model, signals);
    case "lifegain_drain":
      return scoreLifeDrain(model, signals);
    case "counters_proliferate":
      return scoreCounters(model, signals);
    case "stax":
      return scoreStax(model, signals);
    case "mill":
      return scoreMill(model, signals);
    case "big_mana_ramp":
      return scoreBigMana(model, signals, statistics);
    case "goodstuff_value":
      return scoreGoodstuff(model, signals, statistics);
    case "equipment_auras":
      return scoreEquipmentAuras(model, signals);
    case "group_slug":
      return scoreGroupSlug(model, signals);
    case "theft_sac":
      return scoreTheftSac(model, signals);
    case "death_triggers":
      return scoreDeathTriggers(model, signals);
    case "treasure_sacrifice_value":
      return scoreTreasureSac(model, signals);
    case "tempo":
      return scoreTempo(model, signals);
    default:
      return genericScore(model, signals);
  }
}

function scoreAristocrats(model, s, commander, signalDetails) {
  let score = 0;
  const evidence = [];
  const missing = [];
  addScore(s.sacrifice_outlet_count, 2, 5, 0.26, 0.16, `${s.sacrifice_outlet_count} outlets de sacrificio detectados.`);
  addScore(s.death_payoff_count + s.drain_payoff_count, 2, 5, 0.28, 0.16, `${s.death_payoff_count + s.drain_payoff_count} payoffs de morte/drain detectados.`);
  addScore(s.fodder_count, 4, 10, 0.2, 0.12, `${s.fodder_count} fontes de fodder/fichas/tesouros detectadas.`);
  if (s.commander_aristocrats_signal) {
    score += 0.22;
    evidence.push(`${commander?.displayName || "O comandante"} recompensa sacrificio, morte ou permanentes indo ao cemiterio.`);
  }
  if (s.recursion_count >= 2) {
    score += 0.06;
    evidence.push(`${s.recursion_count} pecas de recursao ajudam a refazer o motor.`);
  }
  if (s.sacrifice_outlet_count < 2) missing.push("Outlets de sacrificio baixos.");
  if (s.death_payoff_count + s.drain_payoff_count < 2) missing.push("Poucos payoffs de morte/drain.");
  if (s.fodder_count < 4) missing.push("Pouco fodder para alimentar sacrificios.");
  if ((signalDetails?.signalCards?.death_payoffs || []).length) evidence.push(`Payoffs visiveis: ${signalDetails.signalCards.death_payoffs.slice(0, 3).join(", ")}.`);
  return result({ id: model.id, label: model.label, score, evidence, missing });

  function addScore(value, min, good, goodScore, minScore, text) {
    if (value >= good) {
      score += goodScore;
      evidence.push(text);
    } else if (value >= min) {
      score += minScore;
      evidence.push(text);
    }
  }
}

function scoreTribal(model, s, tribalSummary, commanderProfile, commander) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (!tribalSummary?.primaryTribe) return result({ id: model.id, label: model.label, score: 0.05, evidence, missing: ["Nenhuma tribo dominante detectada."] });

  const tribe = tribalSummary.primaryTribe;
  const isGeneric = GENERIC_TRIBES.has(tribe) && !commanderProfile?.tribe;
  const payoffSupport = (s.tribal_payoff_count || 0) + (s.lord_count || 0);
  if (commanderProfile?.tribe === tribe) {
    score += 0.28;
    evidence.push(`O comandante recompensa ${tribe}.`);
  } else if ((commander?.subtypes || []).includes(tribe)) {
    score += 0.2;
    evidence.push(`O comandante pertence a tribo ${tribe}.`);
  }
  if (s.tribal_density >= 0.65) {
    score += 0.22;
    evidence.push(`${Math.round(s.tribal_density * 100)}% das criaturas pertencem a tribo ${tribe}.`);
  } else if (s.tribal_density >= 0.45) {
    score += 0.1;
    evidence.push(`Existe densidade moderada de ${tribe}.`);
  }
  if (payoffSupport >= 3) {
    score += 0.22;
    evidence.push(`${payoffSupport} payoffs/lords tribais sustentam o plano.`);
  } else if (payoffSupport >= 1) {
    score += 0.1;
    evidence.push(`${payoffSupport} payoff/lord tribal detectado.`);
  }
  if (s.tribal_creature_count >= 24) score += 0.1;
  if (isGeneric && payoffSupport < 2) {
    score = Math.min(score, 0.42);
    missing.push(`${tribe} e uma tribo generica na lista; falta payoff tribal real para chamar isso de tribal.`);
  }
  if (payoffSupport < 1) missing.push("Poucos payoffs tribais.");
  return result({ id: model.id, label: commanderProfile?.primaryArchetype || `${tribe} Tribal`, score, evidence, missing });
}

function scoreCombo(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.combo_line_count > 0) {
    score += 0.48;
    evidence.push(`${s.combo_line_count} linha(s) ou pares de combo concretos detectados.`);
  } else {
    missing.push("Tutores e mana explosiva nao bastam sem linha de combo concreta.");
  }
  if (s.tutor_count >= 3) {
    score += 0.14;
    evidence.push(`${s.tutor_count} tutores ajudam a encontrar pecas.`);
  }
  if (s.protection_count >= 2) score += 0.08;
  if (s.card_selection_count + s.card_draw_count >= 8) score += 0.1;
  if (s.burst_mana_count >= 2) score += 0.08;
  if (!s.combo_line_count) score = Math.min(score, 0.42);
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreControl(model, s, statistics) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.interaction_count >= 10) {
    score += 0.24;
    evidence.push(`${s.interaction_count} interacoes sustentam jogo reativo.`);
  } else if (s.interaction_count >= 7) score += 0.14;
  if (s.counterspell_count + s.board_wipe_count >= 4) {
    score += 0.18;
    evidence.push(`${s.counterspell_count} counters e ${s.board_wipe_count} wipes detectados.`);
  }
  if (s.card_draw_count + s.card_selection_count >= 8) {
    score += 0.16;
    evidence.push("Compra/selecao suficiente para trocar recursos.");
  }
  if ((statistics.types?.creatures || 0) <= 16) score += 0.08;
  if (s.finisher_count >= 1 || s.large_threat_count >= 2) score += 0.12;
  else missing.push("Finalizador baixo para fechar depois de controlar a mesa.");
  if (s.counterspell_count + s.board_wipe_count < 2) score = Math.min(score, 0.42);
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreMidrange(model, s, statistics) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.threat_count >= 14) {
    score += 0.18;
    evidence.push(`${s.threat_count} ameacas detectadas.`);
  }
  if (s.interaction_count >= 6) {
    score += 0.18;
    evidence.push(`${s.interaction_count} interacoes para trocar recursos.`);
  }
  if (s.card_draw_count + s.value_engine_count >= 8) score += 0.18;
  if ((statistics.averageManaValue || 0) >= 2.2 && (statistics.averageManaValue || 0) <= 3.8) score += 0.1;
  if (s.large_threat_count >= 2 || s.finisher_count >= 1) score += 0.08;
  if (score < 0.45) missing.push("Faltam ameacas, valor ou interacao suficientes para midrange.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreAggro(model, s, statistics) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.early_pressure_count >= 10) {
    score += 0.24;
    evidence.push(`${s.early_pressure_count} ameacas baratas indicam pressao cedo.`);
  } else if (s.early_pressure_count >= 6) score += 0.14;
  if ((statistics.averageManaValue || 0) > 0 && (statistics.averageManaValue || 0) <= 2.7) score += 0.14;
  if (s.burn_count >= 5) score += 0.14;
  if (s.finisher_count >= 1 || s.direct_damage_count >= 6) score += 0.08;
  if (s.card_draw_count + s.card_selection_count < 5) missing.push("Pouca compra/gas para continuar depois do primeiro folego.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreBurn(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.burn_count >= 8) {
    score += 0.36;
    evidence.push(`${s.burn_count} efeitos de dano direto detectados.`);
  } else if (s.burn_count >= 4) score += 0.18;
  if (s.direct_damage_count >= 12) score += 0.12;
  if (s.spell_density >= 0.35) score += 0.12;
  if (s.card_draw_count + s.card_selection_count < 5) missing.push("Burn precisa de gas para nao morrer no topo.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreVoltron(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.commander_damage_support_count >= 10) {
    score += 0.38;
    evidence.push(`${s.commander_damage_support_count} cartas ajudam dano de comandante, evasao ou pump.`);
  } else if (s.commander_damage_support_count >= 6) score += 0.18;
  if (s.equipment_aura_count >= 6) {
    score += 0.2;
    evidence.push(`${s.equipment_aura_count} equipamentos/auras detectados.`);
  }
  if (s.protection_count >= 3) score += 0.12;
  else missing.push("Protecao baixa para um plano que concentra recursos em uma criatura.");
  if (s.commander_voltron_signal) score += 0.14;
  if (s.equipment_aura_count < 4 && !s.commander_voltron_signal) score = Math.min(score, 0.34);
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreSpellslinger(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.spell_density >= 0.45) {
    score += 0.28;
    evidence.push(`Densidade de instants/sorceries em ${Math.round(s.spell_density * 100)}%.`);
  } else if (s.spell_density >= 0.32) score += 0.12;
  if (s.spell_trigger_count >= 3) {
    score += 0.3;
    evidence.push(`${s.spell_trigger_count} payoffs de spells detectados.`);
  }
  if (s.commander_spells_signal) score += 0.14;
  if (s.spell_trigger_count < 2) missing.push("Faltam payoffs claros para a densidade de spells virar plano.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreReanimator(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.reanimation_count >= 4) {
    score += 0.28;
    evidence.push(`${s.reanimation_count} efeitos de reanimacao detectados.`);
  } else if (s.reanimation_count >= 2) score += 0.14;
  if (s.graveyard_synergy_count >= 6 || s.self_mill_count >= 3) score += 0.16;
  if (s.large_threat_count >= 4) score += 0.16;
  if (s.reanimation_count < 2) missing.push("Poucos efeitos reais de reanimacao.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreGraveyard(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.graveyard_synergy_count >= 8) {
    score += 0.28;
    evidence.push(`${s.graveyard_synergy_count} sinais de cemiterio/recursao.`);
  } else if (s.graveyard_synergy_count >= 4) score += 0.14;
  if (s.recursion_count >= 3) score += 0.16;
  if (s.commander_graveyard_signal) score += 0.12;
  if (score < 0.35) missing.push("Cemiterio aparece pouco para ser plano principal.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreTokens(model, s) {
  let score = 0;
  const evidence = [];
  const missing = [];
  if (s.token_generator_count >= 6) {
    score += 0.28;
    evidence.push(`${s.token_generator_count} geradores de ficha detectados.`);
  } else if (s.token_generator_count >= 3) score += 0.14;
  if (s.anthem_count + s.finisher_count >= 2) score += 0.14;
  if (s.token_generator_count < 3) missing.push("Poucos geradores de ficha para plano go-wide.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreBlink(model, s) {
  const score = (s.blink_enabler_count >= 3 ? 0.26 : s.blink_enabler_count >= 1 ? 0.12 : 0) + (s.etb_payoff_count >= 8 ? 0.24 : s.etb_payoff_count >= 4 ? 0.12 : 0);
  return result({
    id: model.id,
    label: model.label,
    score,
    evidence: score ? [`${s.blink_enabler_count} blink e ${s.etb_payoff_count} cartas com ETB detectados.`] : [],
    missing: score < 0.4 ? ["Faltam blink e/ou ETBs em densidade suficiente."] : []
  });
}

function scoreArtifacts(model, s, statistics) {
  const artifactRatio = (statistics.totalCardsInDecklist || 0) ? (s.artifact_count || 0) / statistics.totalCardsInDecklist : 0;
  let score = 0;
  const evidence = [];
  const missing = [];
  if (artifactRatio >= 0.28) {
    score += 0.18;
    evidence.push(`${s.artifact_count} artefatos na lista.`);
  }
  if (s.artifact_synergy_count >= 4) {
    score += 0.24;
    evidence.push(`${s.artifact_synergy_count} payoffs/sinergias de artefato.`);
  }
  if (s.commander_artifact_signal) score += 0.14;
  if (s.artifact_synergy_count < 2) missing.push("Artefatos sem payoff suficiente tendem a ser apenas suporte.");
  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreEnchantress(model, s, statistics) {
  const enchantRatio = (statistics.totalCardsInDecklist || 0) ? (s.enchantment_count || 0) / statistics.totalCardsInDecklist : 0;
  let score = 0;
  const evidence = [];
  if (enchantRatio >= 0.25) score += 0.16;
  if (s.enchantress_count >= 3) {
    score += 0.28;
    evidence.push(`${s.enchantress_count} motores/payoffs de encantamento detectados.`);
  }
  if (s.commander_enchantress_signal) score += 0.14;
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.35 ? ["Poucos motores enchantress."] : [] });
}

function scoreLands(model, s) {
  let score = 0;
  const evidence = [];
  if (s.landfall_count >= 4) {
    score += 0.3;
    evidence.push(`${s.landfall_count} payoffs/enablers de terrenos detectados.`);
  }
  if (s.commander_land_signal) score += 0.16;
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.35 ? ["Poucos sinais de lands/landfall."] : [] });
}

function scoreLifeDrain(model, s) {
  let score = 0;
  const evidence = [];
  if (s.lifegain_count >= 5) score += 0.18;
  if (s.drain_payoff_count >= 3) score += 0.22;
  if (s.commander_lifegain_signal) score += 0.14;
  if (score) evidence.push(`${s.lifegain_count} lifegain e ${s.drain_payoff_count} drain/payoffs detectados.`);
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.35 ? ["Lifegain/drain ainda nao parece eixo principal."] : [] });
}

function scoreCounters(model, s) {
  const score = (s.counter_synergy_count >= 6 ? 0.34 : s.counter_synergy_count >= 3 ? 0.18 : 0) + (s.commander_counters_signal ? 0.14 : 0);
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.counter_synergy_count} sinais de marcadores/proliferate.`] : [], missing: [] });
}

function scoreStax(model, s) {
  const score = s.stax_piece_count >= 5 ? 0.42 : s.stax_piece_count >= 2 ? 0.22 : 0;
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.stax_piece_count} pecas de stax/taxas detectadas.`] : [], missing: [] });
}

function scoreMill(model, s) {
  const score = s.mill_count >= 6 ? 0.42 : s.mill_count >= 3 ? 0.22 : 0;
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.mill_count} efeitos de mill detectados.`] : [], missing: [] });
}

function scoreBigMana(model, s, statistics) {
  let score = 0;
  const evidence = [];
  if (s.permanent_ramp_count >= 12) {
    score += 0.24;
    evidence.push(`${s.permanent_ramp_count} ramp permanente indica big mana.`);
  } else if (s.permanent_ramp_count >= 8) score += 0.12;
  if (s.large_threat_count >= 8) {
    score += 0.22;
    evidence.push(`${s.large_threat_count} ameaças grandes sustentam o plano de Stompy.`);
  } else if (s.large_threat_count >= 5 || (statistics.averageManaValue || 0) >= 3.6) score += 0.16;
  if (s.ramp_count >= 10 && s.large_threat_count >= 8) score += 0.12;
  if (s.creature_count >= 30 && s.large_threat_count >= 8) score += 0.08;
  if (s.commander_lifegain_signal && s.burst_mana_count >= 2) score += 0.08;
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.35 ? ["Ramp ou payoff caro insuficiente para big mana."] : [] });
}

function scoreGoodstuff(model, s, statistics) {
  let score = 0.16;
  const evidence = [];
  const missing = [];
  const recognitionRatio = statistics.recognitionRatio || 0;
  const hasMidrangeShell = s.threat_count >= 12 && s.interaction_count >= 6 && s.card_draw_count + s.value_engine_count >= 6;
  const focusedPlanSignals = Math.max(
    s.burn_count >= 8 ? s.burn_count / 3 : 0,
    s.early_pressure_count >= 10 ? s.early_pressure_count / 2 : 0,
    s.sacrifice_outlet_count + s.death_payoff_count + s.drain_payoff_count,
    s.spell_trigger_count + (s.spell_density >= 0.45 ? 4 : 0),
    s.reanimation_count + s.large_threat_count,
    s.equipment_aura_count / 2,
    s.tribal_payoff_count + s.lord_count,
    s.counterspell_count + s.board_wipe_count
  );

  if (s.value_engine_count >= 8 && s.interaction_count >= 5) {
    score += hasMidrangeShell ? 0.12 : 0.22;
    evidence.push("Ha valor e interacao, mas sem um pacote sinergico dominante.");
  }

  if (focusedPlanSignals < 6 && recognitionRatio > 0.7) {
    score += 0.18;
    evidence.push("Os sinais sinergicos estao espalhados; isso parece mais value/goodstuff.");
    missing.push("Baixa densidade de sinergia especifica.");
  }

  if (hasMidrangeShell) {
    score = Math.min(score, 0.52);
  } else if (focusedPlanSignals >= 6) {
    score = Math.min(score, 0.4);
  }

  return result({ id: model.id, label: model.label, score, evidence, missing });
}

function scoreEquipmentAuras(model, s) {
  const score = (s.equipment_aura_count >= 8 ? 0.34 : s.equipment_aura_count >= 4 ? 0.18 : 0) + (s.protection_count >= 2 ? 0.08 : 0);
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.equipment_aura_count} auras/equipamentos detectados.`] : [], missing: [] });
}

function scoreGroupSlug(model, s) {
  const score = s.group_slug_count >= 5 ? 0.38 : s.group_slug_count >= 2 ? 0.18 : 0;
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.group_slug_count} efeitos de punir a mesa detectados.`] : [], missing: [] });
}

function scoreTheftSac(model, s) {
  let score = 0;
  const evidence = [];
  if (s.theft_count >= 3) score += 0.18;
  if (s.sacrifice_outlet_count >= 3) score += 0.18;
  if (s.theft_count >= 2 && s.sacrifice_outlet_count >= 2) {
    score += 0.16;
    evidence.push(`${s.theft_count} efeitos de roubo e ${s.sacrifice_outlet_count} outlets formam steal-and-sac.`);
  }
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.4 ? ["Roubo e sacrificio ainda nao aparecem juntos em densidade."] : [] });
}

function scoreDeathTriggers(model, s) {
  const score = s.death_payoff_count >= 5 ? 0.36 : s.death_payoff_count >= 2 ? 0.18 : 0;
  return result({ id: model.id, label: model.label, score, evidence: score ? [`${s.death_payoff_count} payoffs de morte detectados.`] : [], missing: [] });
}

function scoreTreasureSac(model, s) {
  let score = 0;
  const evidence = [];
  if (s.treasure_count >= 5) {
    score += 0.2;
    evidence.push(`${s.treasure_count} cartas de tesouro detectadas.`);
  }
  if (s.commander_aristocrats_signal && s.treasure_count >= 2) score += 0.14;
  if (s.artifact_synergy_count >= 2 || s.sacrifice_outlet_count >= 2) score += 0.12;
  return result({ id: model.id, label: model.label, score, evidence, missing: [] });
}

function scoreTempo(model, s) {
  let score = 0;
  const evidence = [];
  if (s.evasive_count >= 6) {
    score += 0.16;
    evidence.push(`${s.evasive_count} criaturas/eixos evasivos detectados.`);
  }
  if (s.counterspell_count + s.instant_speed_interaction_count >= 6) score += 0.18;
  if (s.combat_damage_trigger_count + s.ninja_count >= 4) score += 0.18;
  return result({ id: model.id, label: model.label, score, evidence, missing: score < 0.35 ? ["Pouca evasao/interacao barata para tempo."] : [] });
}

function genericScore(model, signals) {
  let score = 0;
  const evidence = [];
  for (const signal of model.requiredSignals || []) {
    const value = Number(signals[signal] || 0);
    if (value > 0) {
      score += 0.08;
      evidence.push(`${signal}: ${value}.`);
    }
  }
  return result({ id: model.id, label: model.label, score, evidence, missing: [] });
}

function buildRejectedArchetypes({ scores, signals, tribalSummary, commanderProfile }) {
  const rejected = [];
  const combo = scores.find((item) => item.id === "combo");
  if ((signals.tutor_count || 0) + (signals.burst_mana_count || 0) >= 3 && (signals.combo_line_count || 0) === 0) {
    rejected.push({
      id: "combo",
      label: "Combo",
      reason: "Tutores ou mana explosiva apareceram, mas nenhuma linha de combo concreta foi encontrada."
    });
  } else if (combo?.score < 0.45) {
    rejected.push({ id: "combo", label: "Combo", reason: "Nao ha densidade de pecas ou linha detectada para chamar o deck de combo." });
  }

  if (tribalSummary?.primaryTribe && GENERIC_TRIBES.has(tribalSummary.primaryTribe) && !commanderProfile?.tribe && (signals.tribal_payoff_count || 0) < 2) {
    rejected.push({
      id: `tribal_${tribalSummary.primaryTribe.toLowerCase()}`,
      label: `${tribalSummary.primaryTribe} Tribal`,
      reason: `Ha ${tribalSummary.primaryTribe}s na lista, mas falta payoff/lord tribal suficiente para esse ser o plano principal.`
    });
  }

  if ((signals.token_generator_count || 0) < 3) {
    rejected.push({
      id: "tokens_go_wide",
      label: "Tokens / Mesa larga",
      reason: "Pouca densidade de geradores de ficha para sustentar mesa larga como plano principal."
    });
  }

  if ((signals.graveyard_synergy_count || 0) > 0 && (signals.reanimation_count || 0) < 2 && (signals.recursion_count || 0) < 3) {
    rejected.push({
      id: "reanimator",
      label: "Reanimator",
      reason: "Existem sinais pontuais de cemiterio, mas nao ha reanimacao suficiente para definir o arquotipo."
    });
  }

  return dedupeRejected(rejected);
}

function pickPrimary(scores) {
  const valid = scores.filter((item) => !isBlockedPrimary(item));
  const best = valid[0];
  if (!best || best.score < 0.42) {
    return result({
      id: "unclear",
      label: "Plano ainda pouco claro",
      score: Math.max(best?.score || 0.25, 0.32),
      evidence: best?.evidence?.length ? best.evidence : ["Os sinais aparecem espalhados e nenhum arquotipo passou do limiar minimo."],
      missing: ["Aumente a densidade do plano principal ou reconheca mais cartas do catalogo."]
    });
  }
  return best;
}

function isBlockedPrimary(score) {
  if (score.id === "combo" && score.score < 0.55) return true;
  if (score.id === "tribal" && score.score < 0.55) return true;
  return false;
}

function isHardRejected(id, rejected) {
  return (rejected || []).some((item) => item.id === id);
}

function buildStrategyWincons({ primary, secondary, winconSummary, signals }) {
  const labels = new Set((winconSummary?.primaryWincons || [])
    .filter((item) => item.type !== "combo" || (signals.combo_line_count || 0) > 0)
    .map((item) => item.label));
  for (const id of [primary.id, ...(secondary || []).map((item) => item.id)]) {
    const model = getArchetypeModel(id) || (String(id).startsWith("profile:") ? null : null);
    for (const wincon of model?.expectedWincons || []) {
      if ((wincon === "combo" || wincon === "combo_loop") && (signals.combo_line_count || 0) === 0) continue;
      labels.add(labelWincon(wincon));
    }
  }
  if (primary.id.includes("aristocrats") || signals.drain_payoff_count >= 2) labels.add("Drain e gatilhos de morte");
  if (primary.id.includes("aristocrats") && signals.sacrifice_outlet_count >= 1) labels.add("Dano por sacrificio e Juri grande morrendo");
  if (primary.id === "control") labels.add("Finalizador protegido depois de estabilizar");
  if (primary.id === "voltron") labels.add("Dano de comandante");
  return [...labels].filter(Boolean).slice(0, 5);
}

function buildPlans({ primary, secondary, commander, commanderProfile, signals, tribalSummary, winConditions }) {
  const commanderName = commander?.displayName || "o comandante";
  if (commanderProfile?.expectedGamePlan) {
    return {
      planA: commanderProfile.expectedGamePlan,
      planB: `Se ${commanderName} atrasar, use os pacotes de ${secondary.map((item) => item.label.toLowerCase()).slice(0, 2).join(" e ") || "valor e interacao"} para sobreviver ate encontrar ${winConditions[0] || "uma linha de fechamento"}.`
    };
  }

  switch (primary.id) {
    case "aristocrats_sacrifice":
      return {
        planA: "Montar outlet de sacrificio + fodder + payoff de morte/drain para transformar recursos pequenos em dano ou vantagem.",
        planB: "Jogar como midrange de valor, trocando criaturas e recursao ate reconstruir o motor de sacrificio."
      };
    case "control":
      return {
        planA: "Sobreviver ao early game, trocar recursos com respostas e compra, depois fechar com finalizador protegido.",
        planB: "Se faltar finalizador, vencer por valor incremental e permanentes resilientes enquanto nega o plano da mesa."
      };
    case "tribal":
      return {
        planA: `Aumentar densidade de ${tribalSummary?.primaryTribe || "tribo"}, converter lords/payoffs em pressao e fechar por combate ou drain.`,
        planB: "Usar os melhores payoffs e compra para reconstruir depois de wipes."
      };
    case "voltron":
      return {
        planA: "Concentrar buffs, evasao e protecao no comandante para vencer por dano de comandante.",
        planB: "Se o comandante ficar caro, transformar equipamentos/auras em suporte para outra ameaca evasiva."
      };
    case "spellslinger":
      return {
        planA: "Encadear instants/sorceries com payoffs de spell para acumular valor e dano.",
        planB: "Jogar em ritmo de controle/tempo, usando cantrips e interacao ate achar o payoff."
      };
    case "reanimator":
      return {
        planA: "Colocar alvos grandes no cemiterio e voltar essas criaturas antes do ritmo normal da mesa.",
        planB: "Ganhar por valor de cemiterio e ameacas grandes conjuradas de forma justa."
      };
    case "goodstuff_value":
      return {
        planA: "Usar cartas individualmente fortes para gerar valor e controlar a mesa.",
        planB: "Ajustar o deck em torno de um eixo mais claro caso o valor bruto nao feche partidas."
      };
    default:
      return {
        planA: `Executar o plano de ${primary.label.toLowerCase()} com as cartas que mais contribuem para esse eixo.`,
        planB: "Se o plano principal falhar, jogar pelo pacote de interacao e card advantage ate encontrar a melhor condicao de vitoria."
      };
  }
}

function result({ id, label, score, evidence = [], missing = [], source = "signals" }) {
  const safeScore = Math.max(0, Math.min(1, Number(score || 0)));
  return {
    id,
    label,
    score: safeScore,
    confidence: confidenceFromScore(safeScore),
    evidence: [...new Set(evidence.filter(Boolean))].slice(0, 7),
    missing: [...new Set(missing.filter(Boolean))].slice(0, 6),
    source
  };
}

function formatPrimary(item) {
  return {
    id: item.id,
    label: item.label,
    confidence: item.confidence,
    evidence: item.evidence,
    missing: item.missing
  };
}

function formatSecondary(item) {
  return {
    id: item.id,
    label: item.label,
    confidence: item.confidence,
    evidence: item.evidence.slice(0, 3)
  };
}

function mergeSecondaryArchetypes(profileLabels, scoredSecondaries) {
  const merged = [];
  for (const label of profileLabels || []) {
    merged.push({
      id: `profile_secondary:${normalizeId(label)}`,
      label,
      confidence: 0.72,
      evidence: ["Eixo secundario indicado pelo profile do comandante."]
    });
  }
  merged.push(...(scoredSecondaries || []));
  const seen = new Set();
  return merged.filter((item) => {
    const key = String(item.label || item.id).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function confidenceFromScore(score) {
  if (score >= THRESHOLDS.high) return Number(Math.min(0.95, score).toFixed(2));
  if (score >= THRESHOLDS.medium) return Number(Math.max(0.56, score).toFixed(2));
  return Number(Math.max(0.25, score).toFixed(2));
}

function confidenceLevelFor(confidence) {
  if (confidence >= THRESHOLDS.high) return "high";
  if (confidence >= THRESHOLDS.medium) return "medium";
  return "low";
}

function dedupeScores(scores) {
  const bestByLabel = new Map();
  for (const score of scores) {
    const key = score.label;
    const current = bestByLabel.get(key);
    if (!current || score.score > current.score) bestByLabel.set(key, score);
  }
  return [...bestByLabel.values()].sort((a, b) => b.score - a.score);
}

function dedupeRejected(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.id}:${item.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function labelWincon(value) {
  return ({
    drain: "Drain",
    death_triggers: "Gatilhos de morte",
    combo_loop: "Loop de combo",
    combo: "Combo",
    combat_damage: "Dano de combate",
    go_wide: "Mesa larga",
    tokens: "Fichas",
    commander_damage: "Dano de comandante",
    big_mana: "Big mana",
    large_threats: "Ameacas grandes",
    value_over_time: "Valor acumulado",
    burn: "Burn",
    mill: "Mill",
    control_finisher: "Finalizador de controle",
    planeswalker: "Planeswalker",
    spell_damage: "Dano por spells",
    storm: "Storm/Ritual"
  })[value] || value;
}

function normalizeId(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
