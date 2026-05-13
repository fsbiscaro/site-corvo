import { COMMANDER_FORMATS, FORMAT_RULES } from "./types.js";

export function normalizeFormat(format) {
  return String(format || "casual").trim().toLowerCase().replace(/[\s-]+/g, "_") || "casual";
}

export function formatLabel(format) {
  return ({
    commander: "Commander",
    brawl: "Brawl",
    historic_brawl: "Historic Brawl",
    standard: "Standard",
    pioneer: "Pioneer",
    historic: "Historic",
    casual: "Casual"
  })[format] || format;
}

export function expectedMainboardSize(format) {
  return FORMAT_RULES[format]?.deckSize || 60;
}

export function expectedTotalSize(format) {
  return FORMAT_RULES[format]?.totalWithCommander || expectedMainboardSize(format);
}

export function validateFormatRules({ format, commander, statistics, cards, parsedDeck }) {
  const normalizedFormat = normalizeFormat(format);
  const rules = FORMAT_RULES[normalizedFormat] || FORMAT_RULES.casual;
  const blockingErrors = [];
  const warnings = [];
  const singletonViolations = [];
  const duplicateCommanderInMainboard = commanderAppearsInMainboard(commander, cards);

  if (rules.requiresCommander && !commander?.displayName) {
    blockingErrors.push({
      code: "COMMANDER_REQUIRED",
      severity: "critical",
      message: "Selecione um comandante antes de analisar o deck.",
      evidence: "O formato escolhido exige um comandante separado.",
      suggestion: "Escolha o comandante no campo dedicado antes de enviar a lista."
    });
    return { blockingErrors, warnings, singletonViolations };
  }

  if (rules.requiresCommander && commander?.canBeCommander === false) {
    blockingErrors.push({
      code: "COMMANDER_NOT_LEGAL",
      severity: "critical",
      message: "A carta selecionada nao parece valida como comandante.",
      evidence: `A carta ${commander.displayName} nao foi marcada como lendaria de criatura no catalogo.`,
      suggestion: "Confirme o comandante ou escolha outra carta."
    });
  }

  if (rules.requiresCommander) {
    const missingColors = statistics.colors.deckColorIdentity.filter((color) => !commander.colorIdentity.includes(color));
    if (missingColors.length) {
      blockingErrors.push({
        code: "COMMANDER_COLOR_IDENTITY_MISMATCH",
        severity: "critical",
        message: "A identidade de cor do deck nao cabe no comandante selecionado.",
        evidence: `O deck usa ${missingColors.join(", ")}, mas ${commander.displayName} permite ${commander.colorIdentity.join(", ") || "nenhuma cor"}.`,
        suggestion: "Remova cartas fora da identidade de cor ou troque o comandante."
      });
    }
  }

  if (duplicateCommanderInMainboard) {
    warnings.push({
      code: "COMMANDER_INCLUDED_IN_DECKLIST",
      severity: "warning",
      message: "O comandante selecionado tambem aparece na decklist.",
      evidence: `Foi encontrada uma copia de ${commander.displayName} entre as ${statistics.totalCardsInDecklist} cartas da lista.`,
      suggestion: "Deixe o comandante apenas no campo separado para manter a contagem correta das 99 cartas."
    });
  }

  if (rules.requiresCommander && statistics.totalCardsInDecklist !== rules.deckSize) {
    warnings.push({
      code: statistics.totalCardsInDecklist < rules.deckSize ? "COMMANDER_DECK_TOO_SMALL" : "COMMANDER_DECK_TOO_LARGE",
      severity: "warning",
      message: `A lista deveria ter ${rules.deckSize} cartas sem contar o comandante.`,
      evidence: `Foram detectadas ${statistics.totalCardsInDecklist} cartas no mainboard e ${sumQuantities(parsedDeck?.commander)} carta(s) na secao Commander.`,
      suggestion: "Ajuste a lista para bater a contagem do formato sem colocar o comandante dentro das 99."
    });
  }

  if (!rules.requiresCommander && statistics.totalCardsInDecklist < rules.deckSize) {
    warnings.push({
      code: "MAINBOARD_TOO_SMALL",
      severity: "warning",
      message: `O mainboard tem menos de ${rules.deckSize} cartas.`,
      evidence: `Foram detectadas ${statistics.totalCardsInDecklist} cartas.`,
      suggestion: "Complete o mainboard antes de avaliar a consistencia do plano."
    });
  }

  if ((statistics.sideboardCards || 0) > (rules.sideboardMax || 0)) {
    warnings.push({
      code: "SIDEBOARD_TOO_LARGE",
      severity: "warning",
      message: `O sideboard passou do limite de ${rules.sideboardMax || 0} cartas.`,
      evidence: `Foram detectadas ${statistics.sideboardCards || 0} cartas no sideboard.`,
      suggestion: "Corte o sideboard para caber no formato."
    });
  }

  if (rules.singleton) {
    const duplicates = findSingletonViolations(cards);
    singletonViolations.push(...duplicates);
    if (duplicates.length) {
      warnings.push({
        code: "SINGLETON_VIOLATION",
        severity: "warning",
        message: "A lista tem repeticoes fora das excecoes basicas do formato singleton.",
        evidence: duplicates.slice(0, 5).map((item) => `${item.name} x${item.quantity}`).join(", "),
        suggestion: "Mantenha apenas uma copia de cada carta que nao seja terreno basico."
      });
    }
  }

  return { blockingErrors, warnings, singletonViolations };
}

function commanderAppearsInMainboard(commander, cards = []) {
  if (!commander?.displayName) return false;
  const commanderNames = new Set([commander.inputName, commander.displayName, commander.canonicalName, commander.frontName].filter(Boolean));
  const normalizedNames = new Set([...commanderNames].map(normalizeLoose));
  return (cards || []).some((card) => normalizedNames.has(normalizeLoose(card.inputName || card.canonicalName || card.name)));
}

function findSingletonViolations(cards = []) {
  return (cards || [])
    .filter((card) => Number(card.quantity || 0) > 1 && !card.tags?.includes("basic_land"))
    .map((card) => ({ name: card.displayName || card.canonicalName || card.inputName, quantity: Number(card.quantity || 0) }));
}

function normalizeLoose(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/,\-: ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sumQuantities(cards = []) {
  return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
}
