const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
const {
  DocumentFileStoreError,
  createDocumentFileStore,
  safeFileName,
} = require('./document-file-store');

const parsedPort = Number.parseInt(process.env.PORT || '', 10);
const PORT = Number.isFinite(parsedPort) ? parsedPort : 5000;
const isReplit = !!(
  process.env.REPL_ID ||
  process.env.REPL_SLUG ||
  process.env.REPLIT_DEPLOYMENT
);
const HOST = process.env.HOST || (isReplit ? '0.0.0.0' : '127.0.0.1');
const documentFileStore = createDocumentFileStore({
  rootDir: process.env.ONSITE_FILE_STORAGE_DIR || path.join(__dirname, '.onsite-storage'),
});

const mimeTypes = {
  '.html': 'text/html',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
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

// ─── Canonical company account recovery ─────────────────────────────────────
// The prototype stores ordinary accounts in browser localStorage. This narrow
// bridge lets the recovered company account bootstrap a fresh browser profile
// using the workspace-managed password without ever returning that password.
function passwordsMatch(actual, expected) {
  if (typeof actual !== 'string' || typeof expected !== 'string') return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function handleAuthRecovery(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 4096) req.destroy();
  });
  req.on('end', () => {
    try {
      const payload = JSON.parse(body || '{}');
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
      const password = typeof payload.password === 'string' ? payload.password : '';
      const expectedPassword = process.env.ONSITE_ACCOUNT_PASSWORD;

      if (
        email !== 'luke_bohill@outlook.com' ||
        !passwordsMatch(password, expectedPassword)
      ) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Incorrect email or password.' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        user: {
          id: 'user-1789138666146-7a64bd748b1e',
          type: 'company',
          name: 'Luke Bohill',
          companyName: 'Bohill Electrical Ltd',
          email: 'luke_bohill@outlook.com',
          verificationStatus: 'pending',
          companyVerificationStatus: 'pending',
          vatVerificationStatus: 'unverified',
        },
      }));
    } catch (_) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid recovery request.' }));
    }
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function requestHeader(req, name, maxLength = 200) {
  const value = Array.isArray(req.headers[name])
    ? req.headers[name][0]
    : req.headers[name];
  return String(value || '').trim().slice(0, maxLength);
}

function readRequestBytes(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      req.resume();
      reject(new DocumentFileStoreError('The document is too large.', 413));
      return;
    }
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        chunks.length = 0;
        reject(new DocumentFileStoreError('The document is too large.', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!rejected) resolve(Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

function documentAccessToken(req, url) {
  const authorization = requestHeader(req, 'authorization', 400);
  if (authorization.startsWith('Bearer ')) return authorization.slice(7).trim();
  return url.searchParams.get('token') || '';
}

async function handleDocumentFileUpload(req, res) {
  try {
    const actorId = requestHeader(req, 'x-onsite-actor-id', 160);
    const ownerId = requestHeader(req, 'x-onsite-owner-id', 160);
    if (!actorId || !ownerId) {
      throw new DocumentFileStoreError('Document ownership is required.', 400);
    }
    let fileName = 'document';
    try {
      fileName = decodeURIComponent(requestHeader(req, 'x-onsite-file-name', 600));
    } catch (_) {}
    const data = await readRequestBytes(req, documentFileStore.maxBytes);
    const file = await documentFileStore.save({
      data,
      fileName,
      mimeType: requestHeader(req, 'content-type', 120),
      actorId,
      actorType: requestHeader(req, 'x-onsite-actor-type', 40),
      ownerId,
      ownerType: requestHeader(req, 'x-onsite-owner-type', 40),
      companyId: requestHeader(req, 'x-onsite-company-id', 160),
      projectId: requestHeader(req, 'x-onsite-project-id', 160),
      purpose: requestHeader(req, 'x-onsite-purpose', 80),
      accessScope: requestHeader(req, 'x-onsite-access-scope', 40),
    });
    sendJson(res, 201, { file });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('[Document storage] Upload failed:', error);
    sendJson(res, statusCode, { error: error.message || 'Document upload failed.' });
  }
}

async function handleDocumentFileAccess(req, res, url, fileId) {
  try {
    const accessToken = documentAccessToken(req, url);
    const record = await documentFileStore.authorize(fileId, accessToken);
    if (req.method === 'DELETE') {
      await documentFileStore.remove(fileId, accessToken);
      sendJson(res, 200, { removed: true });
      return;
    }
    const disposition = url.searchParams.get('download') === '1'
      ? 'attachment'
      : 'inline';
    const fileName = safeFileName(record.metadata.fileName);
    const asciiFileName = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
    const headers = {
      'Content-Type': record.metadata.mimeType,
      'Content-Length': record.metadata.size,
      'Content-Disposition': `${disposition}; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    };
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(record.filePath).on('error', error => {
      console.error('[Document storage] Read failed:', error);
      if (!res.headersSent) sendJson(res, 500, { error: 'Document read failed.' });
      else res.destroy(error);
    }).pipe(res);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('[Document storage] Access failed:', error);
    sendJson(res, statusCode, { error: error.message || 'Document access failed.' });
  }
}

// ─── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // AI chat API
  if (req.method === 'POST' && url.pathname === '/api/ai-chat') {
    return handleAiChat(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/recover') {
    return handleAuthRecovery(req, res);
  }

  if (req.method === 'POST' && url.pathname === '/api/document-files') {
    handleDocumentFileUpload(req, res);
    return;
  }

  const documentFileMatch = url.pathname.match(/^\/api\/document-files\/(file_[0-9a-f-]{36})$/);
  if (documentFileMatch && ['GET', 'HEAD', 'DELETE'].includes(req.method)) {
    handleDocumentFileAccess(req, res, url, documentFileMatch[1]);
    return;
  }

  if (url.pathname.startsWith('/api/document-files')) {
    sendJson(res, documentFileMatch ? 405 : 404, {
      error: documentFileMatch ? 'Method not allowed.' : 'Document file not found.',
    });
    return;
  }

  const pdfAssetRoutes = {
    '/vendor/pdfjs/pdf.mjs': path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.mjs'),
    '/vendor/pdfjs/pdf.worker.mjs': path.join(__dirname, 'node_modules/pdfjs-dist/build/pdf.worker.mjs'),
  };

  // Static files
  const requestPath = url.pathname;
  const filePath = pdfAssetRoutes[requestPath] ||
    path.join(__dirname, requestPath === '/' ? 'index.html' : requestPath);
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
