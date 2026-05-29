const STORAGE_KEY = "constructionRecruitmentMvp";

const demoData = {
  workers: [
    {
      id: createId(),
      name: "Sam Taylor",
      trade: "Electrician",
      qualifications: "ECS, IPAF, 18th Edition",
      availability: "available",
      reliability: 92,
    },
    {
      id: createId(),
      name: "Aisha Khan",
      trade: "Labourer",
      qualifications: "CSCS green card",
      availability: "available",
      reliability: 84,
    },
    {
      id: createId(),
      name: "Mark Evans",
      trade: "Plumber",
      qualifications: "JIB PMES, CSCS",
      availability: "not available",
      reliability: 78,
    },
    {
      id: createId(),
      name: "Grace Miller",
      trade: "Electrician",
      qualifications: "ECS, testing and inspection",
      availability: "available",
      reliability: 88,
    },
  ],
  jobs: [
    {
      id: createId(),
      trade: "Electrician",
      location: "Birmingham",
      start: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
      duration: "3 days",
      assignedWorkerId: "",
    },
  ],
};

let state = loadState();

const workerForm = document.querySelector("#workerForm");
const jobForm = document.querySelector("#jobForm");
const workersList = document.querySelector("#workersList");
const jobsList = document.querySelector("#jobsList");
const matchResults = document.querySelector("#matchResults");
const resetDemoBtn = document.querySelector("#resetDemoBtn");

workerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  state.workers.push({
    id: createId(),
    name: document.querySelector("#workerName").value.trim(),
    trade: document.querySelector("#workerTrade").value.trim(),
    qualifications: document.querySelector("#workerQualifications").value.trim(),
    availability: document.querySelector("#workerAvailability").value,
    reliability: clampScore(document.querySelector("#workerReliability").value),
  });

  workerForm.reset();
  document.querySelector("#workerReliability").value = 75;
  saveAndRender();
});

jobForm.addEventListener("submit", (event) => {
  event.preventDefault();

  state.jobs.push({
    id: createId(),
    trade: document.querySelector("#jobTrade").value.trim(),
    location: document.querySelector("#jobLocation").value.trim(),
    start: document.querySelector("#jobStart").value,
    duration: document.querySelector("#jobDuration").value.trim(),
    assignedWorkerId: "",
  });

  jobForm.reset();
  saveAndRender();
});

resetDemoBtn.addEventListener("click", () => {
  state = structuredClone(demoData);
  saveAndRender();
});

function loadState() {
  // localStorage.getItem(...)const saved = localStorage.getItem(STORAGE_KEY);
  return structuredClone(demoData);
}

function saveAndRender() {
 // localStorage.getItem(...) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  render();
}

function render() {
  renderWorkers();
  renderJobs();
  renderMatches();
}

function renderWorkers() {
  workersList.innerHTML = state.workers.length
    ? state.workers.map(workerCard).join("")
    : emptyState("No workers added yet.");

  workersList.querySelectorAll("[data-worker-availability]").forEach((select) => {
    select.addEventListener("change", () => {
      const worker = findWorker(select.dataset.workerAvailability);
      worker.availability = select.value;
      saveAndRender();
    });
  });

  workersList.querySelectorAll("[data-score-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const worker = findWorker(button.dataset.workerId);
      const action = button.dataset.scoreAction;
      worker.reliability = nextReliability(worker.reliability, action);
      saveAndRender();
    });
  });
}

function renderJobs() {
  jobsList.innerHTML = state.jobs.length
    ? state.jobs.map(jobCard).join("")
    : emptyState("No job requests added yet.");

  jobsList.querySelectorAll("[data-assign-job]").forEach((select) => {
    select.addEventListener("change", () => {
      const job = findJob(select.dataset.assignJob);
      job.assignedWorkerId = select.value;
      saveAndRender();
    });
  });
}

function renderMatches() {
  matchResults.innerHTML = state.jobs.length
    ? state.jobs.map(matchCard).join("")
    : emptyState("Add a job request to see matching workers.");

  matchResults.querySelectorAll("[data-auto-assign]").forEach((button) => {
    button.addEventListener("click", () => {
      const job = findJob(button.dataset.autoAssign);
      const [bestMatch] = getMatches(job);
      job.assignedWorkerId = bestMatch.id;
      saveAndRender();
    });
  });
}

function workerCard(worker) {
  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h4>${escapeHtml(worker.name)}</h4>
          <p class="meta">${escapeHtml(worker.trade)} &middot; ${escapeHtml(worker.qualifications || "No tickets listed")}</p>
        </div>
        <span class="tag ${worker.availability === "available" ? "available" : "unavailable"}">
          ${escapeHtml(worker.availability)}
        </span>
      </div>
      <div class="tag-row">
        <span class="tag">Reliability <span class="score">&nbsp;${worker.reliability}</span>/100</span>
      </div>
      <div class="actions">
        <select aria-label="Update availability for ${escapeHtml(worker.name)}" data-worker-availability="${worker.id}">
          <option value="available" ${worker.availability === "available" ? "selected" : ""}>Available</option>
          <option value="not available" ${worker.availability === "not available" ? "selected" : ""}>Not available</option>
        </select>
        <button class="small-button good" type="button" data-score-action="onTime" data-worker-id="${worker.id}">Completed on time</button>
        <button class="small-button bad" type="button" data-score-action="late" data-worker-id="${worker.id}">Late</button>
        <button class="small-button bad" type="button" data-score-action="noShow" data-worker-id="${worker.id}">No-show</button>
      </div>
    </article>
  `;
}

function jobCard(job) {
  const assignedWorker = job.assignedWorkerId ? findWorker(job.assignedWorkerId) : null;
  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h4>${escapeHtml(job.trade)} in ${escapeHtml(job.location)}</h4>
          <p class="meta">${formatDate(job.start)}${job.duration ? ` &middot; ${escapeHtml(job.duration)}` : ""}</p>
        </div>
        <span class="tag">${assignedWorker ? `Assigned: ${escapeHtml(assignedWorker.name)}` : "Unassigned"}</span>
      </div>
      <div class="actions">
        <select aria-label="Manually assign worker" data-assign-job="${job.id}">
          <option value="">Manual assignment</option>
          ${state.workers
            .map(
              (worker) => `
                <option value="${worker.id}" ${job.assignedWorkerId === worker.id ? "selected" : ""}>
                  ${escapeHtml(worker.name)} (${escapeHtml(worker.trade)}, ${worker.reliability}/100)
                </option>
              `,
            )
            .join("")}
        </select>
      </div>
    </article>
  `;
}

function matchCard(job) {
  const matches = getMatches(job);
  return `
    <article class="card">
      <div class="card-header">
        <div>
          <h4>${escapeHtml(job.trade)} needed in ${escapeHtml(job.location)}</h4>
          <p class="meta">${formatDate(job.start)}${job.duration ? ` &middot; ${escapeHtml(job.duration)}` : ""}</p>
        </div>
        ${matches.length ? `<button class="small-button" type="button" data-auto-assign="${job.id}">Assign best match</button>` : ""}
      </div>
      ${
        matches.length
          ? `<div class="match-workers">${matches.map((worker, index) => matchRow(worker, index)).join("")}</div>`
          : emptyState("No available workers match this trade.")
      }
    </article>
  `;
}

function matchRow(worker, index) {
  return `
    <div class="match-row">
      <div>
        <strong>${index === 0 ? "Best match: " : ""}${escapeHtml(worker.name)}</strong>
        <p class="meta">${escapeHtml(worker.trade)} &middot; ${escapeHtml(worker.qualifications || "No tickets listed")}</p>
      </div>
      <span class="tag">Reliability <span class="score">&nbsp;${worker.reliability}</span>/100</span>
    </div>
  `;
}

function getMatches(job) {
  return state.workers
    .filter(
      (worker) =>
        normalize(worker.trade) === normalize(job.trade) &&
        worker.availability === "available",
    )
    .sort((a, b) => b.reliability - a.reliability);
}

function nextReliability(currentScore, action) {
  const changes = {
    onTime: 5,
    late: -8,
    noShow: -15,
  };

  return clampScore(Number(currentScore) + changes[action]);
}

function clampScore(value) {
  return Math.min(100, Math.max(0, Number(value) || 0));
}

function findWorker(id) {
  return state.workers.find((worker) => worker.id === id);
}

function findJob(id) {
  return state.jobs.find((job) => job.id === id);
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function formatDate(value) {
  if (!value) return "No start date";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function emptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function createId() {
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}

render();
