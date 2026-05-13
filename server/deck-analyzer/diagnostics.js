const COMMANDER_FORMATS = new Set(["commander", "brawl", "historic_brawl"]);

export function runBasicDiagnostics(parsedDeck, format = "casual") {
  const normalizedFormat = String(format || "casual").trim().toLowerCase();
  const warnings = [];
  const mainboardCards = count(parsedDeck.mainboard);
  const sideboardCards = count(parsedDeck.sideboard);
  const commanderCards = count(parsedDeck.commander);
  const isCommanderLike = COMMANDER_FORMATS.has(normalizedFormat);

  if (isCommanderLike && commanderCards === 0) {
    warnings.push({
      message: "Formato Commander/Brawl informado, mas nenhuma carta foi encontrada na secao Commander."
    });
  }

  if (!isCommanderLike && mainboardCards < 60) {
    warnings.push({ message: "O mainboard tem menos de 60 cartas." });
  }

  if (!isCommanderLike && mainboardCards > 60) {
    warnings.push({
      message: "O mainboard tem mais de 60 cartas. Isso e permitido, mas geralmente reduz consistencia."
    });
  }

  if (!isCommanderLike && sideboardCards > 15) {
    warnings.push({ message: "O sideboard tem mais de 15 cartas." });
  }

  if (normalizedFormat === "commander" && mainboardCards + commanderCards !== 100) {
    warnings.push({
      message: "Deck Commander normalmente deve ter 100 cartas incluindo o comandante."
    });
  }

  return warnings;
}

function count(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}
