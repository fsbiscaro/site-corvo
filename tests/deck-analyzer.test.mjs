import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeDeckRequest, calculateHypergeometricProbability, findCatalogCards, parseDeckRequest, parseDeckText, runBasicDiagnostics } from "../server/deck-analyzer/index.js";

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

const JURI_ARISTOCRATS_TEST_DECK = `
20 Swamp
15 Mountain
1 Blood Artist
1 Zulaport Cutthroat
1 Viscera Seer
1 Carrion Feeder
1 Goblin Bombardment
1 Mayhem Devil
1 Bastion of Remembrance
1 Reassembling Skeleton
1 Ophiomancer
1 Pitiless Plunderer
1 Village Rites
1 Deadly Dispute
1 Skullclamp
1 Rakdos Signet
1 Arcane Signet
1 Sol Ring
`;

const JURI_TAXONOMY_TEST_DECK = `
20 Swamp
15 Mountain
1 Blood Artist
1 Zulaport Cutthroat
1 Bastion of Remembrance
1 Agent of the Iron Throne
1 Mirkwood Bats
1 Viscera Seer
1 Carrion Feeder
1 Goblin Bombardment
1 Witch's Oven
1 High Market
1 Pitiless Plunderer
1 Jadar, Ghoulcaller of Nephalia
1 Victimize
1 Village Rites
1 Costly Plunder
1 Deadly Dispute
1 Pirate's Pillage
1 Brass's Bounty
1 Wayfarer's Bauble
1 Rakdos Signet
1 Arcane Signet
1 Talisman of Indulgence
1 Feed the Swarm
1 Lightning Greaves
1 Swiftfoot Boots
1 Act of Treason
1 Unleash Fury
1 Kazuul's Fury
`;

const CONTROL_TEST_DECK = `
30 Island
4 Counterspell
4 Swords to Plowshares
4 Path to Exile
4 Wrath of God
4 Supreme Verdict
4 Opt
4 Consider
2 Teferi, Hero of Dominaria
`;

const AGGRO_BURN_TEST_DECK = `
20 Mountain
4 Monastery Swiftspear
4 Lightning Bolt
4 Lightning Strike
4 Play with Fire
4 Shock
4 Kumano Faces Kakkazan
4 Viashino Pyromancer
4 Chain Lightning
4 Skewer the Critics
`;

const VOLTRON_TEST_DECK = `
20 Plains
4 Colossus Hammer
4 Ethereal Armor
4 All That Glitters
4 Swiftfoot Boots
4 Lightning Greaves
4 Hyena Umbra
4 Blackblade Reforged
4 Open the Armory
4 Danitha Capashen, Paragon
`;

const REANIMATOR_TEST_DECK = `
20 Swamp
4 Entomb
4 Reanimate
4 Animate Dead
4 Exhume
4 Buried Alive
4 Persist
4 Griselbrand
4 Archon of Cruelty
4 Stitcher's Supplier
4 Unmarked Grave
`;

const SPELLSLINGER_TEST_DECK = `
24 Island
4 Opt
4 Consider
4 Counterspell
4 Brainstorm
4 Ponder
4 Archmage Emeritus
4 Murmuring Mystic
4 Metallurgic Summonings
4 Serum Visions
`;

const MIDRANGE_TEST_DECK = `
20 Swamp
20 Forest
4 Tarmogoyf
4 Scavenging Ooze
4 Tireless Tracker
4 Sheoldred, the Apocalypse
4 Fatal Push
4 Go for the Throat
4 Thoughtseize
4 Liliana of the Veil
`;

const GOODSTUFF_TEST_DECK = `
24 Forest
4 Cultivate
4 Harmonize
4 Beast Within
4 Abrupt Decay
4 Eternal Witness
4 Tireless Tracker
4 Assassin's Trophy
4 Maelstrom Pulse
4 Sol Ring
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
  assert.equal(result.strategy.primaryArchetype.label, "Golgari Elfos");
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
  assert.ok(result.strategy.secondaryArchetypes.some((item) => /Combo|Big Mana|Vida como recurso|Drain/.test(item.label)));
  assert.ok(!result.commander.displayName.includes("//"));
});

test("strategy engine reconhece Juri como aristocrats e rejeita combo sem linha", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    commander: { name: "Juri, Master of the Revue", colorIdentity: ["B", "R"] },
    deckText: JURI_ARISTOCRATS_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Sacrificio / Aristocrats");
  assert.notEqual(result.archetype.primary, "Plano em construÃ§Ã£o");
  assert.ok(!/Human Tribal/i.test(result.strategy.primaryArchetype.label));
  assert.ok(result.strategy.rejectedArchetypes.some((item) => item.id === "combo"));
  assert.ok(result.cardRoles.coreCards.some((card) => /Viscera Seer|Goblin Bombardment|Carrion Feeder/.test(card.name)));
});

test("aristocrats separa outlet, payoff, engine, recursao, tesouro e ramp", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    commander: { name: "Juri, Master of the Revue", colorIdentity: ["B", "R"] },
    deckText: JURI_TAXONOMY_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  const byName = new Map(result.cardRoles.cards.map((card) => [card.name, card]));

  assert.equal(result.strategy.primaryArchetype.label, "Sacrificio / Aristocrats");
  assert.equal(byName.get("Blood Artist")?.role, "payoff");
  assert.equal(byName.get("Goblin Bombardment")?.role, "core");
  assert.equal(byName.get("Pitiless Plunderer")?.role, "engine");
  assert.equal(byName.get("Victimize")?.role, "support");
  assert.equal(byName.get("Wayfarer's Bauble")?.role, "ramp");
  assert.notEqual(byName.get("Wayfarer's Bauble")?.reason, byName.get("Goblin Bombardment")?.reason);
  assert.ok(!result.strategy.winConditions.some((label) => /combo/i.test(label)));
  assert.equal(result.packages.find((item) => item.id === "protection")?.count, 2);
  assert.notEqual(result.packages.find((item) => item.id === "protection")?.status, "strong");
});

test("strategy engine reconhece controle com respostas, wipes e compra", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: CONTROL_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Controle");
  assert.ok(result.strategy.primaryArchetype.evidence.some((line) => line.includes("interacoes")));
  assert.ok(
    result.strategy.primaryArchetype.missing.some((line) => line.includes("Finalizador")) ||
      result.strategy.signals.finisher_count > 0 ||
      result.strategy.signals.large_threat_count >= 2
  );
});

test("strategy engine reconhece aggro/burn sem chamar de combo", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: AGGRO_BURN_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(["Aggro", "Burn"].includes(result.strategy.primaryArchetype.label));
  assert.ok(result.strategy.rejectedArchetypes.some((item) => item.id === "combo"));
});

test("strategy engine reconhece voltron por auras, equipamentos e protecao", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    commander: { name: "Sram, Senior Edificer", colorIdentity: ["W"] },
    deckText: VOLTRON_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Voltron");
  assert.ok(result.strategy.signals.equipment_aura_count >= 20);
});

test("strategy engine reconhece reanimator por enablers, reanimacao e alvos grandes", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: REANIMATOR_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Reanimator");
  assert.ok(result.strategy.signals.reanimation_count >= 4);
});

test("strategy engine reconhece spellslinger por densidade de spells e payoffs", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    commander: { name: "Talrand, Sky Summoner", colorIdentity: ["U"] },
    deckText: SPELLSLINGER_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Spellslinger");
  assert.ok(result.strategy.signals.spell_density > 0.45);
});

test("strategy engine reconhece midrange por ameacas, interacao e valor", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: MIDRANGE_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Midrange");
  assert.ok(result.strategy.primaryArchetype.evidence.some((line) => line.includes("ameacas")));
});

test("strategy engine reconhece goodstuff/value quando ha valor sem sinergia dominante", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: GOODSTUFF_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.equal(result.strategy.primaryArchetype.label, "Goodstuff / Value");
  assert.ok(result.strategy.primaryArchetype.missing.some((line) => line.includes("Baixa densidade")));
});

test("deck com muitas cartas desconhecidas reduz maxScore", async () => {
  const result = await analyzeDeckRequest({
    format: "casual",
    deckText: "20 Carta Misteriosa\n20 Outra Carta Fantasma\n20 Island"
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(result.diagnostics.some((item) => item.code === "MANY_UNKNOWN_CARDS"));
  assert.ok(result.catalogQuality.unrecognizedDetails.length > 0);
  assert.ok(result.catalogQuality.catalogUpdateSuggestions.length > 0);
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

test("calcula probabilidade hipergeometrica para categorias", () => {
  const probability = calculateHypergeometricProbability({
    deckSize: 100,
    successCount: 10,
    cardsDrawn: 7,
    wantedAtLeast: 1
  });

  assert.ok(probability > 0.5);
  assert.ok(probability < 0.6);
});

test("analise completa expõe painel técnico e leitura do Corvo", async () => {
  const result = await analyzeDeckRequest({
    format: "commander",
    commander: { name: "Lathril, Espada dos Elfos", colorIdentity: ["B", "G"] },
    deckText: LATHRIL_TEST_DECK
  }, { env: fileAssetEnv, requestUrl: "https://local.test/" });

  assert.ok(result.manaAnalysis.colorDemand);
  assert.ok(result.manaAnalysis.colorProduction);
  assert.ok(result.probabilityAnalysis.drawOdds.length > 0);
  assert.ok(result.packages.some((item) => item.id === "mana_development"));
  assert.ok(result.cardRoles.coreCards.length > 0 || result.cardRoles.payoffs.length > 0);
  assert.ok(result.corvoReview.summary.includes("Lathril"));
  assert.ok(result.renderData.probability.length > 0);
});
