import fs from "node:fs/promises";
import path from "node:path";
import { chatJson, getAiConfig } from "./aiClient.js";
import {
  getFullCapabilityText,
  loadHainamProfile,
} from "./hainamProfile.js";
import { resolveHsmtDir } from "./hsmtDownload.js";
import {
  extractPdfTexts,
  resolveLocalHsmtFiles,
  selectHsmtFilesForAnalysis,
} from "./pdfText.js";

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
      products: [],
      technicalSpecs: [],
      keyConditions: [],
      chapter3: [],
      chapter5: [],
    };
  }

  if (typeof rawSummary === "string") {
    return {
      overview: rawSummary.trim(),
      products: [],
      technicalSpecs: [],
      keyConditions: [],
      chapter3: [],
      chapter5: [],
    };
  }

  const products = asStringList(
    rawSummary.products || rawSummary.sanPham || rawSummary.hangHoa,
  );
  const technicalSpecs = asStringList(
    rawSummary.technicalSpecs ||
      rawSummary.thongSoKyThuat ||
      rawSummary.yeuCauKyThuat ||
      rawSummary.chapter5 ||
      rawSummary.chuong5,
  );

  return {
    overview: String(rawSummary.overview || rawSummary.tomTat || "").trim(),
    products,
    technicalSpecs,
    keyConditions: asStringList(
      rawSummary.keyConditions || rawSummary.dieuKienThenChot || rawSummary.keyPoints,
    ),
    // giữ tương thích dữ liệu phân tích cũ
    chapter3: asStringList(rawSummary.chapter3 || rawSummary.chuong3),
    chapter5: asStringList(rawSummary.chapter5 || rawSummary.chuong5),
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
      summary.products.length ? `Sản phẩm / hàng hóa:\n- ${summary.products.join("\n- ")}` : "",
      summary.technicalSpecs.length
        ? `Yêu cầu & thông số kỹ thuật:\n- ${summary.technicalSpecs.join("\n- ")}`
        : "",
      summary.keyConditions.length
        ? `Điều kiện liên quan sản phẩm:\n- ${summary.keyConditions.join("\n- ")}`
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

function sourceFilesMeta(files) {
  return (files || []).map((f) => ({
    chapter: f.chapter,
    name: f.name,
    relativePath: f.relativePath,
  }));
}

/**
 * Đọc tiêu chuẩn đánh giá HSDT + yêu cầu kỹ thuật vừa tải + dữ liệu Hải Nam → tóm tắt + đánh giá khả thi.
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
  const profile = await loadHainamProfile(paths);
  const profileText = getFullCapabilityText(profile).trim();
  const profileDocCount = profile.documents?.length || 0;
  const ai = getAiConfig();

  if (!localFiles.length) {
    const empty = normalizeAnalysis(
      {
        summary: {
          overview: "Không có nội dung Tiêu chuẩn đánh giá HSDT / Yêu cầu kỹ thuật để phân tích.",
          chapter3: [],
          chapter5: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["Chưa tải được nội dung HSMT liên quan đánh giá / yêu cầu kỹ thuật."],
          gaps: [],
          recommendation: "Bấm lại “Lấy thông tin mời thầu” khi cổng MSC đã có HSMT.",
        },
      },
      { warnings: ["Không có file local"], profileUsed: false, sourceFiles: [], ok: false },
    );
    return saveTenderAnalysis(paths, notifyNo, empty);
  }

  // Báo sớm nếu thiếu key — vẫn tiếp tục đọc file để UI có cảnh báo đầy đủ
  if (!ai.configured) {
    const missingKey = normalizeAnalysis(
      {
        summary: {
          overview:
            "Server chưa cấu hình AI (thiếu OPENAI_API_KEY trong .env trên máy chạy prod). File HSMT đã tải nhưng chưa gọi được model để tóm tắt.",
          products: [],
          technicalSpecs: [],
          keyConditions: [],
        },
        feasibility: {
          score: null,
          verdict: "can_xem_xet",
          reasons: ["OPENAI_API_KEY / AI_API_KEY chưa được set trên môi trường chạy server."],
          gaps: profileText ? [] : ["Thiếu dữ liệu năng lực Hải Nam"],
          recommendation:
            "Thêm OPENAI_API_KEY (+ OPENAI_BASE_URL, OPENAI_MODEL nếu dùng Vilao) vào .env trên server, restart service, rồi bấm lại “Lấy thông tin mời thầu”.",
        },
      },
      {
        warnings: ["AI chưa cấu hình trên server"],
        model: null,
        profileUsed: Boolean(profileText),
        sourceFiles: sourceFilesMeta(localFiles),
        ok: false,
        error: "missing_ai_key",
      },
    );
    return saveTenderAnalysis(paths, notifyNo, missingKey);
  }

  let analysisFiles = localFiles;
  let extracted = { combinedText: "", warnings: [], files: [] };
  try {
    const selected = await selectHsmtFilesForAnalysis(localFiles);
    analysisFiles = selected.selected;
    extracted = await extractPdfTexts(analysisFiles);
    if (selected.skipped.length) {
      extracted.warnings = [
        ...(extracted.warnings || []),
        `Đã bỏ ${selected.skipped.length} file phụ/quá lớn khỏi AI (bản vẽ, archive, PDF rất nặng) — vẫn giữ file lõi để tóm tắt.`,
      ];
    }
  } catch (error) {
    extracted = {
      combinedText: "",
      warnings: [`Lỗi đọc tài liệu: ${error.message}`],
      files: [],
    };
  }

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
          reasons: ["Tài liệu HSMT dạng scan, AI chưa đọc được nội dung."],
          gaps: [],
          recommendation: "Bổ sung bản PDF có text hoặc OCR trước khi đánh giá.",
        },
      },
      {
        warnings,
        model: ai.model,
        profileUsed: Boolean(profileText),
        sourceFiles: sourceFilesMeta(analysisFiles),
        ok: false,
        error: "empty_pdf_text",
      },
    );
    return saveTenderAnalysis(paths, notifyNo, fallback);
  }

  const system = `Bạn là chuyên gia đấu thầu Việt Nam, hỗ trợ Công ty Hải Nam quyết định tham gia thầu.
Nguồn tài liệu có thể là: Tiêu chuẩn đánh giá HSDT, Yêu cầu về kỹ thuật, Điều khoản tham chiếu (TOR), hoặc HSMT offline đầy đủ — không chỉ “Chương III/V”.
Nhiệm vụ:
1) TÓM TẮT lõi HSMT — TẬP TRUNG VÀO SẢN PHẨM/HÀNG HÓA/DỊCH VỤ của gói thầu:
   - Danh mục sản phẩm/hạng mục, số lượng, phạm vi cung cấp/lắp đặt/thực hiện
   - Yêu cầu sản phẩm, thông số kỹ thuật / TOR then chốt
   - Tiêu chuẩn đánh giá HSDT liên quan năng lực–kỹ thuật–tài chính (tóm tắt điểm chính, không chép bảng dài)
   - Xuất xứ, chất lượng, bảo hành, chứng nhận liên quan (nếu có)
2) ĐỌC TOÀN BỘ năng lực Hải Nam → ĐÁNH GIÁ khả thi bằng cách đối chiếu yêu cầu sản phẩm/kỹ thuật với năng lực đó.
Bắt buộc: không bịa số liệu/năng lực. Không copy nguyên văn dài.
Nếu thiếu dữ liệu Hải Nam: verdict=can_xem_xet, gaps nêu rõ thiếu gì.
Trả về ĐÚNG 1 JSON object:
{
  "summary": {
    "overview": "2-3 câu: gói thầu này cung cấp sản phẩm/hàng hóa/dịch vụ gì, quy mô chính",
    "products": ["từng sản phẩm/hạng mục + số lượng/đơn vị nếu có"],
    "technicalSpecs": ["yêu cầu / thông số kỹ thuật / TOR quan trọng"],
    "keyConditions": ["điều kiện then chốt từ tiêu chuẩn đánh giá HSDT + yêu cầu kỹ thuật: năng lực, xuất xứ, bảo hành, chứng nhận, tiến độ..."]
  },
  "feasibility": {
    "score": 0-10,
    "verdict": "phu_hop | can_xem_xet | khong_phu_hop",
    "reasons": ["so khớp năng lực Hải Nam với yêu cầu — mỗi ý 1 dòng"],
    "gaps": ["điểm Hải Nam thiếu hoặc yếu — mỗi ý 1 dòng"],
    "recommendation": "1-2 câu khuyến nghị cho Hải Nam"
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
Gồm mục MẶC ĐỊNH (công nghệ & hàng hóa thiết bị) + mọi mục đã import/thêm.
Bạn PHẢI quét hết tất cả các mục (không bỏ mục mặc định, không bỏ mục bổ sung).
Đơn vị: ${profile.companyName || "Hải Nam"}
Ghi chú nội bộ: ${profile.notes || "(không)"}

${profileForAi || "(CHƯA CÓ — đánh giá thận trọng, bắt buộc ghi thiếu dữ liệu trong gaps)"}

## Nội dung HSMT đã lấy (Tiêu chuẩn đánh giá HSDT / Yêu cầu kỹ thuật / TOR / HSMT offline)
${clip(extracted.combinedText, MAX_DOC_CHARS)}

Yêu cầu:
- Tóm tắt LÕI theo sản phẩm / yêu cầu kỹ thuật / tiêu chuẩn đánh giá liên quan (không lan man thủ tục thuần túy).
- Đánh giá khả thi PHẢI đối chiếu yêu cầu với TOÀN BỘ năng lực Hải Nam.`;

  try {
    const { data, model } = await chatJson({ system, user, temperature: 0.2 });
    const analysis = normalizeAnalysis(data, {
      warnings,
      model,
      profileUsed: Boolean(profileText),
      sourceFiles: sourceFilesMeta(analysisFiles),
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
        sourceFiles: sourceFilesMeta(analysisFiles),
        ok: false,
        error: error.message,
      },
    );
    return saveTenderAnalysis(paths, notifyNo, failed);
  }
}
