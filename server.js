const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const OpenAI = require('openai');

const parsedPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isFinite(parsedPort) ? parsedPort : 5000;
const isReplit = !!(
  process.env.REPL_ID ||
  process.env.REPL_SLUG ||
  process.env.REPLIT_DEPLOYMENT
);
const HOST = process.env.HOST || (isReplit ? '0.0.0.0' : '127.0.0.1');

const mimeTypes = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ─── OpenAI client (Replit AI Integrations — no API key needed) ─────────────
function getOpenAIClient() {
  return new OpenAI({
    apiKey:  process.env.OPENAI_API_KEY  || 'replit',
    baseURL: process.env.OPENAI_API_BASE || undefined,
  });
}

// ─── Build system prompt from platform context ─────────────────────────────
function buildSystemPrompt(ctx) {
  const s = ctx?.summary || {};
  const workers  = (ctx?.workers  || []);
  const jobs     = (ctx?.jobs     || []);
  const disputes = (ctx?.openDisputes || []);
  const recentAtt = (ctx?.recentAttendance || []);

  const workerLines = workers.map(w =>
    `  - ${w.name} (${w.trade}): reliability ${w.reliability ?? '?'}%` +
    `, availability: ${w.availability}` +
    (w.totalShifts ? `, ${w.totalShifts} shifts, ${w.noShows} no-shows` : '') +
    (w.openDisputes ? `, ${w.openDisputes} open dispute(s)` : '') +
    (w.assignedJob ? `, assigned: ${w.assignedJob}` : ', unassigned')
  ).join('\n') || '  (none)';

  const jobLines = jobs.map(j =>
    `  - ${j.trade} at ${j.location}` +
    (j.start ? ` · starts ${new Date(j.start).toLocaleDateString('en-GB')}` : '') +
    (j.duration ? ` · ${j.duration}` : '') +
    ` · status: ${j.status || 'open'}` +
    (j.assignedWorker ? ` · assigned to ${j.assignedWorker}` : ' · UNASSIGNED')
  ).join('\n') || '  (none)';

  const disputeLines = disputes.map(d =>
    `  - ${d.worker}: ${d.originalStatus} on ${d.date} at ${d.site}` +
    ` · reason: "${d.reason}"` +
    (d.hasGpsEvidence ? ` · GPS: ${d.gpsDistance || 'recorded'}` : ' · no GPS evidence') +
    (d.comment ? ` · comment: "${d.comment}"` : '')
  ).join('\n') || '  (none)';

  const attLines = recentAtt.slice(0, 5).map(a =>
    `  - ${a.date}: ${a.onTime} on-time, ${a.late} late, ${a.noShow} no-show, ${a.siteCancelled} site-cancelled`
  ).join('\n') || '  (no records)';

  return `You are the OnSite operational assistant for a construction labour platform.

Today: ${ctx?.date || new Date().toLocaleDateString('en-GB')}

## Platform Overview
- Workers: ${s.totalWorkers || 0} total, ${s.availableWorkers || 0} available
- Jobs: ${s.totalJobs || 0} total, ${s.openJobs || 0} open/unassigned
- Open disputes: ${s.openDisputes || 0}
- Attendance recorded today: ${s.todayAttendanceRecorded || 0} records

## Workers
${workerLines}

## Job Requests
${jobLines}

## Open Attendance Disputes
${disputeLines}

## Recent Attendance (last 5 days)
${attLines}

## Your Role
You answer grounded operational questions about current OnSite project data only.
You explain:
- what the issue is
- why it matters
- what action is available in OnSite

You may recommend actions such as reviewing labour requirements, opening Attendance, checking documents, updating site information, or reviewing project health.
Do not behave like a general chatbot and do not answer unrelated questions.

## Hard Boundaries — YOU MUST NEVER:
- Make a final decision on compliance failures (flag for human review instead)
- Suspend, ban, or remove a worker (recommend it, state it requires admin approval)
- Determine a dispute outcome (present the evidence, state the decision is the admin's)
- Claim to have taken any irreversible action
- Invent facts, market claims, worker identities, payment outcomes, or functionality not present in the context
- Present yourself as a generic ChatGPT clone

Always be concise, factual, and clear when something requires human approval.
If a screen is relevant, name the exact OnSite place to go, such as "Project > Attendance" or "Project > Labour Requirements".
Use **bold** for names and key figures. Use bullet lists when helpful.`;
}

// ─── AI Chat endpoint ────────────────────────────────────────────────────────
async function handleAiChat(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', async () => {
    try {
      const { message, context, history = [] } = JSON.parse(body);
      if (!message?.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No message provided' }));
        return;
      }

      const systemPrompt = buildSystemPrompt(context);
      const openai = getOpenAIClient();

      // Build message array — include last N conversation turns (excluding current)
      const pastMessages = history
        .slice(0, -1)
        .slice(-8)
        .map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

      const completion = await openai.chat.completions.create({
        model:      'gpt-4.1-mini',
        max_tokens: 800,
        messages: [
          { role: 'system', content: systemPrompt },
          ...pastMessages,
          { role: 'user', content: message },
        ],
      });

      const reply = completion.choices[0]?.message?.content || 'No response from AI.';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ reply }));
    } catch (err) {
      console.error('[AI] Error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'AI service error' }));
    }
  });
}

// ─── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // AI chat API
  if (req.method === 'POST' && req.url === '/api/ai-chat') {
    return handleAiChat(req, res);
  }

  // Static files
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        fs.readFile(path.join(__dirname, 'index.html'), (err2, data2) => {
          if (err2) {
            res.writeHead(404);
            res.end('Not found');
          } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data2);
          }
        });
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OnSite server running at http://${HOST}:${PORT}/`);
});
