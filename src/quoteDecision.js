import fs from "node:fs/promises";
import path from "node:path";
import { postJson } from "./api.js";
import { buildFileDownloadUrl } from "./normalize.js";
import { quotePaths } from "./quotes.js";

const DETAIL_PATH = "/o/egp-portal-contractor-selection-v2/services/get-request-quote";

function safeFileName(name, fallback = "quyet-dinh-phe-duyet.pdf") {
  const cleaned = String(name || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function decisionDir(paths, notifyNo) {
  return path.join(paths.dataDir, "quote-decisions", safeFileName(notifyNo, "unknown"));
}

function manifestPath(dir) {
  return path.join(dir, "decision.json");
}

async function readManifest(dir) {
  try {
    return JSON.parse(await fs.readFile(manifestPath(dir), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function publicDecision(manifest, quoteId) {
  if (!manifest) {
    return { ok: true, available: false };
  }
  return {
    ok: true,
    available: Boolean(manifest.fileName),
    notifyNo: manifest.notifyNo || "",
    decisionDate: manifest.decisionDate || "",
    decisionNo: manifest.decisionNo || "",
    fileName: manifest.fileName || "",
    savedAt: manifest.savedAt || "",
    message: manifest.message || "",
    url: manifest.fileName
      ? `/api/quotes/${encodeURIComponent(quoteId)}/decision/file`
      : "",
  };
}

export async function readQuoteDecision(config, rootDir, quote) {
  const paths = quotePaths(config, rootDir);
  const dir = decisionDir(paths, quote.notifyNo);
  return publicDecision(await readManifest(dir), quote.id || quote.notifyNo);
}

async function fetchQuoteDetail(config, id) {
  const url = `${config.baseUrl}${DETAIL_PATH}`;
  const data = await postJson(url, { id });
  if (typeof data === "number") {
    throw new Error(`Cổng trả captcha/token (${data})`);
  }
  return data?.bidoRequestQuote || null;
}

async function downloadDecisionFile(config, fileId) {
  const url = buildFileDownloadUrl(config, { fileId });
  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: `${config.baseUrl}/web/guest/contractor-selection`,
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    throw new Error(`Tải quyết định phê duyệt lỗi ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const head = buffer.slice(0, 80).toString("utf8");
  if (buffer.length < 64 || head.includes("<html") || head.includes("<!DOCTYPE")) {
    throw new Error("Cổng không trả file quyết định phê duyệt");
  }
  return buffer;
}

export async function downloadQuoteDecision(config, rootDir, quote) {
  const paths = quotePaths(config, rootDir);
  const dir = decisionDir(paths, quote.notifyNo);
  await fs.mkdir(dir, { recursive: true });

  const detail = await fetchQuoteDetail(config, quote.id);
  if (!detail) {
    throw new Error("Không lấy được chi tiết yêu cầu báo giá");
  }

  const file = detail.requestQuoteFile || {};
  const fileId = file.decisionFileId || "";
  const fileName = safeFileName(file.decisionFileName || "quyet-dinh-phe-duyet.pdf");
  const base = {
    notifyNo: quote.notifyNo,
    decisionDate: file.decisionDate || "",
    decisionNo: file.decisionNo || "",
    fileName: "",
    savedAt: new Date().toISOString(),
    message: "",
  };

  if (!fileId) {
    base.message = "Gói này chưa có file quyết định phê duyệt trên muasamcong.";
    await fs.writeFile(manifestPath(dir), JSON.stringify(base, null, 2));
    return publicDecision(base, quote.id || quote.notifyNo);
  }

  const buffer = await downloadDecisionFile(config, fileId);
  const dest = path.join(dir, fileName);
  await fs.writeFile(dest, buffer);
  base.fileName = fileName;
  base.fileId = fileId;
  base.bytes = buffer.length;
  await fs.writeFile(manifestPath(dir), JSON.stringify(base, null, 2));
  return publicDecision(base, quote.id || quote.notifyNo);
}

export async function resolveDecisionFile(config, rootDir, quote) {
  const paths = quotePaths(config, rootDir);
  const dir = path.resolve(decisionDir(paths, quote.notifyNo));
  const manifest = await readManifest(dir);
  if (!manifest?.fileName) {
    return null;
  }
  const filePath = path.resolve(dir, path.basename(manifest.fileName));
  if (!filePath.startsWith(dir + path.sep)) {
    return null;
  }
  return { filePath, fileName: path.basename(filePath) };
}
