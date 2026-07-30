const STATUS_LABEL = {
  done: "Erledigt",
  partial: "Teilweise",
  open: "Offen",
  setup: "Setup",
  cited: "Zitiert",
  miss: "Nicht zitiert",
  unchecked: "Offen",
};

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Konnte ${path} nicht laden (${res.status})`);
  return res.json();
}

function badge(status) {
  const label = STATUS_LABEL[status] || status;
  return `<span class="badge ${status}">${label}</span>`;
}

function renderHero(latest, foundation) {
  const summary = latest.summary || {};
  const score = latest.foundationScore || countFoundation(foundation);
  const pill = document.getElementById("status-pill");
  pill.textContent = summary.overallLabel || "Status unbekannt";
  pill.className = `status-pill`;
  document.getElementById("status-notes").textContent = summary.notes || "";

  const citationDisplay =
    summary.citationRate == null
      ? "—"
      : `${Math.round(summary.citationRate * 100)}%`;

  document.getElementById("score-row").innerHTML = [
    ["Foundation erledigt", `${score.done}/${score.total}`],
    ["Teilweise", String(score.partial)],
    ["Offen", String(score.open)],
    ["Citation-Rate", citationDisplay],
  ]
    .map(
      ([label, value]) => `
      <div class="score-card">
        <span class="label">${label}</span>
        <span class="value">${value}</span>
      </div>`
    )
    .join("");

  document.getElementById("run-label").textContent =
    `Stand ${latest.date || "—"} · ${latest.checkedBy || "manual"}`;
}

function countFoundation(foundation) {
  const items = foundation.items || [];
  return {
    done: items.filter((i) => i.status === "done").length,
    partial: items.filter((i) => i.status === "partial").length,
    open: items.filter((i) => i.status === "open").length,
    total: items.length,
  };
}

function renderFoundation(foundation) {
  const groups = {};
  for (const item of foundation.items || []) {
    (groups[item.group] ||= []).push(item);
  }
  document.getElementById("foundation-groups").innerHTML = Object.entries(groups)
    .map(
      ([group, items]) => `
      <div class="group">
        <h3>${group}</h3>
        <ul class="check-list">
          ${items
            .map(
              (item) => `
            <li class="check-item">
              ${badge(item.status)}
              <strong>${item.label}</strong>
              <span class="note">${item.note || ""}</span>
            </li>`
            )
            .join("")}
        </ul>
      </div>`
    )
    .join("");
}

function renderOps(ops) {
  const root = document.getElementById("ops-groups");
  if (!root) return;
  const groups = {};
  for (const item of ops.items || []) {
    (groups[item.group] ||= []).push(item);
  }
  const open = (ops.items || []).filter((i) => i.status === "open").length;
  const done = (ops.items || []).filter((i) => i.status === "done").length;
  root.innerHTML =
    `<p class="ops-summary">${done} erledigt · ${open} offen</p>` +
    Object.entries(groups)
      .map(
        ([group, items]) => `
      <div class="group">
        <h3>${group}</h3>
        <ul class="check-list">
          ${items
            .map(
              (item) => `
            <li class="check-item">
              ${badge(item.status)}
              <strong>${item.label}</strong>
              <span class="note">${item.note || ""}</span>
            </li>`
            )
            .join("")}
        </ul>
      </div>`
      )
      .join("");
}

function citationMap(latest) {
  const map = {};
  for (const row of latest.citations || []) {
    map[row.promptId] = row;
  }
  return map;
}

function renderPrompts(prompts, latest) {
  const byId = citationMap(latest);
  document.getElementById("prompt-list").innerHTML = (prompts.prompts || [])
    .map((p) => {
      const hit = byId[p.id];
      const status = hit
        ? hit.cited
          ? "cited"
          : "miss"
        : "unchecked";
      return `
        <li>
          <div>
            <span class="intent">${p.intent}</span>
            <span class="text">${p.text}</span>
          </div>
          ${badge(status)}
        </li>`;
    })
    .join("");
}

function renderCitations(latest, prompts) {
  const panel = document.getElementById("citations-panel");
  const rows = latest.citations || [];
  if (!rows.length) {
    panel.innerHTML = `
      <div class="empty-state">
        Noch keine Citation-Results. Prompt-Set in ChatGPT, Perplexity oder AI Overviews prüfen
        und die Antworten in <code>geo/results/latest.json</code> eintragen.
      </div>`;
    return;
  }
  const promptText = Object.fromEntries(
    (prompts.prompts || []).map((p) => [p.id, p.text])
  );
  panel.innerHTML = `
    <table class="citation-table">
      <thead>
        <tr>
          <th>Prompt</th>
          <th>Engine</th>
          <th>Status</th>
          <th>Notiz</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${promptText[r.promptId] || r.promptId}</td>
            <td>${r.engine || "—"}</td>
            <td>${badge(r.cited ? "cited" : "miss")}</td>
            <td>${r.note || "—"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`;
}

function renderActions(latest) {
  const actions = latest.nextActions || [];
  document.getElementById("action-list").innerHTML = actions.length
    ? actions.map((a) => `<li>${a}</li>`).join("")
    : "<li>Keine offenen Schritte hinterlegt.</li>";
}

function renderEntity(entity) {
  const sameAs = (entity.sameAs || [])
    .map((url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`)
    .join("<br>");
  const tags = (entity.keywords || [])
    .map((k) => `<span class="tag">${k}</span>`)
    .join("");
  document.getElementById("entity-panel").innerHTML = `
    <dl class="entity-grid">
      <div>
        <dt>Name</dt>
        <dd><strong>${entity.name}</strong> · ${entity.role || ""}</dd>
      </div>
      <div>
        <dt>Ort</dt>
        <dd>${entity.location?.city || "—"}, ${entity.location?.country || ""}</dd>
      </div>
      <div>
        <dt>Site</dt>
        <dd><a href="${entity.site}" target="_blank" rel="noopener">${entity.site}</a></dd>
      </div>
      <div>
        <dt>sameAs</dt>
        <dd>${sameAs || "—"}</dd>
      </div>
      <div>
        <dt>Answer Capsule</dt>
        <dd>${entity.answerCapsule || "—"}</dd>
      </div>
      <div>
        <dt>Keywords</dt>
        <dd><div class="tag-row">${tags}</div></dd>
      </div>
    </dl>`;
}

async function main() {
  try {
    const [entity, prompts, foundation, ops, latest] = await Promise.all([
      loadJSON("config/entity.json"),
      loadJSON("config/prompts.json"),
      loadJSON("config/foundation.json"),
      loadJSON("config/ops.json"),
      loadJSON("results/latest.json"),
    ]);
    renderHero(latest, foundation);
    renderFoundation(foundation);
    renderOps(ops);
    renderPrompts(prompts, latest);
    renderCitations(latest, prompts);
    renderActions(latest);
    renderEntity(entity);
  } catch (err) {
    document.getElementById("run-label").textContent = "Fehler beim Laden";
    document.getElementById("status-pill").textContent = "Daten nicht erreichbar";
    document.getElementById("status-notes").textContent =
      err.message +
      " — Bitte die App über einen lokalen Server oder das deployte Hosting öffnen (file:// blockiert fetch).";
    console.error(err);
  }
}

main();
