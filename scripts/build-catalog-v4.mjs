import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceDir = path.join(root, "assets/data/card-catalog/buckets");
const outputDir = path.join(root, "assets/data/card-catalog/buckets-v4");

function normalizeName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9/,\-: ]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeLooseName(name) {
  return normalizeName(name).replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function bucketKeyForAlias(alias) {
  const compact = normalizeName(alias).replace(/[^a-z0-9]+/g, "");
  return `b_${(compact.slice(0, 4) || "_").padEnd(4, "_")}`;
}

function compactCard(card) {
  return {
    id: card.id || null,
    oracleId: card.oracleId || null,
    lang: card.lang || "en",
    name: card.name || "",
    manaValue: card.manaValue ?? null,
    typeLine: card.typeLine || null,
    oracleText: card.oracleText || "",
    cardTypes: card.cardTypes || [],
    colors: card.colors || [],
    colorIdentity: card.colorIdentity || [],
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    isLegendary: Boolean(card.isLegendary),
    canBeCommander: Boolean(card.canBeCommander),
    tags: card.tags || [],
    printedNames: card.printedNames || []
  };
}

function bucketFor(targets, key) {
  let bucket = targets.get(key);
  if (!bucket) {
    bucket = { aliases: {}, cards: [], byCard: new Map() };
    targets.set(key, bucket);
  }
  return bucket;
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const targets = new Map();
let sourceFiles = 0;
let aliasCount = 0;

for (const file of fs.readdirSync(sourceDir)) {
  if (!file.endsWith(".json")) continue;
  sourceFiles += 1;
  const data = JSON.parse(fs.readFileSync(path.join(sourceDir, file), "utf8"));
  const cards = data.cards || [];

  for (const [alias, index] of Object.entries(data.aliases || {})) {
    const card = cards[index];
    if (!card) continue;
    const normalizedAliases = [...new Set([normalizeName(alias), normalizeLooseName(alias)].filter(Boolean))];
    if (!normalizedAliases.length) continue;

    const bucket = bucketFor(targets, bucketKeyForAlias(normalizedAliases[0]));
    const cardKey = card.id || card.oracleId || card.name;
    let targetIndex = bucket.byCard.get(cardKey);
    if (targetIndex === undefined) {
      targetIndex = bucket.cards.length;
      bucket.byCard.set(cardKey, targetIndex);
      bucket.cards.push(compactCard(card));
    }

    for (const normalizedAlias of normalizedAliases) {
      bucket.aliases[normalizedAlias] = targetIndex;
      aliasCount += 1;
    }
  }
}

let totalSize = 0;
let maxSize = 0;
let maxName = "";

for (const [key, bucket] of targets) {
  delete bucket.byCard;
  const json = JSON.stringify(bucket);
  const fileName = `${key}.json`;
  fs.writeFileSync(path.join(outputDir, fileName), json);
  const size = Buffer.byteLength(json);
  totalSize += size;
  if (size > maxSize) {
    maxSize = size;
    maxName = fileName;
  }
}

console.log(JSON.stringify({
  sourceFiles,
  buckets: targets.size,
  aliasCount,
  totalSize,
  maxSize,
  maxName
}, null, 2));
