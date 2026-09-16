const http   = require('http');
const fs     = require('fs');
const path   = require('path');
const OpenAI = require('openai');
const {
  AuthServiceError,
  authTokensFromRequest,
  clearSessionCookies,
  createAuthService,
  sessionCookies,
} = require('./server-auth');
const {
  ProjectServiceError,
  createProjectService,
} = require('./server-projects');
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
const authService = createAuthService();
const projectService = createProjectService();

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

const pdfAssetModules = Object.freeze({
  '/vendor/pdfjs/pdf.mjs': 'pdfjs-dist/build/pdf.mjs',
  '/vendor/pdfjs/pdf.worker.mjs': 'pdfjs-dist/build/pdf.worker.mjs',
});

function resolvePdfAsset(requestPath) {
  const moduleId = pdfAssetModules[requestPath];
  if (!moduleId) return null;
  try {
    return require.resolve(moduleId);
  } catch (error) {
    console.error(`[PDF preview] Missing runtime dependency for ${requestPath}:`, error.message);
    return '';
  }
}

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

function sendJson(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(JSON.stringify(payload));
}

async function readJsonRequest(req, maxBytes = 1024 * 1024) {
  const contentLength = Number.parseInt(req.headers['content-length'] || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    req.resume();
    throw new AuthServiceError('The request is too large.', 413, 'REQUEST_TOO_LARGE');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new AuthServiceError('The request is too large.', 413, 'REQUEST_TOO_LARGE');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (_) {
    throw new AuthServiceError('Invalid JSON request.', 400, 'INVALID_JSON');
  }
}

function publicAuthError(error) {
  if (error instanceof AuthServiceError) return error;
  console.error('[Auth] Unexpected error:', error);
  return new AuthServiceError('Authentication service error.', 500, 'AUTH_INTERNAL_ERROR');
}

async function resolveAuthenticatedPrincipal(req) {
  return authService.restoreSession(authTokensFromRequest(req));
}

async function handleAuthApi(req, res, url) {
  try {
    if (req.method === 'GET' && url.pathname === '/api/auth/status') {
      sendJson(res, 200, { configured: authService.configured });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/auth/session') {
      const result = await resolveAuthenticatedPrincipal(req);
      const cookies = sessionCookies(req, result.session);
      sendJson(
        res,
        200,
        { principal: result.principal },
        cookies.length ? { 'Set-Cookie': cookies, Vary: 'Cookie' } : { Vary: 'Cookie' },
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register/worker') {
      const result = await authService.registerWorker(await readJsonRequest(req));
      const cookies = sessionCookies(req, result.session);
      sendJson(
        res,
        result.requiresEmailConfirmation ? 202 : 201,
        {
          principal: result.requiresEmailConfirmation ? null : result.principal,
          requiresEmailConfirmation: result.requiresEmailConfirmation,
        },
        cookies.length ? { 'Set-Cookie': cookies, Vary: 'Cookie' } : {},
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/register/company') {
      const result = await authService.registerCompany(await readJsonRequest(req));
      const cookies = sessionCookies(req, result.session);
      sendJson(
        res,
        result.requiresEmailConfirmation ? 202 : 201,
        {
          principal: result.requiresEmailConfirmation ? null : result.principal,
          requiresEmailConfirmation: result.requiresEmailConfirmation,
        },
        cookies.length ? { 'Set-Cookie': cookies, Vary: 'Cookie' } : {},
      );
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const result = await authService.login(await readJsonRequest(req));
      sendJson(res, 200, { principal: result.principal }, {
        'Set-Cookie': sessionCookies(req, result.session),
        Vary: 'Cookie',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
      const tokens = authTokensFromRequest(req);
      if (authService.configured) await authService.logout(tokens);
      sendJson(res, 200, { ok: true }, {
        'Set-Cookie': clearSessionCookies(req),
        Vary: 'Cookie',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/password/recovery') {
      await authService.requestPasswordReset(await readJsonRequest(req));
      sendJson(res, 202, { ok: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/password/adopt') {
      const result = await authService.adoptSession(await readJsonRequest(req));
      sendJson(res, 200, { principal: result.principal }, {
        'Set-Cookie': sessionCookies(req, result.session),
        Vary: 'Cookie',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/auth/password/reset') {
      const payload = await readJsonRequest(req);
      await authService.resetPassword({
        ...authTokensFromRequest(req),
        password: payload.password,
      });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'PATCH' && url.pathname === '/api/auth/worker-profile') {
      const result = await authService.updateWorkerProfile({
        ...authTokensFromRequest(req),
        changes: await readJsonRequest(req),
      });
      const cookies = sessionCookies(req, result.session);
      sendJson(
        res,
        200,
        { principal: result.principal },
        cookies.length ? { 'Set-Cookie': cookies, Vary: 'Cookie' } : { Vary: 'Cookie' },
      );
      return;
    }

    sendJson(res, 404, { error: 'Authentication route not found.' });
  } catch (rawError) {
    const error = publicAuthError(rawError);
    const headers = error.statusCode === 401
      ? { 'Set-Cookie': clearSessionCookies(req), Vary: 'Cookie' }
      : {};
    sendJson(res, error.statusCode, { error: error.message, code: error.code }, headers);
  }
}

function publicProjectError(error) {
  if (error instanceof ProjectServiceError || error instanceof AuthServiceError) {
    return error;
  }
  console.error('[Projects] Unexpected error:', error);
  return new ProjectServiceError(
    'Project service error.',
    500,
    'PROJECT_INTERNAL_ERROR',
  );
}

async function handleProjectApi(req, res, url) {
  try {
    const restored = await resolveAuthenticatedPrincipal(req);
    const cookies = sessionCookies(req, restored.session);
    const responseHeaders = cookies.length
      ? { 'Set-Cookie': cookies, Vary: 'Cookie' }
      : { Vary: 'Cookie' };
    const projectMatch = url.pathname.match(/^\/api\/projects\/([0-9a-f-]{36})$/i);

    if (req.method === 'GET' && url.pathname === '/api/projects') {
      const projects = await projectService.list(restored.principal);
      sendJson(res, 200, { projects }, responseHeaders);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/projects') {
      const project = await projectService.create(
        restored.principal,
        await readJsonRequest(req, 2 * 1024 * 1024),
      );
      sendJson(res, 201, { project }, responseHeaders);
      return;
    }

    if (req.method === 'GET' && projectMatch) {
      const project = await projectService.get(restored.principal, projectMatch[1]);
      sendJson(res, 200, { project }, responseHeaders);
      return;
    }

    if (req.method === 'PATCH' && projectMatch) {
      const project = await projectService.update(
        restored.principal,
        projectMatch[1],
        await readJsonRequest(req, 2 * 1024 * 1024),
      );
      sendJson(res, 200, { project }, responseHeaders);
      return;
    }

    sendJson(res, projectMatch ? 405 : 404, {
      error: projectMatch ? 'Method not allowed.' : 'Project route not found.',
      code: projectMatch ? 'METHOD_NOT_ALLOWED' : 'PROJECT_NOT_FOUND',
    });
  } catch (rawError) {
    const error = publicProjectError(rawError);
    const headers = error.statusCode === 401
      ? { 'Set-Cookie': clearSessionCookies(req), Vary: 'Cookie' }
      : { Vary: 'Cookie' };
    sendJson(res, error.statusCode, { error: error.message, code: error.code }, headers);
  }
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

  if (url.pathname.startsWith('/api/auth/')) {
    handleAuthApi(req, res, url);
    return;
  }

  if (url.pathname === '/api/projects' || url.pathname.startsWith('/api/projects/')) {
    handleProjectApi(req, res, url);
    return;
  }

  // AI chat API
  if (req.method === 'POST' && url.pathname === '/api/ai-chat') {
    return handleAiChat(req, res);
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

  // Static files
  const requestPath = url.pathname;
  const isPdfAsset = Object.hasOwn(pdfAssetModules, requestPath);
  const resolvedPdfAsset = resolvePdfAsset(requestPath);
  if (isPdfAsset && !resolvedPdfAsset) {
    sendJson(res, 503, {
      error: 'PDF preview assets are unavailable. Install application dependencies before starting OnSite.',
    });
    return;
  }
  const filePath = resolvedPdfAsset ||
    path.join(__dirname, requestPath === '/' ? 'index.html' : requestPath);
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (isPdfAsset) {
        console.error(`[PDF preview] Could not read ${requestPath}:`, err.message);
        sendJson(res, 503, { error: 'PDF preview assets are unavailable.' });
        return;
      }
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
      res.writeHead(200, {
        'Content-Type': contentType,
        ...(isPdfAsset ? { 'X-Content-Type-Options': 'nosniff' } : {}),
      });
      res.end(data);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`OnSite server running at http://${HOST}:${PORT}/`);
});
