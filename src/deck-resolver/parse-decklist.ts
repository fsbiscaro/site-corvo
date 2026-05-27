import type { ParsedDeckCard } from "./types.ts";
import { cleanCardName } from "./normalize-card-name.ts";

const SECTION_HEADERS = new Set([
  "deck",
  "main",
  "mainboard",
  "side",
  "sideboard",
  "commander",
  "companion",
  "maybeboard"
]);

export function parseDecklist(deckText: string): ParsedDeckCard[] {
  const cards: ParsedDeckCard[] = [];
  const lines = String(deckText || "").split(/\r?\n/);

  for (const line of lines) {
    const rawLine = line.trim();
    if (!rawLine || rawLine.startsWith("#") || rawLine.startsWith("//")) continue;
    if (SECTION_HEADERS.has(rawLine.toLowerCase())) continue;

    const withoutSideboardPrefix = rawLine.replace(/^SB:\s*/i, "").trim();
    const match = withoutSideboardPrefix.match(/^(?:(\d+)x?|\*(\d+))\s+(.+)$/i);

    if (match) {
      const quantity = Number(match[1] || match[2]);
      const inputName = cleanCardName(match[3] || "");
      if (quantity > 0 && inputName) cards.push({ quantity, inputName, rawLine });
      continue;
    }

    const inputName = cleanCardName(withoutSideboardPrefix);
    if (inputName) cards.push({ quantity: 1, inputName, rawLine });
  }

  return cards;
}
