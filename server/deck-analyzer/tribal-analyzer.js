import { GENERIC_TRIBES } from "./types.js";

export function buildTribalSummary({ cards = [], commanderProfile = null }) {
  const creatureCards = cards.filter((card) => card.databaseStatus === "found" && card.cardTypes?.includes("Creature"));
  if (!creatureCards.length) return null;

  const subtypeCounts = new Map();
  for (const card of creatureCards) {
    for (const subtype of card.subtypes || []) {
      subtypeCounts.set(subtype, (subtypeCounts.get(subtype) || 0) + Number(card.quantity || 0));
    }
  }

  const profileTribe = commanderProfile?.tribe || null;
  const inferredTribe = choosePrimaryTribe(subtypeCounts);
  const primaryTribe = profileTribe || inferredTribe;
  if (!primaryTribe) return null;

  const totalCreatures = sumQuantities(creatureCards);
  const tribalCreatures = sumQuantities(creatureCards.filter((card) => hasSubtype(card, primaryTribe)));
  const tribalCreatureRatio = totalCreatures ? Number((tribalCreatures / totalCreatures).toFixed(3)) : 0;

  if (!profileTribe && (tribalCreatureRatio < 0.4 || tribalCreatures < 8)) return null;

  const tribalCards = cards.filter((card) => isTribalRelevant(card, primaryTribe));
  const tribalCreatureCards = creatureCards.filter((card) => hasSubtype(card, primaryTribe));

  return {
    primaryTribe,
    totalCreatures,
    tribalCreatures,
    nonTribalCreatures: Math.max(0, totalCreatures - tribalCreatures),
    tribalCreatureRatio,
    tribalNonCreatureCards: sumQuantities(tribalCards.filter((card) => !card.cardTypes?.includes("Creature"))),
    tribalLords: countByTags(tribalCards, ["lord"]),
    tribalAnthems: countByTags(tribalCards, ["anthem"]),
    tribalTokenGenerators: countByTags(tribalCards, ["tribal_token_generator", "token_generator"]),
    tribalPayoffs: countByTags(tribalCards, ["tribal_payoff", "payoff", "drain"]),
    tribalRampPieces: countByTags(tribalCreatureCards, ["creature_ramp", "permanent_ramp", "ramp"]),
    tribalFinishers: countByTags(tribalCards, ["finisher", "payoff", "tribal_payoff"]),
    tribalProtection: countByTags(tribalCards, ["protection"]),
    tribalCardDraw: countByTags(tribalCards, ["card_draw", "card_selection"]),
    supportingCards: tribalCards.map((card) => card.displayName || card.canonicalName || card.inputName).slice(0, 12)
  };
}

function choosePrimaryTribe(subtypeCounts) {
  let best = null;
  for (const [subtype, count] of subtypeCounts.entries()) {
    if (GENERIC_TRIBES.has(subtype) && count < 10) continue;
    if (!best || count > best.count) best = { subtype, count };
  }
  return best?.subtype || null;
}

function hasSubtype(card, subtype) {
  return (card.subtypes || []).includes(subtype);
}

function isTribalRelevant(card, subtype) {
  if (hasSubtype(card, subtype)) return true;
  const text = `${card.oracleText || ""} ${card.typeLine || ""} ${card.displayName || ""}`.toLowerCase();
  return text.includes(subtype.toLowerCase());
}

function countByTags(cards, tags) {
  return sumQuantities(cards.filter((card) => card.tags?.some((tag) => tags.includes(tag))));
}

function sumQuantities(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}
