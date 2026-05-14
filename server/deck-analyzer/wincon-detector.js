import { WINCON_LABELS } from "./types.js";

export function detectWincons({ statistics, tribalSummary, commanderProfile, commander }) {
  const wincons = [];
  const tagCounts = statistics.tagCounts || {};

  maybePush(wincons, "go_wide", scoreGoWide(statistics, tribalSummary, commanderProfile), [
    tribalSummary?.tribalCreatures ? `${tribalSummary.tribalCreatures} criaturas da tribo principal.` : null,
    (statistics.functions?.tokenGenerators || 0) > 0 ? `${statistics.functions.tokenGenerators} geradores de ficha detectados.` : null,
    (tribalSummary?.tribalAnthems || 0) > 0 ? `${tribalSummary.tribalAnthems} buffs/lords tribais detectados.` : null
  ]);

  maybePush(wincons, "tokens", scoreTokens(statistics, commanderProfile), [
    `${statistics.functions?.tokenGenerators || 0} geradores de ficha detectados.`,
    commanderProfile?.winconHints?.includes("tokens") ? "O profile do comandante pede mesa ampla com fichas." : null
  ]);

  maybePush(wincons, "drain", scoreDrain(statistics, commanderProfile), [
    `${statistics.functions?.drain || 0} peças de drain detectadas.`,
    commanderProfile?.winconHints?.includes("drain") ? "O profile do comandante aponta para dano indireto/drain." : null
  ]);

  maybePush(wincons, "combo", scoreCombo(statistics, commanderProfile), [
    `${statistics.functions?.tutors || 0} tutores detectados.`,
    `${statistics.mana?.burstMana || 0} peças de mana explosiva detectadas.`,
    commander?.displayName?.includes("K'rrik") ? "K'rrik converte vida em aceleração, o que aumenta a chance de combo." : null
  ]);

  maybePush(wincons, "big_mana", scoreBigMana(statistics, commanderProfile), [
    `${statistics.mana?.permanentRamp || 0} ramp permanente detectado.`,
    `${statistics.mana?.burstMana || 0} peças de mana explosiva detectadas.`,
    commanderProfile?.winconHints?.includes("big_mana") ? "O profile do comandante aceita linhas de big mana." : null
  ]);

  maybePush(wincons, "combat_damage_value", scoreCombatValue(statistics, commanderProfile, tagCounts), [
    `${tagCounts.combat_damage_trigger || 0} gatilhos de dano de combate detectados.`,
    `${statistics.creatures?.evasiveCreatures || 0} criaturas evasivas detectadas.`
  ]);

  if (!wincons.length && commanderProfile?.winconHints?.length) {
    maybePush(wincons, commanderProfile.winconHints[0], 0.45, ["O profile do comandante indica esse eixo, mas a lista ainda precisa de evidencias mais fortes."]);
  }

  return {
    primaryWincons: wincons.slice(0, 4),
    missingWinconWarning: !wincons.some((item) => item.confidence >= 0.6)
  };
}

function maybePush(list, type, confidence, evidence) {
  if (confidence < 0.45) return;
  list.push({
    type,
    label: WINCON_LABELS[type] || type,
    confidence: Number(confidence.toFixed(2)),
    evidence: evidence.filter(Boolean)
  });
  list.sort((a, b) => b.confidence - a.confidence);
}

function scoreGoWide(statistics, tribalSummary, commanderProfile) {
  let score = 0;
  if ((statistics.types?.creatures || 0) >= 28) score += 0.2;
  if ((statistics.functions?.tokenGenerators || 0) >= 3) score += 0.2;
  if ((tribalSummary?.tribalAnthems || 0) + (tribalSummary?.tribalLords || 0) >= 2) score += 0.2;
  if ((tribalSummary?.tribalCreatureRatio || 0) >= 0.65) score += 0.15;
  if (commanderProfile?.winconHints?.includes("go_wide")) score += 0.15;
  return score;
}

function scoreTokens(statistics, commanderProfile) {
  let score = 0;
  if ((statistics.functions?.tokenGenerators || 0) >= 2) score += 0.25;
  if ((statistics.tagCounts?.tribal_token_generator || 0) >= 1) score += 0.2;
  if (commanderProfile?.winconHints?.includes("tokens")) score += 0.2;
  return score;
}

function scoreDrain(statistics, commanderProfile) {
  let score = 0;
  if ((statistics.functions?.drain || 0) >= 1) score += 0.3;
  if ((statistics.tagCounts?.lifegain || 0) >= 2) score += 0.1;
  if (commanderProfile?.winconHints?.includes("drain")) score += 0.2;
  return score;
}

function scoreCombo(statistics, commanderProfile) {
  let score = 0;
  const explicitPieces = statistics.tagCounts?.combo_piece || 0;
  const profileCombo = commanderProfile?.winconHints?.includes("combo");
  if (!profileCombo && explicitPieces < 2) return 0;
  if (explicitPieces >= 2) score += 0.35;
  if ((statistics.functions?.tutors || 0) >= 2) score += 0.15;
  if ((statistics.functions?.cardDraw || 0) >= 6) score += 0.1;
  if ((statistics.mana?.burstMana || 0) >= 2 || (statistics.tagCounts?.ritual || 0) >= 2) score += 0.15;
  if (profileCombo) score += 0.15;
  return score;
}

function scoreBigMana(statistics, commanderProfile) {
  let score = 0;
  if ((statistics.mana?.permanentRamp || 0) >= 7) score += 0.2;
  if ((statistics.mana?.burstMana || 0) >= 1) score += 0.1;
  if ((statistics.mana?.averageManaValue || 0) >= 3.2) score += 0.1;
  if (commanderProfile?.winconHints?.includes("big_mana")) score += 0.2;
  return score;
}

function scoreCombatValue(statistics, commanderProfile, tagCounts) {
  let score = 0;
  if ((statistics.creatures?.evasiveCreatures || 0) >= 6) score += 0.2;
  if ((tagCounts.combat_damage_trigger || 0) >= 2) score += 0.2;
  if ((tagCounts.ninjutsu || 0) >= 3) score += 0.15;
  if (commanderProfile?.winconHints?.includes("combat_damage_value")) score += 0.15;
  return score;
}
