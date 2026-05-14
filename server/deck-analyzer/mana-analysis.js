import { COLOR_LABELS, COLOR_ORDER } from "./types.js";

const BASIC_LAND_PRODUCTION = {
  Plains: "W",
  Island: "U",
  Swamp: "B",
  Mountain: "R",
  Forest: "G",
  Wastes: "C",
  Planicie: "W",
  Planície: "W",
  Ilha: "U",
  Pantano: "B",
  Pântano: "B",
  Montanha: "R",
  Floresta: "G"
};

export function buildManaAnalysis({ cards = [], commander = null, statistics = {} }) {
  const activeColors = normalizeColors([
    ...(commander?.colorIdentity || []),
    ...(statistics?.colorIdentity || []),
    ...(statistics?.colors?.deckColorIdentity || [])
  ]);
  const colorsForAny = activeColors.length ? activeColors : COLOR_ORDER.filter((color) => color !== "C");
  const demand = buildEmptyColorMap();
  const production = buildEmptyColorMap();
  let totalDemandPips = 0;
  let totalProductionSources = 0;
  let tappedLands = 0;
  let utilityLands = 0;
  let rocks = 0;
  let manaCreatures = 0;
  let landRamp = 0;
  let treasures = 0;

  for (const card of cards) {
    const quantity = Number(card.quantity || 0);
    if (!quantity || card.databaseStatus === "unknown") continue;

    const isLand = hasType(card, "Land");
    const tags = new Set(card.tags || []);
    const oracleText = String(card.oracleText || "");

    if (!isLand) {
      const demandColors = normalizeColors(card.colors?.length ? card.colors : card.colorIdentity || []);
      const estimatedPips = Math.max(1, demandColors.length);
      for (const color of demandColors) {
        demand[color].cards += quantity;
        demand[color].pips += quantity * estimatedPips;
        totalDemandPips += quantity * estimatedPips;
      }
    }

    const producedColors = inferProducedColors(card, colorsForAny);
    if (producedColors.length) {
      for (const color of producedColors) {
        production[color].sources += quantity;
        production[color].mana += quantity;
        totalProductionSources += quantity;
      }
    }

    if (isLand && /enters? (the battlefield )?tapped/i.test(oracleText)) tappedLands += quantity;
    if (isLand && !producedColors.length) utilityLands += quantity;
    if (tags.has("artifact_ramp") || (tags.has("permanent_ramp") && hasType(card, "Artifact"))) rocks += quantity;
    if (tags.has("creature_ramp")) manaCreatures += quantity;
    if (tags.has("land_ramp")) landRamp += quantity;
    if (/treasure token/i.test(oracleText)) treasures += quantity;
  }

  for (const color of COLOR_ORDER) {
    demand[color].percentage = totalDemandPips ? round(demand[color].pips / totalDemandPips) : 0;
    production[color].percentage = totalProductionSources ? round(production[color].sources / totalProductionSources) : 0;
  }

  return {
    colorDemand: demand,
    colorProduction: production,
    sourceSummary: {
      tappedLands,
      utilityLands,
      fixing: statistics?.mana?.manaFixing || 0,
      rocks,
      manaCreatures,
      landRamp,
      treasures,
      burstMana: statistics?.mana?.burstMana || 0,
      costReducers: statistics?.mana?.costReducers || 0
    },
    interpretation: buildManaInterpretation({ activeColors, demand, production, statistics, tappedLands, utilityLands })
  };
}

function inferProducedColors(card, colorsForAny) {
  const colors = new Set();
  const name = String(card.displayName || card.canonicalName || card.inputName || "");
  const typeLine = String(card.typeLine || "");
  const text = String(card.oracleText || "");
  const tags = new Set(card.tags || []);

  for (const [landName, color] of Object.entries(BASIC_LAND_PRODUCTION)) {
    if (name === landName || typeLine.includes(`— ${landName}`) || typeLine.includes(`- ${landName}`)) colors.add(color);
  }

  const addClauses = text.match(/Add [^.]+/gi) || [];
  for (const clause of addClauses) {
    if (/any color|one mana of any color/i.test(clause)) colorsForAny.forEach((color) => colors.add(color));
    for (const color of COLOR_ORDER) {
      if (clause.includes(`{${color}}`)) colors.add(color);
    }
  }

  if (!colors.size && tags.has("mana_fixing")) {
    const identityColors = normalizeColors(card.colorIdentity || []);
    if (identityColors.length) identityColors.forEach((color) => colors.add(color));
  }

  if (!colors.size && hasType(card, "Land") && (card.colorIdentity || []).length) {
    normalizeColors(card.colorIdentity).forEach((color) => colors.add(color));
  }

  return normalizeColors([...colors]);
}

function buildManaInterpretation({ activeColors, demand, production, statistics, tappedLands, utilityLands }) {
  const lines = [];
  for (const color of activeColors) {
    const label = COLOR_LABELS[color] || color;
    const demandPct = demand[color]?.percentage || 0;
    const productionPct = production[color]?.percentage || 0;
    const sources = production[color]?.sources || 0;

    if (demandPct > productionPct + 0.12) {
      lines.push(`A demanda por ${label.toLowerCase()} parece acima da producao detectada; teste maos iniciais que precisam dessa cor cedo.`);
    } else if (sources >= 10 || productionPct >= demandPct) {
      lines.push(`A producao de ${label.toLowerCase()} acompanha bem a demanda estimada.`);
    }
  }

  if ((statistics?.colors?.deckColorIdentity || []).length >= 3 && (statistics?.mana?.manaFixing || 0) < 6) {
    lines.push("Por ser um deck com tres ou mais cores, o fixing merece atencao nos testes de mao inicial.");
  }
  if (tappedLands >= 10) lines.push("Ha muitos terrenos que entram virados; isso pode atrasar turnos importantes se a curva pede desenvolvimento cedo.");
  if (utilityLands >= 5) lines.push("Os terrenos utilitarios aparecem em volume relevante; confirme se eles nao estao roubando fontes coloridas.");
  if (!lines.length) lines.push("A mana nao mostrou um desequilibrio claro, mas a leitura ainda depende do catalogo local e de testes de mao inicial.");
  return lines;
}

function buildEmptyColorMap() {
  return Object.fromEntries(COLOR_ORDER.map((color) => [color, { pips: 0, cards: 0, sources: 0, mana: 0, percentage: 0 }]));
}

function normalizeColors(colors = []) {
  const set = new Set((Array.isArray(colors) ? colors : []).map((color) => String(color).toUpperCase()).filter((color) => COLOR_ORDER.includes(color)));
  return COLOR_ORDER.filter((color) => set.has(color));
}

function hasType(card, type) {
  return Array.isArray(card.cardTypes) && card.cardTypes.includes(type);
}

function round(value) {
  return Number(value.toFixed(3));
}
