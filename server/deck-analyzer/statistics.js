export function buildDeckSummary(parsedDeck) {
  return {
    mainboard_cards: sumQuantity(parsedDeck.mainboard),
    sideboard_cards: sumQuantity(parsedDeck.sideboard),
    commander_cards: sumQuantity(parsedDeck.commander),
    companion_cards: sumQuantity(parsedDeck.companion),
    maybeboard_cards: sumQuantity(parsedDeck.maybeboard),
    total_unique_mainboard: uniqueNames(parsedDeck.mainboard),
    total_unique_sideboard: uniqueNames(parsedDeck.sideboard)
  };
}

function sumQuantity(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}

function uniqueNames(cards = []) {
  return new Set(cards.map((card) => String(card.name || "").trim().toLowerCase()).filter(Boolean)).size;
}
