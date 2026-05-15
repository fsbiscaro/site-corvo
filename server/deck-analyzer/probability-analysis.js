const DEFAULT_ODDS = [
  { key: "openingRamp", category: "Ramp", source: "ramp", cardsDrawn: 7, wantedAtLeast: 1, label: "Chance de abrir com pelo menos 1 ramp" },
  { key: "drawByTurn4", category: "Compra", source: "cardDraw", cardsDrawn: 10, wantedAtLeast: 1, label: "Chance de encontrar pelo menos 1 compra ate comprar 10 cartas" },
  { key: "interactionByTurn5", category: "Interacao", source: "interaction", cardsDrawn: 12, wantedAtLeast: 1, label: "Chance de encontrar pelo menos 1 interacao ate comprar 12 cartas" },
  { key: "protectionByTurn5", category: "Protecao", source: "protection", cardsDrawn: 12, wantedAtLeast: 1, label: "Chance de encontrar pelo menos 1 protecao ate comprar 12 cartas" },
  { key: "payoffByTurn6", category: "Payoff", source: "payoffs", cardsDrawn: 13, wantedAtLeast: 1, label: "Chance de encontrar pelo menos 1 payoff ate comprar 13 cartas" }
];

export function buildProbabilityAnalysis({ statistics }) {
  const deckSize = Math.max(1, Number(statistics?.totalCardsInDecklist || 0));
  const categoryCounts = {
    ramp: statistics?.mana?.permanentRamp || 0,
    cardDraw: (statistics?.functions?.cardDraw || 0) + (statistics?.functions?.cardSelection || 0),
    interaction: statistics?.functions?.interaction || 0,
    protection: statistics?.functions?.protection || 0,
    payoffs: (statistics?.functions?.finishers || 0) + (statistics?.functions?.drain || 0) + (statistics?.tagCounts?.payoff || 0)
  };

  const drawOdds = DEFAULT_ODDS.map((item) => {
    const count = Math.min(deckSize, Math.max(0, Number(categoryCounts[item.source] || 0)));
    const probability = calculateHypergeometricProbability({
      deckSize,
      successCount: count,
      cardsDrawn: item.cardsDrawn,
      wantedAtLeast: item.wantedAtLeast
    });

    return {
      key: item.key,
      category: item.category,
      count,
      cardsDrawn: Math.min(deckSize, item.cardsDrawn),
      atLeast: item.wantedAtLeast,
      wantedAtLeast: item.wantedAtLeast,
      probability,
      percentage: Math.round(probability * 100),
      label: item.label
    };
  });

  return { deckSize, categoryCounts, drawOdds };
}

export function calculateHypergeometricProbability({ deckSize, successCount, cardsDrawn, wantedAtLeast = 1 }) {
  const population = Math.max(0, Math.floor(Number(deckSize || 0)));
  const successes = clampInteger(successCount, 0, population);
  const draws = clampInteger(cardsDrawn, 0, population);
  const minimum = clampInteger(wantedAtLeast, 0, draws);

  if (!population || !draws) return minimum <= 0 ? 1 : 0;
  if (!successes) return minimum <= 0 ? 1 : 0;
  if (minimum <= 0) return 1;

  const maxHits = Math.min(successes, draws);
  if (minimum > maxHits) return 0;

  let probability = 0;
  const denominator = logCombination(population, draws);
  for (let hits = minimum; hits <= maxHits; hits += 1) {
    const misses = draws - hits;
    if (misses > population - successes) continue;
    probability += Math.exp(logCombination(successes, hits) + logCombination(population - successes, misses) - denominator);
  }

  return Number(Math.max(0, Math.min(1, probability)).toFixed(4));
}

function logCombination(n, k) {
  if (k < 0 || k > n) return -Infinity;
  const smaller = Math.min(k, n - k);
  let total = 0;
  for (let i = 1; i <= smaller; i += 1) {
    total += Math.log(n - smaller + i) - Math.log(i);
  }
  return total;
}

function clampInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.floor(Number(value || 0))));
}
