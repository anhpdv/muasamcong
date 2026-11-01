import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PYTHON_CANDIDATES = ["python", "py", "python3"];
const EXTRACT_SCRIPT_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/extract-pdf-text.py",
);

function runPython(args, input) {
  return new Promise((resolve, reject) => {
    let lastError = null;

    const tryNext = (index) => {
      if (index >= PYTHON_CANDIDATES.length) {
        reject(lastError || new Error("Không tìm thấy Python để đọc PDF"));
        return;
      }

      const bin = PYTHON_CANDIDATES[index];
      const child = spawn(bin, args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        lastError = error;
        tryNext(index + 1);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
          return;
        }
        if (stderr.includes("No module named") || stderr.toLowerCase().includes("pymupdf")) {
          reject(new Error(`Thiếu thư viện PyMuPDF: ${stderr.slice(0, 200)}`));
          return;
        }
        lastError = new Error(stderr.trim() || `Python exit ${code}`);
        // thử interpreter khác nếu lệnh không chạy
        if (/not recognized|No such file|ENOENT/i.test(String(lastError))) {
          tryNext(index + 1);
          return;
        }
        reject(lastError);
      });

      if (input) {
        child.stdin.end(input);
      } else {
        child.stdin.end();
      }
    };

    tryNext(0);
  });
}

const TEXT_EXTS = new Set([".txt", ".html", ".htm", ".md", ".csv", ".json"]);
const OFFICE_OR_PDF_EXTS = new Set([".pdf", ".docx", ".xlsx", ".doc", ".xls"]);
/** Giới hạn file đưa vào AI — tránh bản vẽ/PDF cực lớn. */
const MAX_ANALYSIS_FILE_BYTES = 12 * 1024 * 1024;

function isTextSidecar(filePath) {
  return TEXT_EXTS.has(path.extname(filePath || "").toLowerCase());
}

function analysisPriority(file) {
  const name = `${file.name || ""} ${file.chapter || ""}`.toLowerCase();
  let score = 0;
  if (file.chapter === "chuong-3" || /tiêu chuẩn|đánh giá|eval/.test(name)) score += 30;
  if (file.chapter === "chuong-5" || /yêu cầu|tham chiếu|kỹ thuật|tor/.test(name)) score += 30;
  if (file.chapter === "hsmt-full") score += 20;
  if (/\.txt$/i.test(file.name || "")) score += 15;
  if (/\.pdf$/i.test(file.name || "")) score += 10;
  if (/\.docx?$/i.test(file.name || "")) score += 8;
  if (/\.xlsx?$/i.test(file.name || "")) score += 8;
  if (/bản vẽ|ban ve|drawing|\.rar|\.zip/i.test(name)) score -= 50;
  return score;
}

/**
 * Chọn file lõi để AI đọc (bỏ archive / file quá lớn khi đã có tài liệu chính).
 */
export async function selectHsmtFilesForAnalysis(files) {
  const existing = [];
  for (const file of files || []) {
    try {
      const stat = await fs.stat(file.path);
      existing.push({ ...file, bytes: stat.size });
    } catch {
      // skip missing
    }
  }

  const ranked = existing
    .filter((file) => {
      const name = (file.name || "").toLowerCase();
      if (/\.(rar|zip|7z)$/i.test(name)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => analysisPriority(b) - analysisPriority(a) || a.bytes - b.bytes);

  const selected = [];
  let total = 0;
  for (const file of ranked) {
    const ext = path.extname(file.name || file.path || "").toLowerCase();
    const isOfficeOrPdf = OFFICE_OR_PDF_EXTS.has(ext) || !ext;
    if (file.bytes > MAX_ANALYSIS_FILE_BYTES && isOfficeOrPdf && selected.length > 0) {
      continue;
    }
    if (file.bytes > MAX_ANALYSIS_FILE_BYTES * 2) {
      continue;
    }
    selected.push(file);
    total += file.bytes;
    if (selected.length >= 10 || total > MAX_ANALYSIS_FILE_BYTES * 3) {
      break;
    }
  }

  // nếu lọc hết (chỉ còn file lớn) — giữ 1 file nhỏ nhất có ưu tiên cao
  if (!selected.length && ranked.length) {
    selected.push(ranked[0]);
  }

  return {
    selected,
    skipped: existing.filter((file) => !selected.includes(file)),
  };
}

/**
 * Trích text từ PDF local + file .txt/.html đã lưu từ form HSMT (không có PDF).
 * @param {{path:string, chapter?:string, name?:string}[]} files
 */
export async function extractPdfTexts(files) {
  const existing = [];
  for (const file of files || []) {
    try {
      await fs.access(file.path);
      existing.push(file);
    } catch {
      // skip missing
    }
  }

  if (!existing.length) {
    return { ok: true, files: [], combinedText: "", warnings: ["Không có file để đọc"] };
  }

  const textFiles = existing.filter((file) => isTextSidecar(file.path));
  const pdfFiles = existing.filter((file) => !isTextSidecar(file.path));

  const parts = [];
  const warnings = [];
  const outFiles = [];

  for (const file of textFiles) {
    try {
      const text = await fs.readFile(file.path, "utf8");
      outFiles.push({
        name: file.name,
        chapter: file.chapter,
        path: file.path,
        text,
        pages: 1,
        isScanLikely: false,
      });
      if (text?.trim()) {
        parts.push(`\n### ${file.chapter || ""} · ${file.name}\n${text}`);
      } else {
        warnings.push(`${file.name}: file text rỗng`);
      }
    } catch (error) {
      warnings.push(`${file.name}: ${error.message}`);
      outFiles.push({ name: file.name, chapter: file.chapter, error: error.message });
    }
  }

  if (pdfFiles.length) {
    const stdout = await runPython(
      [EXTRACT_SCRIPT_PATH],
      JSON.stringify({ files: pdfFiles }),
    );
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      // MuPDF đôi khi ghi warning vào stdout trước JSON
      const start = stdout.indexOf("{");
      const end = stdout.lastIndexOf("}");
      if (start >= 0 && end > start) {
        parsed = JSON.parse(stdout.slice(start, end + 1));
        warnings.push("PyMuPDF có cảnh báo trên stdout — đã bỏ qua phần không phải JSON.");
      } else {
        throw new Error(`Không parse được kết quả đọc PDF: ${stdout.slice(0, 180)}`);
      }
    }

    for (const file of parsed.files || []) {
      outFiles.push(file);
      if (file.error) {
        warnings.push(`${file.name}: ${file.error}`);
        continue;
      }
      if (file.isScanLikely || !file.text?.trim()) {
        warnings.push(
          `${file.name}: PDF dạng scan/ảnh, ít hoặc không có text (cần OCR để phân tích sâu).`,
        );
        parts.push(
          `\n### ${file.chapter || ""} · ${file.name}\n[File scan/ảnh — không trích được text đầy đủ. Pages=${file.pages}]`,
        );
        continue;
      }
      parts.push(`\n### ${file.chapter || ""} · ${file.name}\n${file.text}`);
    }
  }

  return {
    ok: true,
    files: outFiles,
    combinedText: parts.join("\n\n").trim(),
    warnings,
  };
}

export function resolveLocalHsmtFiles(paths, hsmtResult) {
  const dataDir = paths.dataDir;
  return (hsmtResult?.files || []).map((file) => ({
    chapter: file.chapter,
    name: file.fileName || file.name,
    path: path.join(dataDir, file.relativePath),
    relativePath: file.relativePath,
  }));
}
