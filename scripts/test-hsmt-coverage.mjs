import fs from "node:fs/promises";
import { searchTenders } from "../src/api.js";
import { downloadHsmtChapters } from "../src/hsmtDownload.js";
import { normalizeTender } from "../src/normalize.js";
import { resolveDataPaths } from "../src/loadTenders.js";
import {
  extractPdfTexts,
  resolveLocalHsmtFiles,
  selectHsmtFilesForAnalysis,
} from "../src/pdfText.js";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const paths = resolveDataPaths(config, process.cwd());

function score(text) {
  const t = text || "";
  return {
    chars: t.length,
    hasEval:
      /ti[eê]u\s*chu[aả]n|[đd][aá]nh\s*gi[aá]|Bảng tiêu chí|năng lực|kinh nghiệm/i.test(
        t,
      ),
    hasTech:
      /y[eê]u\s*c[aầ]u|tham\s*chi[eế]u|th[oô]ng\s*s[oố]|k[ỹy]\s*thu[aậ]t|HỒ SƠ MỜI THẦU|[Đđ]iều khoản tham chiếu/i.test(
        t,
      ),
  };
}

async function searchSafe(opts) {
  return searchTenders(config, {
    pageNumber: 0,
    pageSize: 5,
    sortBy: "publicDate",
    sortType: "DESC",
    ...opts,
  });
}

const samples = [];
async function add(label, page, pick) {
  const hit = (page.content || []).find(pick) || null;
  if (hit && !samples.some((s) => s.raw.notifyNo === hit.notifyNo)) {
    samples.push({ label, raw: hit });
  }
}

await add(
  "HH-LDT",
  await searchSafe({ investFields: ["HH"] }),
  (r) => (r.processApply || "LDT") === "LDT",
);
await add(
  "HH-KHAC",
  await searchSafe({
    investFields: ["HH"],
    publicDateToday: true,
    provCodes: ["01"],
  }),
  (r) => r.processApply === "KHAC",
);
await add("TV", await searchSafe({ investFields: ["TV"] }), () => true);
await add(
  "XL",
  await searchSafe({ investFields: ["XL"] }),
  (r) => (r.processApply || "LDT") === "LDT",
);
await add("PTV-CHCT", await searchSafe({ investFields: ["PTV"] }), () => true);

{
  const p = await searchSafe({ investFields: ["HH"] });
  const p1 = await searchTenders(config, {
    pageNumber: 1,
    pageSize: 5,
    investFields: ["HH"],
    sortBy: "publicDate",
    sortType: "DESC",
  });
  for (const r of [...(p.content || []), ...(p1.content || [])]) {
    if (
      r.bidForm === "CHCT" &&
      !samples.some((s) => s.raw.notifyNo === r.notifyNo)
    ) {
      samples.push({ label: "HH-CHCT", raw: r });
      break;
    }
  }
  for (const r of [...(p.content || []), ...(p1.content || [])]) {
    if (
      (r.processApply || "LDT") === "LDT" &&
      !samples.some((s) => s.raw.notifyNo === r.notifyNo)
    ) {
      samples.push({ label: "HH-LDT2", raw: r });
      break;
    }
  }
}

const report = [];
for (const s of samples) {
  const tender = normalizeTender(s.raw);
  const t0 = Date.now();
  const result = await downloadHsmtChapters(config, tender, paths, {
    force: true,
  });
  const local = resolveLocalHsmtFiles(paths, result);
  const { selected, skipped } = await selectHsmtFilesForAnalysis(local);
  const extracted = await extractPdfTexts(selected);
  const sc = score(extracted.combinedText);
  const files = result.files || [];
  const hasC3 = files.some((f) => f.chapter === "chuong-3");
  const hasC5 = files.some((f) => f.chapter === "chuong-5");
  const hasFull = files.some((f) => f.chapter === "hsmt-full");
  const pairOk = (hasC3 && hasC5) || hasFull;
  const usable = sc.chars >= 300 && (sc.hasEval || sc.hasTech || hasFull);
  const pass = pairOk && usable;

  report.push({
    label: s.label,
    notifyNo: tender.notifyNo,
    bidForm: s.raw.bidForm,
    processApply: s.raw.processApply,
    field: s.raw.investField,
    ms: Date.now() - t0,
    downloadOk: result.ok,
    chapters: result.chapters,
    fileNames: files.map(
      (f) =>
        `${f.chapter}:${f.kind || "file"}:${String(f.fileName || "").slice(0, 45)}:${f.bytes}`,
    ),
    selected: selected.map((f) => f.name),
    skipped: skipped.length,
    pairOk,
    usable,
    pass,
    extract: sc,
    errors: result.errors,
    warn: (extracted.warnings || []).slice(0, 3),
    preview: String(extracted.combinedText || "")
      .slice(0, 220)
      .replace(/\s+/g, " "),
  });
}

const summary = {
  tested: report.length,
  passed: report.filter((r) => r.pass).length,
  failed: report
    .filter((r) => !r.pass)
    .map((r) => ({
      label: r.label,
      notifyNo: r.notifyNo,
      pairOk: r.pairOk,
      usable: r.usable,
      extract: r.extract,
      fileNames: r.fileNames,
      errors: r.errors,
      warn: r.warn,
    })),
  all: report,
};

console.log(JSON.stringify(summary, null, 2));
await fs.writeFile(
  "data/hsmt-coverage-report.json",
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
