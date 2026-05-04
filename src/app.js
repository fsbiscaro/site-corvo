const STORAGE_KEY = "grimorio-corvo-state-v1";

const defaultTopics = [
  { id: crypto.randomUUID(), title: "Upgrade de precon por ate R$50", series: "Commander barato", status: "idea" },
  { id: crypto.randomUUID(), title: "Cartas que parecem ruins ate ganharem a mesa", series: "Carta esquecida", status: "idea" },
  { id: crypto.randomUUID(), title: "Analisar um deck de comandante subestimado", series: "Decks", status: "research" },
  { id: crypto.randomUUID(), title: "Top 10 remocoes pretas para Commander", series: "Cartas", status: "done" }
];

const views = document.querySelectorAll(".view");
const navItems = document.querySelectorAll("[data-view-target]");
const saveStatus = document.querySelector("#saveStatus");
const state = loadState();

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    return { topics: defaultTopics };
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      topics: normalizeTopics(Array.isArray(parsed.topics) ? parsed.topics : defaultTopics)
    };
  } catch {
    return { topics: defaultTopics };
  }
}

function normalizeTopics(topics) {
  return topics
    .filter((topic) => topic.series !== "Lore")
    .map((topic) => ({
      ...topic,
      status: topic.status === "script" ? "research" : topic.status
    }));
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setTransientStatus("Salvo");
  renderMetrics();
}

function setTransientStatus(text) {
  if (!saveStatus) return;
  saveStatus.textContent = text;
  window.setTimeout(() => {
    saveStatus.textContent = "Pronto";
  }, 1200);
}

function setView(viewId) {
  views.forEach((view) => view.classList.toggle("active", view.id === viewId));
  navItems.forEach((item) => item.classList.toggle("active", item.dataset.viewTarget === viewId));
  document.body.dataset.view = viewId;
  window.requestAnimationFrame(() => restartReveals(viewId));
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
}

function restartReveals(viewId) {
  const activeView = document.getElementById(viewId);
  if (!activeView) return;

  activeView.querySelectorAll(".reveal").forEach((element) => {
    element.style.animation = "none";
    element.offsetHeight;
    element.style.animation = "";
  });
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
}

const statusLabels = {
  idea: "Ideia",
  research: "Pesquisa",
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
            <div class="topic-meta">${escapeHtml(topic.series)} · ${statusLabels[topic.status] || "Ideia"}</div>
          </div>
          <div class="topic-actions">
            ${renderStatusButton(topic, "idea")}
            ${renderStatusButton(topic, "research")}
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
  if (lower.includes("top")) return "Cartas";
  if (lower.includes("carta") || lower.includes("spoiler")) return "Cartas";
  if (lower.includes("deck") || lower.includes("precon") || lower.includes("upgrade")) return "Decks";
  return "Temas";
}

document.querySelector("#cardForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.querySelector("#cardName").value.trim();
  if (!name) return;
  await searchCard(name);
});

document.querySelector("#cardResult").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-download-image]");
  if (!button) return;

  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Baixando...";

  try {
    await downloadCardImage(button.dataset.downloadImage, button.dataset.downloadName);
    setTransientStatus("Download iniciado");
  } catch {
    triggerDirectDownload(button.dataset.downloadImage, button.dataset.downloadName);
    setTransientStatus("Download iniciado");
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
});

async function searchCard(name) {
  const result = document.querySelector("#cardResult");
  result.innerHTML = '<div class="empty-state">Buscando...</div>';

  try {
    const response = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Carta não encontrada.");
    const card = await response.json();
    renderCard(card);
  } catch (error) {
    result.innerHTML = `<div class="empty-state error-text">${escapeHtml(error.message)}</div>`;
  }
}

function renderCard(card) {
  const displayImage = getCardImage(card, "large") || getCardImage(card, "normal") || "";
  const oracle = card.oracle_text || card.card_faces?.map((face) => `${face.name}\n${face.oracle_text || ""}`).join("\n\n") || "Sem texto Oracle.";
  const legality = card.legalities?.commander || "unknown";
  const ligaSearch = `https://www.ligamagic.com.br/?view=cards/search&card=${encodeURIComponent(card.name)}`;
  const downloads = getCardDownloads(card);

  document.querySelector("#cardResult").innerHTML = `
    <div class="card-display">
      ${displayImage ? `<img class="card-image" src="${displayImage}" alt="${escapeHtml(card.name)}" />` : ""}
      <article class="card-info">
        <h3>${escapeHtml(card.name)}</h3>
        <div class="download-panel">
          <strong>Imagem para vídeo</strong>
          <span>PNG em alta resolução. O arquivo vai para a pasta padrão de downloads do navegador.</span>
          <div class="download-actions">
            ${downloads.map((item) => `
              <button class="download-card-button" type="button" data-download-image="${escapeHtml(item.url)}" data-download-name="${escapeHtml(item.fileName)}">
                ${escapeHtml(item.label)}
              </button>
            `).join("")}
          </div>
        </div>
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

function getCardImage(card, size) {
  return card.image_uris?.[size] || card.card_faces?.[0]?.image_uris?.[size] || "";
}

function getCardDownloads(card) {
  if (card.image_uris?.png) {
    return [{
      label: "Baixar PNG alta",
      url: card.image_uris.png,
      fileName: `${sanitizeFileName(card.name)}.png`
    }];
  }

  return (card.card_faces || [])
    .filter((face) => face.image_uris?.png)
    .map((face, index) => ({
      label: index === 0 ? "Baixar frente PNG" : "Baixar verso PNG",
      url: face.image_uris.png,
      fileName: `${sanitizeFileName(card.name)}-${index + 1}-${sanitizeFileName(face.name)}.png`
    }));
}

async function downloadCardImage(url, fileName) {
  const response = await fetch(url, { mode: "cors" });
  if (!response.ok) throw new Error("Não consegui baixar a imagem.");

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  triggerDirectDownload(objectUrl, fileName);
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function triggerDirectDownload(url, fileName) {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function sanitizeFileName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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

function initVisualEffects() {
  const root = document.querySelector("[data-parallax-root]");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!root || prefersReducedMotion) return;

  window.addEventListener("pointermove", (event) => {
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;

    root.querySelectorAll("[data-parallax]").forEach((element) => {
      const strength = Number(element.dataset.parallax || 8);
      element.style.setProperty("--px", `${x * strength}px`);
      element.style.setProperty("--py", `${y * strength}px`);
    });
  }, { passive: true });
}

renderMetrics();
renderTopics();
initVisualEffects();
