import { extractCardTypesFromTypeLine, extractSubtypesFromTypeLine, normalizeCatalogCard } from "../deck-analyzer/catalog.js";
import { parseDecklist } from "./parse-decklist.js";
import { resolveLocalAlias } from "./local-aliases.js";
import { normalizeLookupKey, uniqueNormalized } from "./normalize-card-name.js";
import { getCachedResolution, setCachedResolution } from "./resolution-cache.js";
import { resolveCardsWithScryfallCollection, resolveCardWithScryfallFuzzy } from "./scryfall-collection-client.js";

const DEFAULT_FUZZY_LIMIT = 8;

export async function resolveDeckRequest({ deckText, format = "casual", commander = null }, context = {}) {
  const parsed = parseDecklist(deckText);
  const resolvedDeck = await resolveDeck(parsed.cards, {
    ...context,
    format,
    commander,
    parsedDeck: parsed
  });
  return {
    ...resolvedDeck,
    format,
    commander,
    parsedDeck: parsed
  };
}

export async function resolveDeck(parsedCards = [], options = {}) {
  const env = options.env || {};
  const fetchFn = options.fetchFn || fetch;
  const cards = parsedCards.map((card) => ({ ...card, inputName: card.inputName || card.name }));
  const total = sumQuantity(cards);
  const uniqueInputs = uniqueNormalized(cards.map((card) => card.name));
  const plans = new Map(uniqueInputs.map((name) => [name, buildResolutionPlan(name)]));
  const meta = {
    cacheHits: 0,
    localAliasHits: 0,
    scryfallCollectionCalls: 0,
    scryfallFuzzyCalls: 0,
    collectionIdentifiers: 0,
    externalLookupUsed: false
  };

  const resolvedByInput = new Map();
  const pendingInputs = [];

  for (const inputName of uniqueInputs) {
    const plan = plans.get(inputName);
    const cached = await findCachedCandidate(plan, env);
    if (cached) {
      meta.cacheHits += 1;
      resolvedByInput.set(normalizeLookupKey(inputName), { ...cached, resolvedBy: cached.resolvedBy || "cache" });
      continue;
    }
    pendingInputs.push(inputName);
  }

  const collectionNames = [];
  for (const inputName of pendingInputs) {
    const plan = plans.get(inputName);
    for (const candidate of plan.candidates) collectionNames.push(candidate.value);
  }
  const uniqueCollectionNames = uniqueNormalized(collectionNames);

  if (uniqueCollectionNames.length) {
    meta.externalLookupUsed = true;
    meta.collectionIdentifiers = uniqueCollectionNames.length;
    const collection = await resolveCardsWithScryfallCollection(uniqueCollectionNames, {
      fetchFn,
      timeoutMs: options.collectionTimeoutMs
    });
    meta.scryfallCollectionCalls += collection.requestCount;
    const cardIndex = buildScryfallIndex(collection.found || []);

    for (const inputName of pendingInputs) {
      const inputKey = normalizeLookupKey(inputName);
      if (resolvedByInput.has(inputKey)) continue;
      const plan = plans.get(inputName);
      const match = findIndexedMatch(plan, cardIndex);
      if (!match) continue;
      const resolved = scryfallCardToResolvedCard(match.card, inputName, match.method);
      resolvedByInput.set(inputKey, resolved);
      await cacheResolvedPlan(plan, resolved, env);
      if (match.method === "local_alias") meta.localAliasHits += 1;
    }
  }

  const fuzzyInputs = pendingInputs.filter((inputName) => !resolvedByInput.has(normalizeLookupKey(inputName)));
  const fuzzyLimit = Number.isFinite(Number(options.fuzzyLimit)) ? Number(options.fuzzyLimit) : DEFAULT_FUZZY_LIMIT;
  for (const inputName of fuzzyInputs.slice(0, fuzzyLimit)) {
    const plan = plans.get(inputName);
    const fuzzyName = plan.preferredFuzzyName;
    if (!fuzzyName) continue;
    try {
      meta.externalLookupUsed = true;
      meta.scryfallFuzzyCalls += 1;
      const card = await resolveCardWithScryfallFuzzy(fuzzyName, { fetchFn, timeoutMs: options.fuzzyTimeoutMs });
      if (!card) continue;
      const resolved = scryfallCardToResolvedCard(card, inputName, "scryfall_fuzzy");
      resolvedByInput.set(normalizeLookupKey(inputName), resolved);
      await cacheResolvedPlan(plan, resolved, env);
    } catch {
      // Fuzzy is best effort and must not block the deck.
    }
  }

  const outputCards = [];
  const unresolved = [];

  for (const card of cards) {
    const key = normalizeLookupKey(card.name);
    const resolved = resolvedByInput.get(key);
    if (resolved) {
      outputCards.push({ ...resolved, quantity: Number(card.quantity || 0), raw_line: card.raw_line || card.rawLine || "" });
    } else {
      const detail = buildUnresolvedCard(card, plans.get(card.name));
      unresolved.push(detail);
      outputCards.push(unresolvedToAnalyzerCard(card, detail));
    }
  }

  const resolvedCount = outputCards
    .filter((card) => card.databaseStatus === "found")
    .reduce((sum, card) => sum + Number(card.quantity || 0), 0);
  const unresolvedCount = total - resolvedCount;

  return {
    status: unresolvedCount ? "partial" : "complete",
    total,
    resolvedCount,
    unresolvedCount,
    recognitionRate: total ? Number((resolvedCount / total).toFixed(4)) : 0,
    cards: outputCards,
    unresolved,
    meta
  };
}

export function buildResolutionPlan(inputName) {
  const raw = String(inputName || "").trim();
  const candidates = [];
  addCandidate(candidates, raw, "input");
  addCandidate(candidates, raw.replace(/[’‘`´]/g, "'"), "apostrophe_normalized");
  addCandidate(candidates, raw.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), "accentless");
  const alias = resolveLocalAlias(raw);
  if (alias) addCandidate(candidates, alias, "local_alias");
  for (const inner of parentheticalCandidates(raw)) {
    addCandidate(candidates, inner, "parenthetical");
    const innerAlias = resolveLocalAlias(inner);
    if (innerAlias) addCandidate(candidates, innerAlias, "parenthetical_alias");
  }
  addCandidate(candidates, stripParentheticalTail(raw), "parenthetical_tail_stripped");
  for (const face of splitFaceCandidates(raw)) {
    addCandidate(candidates, face, "split_face");
    const faceAlias = resolveLocalAlias(face);
    if (faceAlias) addCandidate(candidates, faceAlias, "split_face_alias");
  }
  const deduped = dedupeCandidates(candidates);
  return {
    inputName: raw,
    normalizedInput: normalizeLookupKey(raw),
    candidates: deduped,
    preferredFuzzyName: (deduped.find((item) => item.method.includes("alias")) || deduped[0])?.value || raw
  };
}

function scryfallCardToResolvedCard(card, inputName, resolvedBy) {
  const catalogCard = normalizeCatalogCard({
    id: card.id || null,
    oracleId: card.oracle_id || null,
    name: card.name,
    manaValue: card.cmc,
    typeLine: card.type_line || "",
    oracleText: getOracleText(card),
    cardTypes: extractCardTypesFromTypeLine(card.type_line || ""),
    colors: card.colors || firstFaceArray(card, "colors"),
    colorIdentity: card.color_identity || [],
    legalities: card.legalities || {},
    power: card.power ?? firstFaceValue(card, "power"),
    toughness: card.toughness ?? firstFaceValue(card, "toughness"),
    isLegendary: String(card.type_line || "").includes("Legendary"),
    canBeCommander: String(card.type_line || "").includes("Legendary") && String(card.type_line || "").includes("Creature"),
    imageUrl: imageUrl(card, "normal"),
    thumbnailUrl: imageUrl(card, "small")
  });

  return {
    quantity: 0,
    inputName,
    normalizedInput: normalizeLookupKey(inputName),
    name: catalogCard.canonicalName,
    canonicalName: catalogCard.canonicalName,
    displayName: catalogCard.displayName,
    printedName: card.printed_name || "",
    resolvedBy,
    scryfallId: card.id || null,
    oracleId: card.oracle_id || null,
    manaValue: catalogCard.manaValue,
    typeLine: catalogCard.typeLine,
    oracleText: catalogCard.oracleText,
    cardTypes: catalogCard.cardTypes,
    subtypes: catalogCard.subtypes,
    colors: catalogCard.colors,
    colorIdentity: catalogCard.colorIdentity,
    legalities: catalogCard.legalities,
    tags: catalogCard.tags,
    power: catalogCard.power,
    toughness: catalogCard.toughness,
    isLegendary: catalogCard.isLegendary,
    canBeCommander: catalogCard.canBeCommander,
    isDoubleFaced: catalogCard.isDoubleFaced,
    frontName: catalogCard.frontName,
    backName: catalogCard.backName,
    imageUris: card.image_uris || card.card_faces?.[0]?.image_uris || {},
    imageUrl: catalogCard.imageUrl,
    thumbnailUrl: catalogCard.thumbnailUrl,
    databaseStatus: "found",
    raw: compactRawScryfallCard(card),
    resolutionDebug: {
      reason: "Carta resolvida antes da análise pelo Deck Resolver.",
      attempts: buildResolutionPlan(inputName).candidates,
      source: resolvedBy
    }
  };
}

function unresolvedToAnalyzerCard(card, detail) {
  return {
    ...card,
    inputName: card.name,
    normalizedInput: normalizeLookupKey(card.name),
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
    legalities: {},
    tags: ["needs_review"],
    databaseStatus: "unknown",
    resolutionDebug: {
      reason: detail.reason,
      attempts: detail.attempts,
      suggestions: detail.suggestions || []
    }
  };
}

function buildUnresolvedCard(card, plan) {
  return {
    inputName: card.name,
    normalizedInput: normalizeLookupKey(card.name),
    quantity: Number(card.quantity || 0),
    reason: "not_found_in_scryfall",
    attempts: (plan?.candidates || []).map((candidate) => ({
      value: candidate.value,
      normalized: candidate.normalized,
      method: candidate.method
    })),
    suggestions: []
  };
}

async function findCachedCandidate(plan, env) {
  for (const candidate of plan.candidates) {
    const cached = await getCachedResolution(candidate.value, env);
    if (cached) return cached;
  }
  return null;
}

async function cacheResolvedPlan(plan, resolved, env) {
  for (const candidate of plan.candidates) {
    await setCachedResolution(candidate.value, resolved, env, resolved.resolvedBy || "resolver");
  }
}

function buildScryfallIndex(cards = []) {
  const map = new Map();
  for (const card of cards) {
    for (const name of cardNamesForIndex(card)) {
      const key = normalizeLookupKey(name);
      if (key && !map.has(key)) map.set(key, card);
    }
  }
  return map;
}

function findIndexedMatch(plan, cardIndex) {
  for (const candidate of plan.candidates) {
    const card = cardIndex.get(candidate.normalized);
    if (card) return { card, method: candidate.method === "local_alias" ? "local_alias" : "scryfall_collection" };
  }
  return null;
}

function cardNamesForIndex(card) {
  const names = [card.name, card.printed_name];
  for (const face of card.card_faces || []) {
    names.push(face.name, face.printed_name);
  }
  return names.filter(Boolean);
}

function getOracleText(card) {
  if (card.oracle_text) return card.oracle_text;
  return (card.card_faces || [])
    .map((face) => [face.name, face.oracle_text].filter(Boolean).join(": "))
    .filter(Boolean)
    .join("\n\n");
}

function imageUrl(card, size) {
  return card.image_uris?.[size] || card.card_faces?.[0]?.image_uris?.[size] || null;
}

function firstFaceArray(card, key) {
  return Array.isArray(card.card_faces?.[0]?.[key]) ? card.card_faces[0][key] : [];
}

function firstFaceValue(card, key) {
  return card.card_faces?.[0]?.[key] ?? null;
}

function compactRawScryfallCard(card) {
  return {
    id: card.id,
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    released_at: card.released_at,
    scryfall_uri: card.scryfall_uri
  };
}

function addCandidate(target, value, method) {
  const clean = String(value || "").trim();
  const normalized = normalizeLookupKey(clean);
  if (!clean || !normalized) return;
  target.push({ value: clean, normalized, method });
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.normalized)) return false;
    seen.add(candidate.normalized);
    return true;
  });
}

function parentheticalCandidates(value) {
  return [...String(value || "").matchAll(/\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((inner) => inner && !/^[A-Z0-9]{2,6}$/i.test(inner));
}

function splitFaceCandidates(value) {
  return String(value || "")
    .split(/\s*\/\/\s*/)
    .map((item) => item.trim())
    .filter((item) => item && item !== value);
}

function stripParentheticalTail(value) {
  return String(value || "").replace(/\s+\([^)]+\)\s*$/, "").trim();
}

function sumQuantity(cards) {
  return (cards || []).reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}
