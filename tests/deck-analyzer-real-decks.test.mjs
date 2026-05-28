import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeDeckRequest } from "../server/deck-analyzer/index.js";
import { createMemoryResolutionCache, resolveDeck } from "../src/deck-resolver/resolve-deck.ts";

const realDecks = JSON.parse(await readFile(new URL("./fixtures/real-decks.json", import.meta.url), "utf8"));

const fileAssetEnv = {
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      const fileUrl = new URL(`..${url.pathname}`, import.meta.url);
      try {
        return new Response(await readFile(fileUrl), { status: 200 });
      } catch {
        return new Response("", { status: 404 });
      }
    }
  }
};

test("real decks resolve and analyze through the clean deck resolver", async (t) => {
  for (const deck of realDecks) {
    await t.test(deck.id, async () => {
      const cache = createMemoryResolutionCache();
      const counter = createCountingFetch();
      const deckText = deck.decklist.join("\n");

      const resolvedDeck = await resolveDeck(deckText, {
        cache,
        fetchFn: counter.fetchFn
      });

      assert.equal(resolvedDeck.total, 99, `${deck.id} deve ter 99 cartas na decklist`);
      assert.equal(
        resolvedDeck.resolvedCount,
        99,
        `${deck.id} deveria resolver 99/99. Pendentes: ${JSON.stringify(resolvedDeck.unresolved, null, 2)}`
      );
      assert.equal(resolvedDeck.unresolvedCount, 0, `${deck.id} nao deveria ter cartas pendentes`);
      assert.ok(counter.externalRequests <= 5, `${deck.id} fez requests demais: ${counter.externalRequests}`);

      const requestsAfterResolve = counter.externalRequests;
      const analysis = await analyzeDeckRequest({
        format: "commander",
        commander: {
          name: deck.commander,
          colorIdentity: deck.expectedColorIdentity
        },
        deckText
      }, {
        env: fileAssetEnv,
        requestUrl: "https://local.test/",
        resolverCache: cache,
        fetchFn: counter.fetchFn
      });

      assert.notEqual(analysis.status, "error", `${deck.id} nao deveria retornar erro: ${JSON.stringify(analysis.errors)}`);
      assert.equal(analysis.deck.resolvedDeck.total, 99);
      assert.equal(analysis.deck.resolvedDeck.resolvedCount, 99);
      assert.equal(analysis.deck.resolvedDeck.unresolvedCount, 0);
      assert.equal(analysis.catalogQuality.total, analysis.deck.resolvedDeck.total);
      assert.equal(analysis.catalogQuality.recognized, analysis.deck.resolvedDeck.resolvedCount);
      assert.equal(analysis.catalogQuality.unrecognizedCount, analysis.deck.resolvedDeck.unresolvedCount);
      assert.equal(counter.externalRequests, requestsAfterResolve, `${deck.id} analyzer nao deve resolver de novo fora do cache`);

      assert.deepEqual(sortColors(analysis.commander.colorIdentity), sortColors(deck.expectedColorIdentity));
      assertColorIdentityCompatible(analysis.deckColorIdentity, deck.expectedColorIdentity, deck.id);
      assertHasExpectedArchetypeHint(analysis, deck);
      assertNoForbiddenPrimaryArchetype(analysis, deck);
    });
  }
});

function createCountingFetch() {
  const counter = {
    externalRequests: 0,
    byType: {},
    async fetchFn(url, init) {
      const target = String(url);
      if (target.includes("scryfall.com")) {
        counter.externalRequests += 1;
        const key = target.includes("/cards/collection")
          ? "scryfall_collection"
          : target.includes("/cards/named")
            ? "scryfall_fuzzy"
            : "scryfall_other";
        counter.byType[key] = (counter.byType[key] || 0) + 1;
      }
      return fetch(url, init);
    }
  };
  return counter;
}

function assertColorIdentityCompatible(deckColorIdentity, expectedColorIdentity, deckId) {
  const expected = new Set(expectedColorIdentity);
  for (const color of deckColorIdentity || []) {
    assert.ok(expected.has(color), `${deckId} tem cor fora da identidade do comandante: ${color}`);
  }
}

function assertHasExpectedArchetypeHint(analysis, deck) {
  const haystack = normalizeSearchText([
    analysis.strategy?.primaryArchetype?.label,
    ...(analysis.strategy?.secondaryArchetypes || []).map((item) => item.label),
    analysis.archetype?.primary,
    ...(analysis.archetype?.secondary || []),
    analysis.tribalSummary?.primaryTribe,
    ...(analysis.strategy?.winConditions || []).map((item) => item.label || item.type),
    ...(analysis.packages || []).map((item) => `${item.label} ${item.interpretation || ""}`),
    analysis.corvoReview?.summary,
    analysis.corvoReview?.planA,
    analysis.corvoReview?.howItWins
  ].filter(Boolean).join(" "));

  const matched = deck.expectedArchetypeHints.some((hint) => hintVariants(hint).some((variant) => haystack.includes(variant)));
  assert.ok(matched, `${deck.id} nao trouxe nenhum hint esperado. Texto: ${haystack}`);
}

function assertNoForbiddenPrimaryArchetype(analysis, deck) {
  const primary = normalizeSearchText(analysis.strategy?.primaryArchetype?.label || analysis.archetype?.primary || "");
  const allLabels = normalizeSearchText([
    analysis.strategy?.primaryArchetype?.label,
    ...(analysis.strategy?.secondaryArchetypes || []).map((item) => item.label),
    analysis.archetype?.primary,
    ...(analysis.archetype?.secondary || [])
  ].filter(Boolean).join(" "));

  for (const forbidden of deck.forbiddenArchetypes) {
    const normalized = normalizeSearchText(forbidden);
    const primaryOnly = normalized.includes("puro");
    const needle = normalized.replace(/\bpuro\b/g, "").trim();
    const variants = forbiddenVariants(needle);
    const target = primaryOnly ? primary : allLabels;
    const matched = variants.some((variant) => target.includes(variant));
    assert.equal(matched, false, `${deck.id} caiu em arquétipo proibido: ${forbidden}. Labels: ${allLabels}`);
  }
}

function forbiddenVariants(needle) {
  const variants = [needle];
  if (needle === "control") variants.push("controle");
  if (needle === "aristocrats") variants.push("sacrificio", "sacrifice");
  if (needle === "big mana") variants.push("big mana ramp");
  if (needle === "human tribal") variants.push("human tribal");
  return variants.map(normalizeSearchText);
}

function hintVariants(hint) {
  const normalized = normalizeSearchText(hint);
  const variants = [normalized];
  const lookup = {
    "go wide": ["mesa larga", "tokens", "fichas"],
    "big creatures": ["ameacas grandes", "stompy", "big mana"],
    "power matters": ["poder", "stompy", "big mana"],
    "mono green": ["mono green", "verde"],
    "mono white": ["mono white", "branco"],
    "mardu": ["mardu"],
    "dimir": ["dimir"],
    "angel": ["angel"],
    "faerie": ["faerie"],
    "tribal": ["tribal"],
    "ramp": ["ramp"],
    "tokens": ["tokens", "fichas"],
    "aristocrats": ["aristocrats", "sacrificio"],
    "sacrifice": ["sacrifice", "sacrificio"],
    "combat": ["combat", "combate"],
    "lifegain": ["lifegain", "vida"],
    "flying": ["flying", "evasivo"],
    "flash": ["flash"],
    "tempo": ["tempo"],
    "control": ["control", "controle"],
    "stompy": ["stompy", "ameacas grandes", "big mana"]
  };
  return [...new Set([...(lookup[normalized] || []), ...variants].map(normalizeSearchText))];
}

function sortColors(colors) {
  return [...(colors || [])].sort();
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s/]+/g, " ")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
