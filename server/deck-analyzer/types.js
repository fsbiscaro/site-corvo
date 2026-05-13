export const COLOR_ORDER = ["W", "U", "B", "R", "G", "C"];

export const COMMANDER_FORMATS = new Set(["commander", "brawl", "historic_brawl"]);

export const FORMAT_RULES = {
  commander: { deckSize: 99, totalWithCommander: 100, singleton: true, sideboardMax: 0, requiresCommander: true },
  brawl: { deckSize: 59, totalWithCommander: 60, singleton: true, sideboardMax: 0, requiresCommander: true },
  historic_brawl: { deckSize: 99, totalWithCommander: 100, singleton: true, sideboardMax: 0, requiresCommander: true },
  standard: { deckSize: 60, sideboardMax: 15, singleton: false, requiresCommander: false },
  pioneer: { deckSize: 60, sideboardMax: 15, singleton: false, requiresCommander: false },
  historic: { deckSize: 60, sideboardMax: 15, singleton: false, requiresCommander: false },
  casual: { deckSize: 60, sideboardMax: 15, singleton: false, requiresCommander: false }
};

export const COLOR_LABELS = {
  W: "Branco",
  U: "Azul",
  B: "Preto",
  R: "Vermelho",
  G: "Verde",
  C: "Incolor"
};

export const CARD_TYPE_LABELS = {
  Land: "lands",
  Creature: "creatures",
  Artifact: "artifacts",
  Enchantment: "enchantments",
  Instant: "instants",
  Sorcery: "sorceries",
  Planeswalker: "planeswalkers",
  Battle: "battles"
};

export const RECOGNIZED_CARD_TYPES = Object.keys(CARD_TYPE_LABELS);

export const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World", "Ongoing", "Elite", "Host"]);

export const TRIBAL_TAG_BY_SUBTYPE = {
  Elf: "elf",
  Ninja: "ninja",
  Zombie: "zombie",
  Vampire: "vampire",
  Goblin: "goblin",
  Dragon: "dragon",
  Merfolk: "merfolk",
  Wizard: "wizard",
  Druid: "druid",
  Rogue: "rogue",
  Warrior: "warrior",
  Cleric: "cleric",
  Shaman: "shaman",
  Human: "human",
  Sliver: "sliver"
};

export const GENERIC_TRIBES = new Set([
  "Human",
  "Warrior",
  "Wizard",
  "Rogue",
  "Cleric",
  "Shaman",
  "Soldier",
  "Advisor",
  "Scout"
]);

export const FUNCTION_KEYS = {
  cardDraw: ["card_draw"],
  cardSelection: ["card_selection", "topdeck_manipulation"],
  removal: ["removal"],
  singleTargetRemoval: ["single_target_removal"],
  boardWipes: ["board_wipe"],
  interaction: ["interaction", "removal", "counterspell", "discard", "board_wipe"],
  protection: ["protection", "hexproof_grant", "indestructible_grant"],
  recursion: ["recursion"],
  tutors: ["tutor"],
  tokenGenerators: ["token_generator", "tribal_token_generator"],
  lifegain: ["lifegain"],
  drain: ["drain"],
  finishers: ["finisher", "payoff", "tribal_payoff"],
  sacrificeOutlets: ["sacrifice_outlet"],
  graveyardHate: ["graveyard_hate"],
  artifactHate: ["artifact_hate"],
  enchantmentHate: ["enchantment_hate"]
};

export const CREATURE_ROLE_TAGS = {
  manaCreatures: ["creature_ramp", "ramp"],
  utilityCreatures: ["engine", "card_draw", "card_selection", "removal", "recursion", "protection"],
  payoffCreatures: ["payoff", "tribal_payoff", "drain", "anthem", "lord"],
  finishers: ["finisher"],
  evasiveCreatures: ["evasive", "unblockable", "flying", "menace", "trample"]
};

export const WINCON_LABELS = {
  go_wide: "Mesa larga",
  tokens: "Fichas",
  drain: "Drain",
  combo: "Combo",
  voltron: "Voltron",
  control_finisher: "Finalizador de controle",
  combat_damage: "Dano de combate",
  combat_damage_value: "Valor por dano de combate",
  commander_damage: "Dano de comandante",
  aristocrats: "Aristocrats",
  burn: "Burn",
  mill: "Mill",
  big_mana: "Big mana",
  reanimator: "Reanimator",
  storm: "Storm/Ritual"
};
