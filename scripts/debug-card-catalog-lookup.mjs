import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  bucketKeyForName,
  buildNameLookupPlan,
  findCatalogCards,
  normalizeCardName
} from "../server/deck-analyzer/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const defaultBulk = "C:/Users/fsbis/Downloads/all-cards-20260513092323.zip";
const catalogRoot = path.join(repoRoot, "assets", "data", "card-catalog", "buckets-v2");

const REQUIRED_NAMES = [
  "Cidadela de Nicol Bolas",
  "Bolas's Citadel",
  "Alimentar o Enxame",
  "Feed the Swarm",
  "Asmodeus, o Arquidemonio",
  "Asmodeus the Archfiend",
  "Malignidade Imortal",
  "Undying Malice",
  "Armadura de Sombras",
  "Armor of Shadows",
  "Maquinacoes de Gonti",
  "Gonti's Machinations",
  "Rito de Razaketh",
  "Razaketh's Rite",
  "Macular",
  "Defile",
  "Presenca Medonha",
  "Dread Presence",
  "Necrofago Falcao da Noite",
  "Nighthawk Scavenger",
  "Cruelclaw's Heist",
  "Starscape Cleric",
  "Give In to Violence",
  "Withering Torment",
  "Ancient Cellarspawn",
  "Persistent Constrictor"
];

const args = parseArgs(process.argv.slice(2));
const names = args.names.length ? args.names : REQUIRED_NAMES;
const bulkPath = args.bulk || defaultBulk;

if (!fs.existsSync(catalogRoot)) {
  throw new Error(`Catalog buckets-v2 not found: ${catalogRoot}`);
}

const rawMatches = fs.existsSync(bulkPath) ? loadRawBulkMatches(bulkPath, names) : {};
const fakeEnv = makeFileAssetEnv(repoRoot);
const requestUrl = "https://local.corvo.test/";

const report = [];

for (const inputName of names) {
  const normalizedInput = normalizeCardName(inputName);
  const plan = buildNameLookupPlan(inputName);
  const bucketIds = [...new Set(plan.candidates.map((candidate) => bucketKeyForName(candidate.value)))];
  const expectedBucketId = bucketKeyForName(inputName);
  const rawMatch = rawMatches[normalizedInput] || null;
  const bucketSearch = searchBuckets(plan, normalizedInput, rawMatch);
  const resolverMatch = (await findCatalogCards([inputName], fakeEnv, requestUrl)).get(normalizedInput) || null;
  const bestFuzzyCandidate = findBestFuzzyCandidate(plan, bucketIds);
  const indexes = buildIndexDiagnostics(inputName, bucketSearch.card, bucketSearch.indexAlias, normalizedInput);
  const approved = bucketSearch.card ? isApprovedOfficialCatalogCard(bucketSearch.card) : null;

  report.push({
    inputName,
    normalizedInput,
    expectedCanonical: rawMatch?.canonicalName || bucketSearch.card?.name || resolverMatch?.canonicalName || null,
    rawBulkFound: Boolean(rawMatch),
    rawBulkSource: rawMatch?.source || null,
    catalogFound: Boolean(bucketSearch.card),
    bucketFound: Boolean(bucketSearch.bucketId),
    expectedBucketId,
    bucketId: bucketSearch.bucketId,
    bucketLoaded: bucketIds.map((bucketId) => ({
      bucketId,
      loaded: fs.existsSync(path.join(catalogRoot, `${bucketId}.json`))
    })),
    indexes,
    approved,
    blockedByApprovedFilter: bucketSearch.card ? approved === false : false,
    resolverResult: resolverMatch ? "found" : "not_found",
    resolverMatchedName: resolverMatch?.canonicalName || null,
    resolverMethod: resolverMatch?.lookup?.method || null,
    resolutionAttempts: plan.candidates,
    bestFuzzyCandidate,
    failureReason: buildFailureReason({
      rawMatch,
      bucketSearch,
      resolverMatch,
      indexes,
      approved
    })
  });
}

const summary = {
  checked: report.length,
  rawFound: report.filter((item) => item.rawBulkFound).length,
  catalogFound: report.filter((item) => item.catalogFound).length,
  resolverFound: report.filter((item) => item.resolverResult === "found").length,
  failures: report.filter((item) => item.resolverResult !== "found").map((item) => item.inputName)
};

const output = { bulkPath, catalogRoot, summary, cards: report };
console.log(JSON.stringify(output, null, 2));

function parseArgs(argv) {
  const parsed = { bulk: "", names: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bulk") {
      parsed.bulk = argv[index + 1] || "";
      index += 1;
    } else if (arg === "--names") {
      parsed.names = String(argv[index + 1] || "")
        .split("|")
        .map((name) => name.trim())
        .filter(Boolean);
      index += 1;
    }
  }
  return parsed;
}

function makeFileAssetEnv(root) {
  return {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const filePath = path.join(root, relativePath);
        if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
        return new Response(fs.readFileSync(filePath, "utf8"), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }
  };
}

function loadRawBulkMatches(sourceZip, inputNames) {
  const tempFile = path.join(os.tmpdir(), `corvo-catalog-debug-${process.pid}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(inputNames), "utf8");
  try {
    const script = String.raw`
import json, re, sys, unicodedata, zipfile

source_zip = sys.argv[1]
names_path = sys.argv[2]
targets = json.load(open(names_path, encoding="utf-8"))

def normalize(value):
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower().replace("'", "").replace("\u2019", "")
    text = re.sub(r"[^a-z0-9/,\-: ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()

target_map = {normalize(name): name for name in targets}
found = {}

def aliases(card):
    values = [card.get("name"), card.get("printed_name")]
    for face in card.get("card_faces") or []:
        values.extend([face.get("name"), face.get("printed_name")])
    return [str(value).strip() for value in values if str(value or "").strip()]

with zipfile.ZipFile(source_zip) as archive:
    member = next(item for item in archive.infolist() if item.filename.lower().endswith(".json"))
    with archive.open(member) as raw:
        for card in json.load(raw):
            if not isinstance(card, dict):
                continue
            for alias in aliases(card):
                normalized = normalize(alias)
                if normalized in target_map and normalized not in found:
                    found[normalized] = {
                        "inputName": target_map[normalized],
                        "canonicalName": card.get("name") or alias,
                        "printedName": card.get("printed_name") or None,
                        "lang": card.get("lang") or None,
                        "oracleId": card.get("oracle_id") or card.get("id"),
                        "source": "name" if alias == card.get("name") else "printed_or_face_name"
                    }
            if len(found) == len(target_map):
                break

print(json.dumps(found, ensure_ascii=True))
`;
    const stdout = execFileSync("python", ["-c", script, sourceZip, tempFile], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16
    });
    return JSON.parse(stdout || "{}");
  } finally {
    fs.rmSync(tempFile, { force: true });
  }
}

function searchBuckets(plan, normalizedInput, rawMatch) {
  for (const candidate of plan.candidates) {
    const normalized = normalizeCardName(candidate.value);
    const bucketId = bucketKeyForName(candidate.value);
    const bucket = readBucket(bucketId);
    const index = bucket?.aliases?.[normalized];
    if (Number.isInteger(index) && bucket.cards?.[index]) {
      return { card: bucket.cards[index], bucketId, indexAlias: normalized, matchedMethod: candidate.method };
    }
  }

  if (rawMatch?.canonicalName) {
    const normalized = normalizeCardName(rawMatch.canonicalName);
    const bucketId = bucketKeyForName(rawMatch.canonicalName);
    const bucket = readBucket(bucketId);
    const index = bucket?.aliases?.[normalized];
    if (Number.isInteger(index) && bucket.cards?.[index]) {
      return { card: bucket.cards[index], bucketId, indexAlias: normalized, matchedMethod: "raw_expected_canonical" };
    }
  }

  return { card: null, bucketId: null, indexAlias: null, matchedMethod: null };
}

function readBucket(bucketId) {
  const filePath = path.join(catalogRoot, `${bucketId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildIndexDiagnostics(inputName, card, indexAlias, normalizedInput) {
  if (!card) {
    return {
      canonical: false,
      printedName: false,
      alias: false,
      normalized: false,
      faceName: false
    };
  }

  const faceNames = String(card.name || "")
    .split(/\s*\/\/\s*/)
    .map((item) => normalizeCardName(item))
    .filter(Boolean);
  const printedNames = (card.printedNames || []).map((name) => normalizeCardName(name));
  const canonical = normalizeCardName(card.name || "") === normalizedInput;

  return {
    canonical,
    printedName: printedNames.includes(normalizedInput),
    alias: indexAlias === normalizedInput,
    normalized: indexAlias === normalizedInput,
    faceName: faceNames.includes(normalizedInput)
  };
}

function isApprovedOfficialCatalogCard(card) {
  return Boolean((card.cardTypes || []).length || String(card.oracleText || "").trim() || String(card.typeLine || "").trim() !== "Card");
}

function buildFailureReason({ rawMatch, bucketSearch, resolverMatch, indexes, approved }) {
  if (resolverMatch) return null;
  if (rawMatch && !bucketSearch.card) {
    return "A carta existe no bulk bruto, mas foi perdida no build do catálogo ou caiu em bucket diferente do esperado.";
  }
  if (bucketSearch.card && approved === false) {
    return "A carta existe no catálogo, mas foi bloqueada por filtro de qualidade/approved.";
  }
  if (bucketSearch.card && !indexes.normalized && (indexes.canonical || indexes.printedName || indexes.faceName)) {
    return "A carta existe no catálogo, mas o alias normalizado não foi indexado.";
  }
  if (bucketSearch.card) {
    return "A carta existe no catálogo, mas o resolver não encontrou pelos candidatos tentados.";
  }
  if (!rawMatch) {
    return "A carta não foi encontrada no bulk bruto pelos nomes fornecidos.";
  }
  return "Falha não classificada no lookup.";
}

function findBestFuzzyCandidate(plan, bucketIds) {
  const target = plan.normalizedInput;
  let best = null;
  for (const bucketId of bucketIds) {
    const bucket = readBucket(bucketId);
    if (!bucket) continue;
    for (const [alias, index] of Object.entries(bucket.aliases || {})) {
      const score = fuzzyScore(target, alias);
      if (!best || score > best.score) {
        best = {
          alias,
          canonicalName: bucket.cards?.[index]?.name || null,
          bucketId,
          score
        };
      }
    }
  }
  return best;
}

function fuzzyScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const distance = levenshtein(a, b);
  return Math.max(0, 1 - distance / Math.max(a.length, b.length, 1));
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
    }
  }
  return previous[b.length];
}
