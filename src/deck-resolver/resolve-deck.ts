import { applyLocalAlias } from "./local-aliases.ts";
import { cleanCardName, getParentheticalCandidates, getSplitCardCandidates, normalizeCardName, uniqueStrings } from "./normalize-card-name.ts";
import { parseDecklist } from "./parse-decklist.ts";
import { resolveCardsWithScryfallCollection, resolveCardWithScryfallFuzzy } from "./scryfall-client.ts";
import type { ParsedDeckCard, ResolvedDeck, ResolvedDeckCard, ResolutionSource, ResolverCache, ScryfallClientOptions } from "./types.ts";

type Candidate = {
  lookupName: string;
  attempt: string;
  collectionSource: ResolutionSource;
};

type ResolveOptions = ScryfallClientOptions & {
  cache?: ResolverCache;
  useFuzzy?: boolean;
};

export function createMemoryResolutionCache(): ResolverCache {
  const cache = new Map<string, ResolvedDeckCard>();
  return {
    get(name: string) {
      return cache.get(normalizeCardName(name)) || null;
    },
    set(name: string, card: ResolvedDeckCard) {
      cache.set(normalizeCardName(name), card);
    }
  };
}

export async function resolveDeck(deckTextOrCards: string | ParsedDeckCard[], options: ResolveOptions = {}): Promise<ResolvedDeck> {
  const parsedCards = Array.isArray(deckTextOrCards) ? deckTextOrCards : parseDecklist(deckTextOrCards);
  const cache = options.cache || createMemoryResolutionCache();
  const useFuzzy = options.useFuzzy !== false;
  const resolvedCards = new Map<number, ResolvedDeckCard>();
  const candidateMap = new Map<number, Candidate[]>();
  const collectionNames: string[] = [];

  for (let index = 0; index < parsedCards.length; index += 1) {
    const parsed = parsedCards[index];
    const candidates = buildLookupCandidates(parsed.inputName);
    candidateMap.set(index, candidates);

    for (const candidate of candidates) {
      const cached = await cache.get(candidate.lookupName);
      if (cached) {
        resolvedCards.set(index, {
          ...cached,
          quantity: parsed.quantity,
          inputName: parsed.inputName,
          normalizedInput: normalizeCardName(parsed.inputName),
          lookupName: candidate.lookupName,
          resolvedBy: "cache"
        });
        break;
      }
      collectionNames.push(candidate.lookupName);
    }
  }

  const collection = await resolveCardsWithScryfallCollection(collectionNames, { fetchFn: options.fetchFn });

  for (let index = 0; index < parsedCards.length; index += 1) {
    if (resolvedCards.has(index)) continue;
    const parsed = parsedCards[index];
    const candidates = candidateMap.get(index) || [];
    for (const candidate of candidates) {
      const card = collection.foundByLookup.get(normalizeCardName(candidate.lookupName));
      if (!card) continue;
      const normalized = normalizeScryfallCard(parsed, candidate.lookupName, candidate.collectionSource, card);
      resolvedCards.set(index, normalized);
      await saveResolvedCard(cache, normalized, candidates);
      break;
    }
  }

  if (useFuzzy) {
    for (let index = 0; index < parsedCards.length; index += 1) {
      if (resolvedCards.has(index)) continue;
      const parsed = parsedCards[index];
      const candidates = candidateMap.get(index) || [];
      const fuzzyName = candidates[0]?.lookupName || parsed.inputName;
      const card = await resolveCardWithScryfallFuzzy(fuzzyName, { fetchFn: options.fetchFn });
      if (!card) continue;
      const normalized = normalizeScryfallCard(parsed, fuzzyName, "scryfall_fuzzy", card);
      resolvedCards.set(index, normalized);
      await saveResolvedCard(cache, normalized, candidates);
    }
  }

  const cards: ResolvedDeckCard[] = [];
  const unresolved = [];

  for (let index = 0; index < parsedCards.length; index += 1) {
    const parsed = parsedCards[index];
    const resolved = resolvedCards.get(index);
    if (resolved) {
      cards.push(resolved);
      continue;
    }

    unresolved.push({
      quantity: parsed.quantity,
      inputName: parsed.inputName,
      normalizedInput: normalizeCardName(parsed.inputName),
      attempts: buildAttemptList(candidateMap.get(index) || []),
      reason: "not_found" as const,
      suggestions: []
    });
  }

  const resolvedCount = cards.reduce((total, card) => total + card.quantity, 0);
  const unresolvedCount = unresolved.reduce((total, card) => total + card.quantity, 0);

  return {
    status: unresolvedCount === 0 ? "complete" : "partial",
    total: parsedCards.reduce((total, card) => total + card.quantity, 0),
    resolvedCount,
    unresolvedCount,
    cards,
    unresolved
  };
}

export function buildLookupCandidates(inputName: string): Candidate[] {
  const clean = cleanCardName(inputName);
  const candidates: Candidate[] = [];
  const alias = applyLocalAlias(clean);

  addCandidate(candidates, alias, "local_alias", "local_alias_then_scryfall_collection");
  for (const candidate of getParentheticalCandidates(clean)) {
    addCandidate(candidates, applyLocalAlias(candidate) || candidate, "parenthetical", "parenthetical_then_scryfall_collection");
  }
  for (const candidate of getSplitCardCandidates(clean)) {
    addCandidate(candidates, applyLocalAlias(candidate) || candidate, "split_face", "split_face_then_scryfall_collection");
  }
  if (!alias) addCandidate(candidates, clean, "scryfall_collection", "scryfall_collection");

  return dedupeCandidates(candidates);
}

function addCandidate(candidates: Candidate[], lookupName: string | null, attempt: string, collectionSource: ResolutionSource) {
  if (!lookupName) return;
  const clean = cleanCardName(lookupName);
  if (!clean) return;
  candidates.push({ lookupName: clean, attempt, collectionSource });
}

function dedupeCandidates(candidates: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  const result: Candidate[] = [];
  for (const candidate of candidates) {
    const key = normalizeCardName(candidate.lookupName);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function buildAttemptList(candidates: Candidate[]): string[] {
  return uniqueStrings(["local_alias", ...candidates.map((candidate) => candidate.attempt), "scryfall_fuzzy"]);
}

function normalizeScryfallCard(parsed: ParsedDeckCard, lookupName: string, resolvedBy: ResolutionSource, card: any): ResolvedDeckCard {
  return {
    quantity: parsed.quantity,
    inputName: parsed.inputName,
    normalizedInput: normalizeCardName(parsed.inputName),
    lookupName,
    resolvedBy,
    canonicalName: card.name || lookupName,
    scryfallId: card.id || "",
    manaValue: typeof card.cmc === "number" ? card.cmc : null,
    typeLine: card.type_line || null,
    oracleText: card.oracle_text || mergeFaceOracleText(card.card_faces) || null,
    colors: Array.isArray(card.colors) ? card.colors : [],
    colorIdentity: Array.isArray(card.color_identity) ? card.color_identity : [],
    imageUris: card.image_uris || card.card_faces?.find((face: any) => face.image_uris)?.image_uris || null,
    legalities: card.legalities || {},
    raw: card
  };
}

function mergeFaceOracleText(faces: any[] | undefined): string {
  if (!Array.isArray(faces)) return "";
  return faces.map((face) => face.oracle_text).filter(Boolean).join("\n//\n");
}

async function saveResolvedCard(cache: ResolverCache, card: ResolvedDeckCard, candidates: Candidate[]) {
  await cache.set(card.inputName, card);
  await cache.set(card.lookupName, card);
  await cache.set(card.canonicalName, card);
  for (const candidate of candidates) await cache.set(candidate.lookupName, card);
}
