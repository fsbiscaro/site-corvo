export const COLOR_ORDER = ["W", "U", "B", "R", "G"];

export const CARD_DATABASE = {
  Plains: land("Plains", ["Planicie"], ["W"], "Basic Land - Plains"),
  Island: land("Island", ["Ilha"], ["U"], "Basic Land - Island"),
  Swamp: land("Swamp", ["Pantano"], ["B"], "Basic Land - Swamp"),
  Mountain: land("Mountain", ["Montanha"], ["R"], "Basic Land - Mountain"),
  Forest: land("Forest", ["Floresta"], ["G"], "Basic Land - Forest"),
  "Command Tower": land("Command Tower", ["Torre de Comando"], ["W", "U", "B", "R", "G"], "Land", ["mana_fixing"]),
  "Exotic Orchard": land("Exotic Orchard", ["Pomar Exotico"], ["W", "U", "B", "R", "G"], "Land", ["mana_fixing"]),
  "Sol Ring": artifact("Sol Ring", ["Anel Solar"], 1, [], ["ramp", "permanent_ramp"]),
  "Arcane Signet": artifact("Arcane Signet", ["Sinete Arcano"], 2, [], ["ramp", "permanent_ramp", "mana_fixing"]),
  "Dimir Signet": artifact("Dimir Signet", ["Sinete Dimir"], 2, ["U", "B"], ["ramp", "permanent_ramp", "mana_fixing"]),
  "Go for the Throat": instant("Go for the Throat", ["Atacar na Jugular"], 2, ["B"], ["removal", "single_target_removal"]),
  Counterspell: instant("Counterspell", ["Contramagica"], 2, ["U"], ["counterspell", "control", "interaction"]),
  "Tetsuko Umezawa, Fugitive": creature("Tetsuko Umezawa, Fugitive", ["Tetsuko Umezawa, Fugitiva"], 2, ["U"], ["legendary", "evasive", "unblockable", "tempo"], "1", "3", true),
  "Yuriko, the Tiger's Shadow": creature("Yuriko, the Tiger's Shadow", ["Yuriko, a Sombra do Tigre"], 3, ["U", "B"], ["legendary", "ninja", "ninjutsu", "combat_damage_trigger", "card_draw", "tempo", "engine"], "1", "3", true),
  "Kaalia, Zenith Seeker": creature("Kaalia, Zenith Seeker", ["Kaalia, Buscadora do Zenite"], 3, ["W", "B", "R"], ["legendary", "flying", "card_selection", "angel", "demon", "dragon"], "3", "3", true),
  "Path to Exile": instant("Path to Exile", ["Caminho para o Exilio"], 1, ["W"], ["removal", "single_target_removal"]),
  "Swords to Plowshares": instant("Swords to Plowshares", ["Espadas em Arados"], 1, ["W"], ["removal", "single_target_removal"])
};

const LOOKUP = buildLookup();

export function normalizeCardName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9/,\-: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findCardInDatabase(name) {
  return LOOKUP.get(normalizeCardName(name)) || null;
}

function buildLookup() {
  const lookup = new Map();
  Object.values(CARD_DATABASE).forEach((card) => {
    [card.canonicalName, ...(card.printedNames || [])].forEach((name) => {
      lookup.set(normalizeCardName(name), card);
    });
  });
  return lookup;
}

function baseCard(canonicalName, printedNames, manaValue, typeLine, cardTypes, colors, colorIdentity, tags, power = null, toughness = null, legendary = false) {
  return {
    canonicalName,
    printedNames,
    manaValue,
    typeLine,
    cardTypes,
    colors,
    colorIdentity,
    tags,
    power,
    toughness,
    isLegendary: legendary,
    canBeCommander: legendary && cardTypes.includes("Creature"),
    imageUrl: null,
    thumbnailUrl: null,
    needsReview: false
  };
}

function land(canonicalName, printedNames, colorIdentity, typeLine, tags = []) {
  return baseCard(canonicalName, printedNames, 0, typeLine, ["Land"], [], colorIdentity, ["land", ...tags]);
}

function artifact(canonicalName, printedNames, manaValue, colorIdentity, tags, power = null, toughness = null) {
  const cardTypes = tags.includes("creature") ? ["Artifact", "Creature"] : ["Artifact"];
  return baseCard(canonicalName, printedNames, manaValue, "Artifact", cardTypes, [], colorIdentity, ["artifact", ...tags], power, toughness);
}

function creature(canonicalName, printedNames, manaValue, colorIdentity, tags, power, toughness, legendary = false) {
  return baseCard(canonicalName, printedNames, manaValue, legendary ? "Legendary Creature" : "Creature", ["Creature"], colorIdentity, colorIdentity, ["creature", ...tags], power, toughness, legendary);
}

function instant(canonicalName, printedNames, manaValue, colorIdentity, tags) {
  return baseCard(canonicalName, printedNames, manaValue, "Instant", ["Instant"], colorIdentity, colorIdentity, ["instant", ...tags]);
}
