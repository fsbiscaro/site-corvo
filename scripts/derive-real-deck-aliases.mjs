import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { normalizeCardName } from "../src/deck-resolver/normalize-card-name.ts";

const fixturePath = resolve("tests/fixtures/real-decks.json");
const defaultBulkPath = resolve(process.env.USERPROFILE || process.env.HOME || ".", "Downloads/all-cards-20260513092323.json");
const bulkPath = process.argv[2] ? resolve(process.argv[2]) : defaultBulkPath;

const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));
const targets = new Map();

for (const deck of fixtures) {
  addTarget(deck.commanderDisplayName || deck.commander);
  addTarget(deck.commander);
  for (const line of deck.decklist) {
    const name = line.replace(/^\s*\d+\s+/, "").trim();
    addTarget(name);
    for (const face of name.split("//").map((part) => part.trim()).filter(Boolean)) {
      addTarget(face);
    }
    const match = name.match(/\(([^)]+)\)/);
    if (match) addTarget(match[1]);
  }
}

const found = new Map();
let parsedCards = 0;

await scanBulkJsonObjects(bulkPath, (card) => {
  parsedCards += 1;
  const canonical = card.name;
  for (const alias of collectAliases(card)) {
    const normalized = normalizeCardName(alias);
    if (targets.has(normalized) && !found.has(normalized)) {
      found.set(normalized, {
        input: targets.get(normalized),
        canonical,
        matchedAlias: alias
      });
    }
  }
});

const missing = [];
const entries = [];

for (const [normalized, input] of targets.entries()) {
  const match = found.get(normalized);
  if (!match) {
    missing.push(input);
    continue;
  }
  if (normalizeCardName(input) !== normalizeCardName(match.canonical)) {
    entries.push([normalized, match.canonical, input, match.matchedAlias]);
  }
}

entries.sort((a, b) => a[0].localeCompare(b[0]));
missing.sort((a, b) => a.localeCompare(b));

console.log(JSON.stringify({
  bulkPath,
  parsedCards,
  targets: targets.size,
  found: found.size,
  aliasEntries: entries.length,
  missing,
  entries: entries.map(([key, canonical, input, matchedAlias]) => ({
    key,
    canonical,
    input,
    matchedAlias
  }))
}, null, 2));

function addTarget(name) {
  const cleaned = String(name || "").trim();
  if (!cleaned) return;
  targets.set(normalizeCardName(cleaned), cleaned);
}

function collectAliases(card) {
  const aliases = [card.name, card.printed_name];
  for (const face of card.card_faces || []) {
    aliases.push(face.name, face.printed_name);
  }
  return aliases.filter(Boolean);
}

async function scanBulkJsonObjects(path, onObject) {
  const stream = createReadStream(path, { encoding: "utf8", highWaterMark: 1024 * 1024 });
  let buffer = "";
  let depth = 0;
  let inString = false;
  let escape = false;
  let collecting = false;

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!collecting) {
        if (char === "{") {
          collecting = true;
          depth = 1;
          buffer = "{";
        }
        continue;
      }

      buffer += char;

      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === "\"") {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;

      if (depth === 0) {
        onObject(JSON.parse(buffer));
        collecting = false;
        buffer = "";
      }
    }
  }
}
