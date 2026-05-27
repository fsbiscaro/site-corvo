import assert from "node:assert/strict";
import test from "node:test";

import { applyLocalAlias } from "../src/deck-resolver/local-aliases.ts";
import { normalizeCardName } from "../src/deck-resolver/normalize-card-name.ts";
import { parseDecklist } from "../src/deck-resolver/parse-decklist.ts";
import { resolveDeck } from "../src/deck-resolver/resolve-deck.ts";

test("parseDecklist parses quantities and ignores section headers", () => {
  const cards = parseDecklist(`
Deck
4 Ritual Sombrio
SB: 2 Macular
Commander
K'rrik, Filho de Yawgmoth
`);

  assert.deepEqual(cards.map((card) => [card.quantity, card.inputName]), [
    [4, "Ritual Sombrio"],
    [2, "Macular"],
    [1, "K'rrik, Filho de Yawgmoth"]
  ]);
});

test("normalizeCardName removes accents, normalizes spaces and quotes", () => {
  assert.equal(normalizeCardName("  Tutor   Diabólico  "), "tutor diabolico");
  assert.equal(normalizeCardName("Gonti’s Machinations"), "gonti's machinations");
});

test("local aliases resolve required K'rrik PT-BR names", () => {
  assert.equal(applyLocalAlias("Ritual Sombrio"), "Dark Ritual");
  assert.equal(applyLocalAlias("Tutor Diabolico"), "Diabolic Tutor");
  assert.equal(applyLocalAlias("Diamante de Carvão"), "Charcoal Diamond");
  assert.equal(applyLocalAlias("Cidadela de Nicol Bolas"), "Bolas's Citadel");
  assert.equal(applyLocalAlias("Maquinações de Gonti"), "Gonti's Machinations");
});

test("resolveDeck sends Scryfall collection identifiers in batch after aliases", async () => {
  const calls = [];
  const result = await resolveDeck(`
1 Ritual Sombrio
1 Tutor Diabólico
1 Pedra da Mente
`, { fetchFn: fakeScryfallFetch(fakeCardDb(), calls) });

  assert.equal(result.status, "complete");
  assert.equal(result.resolvedCount, 3);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(calls.filter((call) => call.type === "collection").length, 1);
  assert.deepEqual(calls[0].identifiers.map((item) => item.name), ["Dark Ritual", "Diabolic Tutor", "Mind Stone"]);
  assert.equal(result.cards[0].resolvedBy, "local_alias_then_scryfall_collection");
});

test("resolveDeck uses fuzzy only for cards not found in collection", async () => {
  const calls = [];
  const result = await resolveDeck("1 Dark Ritua", { fetchFn: fakeScryfallFetch(fakeCardDb(), calls) });

  assert.equal(result.status, "complete");
  assert.equal(result.cards[0].canonicalName, "Dark Ritual");
  assert.equal(result.cards[0].resolvedBy, "scryfall_fuzzy");
  assert.equal(calls.filter((call) => call.type === "collection").length, 1);
  assert.equal(calls.filter((call) => call.type === "fuzzy").length, 1);
});

test("resolveDeck handles parenthetical English names", async () => {
  const result = await resolveDeck("1 Sorte Inesperada (Unexpected Windfall)", {
    fetchFn: fakeScryfallFetch(fakeCardDb())
  });

  assert.equal(result.status, "complete");
  assert.equal(result.cards[0].lookupName, "Unexpected Windfall");
  assert.equal(result.cards[0].resolvedBy, "parenthetical_then_scryfall_collection");
});

test("resolveDeck handles split cards through face lookup", async () => {
  const result = await resolveDeck("1 Dragao Decadente // Gosto Refinado", {
    fetchFn: fakeScryfallFetch(fakeCardDb())
  });

  assert.equal(result.status, "complete");
  assert.equal(result.cards[0].canonicalName, "Decadent Dragon // Expensive Taste");
  assert.equal(result.cards[0].resolvedBy, "split_face_then_scryfall_collection");
});

test("resolveDeck returns clear unresolved reason and attempts", async () => {
  const result = await resolveDeck("1 Carta Inventada do Corvo", {
    fetchFn: fakeScryfallFetch(fakeCardDb())
  });

  assert.equal(result.status, "partial");
  assert.equal(result.resolvedCount, 0);
  assert.equal(result.unresolvedCount, 1);
  assert.equal(result.unresolved[0].reason, "not_found");
  assert.deepEqual(result.unresolved[0].attempts, ["local_alias", "scryfall_collection", "scryfall_fuzzy"]);
});

test("resolveDeck resolves the current K'rrik test list above 95/99 without analysis or AI", async () => {
  const calls = [];
  const result = await resolveDeck(KRRIK_TEST_LIST, {
    fetchFn: fakeScryfallFetch(fakeCardDb(), calls)
  });

  assert.equal(result.total, 99);
  assert.ok(result.resolvedCount >= 95, `expected at least 95/99, got ${result.resolvedCount}/99`);
  assert.equal(result.unresolvedCount, 0);
  assert.equal(calls.filter((call) => call.type === "collection").length, 1);
  assert.equal(calls.filter((call) => call.type === "fuzzy").length, 0);
});

const KRRIK_TEST_LIST = `
35 Pantano
1 Ritual Sombrio
1 Tutor Diabolico
1 Pedra da Mente
1 Diamante de Carvao
1 Gavinhas da Agonia
1 Mercador Cinzento de Asfodelos
1 Cidadela de Nicol Bolas
1 Maquinacoes de Gonti
1 Alimentar o Enxame
1 Malignidade Imortal
1 Armadura de Sombras
1 Presenca Medonha
1 Lente Prismatica
1 Pluma do Paraiso
1 Chifre de Demonio
1 Promessa de Poder
1 Chainer Mestre da Demencia
1 Pestilencia
1 Elixir da Imortalidade
1 Passagem do Ladino
1 Parasita Thrull
1 Sibilador da Basilica
1 Impositor do Sindicato
1 Pontifice do Flagelo
1 Cajado do Magus da Morte
1 Fonte Radiante
1 Anel de Prisma
1 Fonte das Agonias
1 Macular
1 Rito de Razaketh
1 Sol Ring
1 Arcane Signet
1 Jet Medallion
1 Wayfarer's Bauble
1 Expedition Map
1 Bontu's Monument
1 Exsanguinate
1 Sign in Blood
1 Read the Bones
1 Night's Whisper
1 Hero's Downfall
1 Go for the Throat
1 Murderous Rider
1 Toxic Deluge
1 Damnation
1 Mutilate
1 Crypt Ghast
1 Nirkana Revenant
1 Vilis, Broker of Blood
1 Asmodeus the Archfiend
1 Darkness
1 Profane Tutor
1 Demonic Tutor
1 Diabolic Intent
1 Vampiric Tutor
1 Aetherflux Reservoir
1 Sensei's Divining Top
1 Necropotence
1 Phyrexian Arena
1 Whip of Erebos
1 Exquisite Blood
1 Sanguine Bond
1 Bloodchief Ascension
1 Repay in Kind
`;

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
        const card = cardsByName.get(normalize(identifier.name));
        if (card) data.push(card);
        else not_found.push(identifier);
      }
      return jsonResponse({ object: "list", data, not_found });
    }

    if (target.includes("/cards/named")) {
      const fuzzy = new URL(target).searchParams.get("fuzzy") || "";
      calls.push({ type: "fuzzy", name: fuzzy });
      const card = cardsByName.get(normalize(fuzzy)) || fuzzyMap(cardsByName).get(normalize(fuzzy));
      return card ? jsonResponse(card) : jsonResponse({ object: "error" }, 404);
    }

    return jsonResponse({ object: "error" }, 404);
  };
}

function fakeCardDb() {
  const names = [
    "Swamp",
    "Dark Ritual",
    "Diabolic Tutor",
    "Mind Stone",
    "Charcoal Diamond",
    "Tendrils of Agony",
    "Gray Merchant of Asphodel",
    "Bolas's Citadel",
    "Gonti's Machinations",
    "Feed the Swarm",
    "Undying Malice",
    "Armor of Shadows",
    "Dread Presence",
    "Prismatic Lens",
    "Paradise Plume",
    "Demon's Horn",
    "Promise of Power",
    "Chainer, Dementia Master",
    "Pestilence",
    "Elixir of Immortality",
    "Rogue's Passage",
    "Thrull Parasite",
    "Basilica Screecher",
    "Syndicate Enforcer",
    "Pontiff of Blight",
    "Staff of the Death Magus",
    "Radiant Fountain",
    "Prism Ring",
    "Font of Agonies",
    "Defile",
    "Razaketh's Rite",
    "Sol Ring",
    "Arcane Signet",
    "Jet Medallion",
    "Wayfarer's Bauble",
    "Expedition Map",
    "Bontu's Monument",
    "Exsanguinate",
    "Sign in Blood",
    "Read the Bones",
    "Night's Whisper",
    "Hero's Downfall",
    "Go for the Throat",
    "Murderous Rider",
    "Toxic Deluge",
    "Damnation",
    "Mutilate",
    "Crypt Ghast",
    "Nirkana Revenant",
    "Vilis, Broker of Blood",
    "Asmodeus the Archfiend",
    "Darkness",
    "Profane Tutor",
    "Demonic Tutor",
    "Diabolic Intent",
    "Vampiric Tutor",
    "Aetherflux Reservoir",
    "Sensei's Divining Top",
    "Necropotence",
    "Phyrexian Arena",
    "Whip of Erebos",
    "Exquisite Blood",
    "Sanguine Bond",
    "Bloodchief Ascension",
    "Repay in Kind",
    "Unexpected Windfall"
  ];

  const cards = [
    ...names.map((name) => fakeCard(name)),
    fakeCard("Decadent Dragon // Expensive Taste", {
      card_faces: [
        { name: "Decadent Dragon", oracle_text: "Flying, trample.", type_line: "Creature — Dragon" },
        { name: "Expensive Taste", oracle_text: "Create Treasure tokens.", type_line: "Sorcery — Adventure" }
      ]
    })
  ];

  const map = new Map();
  for (const card of cards) {
    map.set(normalize(card.name), card);
    for (const face of card.card_faces || []) map.set(normalize(face.name), card);
  }
  return map;
}

function fakeCard(name, overrides = {}) {
  return {
    object: "card",
    id: `id-${normalize(name)}`,
    name,
    cmc: name === "Swamp" ? 0 : 1,
    type_line: name === "Swamp" ? "Basic Land — Swamp" : "Instant",
    oracle_text: "Test oracle text.",
    colors: name === "Swamp" ? [] : ["B"],
    color_identity: ["B"],
    legalities: { commander: "legal" },
    image_uris: { small: "https://example.com/small.jpg", normal: "https://example.com/normal.jpg" },
    ...overrides
  };
}

function fuzzyMap(cardsByName) {
  return new Map([[normalize("Dark Ritua"), cardsByName.get(normalize("Dark Ritual"))]]);
}

function normalize(value) {
  return normalizeCardName(value);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
