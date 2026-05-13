import { findCardInDatabase, normalizeCardName as normalizeFallbackName } from "./card-database.js";

export const COLOR_ORDER = ["W", "U", "B", "R", "G"];
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
    name: found?.name || name,
    printedName: commander.printed_name || commander.printedName || "",
    inputName: name,
    manaValue: coalesce(commander.manaValue, commander.mana_value, found?.manaValue, null),
    typeLine: commander.typeLine || commander.type_line || commander.type || found?.typeLine || null,
    colors: normalizeColors(commander.colors || found?.colors || []),
    colorIdentity,
    tags: normalizeTags(found?.tags || []),
    imageUrl: commander.imageUrl || commander.image_url || found?.imageUrl || null,
    thumbnailUrl: commander.thumbnailUrl || commander.thumbnail_url || found?.thumbnailUrl || null,
    canBeCommander: coalesce(commander.canBeCommander, found?.canBeCommander, null),
    databaseStatus: found ? "found" : "payload"
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

async function loadCatalogBucket(key, env, requestUrl) {
  if (BUCKET_CACHE.has(key)) return BUCKET_CACHE.get(key);
  if (!env?.ASSETS || !requestUrl) {
    return null;
  }

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

function lookupBucket(bucket, normalizedName) {
  const index = bucket?.aliases?.[normalizedName];
  if (index === undefined || index === null) return null;
  const card = bucket.cards?.[index];
  return card ? normalizeCatalogCard(card) : null;
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
      canonicalName: null,
      manaValue: null,
      typeLine: null,
      oracleText: "",
      cardTypes: [],
      colors: [],
      colorIdentity: [],
      tags: ["needs_review"],
      databaseStatus: "unknown"
    };
  }

  return {
    ...card,
    inputName: card.name,
    canonicalName: info.name,
    manaValue: info.manaValue,
    typeLine: info.typeLine,
    oracleText: info.oracleText,
    cardTypes: info.cardTypes,
    colors: info.colors,
    colorIdentity: info.colorIdentity,
    tags: info.tags,
    power: info.power,
    toughness: info.toughness,
    isLegendary: info.isLegendary,
    canBeCommander: info.canBeCommander,
    imageUrl: info.imageUrl,
    thumbnailUrl: info.thumbnailUrl,
    databaseStatus: "found"
  };
}

function normalizeCatalogCard(card) {
  return {
    id: card.id || null,
    oracleId: card.oracleId || null,
    name: card.name,
    manaValue: Number.isFinite(Number(card.manaValue)) ? Number(card.manaValue) : null,
    typeLine: card.typeLine || "",
    oracleText: card.oracleText || "",
    cardTypes: Array.isArray(card.cardTypes) ? card.cardTypes : [],
    colors: normalizeColors(card.colors || []),
    colorIdentity: normalizeColors(card.colorIdentity || []),
    tags: normalizeTags(card.tags || []),
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    isLegendary: Boolean(card.isLegendary),
    canBeCommander: Boolean(card.canBeCommander),
    imageUrl: card.imageUrl || null,
    thumbnailUrl: card.thumbnailUrl || null
  };
}

export function normalizeColors(colors = []) {
  const set = new Set((Array.isArray(colors) ? colors : []).map((color) => String(color).toUpperCase()).filter((color) => COLOR_ORDER.includes(color)));
  return COLOR_ORDER.filter((color) => set.has(color));
}

function normalizeTags(tags = []) {
  return [...new Set((Array.isArray(tags) ? tags : []).map((tag) => String(tag).trim()).filter(Boolean))];
}

function coalesce(...values) {
  return values.find((value) => value !== undefined && value !== null);
}
