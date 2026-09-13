"use strict";

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const FILE_ID_PATTERN = /^file_[0-9a-f-]{36}$/;
const ACCESS_SCOPES = new Set([
  "worker_private",
  "company_worker",
  "company_project",
  "restricted",
]);

class DocumentFileStoreError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.name = "DocumentFileStoreError";
    this.statusCode = statusCode;
  }
}

function cleanText(value, maxLength = 200) {
  return String(value || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function safeFileName(value) {
  const fileName = cleanText(value, 180)
    .replace(/[\\/]/g, "-")
    .replace(/^\.+/, "");
  return fileName || "document";
}

function safeMimeType(value) {
  const mimeType = cleanText(value, 120).toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(
    mimeType,
  )
    ? mimeType
    : "application/octet-stream";
}

function tokenDigest(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function secureDigestMatch(actual, expected) {
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected || ""));
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function publicReference(metadata, accessToken) {
  return {
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    uploadedAt: metadata.createdAt,
    sha256: metadata.sha256,
    storageRef: {
      provider: "onsite_fs_v1",
      fileId: metadata.id,
      accessToken,
    },
  };
}

function createDocumentFileStore({ rootDir, maxBytes = 12 * 1024 * 1024 } = {}) {
  if (!rootDir) throw new Error("A document storage directory is required.");
  const contentDir = path.join(rootDir, "content");
  const metadataDir = path.join(rootDir, "metadata");

  async function ensureDirectories() {
    await Promise.all([
      fs.mkdir(contentDir, { recursive: true, mode: 0o700 }),
      fs.mkdir(metadataDir, { recursive: true, mode: 0o700 }),
    ]);
  }

  function validateFileId(fileId) {
    const value = String(fileId || "");
    if (!FILE_ID_PATTERN.test(value)) {
      throw new DocumentFileStoreError("Document file not found.", 404);
    }
    return value;
  }

  function metadataPath(fileId) {
    return path.join(metadataDir, `${validateFileId(fileId)}.json`);
  }

  function contentPath(fileId) {
    return path.join(contentDir, `${validateFileId(fileId)}.bin`);
  }

  async function save({
    data,
    fileName,
    mimeType,
    actorId,
    actorType,
    ownerId,
    ownerType,
    companyId = "",
    projectId = "",
    purpose = "document",
    accessScope = "restricted",
  }) {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data || "");
    if (!bytes.length) {
      throw new DocumentFileStoreError("The uploaded document is empty.", 400);
    }
    if (bytes.length > maxBytes) {
      throw new DocumentFileStoreError(
        `Documents must be ${Math.floor(maxBytes / (1024 * 1024))} MB or smaller.`,
        413,
      );
    }
    const cleanActorId = cleanText(actorId, 160);
    const cleanOwnerId = cleanText(ownerId, 160);
    if (!cleanActorId || !cleanOwnerId) {
      throw new DocumentFileStoreError("Document ownership is required.", 400);
    }
    await ensureDirectories();
    const id = `file_${crypto.randomUUID()}`;
    const accessToken = crypto.randomBytes(32).toString("base64url");
    const metadata = {
      id,
      fileName: safeFileName(fileName),
      mimeType: safeMimeType(mimeType),
      size: bytes.length,
      sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      accessTokenHash: tokenDigest(accessToken),
      actorId: cleanActorId,
      actorType: cleanText(actorType, 40),
      ownerId: cleanOwnerId,
      ownerType: cleanText(ownerType, 40),
      companyId: cleanText(companyId, 160),
      projectId: cleanText(projectId, 160),
      purpose: cleanText(purpose, 80) || "document",
      accessScope: ACCESS_SCOPES.has(accessScope) ? accessScope : "restricted",
      createdAt: new Date().toISOString(),
    };
    const nonce = crypto.randomBytes(8).toString("hex");
    const tempContent = `${contentPath(id)}.${nonce}.tmp`;
    const tempMetadata = `${metadataPath(id)}.${nonce}.tmp`;
    try {
      await fs.writeFile(tempContent, bytes, { mode: 0o600, flag: "wx" });
      await fs.writeFile(tempMetadata, JSON.stringify(metadata), {
        mode: 0o600,
        flag: "wx",
      });
      await fs.rename(tempContent, contentPath(id));
      await fs.rename(tempMetadata, metadataPath(id));
    } catch (error) {
      await Promise.allSettled([fs.unlink(tempContent), fs.unlink(tempMetadata)]);
      throw error;
    }
    return publicReference(metadata, accessToken);
  }

  async function authorize(fileId, accessToken) {
    const id = validateFileId(fileId);
    let metadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataPath(id), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) {
        throw new DocumentFileStoreError("Document file not found.", 404);
      }
      throw error;
    }
    if (!secureDigestMatch(tokenDigest(accessToken), metadata.accessTokenHash)) {
      throw new DocumentFileStoreError("Document access is not authorised.", 403);
    }
    return { metadata, filePath: contentPath(id) };
  }

  async function remove(fileId, accessToken) {
    const record = await authorize(fileId, accessToken);
    await Promise.allSettled([
      fs.unlink(record.filePath),
      fs.unlink(metadataPath(record.metadata.id)),
    ]);
    return true;
  }

  return { save, authorize, remove, maxBytes };
}

module.exports = {
  ACCESS_SCOPES,
  DocumentFileStoreError,
  createDocumentFileStore,
  safeFileName,
  safeMimeType,
};
