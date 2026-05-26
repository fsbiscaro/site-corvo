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
  "Swords to Plowshares": instant("Swords to Plowshares", ["Espadas em Arados"], 1, ["W"], ["removal", "single_target_removal"]),

  "Undying Malice": instant("Undying Malice", ["Malignidade Imortal"], 1, ["B"], ["protection", "recursion", "graveyard_synergy"], "Until end of turn, target creature gains \"When this creature dies, return it to the battlefield tapped under its owner's control with a +1/+1 counter on it.\""),
  "Armor of Shadows": instant("Armor of Shadows", ["Armadura de Sombras"], 1, ["B"], ["protection"], "Until end of turn, target creature gets +1/+0 and gains indestructible."),
  "Shard of the Nightbringer": creature("Shard of the Nightbringer", ["Fragmento do Arauto da Noite"], 8, ["B"], ["flying", "evasive", "lifegain", "finisher"], "8", "8", false, "Flying. When this creature enters, target opponent loses half their life, rounded up. You gain life equal to the life lost this way."),
  "Not Dead After All": instant("Not Dead After All", ["Afinal Nem Morreu"], 1, ["B"], ["protection", "recursion", "graveyard_synergy", "token_generator"], "Until end of turn, target creature you control gains a death trigger that returns it to the battlefield tapped, then creates a Wicked Role token attached to it."),
  "Grim Servant": creature("Grim Servant", ["Servo Sinistro"], 4, ["B"], ["tutor"], "3", "2", false, "Menace. When this creature enters, search your library for a card with mana value less than or equal to your devotion to black, reveal it, put it into your hand, then shuffle. You lose 3 life."),
  "Consuming Corruption": instant("Consuming Corruption", ["Corrupcao Consumidora", "Corrupção Consumidora"], 2, ["B"], ["removal", "single_target_removal", "lifegain"], "Consuming Corruption deals X damage to target creature or planeswalker and you gain X life, where X is the number of Swamps you control."),
  "Accursed Marauder": creature("Accursed Marauder", ["Saqueador Amaldicoado", "Saqueador Amaldiçoado"], 2, ["B"], ["sacrifice", "interaction"], "2", "1", false, "When this creature enters, each player sacrifices a nontoken creature of their choice."),
  "Breathe Your Last": instant("Breathe Your Last", ["Respire pela Ultima Vez", "Respire pela Última Vez"], 3, ["B"], ["removal", "single_target_removal", "lifegain"], "Destroy target creature or planeswalker. You gain 1 life for each of its colors."),
  "Cruelclaw's Heist": sorcery("Cruelclaw's Heist", [], 2, ["B"], ["discard", "card_draw", "interaction"], "Target opponent reveals their hand. You choose a nonland card from it. Exile that card. If a gift was promised, you may cast that card for as long as it remains exiled."),
  "Starscape Cleric": creature("Starscape Cleric", [], 2, ["B"], ["flying", "evasive", "lifegain", "drain", "token_generator", "payoff"], "2", "1", false, "Offspring. Flying. This creature can't block. Whenever you gain life, each opponent loses 1 life."),
  "Give In to Violence": instant("Give In to Violence", [], 2, ["B"], ["lifegain", "combat_trick"], "Target creature gets +2/+2 and gains lifelink until end of turn."),
  "Withering Torment": instant("Withering Torment", [], 3, ["B"], ["removal", "single_target_removal", "enchantment_hate"], "Destroy target creature or enchantment. You lose 2 life."),
  "Ancient Cellarspawn": baseCard("Ancient Cellarspawn", [], 3, "Enchantment Creature - Horror", ["Creature", "Enchantment"], ["B"], ["B"], ["creature", "enchantment", "cost_reducer", "drain", "payoff"], "3", "3", false, "Each spell you cast that's a Demon, Horror, or Nightmare costs {1} less to cast. Whenever you cast a spell, if the amount of mana spent to cast it was less than its mana value, target opponent loses life equal to the difference."),
  "Persistent Constrictor": creature("Persistent Constrictor", [], 5, ["B"], ["drain", "recursion", "graveyard_synergy"], "5", "3", false, "At the beginning of each opponent's upkeep, they lose 1 life and you put a -1/-1 counter on up to one target creature they control. Persist.")
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

function baseCard(canonicalName, printedNames, manaValue, typeLine, cardTypes, colors, colorIdentity, tags, power = null, toughness = null, legendary = false, oracleText = "") {
  return {
    canonicalName,
    printedNames,
    manaValue,
    typeLine,
    oracleText,
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

function creature(canonicalName, printedNames, manaValue, colorIdentity, tags, power, toughness, legendary = false, oracleText = "") {
  return baseCard(canonicalName, printedNames, manaValue, legendary ? "Legendary Creature" : "Creature", ["Creature"], colorIdentity, colorIdentity, ["creature", ...tags], power, toughness, legendary, oracleText);
}

function instant(canonicalName, printedNames, manaValue, colorIdentity, tags, oracleText = "") {
  return baseCard(canonicalName, printedNames, manaValue, "Instant", ["Instant"], colorIdentity, colorIdentity, ["instant", ...tags], null, null, false, oracleText);
}

function sorcery(canonicalName, printedNames, manaValue, colorIdentity, tags, oracleText = "") {
  return baseCard(canonicalName, printedNames, manaValue, "Sorcery", ["Sorcery"], colorIdentity, colorIdentity, ["sorcery", ...tags], null, null, false, oracleText);
}
