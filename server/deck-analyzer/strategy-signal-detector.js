import { GENERIC_TRIBES } from "./types.js";
import {
  isAristocratsEngine,
  isDeathOrDrainPayoff,
  isFreeSacrificeOutlet as isFreeSacrificeOutletStrict,
  isRealSacrificeOutlet,
  isRecursionSupport,
  isTreasureValue
} from "./function-taxonomy.js";

const BASIC_LANDS = new Set(["plains", "island", "swamp", "mountain", "forest"]);

export function detectStrategySignals({ cards = [], commander = null, commanderProfile = null, tribalSummary = null, statistics = {}, winconSummary = null } = {}) {
  const signals = zeroSignals();
  const details = { signalCards: {}, rejectedHints: [] };
  const knownCards = (cards || []).filter((card) => card.databaseStatus !== "unknown");
  const totalCards = sumQuantities(cards);
  const nonLandCards = Math.max(1, totalCards - (statistics.types?.lands || 0));
  const commanderText = textOf(commander);
  const commanderTags = new Set(commander?.tags || []);
  const commanderName = commander?.displayName || commander?.canonicalName || "";

  signals.total_cards = totalCards;
  signals.recognized_cards = statistics.recognizedCards || knownCards.length;
  signals.unknown_cards = statistics.unknownCards || 0;
  signals.creature_count = statistics.types?.creatures || countCards(cards, (card) => hasType(card, "Creature"));
  signals.threat_count = countCards(cards, isThreat);
  signals.efficient_creature_count = countCards(cards, (card) => isThreat(card) && Number(card.manaValue || 0) <= 3);
  signals.early_pressure_count = countCards(cards, (card) => isThreat(card) && Number(card.manaValue || 0) <= 2);
  signals.interaction_count = statistics.functions?.interaction || countByTags(cards, ["interaction", "removal", "counterspell", "discard", "board_wipe"]);
  signals.removal_count = statistics.functions?.removal || countByTags(cards, ["removal"]);
  signals.board_wipe_count = statistics.functions?.boardWipes || countByTags(cards, ["board_wipe"]);
  signals.counterspell_count = statistics.functions?.counterspells || countByTags(cards, ["counterspell"]);
  signals.instant_speed_interaction_count = countCards(cards, (card) => hasType(card, "Instant") && hasAnyTag(card, ["interaction", "removal", "counterspell"]));
  signals.card_draw_count = statistics.functions?.cardDraw || countByTags(cards, ["card_draw"]);
  signals.card_selection_count = statistics.functions?.cardSelection || countByTags(cards, ["card_selection", "topdeck_manipulation"]);
  signals.protection_count = statistics.functions?.protection || countByTags(cards, ["protection"]);
  signals.recursion_count = statistics.functions?.recursion || countByTags(cards, ["recursion"]);
  signals.tutor_count = statistics.functions?.tutors || countByTags(cards, ["tutor"]);
  signals.finisher_count = statistics.functions?.finishers || countByTags(cards, ["finisher"]);
  signals.ramp_count = statistics.categories?.ramp || countByTags(cards, ["ramp", "permanent_ramp", "burst_mana", "creature_ramp", "land_ramp"]);
  signals.permanent_ramp_count = statistics.mana?.permanentRamp || countByTags(cards, ["permanent_ramp", "artifact_ramp", "creature_ramp", "land_ramp"]);
  signals.burst_mana_count = statistics.mana?.burstMana || countByTags(cards, ["burst_mana", "ritual"]);
  signals.cost_reducer_count = statistics.mana?.costReducers || countByTags(cards, ["cost_reducer"]);

  signals.sacrifice_outlet_count = countCards(cards, isRealSacrificeOutlet);
  signals.free_sacrifice_outlet_count = countCards(cards, isFreeSacrificeOutletStrict);
  signals.token_generator_count = statistics.functions?.tokenGenerators || countByTags(cards, ["token_generator", "tribal_token_generator"]);
  signals.treasure_count = countCards(cards, isTreasureCard);
  signals.recurring_treasure_count = countCards(cards, (card) => isTreasureCard(card) && matchesText(card, /whenever|at the beginning|each|one or more/i));
  signals.fodder_count = signals.token_generator_count + signals.treasure_count + countCards(cards, isRecursiveFodder);
  signals.death_payoff_count = countCards(cards, isDeathOrDrainPayoff);
  signals.drain_payoff_count = countCards(cards, isDeathOrDrainPayoff);
  signals.aristocrats_engine_count = signals.sacrifice_outlet_count + signals.death_payoff_count + signals.fodder_count + countCards(cards, isAristocratsEngine);

  signals.tribal_density = tribalSummary?.tribalCreatureRatio || 0;
  signals.tribal_creature_count = tribalSummary?.tribalCreatures || 0;
  signals.tribal_payoff_count = (tribalSummary?.tribalPayoffs || 0) + (tribalSummary?.tribalLords || 0) + (tribalSummary?.tribalAnthems || 0);
  signals.lord_count = countByTags(cards, ["lord"]);
  signals.anthem_count = countByTags(cards, ["anthem"]);
  signals.tribal_support_count = signals.tribal_payoff_count + (tribalSummary?.tribalTokenGenerators || 0);
  signals.generic_tribe_only = tribalSummary?.primaryTribe && GENERIC_TRIBES.has(tribalSummary.primaryTribe) && !commanderProfile?.tribe ? 1 : 0;

  signals.evasive_count = countByTags(cards, ["evasive", "unblockable", "flying", "menace"]);
  signals.ninja_count = countByTags(cards, ["ninja", "ninjutsu"]);
  signals.combat_damage_trigger_count = countByTags(cards, ["combat_damage_trigger"]);
  signals.equipment_count = countCards(cards, (card) => typeLine(card).includes("equipment"));
  signals.aura_count = countCards(cards, (card) => typeLine(card).includes("aura"));
  signals.equipment_aura_count = signals.equipment_count + signals.aura_count;
  signals.commander_damage_support_count = signals.equipment_aura_count + countCards(cards, (card) => hasAnyTag(card, ["protection", "evasive", "trample", "menace"]) || matchesText(card, /gets \+\d|\+1\/\+1|double strike|first strike/i));

  signals.spell_density = Number((((statistics.types?.instants || 0) + (statistics.types?.sorceries || 0)) / nonLandCards).toFixed(3));
  signals.spell_trigger_count = countCards(cards, (card) => matchesText(card, /whenever you cast .*instant|whenever you cast .*sorcery|instant or sorcery spell|magecraft|prowess/i));
  signals.burn_count = countCards(cards, (card) => hasAnyTag(card, ["burn"]) || matchesText(card, /deals \d+ damage|deals x damage|any target|each opponent.*damage/i));
  signals.direct_damage_count = signals.burn_count + countCards(cards, (card) => matchesText(card, /loses \d+ life|each opponent loses/i));
  signals.reanimation_count = countCards(cards, isReanimationCard);
  signals.graveyard_synergy_count = countByTags(cards, ["graveyard_synergy", "recursion"]) + countCards(cards, (card) => matchesText(card, /from your graveyard|in your graveyard|mill .* cards|surveil/i));
  signals.self_mill_count = countCards(cards, (card) => matchesText(card, /mill .* cards|surveil/i));
  signals.blink_enabler_count = countCards(cards, (card) => matchesText(card, /exile .* return|exile another target|flicker|blink/i));
  signals.etb_payoff_count = countCards(cards, (card) => matchesText(card, /enters the battlefield|enter the battlefield/i));
  signals.artifact_count = statistics.types?.artifacts || countCards(cards, (card) => hasType(card, "Artifact"));
  signals.artifact_synergy_count = countCards(cards, (card) => matchesText(card, /artifact you control|artifacts you control|artifact spell|sacrifice an artifact/i));
  signals.enchantment_count = statistics.types?.enchantments || countCards(cards, (card) => hasType(card, "Enchantment"));
  signals.enchantress_count = countCards(cards, (card) => matchesText(card, /whenever you cast an enchantment|enchantment spell|enchantments you control/i));
  signals.landfall_count = countCards(cards, (card) => matchesText(card, /landfall|land enters the battlefield|play an additional land|lands you control/i));
  signals.lifegain_count = statistics.functions?.lifegain || countByTags(cards, ["lifegain"]);
  signals.counter_synergy_count = countCards(cards, (card) => matchesText(card, /proliferate|\+1\/\+1 counter|counter on target|counters on/i));
  signals.stax_piece_count = countCards(cards, (card) => matchesText(card, /spells cost .* more|players can't|opponents can't|doesn't untap|skip .* step|only one spell/i));
  signals.mill_count = countCards(cards, (card) => matchesText(card, /target player mills|each opponent mills|mill .* cards/i));
  signals.group_slug_count = countCards(cards, (card) => matchesText(card, /whenever .* opponent|each opponent.*damage|each opponent loses|player casts.*loses/i));
  signals.theft_count = countCards(cards, (card) => matchesText(card, /gain control of target|untap target creature.*gain control|until end of turn/i));
  signals.value_engine_count = countCards(cards, (card) => hasAnyTag(card, ["engine", "card_draw", "recursion", "payoff"]) || matchesText(card, /whenever|at the beginning|draw a card|return .* from your graveyard/i));
  signals.large_threat_count = countCards(cards, (card) => isThreat(card) && Number(card.manaValue || 0) >= 5);
  signals.combo_piece_count = countByTags(cards, ["combo_piece"]);
  signals.combo_line_count = detectComboLines(cards, commander, commanderProfile);

  addCommanderSignals(signals, commander, commanderText, commanderTags, commanderProfile, commanderName);
  attachSignalCards(details, cards);

  signals.primary_wincon_count = winconSummary?.primaryWincons?.length || 0;
  signals.has_clear_wincon = winconSummary?.missingWinconWarning ? 0 : 1;

  return { signals, details };
}

function zeroSignals() {
  return {
    total_cards: 0,
    recognized_cards: 0,
    unknown_cards: 0,
    combo_line_count: 0,
    commander_aristocrats_signal: 0,
    commander_tribal_signal: 0,
    commander_spells_signal: 0,
    commander_voltron_signal: 0,
    commander_graveyard_signal: 0,
    commander_artifact_signal: 0,
    commander_enchantress_signal: 0,
    commander_land_signal: 0,
    commander_lifegain_signal: 0,
    commander_counters_signal: 0
  };
}

function addCommanderSignals(signals, commander, commanderText, commanderTags, commanderProfile, commanderName) {
  if (!commander) return;
  if (/sacrifice|dies|die|death|treasure|artifact is put into a graveyard/i.test(commanderText) || commanderTags.has("sacrifice")) {
    signals.commander_aristocrats_signal = 1;
  }
  if (commanderProfile?.tribe || /other .* you control|whenever .* attacks|create .* token/i.test(commanderText)) signals.commander_tribal_signal = commanderProfile?.tribe ? 1 : signals.commander_tribal_signal;
  if (/instant or sorcery|whenever you cast|magecraft|prowess/i.test(commanderText)) signals.commander_spells_signal = 1;
  if (/equipment|aura|attach|commander damage|double strike|gets \+/i.test(commanderText)) signals.commander_voltron_signal = 1;
  if (/graveyard|dies|return .* from your graveyard|reanimate/i.test(commanderText)) signals.commander_graveyard_signal = 1;
  if (/artifact|treasure|clue|food|blood token/i.test(commanderText)) signals.commander_artifact_signal = 1;
  if (/enchantment|aura/i.test(commanderText)) signals.commander_enchantress_signal = 1;
  if (/landfall|land enters|play an additional land/i.test(commanderText)) signals.commander_land_signal = 1;
  if (/gain life|lifelink|pay life|life total/i.test(commanderText) || commanderName.includes("K'rrik")) signals.commander_lifegain_signal = 1;
  if (/counter|proliferate/i.test(commanderText)) signals.commander_counters_signal = 1;
}

function detectComboLines(cards, commander, commanderProfile) {
  const names = new Set((cards || []).map((card) => normalizeName(card.displayName || card.canonicalName || card.inputName)));
  const knownLines = [
    ["thassas oracle", "demonic consultation"],
    ["thassas oracle", "tainted pact"],
    ["exquisite blood", "sanguine bond"],
    ["mikaeus the unhallowed", "triskelion"],
    ["kiki jiki mirror breaker", "zealous conscripts"],
    ["heliod sun crowned", "walking ballista"],
    ["dramatic reversal", "isochron scepter"],
    ["peregrine drake", "deadeye navigator"]
  ];
  let count = knownLines.filter((line) => line.every((name) => names.has(name))).length;
  count += countByTags(cards, ["combo_piece"]) >= 2 ? 1 : 0;
  if (commander?.displayName?.includes("K'rrik") && commanderProfile?.winconHints?.includes("combo")) count += 1;
  return count;
}

function attachSignalCards(details, cards) {
  const groups = {
    sacrifice_outlets: (card) => isRealSacrificeOutlet(card),
    death_payoffs: (card) => isDeathOrDrainPayoff(card),
    fodder: (card) => hasAnyTag(card, ["token_generator"]) || isTreasureCard(card) || isRecursiveFodder(card),
    interaction: (card) => hasAnyTag(card, ["interaction", "removal", "counterspell", "board_wipe"]),
    card_draw: (card) => hasAnyTag(card, ["card_draw", "card_selection"]),
    finishers: (card) => hasAnyTag(card, ["finisher", "payoff"]) || Number(card.manaValue || 0) >= 6,
    voltron: (card) => typeLine(card).includes("equipment") || typeLine(card).includes("aura") || hasAnyTag(card, ["protection", "evasive"]),
    graveyard: (card) => hasAnyTag(card, ["graveyard_synergy", "recursion"]) || matchesText(card, /graveyard|reanimate/i),
    spells: (card) => hasType(card, "Instant") || hasType(card, "Sorcery") || matchesText(card, /instant or sorcery|whenever you cast/i)
  };
  for (const [key, predicate] of Object.entries(groups)) {
    details.signalCards[key] = (cards || []).filter(predicate).map(cardName).slice(0, 12);
  }
}

function isThreat(card) {
  return hasType(card, "Creature") || hasType(card, "Planeswalker") || hasAnyTag(card, ["threat", "finisher", "payoff"]);
}

function isTreasureCard(card) {
  return hasAnyTag(card, ["treasure", "treasure_generator"]) || isTreasureValue(card);
}

function isRecursiveFodder(card) {
  return hasType(card, "Creature") && (isRecursionSupport(card) || matchesText(card, /escape|disturb|unearth/i));
}

function isReanimationCard(card) {
  return hasAnyTag(card, ["reanimation"]) || matchesText(card, /return target creature card from your graveyard to the battlefield|put target creature card from a graveyard onto the battlefield|reanimate/i);
}

function countByTags(cards, tags) {
  return countCards(cards, (card) => hasAnyTag(card, tags));
}

function countCards(cards, predicate) {
  return (cards || []).reduce((sum, card) => sum + (predicate(card) ? Number(card.quantity || 0) : 0), 0);
}

function sumQuantities(cards) {
  return (cards || []).reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}

function hasAnyTag(card, tags) {
  const set = new Set(card?.tags || []);
  return tags.some((tag) => set.has(tag));
}

function hasType(card, type) {
  return (card?.cardTypes || []).includes(type);
}

function matchesText(card, regex) {
  return regex.test(textOf(card));
}

function textOf(card) {
  return `${card?.oracleText || ""} ${card?.typeLine || ""} ${card?.displayName || card?.canonicalName || card?.inputName || ""}`;
}

function typeLine(card) {
  return String(card?.typeLine || "").toLowerCase();
}

function cardName(card) {
  return card?.displayName || card?.canonicalName || card?.inputName || "";
}

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}
