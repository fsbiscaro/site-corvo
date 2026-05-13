import { findCardInDatabase, normalizeCardName as normalizeFallbackName } from "./card-database.js";
import { COLOR_ORDER, RECOGNIZED_CARD_TYPES, SUPERTYPES, TRIBAL_TAG_BY_SUBTYPE } from "./types.js";

const CATALOG_ROOT = "/assets/data/card-catalog/buckets";
const BUCKET_CACHE = new Map();

export function normalizeCardName(name) {
  return normalizeFallbackName(name);
}

export function bucketKeyForName(name) {
  const compact = normalizeCardName(name).replace(/[^a-z0-9]+/g, "");
  return (compact.slice(0, 2) || "_").padEnd(2, "_");
}

export async function enrichCardsWithCatalog(cards, env, requestUrl) {
  const uniqueNames = [...new Set((cards || []).map((card) => card.name).filter(Boolean))];
  const foundByName = await findCatalogCards(uniqueNames, env, requestUrl);

  return (cards || []).map((card) => {
    const normalized = normalizeCardName(card.name);
    const info = foundByName.get(normalized) || null;
    return enrichParsedCard(card, info);
  });
}

export async function resolveCommanderCard(commander, env, requestUrl) {
  if (!commander || typeof commander !== "object") return null;
  const name = commander.name || commander.canonicalName || commander.printed_name || commander.printedName || "";
  if (!name) return null;
  const found = (await findCatalogCards([name], env, requestUrl)).get(normalizeCardName(name)) || null;
  const colorIdentity = normalizeColors(commander.colorIdentity || commander.color_identity || found?.colorIdentity || []);

  return {
    id: commander.id || found?.id || null,
    oracleId: commander.oracleId || commander.oracle_id || found?.oracleId || null,
    canonicalName: found?.canonicalName || found?.name || name,
    displayName: found?.displayName || formatCardDisplayName(found) || name,
    printedName: commander.printed_name || commander.printedName || found?.printedNames?.[0] || "",
    inputName: name,
    manaValue: coalesce(commander.manaValue, commander.mana_value, found?.manaValue, null),
    typeLine: commander.typeLine || commander.type_line || commander.type || found?.typeLine || null,
    cardTypes: found?.cardTypes || extractCardTypesFromTypeLine(commander.typeLine || commander.type_line || commander.type || ""),
    subtypes: found?.subtypes || extractSubtypesFromTypeLine(commander.typeLine || commander.type_line || commander.type || ""),
    colors: normalizeColors(commander.colors || found?.colors || []),
    colorIdentity,
    tags: normalizeTags([...(found?.tags || []), "commander"]),
    imageUrl: commander.imageUrl || commander.image_url || found?.imageUrl || null,
    thumbnailUrl: commander.thumbnailUrl || commander.thumbnail_url || found?.thumbnailUrl || null,
    canBeCommander: coalesce(commander.canBeCommander, found?.canBeCommander, null),
    isLegendary: coalesce(commander.isLegendary, found?.isLegendary, false),
    isDoubleFaced: found?.isDoubleFaced || false,
    frontName: found?.frontName || null,
    backName: found?.backName || null,
    databaseStatus: found?.needsReview ? "needs_review" : found ? "found" : "payload"
  };
}

export async function findCatalogCards(names, env, requestUrl) {
  const result = new Map();
  const bucketNames = [...new Set((names || []).map(bucketKeyForName))];
  const buckets = new Map();

  await Promise.all(bucketNames.map(async (key) => {
    buckets.set(key, await loadCatalogBucket(key, env, requestUrl));
  }));

  for (const name of names || []) {
    const normalized = normalizeCardName(name);
    const bucket = buckets.get(bucketKeyForName(name));
    const fromCatalog = lookupBucket(bucket, normalized);
    const fallback = fromCatalog || fallbackCardInfo(name);
    if (fallback) result.set(normalized, fallback);
  }

  return result;
}

export async function loadCatalogBucket(key, env, requestUrl) {
  if (BUCKET_CACHE.has(key)) return BUCKET_CACHE.get(key);
  if (!env?.ASSETS || !requestUrl) return null;

  try {
    const url = new URL(`${CATALOG_ROOT}/${key}.json`, requestUrl);
    const response = await env.ASSETS.fetch(new Request(url.toString()));
    if (!response.ok) {
      BUCKET_CACHE.set(key, null);
      return null;
    }
    const bucket = await response.json();
    BUCKET_CACHE.set(key, bucket);
    return bucket;
  } catch (error) {
    console.error("Card catalog bucket unavailable", key, String(error?.message || error).slice(0, 120));
    BUCKET_CACHE.set(key, null);
    return null;
  }
}

export function extractSubtypesFromTypeLine(typeLine) {
  const primaryFace = String(typeLine || "").split(/\s*\/\/\s*/)[0].trim();
  if (!primaryFace) return [];
  const parts = primaryFace.split(/\s+[—-]\s+/);
  if (parts.length < 2) return [];
  return parts[1].split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

export function extractCardTypesFromTypeLine(typeLine) {
  const primaryFace = String(typeLine || "").split(/\s*\/\/\s*/)[0].trim();
  if (!primaryFace) return [];
  const typePart = primaryFace.split(/\s+[—-]\s+/)[0] || "";
  return typePart
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item && !SUPERTYPES.has(item) && RECOGNIZED_CARD_TYPES.includes(item));
}

export function formatCardDisplayName(card) {
  if (!card) return "";
  if (card.isDoubleFaced && card.frontName && card.backName && card.frontName !== card.backName) {
    return `${card.frontName} // ${card.backName}`;
  }
  return card.frontName || card.canonicalName || card.name || "";
}

export function normalizeColors(colors = []) {
  const set = new Set((Array.isArray(colors) ? colors : []).map((color) => String(color).toUpperCase()).filter((color) => COLOR_ORDER.includes(color)));
  return COLOR_ORDER.filter((color) => set.has(color));
}

function lookupBucket(bucket, normalizedName) {
  const candidates = [];
  const directIndex = bucket?.aliases?.[normalizedName];
  if (Number.isInteger(directIndex) && bucket?.cards?.[directIndex]) candidates.push(bucket.cards[directIndex]);
  for (const card of bucket?.cards || []) {
    if (matchesCardName(card, normalizedName)) candidates.push(card);
  }
  const best = chooseBestCatalogCandidate(candidates, normalizedName);
  return best ? normalizeCatalogCard(best) : null;
}

function chooseBestCatalogCandidate(cards, normalizedName) {
  let best = null;
  let bestScore = -Infinity;
  const seen = new Set();

  for (const card of cards || []) {
    const key = `${card.id || ""}:${card.name || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const score = scoreCatalogCandidate(card, normalizedName);
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }

  return best;
}

function scoreCatalogCandidate(card, normalizedName) {
  const normalizedFaceName = normalizeCardName(formatNormalizedFaceName(card.name));
  const printedNames = (card.printedNames || []).map(normalizeCardName);
  let score = 0;

  if (normalizedFaceName === normalizedName) score += 40;
  if (printedNames.includes(normalizedName)) score += 22;
  if (!isPlaceholderMirrorCard(card)) score += 20;
  if ((card.cardTypes || []).length) score += 8;
  if ((card.colorIdentity || []).length) score += 6;
  if ((card.tags || []).length) score += 4;
  if (card.canBeCommander) score += 6;
  return score;
}

function matchesCardName(card, normalizedName) {
  return [
    normalizeCardName(formatNormalizedFaceName(card?.name || "")),
    ...(card?.printedNames || []).map(normalizeCardName)
  ].includes(normalizedName);
}

function fallbackCardInfo(name) {
  const card = findCardInDatabase(name);
  if (!card) return null;
  return normalizeCatalogCard({
    id: null,
    oracleId: null,
    name: card.canonicalName,
    manaValue: card.manaValue,
    typeLine: card.typeLine,
    oracleText: card.oracleText || "",
    cardTypes: card.cardTypes,
    colors: card.colors,
    colorIdentity: card.colorIdentity,
    tags: card.tags,
    power: card.power,
    toughness: card.toughness,
    isLegendary: card.isLegendary,
    canBeCommander: card.canBeCommander,
    imageUrl: card.imageUrl || null,
    thumbnailUrl: card.thumbnailUrl || null
  });
}

function enrichParsedCard(card, info) {
  if (!info) {
    return {
      ...card,
      inputName: card.name,
      name: card.name,
      canonicalName: null,
      displayName: card.name,
      manaValue: null,
      typeLine: null,
      oracleText: "",
      cardTypes: [],
      subtypes: [],
      colors: [],
      colorIdentity: [],
      tags: ["needs_review"],
      databaseStatus: "unknown"
    };
  }

  return {
    ...card,
    inputName: card.name,
    name: info.canonicalName,
    canonicalName: info.canonicalName,
    displayName: info.displayName,
    manaValue: info.manaValue,
    typeLine: info.typeLine,
    oracleText: info.oracleText,
    cardTypes: info.cardTypes,
    subtypes: info.subtypes,
    colors: info.colors,
    colorIdentity: info.colorIdentity,
    tags: info.tags,
    power: info.power,
    toughness: info.toughness,
    isLegendary: info.isLegendary,
    canBeCommander: info.canBeCommander,
    isDoubleFaced: info.isDoubleFaced,
    frontName: info.frontName,
    backName: info.backName,
    imageUrl: info.imageUrl,
    thumbnailUrl: info.thumbnailUrl,
    needsReview: info.needsReview,
    databaseStatus: info.needsReview ? "needs_review" : "found"
  };
}

function normalizeCatalogCard(card) {
  const faceNames = parseFaceNames(card.name || "");
  const typeLine = card.typeLine || "";
  const cardTypes = Array.isArray(card.cardTypes) && card.cardTypes.length ? card.cardTypes : extractCardTypesFromTypeLine(typeLine);
  const subtypes = extractSubtypesFromTypeLine(typeLine);
  const inferredTags = inferTags({
    ...card,
    cardTypes,
    subtypes,
    frontName: faceNames.frontName,
    backName: faceNames.backName
  });
  const canonicalName = formatCardDisplayName({
    canonicalName: formatNormalizedFaceName(card.name || ""),
    isDoubleFaced: faceNames.isDoubleFaced,
    frontName: faceNames.frontName,
    backName: faceNames.backName
  });

  return {
    id: card.id || null,
    oracleId: card.oracleId || null,
    name: canonicalName,
    canonicalName,
    displayName: canonicalName,
    printedNames: Array.isArray(card.printedNames) ? card.printedNames : [],
    manaValue: Number.isFinite(Number(card.manaValue)) ? Number(card.manaValue) : null,
    typeLine,
    oracleText: card.oracleText || "",
    cardTypes,
    subtypes,
    colors: normalizeColors(card.colors || []),
    colorIdentity: normalizeColors(card.colorIdentity || []),
    tags: normalizeTags([...(card.tags || []), ...inferredTags]),
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    isLegendary: Boolean(card.isLegendary || String(typeLine).includes("Legendary")),
    canBeCommander: Boolean(card.canBeCommander || (String(typeLine).includes("Legendary") && cardTypes.includes("Creature"))),
    isDoubleFaced: faceNames.isDoubleFaced && faceNames.frontName !== faceNames.backName,
    frontName: faceNames.frontName,
    backName: faceNames.backName,
    imageUrl: card.imageUrl || null,
    thumbnailUrl: card.thumbnailUrl || null,
    needsReview: isPlaceholderMirrorCard(card) || !cardTypes.length
  };
}

function inferTags(card) {
  const tags = new Set();
  const typeLine = `${card.typeLine || ""}`.toLowerCase();
  const oracleText = `${card.oracleText || ""}`.toLowerCase();
  const subtypes = Array.isArray(card.subtypes) ? card.subtypes : [];

  for (const type of card.cardTypes || []) tags.add(type.toLowerCase());
  if (typeLine.includes("legendary")) tags.add("legendary");
  if (typeLine.includes("basic land")) tags.add("basic_land");
  if ((card.cardTypes || []).includes("Land")) tags.add("land");
  if ((card.cardTypes || []).includes("Creature")) tags.add("creature");
  if ((card.cardTypes || []).includes("Artifact")) tags.add("artifact");
  if ((card.cardTypes || []).includes("Enchantment")) tags.add("enchantment");
  if ((card.cardTypes || []).includes("Instant")) tags.add("instant");
  if ((card.cardTypes || []).includes("Sorcery")) tags.add("sorcery");
  if ((card.cardTypes || []).includes("Planeswalker")) tags.add("planeswalker");
  if ((card.cardTypes || []).includes("Battle")) tags.add("battle");

  for (const subtype of subtypes) {
    const tag = TRIBAL_TAG_BY_SUBTYPE[subtype];
    if (tag) {
      tags.add(tag);
      tags.add("tribal");
    }
  }

  if (oracleText.includes("draw ") || oracleText.includes("draw a card") || oracleText.includes("draw cards")) tags.add("card_draw");
  if (oracleText.includes("scry") || oracleText.includes("surveil") || oracleText.includes("look at the top") || oracleText.includes("reveal the top")) tags.add("card_selection");
  if (oracleText.includes("destroy target") || oracleText.includes("exile target") || oracleText.includes("fight target")) {
    tags.add("removal");
    tags.add("single_target_removal");
    tags.add("interaction");
  }
  if (oracleText.includes("counter target")) {
    tags.add("counterspell");
    tags.add("interaction");
  }
  if (oracleText.includes("destroy all") || oracleText.includes("each creature gets") || oracleText.includes("all creatures get")) {
    tags.add("board_wipe");
    tags.add("removal");
    tags.add("interaction");
  }
  if (oracleText.includes("search your library")) tags.add("tutor");
  if (oracleText.includes("create") && oracleText.includes("token")) tags.add("token_generator");
  if (oracleText.includes("create") && oracleText.includes("elf token")) {
    tags.add("tribal_token_generator");
    tags.add("tribal_payoff");
  }
  if (oracleText.includes("lose life") || oracleText.includes("drain")) tags.add("drain");
  if (oracleText.includes("gain life") || oracleText.includes("lifelink")) tags.add("lifegain");
  if (oracleText.includes("return target") && oracleText.includes("graveyard")) tags.add("recursion");
  if (oracleText.includes("sacrifice")) tags.add("sacrifice");
  if (oracleText.match(/sacrifice [^\.]+:/)) tags.add("sacrifice_outlet");
  if (oracleText.includes("hexproof") || oracleText.includes("indestructible") || oracleText.includes("protection from") || oracleText.includes("regenerate")) tags.add("protection");
  if (oracleText.includes("ward")) tags.add("protection");
  if (oracleText.includes("flying")) {
    tags.add("flying");
    tags.add("evasive");
  }
  if (oracleText.includes("menace")) {
    tags.add("menace");
    tags.add("evasive");
  }
  if (oracleText.includes("trample")) tags.add("trample");
  if (oracleText.includes("haste")) tags.add("haste");
  if (oracleText.includes("can't be blocked")) {
    tags.add("unblockable");
    tags.add("evasive");
  }
  if (oracleText.includes("combat damage")) tags.add("combat_damage_trigger");
  if (oracleText.includes("ninjutsu")) tags.add("ninjutsu");

  if (oracleText.includes("add {") || oracleText.includes("add one mana")) {
    tags.add("ramp");
    if ((card.cardTypes || []).includes("Creature")) tags.add("creature_ramp");
    else if ((card.cardTypes || []).includes("Artifact")) {
      tags.add("artifact_ramp");
      tags.add("permanent_ramp");
    } else if ((card.cardTypes || []).includes("Enchantment")) tags.add("permanent_ramp");
    else if ((card.cardTypes || []).includes("Instant") || (card.cardTypes || []).includes("Sorcery")) {
      tags.add("burst_mana");
      tags.add("ritual");
    }
  }

  if (oracleText.includes("search your library for a basic land") || oracleText.includes("search your library for up to") && oracleText.includes("land")) {
    tags.add("land_ramp");
    tags.add("ramp");
    if (!(card.cardTypes || []).includes("Instant") && !(card.cardTypes || []).includes("Sorcery")) tags.add("permanent_ramp");
  }

  if (oracleText.includes("cost {") || oracleText.includes("spells you cast cost")) tags.add("cost_reducer");
  if (oracleText.includes("one mana of any color") || oracleText.includes("any color")) tags.add("mana_fixing");
  if (oracleText.includes("artifact") && oracleText.includes("destroy target")) tags.add("artifact_hate");
  if (oracleText.includes("enchantment") && oracleText.includes("destroy target")) tags.add("enchantment_hate");
  if (oracleText.includes("graveyard")) tags.add("graveyard_synergy");
  if (oracleText.includes("cards in your graveyard")) tags.add("graveyard_synergy");
  if (oracleText.includes("other elf") || oracleText.includes("elves you control")) {
    tags.add("tribal");
    tags.add("tribal_payoff");
  }
  if (oracleText.includes("creatures you control get +")) {
    tags.add("anthem");
    tags.add("payoff");
  }
  if (oracleText.includes("other elf creatures you control get +") || oracleText.includes("other zombie") || oracleText.includes("other vampire") || oracleText.includes("other ninja")) {
    tags.add("lord");
    tags.add("tribal_payoff");
  }
  if (oracleText.includes("each opponent loses") || oracleText.includes("all opponents lose")) {
    tags.add("payoff");
    tags.add("finisher");
  }
  if (oracleText.includes("gain life and each opponent loses")) {
    tags.add("drain");
    tags.add("finisher");
  }

  return [...tags];
}

function parseFaceNames(name) {
  const parts = String(name || "").split(/\s*\/\/\s*/).map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { isDoubleFaced: true, frontName: parts[0], backName: parts[1] };
  }
  return { isDoubleFaced: false, frontName: String(name || "").trim(), backName: null };
}

function formatNormalizedFaceName(name) {
  const faces = parseFaceNames(name);
  if (faces.frontName && faces.backName && faces.frontName === faces.backName) return faces.frontName;
  return String(name || "").trim();
}

function isPlaceholderMirrorCard(card) {
  const faces = parseFaceNames(card?.name || "");
  return faces.isDoubleFaced && faces.frontName === faces.backName;
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter(Boolean))];
}

function coalesce(...values) {
  return values.find((value) => value !== undefined && value !== null);
}
