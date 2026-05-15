import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const catalogRoot = path.join(repoRoot, "assets", "data", "card-catalog");
const bucketsRoot = path.join(catalogRoot, "buckets");
const nextBucketsRoot = path.join(catalogRoot, "buckets-next");
const sourceBucketsRoot = process.argv[2] ? path.resolve(process.argv[2]) : bucketsRoot;
const bucketPrefixLength = 3;

function bucketKeyForNormalized(normalized) {
  const compact = String(normalized || "").replace(/[^a-z0-9]+/g, "");
  const key = (compact.slice(0, bucketPrefixLength) || "_").padEnd(bucketPrefixLength, "_");
  return `b_${key}`;
}

function cardIdentity(card) {
  return card?.oracleId || card?.id || card?.name || JSON.stringify(card);
}

function normalizeAlias(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[']/g, "")
    .replace(/\u2019/g, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function isLowQualityCard(card) {
  return (!card?.cardTypes || card.cardTypes.length === 0)
    && !card?.oracleText
    && Number(card?.manaValue || 0) === 0
    && /card\s*\/\/\s*card/i.test(card?.typeLine || "");
}

function cardScore(card) {
  let score = 0;
  if (!isLowQualityCard(card)) score += 40;
  if ((card?.cardTypes || []).length) score += 12;
  if (card?.oracleText) score += 10;
  if ((card?.tags || []).length) score += 6;
  if (card?.imageUrl || card?.thumbnailUrl) score += 3;
  return score;
}

function cardAliases(card) {
  const aliases = new Set();
  const add = (value) => {
    const normalized = normalizeAlias(value);
    if (normalized) aliases.add(normalized);
  };

  add(card?.name);
  for (const printedName of card?.printedNames || []) add(printedName);
  for (const face of String(card?.name || "").split(/\s*\/\/\s*/)) add(face);
  return aliases;
}

function addCardToNextBuckets(nextBuckets, normalizedAlias, card) {
  const key = bucketKeyForNormalized(normalizedAlias);
  if (!nextBuckets.has(key)) {
    nextBuckets.set(key, { aliases: {}, cards: [], indexByCard: new Map() });
  }

  const next = nextBuckets.get(key);
  const identity = cardIdentity(card);
  let nextIndex = next.indexByCard.get(identity);
  if (!Number.isInteger(nextIndex)) {
    nextIndex = next.cards.length;
    next.cards.push(card);
    next.indexByCard.set(identity, nextIndex);
  }

  const currentIndex = next.aliases[normalizedAlias];
  if (!Number.isInteger(currentIndex)) {
    next.aliases[normalizedAlias] = nextIndex;
    return;
  }

  const currentCard = next.cards[currentIndex];
  if (cardScore(card) > cardScore(currentCard)) {
    next.aliases[normalizedAlias] = nextIndex;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  if (!existsSync(sourceBucketsRoot)) {
    throw new Error(`Catalog buckets not found: ${sourceBucketsRoot}`);
  }

  const oldMeta = await readJson(path.join(catalogRoot, "meta.json"));
  const oldBucketFiles = (await readdir(sourceBucketsRoot)).filter((file) => file.endsWith(".json"));
  const nextBuckets = new Map();

  for (const file of oldBucketFiles) {
    const bucket = await readJson(path.join(sourceBucketsRoot, file));
    for (const [normalizedAlias, cardIndex] of Object.entries(bucket.aliases || {})) {
      const card = bucket.cards?.[cardIndex];
      if (!card) continue;
      addCardToNextBuckets(nextBuckets, normalizedAlias, card);
    }

    for (const card of bucket.cards || []) {
      for (const alias of cardAliases(card)) {
        addCardToNextBuckets(nextBuckets, alias, card);
      }
    }
  }

  await rm(nextBucketsRoot, { recursive: true, force: true });
  await mkdir(nextBucketsRoot, { recursive: true });

  let aliasCount = 0;
  let largest = { key: "", bytes: 0 };
  for (const [key, data] of [...nextBuckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    aliasCount += Object.keys(data.aliases).length;
    const payload = JSON.stringify({ aliases: data.aliases, cards: data.cards });
    const bytes = Buffer.byteLength(payload);
    if (bytes > largest.bytes) largest = { key, bytes };
    await writeFile(path.join(nextBucketsRoot, `${key}.json`), payload);
  }

  await rm(bucketsRoot, { recursive: true, force: true });
  await mkdir(path.dirname(bucketsRoot), { recursive: true });
  await rename(nextBucketsRoot, bucketsRoot);

  const meta = {
    ...oldMeta,
    generatedAt: new Date().toISOString(),
    aliasCount,
    bucketCount: nextBuckets.size,
    bucketStrategy: `prefixed-first-${bucketPrefixLength}-normalized-characters`,
    splitFromBucketStrategy: oldMeta.bucketStrategy || null,
    largestBucket: largest
  };
  await writeFile(path.join(catalogRoot, "meta.json"), JSON.stringify(meta));
  console.log(JSON.stringify(meta, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
