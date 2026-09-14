"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const rootDir = path.resolve(__dirname, "..");

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function startServer(port, storageDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: rootDir,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      ONSITE_FILE_STORAGE_DIR: storageDir,
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server did not start.\n${output}`));
    }, 10000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited with ${code}.\n${output}`));
    });
    const ready = () => {
      if (!output.includes("OnSite server running")) {
        setTimeout(ready, 20);
        return;
      }
      clearTimeout(timeout);
      resolve(child);
    };
    ready();
  });
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function run() {
  const replitConfig = await fs.readFile(path.join(rootDir, ".replit"), "utf8");
  const indexHtml = await fs.readFile(path.join(rootDir, "index.html"), "utf8");
  const appSource = await fs.readFile(path.join(rootDir, "app.js"), "utf8");
  const authSource = await fs.readFile(path.join(rootDir, "auth.js"), "utf8");
  assert.match(replitConfig, /modules = \["nodejs-22"/);
  assert.match(replitConfig, /args = "npm ci --omit=dev && HOST=0\.0\.0\.0 PORT=5000 npm start"/);
  assert.match(replitConfig, /build = "npm ci --omit=dev"/);
  assert.match(replitConfig, /run = "npm start"/);
  const tabAddIndex = indexHtml.indexOf('id="tab-add"');
  const workerFormIndex = indexHtml.indexOf('id="workerForm"');
  const requestLabourIndex = indexHtml.indexOf('id="tab-request-labour"');
  assert.ok(tabAddIndex > -1 && tabAddIndex < workerFormIndex);
  assert.ok(workerFormIndex < requestLabourIndex);
  assert.match(appSource, /if \(!syncLegacyWorkerFormAccess\(getSessionUser\(\)\)\) return;/);
  assert.match(
    indexHtml,
    /id="forgotEmail"[^>]*required[^>]*disabled|id="forgotEmail"[^>]*disabled[^>]*required/,
  );
  assert.match(authSource, /forgotEmail\.disabled = !forgotIsActive/);
  assert.match(authSource, /getElementById\('forgotEmail'\)\.disabled = true/);

  const storageDir = await fs.mkdtemp(path.join(os.tmpdir(), "onsite-runtime-"));
  const port = await freePort();
  let server;
  try {
    server = await startServer(port, storageDir);
    const baseUrl = `http://127.0.0.1:${port}`;
    const authStatus = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(authStatus.status, 200);
    assert.deepEqual(await authStatus.json(), { configured: false });
    const session = await fetch(`${baseUrl}/api/auth/session`);
    assert.equal(session.status, 503);
    assert.equal((await session.json()).code, "AUTH_NOT_CONFIGURED");
    for (const asset of ["pdf.mjs", "pdf.worker.mjs"]) {
      const response = await fetch(`${baseUrl}/vendor/pdfjs/${asset}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") || "", /^application\/javascript/);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      const source = await response.text();
      assert.ok(source.length > 100000);
      assert.doesNotMatch(source.slice(0, 200), /<!doctype html>/i);
    }

    const pdfBytes = Buffer.from("%PDF-1.4\n% OnSite runtime regression test\n%%EOF\n");
    const uploadResponse = await fetch(`${baseUrl}/api/document-files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf",
        "X-OnSite-File-Name": "runtime-check.pdf",
        "X-OnSite-Actor-Id": "company-test",
        "X-OnSite-Actor-Type": "company",
        "X-OnSite-Owner-Id": "project-test",
        "X-OnSite-Owner-Type": "project",
      },
      body: pdfBytes,
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = (await uploadResponse.json()).file;
    const filePath = `/api/document-files/${uploaded.storageRef.fileId}`;
    const denied = await fetch(`${baseUrl}${filePath}?token=invalid`);
    assert.equal(denied.status, 403);
    const storedPdf = await fetch(
      `${baseUrl}${filePath}?token=${encodeURIComponent(uploaded.storageRef.accessToken)}`,
    );
    assert.equal(storedPdf.status, 200);
    assert.equal(storedPdf.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await storedPdf.arrayBuffer()), pdfBytes);
    const download = await fetch(
      `${baseUrl}${filePath}?token=${encodeURIComponent(uploaded.storageRef.accessToken)}&download=1`,
    );
    assert.match(download.headers.get("content-disposition") || "", /^attachment;/);
  } finally {
    await stopServer(server);
    await fs.rm(storageDir, { recursive: true, force: true });
  }

  console.log("runtime regression tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
