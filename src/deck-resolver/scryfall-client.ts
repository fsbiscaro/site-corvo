import type { ScryfallClientOptions } from "./types.ts";
import { normalizeCardName } from "./normalize-card-name.ts";

const COLLECTION_ENDPOINT = "https://api.scryfall.com/cards/collection";
const NAMED_ENDPOINT = "https://api.scryfall.com/cards/named";
const COLLECTION_BATCH_SIZE = 75;

export async function resolveCardsWithScryfallCollection(cardNames: string[], options: ScryfallClientOptions = {}) {
  const fetchFn = options.fetchFn || fetch;
  const uniqueNames = [...new Map(cardNames.filter(Boolean).map((name) => [normalizeCardName(name), name])).values()];
  const foundByLookup = new Map<string, any>();
  const notFound: string[] = [];

  for (let index = 0; index < uniqueNames.length; index += COLLECTION_BATCH_SIZE) {
    const batch = uniqueNames.slice(index, index + COLLECTION_BATCH_SIZE);
    const response = await fetchFn(COLLECTION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        identifiers: batch.map((name) => ({ name }))
      })
    });

    if (!response.ok) {
      for (const name of batch) notFound.push(name);
      continue;
    }

    const payload = await response.json();
    const cardIndex = indexScryfallCards(payload.data || []);

    for (const name of batch) {
      const card = cardIndex.get(normalizeCardName(name));
      if (card) foundByLookup.set(normalizeCardName(name), card);
      else notFound.push(name);
    }
  }

  return { foundByLookup, notFound };
}

export async function resolveCardWithScryfallFuzzy(cardName: string, options: ScryfallClientOptions = {}) {
  const fetchFn = options.fetchFn || fetch;
  const url = `${NAMED_ENDPOINT}?fuzzy=${encodeURIComponent(cardName)}`;
  const response = await fetchFn(url, { headers: { "Accept": "application/json" } });
  if (!response.ok) return null;
  const payload = await response.json();
  return payload?.object === "error" ? null : payload;
}

function indexScryfallCards(cards: any[]) {
  const map = new Map<string, any>();
  for (const card of cards) {
    addCardIndex(map, card.name, card);
    if (card.printed_name) addCardIndex(map, card.printed_name, card);
    for (const face of card.card_faces || []) {
      addCardIndex(map, face.name, card);
      if (face.printed_name) addCardIndex(map, face.printed_name, card);
    }
  }
  return map;
}

function addCardIndex(map: Map<string, any>, name: string, card: any) {
  const key = normalizeCardName(name);
  if (key && !map.has(key)) map.set(key, card);
}
