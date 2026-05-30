// ─── OnSite AI Admin Assistant ────────────────────────────
// Floating chat panel powered by GPT-5-mini via the /api/ai-chat endpoint.
// Has full read access to all platform data from localStorage.

const AI_HISTORY_KEY = "onsite_ai_history_v1";

let aiHistory = [];
try { aiHistory = JSON.parse(localStorage.getItem(AI_HISTORY_KEY) || "[]"); } catch (_) { aiHistory = []; }

let aiPanelOpen = false;

// ── Build platform context snapshot ─────────────────────────
function buildPlatformContext() {
  let state = { workers: [], jobs: [] };
  let attendanceRecords = [];
  try {
    state = JSON.parse(localStorage.getItem("sitematch_v2") || '{"workers":[],"jobs":[]}');
    attendanceRecords = JSON.parse(localStorage.getItem("onsite_attendance_v1") || "[]");
  } catch (_) {}

  const disputes      = attendanceRecords.filter(r => r.disputeStatus);
  const openDisputes  = disputes.filter(r => r.disputeStatus === "pending");
  const today         = new Date().toISOString().split("T")[0];
  const todayRecords  = attendanceRecords.filter(r => r.date === today);

  // Per-worker stats
  const workerSummaries = state.workers.map(w => {
    const recs       = attendanceRecords.filter(r => r.workerId === w.id && r.disputeStatus !== "pending");
    const countable  = recs.filter(r => r.status !== "notRequired" && r.status !== "siteCancelled");
    const attended   = countable.filter(r => r.status === "onTime" || r.status === "late");
    const onTime     = countable.filter(r => r.status === "onTime");
    const noShows    = countable.filter(r => r.status === "noShow").length;
    const disputed   = attendanceRecords.filter(r => r.workerId === w.id && r.disputeStatus === "pending");
    const job        = state.jobs.find(j => j.assignedWorkerId === w.id);
    return {
      id:           w.id,
      name:         w.name,
      trade:        w.trade,
      qualifications: w.qualifications || "",
      availability: w.availability,
      reliability:  countable.length ? Math.round(attended.length / countable.length * 100) : w.reliability,
      punctuality:  attended.length ? Math.round(onTime.length / attended.length * 100) : null,
      totalShifts:  countable.length,
      noShows,
      openDisputes: disputed.length,
      assignedJob:  job ? `${job.trade} at ${job.location}` : null,
    };
  });

  // Job summaries
  const jobSummaries = state.jobs.map(j => ({
    id:       j.id,
    trade:    j.trade,
    location: j.location,
    start:    j.start,
    duration: j.duration,
    status:   j.status,
    assignedWorker: j.assignedWorkerId
      ? (state.workers.find(w => w.id === j.assignedWorkerId)?.name || "Unknown")
      : null,
    hasSitePin: !!j.sitePin,
  }));

  // Dispute summaries
  const disputeSummaries = openDisputes.map(r => {
    const w = state.workers.find(w => w.id === r.workerId);
    const j = state.jobs.find(j => j.assignedWorkerId === r.workerId);
    return {
      worker:       w?.name || "Unknown",
      date:         r.date,
      site:         j?.location || "Unknown site",
      originalStatus: r.status,
      reason:       r.disputeReason,
      comment:      r.disputeComment || "",
      hasGpsEvidence: !!r.gpsLat,
      gpsDistance:  r.gpsDistance !== null && r.gpsDistance !== undefined ? `${Math.round(r.gpsDistance)}m from site pin` : null,
      raisedAt:     r.disputeTimestamp ? new Date(r.disputeTimestamp).toLocaleDateString("en-GB") : "Unknown",
    };
  });

  // Recent attendance (last 7 days)
  const recentDates = [...new Set(attendanceRecords.map(r => r.date))].sort().reverse().slice(0, 7);
  const recentAttendance = recentDates.map(date => {
    const recs = attendanceRecords.filter(r => r.date === date);
    return {
      date,
      onTime:       recs.filter(r => r.status === "onTime").length,
      late:         recs.filter(r => r.status === "late").length,
      noShow:       recs.filter(r => r.status === "noShow").length,
      siteCancelled: recs.filter(r => r.status === "siteCancelled").length,
    };
  });

  return {
    platform: "OnSite — Construction Labour Recruitment",
    date: new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" }),
    summary: {
      totalWorkers:    state.workers.length,
      availableWorkers: state.workers.filter(w => w.availability === "available").length,
      totalJobs:       state.jobs.length,
      openJobs:        state.jobs.filter(j => j.status !== "filled").length,
      openDisputes:    openDisputes.length,
      todayAttendanceRecorded: todayRecords.length,
    },
    workers:          workerSummaries,
    jobs:             jobSummaries,
    openDisputes:     disputeSummaries,
    recentAttendance,
  };
}

// ── Quick-prompt suggestions ─────────────────────────────────
const AI_SUGGESTIONS = [
  "Which workers have the highest reliability?",
  "Are there any open disputes I should review?",
  "Summarise today's attendance",
  "Which jobs still need filling?",
  "Flag any workers with concerning patterns",
  "Draft a message to workers about site attendance",
];

// ── Render chat panel ─────────────────────────────────────────
function renderAiPanel() {
  const panel = document.getElementById("aiChatPanel");
  if (!panel) return;

  const msgs = aiHistory.map(m => {
    const isUser = m.role === "user";
    return `
    <div class="ai-msg ${isUser ? "ai-msg--user" : "ai-msg--ai"}">
      ${!isUser ? `<div class="ai-msg-avatar">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>` : ""}
      <div class="ai-msg-bubble">${formatAiText(m.content)}</div>
    </div>`;
  }).join("");

  const suggestionsHtml = aiHistory.length === 0 ? `
    <div class="ai-suggestions">
      <p class="ai-suggestions-label">Try asking:</p>
      ${AI_SUGGESTIONS.map(s => `<button class="ai-suggestion-chip" data-suggestion="${escHtml(s)}" type="button">${escHtml(s)}</button>`).join("")}
    </div>` : "";

  panel.innerHTML = `
    <div class="ai-panel-header">
      <div class="ai-panel-title">
        <div class="ai-panel-avatar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div>
          <div class="ai-panel-name">OnSite AI</div>
          <div class="ai-panel-sub">Admin Assistant</div>
        </div>
      </div>
      <div class="ai-panel-actions">
        ${aiHistory.length > 0 ? `<button class="ai-clear-btn" id="aiClearBtn" type="button" title="Clear chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>` : ""}
        <button class="ai-close-btn" id="aiCloseBtn" type="button" aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
    <div class="ai-messages" id="aiMessages">
      ${aiHistory.length === 0 ? `
      <div class="ai-welcome">
        <div class="ai-welcome-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div class="ai-welcome-title">OnSite AI Assistant</div>
        <div class="ai-welcome-sub">I have access to all workers, jobs, attendance records, and disputes. Ask me anything — I'll make recommendations but final decisions stay with you.</div>
      </div>` : msgs}
      ${suggestionsHtml}
      <div id="aiTypingIndicator" class="ai-typing hidden">
        <div class="ai-msg ai-msg--ai">
          <div class="ai-msg-avatar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          </div>
          <div class="ai-msg-bubble ai-typing-bubble"><span></span><span></span><span></span></div>
        </div>
      </div>
    </div>
    <div class="ai-input-area">
      <textarea class="ai-input" id="aiInput" placeholder="Ask about workers, jobs, attendance, disputes…" rows="1" maxlength="1000"></textarea>
      <button class="ai-send-btn" id="aiSendBtn" type="button" aria-label="Send">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>
      </button>
    </div>`;

  bindAiPanelEvents();
  scrollAiToBottom();
}

function escHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatAiText(text) {
  // Basic markdown-ish formatting for AI responses
  return escHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/^### (.*?)$/gm, "<h4>$1</h4>")
    .replace(/^## (.*?)$/gm, "<h3>$1</h3>")
    .replace(/^# (.*?)$/gm, "<h3>$1</h3>")
    .replace(/^[-•] (.*?)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^(?!<[hul])(.+)$/gm, "<p>$1</p>");
}

function bindAiPanelEvents() {
  document.getElementById("aiCloseBtn")?.addEventListener("click", closeAiAssistant);
  document.getElementById("aiClearBtn")?.addEventListener("click", clearAiHistory);
  document.getElementById("aiSendBtn")?.addEventListener("click", sendAiMessage);

  const input = document.getElementById("aiInput");
  if (input) {
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
    });
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 100) + "px";
    });
    input.focus();
  }

  document.querySelectorAll("[data-suggestion]").forEach(btn => {
    btn.addEventListener("click", () => {
      const input = document.getElementById("aiInput");
      if (input) { input.value = btn.dataset.suggestion; input.focus(); }
    });
  });
}

function scrollAiToBottom() {
  const msgs = document.getElementById("aiMessages");
  if (msgs) setTimeout(() => { msgs.scrollTop = msgs.scrollHeight; }, 50);
}

// ── Open / Close ──────────────────────────────────────────────
function openAiAssistant() {
  aiPanelOpen = true;
  const wrapper = document.getElementById("aiPanelWrapper");
  if (wrapper) {
    wrapper.classList.remove("hidden");
    requestAnimationFrame(() => wrapper.classList.add("ai-panel-open"));
  }
  renderAiPanel();
  document.getElementById("aiFab")?.setAttribute("aria-expanded", "true");
}

function closeAiAssistant() {
  aiPanelOpen = false;
  const wrapper = document.getElementById("aiPanelWrapper");
  if (wrapper) {
    wrapper.classList.remove("ai-panel-open");
    setTimeout(() => wrapper.classList.add("hidden"), 260);
  }
  document.getElementById("aiFab")?.setAttribute("aria-expanded", "false");
}

function clearAiHistory() {
  aiHistory = [];
  localStorage.removeItem(AI_HISTORY_KEY);
  renderAiPanel();
}

// ── Send message ──────────────────────────────────────────────
async function sendAiMessage() {
  const input  = document.getElementById("aiInput");
  const sendBtn = document.getElementById("aiSendBtn");
  const message = input?.value.trim();
  if (!message) return;

  // Add user message
  aiHistory.push({ role: "user", content: message });
  input.value = "";
  input.style.height = "auto";
  if (sendBtn) sendBtn.disabled = true;

  renderAiPanel();
  document.getElementById("aiTypingIndicator")?.classList.remove("hidden");
  scrollAiToBottom();

  try {
    const context = buildPlatformContext();
    const res = await fetch("/api/ai-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, context, history: aiHistory.slice(-10) }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    aiHistory.push({ role: "assistant", content: data.reply });

    // Persist history (last 40 messages, no context stored — just messages)
    try { localStorage.setItem(AI_HISTORY_KEY, JSON.stringify(aiHistory.slice(-40))); } catch (_) {}

  } catch (err) {
    aiHistory.push({
      role: "assistant",
      content: `Sorry, I couldn't reach the AI service right now. Please try again in a moment.\n\n_Error: ${err.message}_`,
    });
  }

  renderAiPanel();
  scrollAiToBottom();
  if (sendBtn) sendBtn.disabled = false;
  document.getElementById("aiInput")?.focus();
}

// ── FAB init ─────────────────────────────────────────────────
document.getElementById("aiFab")?.addEventListener("click", () => {
  aiPanelOpen ? closeAiAssistant() : openAiAssistant();
});

// Close on Escape
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && aiPanelOpen) closeAiAssistant();
});
