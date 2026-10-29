import fs from "node:fs/promises";
import path from "node:path";
import { postJson } from "./api.js";
import { buildFileDownloadUrl } from "./normalize.js";

const HSMT_PATH =
  "/o/egp-portal-contractor-selection-v2/services/lcnt_tbmt_hsmt";

/** Chương III = C3; Chương V thường gắn chapterCode P2 (Yêu cầu kỹ thuật). */
const CHAPTER_RULES = {
  "chuong-3": {
    label: "Chương III",
    matchChapter: (code) => code === "C3",
    matchForm: (formCode, name = "") =>
      formCode === "C3" || /chương\s*iii\b|chuong\s*iii\b|chương\s*3\b/i.test(name),
  },
  "chuong-5": {
    label: "Chương V",
    matchChapter: (code) => code === "P2" || code === "C5",
    matchForm: (formCode, name = "") =>
      formCode === "BD.DT.02.0792" ||
      /chương\s*v\b|chuong\s*v\b|chương\s*5\b|yêu cầu về kỹ thuật|yeu cau ve ky thuat/i.test(
        name,
      ),
  },
};

function safeFileName(name, fallback = "file.bin") {
  const cleaned = String(name || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  return cleaned || fallback;
}

function parseMaybeJson(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== "{" && trimmed[0] !== "[")) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function collectFileRefs(node, files = [], seen = new Set()) {
  if (!node || typeof node !== "object") {
    return files;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectFileRefs(item, files, seen);
    }
    return files;
  }

  const fileId = node.fileId || node.publicFileId || "";
  const fileName = node.fileName || node.name || "";
  if (fileId && typeof fileId === "string") {
    const key = fileId;
    if (!seen.has(key)) {
      seen.add(key);
      files.push({
        fileId,
        fileName: fileName || fileId,
      });
    } else if (fileName) {
      const existing = files.find((item) => item.fileId === fileId);
      if (existing && existing.fileName === existing.fileId) {
        existing.fileName = fileName;
      }
    }
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === "sharedFiles" && Array.isArray(value)) {
      for (const id of value) {
        if (typeof id === "string" && id && !seen.has(id)) {
          seen.add(id);
          files.push({ fileId: id, fileName: id });
        }
      }
      continue;
    }
    if (value && typeof value === "object") {
      collectFileRefs(value, files, seen);
    }
  }

  return files;
}

function confNameByFormCode(confList, formCode) {
  if (!formCode || !Array.isArray(confList)) {
    return "";
  }
  const hit = confList.find((item) => item.code === formCode || item.pcode === formCode);
  return hit?.name || hit?.tempName || "";
}

function classifyChapter(dto, confList) {
  const chapterCode = String(dto.chapterCode || "");
  const formCode = String(dto.formCode || "");
  const confName = confNameByFormCode(confList, formCode) || confNameByFormCode(confList, chapterCode);

  for (const [folder, rule] of Object.entries(CHAPTER_RULES)) {
    if (rule.matchChapter(chapterCode) || rule.matchForm(formCode, confName)) {
      return folder;
    }
  }
  return null;
}

function extractChapterFiles(hsmt) {
  const confList = hsmt?.bidaInvChapterConfList || [];
  const dtos = Array.isArray(hsmt?.bidoInvBiddingDTO) ? hsmt.bidoInvBiddingDTO : [];
  const buckets = {
    "chuong-3": [],
    "chuong-5": [],
  };
  const seenByChapter = {
    "chuong-3": new Set(),
    "chuong-5": new Set(),
  };

  for (const dto of dtos) {
    const chapter = classifyChapter(dto, confList);
    if (!chapter) {
      continue;
    }

    const refs = [
      ...collectFileRefs(parseMaybeJson(dto.formValue)),
      ...collectFileRefs(parseMaybeJson(dto.formContent)),
      ...collectFileRefs(dto.invFileOutDTO),
    ];

    for (const ref of refs) {
      if (seenByChapter[chapter].has(ref.fileId)) {
        continue;
      }
      seenByChapter[chapter].add(ref.fileId);
      buckets[chapter].push({
        ...ref,
        formCode: dto.formCode || "",
        chapterCode: dto.chapterCode || "",
        chapterLabel: CHAPTER_RULES[chapter].label,
      });
    }
  }

  return buckets;
}

export async function fetchHsmtDetail(config, tender) {
  const raw = tender.raw || tender;
  const id = raw.id || raw.notifyId || tender.id || "";
  const processApply = raw.processApply || tender.processApply || "LDT";
  if (!id) {
    throw new Error("Thiếu notifyId để lấy HSMT");
  }

  const url = `${config.baseUrl}${HSMT_PATH}?token=x`;
  const data = await postJson(url, { id, processApply });

  if (typeof data === "number") {
    throw new Error(`HSMT bị chặn captcha/token (${data})`);
  }

  return data;
}

async function downloadBinary(config, fileId) {
  const url = buildFileDownloadUrl(config, { fileId });
  if (!url) {
    throw new Error("Không tạo được URL tải file");
  }

  const response = await fetch(url, {
    headers: {
      Accept: "*/*",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: `${config.baseUrl}/web/guest/contractor-selection`,
    },
  });

  if (!response.ok) {
    throw new Error(`Tải file lỗi ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 64) {
    const head = buffer.toString("utf8").slice(0, 80);
    if (head.includes("{") || head.includes("<!DOCTYPE") || head.includes("<html")) {
      throw new Error(`Phản hồi không phải file: ${head}`);
    }
  }

  let fileName = "";
  const disposition = response.headers.get("content-disposition") || "";
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (utfMatch) {
    try {
      fileName = decodeURIComponent(utfMatch[1]);
    } catch {
      fileName = utfMatch[1];
    }
  } else if (plainMatch) {
    fileName = plainMatch[1];
  }

  return { buffer, fileName, url };
}

async function ensureUniquePath(dir, fileName) {
  let candidate = path.join(dir, safeFileName(fileName));
  if (!(await exists(candidate))) {
    return candidate;
  }

  const ext = path.extname(candidate);
  const base = path.basename(candidate, ext);
  for (let i = 2; i < 50; i += 1) {
    candidate = path.join(dir, `${base}-${i}${ext}`);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  return path.join(dir, `${base}-${Date.now()}${ext}`);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function resolveHsmtDir(paths, notifyNo) {
  const root = paths.hsmtDir || path.join(paths.dataDir, "hsmt");
  return path.join(root, safeFileName(notifyNo, "unknown"));
}

export async function readHsmtManifest(paths, notifyNo) {
  if (!notifyNo) {
    return null;
  }
  const manifestPath = path.join(resolveHsmtDir(paths, notifyNo), "manifest.json");
  try {
    return JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    return null;
  }
}

/** Gắn URL tải local cho UI. */
export function decorateHsmtResult(result, tenderId) {
  if (!result) {
    return null;
  }
  const id = encodeURIComponent(tenderId || result.notifyNo || "");
  const files = (result.files || []).map((file) => ({
    ...file,
    name: file.fileName,
    section: file.chapterLabel || file.chapter,
    url: `/api/tenders/${id}/hsmt/file?chapter=${encodeURIComponent(file.chapter)}&name=${encodeURIComponent(file.fileName)}`,
  }));
  return { ...result, files };
}

/**
 * Tải file Chương III + Chương V của một gói thầu về data/hsmt/{notifyNo}/.
 */
export async function downloadHsmtChapters(config, tender, paths, options = {}) {
  const notifyNo = tender.notifyNo || tender.raw?.notifyNo || "";
  if (!notifyNo) {
    return { ok: false, notifyNo: "", error: "Thiếu notifyNo", files: [] };
  }

  const tenderDir = resolveHsmtDir(paths, notifyNo);
  const manifestPath = path.join(tenderDir, "manifest.json");
  const force = Boolean(options.force);

  if (!force && (await exists(manifestPath))) {
    try {
      const existing = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (existing?.ok && (existing.files?.length || 0) >= 0) {
        return { ...existing, skipped: true, notifyNo };
      }
    } catch {
      // tiếp tục tải lại nếu manifest hỏng
    }
  }

  let hsmt;
  try {
    hsmt = await fetchHsmtDetail(config, tender);
  } catch (error) {
    const result = {
      ok: false,
      notifyNo,
      error: error.message,
      files: [],
      downloadedAt: new Date().toISOString(),
    };
    await fs.mkdir(tenderDir, { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return result;
  }

  const buckets = extractChapterFiles(hsmt);
  const saved = [];
  const errors = [];

  for (const [folder, refs] of Object.entries(buckets)) {
    if (!refs.length) {
      continue;
    }
    const chapterDir = path.join(tenderDir, folder);
    await fs.mkdir(chapterDir, { recursive: true });

    for (const ref of refs) {
      try {
        const { buffer, fileName, url } = await downloadBinary(config, ref.fileId);
        const finalName = safeFileName(ref.fileName || fileName || `${ref.fileId}.bin`);
        const dest = await ensureUniquePath(chapterDir, finalName);
        await fs.writeFile(dest, buffer);
        saved.push({
          chapter: folder,
          chapterLabel: ref.chapterLabel,
          fileId: ref.fileId,
          fileName: path.basename(dest),
          bytes: buffer.length,
          relativePath: path.relative(paths.dataDir, dest).replace(/\\/g, "/"),
          sourceUrl: url,
          formCode: ref.formCode,
          chapterCode: ref.chapterCode,
        });
      } catch (error) {
        errors.push({
          chapter: folder,
          fileId: ref.fileId,
          fileName: ref.fileName,
          error: error.message,
        });
      }
    }
  }

  const result = {
    ok: errors.length === 0,
    notifyNo,
    downloadedAt: new Date().toISOString(),
    chapters: {
      "chuong-3": buckets["chuong-3"].length,
      "chuong-5": buckets["chuong-5"].length,
    },
    files: saved,
    errors,
  };

  await fs.mkdir(tenderDir, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

/**
 * Tải Chương 3+5 cho danh sách gói (thường là gói mới sau scan).
 */
export async function downloadHsmtForTenders(config, tenders, paths, options = {}) {
  const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 2, 5));
  const list = Array.isArray(tenders) ? tenders : [];
  const results = [];
  let index = 0;

  async function worker() {
    while (index < list.length) {
      const current = index;
      index += 1;
      const tender = list[current];
      try {
        const result = await downloadHsmtChapters(config, tender, paths, options);
        results[current] = result;
      } catch (error) {
        results[current] = {
          ok: false,
          notifyNo: tender?.notifyNo || "",
          error: error.message,
          files: [],
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, () => worker()));

  const fresh = results.filter((item) => item && !item.skipped);
  const failed = fresh.filter((item) => !item.ok).length;
  const skipped = results.filter((item) => item?.skipped).length;
  const files = fresh.reduce((sum, item) => sum + (item?.files?.length || 0), 0);

  return {
    ok: failed === 0,
    tenders: list.length,
    downloaded: fresh.length,
    skipped,
    failed,
    files,
    results,
  };
}
