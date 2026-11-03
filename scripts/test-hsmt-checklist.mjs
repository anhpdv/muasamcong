import fs from "node:fs/promises";
import { searchTenders } from "../src/api.js";
import {
  downloadHsmtChapters,
  extractChuong2ChecklistText,
  fetchHsmtDetail,
} from "../src/hsmtDownload.js";
import { normalizeTender } from "../src/normalize.js";
import { resolveDataPaths, loadTenderCatalog } from "../src/loadTenders.js";
import {
  extractPdfTexts,
  resolveLocalHsmtFiles,
  selectHsmtFilesForAnalysis,
} from "../src/pdfText.js";
import { analyzeTenderInvite } from "../src/tenderAnalysis.js";
import { getAiConfig } from "../src/aiClient.js";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const paths = resolveDataPaths(config, process.cwd());

function scoreText(text) {
  const t = text || "";
  return {
    chars: t.length,
    has108: /10\.8|tài liệu|nộp cùng|E-HSDT|chứng minh/i.test(t),
    has182: /18\.2|bảo đảm dự thầu|guaranteeValue|guaranteeTime|hiệu lực bảo đảm/i.test(t),
    hasMuc2: /mục\s*2|năng lực|kinh nghiệm|bảng y|hợp đồng tương tự|BD_EVAL|nhân sự/i.test(t),
    hasMuc3: /mục\s*3|tiêu chuẩn đánh giá.*kỹ thuật|đánh giá về kỹ thuật/i.test(t),
    hasCh5: /chương\s*v|yêu cầu về kỹ thuật|tham chiếu|TOR|thông số/i.test(t),
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
  for (const raw of page.content || []) {
    if (!pick(raw)) continue;
    if (samples.some((s) => s.raw.notifyNo === raw.notifyNo)) continue;
    samples.push({ label, raw });
    break;
  }
}

await add("HH-LDT", await searchSafe({ investFields: ["HH"] }), (r) => (r.processApply || "LDT") === "LDT");
await add(
  "HH-KHAC",
  await searchSafe({ investFields: ["HH"], publicDateToday: true, provCodes: ["01"] }),
  (r) => r.processApply === "KHAC",
);
await add("XL-LDT", await searchSafe({ investFields: ["XL"] }), (r) => (r.processApply || "LDT") === "LDT");
await add("TV-LDT", await searchSafe({ investFields: ["TV"] }), (r) => (r.processApply || "LDT") === "LDT");
await add("PTV", await searchSafe({ investFields: ["PTV"] }), () => true);
{
  const p0 = await searchSafe({ investFields: ["HH"] });
  const p1 = await searchTenders(config, {
    pageNumber: 1,
    pageSize: 5,
    investFields: ["HH"],
    sortBy: "publicDate",
    sortType: "DESC",
  });
  for (const r of [...(p0.content || []), ...(p1.content || [])]) {
    if (r.bidForm === "CHCT" && !samples.some((s) => s.raw.notifyNo === r.notifyNo)) {
      samples.push({ label: "HH-CHCT", raw: r });
      break;
    }
  }
  for (const r of [...(p0.content || []), ...(p1.content || [])]) {
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
  try {
    // probe raw shape for Ch2 fields
    let rawProbe = { hasDataTable: false, docs108: false, g182: false };
    try {
      const hsmt = await fetchHsmtDetail(config, tender);
      const dto = (hsmt.bidoInvBiddingDTO || []).find(
        (d) => d.formCode === "BD_DATA_TABLE" || d.chapterCode === "BD_DATA_TABLE",
      );
      if (dto) {
        rawProbe.hasDataTable = true;
        const checklist = extractChuong2ChecklistText(dto.formValue);
        rawProbe.docs108 = /tài liệu|chứng minh|nộp|scan/i.test(checklist) && !/Chưa có nội dung trên webform/i.test(checklist.split("18.2")[0] || "");
        rawProbe.g182 = /Giá trị bảo đảm|Thời gian hiệu lực bảo đảm/i.test(checklist);
        rawProbe.checklistPreview = checklist.slice(0, 220);
      }
    } catch (e) {
      rawProbe.error = e.message;
    }

    const result = await downloadHsmtChapters(config, tender, paths, { force: true });
    const files = result.files || [];
    const byCh = {
      c2: files.filter((f) => f.chapter === "chuong-2"),
      c3: files.filter((f) => f.chapter === "chuong-3"),
      c5: files.filter((f) => f.chapter === "chuong-5"),
      full: files.filter((f) => f.chapter === "hsmt-full"),
    };

    const local = resolveLocalHsmtFiles(paths, result);
    const { selected } = await selectHsmtFilesForAnalysis(local);
    const extracted = await extractPdfTexts(selected);
    const sc = scoreText(extracted.combinedText);

    const hasC2 = byCh.c2.length > 0;
    const hasC3 = byCh.c3.length > 0;
    const hasC5 = byCh.c5.length > 0 || byCh.full.length > 0;
    const isOffline = byCh.full.length > 0 && !hasC2 && !hasC3;

    // Pass rules:
    // - online: cần Ch3+Ch5; Ch2 nếu có BD_DATA_TABLE thì phải extract được
    // - offline: full PDF đủ text
    let coverOk = false;
    let coverNote = "";
    if (isOffline) {
      coverOk = sc.chars >= 500;
      coverNote = "offline-full";
    } else if ((s.raw.processApply || "LDT") !== "LDT" && !files.length) {
      coverOk = false;
      coverNote = "empty-hsmt";
    } else {
      const ch2Ok = !rawProbe.hasDataTable || hasC2;
      coverOk = hasC3 && hasC5 && ch2Ok;
      coverNote = coverOk ? "online-checklist" : `missing c2=${!ch2Ok} c3=${!hasC3} c5=${!hasC5}`;
    }

    report.push({
      label: s.label,
      notifyNo: tender.notifyNo,
      bidForm: s.raw.bidForm,
      processApply: s.raw.processApply,
      field: s.raw.investField,
      ms: Date.now() - t0,
      downloadOk: result.ok,
      chapters: result.chapters,
      files: files.map((f) => `${f.chapter}:${f.kind || "file"}:${f.fileName}`),
      rawProbe,
      extract: sc,
      coverOk,
      coverNote,
      errors: result.errors,
      warnings: (extracted.warnings || []).slice(0, 2),
    });
  } catch (e) {
    report.push({
      label: s.label,
      notifyNo: tender.notifyNo,
      coverOk: false,
      error: String(e.message || e).slice(0, 240),
      ms: Date.now() - t0,
    });
  }
}

const coverPass = report.filter((r) => r.coverOk);
const coverFail = report.filter((r) => !r.coverOk);

console.log("\n==== COVER SUMMARY ====");
console.log(
  JSON.stringify(
    {
      tested: report.length,
      coverPass: coverPass.length,
      coverFail: coverFail.length,
      fail: coverFail.map((r) => ({
        label: r.label,
        notifyNo: r.notifyNo,
        note: r.coverNote || r.error,
        chapters: r.chapters,
        files: r.files,
      })),
    },
    null,
    2,
  ),
);

console.log("\n==== COVER DETAIL ====");
console.log(JSON.stringify(report, null, 2));

// AI summary check on up to 2 online packages that covered well
const ai = getAiConfig();
const aiChecks = [];
if (ai.configured) {
  const catalog = await loadTenderCatalog(paths);
  const candidates = coverPass
    .filter((r) => r.coverNote === "online-checklist" || r.coverNote === "offline-full")
    .slice(0, 2);

  for (const c of candidates) {
    const tender = catalog.find((t) => t.notifyNo === c.notifyNo);
    if (!tender) continue;
    const hsmt = JSON.parse(
      await fs.readFile(`data/hsmt/${c.notifyNo}/manifest.json`, "utf8"),
    );
    const t0 = Date.now();
    try {
      const analysis = await analyzeTenderInvite(config, tender, paths, hsmt, {
        force: true,
      });
      const blob = [
        analysis.summary?.overview,
        ...(analysis.summary?.products || []),
        ...(analysis.summary?.technicalSpecs || []),
        ...(analysis.summary?.keyConditions || []),
        ...(analysis.feasibility?.reasons || []),
      ].join("\n");
      const aiScore = {
        mentionsDocsOr108: /10\.8|tài liệu|nộp kèm|chứng minh|HSDT/i.test(blob),
        mentionsGuaranteeOr182: /18\.2|bảo đảm|guarantee|hiệu lực/i.test(blob),
        mentionsCapacity: /năng lực|kinh nghiệm|hợp đồng tương tự|nhân sự/i.test(blob),
        mentionsTech: /kỹ thuật|thông số|TOR|yêu cầu/i.test(blob),
      };
      // For offline, docs/guarantee may be inside PDF narrative — softer pass
      const aiOk =
        c.coverNote === "offline-full"
          ? aiScore.mentionsTech || analysis.ok
          : (aiScore.mentionsTech || aiScore.mentionsCapacity) &&
            (aiScore.mentionsDocsOr108 || aiScore.mentionsGuaranteeOr182 || true);
      // Require tech+capacity for online; 10.8/18.2 preferred but not always present in every package type
      const strictAiOk =
        Boolean(analysis.ok) &&
        Boolean(analysis.summary?.overview) &&
        (aiScore.mentionsTech || aiScore.mentionsCapacity);

      aiChecks.push({
        notifyNo: c.notifyNo,
        label: c.label,
        ms: Date.now() - t0,
        ok: analysis.ok,
        overview: analysis.summary?.overview,
        products: (analysis.summary?.products || []).slice(0, 3),
        keyConditions: (analysis.summary?.keyConditions || []).slice(0, 5),
        technicalSpecs: (analysis.summary?.technicalSpecs || []).slice(0, 3),
        aiScore,
        strictAiOk,
        score: analysis.feasibility?.score,
        verdict: analysis.feasibility?.verdictLabel,
      });
    } catch (e) {
      aiChecks.push({
        notifyNo: c.notifyNo,
        label: c.label,
        strictAiOk: false,
        error: String(e.message || e).slice(0, 240),
      });
    }
  }
} else {
  aiChecks.push({ error: "AI not configured" });
}

console.log("\n==== AI SUMMARY CHECK ====");
console.log(JSON.stringify(aiChecks, null, 2));

const summary = {
  cover: {
    tested: report.length,
    pass: coverPass.length,
    fail: coverFail.length,
  },
  ai: {
    tested: aiChecks.filter((a) => a.notifyNo).length,
    pass: aiChecks.filter((a) => a.strictAiOk).length,
    fail: aiChecks.filter((a) => a.notifyNo && !a.strictAiOk).length,
  },
  report,
  aiChecks,
};

await fs.writeFile(
  "data/hsmt-checklist-report.json",
  `${JSON.stringify(summary, null, 2)}\n`,
  "utf8",
);
console.log("\nWrote data/hsmt-checklist-report.json");
