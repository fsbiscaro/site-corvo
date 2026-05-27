export function normalizeCardName(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cleanCardName(value: string): string {
  return String(value || "")
    .replace(/\s+\/\/\s+/g, " // ")
    .replace(/\s+\(([A-Z0-9]{2,6})\)\s+[A-Za-z0-9★-]+$/u, "")
    .replace(/\s+\(([A-Z0-9]{2,6})\)$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = cleanCardName(value);
    const key = normalizeCardName(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function getParentheticalCandidates(name: string): string[] {
  const clean = cleanCardName(name);
  const matches = [...clean.matchAll(/\(([^)]+)\)/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  if (matches.length === 0) return [];
  const outside = clean.replace(/\s*\([^)]+\)\s*/g, " ").replace(/\s+/g, " ").trim();
  return uniqueStrings([...matches, outside]);
}

export function getSplitCardCandidates(name: string): string[] {
  const clean = cleanCardName(name);
  if (!clean.includes("//")) return [];
  return uniqueStrings(clean.split("//").map((part) => part.trim()));
}
