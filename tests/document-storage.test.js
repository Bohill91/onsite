"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  DocumentFileStoreError,
  createDocumentFileStore,
} = require("../document-file-store.js");
const storageClient = require("../document-storage.js");

async function expectStoreError(action, statusCode) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof DocumentFileStoreError);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

async function run() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "onsite-documents-"));
  try {
    const store = createDocumentFileStore({ rootDir, maxBytes: 1024 });
    const pdfBytes = Buffer.from("%PDF-1.4\n% OnSite storage test\n%%EOF\n");
    const reference = await store.save({
      data: pdfBytes,
      fileName: "site-pack.pdf",
      mimeType: "application/pdf",
      actorId: "company-1",
      actorType: "company",
      ownerId: "project-1",
      ownerType: "project",
      companyId: "company-1",
      projectId: "project-1",
      purpose: "project_requirement",
      accessScope: "company_project",
    });

    assert.match(reference.storageRef.fileId, /^file_[0-9a-f-]{36}$/);
    assert.ok(reference.storageRef.accessToken.length >= 40);
    assert.equal(reference.fileName, "site-pack.pdf");
    assert.equal(reference.mimeType, "application/pdf");
    assert.equal(reference.size, pdfBytes.length);

    const stored = await store.authorize(
      reference.storageRef.fileId,
      reference.storageRef.accessToken,
    );
    assert.deepEqual(await fs.readFile(stored.filePath), pdfBytes);
    assert.equal(stored.metadata.projectId, "project-1");
    assert.equal(stored.metadata.accessScope, "company_project");
    assert.equal(stored.metadata.accessToken, undefined);
    assert.equal(stored.metadata.sha256, reference.sha256);

    await expectStoreError(
      () => store.authorize(reference.storageRef.fileId, "wrong-token"),
      403,
    );
    await expectStoreError(
      () => store.authorize("file_00000000-0000-4000-8000-000000000000", "x"),
      404,
    );

    const storedRecord = storageClient.normalizeFileReference(reference);
    assert.equal(storedRecord.kind, "stored_file");
    assert.match(storageClient.fileUrl(reference), /^\/api\/document-files\/file_/);
    assert.match(storageClient.fileUrl(reference, { download: true }), /download=1/);

    const legacyDataUrl = `data:application/pdf;base64,${pdfBytes.toString("base64")}`;
    const legacyRecord = storageClient.normalizeFileReference({ dataUrl: legacyDataUrl });
    assert.equal(legacyRecord.kind, "legacy_data_url");
    assert.equal(storageClient.fileUrl({ dataUrl: legacyDataUrl }), legacyDataUrl);
    assert.deepEqual(Buffer.from(storageClient.dataUrlBytes(legacyDataUrl)), pdfBytes);

    assert.equal(
      await store.remove(
        reference.storageRef.fileId,
        reference.storageRef.accessToken,
      ),
      true,
    );
    await expectStoreError(
      () => store.authorize(
        reference.storageRef.fileId,
        reference.storageRef.accessToken,
      ),
      404,
    );

    await expectStoreError(
      () => store.save({
        data: Buffer.alloc(1025),
        fileName: "too-large.pdf",
        mimeType: "application/pdf",
        actorId: "company-1",
        ownerId: "project-1",
      }),
      413,
    );
  } finally {
    await fs.rm(rootDir, { recursive: true, force: true });
  }

  console.log("document storage tests passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
