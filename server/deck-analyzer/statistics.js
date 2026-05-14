import { CARD_TYPE_LABELS, COMMANDER_FORMATS, CREATURE_ROLE_TAGS, FUNCTION_KEYS } from "./types.js";
import { isDeathOrDrainPayoff, isRealSacrificeOutlet } from "./function-taxonomy.js";

export function buildDeckSummary(parsedDeck) {
  return {
    mainboard_cards: sumQuantity(parsedDeck.mainboard),
    sideboard_cards: sumQuantity(parsedDeck.sideboard),
    commander_cards: sumQuantity(parsedDeck.commander),
    companion_cards: sumQuantity(parsedDeck.companion),
    maybeboard_cards: sumQuantity(parsedDeck.maybeboard),
    total_unique_mainboard: uniqueNames(parsedDeck.mainboard),
    total_unique_sideboard: uniqueNames(parsedDeck.sideboard)
  };
}

export function buildDeckStatistics({ cards = [], parsedDeck, commander = null, format = "casual" }) {
  const totals = {
    totalCardsInDecklist: sumQuantity(cards),
    uniqueCards: cards.length,
    recognizedCards: 0,
    unknownCards: 0,
    unknownCardNames: [],
    knownCardNames: []
  };
  const tagCounts = {};
  const typeCounters = {
    lands: 0,
    creatures: 0,
    nonCreatures: 0,
    artifacts: 0,
    enchantments: 0,
    instants: 0,
    sorceries: 0,
    planeswalkers: 0,
    battles: 0
  };
  const creatureStats = {
    total: 0,
    legendary: 0,
    manaCreatures: 0,
    utilityCreatures: 0,
    payoffCreatures: 0,
    finishers: 0,
    evasiveCreatures: 0
  };
  const manaCurve = { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0 };
  const manaCurveByType = {};
  const manaCurveByColor = {};
  const colorIdentitySet = new Set();
  const functionCounts = Object.fromEntries(Object.keys(FUNCTION_KEYS).map((key) => [key, 0]));
  const legalityIssues = { bannedCards: [], notLegalCards: [], unknownCards: [] };

  let manaValueTotal = 0;
  let nonLandCards = 0;

  for (const card of cards) {
    const quantity = Number(card.quantity || 0);
    const isRecognized = card.databaseStatus === "found" || card.databaseStatus === "needs_review";

    if (!isRecognized) {
      totals.unknownCards += quantity;
      totals.unknownCardNames.push(card.inputName || card.name);
      continue;
    }

    totals.recognizedCards += quantity;
    totals.knownCardNames.push(card.displayName || card.canonicalName || card.inputName);
    trackLegality(card, format, legalityIssues);

    for (const color of card.colorIdentity || []) colorIdentitySet.add(color);
    for (const tag of card.tags || []) tagCounts[tag] = (tagCounts[tag] || 0) + quantity;

    let countedCreature = false;
    for (const [type, key] of Object.entries(CARD_TYPE_LABELS)) {
      if (card.cardTypes?.includes(type)) {
        typeCounters[key] += quantity;
      }
    }

    if (card.cardTypes?.includes("Creature")) {
      creatureStats.total += quantity;
      countedCreature = true;
      if (card.isLegendary) creatureStats.legendary += quantity;
      for (const [bucket, tags] of Object.entries(CREATURE_ROLE_TAGS)) {
        if (card.tags?.some((tag) => tags.includes(tag))) creatureStats[bucket] += quantity;
      }
    }

    if (!card.cardTypes?.includes("Land")) {
      nonLandCards += quantity;
      const manaValue = Number(card.manaValue || 0);
      manaValueTotal += manaValue * quantity;
      const bucket = manaValue >= 7 ? "7+" : String(Math.max(0, Math.floor(manaValue)));
      manaCurve[bucket] = (manaCurve[bucket] || 0) + quantity;
      countCurveByType(manaCurveByType, card, bucket, quantity);
      countCurveByColor(manaCurveByColor, card, bucket, quantity);
    }

    countFunctions(card, functionCounts, quantity);

    if (countedCreature && card.tags?.includes("creature_ramp")) creatureStats.manaCreatures += 0;
  }

  const deckColorIdentity = [...colorIdentitySet].sort(colorSorter);
  const commanderColorIdentity = commander?.colorIdentity || [];
  const averageManaValue = nonLandCards ? Number((manaValueTotal / nonLandCards).toFixed(2)) : 0;

  const mana = {
    lands: typeCounters.lands,
    permanentRamp: tagCounts.permanent_ramp || 0,
    creatureRamp: tagCounts.creature_ramp || 0,
    artifactRamp: tagCounts.artifact_ramp || 0,
    landRamp: tagCounts.land_ramp || 0,
    burstMana: tagCounts.burst_mana || 0,
    costReducers: tagCounts.cost_reducer || 0,
    manaFixing: tagCounts.mana_fixing || 0,
    averageManaValue,
    curve: manaCurve
  };

  const roles = {
    "Ramp permanente": mana.permanentRamp,
    "Mana explosiva": mana.burstMana,
    Redutores: mana.costReducers,
    Compra: functionCounts.cardDraw,
    Selecao: functionCounts.cardSelection,
    Remocao: functionCounts.removal,
    Protecao: functionCounts.protection,
    Recursao: functionCounts.recursion,
    Tutores: functionCounts.tutors
  };

  return {
    totalCardsInDecklist: totals.totalCardsInDecklist,
    totalWithCommander: totals.totalCardsInDecklist + (COMMANDER_FORMATS.has(format) && commander?.displayName ? 1 : 0),
    uniqueCards: totals.uniqueCards,
    recognizedCards: totals.recognizedCards,
    unknownCards: totals.unknownCards,
    recognitionRatio: totals.totalCardsInDecklist ? totals.recognizedCards / totals.totalCardsInDecklist : 0,
    unknownRatio: totals.totalCardsInDecklist ? totals.unknownCards / totals.totalCardsInDecklist : 0,
    unknownCardNames: [...new Set(totals.unknownCardNames)],
    sideboardCards: sumQuantity(parsedDeck?.sideboard || []),
    types: {
      ...typeCounters,
      nonCreatures: Math.max(0, totals.totalCardsInDecklist - typeCounters.creatures)
    },
    creatures: creatureStats,
    mana,
    totalManaValue: Number(manaValueTotal.toFixed(2)),
    functions: functionCounts,
    categories: buildCategories({ functionCounts, mana, tagCounts }),
    colors: {
      deckColorIdentity,
      deckColorIdentityLabel: deckColorIdentity.length ? deckColorIdentity.join(", ") : "Incolor",
      commanderColorIdentity,
      commanderColorIdentityLabel: commanderColorIdentity.length ? commanderColorIdentity.join(", ") : "Incolor"
    },
    tagCounts,
    averageManaValue,
    foundTotal: totals.recognizedCards,
    colorIdentity: deckColorIdentity,
    colorsLabel: deckColorIdentity.length ? deckColorIdentity.join(", ") : "Incolor",
    manaCurve,
    manaCurveByType,
    manaCurveByColor,
    legality: buildLegality(format, legalityIssues),
    roles
  };
}

function countFunctions(card, functionCounts, quantity) {
  for (const [key, tags] of Object.entries(FUNCTION_KEYS)) {
    if (key === "sacrificeOutlets") {
      if (isRealSacrificeOutlet(card)) functionCounts[key] += quantity;
      continue;
    }
    if (key === "payoffs" || key === "finishers") {
      if (card.tags?.some((tag) => tags.includes(tag)) || isDeathOrDrainPayoff(card)) functionCounts[key] += quantity;
      continue;
    }
    if (card.tags?.some((tag) => tags.includes(tag))) functionCounts[key] += quantity;
  }
}

function countCurveByType(target, card, bucket, quantity) {
  for (const type of card.cardTypes || []) {
    if (!target[type]) target[type] = emptyCurve();
    target[type][bucket] = (target[type][bucket] || 0) + quantity;
  }
}

function countCurveByColor(target, card, bucket, quantity) {
  const colors = card.colors?.length ? card.colors : card.colorIdentity || [];
  const keyColors = colors.length ? colors : ["C"];
  for (const color of keyColors) {
    if (!target[color]) target[color] = emptyCurve();
    target[color][bucket] = (target[color][bucket] || 0) + quantity;
  }
}

function emptyCurve() {
  return { "0": 0, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0, "7+": 0 };
}

function buildCategories({ functionCounts, mana, tagCounts }) {
  return {
    ramp: (mana.permanentRamp || 0) + (mana.creatureRamp || 0) + (mana.landRamp || 0) + (mana.burstMana || 0),
    permanentRamp: mana.permanentRamp || 0,
    burstMana: mana.burstMana || 0,
    costReducers: mana.costReducers || 0,
    draw: functionCounts.cardDraw || 0,
    selection: functionCounts.cardSelection || 0,
    removal: functionCounts.removal || 0,
    wipes: functionCounts.boardWipes || 0,
    protection: functionCounts.protection || 0,
    recursion: functionCounts.recursion || 0,
    tutors: functionCounts.tutors || 0,
    tokens: functionCounts.tokenGenerators || 0,
    sacOutlets: functionCounts.sacrificeOutlets || 0,
    payoffs: functionCounts.payoffs || 0,
    finishers: functionCounts.finishers || 0,
    graveyardHate: functionCounts.graveyardHate || 0,
    artifactHate: functionCounts.artifactHate || 0,
    enchantmentHate: functionCounts.enchantmentHate || 0,
    counterspells: functionCounts.counterspells || 0,
    discard: functionCounts.discard || 0,
    lifegain: functionCounts.lifegain || 0,
    drain: functionCounts.drain || 0,
    engines: tagCounts.engine || 0
  };
}

function trackLegality(card, format, issues) {
  if (!format || format === "casual") return;
  const value = card.legalities?.[format];
  const name = card.displayName || card.canonicalName || card.inputName;
  if (!value) issues.unknownCards.push(name);
  else if (value === "banned" || value === "restricted") issues.bannedCards.push(name);
  else if (value === "not_legal") issues.notLegalCards.push(name);
}

function buildLegality(format, issues) {
  if (!format || format === "casual") return { format, status: "not_applicable", bannedCards: [], notLegalCards: [], unknownCards: [] };
  const bannedCards = [...new Set(issues.bannedCards)];
  const notLegalCards = [...new Set(issues.notLegalCards)];
  const unknownCards = [...new Set(issues.unknownCards)];
  return {
    format,
    status: bannedCards.length || notLegalCards.length ? "issues" : unknownCards.length ? "unknown" : "legal",
    bannedCards,
    notLegalCards,
    unknownCards
  };
}

function sumQuantity(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}

function uniqueNames(cards = []) {
  return new Set(cards.map((card) => String(card.name || "").trim().toLowerCase()).filter(Boolean)).size;
}

function colorSorter(a, b) {
  const order = ["W", "U", "B", "R", "G", "C"];
  return order.indexOf(a) - order.indexOf(b);
}
