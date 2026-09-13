(function initialiseOnSiteDocumentStorage(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.OnSiteDocumentStorage = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createApi() {
  "use strict";

  const PDF_MODULE_URL = "/vendor/pdfjs/pdf.mjs";
  const PDF_WORKER_URL = "/vendor/pdfjs/pdf.worker.mjs";
  let pdfModulePromise = null;

  function legacyDataUrl(value) {
    const dataUrl = String(value || "");
    return dataUrl.startsWith("data:") ? dataUrl : "";
  }

  function normalizeFileReference(record) {
    if (!record || typeof record !== "object") return null;
    const dataUrl = legacyDataUrl(record.dataUrl || record.fileDataUrl);
    if (dataUrl) return { kind: "legacy_data_url", dataUrl };
    const source = record.storageRef || record.fileReference || record;
    const fileId = String(source?.fileId || source?.storageId || "").trim();
    const accessToken = String(source?.accessToken || source?.token || "").trim();
    if (!fileId || !accessToken) return null;
    return {
      kind: "stored_file",
      storageRef: {
        provider: String(source?.provider || "onsite_fs_v1"),
        fileId,
        accessToken,
      },
    };
  }

  function fileUrl(record, { download = false } = {}) {
    const normalized = normalizeFileReference(record);
    if (!normalized) return "";
    if (normalized.kind === "legacy_data_url") return normalized.dataUrl;
    const { fileId, accessToken } = normalized.storageRef;
    const params = new URLSearchParams({ token: accessToken });
    if (download) params.set("download", "1");
    return `/api/document-files/${encodeURIComponent(fileId)}?${params}`;
  }

  function referenceFields(record) {
    const normalized = normalizeFileReference(record);
    if (!normalized) return {};
    return normalized.kind === "legacy_data_url"
      ? { dataUrl: normalized.dataUrl }
      : { storageRef: normalized.storageRef };
  }

  async function upload(file, context = {}) {
    if (!file || typeof fetch !== "function") {
      throw new Error("The document could not be uploaded.");
    }
    const response = await fetch("/api/document-files", {
      method: "POST",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-OnSite-File-Name": encodeURIComponent(file.name || "document"),
        "X-OnSite-Actor-Id": context.actorId || "",
        "X-OnSite-Actor-Type": context.actorType || "",
        "X-OnSite-Owner-Id": context.ownerId || "",
        "X-OnSite-Owner-Type": context.ownerType || "",
        "X-OnSite-Company-Id": context.companyId || "",
        "X-OnSite-Project-Id": context.projectId || "",
        "X-OnSite-Purpose": context.purpose || "document",
        "X-OnSite-Access-Scope": context.accessScope || "restricted",
      },
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.file) {
      throw new Error(payload.error || "The document could not be uploaded.");
    }
    return payload.file;
  }

  async function remove(record) {
    const normalized = normalizeFileReference(record);
    if (!normalized || normalized.kind === "legacy_data_url") return false;
    const response = await fetch(fileUrl(record), { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "The document could not be removed.");
    }
    return true;
  }

  function dataUrlBytes(dataUrl) {
    const encoded = legacyDataUrl(dataUrl).split(",")[1] || "";
    if (!encoded) throw new Error("The legacy document data is unavailable.");
    const decode = typeof atob === "function"
      ? atob
      : (value) => Buffer.from(value, "base64").toString("binary");
    const binary = decode(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function dataUrlFile(dataUrl, fileName = "document") {
    const source = legacyDataUrl(dataUrl);
    const mimeType = source.slice(5, source.indexOf(";") > -1 ? source.indexOf(";") : source.indexOf(",")) || "application/octet-stream";
    const bytes = dataUrlBytes(source);
    return new File([bytes], fileName, { type: mimeType });
  }

  async function loadPdfModule() {
    if (!pdfModulePromise) {
      pdfModulePromise = import(PDF_MODULE_URL).then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        return pdfjs;
      }).catch((error) => {
        pdfModulePromise = null;
        throw error;
      });
    }
    return pdfModulePromise;
  }

  async function createPdfLoadingTask(record) {
    const pdfjs = await loadPdfModule();
    const normalized = normalizeFileReference(record);
    if (!normalized) throw new Error("The PDF file is unavailable.");
    return pdfjs.getDocument(
      normalized.kind === "legacy_data_url"
        ? { data: dataUrlBytes(normalized.dataUrl) }
        : { url: fileUrl(record) },
    );
  }

  async function renderPdf(container, record, { maxWidth = 760 } = {}) {
    if (!container) throw new Error("The PDF preview is unavailable.");
    const task = await createPdfLoadingTask(record);
    const pdf = await task.promise;
    container.replaceChildren();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(
        280,
        Math.min(maxWidth, container.clientWidth || maxWidth),
      );
      const viewport = page.getViewport({
        scale: Math.min(1.5, availableWidth / baseViewport.width),
      });
      const outputScale = Math.min(
        2,
        Number(globalThis.devicePixelRatio) || 1,
      );
      const canvas = document.createElement("canvas");
      canvas.className = "onsite-pdf-page";
      canvas.setAttribute("aria-label", `PDF page ${pageNumber} of ${pdf.numPages}`);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      container.appendChild(canvas);
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport,
        transform: outputScale === 1
          ? null
          : [outputScale, 0, 0, outputScale, 0, 0],
      }).promise;
    }
    return { task, pdf };
  }

  return {
    createPdfLoadingTask,
    dataUrlBytes,
    dataUrlFile,
    fileUrl,
    normalizeFileReference,
    referenceFields,
    remove,
    renderPdf,
    upload,
  };
});
