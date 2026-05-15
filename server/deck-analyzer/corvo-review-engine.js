export function buildCorvoReview({ commander, statistics, manaAnalysis, probabilityAnalysis, cardRoles, packages, winconSummary, archetype, strategy, tribalSummary, score, diagnostics, externalBenchmark }) {
  const commanderName = commander?.displayName || "seu comandante";
  const mainWincon = winconSummary?.primaryWincons?.[0]?.label || "vantagem acumulada";
  const strategyName = strategy?.primaryArchetype?.label || archetype?.primary || "plano ainda em construcao";
  const rampOdds = findOdds(probabilityAnalysis, "openingRamp");
  const drawOdds = findOdds(probabilityAnalysis, "drawByTurn4");
  const weakPackages = (packages || []).filter((item) => ["weak", "needs_review"].includes(item.status));
  const excessPackages = (packages || []).filter((item) => item.status === "excess");

  return {
    summary: buildSummary({ commanderName, statistics, archetype, strategy, weakPackages, score, externalBenchmark }),
    commanderUnderstanding: commander
      ? `${commanderName} pede que a lista transforme o texto do comandante em repeticao de valor, pressao ou fechamento. O motor estrategico leu esse plano como ${strategyName}.`
      : "Sem comandante selecionado, a leitura fica mais parecida com avaliacao estrutural do que com consultoria de Commander.",
    planA: strategy?.planA || `Plano A: desenvolver mana, colocar as pecas que sustentam ${strategyName} e converter isso em ${mainWincon.toLowerCase()}.`,
    planB: strategy?.planB || buildPlanB({ statistics, winconSummary, cardRoles }),
    howItWins: strategy?.winConditions?.length ? strategy.winConditions : buildHowItWins(winconSummary, cardRoles),
    manaBaseReview: buildManaBaseReview(statistics, manaAnalysis),
    curveReview: buildCurveReview(statistics),
    rampReview: buildRampReview(statistics, rampOdds),
    interactionReview: buildInteractionReview(statistics),
    protectionReview: buildProtectionReview(statistics, diagnostics),
    cardAdvantageReview: buildCardAdvantageReview(statistics, drawOdds),
    commanderDependency: buildCommanderDependency(commander, statistics, cardRoles),
    coreCards: simplifyCards(cardRoles?.coreCards || cardRoles?.payoffs || []),
    supportCards: simplifyCards(cardRoles?.supportCards || []),
    flexCards: simplifyCards(cardRoles?.flexCards || []),
    suspiciousCards: simplifyCards(cardRoles?.suspiciousCards || []),
    cutCandidates: simplifyCards(cardRoles?.cutCandidates || []),
    upgradePriorities: buildUpgradePriorities({ weakPackages, excessPackages, diagnostics }),
    mulliganGuide: buildMulliganGuide({ statistics, rampOdds, commanderName }),
    matchups: buildMatchups({ statistics, packages, archetype, strategy }),
    testingPlan: buildTestingPlan({ statistics, weakPackages, excessPackages, strategy }),
    finalVerdict: buildFinalVerdict({ score, weakPackages, statistics })
  };
}

function buildSummary({ commanderName, statistics, archetype, strategy, weakPackages, score, externalBenchmark }) {
  if (strategy?.primaryArchetype?.id === "aristocrats_sacrifice") {
    const payoffs = statistics.functions?.payoffs || 0;
    const outlets = statistics.functions?.sacrificeOutlets || 0;
    const treasures = (statistics.mana?.treasureOneShot || 0) + (statistics.mana?.treasureRecurring || 0);
    return `Esse ${commanderName} já tem a espinha dorsal de Rakdos Aristocrats: ${outlets} outlets, payoffs de morte/drain e recursos pequenos para transformar em valor. O ponto de atenção é medir se esse motor realmente mata ou se só estabiliza a mesa. Se o deck fica com mana e tesouros sobrando, eu testaria trocar parte do excesso de valor por mais payoff, proteção ou uma forma limpa de sacrificar o Juri grande no momento certo. Leitura local: ${score?.final ?? "-"}/10, com ${statistics.recognizedCards}/${statistics.totalCardsInDecklist} cartas reconhecidas.`;
  }
  const benchmarkText = externalBenchmark?.status === "available"
    ? " Tambem existe contexto externo para comparar escolhas com bases de decks publicados."
    : "";
  const plan = strategy?.primaryArchetype?.label || archetype?.primary || "um plano ainda em construcao";
  const confidence = strategy?.confidenceLevel ? ` Confiança estratégica: ${confidenceLabel(strategy.confidenceLevel)}.` : "";
  const weakText = weakPackages.length
    ? ` O primeiro gargalo esta em ${weakPackages.slice(0, 2).map((item) => item.label.toLowerCase()).join(" e ")}.`
    : " A estrutura não mostrou um buraco crítico imediato.";
  return `Li ${statistics.totalCardsInDecklist} cartas com ${statistics.recognizedCards} reconhecidas no catálogo local. Com ${commanderName}, o deck parece caminhar para ${plan}. A nota técnica atual é ${score?.final ?? "-"} com teto ${score?.maxScore ?? "-"}.${confidence}${weakText}${benchmarkText}`;
}

function buildPlanB({ statistics, winconSummary, cardRoles }) {
  const hasInteraction = (statistics.functions?.interaction || 0) >= 8;
  const hasDraw = (statistics.functions?.cardDraw || 0) >= 6;
  const secondary = winconSummary?.primaryWincons?.[1]?.label;
  if (secondary) return `Plano B: quando o eixo principal travar, o deck ainda pode tentar vencer por ${secondary.toLowerCase()}, desde que preserve recursos e escolha bem as trocas.`;
  if (hasInteraction && hasDraw) return "Plano B: jogar mais devagar, trocar recursos com a mesa e ganhar por valor acumulado ate encontrar um finalizador.";
  return "Plano B: ainda não está muito claro. Nos testes, observe se o deck consegue vencer quando o comandante é removido duas vezes.";
}

function buildHowItWins(winconSummary, cardRoles) {
  const wincons = winconSummary?.primaryWincons || [];
  if (!wincons.length) return ["A condição de vitória ainda não ficou nítida pelos dados atuais."];
  return wincons.slice(0, 3).map((item) => `${item.label}: ${item.evidence?.join(" ") || "linha detectada pelo conjunto de tags e estatisticas."}`);
}

function buildManaBaseReview(statistics, manaAnalysis) {
  const lines = [...(manaAnalysis?.interpretation || [])];
  lines.unshift(`${statistics.types.lands} terrenos, ${statistics.mana.manaFixing} fontes de fixing e ${statistics.mana.permanentRamp} ramp permanente foram detectados.`);
  return lines.join(" ");
}

function buildCurveReview(statistics) {
  const early = (statistics.manaCurve?.["1"] || 0) + (statistics.manaCurve?.["2"] || 0);
  const late = (statistics.manaCurve?.["5"] || 0) + (statistics.manaCurve?.["6"] || 0) + (statistics.manaCurve?.["7+"] || 0);
  if (statistics.averageManaValue > 3.6) return `A curva esta pesada em ${statistics.averageManaValue}. Existem ${late} cartas de custo 5 ou mais; cada uma delas precisa justificar impacto real.`;
  if (early < 12) return `A curva media parece administravel, mas ha poucas jogadas baratas (${early} entre custos 1 e 2). Isso pode deixar os primeiros turnos passivos.`;
  return `A curva media de ${statistics.averageManaValue} parece jogavel, com ${early} jogadas baratas para iniciar o plano.`;
}

function buildRampReview(statistics, rampOdds) {
  const ramp = statistics.mana.permanentRamp || 0;
  const rocks = statistics.mana.manaRocks || 0;
  const treasureOneShot = statistics.mana.treasureOneShot || 0;
  const treasureRecurring = statistics.mana.treasureRecurring || 0;
  const odds = rampOdds ? ` A chance de abrir com ramp esta em ${rampOdds.percentage}%.` : "";
  const treasureText = treasureOneShot || treasureRecurring
    ? ` Além disso, há ${treasureOneShot} tesouro(s) pontuais e ${treasureRecurring} fonte(s) recorrentes de tesouro; em Aristocrats isso é aceleração temporária e combustível de sacrifício, não o mesmo que ramp que fica em campo.`
    : "";
  if (ramp < 8) return `${ramp} ramp permanente (${rocks} mana rocks/rocks equivalentes) é pouco para Commander na maioria das mesas.${odds} Antes de upgrades chamativos, eu reforçaria desenvolvimento de mana que fica em campo.${treasureText}`;
  if (ramp > 14) return `${ramp} ramp permanente e bastante. Isso acelera, mas teste se você não está comprando mana demais quando precisava de payoff ou proteção.${odds}${treasureText}`;
  return `${ramp} ramp permanente está em faixa saudável, com ${rocks} mana rocks/rocks equivalentes.${odds}${treasureText}`;
}

function buildInteractionReview(statistics) {
  const interaction = statistics.functions.interaction || 0;
  if (interaction < 6) return `${interaction} interacoes e pouco; o deck pode depender demais de executar o proprio plano sem conseguir frear a mesa.`;
  if (interaction > 14) return `${interaction} interações é bastante. Isso é bom para mesas fortes, mas revise se muitas respostas não estão ocupando slots de condição de vitória.`;
  return `${interaction} interacoes parece uma base funcional, desde que estejam divididas entre remocao pontual, wipes e respostas flexiveis.`;
}

function buildProtectionReview(statistics, diagnostics) {
  const protection = statistics.functions.protection || 0;
  const commanderWarning = diagnostics?.some((item) => item.code === "LOW_COMMANDER_PROTECTION");
  if (commanderWarning || protection < 2) return `${protection} protecoes detectadas. Se o comandante ou uma peca especifica e central, essa e uma das primeiras areas para reforcar.`;
  return `${protection} proteções detectadas. O pacote não parece zerado, mas vale testar se elas aparecem nos turnos em que a mesa tenta remover sua peça-chave.`;
}

function buildCardAdvantageReview(statistics, drawOdds) {
  const draw = statistics.functions.cardDraw || 0;
  const selection = statistics.functions.cardSelection || 0;
  const odds = drawOdds ? ` A chance estimada de encontrar compra/selecao ate 10 cartas e ${drawOdds.percentage}%.` : "";
  if (draw + selection < 8) return `${draw} compras e ${selection} selecoes indicam folego curto.${odds} O deck pode gastar a mao e ficar esperando o topo.`;
  return `${draw} compras e ${selection} selecoes dao um folego razoavel.${odds}`;
}

function buildCommanderDependency(commander, statistics, cardRoles) {
  if (!commander) return "Sem comandante definido, não dá para medir dependência de comandante com segurança.";
  const enablers = cardRoles?.enablers?.length || 0;
  const payoffs = cardRoles?.payoffs?.length || 0;
  if (enablers >= 6 && payoffs >= 4) return "O deck parece ter corpo proprio: existem enablers e payoffs suficientes para jogar mesmo se o comandante atrasar.";
  if ((statistics.functions.protection || 0) < 2) return "O deck parece depender bastante do comandante e ainda protege pouco essa peca. Isso cria risco contra mesas com muita remocao.";
  return "O comandante parece importante, mas ha sinais de suporte fora dele. Teste partidas em que ele custa caro demais para voltar.";
}

function buildUpgradePriorities({ weakPackages, excessPackages, diagnostics }) {
  const priorities = [];
  for (const item of weakPackages.slice(0, 3)) priorities.push(`Reforcar ${item.label.toLowerCase()}: ${item.action}`);
  for (const item of excessPackages.slice(0, 2)) priorities.push(`Revisar excesso em ${item.label.toLowerCase()}: ${item.action}`);
  for (const item of (diagnostics || []).filter((entry) => entry.severity === "warning").slice(0, 3)) priorities.push(item.suggestion || item.message);
  return [...new Set(priorities)].slice(0, 6);
}

function buildMulliganGuide({ statistics, rampOdds, commanderName }) {
  return {
    keep: [
      "Maos com 2-3 terrenos, pelo menos uma fonte das cores principais e uma jogada ate o turno 2.",
      (statistics.mana.permanentRamp || 0) >= 8 ? "Maos com ramp cedo e uma carta de compra/payoff costumam ser boas." : "Maos com mana estavel sao mais importantes que maos explosivas sem suporte.",
      `Maos que deixam ${commanderName} entrar no tempo certo ou preparar o plano antes dele.`
    ],
    mulligan: [
      "Maos com uma cor faltando e sem fixing.",
      "Maos cheias de custo 5+ sem ramp.",
      rampOdds && rampOdds.percentage < 45 ? "Mãos sem desenvolvimento de mana quando o deck já tem baixa chance de abrir com ramp." : "Mãos que só interagem, mas não desenvolvem plano."
    ].filter(Boolean)
  };
}

function buildMatchups({ statistics, packages, archetype, strategy }) {
  const strongInteraction = (statistics.functions.interaction || 0) >= 9;
  const weakProtection = (statistics.functions.protection || 0) < 2;
  const plan = strategy?.primaryArchetype?.label || archetype?.primary;
  const strongPackageNames = (packages || []).filter((item) => item.status === "strong").map((item) => item.label.toLowerCase());
  return {
    goodAgainst: [
      strongInteraction ? "Mesas dependentes de uma ou duas permanentes-chave." : null,
      strongPackageNames.length ? `Mesas onde ${strongPackageNames.slice(0, 2).join(" e ")} conseguem ditar o ritmo.` : null,
      plan ? `Partidas em que o plano de ${plan} pode se desenvolver sem pressao imediata.` : null
    ].filter(Boolean),
    badAgainst: [
      weakProtection ? "Mesas com muita remocao pontual no comandante ou motor principal." : null,
      (statistics.mana.permanentRamp || 0) < 8 ? "Mesas rapidas que aceleram antes do seu deck estabilizar." : null,
      (statistics.functions.cardDraw || 0) < 6 ? "Mesas de atrito longo, onde todo mundo troca recursos e vence quem compra mais." : null
    ].filter(Boolean)
  };
}

function buildTestingPlan({ statistics, weakPackages, excessPackages, strategy }) {
  return [
    "Jogue tres partidas anotando se perdeu por mana, falta de compra, falta de resposta ou falta de finalizador.",
    `Separe as cartas de custo 5+ (${(statistics.manaCurve?.["5"] || 0) + (statistics.manaCurve?.["6"] || 0) + (statistics.manaCurve?.["7+"] || 0)} slots) e veja quais realmente viraram o jogo.`,
    strategy?.primaryArchetype?.missing?.[0] ? `Teste especifico do plano: ${strategy.primaryArchetype.missing[0]}` : null,
    weakPackages[0] ? `No proximo teste, foque em ${weakPackages[0].label.toLowerCase()}: ${weakPackages[0].risk}` : "Mantenha a lista por algumas partidas antes de trocar muitos slots.",
    excessPackages[0] ? `Observe se o excesso em ${excessPackages[0].label.toLowerCase()} aparece como carta morta.` : "Troque no maximo 5 cartas por rodada de teste para medir impacto real."
  ].filter(Boolean);
}

function buildFinalVerdict({ score, weakPackages, statistics }) {
  if (score?.final >= 8 && !weakPackages.length) return "A lista parece bem encaminhada. Agora o ganho esta em ajustes finos, meta local e qualidade dos slots flexiveis.";
  if (score?.final >= 6) return "A lista é jogável, mas ainda tem gargalos claros. Eu corrigiria a base técnica antes de comprar upgrades caros.";
  if (statistics.unknownRatio > 0.2) return "A leitura ficou limitada por cartas desconhecidas. Primeiro complete o catálogo ou revise os nomes; depois a avaliação fica muito mais justa.";
  return "O deck ainda precisa de fundação: mana, compra, interação e condição de vitória precisam ficar mais claras.";
}

function simplifyCards(cards = []) {
  return cards.slice(0, 10).map((card) => ({
    name: card.name,
    role: card.role,
    reason: card.reason,
    verdict: card.keepCutVerdict
  }));
}

function findOdds(probabilityAnalysis, key) {
  return (probabilityAnalysis?.drawOdds || []).find((item) => item.key === key) || null;
}

function confidenceLabel(value) {
  return ({ high: "alta", medium: "média", low: "baixa" })[value] || value || "-";
}
