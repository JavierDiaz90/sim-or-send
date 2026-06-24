const state = {
  match: null,
  history: [],
  activePlayer: "all",
  aiEnabled: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const uploadView = $("#upload-view");
const dashboardView = $("#dashboard-view");
const uploadForm = $("#upload-form");
const replayInput = $("#replay-input");
const selectedFile = $("#selected-file");
const analyzeButton = $("#analyze-button");
const uploadProgress = $("#upload-progress");
const uploadError = $("#upload-error");

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function playerColor(player) {
  const colors = {
    Blue: "#448aff",
    Red: "#ef5350",
    Green: "#54b86f",
    Yellow: "#e2b84a",
    Cyan: "#52c7ca",
    Purple: "#a678d2",
    Gray: "#a7aaa8",
    Orange: "#e48a43",
  };
  return colors[player.color] || "#c9a862";
}

function chooseFile(file) {
  if (!file) return;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  replayInput.files = transfer.files;
  selectedFile.hidden = false;
  selectedFile.innerHTML = `<span>${escapeHtml(file.name)}</span><small>${(file.size / 1024 / 1024).toFixed(1)} MB</small>`;
  analyzeButton.hidden = false;
  uploadError.hidden = true;
}

$("#browse-button").addEventListener("click", () => replayInput.click());
replayInput.addEventListener("change", () => chooseFile(replayInput.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  uploadForm.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadForm.classList.add("dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  uploadForm.addEventListener(eventName, (event) => {
    event.preventDefault();
    uploadForm.classList.remove("dragging");
  });
});

uploadForm.addEventListener("drop", (event) => chooseFile(event.dataTransfer.files[0]));

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!replayInput.files[0]) return;
  analyzeButton.hidden = true;
  selectedFile.hidden = true;
  uploadProgress.hidden = false;
  uploadError.hidden = true;

  const body = new FormData();
  body.append("replay", replayInput.files[0]);
  try {
    const response = await fetch("/api/upload", { method: "POST", body });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, data.detail, data.hint].filter(Boolean).join(" "));
    state.match = data;
    state.history = [];
    renderMatch(data);
    history.replaceState({}, "", `/?match=${encodeURIComponent(data.id)}`);
    uploadView.hidden = true;
    dashboardView.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    uploadError.textContent = error.message;
    uploadError.hidden = false;
    selectedFile.hidden = false;
    analyzeButton.hidden = false;
  } finally {
    uploadProgress.hidden = true;
  }
});

function renderMatch(match) {
  $("#match-title").textContent = match.meta.map;
  $("#match-file").textContent = match.filename;
  $("#match-duration").textContent = match.meta.duration_label;
  $("#match-size").textContent = match.meta.map_size || "Unknown";
  $("#match-pop").textContent = match.meta.population_limit || "—";
  $("#match-type").textContent = `${match.meta.rated ? "Rated" : "Unrated"} · ${match.meta.game_type || "Recorded game"}`;

  $("#players").innerHTML = match.players.map((player, index) => `
    ${index ? '<div class="versus">VS</div>' : ""}
    <article class="player-card ${player.winner ? "winner" : ""}" style="--player-color:${playerColor(player)}">
      <div class="player-top">
        <span class="color-pip"></span>
        <div>
          <h3>${escapeHtml(player.name)}</h3>
          <p>${escapeHtml(player.civilization)}</p>
        </div>
        ${player.winner ? '<span class="winner-badge">Winner</span>' : ""}
      </div>
      <div class="player-stats">
        <div><span>eAPM</span><strong>${player.eapm ?? "—"}</strong></div>
        <div><span>Rating</span><strong>${player.rating ?? "—"}</strong></div>
        <div><span>Events</span><strong>${player.event_count}</strong></div>
      </div>
      <div class="age-row">
        ${Object.entries(player.age_times).map(([age, time]) => `<span>${escapeHtml(age)} <b>${time}</b></span>`).join("") || "<span>No age timings detected</span>"}
      </div>
    </article>
  `).join("");

  $("#insights").innerHTML = match.insights.map((insight) => `
    <article class="insight ${insight.tone}">
      <time>${insight.clock}</time>
      <span class="insight-line"></span>
      <div>
        <h3>${escapeHtml(insight.title)}</h3>
        <p>${escapeHtml(insight.detail)}</p>
      </div>
    </article>
  `).join("");

  $("#timeline-filters").innerHTML = `
    <button class="active" data-player="all">All</button>
    ${match.players.map((player) => `<button data-player="${player.number}">${escapeHtml(player.name)}</button>`).join("")}
  `;
  $$("#timeline-filters button").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePlayer = button.dataset.player;
      $$("#timeline-filters button").forEach((item) => item.classList.toggle("active", item === button));
      renderTimeline();
    });
  });
  renderTimeline();

  $("#limits-list").innerHTML = match.limits.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  $("#coach-mode").textContent = state.aiEnabled ? "AI · grounded in this replay" : "Local coach · add API key for deeper analysis";
  $("#messages").innerHTML = `
    <div class="message assistant">
      <p>I’ve parsed ${escapeHtml(match.meta.map)}: ${match.players.map((p) => `${escapeHtml(p.name)} as ${escapeHtml(p.civilization)}`).join(" versus ")}. What should we inspect first?</p>
    </div>
  `;
}

function renderTimeline() {
  const events = state.match.timeline
    .filter((event) => state.activePlayer === "all" || String(event.player.number) === state.activePlayer)
    .slice(0, 250);
  $("#timeline").innerHTML = events.length ? events.map((event) => `
    <article class="timeline-event">
      <time>${event.clock}</time>
      <span class="event-pip" style="--player-color:${playerColor(state.match.players.find((p) => p.number === event.player.number))}"></span>
      <div>
        <p>${escapeHtml(event.label)}</p>
        <small>${escapeHtml(event.player.name)}</small>
      </div>
    </article>
  `).join("") : '<p class="empty">No matching timeline events.</p>';
}

function appendMessage(role, text, pending = false) {
  const element = document.createElement("div");
  element.className = `message ${role}${pending ? " pending" : ""}`;
  element.innerHTML = pending
    ? "<span></span><span></span><span></span>"
    : `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`;
  $("#messages").appendChild(element);
  $("#messages").scrollTop = $("#messages").scrollHeight;
  return element;
}

async function askCoach(question) {
  if (!question.trim() || !state.match) return;
  appendMessage("user", question);
  const pending = appendMessage("assistant", "", true);
  $("#chat-input").value = "";
  $("#suggestions").hidden = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_id: state.match.id,
        message: question,
        history: state.history,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error([data.error, data.detail].filter(Boolean).join(" "));
    pending.remove();
    appendMessage("assistant", data.answer);
    state.history.push({ role: "user", content: question }, { role: "assistant", content: data.answer });
    state.history = state.history.slice(-8);
  } catch (error) {
    pending.remove();
    appendMessage("assistant", `I hit an error: ${error.message}`);
  }
}

$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  askCoach($("#chat-input").value);
});

$("#chat-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    $("#chat-form").requestSubmit();
  }
});

$("#suggestions").addEventListener("click", (event) => {
  if (event.target.tagName === "BUTTON") askCoach(event.target.textContent);
});

$("#new-replay").addEventListener("click", () => {
  state.match = null;
  state.history = [];
  replayInput.value = "";
  history.replaceState({}, "", "/");
  selectedFile.hidden = true;
  analyzeButton.hidden = true;
  dashboardView.hidden = true;
  uploadView.hidden = false;
});

fetch("/api/health")
  .then((response) => response.json())
  .then((health) => {
    state.aiEnabled = health.ai_enabled;
    $("#ai-status").textContent = health.ai_enabled ? `AI coach ready · ${health.model}` : "Local coach ready";
    document.body.classList.toggle("ai-enabled", health.ai_enabled);
  })
  .catch(() => {
    $("#ai-status").textContent = "Local server";
  });

const restoredMatchId = new URLSearchParams(location.search).get("match");
if (restoredMatchId) {
  fetch(`/api/matches/${encodeURIComponent(restoredMatchId)}`)
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      state.match = data;
      renderMatch(data);
      uploadView.hidden = true;
      dashboardView.hidden = false;
    })
    .catch((error) => {
      uploadError.textContent = error.message;
      uploadError.hidden = false;
      history.replaceState({}, "", "/");
    });
}
