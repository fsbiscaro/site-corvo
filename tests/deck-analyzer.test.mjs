import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeDeckRequest, findCatalogCards, parseDeckRequest, parseDeckText, runBasicDiagnostics } from "../server/deck-analyzer/index.js";

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

test("parse simple Arena deck with mainboard and sideboard", () => {
  const result = parseDeckText(`
    Deck
    4 Monastery Swiftspear
    4 Lightning Strike
    18 Mountain

    Sideboard
    2 Abrade
  `);

  assert.equal(result.mainboard.length, 3);
  assert.equal(result.sideboard.length, 1);
  assert.equal(result.mainboard[0].quantity, 4);
  assert.equal(result.mainboard[0].name, "Monastery Swiftspear");
});

test("assumes mainboard when no header exists", () => {
  const result = parseDeckText(`
    4 Monastery Swiftspear
    4 Lightning Strike
    18 Mountain

    Sideboard
    2 Abrade
  `);

  assert.equal(result.mainboard.length, 3);
  assert.equal(result.sideboard.length, 1);
});

test("extracts set code and collector number", () => {
  const result = parseDeckText(`
    Deck
    4 Monastery Swiftspear (BRO) 144
  `);

  assert.deepEqual(result.mainboard[0], {
    quantity: 4,
    name: "Monastery Swiftspear",
    set_code: "BRO",
    collector_number: "144",
    raw_line: "4 Monastery Swiftspear (BRO) 144"
  });
});

test("keeps commander separated", () => {
  const result = parseDeckText(`
    Commander
    1 Aragorn, the Uniter

    Deck
    1 Sol Ring
    1 Command Tower
  `);

  assert.equal(result.commander.length, 1);
  assert.equal(result.commander[0].name, "Aragorn, the Uniter");
  assert.equal(result.mainboard.length, 2);
});

test("keeps companion separated", () => {
  const result = parseDeckText(`
    Companion
    1 Jegantha, the Wellspring

    Deck
    4 Fable of the Mirror-Breaker
    4 Bloodtithe Harvester
  `);

  assert.equal(result.companion.length, 1);
  assert.equal(result.companion[0].name, "Jegantha, the Wellspring");
  assert.equal(result.mainboard.length, 2);
});

test("accepts line without quantity as one card with warning", () => {
  const result = parseDeckText("Lightning Strike");

  assert.equal(result.mainboard[0].quantity, 1);
  assert.equal(result.mainboard[0].name, "Lightning Strike");
  assert.equal(result.warnings.length, 1);
});

test("stores malformed quantity-only line as error", () => {
  const result = parseDeckText(`
    Deck
    4
    2 Cut Down
  `);

  assert.equal(result.mainboard.length, 1);
  assert.equal(result.errors.length, 1);
});

test("diagnoses sideboard above 15 cards", () => {
  const result = parseDeckText(`
    Deck
    60 Mountain
    Sideboard
    16 Abrade
  `);
  const warnings = runBasicDiagnostics(result, "historic");

  assert.ok(warnings.some((warning) => warning.message.includes("sideboard tem mais de 15")));
});

test("diagnoses commander format without commander section", () => {
  const result = parseDeckText(`
    Deck
    1 Sol Ring
    1 Command Tower
  `);
  const warnings = runBasicDiagnostics(result, "commander");

  assert.ok(warnings.some((warning) => warning.message.includes("nenhuma carta foi encontrada")));
});

test("preserves commas, apostrophes and hyphenated names", () => {
  const result = parseDeckText(`
    1 Sheoldred, the Apocalypse
    2 Gix's Command
    4 Fable of the Mirror-Breaker
  `);

  assert.equal(result.mainboard[0].name, "Sheoldred, the Apocalypse");
  assert.equal(result.mainboard[1].name, "Gix's Command");
  assert.equal(result.mainboard[2].name, "Fable of the Mirror-Breaker");
});

test("parse request returns summary and diagnostics", () => {
  const result = parseDeckRequest(`
    Deck
    4 Monastery Swiftspear
    4 Lightning Strike
    18 Mountain

    Sideboard
    2 Abrade
  `, "historic");

  assert.equal(result.format, "historic");
  assert.equal(result.summary.mainboard_cards, 26);
  assert.equal(result.summary.sideboard_cards, 2);
  assert.equal(result.summary.total_unique_mainboard, 3);
  assert.deepEqual(result.errors, []);
});

test("catalog resolves Portuguese names from generated buckets", async () => {
  const result = await findCatalogCards(["Kaalia, Buscadora do Zenite", "Anel Solar"], fileAssetEnv, "https://local.test/");

  assert.equal(result.get("kaalia, buscadora do zenite").name, "Kaalia, Zenith Seeker");
  assert.equal(result.get("anel solar").name, "Sol Ring");
});

test("commander analysis blocks missing selected commander", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    deckText: "99 Island"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.status, "error");
  assert.ok(result.errors.some((error) => error.code === "COMMANDER_REQUIRED"));
});

test("commander analysis rejects color identity mismatch", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    commander: { name: "Tetsuko Umezawa, Fugitiva", colorIdentity: ["U"] },
    deckText: "98 Island\n1 Swamp"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.status, "error");
  assert.ok(result.errors.some((error) => error.code === "COMMANDER_COLOR_IDENTITY_MISMATCH"));
});

test("commander analysis warns when commander appears in decklist", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    commander: { name: "Yuriko, a Sombra do Tigre", colorIdentity: ["U", "B"] },
    deckText: "1 Yuriko, a Sombra do Tigre\n98 Island"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.status, "partial");
  assert.ok(result.warnings.some((warning) => warning.code === "COMMANDER_INCLUDED_IN_DECKLIST"));
});
