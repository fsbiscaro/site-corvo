import { normalizeLookupKey } from "./normalize-card-name.js";

const MEMORY_CACHE = new Map();
let schemaReady = false;

export async function getCachedResolution(name, env = {}) {
  const key = normalizeLookupKey(name);
  if (!key) return null;
  if (MEMORY_CACHE.has(key)) return clone(MEMORY_CACHE.get(key));

  if (!env.DB) return null;
  await ensureResolutionCache(env);
  try {
    const row = await env.DB.prepare("SELECT resolved_json FROM card_resolution_cache WHERE normalized_name = ?")
      .bind(key)
      .first();
    if (!row?.resolved_json) return null;
    const parsed = JSON.parse(row.resolved_json);
    MEMORY_CACHE.set(key, parsed);
    return clone(parsed);
  } catch {
    return null;
  }
}

export async function setCachedResolution(name, value, env = {}, source = "resolver") {
  const key = normalizeLookupKey(name);
  if (!key || !value) return;
  const payload = clone(value);
  MEMORY_CACHE.set(key, payload);

  if (!env.DB) return;
  await ensureResolutionCache(env);
  try {
    await env.DB.prepare(
      `INSERT INTO card_resolution_cache (normalized_name, canonical_name, resolved_json, source, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(normalized_name) DO UPDATE SET
         canonical_name = excluded.canonical_name,
         resolved_json = excluded.resolved_json,
         source = excluded.source,
         updated_at = excluded.updated_at`
    ).bind(
      key,
      payload.canonicalName || payload.name || "",
      JSON.stringify(payload),
      source,
      new Date().toISOString()
    ).run();
  } catch {
    // Cache is an optimization. Resolution must keep working without it.
  }
}

export async function ensureResolutionCache(env = {}) {
  if (!env.DB || schemaReady) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS card_resolution_cache (
        normalized_name TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        resolved_json TEXT NOT NULL,
        source TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`
    ).run();
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_card_resolution_cache_updated ON card_resolution_cache(updated_at)"
    ).run();
    schemaReady = true;
  } catch {
    schemaReady = false;
  }
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}
