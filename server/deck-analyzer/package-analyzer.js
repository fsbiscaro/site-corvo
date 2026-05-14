export function buildPackageAnalysis({ statistics, manaAnalysis, probabilityAnalysis, cardRoles, commanderProfile, tribalSummary, winconSummary }) {
  const packages = [
    manaDevelopmentPackage(statistics, manaAnalysis),
    simplePackage({
      id: "card_advantage",
      label: "Compra e valor",
      count: (statistics.functions.cardDraw || 0) + (statistics.functions.cardSelection || 0),
      good: 8,
      low: 5,
      high: 15,
      weakText: "O deck pode ficar sem mao depois das primeiras trocas.",
      okText: "Ha folego minimo para reconstruir recursos.",
      strongText: "O pacote de valor parece robusto.",
      excessText: "Pode haver compra demais se faltar payoff ou protecao."
    }),
    simplePackage({
      id: "interaction",
      label: "Interacao",
      count: statistics.functions.interaction || 0,
      good: 8,
      low: 5,
      high: 16,
      weakText: "A lista pode perder para permanentes ou combos sem conseguir responder.",
      okText: "Existe um pacote basico de respostas.",
      strongText: "A densidade de respostas esta confortavel.",
      excessText: "Interacao demais pode diluir o plano se as respostas forem muito condicionais."
    }),
    protectionPackage(statistics, commanderProfile),
    winConditionPackage(winconSummary, statistics),
    synergyPackage(commanderProfile, tribalSummary, statistics),
    optionalPackage("sacrifice", "Sacrificio", statistics.functions.sacrificeOutlets || 0, statistics.tagCounts.sacrifice || 0),
    optionalPackage("graveyard", "Cemiterio", statistics.functions.recursion || 0, statistics.tagCounts.graveyard_synergy || 0),
    optionalPackage("tokens", "Fichas", statistics.functions.tokenGenerators || 0, statistics.functions.finishers || 0),
    optionalPackage("hate", "Respostas especificas", (statistics.functions.graveyardHate || 0) + (statistics.functions.artifactHate || 0) + (statistics.functions.enchantmentHate || 0), statistics.functions.interaction || 0)
  ].filter(Boolean);

  return packages.map((item) => ({
    ...item,
    relatedCards: relatedCardsForPackage(item.id, cardRoles)
  }));
}

function protectionPackage(statistics, commanderProfile) {
  const count = statistics.functions.protection || 0;
  let status = "ok";
  if (count <= 1) status = "weak";
  else if (count >= 5) status = "strong";
  else if (count >= 3) status = "ok";

  return {
    id: "protection",
    label: "Protecao",
    count,
    status,
    interpretation: count <= 1
      ? "Protecao baixa para comandante, motor ou peca-chave."
      : count === 2
        ? "Duas protecoes ajudam, mas ainda ficam no limite baixo para Commander."
        : count <= 4
          ? "Pacote de protecao funcional, mas ainda precisa ser testado contra mesas com muita remocao."
          : "Protecao forte para preservar comandante e pecas importantes.",
    risk: count <= 2 || commanderProfile?.wantsProtection
      ? "Se o plano depende do comandante ou de engines, remocoes pontuais podem quebrar seu ritmo."
      : "Categoria em faixa funcional.",
    action: count <= 2
      ? "Teste se o deck perde quando removem comandante/outlet/payoff; se sim, suba para 3-4 protecoes."
      : "Mantenha em observacao nos testes."
  };
}

function manaDevelopmentPackage(statistics, manaAnalysis) {
  const ramp = (statistics.mana.permanentRamp || 0) + (statistics.mana.creatureRamp || 0) + (statistics.mana.landRamp || 0);
  const lands = statistics.types.lands || 0;
  let status = "ok";
  if (lands < 34 || ramp < 7) status = "weak";
  else if (lands >= 34 && lands <= 38 && ramp >= 8 && ramp <= 13) status = "strong";
  else if (ramp >= 16) status = "excess";

  return {
    id: "mana_development",
    label: "Desenvolvimento de mana",
    count: ramp,
    status,
    interpretation: `${lands} terrenos e ${ramp} aceleradores persistentes detectados.`,
    risk: status === "weak"
      ? "O deck pode atrasar desenvolvimento ou ficar preso em cores."
      : status === "excess"
        ? "Ramp demais pode virar compra ruim no late game se faltar payoff."
        : "A base parece jogavel, mas precisa ser testada em maos iniciais.",
    action: status === "weak"
      ? "Reforce terrenos, rocks e fixing antes de upgrades caros."
      : (manaAnalysis?.interpretation || [])[0] || "Teste maos iniciais e acompanhe se as cores aparecem ate o turno 3."
  };
}

function winConditionPackage(winconSummary, statistics) {
  const count = (winconSummary?.primaryWincons || []).length;
  const status = winconSummary?.missingWinconWarning ? "weak" : count >= 2 ? "strong" : "ok";
  return {
    id: "win_conditions",
    label: "Condicoes de vitoria",
    count,
    status,
    interpretation: count
      ? `Linhas principais: ${winconSummary.primaryWincons.map((item) => item.label).join(", ")}.`
      : "Nenhuma linha de finalizacao ficou clara pelos dados atuais.",
    risk: status === "weak" ? "O deck pode estabilizar a mesa e ainda assim demorar para ganhar." : "As linhas de vitoria existem; agora vale medir consistencia.",
    action: status === "weak" ? "Escolha um plano de fechamento e aumente a densidade de cartas que convertem vantagem em vitoria." : "Teste se essas linhas aparecem em partidas reais."
  };
}

function synergyPackage(commanderProfile, tribalSummary, statistics) {
  if (!commanderProfile && !tribalSummary) return null;
  const count = tribalSummary?.tribalCreatures || Object.keys(commanderProfile?.importantCounts || {}).reduce((sum, tag) => sum + (statistics.tagCounts[tag] || 0), 0);
  const status = commanderProfile?.tribe && tribalSummary?.tribalCreatureRatio < 0.55 ? "weak" : count >= 12 ? "strong" : "ok";
  return {
    id: "commander_synergy",
    label: "Sinergia com comandante",
    count,
    status,
    interpretation: commanderProfile?.expectedGamePlan || "A sinergia principal veio da densidade de tags e tribo detectada.",
    risk: status === "weak" ? "O comandante pode entrar em campo sem cartas suficientes que explorem seu texto." : "O plano do comandante aparece na lista.",
    action: status === "weak" ? "Aumente cartas que ativam diretamente o comandante antes de upgrades genericos." : "Separe nucleo e slots flexiveis para lapidar sem quebrar o plano."
  };
}

function optionalPackage(id, label, count, contextCount) {
  if (!count && !contextCount) return null;
  const status = count >= 6 ? "strong" : count >= 3 ? "ok" : "needs_review";
  return {
    id,
    label,
    count,
    status,
    interpretation: `${count} peca(s) principais detectadas nesse pacote.`,
    risk: status === "needs_review" ? "A presenca e pequena demais para definir o deck, mas pode ser suporte pontual." : "O pacote tem densidade suficiente para influenciar o plano.",
    action: status === "needs_review" ? "Decida se esse subtema merece mais slots ou se deve virar corte." : "Teste se o pacote aparece junto das cartas que realmente aproveitam essa funcao."
  };
}

function simplePackage({ id, label, count, good, low, high, weakText, okText, strongText, excessText }) {
  let status = "ok";
  if (count < low) status = "weak";
  else if (count >= high) status = "excess";
  else if (count >= good) status = "strong";

  return {
    id,
    label,
    count,
    status,
    interpretation: status === "weak" ? weakText : status === "strong" ? strongText : status === "excess" ? excessText : okText,
    risk: status === "weak" ? "Categoria abaixo do piso recomendado." : status === "excess" ? "Categoria pode estar ocupando slots demais." : "Categoria em faixa funcional.",
    action: status === "weak" ? "Priorize reforcar esse pacote nos proximos ajustes." : status === "excess" ? "Revise redundancias e transforme excesso em payoff, protecao ou compra." : "Mantenha em observacao nos testes."
  };
}

function relatedCardsForPackage(id, cardRoles) {
  const cards = cardRoles?.cards || [];
  const map = {
    mana_development: ["ramp", "support"],
    card_advantage: ["card_advantage"],
    interaction: ["interaction"],
    protection: ["protection"],
    win_conditions: ["payoff", "engine", "finisher"],
    commander_synergy: ["core", "enabler", "engine", "payoff"],
    sacrifice: ["core", "enabler", "engine", "payoff"],
    graveyard: ["card_advantage", "support"],
    tokens: ["enabler", "payoff"],
    hate: ["interaction"]
  };
  return cards.filter((card) => (map[id] || []).includes(card.role)).slice(0, 6).map((card) => card.name);
}
