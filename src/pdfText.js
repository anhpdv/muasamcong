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

/**
 * Trích text từ danh sách file PDF local.
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
    return { ok: true, files: [], combinedText: "", warnings: ["Không có file PDF để đọc"] };
  }

  const stdout = await runPython(
    [EXTRACT_SCRIPT_PATH],
    JSON.stringify({ files: existing }),
  );
  const parsed = JSON.parse(stdout);
  const parts = [];
  const warnings = [];

  for (const file of parsed.files || []) {
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

  return {
    ok: true,
    files: parsed.files || [],
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
