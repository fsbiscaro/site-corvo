import { normalizeCardName } from "./catalog.js";

const PROFILES = [
  {
    canonicalName: "Lathril, Blade of the Elves",
    primaryArchetype: "Golgari Elfos",
    secondaryArchetypes: ["Tokens", "Mesa larga", "Drain", "Ramp tribal"],
    colorIdentity: ["B", "G"],
    tribe: "Elf",
    commanderDependent: true,
    wantsProtection: true,
    expectedGamePlan: "Desenvolver elfos cedo, acelerar mana com criaturas, criar mesa larga, gerar fichas com Lathril e finalizar com drain, buffs tribais ou efeitos de massa.",
    desiredTags: [
      "elf",
      "tribal",
      "token_generator",
      "tribal_token_generator",
      "go_wide",
      "anthem",
      "lord",
      "drain",
      "ramp",
      "permanent_ramp",
      "creature_ramp",
      "card_draw",
      "protection",
      "removal",
      "tribal_payoff",
      "finisher"
    ],
    keySubtypes: ["Elf"],
    importantCounts: {
      elf: { min: 18, good: 25 },
      creature: { min: 25, good: 32 },
      token_generator: { min: 3, good: 6 },
      tribal_token_generator: { min: 2, good: 5 },
      permanent_ramp: { min: 8, good: 12 },
      card_draw: { min: 6, good: 9 },
      protection: { min: 2, good: 4 },
      removal: { min: 5, good: 8 },
      drain: { min: 1, good: 3 },
      tribal_payoff: { min: 3, good: 6 },
      finisher: { min: 2, good: 4 }
    },
    weaknessesToCheck: [
      "Poucos elfos para sustentar o plano tribal.",
      "Poucos geradores de fichas para ativar Lathril com consistência.",
      "Poucos finalizadores para converter mesa larga em vitória.",
      "Pouca proteção para um comandante que precisa permanecer em campo.",
      "Dependência excessiva de combate sem plano alternativo."
    ],
    winconHints: ["drain", "go_wide", "anthem", "tribal_payoff", "combat_damage"]
  },
  {
    canonicalName: "K'rrik, Son of Yawgmoth",
    primaryArchetype: "Mono Black K'rrik",
    secondaryArchetypes: ["Vida como recurso", "Big Mana", "Combo", "Storm/Ritual"],
    colorIdentity: ["B"],
    commanderDependent: true,
    wantsProtection: true,
    expectedGamePlan: "Usar vida como recurso para acelerar mágicas pretas, gerar vantagem explosiva e finalizar com combo, drain ou big mana.",
    desiredTags: [
      "life_as_resource",
      "lifegain",
      "ritual",
      "burst_mana",
      "permanent_ramp",
      "cost_reducer",
      "tutor",
      "combo_piece",
      "recursion",
      "drain",
      "payoff",
      "protection",
      "card_draw"
    ],
    importantCounts: {
      permanent_ramp: { min: 6, good: 8 },
      tutor: { min: 2, good: 4 },
      card_draw: { min: 6, good: 10 },
      lifegain: { min: 3, good: 6 },
      protection: { min: 3, good: 5 },
      payoff: { min: 3, good: 5 },
      drain: { min: 2, good: 4 }
    },
    weaknessesToCheck: [
      "Pouco ganho de vida para sustentar pagamentos com vida.",
      "Pouca proteção para um comandante que atrai remoção.",
      "Falta de condição de vitória clara.",
      "Dependência excessiva do comandante.",
      "Muitas cartas caras sem aceleração suficiente."
    ],
    winconHints: ["combo", "drain", "big_mana", "storm", "life_as_resource"]
  },
  {
    canonicalName: "Yuriko, the Tiger's Shadow",
    primaryArchetype: "Dimir Ninjas",
    secondaryArchetypes: ["Evasão", "Tempo", "Valor por dano de combate"],
    colorIdentity: ["U", "B"],
    tribe: "Ninja",
    commanderDependent: true,
    wantsProtection: true,
    expectedGamePlan: "Usar criaturas evasivas baratas para conectar dano, habilitar ninjutsu e gerar vantagem com Yuriko.",
    desiredTags: [
      "ninja",
      "ninjutsu",
      "evasive",
      "unblockable",
      "flying",
      "combat_damage_trigger",
      "card_selection",
      "topdeck_manipulation",
      "tempo",
      "counterspell",
      "removal",
      "protection"
    ],
    keySubtypes: ["Ninja"],
    importantCounts: {
      ninja: { min: 8, good: 14 },
      evasive: { min: 8, good: 12 },
      card_selection: { min: 4, good: 8 },
      interaction: { min: 6, good: 10 },
      protection: { min: 2, good: 4 }
    },
    weaknessesToCheck: [
      "Poucas criaturas evasivas para habilitar ninjutsu.",
      "Poucos ninjas para sustentar o plano tribal.",
      "Pouca manipulação de topo para maximizar Yuriko.",
      "Pouca proteção para a comandante."
    ],
    winconHints: ["combat_damage_value", "tempo", "combat_damage"]
  },
  {
    canonicalName: "Edgar Markov",
    primaryArchetype: "Mardu Vampiros",
    secondaryArchetypes: ["Tokens", "Aggro", "Mesa larga"],
    colorIdentity: ["W", "B", "R"],
    tribe: "Vampire",
    commanderDependent: true,
    wantsProtection: false,
    expectedGamePlan: "Encadear vampiros baratos, ampliar a mesa com eminência e converter pressão em dano letal por combate e anthems.",
    desiredTags: ["vampire", "tribal", "go_wide", "token_generator", "anthem", "lord", "removal", "card_draw"],
    keySubtypes: ["Vampire"],
    importantCounts: { vampire: { min: 20, good: 28 }, creature: { min: 28, good: 34 }, token_generator: { min: 4, good: 7 } },
    weaknessesToCheck: ["Baixa densidade de vampiros.", "Poucos payoffs tribais.", "Pouca compra para manter a pressão."],
    winconHints: ["go_wide", "tokens", "combat_damage"]
  },
  {
    canonicalName: "Wilhelt, the Rotcleaver",
    primaryArchetype: "Dimir Zumbis",
    secondaryArchetypes: ["Aristocrats", "Tokens", "Valor de sacrifício"],
    colorIdentity: ["U", "B"],
    tribe: "Zombie",
    commanderDependent: true,
    wantsProtection: true,
    expectedGamePlan: "Gerar valor com zumbis, sacrificar criaturas com lucro e transformar fichas em vantagem incremental.",
    desiredTags: ["zombie", "tribal", "token_generator", "sacrifice", "sacrifice_outlet", "card_draw", "recursion", "drain"],
    keySubtypes: ["Zombie"],
    importantCounts: { zombie: { min: 16, good: 24 }, sacrifice_outlet: { min: 2, good: 4 }, token_generator: { min: 3, good: 6 } },
    weaknessesToCheck: ["Poucos zumbis.", "Poucos sac outlets.", "Falta de payoff para mortes."],
    winconHints: ["aristocrats", "tokens", "drain"]
  },
  {
    canonicalName: "Meren of Clan Nel Toth",
    primaryArchetype: "Golgari Sacrifício/Recursão",
    secondaryArchetypes: ["Graveyard", "Value", "Aristocrats"],
    colorIdentity: ["B", "G"],
    commanderDependent: true,
    wantsProtection: true,
    expectedGamePlan: "Acumular valor com criaturas utilitárias, sacrifícios repetidos e recursão do cemitério.",
    desiredTags: ["graveyard_synergy", "recursion", "sacrifice", "sacrifice_outlet", "card_draw", "removal", "payoff"],
    importantCounts: { recursion: { min: 5, good: 8 }, sacrifice_outlet: { min: 2, good: 4 }, card_draw: { min: 6, good: 9 } },
    weaknessesToCheck: ["Pouca recursão.", "Poucos outlets de sacrifício.", "Pouca interação para sobreviver até o mid game."],
    winconHints: ["aristocrats", "reanimator", "drain"]
  }
];

export const COMMANDER_PROFILES = Object.fromEntries(PROFILES.map((profile) => [normalizeCardName(profile.canonicalName), profile]));

export function findCommanderProfile(commander) {
  if (!commander?.canonicalName && !commander?.name && !commander?.displayName) return null;
  return COMMANDER_PROFILES[normalizeCardName(commander.canonicalName || commander.name || commander.displayName)] || null;
}
