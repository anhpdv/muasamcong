import fs from "node:fs/promises";
import path from "node:path";
import { chatJson, getAiConfig } from "./aiClient.js";
import {
  getFullCapabilityText,
  loadHainamProfile,
} from "./hainamProfile.js";
import { resolveHsmtDir } from "./hsmtDownload.js";
import { extractPdfTexts, resolveLocalHsmtFiles } from "./pdfText.js";

const MAX_DOC_CHARS = 60000;
/** Năng lực Hải Nam: ưu tiên gửi TOÀN BỘ; chỉ cắt khi vượt ngưỡng context rất lớn. */
const MAX_PROFILE_CHARS = 120000;

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}\n\n[...đã cắt bớt do quá dài — ưu tiên giữ phần đầu; AI cần khái quát toàn bộ điểm chính đã đọc...]`;
}

function analysisPath(paths, notifyNo) {
  return path.join(resolveHsmtDir(paths, notifyNo), "analysis.json");
}

export async function readTenderAnalysis(paths, notifyNo) {
  try {
    return JSON.parse(await fs.readFile(analysisPath(paths, notifyNo), "utf8"));
  } catch {
    return null;
  }
}

export async function saveTenderAnalysis(paths, notifyNo, analysis) {
  const dir = resolveHsmtDir(paths, notifyNo);
  await fs.mkdir(dir, { recursive: true });
  const payload = {
    ...analysis,
    notifyNo,
    analyzedAt: analysis.analyzedAt || new Date().toISOString(),
  };
  await fs.writeFile(analysisPath(paths, notifyNo), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function asStringList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  const text = String(value).trim();
  return text ? [text] : [];
}

function normalizeSummary(rawSummary) {
  if (!rawSummary) {
    return {
      overview: "",
      chapter3: [],
      chapter5: [],
      keyConditions: [],
    };
  }

  if (typeof rawSummary === "string") {
    return {
      overview: rawSummary.trim(),
      chapter3: [],
      chapter5: [],
      keyConditions: [],
    };
  }

  return {
    overview: String(rawSummary.overview || rawSummary.tomTat || "").trim(),
    chapter3: asStringList(rawSummary.chapter3 || rawSummary.chuong3),
    chapter5: asStringList(rawSummary.chapter5 || rawSummary.chuong5),
    keyConditions: asStringList(
      rawSummary.keyConditions || rawSummary.dieuKienThenChot || rawSummary.keyPoints,
    ),
  };
}

function normalizeAnalysis(raw, meta = {}) {
  const feasibility = raw?.feasibility || {};
  const rawScore = feasibility.score;
  const score =
    rawScore === null || rawScore === undefined || rawScore === ""
      ? NaN
      : Number(rawScore);
  let verdict = String(feasibility.verdict || "").toLowerCase();
  if (!["phu_hop", "can_xem_xet", "khong_phu_hop"].includes(verdict)) {
    if (Number.isFinite(score)) {
      if (score >= 7) verdict = "phu_hop";
      else if (score >= 4) verdict = "can_xem_xet";
      else verdict = "khong_phu_hop";
    } else {
      verdict = "can_xem_xet";
    }
  }

  const summary = normalizeSummary(raw?.summary);

  return {
    ok: Boolean(meta.ok !== false),
    summary,
    /** chuỗi phẳng cho tương thích cũ */
    summaryText: [
      summary.overview,
      summary.chapter3.length ? `Chương III:\n- ${summary.chapter3.join("\n- ")}` : "",
      summary.chapter5.length ? `Chương V:\n- ${summary.chapter5.join("\n- ")}` : "",
      summary.keyConditions.length
        ? `Điều kiện then chốt:\n- ${summary.keyConditions.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    feasibility: {
      score: Number.isFinite(score) ? Math.max(0, Math.min(10, Math.round(score * 10) / 10)) : null,
      verdict,
      verdictLabel:
        verdict === "phu_hop"
          ? "Phù hợp"
          : verdict === "khong_phu_hop"
            ? "Không phù hợp"
            : "Cần xem xét",
      reasons: asStringList(feasibility.reasons),
      gaps: asStringList(feasibility.gaps),
      recommendation: String(feasibility.recommendation || "").trim(),
    },
    warnings: meta.warnings || [],
    model: meta.model || null,
    analyzedAt: new Date().toISOString(),
    sourceFiles: meta.sourceFiles || [],
    profileUsed: Boolean(meta.profileUsed),
    error: meta.error || null,
  };
}

function buildTenderContext(tender) {
  return {
    notifyNo: tender.notifyNo,
    bidName: tender.bidName,
    investorName: tender.investorName,
    procuringEntityName: tender.procuringEntityName,
    investField: tender.investFieldLabel || tender.investField,
    bidForm: tender.bidFormLabel || tender.bidForm,
    bidPrice: tender.bidPrice,
    provName: tender.provName,
    locations: tender.locations,
    publicDate: tender.publicDateLabel || tender.publicDate,
    bidCloseDate: tender.bidCloseDateLabel || tender.bidCloseDate,
  };
}

function sourceFilesMeta(localFiles) {
  return localFiles.map((f) => ({
    chapter: f.chapter,
    name: f.name,
    relativePath: f.relativePath,
  }));
}

/**
 * Đọc Ch.3/Ch.5 vừa tải + dữ liệu Hải Nam → tóm tắt + đánh giá khả thi.
 */
export async function analyzeTenderInvite(config, tender, paths, hsmtResult, options = {}) {
  const notifyNo = tender.notifyNo || hsmtResult?.notifyNo;
  if (!notifyNo) {
    throw new Error("Thiếu notifyNo để phân tích");
  }

  if (!options.force) {
    const existing = await readTenderAnalysis(paths, notifyNo);
    if (existing?.ok && (existing.summaryText || existing.summary?.overview)) {
      return { ...existing, skipped: true };
    }
  }

  const localFiles = resolveLocalHsmtFiles(paths, hsmtResult);
  if (!localFiles.length) {
    const empty = normalizeAnalysis(
      {
        summary: {
          overview: "Không có file Chương 3/5 để phân tích.",
          chapter3: [],
          chapter5: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["Chưa tải được file đính kèm HSMT."],
          gaps: [],
          recommendation: "Bấm lại “Lấy thông tin mời thầu” khi cổng MSC có file.",
        },
      },
      { warnings: ["Không có file local"], profileUsed: false, sourceFiles: [], ok: false },
    );
    return saveTenderAnalysis(paths, notifyNo, empty);
  }

  const extracted = await extractPdfTexts(localFiles);
  const profile = await loadHainamProfile(paths);
  const profileText = getFullCapabilityText(profile).trim();
  const profileDocCount = profile.documents?.length || 0;
  const warnings = [...(extracted.warnings || [])];

  if (!profileText) {
    warnings.push(
      "Chưa có dữ liệu Hải Nam. Vào tab “Năng lực Hải Nam” để import/nhập nhiều hồ sơ trước khi đánh giá khả thi.",
    );
  } else if (profileText.length > MAX_PROFILE_CHARS) {
    warnings.push(
      `Năng lực Hải Nam rất dài (${profileText.length.toLocaleString("vi-VN")} ký tự / ${profileDocCount} mục). Đã gửi ${MAX_PROFILE_CHARS.toLocaleString("vi-VN")} ký tự đầu — nên rút gọn nếu thiếu ý quan trọng.`,
    );
  }

  const ai = getAiConfig();
  if (!ai.configured) {
    const fallback = normalizeAnalysis(
      {
        summary: {
          overview:
            "Chưa cấu hình AI (OPENAI_API_KEY). File Chương 3/5 đã tải nhưng chưa tạo được tóm tắt.",
          chapter3: [],
          chapter5: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["Chưa cấu hình OPENAI_API_KEY trong .env."],
          gaps: profileText ? [] : ["Thiếu dữ liệu năng lực Hải Nam"],
          recommendation: "Cấu hình .env, import dữ liệu Hải Nam, rồi bấm lại nút lấy thông tin mời thầu.",
        },
      },
      {
        warnings,
        model: null,
        profileUsed: Boolean(profileText),
        sourceFiles: sourceFilesMeta(localFiles),
        ok: false,
        error: "missing_ai_key",
      },
    );
    return saveTenderAnalysis(paths, notifyNo, fallback);
  }

  if (!extracted.combinedText?.trim()) {
    const fallback = normalizeAnalysis(
      {
        summary: {
          overview:
            "Đã tải file nhưng không trích được chữ (PDF scan/ảnh). Cần OCR hoặc file text để tóm tắt đầy đủ.",
          chapter3: [],
          chapter5: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["PDF Chương 3/5 dạng scan, AI chưa đọc được nội dung."],
          gaps: [],
          recommendation: "Bổ sung bản PDF có text hoặc OCR trước khi đánh giá.",
        },
      },
      {
        warnings,
        model: ai.model,
        profileUsed: Boolean(profileText),
        sourceFiles: sourceFilesMeta(localFiles),
        ok: false,
        error: "empty_pdf_text",
      },
    );
    return saveTenderAnalysis(paths, notifyNo, fallback);
  }

  const system = `Bạn là chuyên gia đấu thầu Việt Nam, hỗ trợ Công ty Hải Nam quyết định tham gia thầu.
Nhiệm vụ:
1) ĐỌC TOÀN BỘ Chương III + Chương V → TÓM TẮT có cấu trúc.
2) ĐỌC KỸ mục "Năng lực Hải Nam" (dữ liệu gốc do người dùng import) → ĐÁNH GIÁ khả thi bằng cách ĐỐI CHIẾU từng yêu cầu HSMT với năng lực đó.
Bắt buộc: mọi lý do/gaps/recommendation phải dựa trên năng lực Hải Nam đã cho. Không bịa năng lực. Không copy nguyên văn dài.
Nếu thiếu dữ liệu Hải Nam: verdict=can_xem_xet, gaps phải nêu rõ thiếu gì.
Trả về ĐÚNG 1 JSON object:
{
  "summary": {
    "overview": "2-4 câu tổng quan gói thầu / HSMT",
    "chapter3": ["điểm chính tiêu chuẩn đánh giá HSDT"],
    "chapter5": ["điểm chính yêu cầu kỹ thuật / phạm vi / thông số"],
    "keyConditions": ["điều kiện then chốt: chứng chỉ, kinh nghiệm, bảo hành, thời gian, xuất xứ..."]
  },
  "feasibility": {
    "score": 0-10,
    "verdict": "phu_hop | can_xem_xet | khong_phu_hop",
    "reasons": ["so khớp năng lực Hải Nam vs yêu cầu — mỗi ý 1 dòng"],
    "gaps": ["phần Hải Nam thiếu/ yếu so với HSMT — mỗi ý 1 dòng"],
    "recommendation": "1-2 câu khuyến nghị hành động cho Hải Nam"
  }
}`;

  const profileForAi = profileText
    ? profileText.length <= MAX_PROFILE_CHARS
      ? profileText
      : clip(profileText, MAX_PROFILE_CHARS)
    : "";

  const user = `## Thông tin gói thầu
${JSON.stringify(buildTenderContext(tender), null, 2)}

## Năng lực Hải Nam — ĐỌC TOÀN BỘ (${profileDocCount} mục, ${profileText.length.toLocaleString("vi-VN")} ký tự)
Đây là TOÀN BỘ dữ liệu năng lực do Hải Nam nhập/import (có thể nhiều file/mục).
Bạn PHẢI quét hết các mục bên dưới trước khi chấm điểm; không bỏ sót mục nào.
Đơn vị: ${profile.companyName || "Hải Nam"}
Ghi chú nội bộ: ${profile.notes || "(không)"}

${profileForAi || "(CHƯA CÓ — đánh giá thận trọng, bắt buộc ghi thiếu dữ liệu trong gaps)"}

## Nội dung file Chương 3 & Chương 5 (đã trích text)
${clip(extracted.combinedText, MAX_DOC_CHARS)}

Yêu cầu: tóm tắt đủ ý quan trọng hai chương; đánh giá khả thi PHẢI đối chiếu trực tiếp với TOÀN BỘ năng lực Hải Nam ở trên.`;

  try {
    const { data, model } = await chatJson({ system, user, temperature: 0.2 });
    const analysis = normalizeAnalysis(data, {
      warnings,
      model,
      profileUsed: Boolean(profileText),
      sourceFiles: sourceFilesMeta(localFiles),
      ok: true,
    });
    return saveTenderAnalysis(paths, notifyNo, analysis);
  } catch (error) {
    const failed = normalizeAnalysis(
      {
        summary: {
          overview: `Lỗi AI khi phân tích: ${error.message}`,
          chapter3: [],
          chapter5: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["Không gọi được AI để đánh giá."],
          gaps: [],
          recommendation: "Thử lại nút “Lấy thông tin mời thầu”. Kiểm tra API Vilao / .env.",
        },
      },
      {
        warnings,
        model: ai.model,
        profileUsed: Boolean(profileText),
        sourceFiles: sourceFilesMeta(localFiles),
        ok: false,
        error: error.message,
      },
    );
    return saveTenderAnalysis(paths, notifyNo, failed);
  }
}
