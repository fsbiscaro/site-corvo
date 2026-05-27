import assert from "node:assert/strict";
import test from "node:test";

import { resolveDeckRequest } from "../server/deck-resolver/index.js";

test("resolver uses Scryfall collection in batch and resolves PT-BR aliases", async () => {
  const calls = [];
  const fetchFn = fakeScryfallFetch(fakeCardDb(), calls);
  const resolved = await resolveDeckRequest({
    deckText: `
1 Cidadela de Nicol Bolas
1 Alimentar o Enxame
1 Presenca Medonha
1 Malignidade Imortal
1 Armadura de Sombras
`,
    format: "commander"
  }, { fetchFn });

  assert.equal(resolved.status, "complete");
  assert.equal(resolved.resolvedCount, 5);
  assert.equal(resolved.unresolvedCount, 0);
  assert.equal(resolved.meta.scryfallCollectionCalls, 1);
  assert.equal(calls.filter((call) => call.type === "collection").length, 1);
  assert.deepEqual(
    resolved.cards.map((card) => card.canonicalName),
    ["Bolas's Citadel", "Feed the Swarm", "Dread Presence", "Undying Malice", "Armor of Shadows"]
  );
});

test("resolver handles parenthetical English names", async () => {
  const resolved = await resolveDeckRequest({
    deckText: "1 Sorte Inesperada (Unexpected Windfall)",
    format: "commander"
  }, { fetchFn: fakeScryfallFetch(fakeCardDb()) });

  assert.equal(resolved.status, "complete");
  assert.equal(resolved.cards[0].canonicalName, "Unexpected Windfall");
});

test("resolver handles split cards using face aliases", async () => {
  const resolved = await resolveDeckRequest({
    deckText: "1 Dragao Decadente // Gosto Refinado",
    format: "commander"
  }, { fetchFn: fakeScryfallFetch(fakeCardDb()) });

  assert.equal(resolved.status, "complete");
  assert.equal(resolved.cards[0].canonicalName, "Decadent Dragon // Expensive Taste");
});

test("resolver returns clear unresolved details", async () => {
  const resolved = await resolveDeckRequest({
    deckText: "1 Carta Inventada do Corvo",
    format: "commander"
  }, { fetchFn: fakeScryfallFetch(fakeCardDb()) });

  assert.equal(resolved.status, "partial");
  assert.equal(resolved.resolvedCount, 0);
  assert.equal(resolved.unresolvedCount, 1);
  assert.equal(resolved.unresolved[0].reason, "not_found_in_scryfall");
  assert.ok(resolved.unresolved[0].attempts.some((item) => item.method === "input"));
});

test("resolver handles new English cards through collection endpoint", async () => {
  const resolved = await resolveDeckRequest({
    deckText: `
1 Transcendent Dragon
1 Transforming Flourish
1 Voracious Bibliophile
1 Jeskai Revelation
`,
    format: "commander"
  }, { fetchFn: fakeScryfallFetch(fakeCardDb()) });

  assert.equal(resolved.status, "complete");
  assert.equal(resolved.resolvedCount, 4);
  assert.equal(resolved.unresolvedCount, 0);
});

function fakeScryfallFetch(cardsByName, calls = []) {
  return async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/cards/collection")) {
      const body = JSON.parse(init.body || "{}");
      const identifiers = body.identifiers || [];
      calls.push({ type: "collection", identifiers });
      const data = [];
      const not_found = [];
      for (const identifier of identifiers) {
        const key = normalize(identifier.name);
        if (cardsByName.has(key)) data.push(cardsByName.get(key));
        else not_found.push(identifier);
      }
      return jsonResponse({ data, not_found });
    }

    if (target.includes("/cards/named")) {
      const name = new URL(target).searchParams.get("fuzzy") || "";
      calls.push({ type: "fuzzy", name });
      const card = cardsByName.get(normalize(name));
      return card ? jsonResponse(card) : jsonResponse({ object: "error" }, 404);
    }

    return jsonResponse({ object: "error" }, 404);
  };
}

function fakeCardDb() {
  const cards = [
    fakeCard("Bolas's Citadel", { cmc: 6, type_line: "Legendary Artifact", color_identity: ["B"] }),
    fakeCard("Feed the Swarm", { cmc: 2, type_line: "Sorcery", colors: ["B"], color_identity: ["B"], oracle_text: "Destroy target creature or enchantment an opponent controls." }),
    fakeCard("Dread Presence", { cmc: 4, type_line: "Creature — Nightmare", colors: ["B"], color_identity: ["B"], oracle_text: "Whenever a Swamp enters, draw a card or drain." }),
    fakeCard("Undying Malice", { cmc: 1, type_line: "Instant", colors: ["B"], color_identity: ["B"], oracle_text: "Until end of turn, target creature gains..." }),
    fakeCard("Armor of Shadows", { cmc: 1, type_line: "Instant", colors: ["B"], color_identity: ["B"], oracle_text: "Target creature gets +1/+0 and gains indestructible." }),
    fakeCard("Unexpected Windfall", { cmc: 4, type_line: "Instant", colors: ["R"], color_identity: ["R"], oracle_text: "Discard a card, draw two cards and create two Treasure tokens." }),
    fakeCard("Decadent Dragon // Expensive Taste", {
      cmc: 4,
      type_line: "Creature — Dragon // Sorcery — Adventure",
      colors: ["R"],
      color_identity: ["R"],
      card_faces: [
        { name: "Decadent Dragon", oracle_text: "Flying, trample.", type_line: "Creature — Dragon", colors: ["R"] },
        { name: "Expensive Taste", oracle_text: "Create Treasure tokens.", type_line: "Sorcery — Adventure", colors: ["R"] }
      ]
    }),
    fakeCard("Transcendent Dragon", { cmc: 4, type_line: "Creature — Dragon", colors: ["U"], color_identity: ["U"] }),
    fakeCard("Transforming Flourish", { cmc: 2, type_line: "Sorcery", colors: ["G"], color_identity: ["G"] }),
    fakeCard("Voracious Bibliophile", { cmc: 3, type_line: "Creature — Human Wizard", colors: ["U"], color_identity: ["U"] }),
    fakeCard("Jeskai Revelation", { cmc: 3, type_line: "Instant", colors: ["U", "R", "W"], color_identity: ["U", "R", "W"] })
  ];
  const map = new Map(cards.map((card) => [normalize(card.name), card]));
  for (const card of cards) {
    for (const face of card.card_faces || []) map.set(normalize(face.name), card);
  }
  return map;
}

function fakeCard(name, overrides = {}) {
  return {
    id: `id-${normalize(name)}`,
    oracle_id: `oracle-${normalize(name)}`,
    name,
    cmc: 1,
    type_line: "Instant",
    oracle_text: "",
    colors: [],
    color_identity: [],
    legalities: { commander: "legal" },
    image_uris: { small: "https://example.com/small.jpg", normal: "https://example.com/normal.jpg" },
    ...overrides
  };
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .trim();
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
