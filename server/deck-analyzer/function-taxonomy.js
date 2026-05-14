const REAL_SAC_OUTLETS = new Set([
  "altar of dementia",
  "ashnods altar",
  "carrion feeder",
  "goblin bombardment",
  "high market",
  "phyrexian altar",
  "phyrexian tower",
  "viscera seer",
  "witchs oven",
  "woe strider",
  "yawgmoth thran physician"
]);

const NOT_SAC_OUTLETS = new Set([
  "agent of the iron throne",
  "bastion of remembrance",
  "blood artist",
  "brasss bounty",
  "costly plunder",
  "deadly dispute",
  "mirkwood bats",
  "pirates pillage",
  "pitiless plunderer",
  "village rites",
  "victimize",
  "wayfarers bauble",
  "zulaport cutthroat"
]);

const DEATH_DRAIN_PAYOFFS = new Set([
  "agent of the iron throne",
  "bastion of remembrance",
  "blood artist",
  "judith the scourge diva",
  "mayhem devil",
  "mirkwood bats",
  "nadier's nightblade",
  "zulaport cutthroat"
]);

const ARISTOCRATS_ENGINES = new Set([
  "jadar ghoulcaller of nephalia",
  "mahadi emporium master",
  "oni cult anvil",
  "pitiless plunderer",
  "skullclamp"
]);

const DRAW_BY_SACRIFICE = new Set([
  "costly plunder",
  "deadly dispute",
  "village rites"
]);

const RECURSION_SPELLS = new Set([
  "dread return",
  "reanimate",
  "unearth",
  "victimize"
]);

const TREASURE_VALUE = new Set([
  "big score",
  "brasss bounty",
  "pirates pillage",
  "unexpected windfall"
]);

const RAMP_FIXING = new Set([
  "arcane signet",
  "rakdos signet",
  "sol ring",
  "talisman of indulgence",
  "wayfarers bauble"
]);

export function getCardNameKey(card) {
  return normalizeName(card?.displayName || card?.canonicalName || card?.name || card?.inputName || "");
}

export function textOfCard(card) {
  return `${card?.oracleText || ""} ${card?.typeLine || ""} ${card?.displayName || card?.canonicalName || card?.inputName || ""}`;
}

export function isRealSacrificeOutlet(card) {
  const key = getCardNameKey(card);
  if (REAL_SAC_OUTLETS.has(key)) return true;
  if (NOT_SAC_OUTLETS.has(key)) return false;

  const text = textOfCard(card);
  if (!/sacrifice/i.test(text)) return false;
  if (isSacrificeCostOnly(card)) return false;
  if (/sacrifice (a clue|a food|a blood)|sacrifice this artifact: draw a card/i.test(text)) return false;

  return /(?:^|[.:]\s*|\n)\s*(?:\{[^}]+\},?\s*)*(?:tap|{t})?,?\s*sacrifice (?:a|another|an|any number of|one or more|this|x)?\s*[^.]*?(?:creature|artifact|permanent|token)[^.:]*:/i.test(text)
    || /sacrifice (?:a|another|an|any number of|one or more|this|x)?\s*[^.]*?(?:creature|artifact|permanent|token):/i.test(text);
}

export function isFreeSacrificeOutlet(card) {
  if (!isRealSacrificeOutlet(card)) return false;
  const text = textOfCard(card);
  if (/\{t\}|tap|pay \d|mana cost|activate only/i.test(text)) return false;
  return true;
}

export function isSacrificeCostOnly(card) {
  const key = getCardNameKey(card);
  if (DRAW_BY_SACRIFICE.has(key) || RECURSION_SPELLS.has(key)) return true;
  const text = textOfCard(card);
  return /as an additional cost to cast this spell,? sacrifice|as an additional cost .* sacrifice|sacrifice .* if you do|to cast this spell,? sacrifice/i.test(text);
}

export function isDeathOrDrainPayoff(card) {
  const key = getCardNameKey(card);
  if (DEATH_DRAIN_PAYOFFS.has(key)) return true;
  if (ARISTOCRATS_ENGINES.has(key)) return false;
  if (REAL_SAC_OUTLETS.has(key) || RAMP_FIXING.has(key) || DRAW_BY_SACRIFICE.has(key) || RECURSION_SPELLS.has(key)) return false;
  const text = textOfCard(card);
  return /whenever (?:another |one or more )?(?:creature|artifact|permanent|token)s? (?:you control )?(?:dies|die|is put into a graveyard)|whenever you sacrifice .* each opponent|each opponent loses .* life|target opponent loses .* life/i.test(text);
}

export function isAristocratsEngine(card) {
  const key = getCardNameKey(card);
  if (ARISTOCRATS_ENGINES.has(key)) return true;
  if (isRealSacrificeOutlet(card) || isDeathOrDrainPayoff(card)) return false;
  const text = textOfCard(card);
  return /whenever .* dies.*create .*treasure|whenever .* is put into a graveyard.*create .*treasure|at the beginning .* create .* token|whenever you sacrifice .* create/i.test(text);
}

export function isDrawBySacrifice(card) {
  const key = getCardNameKey(card);
  if (DRAW_BY_SACRIFICE.has(key)) return true;
  return /as an additional cost .* sacrifice.*draw|sacrifice .* draw .* cards?/i.test(textOfCard(card));
}

export function isRecursionSupport(card) {
  const key = getCardNameKey(card);
  if (RECURSION_SPELLS.has(key)) return true;
  return /return .* from your graveyard|reanimate|from a graveyard .* battlefield/i.test(textOfCard(card));
}

export function isTreasureValue(card) {
  const key = getCardNameKey(card);
  if (TREASURE_VALUE.has(key)) return true;
  return /create .*treasure|treasure token/i.test(textOfCard(card));
}

export function isRampOrFixing(card) {
  const key = getCardNameKey(card);
  if (RAMP_FIXING.has(key)) return true;
  const tags = new Set(card?.tags || []);
  return ["permanent_ramp", "land_ramp", "creature_ramp", "artifact_ramp", "mana_fixing", "ramp"].some((tag) => tags.has(tag));
}

export function isFlingEffect(card) {
  return /sacrifice .* deals damage equal to|deals damage equal to .* power|fling/i.test(textOfCard(card));
}

export function classifyAristocratsFunction(card) {
  if (card?.databaseStatus === "unknown") return "unknown";
  if (isRealSacrificeOutlet(card)) return isFreeSacrificeOutlet(card) ? "free_sacrifice_outlet" : "sacrifice_outlet";
  if (isAristocratsEngine(card)) return "engine";
  if (isDeathOrDrainPayoff(card)) return "sacrifice_payoff";
  if (isDrawBySacrifice(card)) return "draw_by_sacrifice";
  if (isRecursionSupport(card)) return "recursion";
  if (isTreasureValue(card)) return "treasure_value";
  if (isRampOrFixing(card)) return "ramp_fixing";
  if (isFlingEffect(card)) return "fling_effect";
  if (isSacrificeCostOnly(card)) return "sacrifice_cost";
  return null;
}

export function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/\u2019/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}
