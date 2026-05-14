export const ARCHETYPE_MODELS = [
  model("aggro", "Aggro", {
    aliases: ["Creature Aggro", "Combat Aggro"],
    strategyTags: ["aggro", "haste", "burn", "threat", "combat_damage"],
    requiredSignals: ["early_pressure_count", "threat_count"],
    strongSignals: ["curva baixa", "criaturas agressivas", "reach por burn"],
    supportSignals: ["pump", "card_draw", "evasion", "finisher"],
    typicalPackages: ["pressao inicial", "reach", "compra/gas", "remocao barata"],
    expectedWincons: ["combat_damage", "burn"]
  }),
  model("burn", "Burn", {
    aliases: ["Mono Red Burn", "Izzet Burn"],
    strategyTags: ["burn", "direct_damage", "spell_damage"],
    requiredSignals: ["burn_count"],
    strongSignals: ["dano direto recorrente", "curva baixa", "reach"],
    supportSignals: ["spellslinger", "card_draw", "tempo"],
    typicalPackages: ["dano direto", "compra/gas", "criaturas agressivas"],
    expectedWincons: ["burn", "combat_damage"]
  }),
  model("midrange", "Midrange", {
    aliases: ["Value Midrange"],
    strategyTags: ["midrange", "value", "removal", "threat", "card_advantage"],
    requiredSignals: ["threat_count", "interaction_count", "card_draw_count"],
    strongSignals: ["ameacas resilientes", "remocao eficiente", "dois por um"],
    supportSignals: ["recursion", "planeswalker", "lifegain", "discard"],
    typicalPackages: ["ameacas", "remocao", "card advantage", "recursao"],
    expectedWincons: ["combat_damage", "value_over_time", "large_threats"]
  }),
  model("control", "Controle", {
    aliases: ["Azorius Control", "Draw-Go", "Tapout Control"],
    strategyTags: ["control", "removal", "counterspell", "board_wipe", "card_draw", "finisher"],
    requiredSignals: ["interaction_count", "card_draw_count", "finisher_count"],
    strongSignals: ["counters", "wipes", "respostas instantaneas", "compra repetida"],
    supportSignals: ["lifegain", "recursion", "planeswalker", "graveyard_hate"],
    typicalPackages: ["interacao", "wipes", "card advantage", "finalizadores"],
    expectedWincons: ["control_finisher", "planeswalker", "combo", "commander_value"]
  }),
  model("tempo", "Tempo", {
    aliases: ["Evasion Tempo"],
    strategyTags: ["tempo", "evasive", "counterspell", "cheap_threat"],
    requiredSignals: ["evasive_count", "interaction_count"],
    strongSignals: ["ameacas baratas evasivas", "interacao de baixo custo", "dano incremental"],
    supportSignals: ["card_selection", "counterspell", "bounce"],
    typicalPackages: ["ameacas evasivas", "counters", "selecao", "remocao barata"],
    expectedWincons: ["combat_damage_value", "combat_damage"]
  }),
  model("combo", "Combo", {
    aliases: ["Combo Engine", "Fast Combo"],
    strategyTags: ["combo", "tutor", "protection", "ritual", "combo_piece"],
    requiredSignals: ["combo_line_count"],
    strongSignals: ["linha de combo concreta", "pecas conhecidas", "tutores", "protecao"],
    supportSignals: ["card_selection", "recursion", "redundant_piece", "backup_wincon"],
    typicalPackages: ["pecas de combo", "tutores", "protecao", "selecao"],
    expectedWincons: ["combo"]
  }),
  model("tribal", "Tribal", {
    aliases: ["Typal", "Kindred"],
    strategyTags: ["tribal", "lord", "anthem", "typal_payoff"],
    requiredSignals: ["tribe_density", "tribal_payoff_count"],
    strongSignals: ["lords", "payoffs tribais", "comandante recompensa tribo"],
    supportSignals: ["anthem", "go_wide", "protection", "recursion"],
    typicalPackages: ["criaturas da tribo", "lords", "payoffs", "protecao"],
    expectedWincons: ["combat_damage", "go_wide", "drain"]
  }),
  model("tokens_go_wide", "Tokens / Mesa larga", {
    aliases: ["Go-wide", "Tokens"],
    strategyTags: ["token_generator", "go_wide", "anthem", "overrun"],
    requiredSignals: ["token_generator_count"],
    strongSignals: ["varios geradores de ficha", "anthems", "payoffs de mesa larga"],
    supportSignals: ["protection", "card_draw", "lifegain", "sacrifice"],
    typicalPackages: ["fichas", "buffs", "protecao", "finalizadores"],
    expectedWincons: ["tokens", "go_wide", "combat_damage"]
  }),
  model("aristocrats_sacrifice", "Sacrificio / Aristocrats", {
    aliases: ["Rakdos Sacrifice", "Orzhov Aristocrats", "Golgari Sacrifice"],
    strategyTags: ["sacrifice", "aristocrats", "death_trigger", "drain", "fodder"],
    requiredSignals: ["sacrifice_outlet_count", "fodder_count", "death_payoff_count"],
    strongSignals: ["outlets de sacrificio", "payoffs de morte", "drain", "fodder"],
    supportSignals: ["token_generator", "recursion", "treasure", "graveyard_synergy"],
    typicalPackages: ["sac outlets", "fodder", "death payoffs", "recursao", "compra"],
    expectedWincons: ["drain", "death_triggers", "combo_loop"]
  }),
  model("voltron", "Voltron", {
    aliases: ["Commander Damage", "Auras/Equipment"],
    strategyTags: ["voltron", "equipment", "aura", "protection", "evasive"],
    requiredSignals: ["commander_damage_support_count"],
    strongSignals: ["equipamentos/auras", "protecao", "evasao", "pump"],
    supportSignals: ["card_draw", "recursion", "removal"],
    typicalPackages: ["auras/equipamentos", "protecao", "evasao", "ramp"],
    expectedWincons: ["commander_damage", "combat_damage"]
  }),
  model("spellslinger", "Spellslinger", {
    aliases: ["Instants/Sorceries", "Izzet Spells"],
    strategyTags: ["spellslinger", "instant", "sorcery", "spell_trigger", "storm"],
    requiredSignals: ["spell_density", "spell_trigger_count"],
    strongSignals: ["alta densidade de instants/sorceries", "payoffs de spell", "cantrips"],
    supportSignals: ["counterspell", "burn", "card_selection", "ritual"],
    typicalPackages: ["spells", "payoffs", "cantrips", "interacao"],
    expectedWincons: ["storm", "burn", "spell_damage"]
  }),
  model("reanimator", "Reanimator", {
    aliases: ["Reanimate", "Big Graveyard"],
    strategyTags: ["reanimator", "reanimation", "graveyard_synergy", "discard", "self_mill"],
    requiredSignals: ["reanimation_count", "graveyard_synergy_count"],
    strongSignals: ["magicas de reanimacao", "alvos grandes", "discard/self-mill"],
    supportSignals: ["tutor", "protection", "recursion"],
    typicalPackages: ["enablers de cemiterio", "reanimacao", "alvos grandes"],
    expectedWincons: ["reanimator", "large_threats"]
  }),
  model("graveyard_value", "Cemiterio / Valor", {
    aliases: ["Graveyard Value"],
    strategyTags: ["graveyard_synergy", "recursion", "escape", "flashback"],
    requiredSignals: ["graveyard_synergy_count", "recursion_count"],
    strongSignals: ["recursao repetida", "cartas que usam cemiterio como recurso"],
    supportSignals: ["sacrifice", "self_mill", "discard"],
    typicalPackages: ["recursao", "self-mill", "valor incremental"],
    expectedWincons: ["value_over_time", "combat_damage"]
  }),
  model("blink", "Blink / Flicker", {
    aliases: ["ETB Value", "Flicker"],
    strategyTags: ["blink", "flicker", "etb", "value"],
    requiredSignals: ["blink_enabler_count", "etb_payoff_count"],
    strongSignals: ["efeitos de blink", "criaturas com ETB", "payoffs de ETB"],
    supportSignals: ["protection", "card_draw", "removal"],
    typicalPackages: ["blink", "ETBs", "protecoes", "card advantage"],
    expectedWincons: ["value_over_time", "combat_damage"]
  }),
  model("artifacts", "Artefatos", {
    aliases: ["Artifact Value", "Artifact Combo"],
    strategyTags: ["artifact", "artifact_synergy", "artifact_ramp", "sacrifice"],
    requiredSignals: ["artifact_synergy_count"],
    strongSignals: ["alta densidade de artefatos", "payoffs de artefato", "recursao/sac"],
    supportSignals: ["ramp", "tutor", "protection"],
    typicalPackages: ["artefatos", "payoffs", "recursao", "ramp"],
    expectedWincons: ["combo", "value_over_time", "big_mana"]
  }),
  model("enchantress", "Enchantress", {
    aliases: ["Enchantments"],
    strategyTags: ["enchantment", "enchantress", "aura"],
    requiredSignals: ["enchantress_count"],
    strongSignals: ["motores que compram com encantamentos", "alta densidade de encantamentos"],
    supportSignals: ["protection", "lifegain", "voltron"],
    typicalPackages: ["encantamentos", "draw engines", "protecao", "wincons"],
    expectedWincons: ["value_over_time", "combat_damage"]
  }),
  model("lands", "Terrenos / Lands", {
    aliases: ["Landfall", "Lands Matter"],
    strategyTags: ["landfall", "land_ramp", "lands", "graveyard_synergy"],
    requiredSignals: ["landfall_count"],
    strongSignals: ["payoffs de landfall", "jogar terrenos extras", "recursao de terrenos"],
    supportSignals: ["ramp", "graveyard", "tokens"],
    typicalPackages: ["landfall", "extra lands", "recursao de terrenos", "payoffs"],
    expectedWincons: ["landfall", "tokens", "big_mana"]
  }),
  model("lifegain_drain", "Lifegain / Drain", {
    aliases: ["Soul Sisters", "Drain"],
    strategyTags: ["lifegain", "drain", "payoff"],
    requiredSignals: ["lifegain_count", "drain_payoff_count"],
    strongSignals: ["gatilhos de ganho de vida", "payoffs de drain", "vida como recurso"],
    supportSignals: ["tokens", "aristocrats", "protection"],
    typicalPackages: ["ganho de vida", "payoffs", "drain", "compra"],
    expectedWincons: ["drain", "combat_damage"]
  }),
  model("counters_proliferate", "Marcadores / Proliferate", {
    aliases: ["Counters", "+1/+1 Counters"],
    strategyTags: ["counter", "proliferate", "plus_one_counter"],
    requiredSignals: ["counter_synergy_count"],
    strongSignals: ["proliferate", "marcadores +1/+1", "payoffs de marcador"],
    supportSignals: ["tokens", "protection", "card_draw"],
    typicalPackages: ["enablers de marcador", "payoffs", "proliferate"],
    expectedWincons: ["combat_damage", "value_over_time"]
  }),
  model("stax", "Stax / Taxas", {
    aliases: ["Prison", "Taxes"],
    strategyTags: ["stax", "tax", "hatebear"],
    requiredSignals: ["stax_piece_count"],
    strongSignals: ["pecas que limitam recursos", "taxas", "lock pieces"],
    supportSignals: ["protection", "card_draw", "finishers"],
    typicalPackages: ["stax", "protecoes", "card advantage", "wincons"],
    expectedWincons: ["combat_damage", "lock"]
  }),
  model("mill", "Mill", {
    aliases: ["Self Mill", "Opponent Mill"],
    strategyTags: ["mill", "self_mill", "graveyard_synergy"],
    requiredSignals: ["mill_count"],
    strongSignals: ["muitos efeitos de mill", "payoffs de cemiterio", "wincon de biblioteca"],
    supportSignals: ["control", "graveyard", "recursion"],
    typicalPackages: ["mill", "controle", "recursao", "protecoes"],
    expectedWincons: ["mill"]
  }),
  model("big_mana_ramp", "Big Mana / Ramp", {
    aliases: ["Ramp", "Big Mana"],
    strategyTags: ["big_mana", "ramp", "permanent_ramp", "land_ramp"],
    requiredSignals: ["permanent_ramp_count"],
    strongSignals: ["muito ramp permanente", "payoffs caros", "curva alta justificada"],
    supportSignals: ["card_draw", "protection", "finishers"],
    typicalPackages: ["ramp", "payoffs caros", "compra", "interacao"],
    expectedWincons: ["big_mana", "large_threats"]
  }),
  model("goodstuff_value", "Goodstuff / Value", {
    aliases: ["Value Pile", "Good Cards"],
    strategyTags: ["goodstuff", "value", "flexible_removal", "card_advantage"],
    requiredSignals: ["value_engine_count"],
    strongSignals: ["cartas individualmente fortes", "baixa densidade sinergica", "interacao variada"],
    supportSignals: ["removal", "card_draw", "threat"],
    typicalPackages: ["cartas de valor", "interacao", "card advantage", "ameacas"],
    expectedWincons: ["value_over_time"]
  }),
  model("equipment_auras", "Equipamentos / Auras", {
    aliases: ["Auras", "Equipment"],
    strategyTags: ["equipment", "aura", "voltron", "protection"],
    requiredSignals: ["equipment_aura_count"],
    strongSignals: ["muitos equipamentos/auras", "protecao", "evasao"],
    supportSignals: ["card_draw", "recursion", "commander_damage"],
    typicalPackages: ["equip/auras", "protecao", "evasao", "compra"],
    expectedWincons: ["commander_damage", "combat_damage"]
  }),
  model("group_slug", "Group Slug", {
    aliases: ["Punisher", "Pain"],
    strategyTags: ["group_slug", "punisher", "damage_each_opponent"],
    requiredSignals: ["group_slug_count"],
    strongSignals: ["dano recorrente a todos", "taxas de vida", "punish draw/cast"],
    supportSignals: ["lifegain", "control", "protection"],
    typicalPackages: ["punishers", "drain", "protecoes", "interacao"],
    expectedWincons: ["drain", "burn"]
  }),
  model("theft_sac", "Roubo e Sacrificio", {
    aliases: ["Steal and Sac"],
    strategyTags: ["temporary_control", "sacrifice", "aristocrats"],
    requiredSignals: ["theft_count", "sacrifice_outlet_count"],
    strongSignals: ["roubar criaturas", "sacrificar antes de devolver", "payoffs de morte"],
    supportSignals: ["recursion", "tokens", "drain"],
    typicalPackages: ["roubo temporario", "sac outlets", "payoffs", "remocao"],
    expectedWincons: ["aristocrats", "combat_damage"]
  }),
  model("death_triggers", "Gatilhos de Morte", {
    aliases: ["Death Triggers"],
    strategyTags: ["death_trigger", "dies", "aristocrats"],
    requiredSignals: ["death_payoff_count"],
    strongSignals: ["payoffs quando criaturas morrem", "fodder", "recursao"],
    supportSignals: ["sacrifice", "tokens", "lifegain"],
    typicalPackages: ["death payoffs", "fodder", "recursao", "outlets"],
    expectedWincons: ["drain", "value_over_time"]
  }),
  model("treasure_sacrifice_value", "Tesouros / Sacrifice Value", {
    aliases: ["Treasure Value", "Treasure Sacrifice"],
    strategyTags: ["treasure", "sacrifice", "artifact", "value"],
    requiredSignals: ["treasure_count"],
    strongSignals: ["tesouros recorrentes", "payoffs por sacrificar artefatos", "mana explosiva controlada"],
    supportSignals: ["aristocrats", "artifact_synergy", "card_draw"],
    typicalPackages: ["tesouros", "sacrifice", "payoffs", "ramp"],
    expectedWincons: ["big_mana", "drain", "value_over_time"]
  })
];

export const ARCHETYPE_MODEL_BY_ID = Object.fromEntries(ARCHETYPE_MODELS.map((item) => [item.id, item]));

export function getArchetypeModel(id) {
  return ARCHETYPE_MODEL_BY_ID[id] || null;
}

function model(id, label, config) {
  return {
    id,
    label,
    aliases: config.aliases || [],
    strategyTags: config.strategyTags || [],
    requiredSignals: config.requiredSignals || [],
    strongSignals: config.strongSignals || [],
    supportSignals: config.supportSignals || [],
    typicalPackages: config.typicalPackages || [],
    expectedWincons: config.expectedWincons || [],
    keyQuestions: config.keyQuestions || [],
    commonWeaknesses: config.commonWeaknesses || [],
    evaluationRules: config.evaluationRules || {}
  };
}
