export function normalizeCardName(value) {
  return String(value || "")
    .replace(/[’‘`´]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLookupKey(value) {
  return normalizeCardName(value)
    .replace(/\s*\/\/\s*/g, " // ")
    .replace(/[^\p{L}\p{N}'/ ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueNormalized(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const clean = String(value || "").trim();
    const normalized = normalizeLookupKey(clean);
    if (!clean || !normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(clean);
  }
  return result;
}
