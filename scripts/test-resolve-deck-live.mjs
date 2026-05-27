import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { buildLookupCandidates, createMemoryResolutionCache, resolveDeck } from "../src/deck-resolver/resolve-deck.ts";

const decklists = {
  krrik: `
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
`,

  juri: `
1 Command Tower
1 Blood Crypt
1 Dragonskull Summit
1 Haunted Ridge
1 Sulfurous Springs
1 Canyon Slough
1 Foreboding Ruins
1 Smoldering Marsh
1 Rakdos Carnarium
1 Temple of Malice
1 Tainted Peak
1 High Market
1 Phyrexian Tower
1 Bojuka Bog
1 Myriad Landscape
1 Rogue's Passage
1 Reliquary Tower
9 Swamp
8 Mountain
1 Sol Ring
1 Arcane Signet
1 Rakdos Signet
1 Talisman of Indulgence
1 Wayfarer's Bauble
1 Mind Stone
1 Charcoal Diamond
1 Fire Diamond
1 Viscera Seer
1 Carrion Feeder
1 Goblin Bombardment
1 Witch's Oven
1 Ashnod's Altar
1 Blood Artist
1 Zulaport Cutthroat
1 Bastion of Remembrance
1 Agent of the Iron Throne
1 Mirkwood Bats
1 Mayhem Devil
1 Judith, the Scourge Diva
1 Pitiless Plunderer
1 Mahadi, Emporium Master
1 Jadar, Ghoulcaller of Nephalia
1 Reassembling Skeleton
1 Bloodghast
1 Ophiomancer
1 Pawn of Ulamog
1 Sifter of Skulls
1 Endrek Sahr, Master Breeder
1 Village Rites
1 Deadly Dispute
1 Costly Plunder
1 Plumb the Forbidden
1 Skullclamp
1 Phyrexian Arena
1 Sign in Blood
1 Night's Whisper
1 Read the Bones
1 Victimize
1 Unearth
1 Living Death
1 Feed the Swarm
1 Terminate
1 Bedevil
1 Chaos Warp
1 Deadly Rollick
1 Blasphemous Act
1 Toxic Deluge
1 Dictate of Erebos
1 Grave Pact
1 Claim the Firstborn
1 Act of Treason
1 Kazuul's Fury
1 Fling
1 Brass's Bounty
1 Pirate's Pillage
1 Unexpected Windfall
1 Big Score
1 Marionette Master
1 Nadier's Nightblade
1 Syr Konrad, the Grim
1 Bloodsoaked Champion
1 Gutterbones
1 Lightning Greaves
1 Swiftfoot Boots
`,

  lathril: `
1 Command Tower
1 Overgrown Tomb
1 Woodland Cemetery
1 Llanowar Wastes
1 Blooming Marsh
1 Darkbore Pathway
1 Necroblossom Snarl
1 Temple of Malady
1 Jungle Hollow
1 Golgari Rot Farm
1 Path of Ancestry
1 Unclaimed Territory
1 Cavern of Souls
1 Wirewood Lodge
1 Boseiju, Who Endures
1 Takenuma, Abandoned Mire
9 Forest
8 Swamp
1 Sol Ring
1 Arcane Signet
1 Golgari Signet
1 Talisman of Resilience
1 Elvish Mystic
1 Llanowar Elves
1 Fyndhorn Elves
1 Elves of Deep Shadow
1 Deathrite Shaman
1 Priest of Titania
1 Elvish Archdruid
1 Circle of Dreams Druid
1 Marwyn, the Nurturer
1 Heritage Druid
1 Wirewood Symbiote
1 Quirion Ranger
1 Elvish Warmaster
1 Imperious Perfect
1 Dwynen, Gilt-Leaf Daen
1 Canopy Tactician
1 Leaf-Crowned Visionary
1 Beast Whisperer
1 Guardian Project
1 Realmwalker
1 Harald, King of Skemfar
1 Shaman of the Pack
1 Poison-Tip Archer
1 Nadier's Nightblade
1 Moldervine Reclamation
1 Skemfar Shadowsage
1 Ezuri, Renegade Leader
1 Craterhoof Behemoth
1 Finale of Devastation
1 Overwhelming Stampede
1 Triumph of the Hordes
1 Elvish Promenade
1 Wolverine Riders
1 Lys Alana Huntmaster
1 Tyvar Kell
1 Kindred Dominance
1 Heroic Intervention
1 Tamiyo's Safekeeping
1 Golgari Charm
1 Assassin's Trophy
1 Beast Within
1 Putrefy
1 Abrupt Decay
1 Feed the Swarm
1 Casualties of War
1 Return of the Wildspeaker
1 Pact of the Serpent
1 Necropotence
1 Phyrexian Arena
1 Demonic Tutor
1 Diabolic Intent
1 Chord of Calling
1 Green Sun's Zenith
1 Worldly Tutor
1 Reclamation Sage
1 End-Raze Forerunners
1 Skullclamp
1 Lightning Greaves
1 Swiftfoot Boots
1 Wellwisher
1 Timberwatch Elf
1 Elvish Clancaller
`,

  shikoNarset: `
1 Command Tower
1 Exotic Orchard
1 Raugrin Triome
1 Mystic Monastery
1 Steam Vents
1 Sacred Foundry
1 Hallowed Fountain
1 Sulfur Falls
1 Clifftop Retreat
1 Glacial Fortress
1 Stormcarved Coast
1 Sundown Pass
1 Deserted Beach
1 Shivan Reef
1 Battlefield Forge
1 Adarkar Wastes
1 Spirebluff Canal
1 Inspiring Vantage
1 Seachrome Coast
1 Ferrous Lake
1 Perilous Landscape
4 Island
4 Mountain
4 Plains
1 Sol Ring
1 Arcane Signet
1 Azorius Signet
1 Izzet Signet
1 Boros Signet
1 Talisman of Creativity
1 Talisman of Conviction
1 Talisman of Progress
1 Impeto Brilhante
1 Onda Desmanteladora
1 Redemoinho de Pensamentos
1 Mangara, o Diplomata
1 Epifania Sublime
1 Comando de Prismari
1 Arquimago Emerito
1 Artista da Fornalha Tempestuosa
1 Velomaco Sapioforte
1 Magma Opus
1 Iteracao Expressiva
1 Veyran, Voz da Dualidade
1 Considerar
1 Lier, Discipulo dos Afogados
1 Subjugar a Horda
1 Dragao Averneo Manaforme
1 Sorte Grande
1 Genio Arrogante
1 Iconoclasta da Terceira Via
1 Baral e Kari Zev
1 Taigam, Master Opportunist
1 Adaptive Training Post
1 Aligned Heart
1 Caldera Pyremaw
1 Transcendent Dragon
1 Transforming Flourish
1 Voracious Bibliophile
1 Elsha, Threefold Master
1 Jeskai Revelation
1 Ancestral Vision
1 Goblin Electromancer
1 Guttersnipe
1 Baral's Expertise
1 Narset's Reversal
1 Tempest Technique
1 Swords to Plowshares
1 Path to Exile
1 Generous Gift
1 Chaos Warp
1 Wear // Tear
1 Cyclonic Rift
1 Supreme Verdict
1 Blasphemous Act
1 Teferi, Time Raveler
1 Narset, Parter of Veils
1 Shark Typhoon
1 Metallurgic Summonings
1 Jeskai Ascendancy
1 Monastery Mentor
1 Talrand, Sky Summoner
1 Young Pyromancer
1 Third Path Iconoclast
1 Sevinne's Reclamation
1 Past in Flames
1 Mystic Retrieval
1 Dig Through Time
1 Treasure Cruise
1 Ponder
`
};

const selected = process.argv.slice(2);
const jobs = selected.length ? await loadSelectedDecks(selected) : Object.entries(decklists);
const allResults = [];

for (const [name, deckText] of jobs) {
  allResults.push(await runLiveResolve(name, deckText));
}

console.log(JSON.stringify(allResults.length === 1 ? allResults[0] : allResults, null, 2));

async function loadSelectedDecks(args) {
  const jobs = [];
  for (const arg of args) {
    if (decklists[arg]) {
      jobs.push([arg, decklists[arg]]);
      continue;
    }

    const text = await readFile(arg, "utf8");
    jobs.push([arg, text]);
  }
  return jobs;
}

async function runLiveResolve(name, deckText) {
  const requests = [];
  const started = performance.now();
  const cache = createMemoryResolutionCache();
  const result = await resolveDeck(deckText, {
    cache,
    fetchFn: async (url, init) => {
      const target = String(url);
      const type = target.includes("/cards/collection")
        ? "scryfall_collection"
        : target.includes("/cards/named")
          ? "scryfall_fuzzy"
          : "other";
      requests.push({ type, url: target });
      return fetch(url, init);
    }
  });
  const durationMs = Math.round(performance.now() - started);

  const resolvedBy = summarizeResolvedBy(result.cards);
  const unresolved = result.unresolved.map((card) => ({
    ...card,
    candidates: buildLookupCandidates(card.inputName).map((candidate) => ({
      lookupName: candidate.lookupName,
      attempt: candidate.attempt,
      collectionSource: candidate.collectionSource
    }))
  }));

  return {
    deck: name,
    status: result.status,
    total: result.total,
    resolvedCount: result.resolvedCount,
    unresolvedCount: result.unresolvedCount,
    resolvedBy,
    resolvedCardsBySource: groupResolvedCards(result.cards),
    externalRequests: requests.length,
    externalRequestsByType: requests.reduce((acc, request) => {
      acc[request.type] = (acc[request.type] || 0) + 1;
      return acc;
    }, {}),
    durationMs,
    tooManyRequestsWarning: requests.length > 5,
    unresolved
  };
}

function summarizeResolvedBy(cards) {
  const summary = {
    local_alias: 0,
    scryfall_collection: 0,
    scryfall_fuzzy: 0,
    cache: 0,
    other: 0
  };

  for (const card of cards) {
    if (card.resolvedBy === "cache") summary.cache += card.quantity;
    else if (card.resolvedBy.includes("local_alias")) summary.local_alias += card.quantity;
    else if (card.resolvedBy.includes("fuzzy")) summary.scryfall_fuzzy += card.quantity;
    else if (card.resolvedBy.includes("collection")) summary.scryfall_collection += card.quantity;
    else summary.other += card.quantity;
  }

  return Object.fromEntries(Object.entries(summary).filter(([, count]) => count > 0));
}

function groupResolvedCards(cards) {
  const groups = {};
  for (const card of cards) {
    const source = sourceBucket(card.resolvedBy);
    groups[source] ||= [];
    groups[source].push({
      inputName: card.inputName,
      lookupName: card.lookupName,
      canonicalName: card.canonicalName,
      quantity: card.quantity
    });
  }
  return groups;
}

function sourceBucket(resolvedBy) {
  if (resolvedBy === "cache") return "cache";
  if (resolvedBy.includes("local_alias")) return "local_alias";
  if (resolvedBy.includes("fuzzy")) return "scryfall_fuzzy";
  if (resolvedBy.includes("collection")) return "scryfall_collection";
  return "other";
}
