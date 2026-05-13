const SECTION_ALIASES = new Map([
  ["deck", "mainboard"],
  ["mainboard", "mainboard"],
  ["main", "mainboard"],
  ["sideboard", "sideboard"],
  ["side", "sideboard"],
  ["commander", "commander"],
  ["companion", "companion"],
  ["maybeboard", "maybeboard"]
]);

const EMPTY_DECK = {
  mainboard: [],
  sideboard: [],
  commander: [],
  companion: [],
  maybeboard: [],
  warnings: [],
  errors: []
};

export function parseDeckText(deckText) {
  const parsed = freshDeck();
  let currentSection = "mainboard";

  String(deckText || "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || line.startsWith("//") || line.startsWith("#")) return;

      const section = SECTION_ALIASES.get(line.toLowerCase());
      if (section) {
        currentSection = section;
        return;
      }

      const card = parseCardLine(line, index + 1, parsed.warnings, parsed.errors);
      if (!card) return;
      parsed[currentSection].push(card);
    });

  return parsed;
}

export function flattenDeckForAnalysis(parsedDeck) {
  return [
    ...(parsedDeck.commander || []),
    ...(parsedDeck.companion || []),
    ...(parsedDeck.mainboard || [])
  ].map((card) => ({
    quantity: card.quantity,
    name: card.name
  }));
}

function freshDeck() {
  return {
    mainboard: [],
    sideboard: [],
    commander: [],
    companion: [],
    maybeboard: [],
    warnings: [],
    errors: []
  };
}

function parseCardLine(line, lineNumber, warnings, errors) {
  let quantity = 1;
  let rest = line;
  const quantityMatch = line.match(/^(\d+)\s*x?\s+(.+)$/i);

  if (quantityMatch) {
    quantity = Number(quantityMatch[1]);
    rest = quantityMatch[2].trim();
  } else if (/^\d+\s*x?$/i.test(line)) {
    errors.push({ line, line_number: lineNumber, message: "Linha ignorada porque nao tem nome de carta." });
    return null;
  } else {
    warnings.push({
      line,
      line_number: lineNumber,
      message: "Quantidade nao informada; assumido quantity = 1."
    });
  }

  if (!rest) {
    errors.push({ line, line_number: lineNumber, message: "Linha ignorada porque nao tem nome de carta." });
    return null;
  }

  const metadata = extractSetMetadata(rest);
  return {
    quantity,
    name: metadata.name,
    set_code: metadata.set_code,
    collector_number: metadata.collector_number,
    raw_line: line
  };
}

function extractSetMetadata(value) {
  const match = value.match(/^(.+?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+(\S+))?$/);
  if (!match) return { name: value.trim(), set_code: null, collector_number: null };

  return {
    name: match[1].trim(),
    set_code: match[2].toUpperCase(),
    collector_number: match[3] || null
  };
}

export function emptyParsedDeck() {
  return { ...EMPTY_DECK };
}
