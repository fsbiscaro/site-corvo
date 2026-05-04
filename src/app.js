const STORAGE_KEY = "grimorio-corvo-state-v1";

const defaultTopics = [
  { id: crypto.randomUUID(), title: "Upgrade de precon por ate R$50", series: "Commander barato", status: "idea" },
  { id: crypto.randomUUID(), title: "Cartas que parecem ruins ate ganharem a mesa", series: "Carta esquecida", status: "idea" },
  { id: crypto.randomUUID(), title: "Deck tech de comandante subestimado", series: "Deck tech", status: "script" },
  { id: crypto.randomUUID(), title: "Lore de um planeswalker em 5 minutos", series: "Lore", status: "record" },
  { id: crypto.randomUUID(), title: "Top 10 remocoes pretas para Commander", series: "Top 10", status: "done" }
];

const loreNotes = {
  "liliana vess": {
    pitch: "Necromante ambiciosa, marcada por pactos demoníacos e por escolhas que quase sempre cobram um preço pessoal.",
    beats: ["Origem em Dominária", "Pactos com quatro demônios", "Veil, Gideon e Guerra da Centelha", "Culpa, sobrevivência e reinvenção"],
    hook: "Liliana vendeu a alma para escapar da morte, mas cada vitória dela deixou uma dívida maior."
  },
  "nicol bolas": {
    pitch: "Dragão ancião, manipulador multiversal e uma das maiores ameaças já vistas em Magic.",
    beats: ["Dragões anciões", "Planos dentro de planos", "Amonkhet e Ravnica", "Queda e prisão no Meditation Realm"],
    hook: "Bolas não queria vencer uma guerra; queria transformar o Multiverso em tabuleiro."
  },
  "chandra nalaar": {
    pitch: "Piromante impulsiva de Kaladesh, símbolo de liberdade, raiva e afeto sem filtro.",
    beats: ["Kaladesh e repressão ao éter", "Primeira centelha", "Gatewatch", "Conflitos com autoridade e família"],
    hook: "Chandra não resolve problemas com fogo. Ela revela quais problemas já estavam inflamáveis."
  },
  "jace beleren": {
    pitch: "Telepata brilhante, frequentemente dividido entre controle, culpa e perda de identidade.",
    beats: ["Vryn", "Manipulação mental", "Guildpact vivo", "Ixalan e reconstrução pessoal"],
    hook: "O maior poder do Jace também é o que mais apaga quem ele é."
  },
  "teferi": {
    pitch: "Mago temporal de Zhalfir que carrega uma das maiores culpas de Dominária.",
    beats: ["Academia Tolariana", "Zhalfir fora do tempo", "Perda da centelha", "Retorno como mentor"],
    hook: "Teferi salvou um povo tirando-o do mundo. Depois passou séculos tentando trazê-lo de volta."
  },
  "elesh norn": {
    pitch: "Praetora branca de Nova Phyrexia, obcecada por unidade, fé e submissão perfeita.",
    beats: ["A Máquina Ortodoxa", "Domínio entre os praetores", "Compleation", "Marcha das Máquinas"],
    hook: "Elesh Norn chama de paz aquilo que o resto do Multiverso chama de fim."
  },
  "urza": {
    pitch: "Artífice genial de Dominária, herói por necessidade e catástrofe ambulante por consequência.",
    beats: ["Guerra dos Irmãos", "Mishra", "Legado", "Phyrexia e sacrifícios extremos"],
    hook: "Urza venceu guerras impossíveis, mas quase nunca saiu delas como uma pessoa melhor."
  },
  "yawgmoth": {
    pitch: "Médico, tirano e figura central na transformação de Phyrexia em horror tecnológico e religioso.",
    beats: ["Thran", "Exílio", "Ascensão em Phyrexia", "Corrupção biológica e ideológica"],
    hook: "Yawgmoth não criou só monstros. Ele criou uma ideia capaz de infectar mundos."
  }
};

const state = loadState();

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll("[data-view-target]");
const saveStatus = document.querySelector("#saveStatus");

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { topics: defaultTopics, scriptsGenerated: 0 };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics : defaultTopics,
      scriptsGenerated: Number(parsed.scriptsGenerated || 0)
    };
  } catch {
    return { topics: defaultTopics, scriptsGenerated: 0 };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  saveStatus.textContent = "Salvo";
  window.setTimeout(() => {
    saveStatus.textContent = "Pronto";
  }, 1200);
  renderMetrics();
}

function setView(viewId) {
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.viewTarget === viewId));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => setView(item.dataset.viewTarget));
});

document.querySelectorAll("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.jump));
});

function renderMetrics() {
  document.querySelector("#metricThemes").textContent = state.topics.filter((topic) => topic.status !== "done").length;
  document.querySelector("#metricDone").textContent = state.topics.filter((topic) => topic.status === "done").length;
  document.querySelector("#metricScripts").textContent = state.scriptsGenerated;
}

const statusLabels = {
  idea: "Ideia",
  script: "Roteiro",
  record: "Gravação",
  done: "Concluído"
};

let activeTopicFilter = "all";

function renderTopics() {
  const list = document.querySelector("#topicList");
  const topics = state.topics.filter((topic) => activeTopicFilter === "all" || topic.status === activeTopicFilter);

  if (!topics.length) {
    list.innerHTML = '<div class="empty-state">Nenhum tema nesse filtro.</div>';
    return;
  }

  list.innerHTML = topics
    .map((topic) => {
      return `
        <article class="topic-item">
          <div class="topic-main">
            <div class="topic-title">${escapeHtml(topic.title)}</div>
            <div class="topic-meta">${escapeHtml(topic.series)} · ${statusLabels[topic.status]}</div>
          </div>
          <div class="topic-actions">
            ${renderStatusButton(topic, "idea")}
            ${renderStatusButton(topic, "script")}
            ${renderStatusButton(topic, "record")}
            ${renderStatusButton(topic, "done")}
            <button class="small-button" type="button" data-topic-delete="${topic.id}">Remover</button>
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-topic-status]").forEach((button) => {
    button.addEventListener("click", () => {
      const topic = state.topics.find((item) => item.id === button.dataset.topicId);
      if (!topic) return;
      topic.status = button.dataset.topicStatus;
      persist();
      renderTopics();
    });
  });

  list.querySelectorAll("[data-topic-delete]").forEach((button) => {
    button.addEventListener("click", () => {
      state.topics = state.topics.filter((topic) => topic.id !== button.dataset.topicDelete);
      persist();
      renderTopics();
    });
  });
}

function renderStatusButton(topic, status) {
  const active = topic.status === status ? ' aria-current="true"' : "";
  return `<button class="small-button" type="button" data-topic-id="${topic.id}" data-topic-status="${status}"${active}>${statusLabels[status]}</button>`;
}

document.querySelectorAll("[data-topic-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    activeTopicFilter = button.dataset.topicFilter;
    document.querySelectorAll("[data-topic-filter]").forEach((item) => item.classList.toggle("active", item === button));
    renderTopics();
  });
});

document.querySelector("#topicForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector("#newTopic");
  const title = input.value.trim();
  if (!title) return;

  state.topics.unshift({
    id: crypto.randomUUID(),
    title,
    series: detectSeries(title),
    status: "idea"
  });
  input.value = "";
  persist();
  renderTopics();
});

function detectSeries(title) {
  const lower = title.toLowerCase();
  if (lower.includes("lore")) return "Lore";
  if (lower.includes("top")) return "Top 10";
  if (lower.includes("deck")) return "Deck tech";
  if (lower.includes("precon") || lower.includes("upgrade")) return "Commander barato";
  if (lower.includes("spoiler")) return "Spoilers";
  return "Ideias soltas";
}

document.querySelector("#scriptForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = {
    theme: document.querySelector("#scriptTheme").value.trim(),
    format: document.querySelector("#scriptFormat").value,
    audience: document.querySelector("#scriptAudience").value,
    tone: document.querySelector("#scriptTone").value,
    length: document.querySelector("#scriptLength").value,
    notes: document.querySelector("#scriptNotes").value.trim()
  };

  const script = generateScript(data);
  document.querySelector("#scriptOutput").textContent = script;
  state.scriptsGenerated += 1;
  persist();
});

document.querySelector("#copyScript").addEventListener("click", async () => {
  const output = document.querySelector("#scriptOutput").textContent;
  await navigator.clipboard.writeText(output);
  saveStatus.textContent = "Copiado";
  window.setTimeout(() => {
    saveStatus.textContent = "Pronto";
  }, 1200);
});

function generateScript(data) {
  const notes = data.notes
    ? data.notes.split(/\n+/).map((line) => line.trim()).filter(Boolean)
    : ["ponto forte principal", "risco ou fraqueza", "exemplo de jogada"];
  const titleCore = data.theme.replace(/\.$/, "");

  const titles = [
    `Essa tech muda ${titleCore}`,
    `${titleCore}: vale mesmo a pena?`,
    `O grimório abriu: ${titleCore}`,
    `${titleCore} sem enrolação`
  ];

  const hook = data.tone.includes("Polêmico")
    ? `Talvez a mesa esteja avaliando ${titleCore} do jeito errado.`
    : data.tone.includes("Cinemático")
      ? `Toda mesa tem uma carta que parece sussurrar antes do estrago começar. Hoje é ${titleCore}.`
      : `Hoje eu vou te mostrar ${titleCore} sem virar palestra de duas horas.`;

  return `# ${titles[0]}

Formato: ${data.format}
Público: ${data.audience}
Tom: ${data.tone}
Duração: ${data.length}

## Títulos alternativos
1. ${titles[1]}
2. ${titles[2]}
3. ${titles[3]}

## Abertura
${hook}

## Estrutura
0:00 - Gancho
Apresente a promessa do vídeo em uma frase e mostre a carta, deck ou personagem na tela.

0:20 - Contexto
Explique onde isso entra no Commander, no lore ou no metagame. Use uma comparação simples.

1:10 - Núcleo do vídeo
${notes.map((note, index) => `${index + 1}. ${note}`).join("\n")}

## Momento Corvo
Inclua uma opinião clara do canal: o que muita gente ignora, compra errado ou joga no piloto automático.

## Fechamento
Resuma a recomendação final em uma frase. Convide a audiência a comentar uma carta, comandante ou tema para o próximo grimório.

## Thumbnail
Texto curto: "${compactTitle(titleCore)}"
Visual: carta/personagem grande, fundo escuro, contraste em dourado ou verde, expressão de ameaça ou descoberta.

## Descrição
Hoje no Grimório do Corvo: ${titleCore}. Vamos olhar contexto, pontos fortes, riscos e onde isso realmente brilha em Magic: The Gathering.

#MTG #MagicTheGathering #Commander #EDH #GrimorioDoCorvo`;
}

function compactTitle(title) {
  const clean = title.split(" ").slice(0, 5).join(" ");
  return clean.length > 28 ? `${clean.slice(0, 25)}...` : clean;
}

document.querySelector("#loreForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = document.querySelector("#loreQuery").value.trim();
  const angle = document.querySelector("#loreAngle").value;
  if (!query) return;

  renderLore(query, angle);
});

function renderLore(query, angle) {
  const output = document.querySelector("#loreOutput");
  const key = query.toLowerCase();
  const note = loreNotes[key] || buildGenericLore(query);
  const encoded = encodeURIComponent(query);

  output.innerHTML = `
    <h3>${escapeHtml(query)}</h3>
    <p><strong>Enfoque:</strong> ${escapeHtml(angle)}</p>
    <p>${escapeHtml(note.pitch)}</p>
    <h3>Gancho</h3>
    <p>${escapeHtml(note.hook)}</p>
    <h3>Blocos</h3>
    <ul>${note.beats.map((beat) => `<li>${escapeHtml(beat)}</li>`).join("")}</ul>
    <h3>Fontes rápidas</h3>
    <div class="link-row">
      <a href="https://mtg.fandom.com/wiki/Special:Search?query=${encoded}" target="_blank" rel="noreferrer">MTG Wiki</a>
      <a href="https://magic.wizards.com/en/search?search=${encoded}" target="_blank" rel="noreferrer">Magic Story</a>
      <a href="https://scryfall.com/search?q=${encoded}" target="_blank" rel="noreferrer">Cartas</a>
    </div>
  `;
}

function buildGenericLore(query) {
  return {
    pitch: `Dossiê inicial para pesquisar ${query} e transformar a lore em vídeo.`,
    hook: `${query} pode virar um vídeo forte se a abertura focar no conflito central antes da linha do tempo.`,
    beats: ["Origem", "Primeiro conflito importante", "Carta ou cena mais reconhecível", "Virada dramática", "Estado atual na história"]
  };
}

document.querySelector("#cardForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#cardName").value.trim();
  if (!name) return;
  await searchCard(name);
});

async function searchCard(name) {
  const result = document.querySelector("#cardResult");
  result.innerHTML = '<div class="empty-state">Buscando...</div>';

  try {
    const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error("Carta não encontrada.");
    const card = await response.json();
    renderCard(card);
  } catch (error) {
    result.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`;
  }
}

function renderCard(card) {
  const image = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || "";
  const oracle = card.oracle_text || card.card_faces?.map((face) => `${face.name}\n${face.oracle_text || ""}`).join("\n\n") || "Sem texto Oracle.";
  const legality = card.legalities?.commander || "unknown";
  const ligaSearch = `https://www.ligamagic.com.br/?view=cards/search&card=${encodeURIComponent(card.name)}`;

  document.querySelector("#cardResult").innerHTML = `
    <div class="card-display">
      ${image ? `<img class="card-image" src="${image}" alt="${escapeHtml(card.name)}" />` : ""}
      <article class="card-info">
        <h3>${escapeHtml(card.name)}</h3>
        <dl>
          <dt>Custo</dt>
          <dd>${escapeHtml(card.mana_cost || "Sem custo")}</dd>
          <dt>Tipo</dt>
          <dd>${escapeHtml(card.type_line || "")}</dd>
          <dt>Texto</dt>
          <dd>${escapeHtml(oracle).replace(/\n/g, "<br>")}</dd>
          <dt>Commander</dt>
          <dd>${escapeHtml(legality)}</dd>
          <dt>Preço USD</dt>
          <dd>${escapeHtml(card.prices?.usd || card.prices?.usd_foil || "N/D")}</dd>
        </dl>
        <div class="link-row">
          <a href="${card.scryfall_uri}" target="_blank" rel="noreferrer">Scryfall</a>
          <a href="${ligaSearch}" target="_blank" rel="noreferrer">LigaMagic</a>
          <a href="https://edhrec.com/cards/${slugify(card.name)}" target="_blank" rel="noreferrer">EDHREC</a>
        </div>
      </article>
    </div>
  `;
}

document.querySelector("#loadSampleDeck").addEventListener("click", () => {
  document.querySelector("#deckInput").value = `1 Alela, Artful Provocateur
1 Sol Ring
1 Arcane Signet
1 Command Tower
1 Path to Exile
1 Swords to Plowshares
1 Counterspell
1 Rhystic Study
1 Smothering Tithe
1 Bitterblossom
1 Ghostly Prison
1 Watery Grave
1 Hallowed Fountain
1 Godless Shrine
1 Island
1 Plains
1 Swamp`;
});

document.querySelector("#deckForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const lines = parseDecklist(document.querySelector("#deckInput").value);
  if (!lines.length) {
    document.querySelector("#deckOutput").innerHTML = '<p class="error-text">Cole uma lista válida.</p>';
    return;
  }
  await analyzeDeck(lines);
});

function parseDecklist(text) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("//") && !line.startsWith("#"))
    .map((line) => line.replace(/^(\d+)\s*x?\s+/i, "").replace(/\s+\(.+\)\s*\d*$/g, "").trim())
    .filter((line) => line && !["commander", "deck", "sideboard", "maybeboard"].includes(line.toLowerCase()));
}

async function analyzeDeck(names) {
  const output = document.querySelector("#deckOutput");
  output.innerHTML = "<p>Consultando cartas...</p>";

  try {
    const cards = await fetchCardsByName(names);
    const total = names.length;
    const found = cards.length;
    const colors = summarizeColors(cards);
    const types = summarizeTypes(cards);
    const curve = summarizeCurve(cards);
    const roles = summarizeRoles(cards);

    output.innerHTML = `
      <h3>Resumo</h3>
      <dl class="deck-stats">
        <dt>Total</dt><dd>${total} cartas na lista, ${found} encontradas no Scryfall</dd>
        <dt>Cores</dt><dd>${colors || "Incolor / não identificado"}</dd>
        <dt>Tipos</dt><dd>${formatObject(types)}</dd>
        <dt>Funções</dt><dd>${formatObject(roles)}</dd>
      </dl>
      <h3>Curva de mana</h3>
      <div class="deck-bars">${renderCurveBars(curve)}</div>
    `;
  } catch (error) {
    output.innerHTML = `<p class="error-text">${escapeHtml(error.message)}</p>`;
  }
}

async function fetchCardsByName(names) {
  const uniqueNames = [...new Set(names)];
  const chunks = [];
  for (let i = 0; i < uniqueNames.length; i += 75) {
    chunks.push(uniqueNames.slice(i, i + 75));
  }

  const allCards = [];
  for (const chunk of chunks) {
    const response = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identifiers: chunk.map((name) => ({ name }))
      })
    });

    if (!response.ok) throw new Error("Não consegui consultar a lista no Scryfall.");
    const data = await response.json();
    allCards.push(...(data.data || []));
  }
  return allCards;
}

function summarizeColors(cards) {
  const order = ["W", "U", "B", "R", "G"];
  const names = { W: "Branco", U: "Azul", B: "Preto", R: "Vermelho", G: "Verde" };
  const found = new Set();
  cards.forEach((card) => (card.color_identity || []).forEach((color) => found.add(color)));
  return order.filter((color) => found.has(color)).map((color) => names[color]).join(", ");
}

function summarizeTypes(cards) {
  return cards.reduce((acc, card) => {
    const type = card.type_line || "";
    if (type.includes("Land")) acc.Terrenos += 1;
    else if (type.includes("Creature")) acc.Criaturas += 1;
    else if (type.includes("Artifact")) acc.Artefatos += 1;
    else if (type.includes("Enchantment")) acc.Encantamentos += 1;
    else if (type.includes("Instant")) acc.Instantaneas += 1;
    else if (type.includes("Sorcery")) acc.Feiticos += 1;
    else if (type.includes("Planeswalker")) acc.Planeswalkers += 1;
    return acc;
  }, { Terrenos: 0, Criaturas: 0, Artefatos: 0, Encantamentos: 0, Instantaneas: 0, Feiticos: 0, Planeswalkers: 0 });
}

function summarizeCurve(cards) {
  return cards.reduce((acc, card) => {
    if ((card.type_line || "").includes("Land")) return acc;
    const cmc = Math.min(Math.floor(card.cmc || 0), 7);
    acc[cmc] = (acc[cmc] || 0) + 1;
    return acc;
  }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 });
}

function summarizeRoles(cards) {
  const roles = { Ramp: 0, Compra: 0, Remocao: 0, Protecao: 0, Recursao: 0 };
  cards.forEach((card) => {
    const text = `${card.oracle_text || ""} ${card.type_line || ""}`.toLowerCase();
    if (text.includes("add ") || card.name.toLowerCase().includes("signet") || card.name.toLowerCase().includes("sol ring")) roles.Ramp += 1;
    if (text.includes("draw") || text.includes("investigate")) roles.Compra += 1;
    if (text.includes("destroy") || text.includes("exile") || text.includes("counter target")) roles.Remocao += 1;
    if (text.includes("hexproof") || text.includes("indestructible") || text.includes("protection")) roles.Protecao += 1;
    if (text.includes("return target") || text.includes("graveyard")) roles.Recursao += 1;
  });
  return roles;
}

function renderCurveBars(curve) {
  const max = Math.max(...Object.values(curve), 1);
  return Object.entries(curve)
    .map(([cost, count]) => {
      const label = cost === "7" ? "7+" : cost;
      return `
        <div class="bar-row">
          <span>CMC ${label}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${(count / max) * 100}%"></span></span>
          <strong>${count}</strong>
        </div>
      `;
    })
    .join("");
}

function formatObject(object) {
  return Object.entries(object)
    .filter(([, value]) => value > 0)
    .map(([key, value]) => `${key}: ${value}`)
    .join(" · ") || "Nada destacado";
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

renderMetrics();
renderTopics();
