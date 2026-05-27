import { parseDeckText } from "../deck-analyzer/parser.js";

export function parseDecklist(deckText) {
  const parsed = parseDeckText(deckText);
  return {
    ...parsed,
    cards: [...(parsed.mainboard || [])]
  };
}

export function flattenParsedDeck(parsedDeck) {
  return [...(parsedDeck?.mainboard || [])];
}
