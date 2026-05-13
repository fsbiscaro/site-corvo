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

const LATHRIL_TEST_DECK = `
10 Pantano
18 Floresta
1 Mascara de Avacyn
1 Fera Interior
1 Batedor Chifre-de-Cobre
1 Elfo do Arvoredo
1 Druida Devotado
1 Elfo Porto-Longinquo
1 Proeza do Belo
1 Passo Elfico
1 Magistrado Imaculado
1 Perfeita Imperiosa
1 Dourador de Folhas
1 Mestre de Caca de Lys Alana
1 Retorno Aterrorizante
1 Garra Krosana
1 Elfos de Fyndhorn
1 Elfos das Sombras Profundas
1 Pastoras Magi-Anuladoras
1 Putrificar
1 Manto de Seda Ruflante
1 Chifres de Vorrac para Combate
1 Elfo Vigia dos Pinheiros
1 Drenar Mente
1 Patrulheiros Betulineos
1 Voz das Matas
1 Tutor Diabolico
1 Mortos de Llanowar
1 Inconsciente Coletivo
1 Sacerdote de Titania
1 Elfos da Floresta
1 Patrulheiro de Skyshroud
1 Vitalizar
1 Arqueodruida Elfo
1 Elfos de Llanowar
1 Torre de Comando
1 Homicidio
1 Amuleto Golgari
1 Passagem do Ladino
1 Autoridade de Alfa
1 Mistico Elfico
1 Leia os Ossos
1 Elmo do Espreitador
1 Templo da Enfermidade
1 Sabio da Reivindicacao
1 No Rastro de Garruk
1 Clareira na Selva
1 Paisagem Infinita
1 Revelacao Xamanica
1 Pacto Condenavel
1 Dwynen, Daen de Folha D'Ouro
1 Xama do Bando
1 Druida do Capote
1 Bestiario do Vivideiro
1 Marwyn, a Nutriz
1 Arqueiro da Ponta Envenenada
1 Encantador de Feras
1 Druida do Paraiso
1 Baixas de Guerra
1 Tribo de Llanowar
1 Recuperacao das Gavinhas Bolorentas
1 Mistica da Mata
1 Escudo Espelhado
1 Ritos da Vila
1 Abominacao de Llanowar
1 Abismo da Floresta
1 Umbrosabia de Skemfar
1 Harald, Rei de Skemfar
1 Vingadora de Skemfar
1 Coroa de Skemfar
1 Peconha da Presa Ancestral
1 Pacto da Serpente
1 Ponte de Musgosombrio
`;

const K_RRIK_TEST_DECK = `
79 Pantano
1 Tutor Diabolico
1 Leia os Ossos
1 Pacto Condenavel
1 Homicidio
1 Ritos da Vila
1 Drenar Mente
1 Lagoa dos Mortos
1 Lacaio Devotado
1 Lapide Silenciosa
1 Last Rites
1 Lashwrithe
1 Last Laugh
1 Lash of Malice
1 Last Caress
1 Labareda Mental
1 Manto de Seda Ruflante
1 Escudo Espelhado
1 Mascara de Avacyn
1 Anel Solar
`;

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

test("Lathril nao retorna plano em construcao e mostra resumo tribal de Elfos", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    commander: { name: "Lathril, Espada dos Elfos", colorIdentity: ["B", "G"] },
    deckText: LATHRIL_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(["complete", "partial"].includes(result.status));
  assert.equal(result.statistics.recognizedCards, 99);
  assert.equal(result.archetype.primary, "Golgari Elfos");
  assert.notEqual(result.archetype.primary, "Plano em construção");
  assert.equal(result.tribalSummary.primaryTribe, "Elf");
  assert.ok(result.tribalSummary.totalCreatures > 0);
  assert.ok(result.tribalSummary.tribalCreatures > 0);
  assert.equal(result.commander.displayName, "Lathril, Blade of the Elves");
  assert.ok(!JSON.stringify(result).includes("O plano principal ainda precisa de mais cartas reconhecidas"));
});

test("K'rrik nao retorna plano em construcao e nao duplica nome do comandante", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    commander: { name: "K'rrik, Filho de Yawgmoth", colorIdentity: ["B"] },
    deckText: K_RRIK_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(result.archetype.primary.includes("K'rrik") || result.archetype.primary.includes("Mono Black K'rrik"));
  assert.notEqual(result.archetype.primary, "Plano em construção");
  assert.deepEqual(result.commander.colorIdentity, ["B"]);
  assert.equal(result.commander.displayName, "K'rrik, Son of Yawgmoth");
  assert.ok(!result.commander.displayName.includes("//"));
});

test("deck com muitas cartas desconhecidas reduz maxScore", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: "20 Carta Misteriosa\n20 Outra Carta Fantasma\n20 Island"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(result.diagnostics.some((item) => item.code === "MANY_UNKNOWN_CARDS"));
  assert.equal(result.score.maxScore, 6.5);
});

test("deck tribal sem commander profile ainda infere tribo principal", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: "20 Mountain\n20 Lathliss, Dragon Queen\n20 Lathliss, Dragon Queen"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.tribalSummary.primaryTribe, "Dragon");
  assert.ok(result.tribalSummary.tribalCreatures > 0);
});
