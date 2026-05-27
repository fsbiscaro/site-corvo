const SCRYFALL_COLLECTION_URL = "https://api.scryfall.com/cards/collection";
const SCRYFALL_NAMED_URL = "https://api.scryfall.com/cards/named";
const MAX_COLLECTION_IDENTIFIERS = 75;
const DEFAULT_TIMEOUT_MS = 9000;
const SCRYFALL_HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "User-Agent": "GrimorioDoCorvo/1.0 (site-corvo.fsbiscaro.workers.dev)"
};

export async function resolveCardsWithScryfallCollection(cardNames = [], options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const names = [...new Set(cardNames.map((name) => String(name || "").trim()).filter(Boolean))];
  const found = [];
  const notFound = [];
  let requestCount = 0;

  for (const chunk of chunkArray(names, MAX_COLLECTION_IDENTIFIERS)) {
    requestCount += 1;
    const response = await fetchWithTimeout(fetchFn, SCRYFALL_COLLECTION_URL, {
      method: "POST",
      headers: SCRYFALL_HEADERS,
      body: JSON.stringify({ identifiers: chunk.map((name) => ({ name })) })
    }, options.timeoutMs || DEFAULT_TIMEOUT_MS);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Scryfall collection HTTP ${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }

    const data = await response.json();
    found.push(...(data.data || []));
    notFound.push(...(data.not_found || []));
  }

  return { found, notFound, requestCount };
}

export async function resolveCardWithScryfallFuzzy(name, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const url = `${SCRYFALL_NAMED_URL}?fuzzy=${encodeURIComponent(name)}`;
  const response = await fetchWithTimeout(fetchFn, url, {
    headers: { Accept: "application/json", "User-Agent": SCRYFALL_HEADERS["User-Agent"] }
  }, options.timeoutMs || 3500);
  if (response.status === 404) return null;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Scryfall fuzzy HTTP ${response.status}${detail ? `: ${detail.slice(0, 120)}` : ""}`);
  }
  return response.json();
}

async function fetchWithTimeout(fetchFn, url, init, timeoutMs) {
  if (typeof AbortController === "undefined") return fetchFn(url, init);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: init?.signal || controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function chunkArray(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
  return chunks;
}
