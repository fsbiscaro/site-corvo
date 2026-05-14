const EDHREC_TIMEOUT_MS = 3500;

export async function fetchExternalCommanderBenchmark({ commander, mode = "STANDARD_AI" }) {
  if (mode !== "DEEP_AI" || !commander?.displayName) return null;
  const slug = slugifyCommander(commander.displayName);
  if (!slug) return null;

  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDHREC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "GrimorioDoCorvo/1.0"
      },
      signal: controller.signal
    });
    if (!response.ok) return unavailableBenchmark("EDHREC", response.status);
    const data = await response.json();
    const cards = collectCardLikeObjects(data).sort(sortBenchmarkCards).slice(0, 80);
    const themes = collectThemeNames(data).slice(0, 24);
    return {
      source: "EDHREC",
      status: cards.length || themes.length ? "available" : "empty",
      url: `https://edhrec.com/commanders/${slug}`,
      commanderSlug: slug,
      themes,
      cardCount: cards.length,
      popularCards: cards.slice(0, 30),
      note: "Contexto externo usado apenas como comparacao estrategica; os calculos continuam vindo do catalogo local."
    };
  } catch (error) {
    return unavailableBenchmark("EDHREC", String(error?.message || error).slice(0, 80));
  } finally {
    clearTimeout(timer);
  }
}

function collectCardLikeObjects(value, result = [], seen = new Set()) {
  if (!value || result.length >= 120) return result;
  if (Array.isArray(value)) {
    for (const item of value) collectCardLikeObjects(item, result, seen);
    return result;
  }
  if (typeof value !== "object") return result;

  const name = value.name || value.sanitized || value.card || value.label;
  const hasDeckMetric = value.num_decks !== undefined || value.potential_decks !== undefined || value.inclusion !== undefined || value.synergy !== undefined;
  if (typeof name === "string" && hasDeckMetric && !seen.has(name)) {
    seen.add(name);
    result.push({
      name,
      inclusion: numericOrNull(value.inclusion),
      synergy: numericOrNull(value.synergy),
      numDecks: numericOrNull(value.num_decks),
      potentialDecks: numericOrNull(value.potential_decks)
    });
  }

  for (const child of Object.values(value)) collectCardLikeObjects(child, result, seen);
  return result;
}

function collectThemeNames(value, result = [], seen = new Set()) {
  if (!value || result.length >= 40) return result;
  if (Array.isArray(value)) {
    for (const item of value) collectThemeNames(item, result, seen);
    return result;
  }
  if (typeof value !== "object") return result;

  const candidate = value.header || value.name || value.label || value.slug;
  if (typeof candidate === "string" && /theme|typal|combo|aristocrat|token|artifact|graveyard|spellslinger|equipment|blink|sacrifice/i.test(candidate) && !seen.has(candidate)) {
    seen.add(candidate);
    result.push(candidate);
  }

  for (const child of Object.values(value)) collectThemeNames(child, result, seen);
  return result;
}

function slugifyCommander(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortBenchmarkCards(left, right) {
  const decksDiff = (right.numDecks || 0) - (left.numDecks || 0);
  if (decksDiff) return decksDiff;
  return (right.inclusion || 0) - (left.inclusion || 0);
}

function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unavailableBenchmark(source, detail) {
  return { source, status: "unavailable", detail };
}
