import fs from "node:fs/promises";
import path from "node:path";
import { postJson } from "./api.js";
import { buildFileDownloadUrl } from "./normalize.js";

const HSMT_PATH =
  "/o/egp-portal-contractor-selection-v2/services/lcnt_tbmt_hsmt";

/**
 * Checklist làm HSDT (ưu tiên lấy khi bấm “Lấy thông tin mời thầu”):
 * - Chương II: E-CDNT 10.8 (tài liệu nộp kèm E-HSDT), E-CDNT 18.2 (bảo đảm dự thầu) — webform
 * - Chương III mục 2: bảng NL/KN (01/02/X), bảng Y — webform; mục 3: tiêu chuẩn KT — file
 * - Chương V: yêu cầu kỹ thuật / TOR — file
 */
const SECTION_RULES = {
  "chuong-2": {
    label: "Chương II · E-CDNT 10.8 & 18.2",
    folder: "chuong-2",
  },
  "chuong-3": {
    label: "Chương III · Tiêu chuẩn đánh giá HSDT",
    folder: "chuong-3",
  },
  "chuong-5": {
    label: "Chương V · Yêu cầu về kỹ thuật",
    folder: "chuong-5",
  },
  "hsmt-full": {
    label: "HSMT đầy đủ (offline)",
    folder: "hsmt-full",
  },
};

const EVAL_NAME_RE =
  /ti[eê]u\s*chu[aả]n\s*[đd][aá]nh\s*gi[aá]|[đd][aá]nh\s*gi[aá].{0,20}(e-)?hsdt|ch[uư][ơo]ng\s*iii\b|chuong\s*iii\b|ch[uư][ơo]ng\s*3\b|bảng\s*[xy01]|bang\s*[xy01]|hợp\s*đồng\s*tương\s*tự|năng\s*lực\s*sản\s*xuất/i;

const TECH_NAME_RE =
  /y[eê]u\s*c[aầ]u\s*(v[eề]\s*)?k[ỹy]\s*thu[aậ]t|[đd]i[eề]u\s*kho[aả]n\s*tham\s*chi[eế]u|th[oô]ng\s*s[oố]\s*k[ỹy]\s*thu[aậ]t|ch[uư][ơo]ng\s*v\b|chuong\s*v\b|ch[uư][ơo]ng\s*5\b|ph[aầ]n\s*2\s*[:.\-–]?\s*y[eê]u\s*c[aầ]u|tor\b/i;

const CH2_NAME_RE =
  /ch[uư][ơo]ng\s*ii\b|chuong\s*ii\b|bảng\s*dữ\s*liệu|bang\s*du\s*lieu|BD_DATA_TABLE/i;

/** Mục 2 Chương III (webform NL/KN / bảng Y) — không lấy mục tài chính thuần. */
const C3_MUC2_RE =
  /mục\s*2(\.|$|\s)|bang\s*[01xy]|bảng\s*[01xy]|BD_EVAL_CRITERIA|năng\s*lực\s*và\s*kinh\s*nghiệm|hợp\s*đồng\s*tương\s*tự|năng\s*lực\s*sản\s*xuất|nhân\s*sự\s*chủ\s*chốt/i;

/** Mục 3 Chương III (file tiêu chuẩn đánh giá kỹ thuật). */
const C3_MUC3_RE =
  /mục\s*3(\.|$|\s)|ti[eê]u\s*chu[aả]n\s*[đd][aá]nh\s*gi[aá]\s*v[eề]\s*k[ỹy]\s*thu[aậ]t/i;

const MIN_TEXT_CHARS = 80;

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

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
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

function formatMoneyVnd(value) {
  if (value == null || value === "") {
    return "";
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return String(value);
  }
  return `${num.toLocaleString("vi-VN")} VND`;
}

function flattenEvalTable(rows, lines = [], depth = 0) {
  if (!Array.isArray(rows)) {
    return lines;
  }
  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }
    const pos = row.pos || row.position || row.currentItemIndex || "";
    const content = stripHtml(row.content || row.name || row.title || row.lotName || "");
    const extras = [
      row.hsCode ? `HS: ${row.hsCode}` : "",
      row.contractValue ? `HĐ tương tự / mô tả: ${stripHtml(String(row.contractValue))}` : "",
      row.designCapacity != null && row.designCapacity !== ""
        ? `Giá trị thiết kế/min: ${formatMoneyVnd(row.designCapacity)}`
        : "",
      row.capacity ? `Công suất/SL: ${row.capacity}` : "",
      row.minValue != null && row.minValue !== "" ? `min=${row.minValue}` : "",
      row.maxValue != null && row.maxValue !== "" ? `max=${row.maxValue}` : "",
      row.qty != null && row.qty !== "" ? `sl=${row.qty}` : "",
      row.pointDetail ? stripHtml(String(row.pointDetail)) : "",
    ]
      .filter(Boolean)
      .join("; ");
    if (content || extras) {
      const indent = "  ".repeat(Math.min(depth, 6));
      lines.push(
        `${indent}${[pos, content].filter(Boolean).join(" — ")}${extras ? `\n${indent}  → ${extras}` : ""}`,
      );
    }
    if (Array.isArray(row.children) && row.children.length) {
      flattenEvalTable(row.children, lines, depth + 1);
    }
  }
  return lines;
}

/**
 * BD_EVAL_CRITERIA (Mục 2.1) trên MSC không phải Table HTML —
 * là object: historyContract / taxObligations / averageRevenue / contractExperience...
 * Cần map thành Bảng 01 (thương mại) + Bảng 02 (nhà sản xuất) để AI đọc đúng.
 */
export function formatBdEvalCriteria(formValue, confName = "") {
  const v = parseMaybeJson(formValue);
  if (!v || typeof v !== "object") {
    return "";
  }
  if (!v.historyContract && !v.contractExperience && !v.averageRevenue && !v.taxObligations) {
    return "";
  }

  const lines = [];
  if (confName) {
    lines.push(`# ${confName}`);
  }
  if (v.note) {
    lines.push(`Ghi chú tỷ giá / ngân hàng: ${v.note}`);
  }

  lines.push("");
  lines.push("## Bảng số 01 — Tiêu chuẩn đánh giá về năng lực và kinh nghiệm (nhà thầu thương mại / cung cấp)");

  if (v.historyContract) {
    const h = v.historyContract;
    lines.push(
      `1. Lịch sử không hoàn thành hợp đồng do lỗi của nhà thầu: ${h.isChecked ? "Áp dụng" : "Không áp dụng"}` +
        (h.startYear ? ` (từ năm ${h.startYear} đến thời điểm đóng thầu)` : ""),
    );
  }
  if (v.taxObligations) {
    lines.push(
      `2. Thực hiện nghĩa vụ thuế: ${v.taxObligations.isChecked ? "Áp dụng — đã thực hiện nghĩa vụ thuế của năm tài chính gần nhất" : "Không áp dụng"}`,
    );
  }

  const financeBits = [];
  if (v.finalResult?.isChecked) {
    financeBits.push("kết quả hoạt động tài chính các năm gần nhất phải độc lập / lành mạnh theo E-HSMT");
  }
  if (v.averageRevenue?.isChecked) {
    financeBits.push(
      `doanh thu bình quân tối thiểu ${formatMoneyVnd(v.averageRevenue.totalRevenueMin)}` +
        (v.averageRevenue.revenueYear ? ` trong ${v.averageRevenue.revenueYear} năm gần nhất` : ""),
    );
  }
  if (v.insurance?.isChecked) {
    financeBits.push("yêu cầu bảo hiểm / năng lực tài chính bổ sung theo E-HSMT");
  }
  if (financeBits.length) {
    lines.push(`3. Năng lực tài chính: ${financeBits.join("; ")}`);
  }

  if (v.contractExperience) {
    const c = v.contractExperience;
    lines.push(
      `4. Kinh nghiệm thực hiện hợp đồng tương tự: ${c.isChecked ? "Áp dụng" : "Không áp dụng"}` +
        (c.experienceYear ? ` (tính từ năm ${c.experienceYear})` : ""),
    );
    if (c.contractValue) {
      lines.push(`   - Yêu cầu giá trị / cách đáp ứng:\n${String(c.contractValue).trim()}`);
    }
    if (c.similarProperties) {
      lines.push(`   - Tính chất tương tự:\n${String(c.similarProperties).trim()}`);
    }
  }

  const hasBang2 =
    v.productionCapacity?.isChecked ||
    v.insuranceTable2?.isChecked ||
    (typeof v.quantity === "string" && v.quantity.trim()) ||
    (typeof v.efficiency === "string" && v.efficiency.trim()) ||
    v.deliveryCapability != null;

  if (hasBang2) {
    lines.push("");
    lines.push("## Bảng số 02 — Tiêu chuẩn đánh giá về năng lực sản xuất / nhà sản xuất (nếu áp dụng)");
    let bang2Idx = 1;
    if (v.productionCapacity?.isChecked) {
      lines.push(`${bang2Idx}. Năng lực sản xuất: Áp dụng (đối chiếu Bảng Y)`);
      bang2Idx += 1;
    }
    const qty = (v.quantity || v.quantity2 || "").trim();
    if (qty) {
      lines.push(`${bang2Idx}. Yêu cầu công suất / sản lượng:\n${qty}`);
      bang2Idx += 1;
    }
    const eff = (v.efficiency || v.efficiency2 || "").trim();
    if (eff && eff !== qty) {
      lines.push(`${bang2Idx}. Hiệu suất / công suất thiết kế:\n${eff}`);
      bang2Idx += 1;
    }
    if (v.insuranceTable2?.isChecked) {
      lines.push(`${bang2Idx}. Bảo hiểm / điều kiện bảng 02: Áp dụng`);
      bang2Idx += 1;
    }
    if (v.deliveryCapability != null && v.deliveryCapability !== "") {
      lines.push(`${bang2Idx}. Năng lực giao hàng (deliveryCapability): ${v.deliveryCapability}`);
    }
  }

  return lines.join("\n").trim();
}

/** Biến formValue JSON/HTML thành text để AI đọc khi không có PDF. */
export function formValueToText(formValue, confName = "") {
  const parts = [];
  if (confName) {
    parts.push(`# ${confName}`);
  }

  if (formValue == null) {
    return "";
  }

  if (typeof formValue === "string") {
    const parsed = parseMaybeJson(formValue);
    if (parsed) {
      return formValueToText(parsed, confName);
    }
    const text = /</.test(formValue) ? stripHtml(formValue) : formValue.trim();
    if (text) {
      parts.push(text);
    }
    return parts.join("\n\n").trim();
  }

  if (typeof formValue !== "object") {
    return "";
  }

  // Mục 2.1 BD_EVAL_CRITERIA: map Bảng 01 / Bảng 02
  const evalText = formatBdEvalCriteria(formValue, "");
  if (evalText) {
    // confName đã push ở trên
    return [confName ? `# ${confName}` : "", evalText].filter(Boolean).join("\n\n").trim();
  }

  if (typeof formValue.content === "string" && formValue.content.trim()) {
    parts.push(
      /</.test(formValue.content) ? stripHtml(formValue.content) : formValue.content.trim(),
    );
  }
  if (typeof formValue.html === "string" && formValue.html.trim()) {
    parts.push(stripHtml(formValue.html));
  }
  if (typeof formValue.description === "string" && formValue.description.trim()) {
    parts.push(stripHtml(formValue.description));
  }

  if (Array.isArray(formValue.Table) && formValue.Table.length) {
    const tableLines = flattenEvalTable(formValue.Table);
    if (tableLines.length) {
      const title = /bảng\s*y|hợp đồng tương tự|năng lực sản xuất/i.test(confName)
        ? "Bảng Y — Hợp đồng tương tự / năng lực sản xuất:"
        : "Bảng tiêu chí:";
      parts.push(`${title}\n` + tableLines.join("\n"));
    }
  }

  // Các field text còn lại (bỏ file / id / field đã xử lý trong eval)
  const skipKeys = new Set([
    "file",
    "files",
    "sharedFiles",
    "attachFiles",
    "fileOther1",
    "fileOther2",
    "fileOther3",
    "fileOther4",
    "fileOther5",
    "fileTech",
    "fileName1",
    "fileName2",
    "Table",
    "Table1",
    "content",
    "html",
    "description",
    "historyContract",
    "finalResult",
    "averageRevenue",
    "contractExperience",
    "insurance",
    "taxObligations",
    "productionCapacity",
    "insuranceTable2",
    "deliveryCapability",
    "quantity",
    "quantity2",
    "efficiency",
    "efficiency2",
    "attachFileId",
    "attachFileName",
    "note",
    "mutiGoods",
  ]);

  for (const [key, value] of Object.entries(formValue)) {
    if (skipKeys.has(key)) {
      continue;
    }
    if (typeof value === "string" && value.trim().length >= 20 && !/^[0-9a-f-]{36}$/i.test(value)) {
      const text = /</.test(value) ? stripHtml(value) : value.trim();
      if (text.length >= 20) {
        parts.push(`${key}: ${text}`);
      }
    }
  }

  return parts.join("\n\n").trim();
}

function confByCode(confList, code) {
  if (!code || !Array.isArray(confList)) {
    return null;
  }
  return confList.find((item) => item.code === code || item.pcode === code) || null;
}

function confNameByFormCode(confList, formCode) {
  const hit = confByCode(confList, formCode);
  return hit?.name || hit?.tempName || "";
}

/**
 * Phân loại theo checklist HSDT: Ch.II (BD_DATA_TABLE) / Ch.III mục 2–3 / Ch.V.
 */
export function classifyChapter(dto, confList) {
  const chapterCode = String(dto.chapterCode || "");
  const formCode = String(dto.formCode || "");
  const formName = confNameByFormCode(confList, formCode);
  const chapterName = confNameByFormCode(confList, chapterCode);
  const blob = `${formName} ${chapterName} ${formCode} ${chapterCode}`;

  if (
    formCode === "BD_DATA_TABLE" ||
    chapterCode === "BD_DATA_TABLE" ||
    CH2_NAME_RE.test(formName) ||
    CH2_NAME_RE.test(chapterName)
  ) {
    return "chuong-2";
  }

  if (TECH_NAME_RE.test(formName) || TECH_NAME_RE.test(formCode)) {
    return "chuong-5";
  }
  if (
    C3_MUC2_RE.test(formName) ||
    C3_MUC3_RE.test(formName) ||
    EVAL_NAME_RE.test(formName) ||
    formCode === "BD_EVAL_CRITERIA"
  ) {
    return "chuong-3";
  }

  if (chapterCode === "P2" || chapterCode === "C5") {
    return "chuong-5";
  }
  if (chapterCode === "C3") {
    // Chỉ lấy mục 2–3 (+ bảng Y/X); bỏ mục tài chính/hợp lệ thuần nếu tên rõ ràng không khớp
    if (/mục\s*[145]\b|tài\s*chính|hợp\s*lệ|phương\s*án\s*kỹ\s*thuật\s*thay\s*thế/i.test(formName) && !C3_MUC2_RE.test(formName) && !C3_MUC3_RE.test(formName)) {
      return null;
    }
    return "chuong-3";
  }

  if (TECH_NAME_RE.test(chapterName) || TECH_NAME_RE.test(blob)) {
    return "chuong-5";
  }
  if (EVAL_NAME_RE.test(chapterName) || EVAL_NAME_RE.test(blob)) {
    return "chuong-3";
  }

  return null;
}

/** Trích E-CDNT 10.8 + 18.2 từ webform Chương II (BD_DATA_TABLE) — cấu trúc HH/XL/TV khác nhau. */
export function extractChuong2ChecklistText(formValue) {
  const parsed = parseMaybeJson(formValue);
  if (!parsed || typeof parsed !== "object") {
    return "";
  }

  const parts = ["# Chương II — Checklist làm E-HSDT", ""];

  // E-CDNT 10.8: tài liệu nộp kèm E-HSDT
  const docs108 =
    parsed?.dataRow4?.listArrDocumentsRequired ||
    parsed?.dataRow6?.listArrRow6 ||
    parsed?.listArrDocumentsRequired ||
    null;
  parts.push("## E-CDNT 10.8 — Nhà thầu phải nộp cùng với E-HSDT các tài liệu sau đây");
  if (docs108 && String(docs108).trim()) {
    parts.push(String(docs108).trim());
  } else {
    parts.push("(Chưa có nội dung trên webform / gói không áp dụng mục này.)");
  }
  parts.push("");

  // E-CDNT 18.2: bảo đảm dự thầu
  const g18 =
    parsed?.dataRow18_2 ||
    parsed?.e_cdnt_18_2 ||
    parsed?.dataRow14 ||
    null;
  parts.push("## E-CDNT 18.2 — Nội dung bảo đảm dự thầu");
  const guaranteeLines = [];
  if (g18 && typeof g18 === "object") {
    if (g18.guaranteeValue != null && g18.guaranteeValue !== "") {
      guaranteeLines.push(`- Giá trị bảo đảm dự thầu: ${g18.guaranteeValue}`);
    }
    if (g18.guaranteeTime != null && g18.guaranteeTime !== "") {
      guaranteeLines.push(`- Thời gian hiệu lực bảo đảm dự thầu: ${g18.guaranteeTime} ngày`);
    }
    if (Array.isArray(g18.listLotNoGuarantee) && g18.listLotNoGuarantee.length) {
      guaranteeLines.push(`- Lô áp dụng: ${JSON.stringify(g18.listLotNoGuarantee)}`);
    }
  }
  if (parsed.bideHsdt != null && parsed.bideHsdt !== "") {
    guaranteeLines.push(`- Chi phí nộp E-HSDT / ghi chú: ${parsed.bideHsdt}`);
  }
  if (parsed.effectTimeHSDT != null && parsed.effectTimeHSDT !== "") {
    guaranteeLines.push(`- Thời gian hiệu lực E-HSDT: ${parsed.effectTimeHSDT} ngày`);
  }
  if (parsed.eGuaranteeRadioValue != null && parsed.eGuaranteeRadioValue !== "") {
    guaranteeLines.push(`- Hình thức bảo đảm (radio): ${parsed.eGuaranteeRadioValue}`);
  }
  if (parsed.guaranteePercent != null && parsed.guaranteePercent !== "") {
    guaranteeLines.push(`- Tỷ lệ bảo đảm: ${parsed.guaranteePercent}%`);
  }
  if (parsed?.e_cdnt_18_1?.eGuarantee?.value != null) {
    guaranteeLines.push(`- e_cdnt_18_1.eGuarantee: ${parsed.e_cdnt_18_1.eGuarantee.value}`);
  }
  if (guaranteeLines.length) {
    parts.push(guaranteeLines.join("\n"));
  } else if (g18 && typeof g18 === "object" && (g18.competentPersons || g18.adviceCouncil)) {
    // TV đôi khi dùng dataRow14 cho mục khác — vẫn ghi nhận để không mất dữ liệu
    parts.push(
      "(Trường dataRow14 trên gói này không phải bảo đảm dự thầu — cấu trúc TV/XL khác. Kiểm tra thêm trên cổng MSC.)",
    );
    parts.push(JSON.stringify(g18, null, 2));
  } else {
    parts.push("(Chưa có nội dung bảo đảm dự thầu trên webform / gói không áp dụng.)");
  }

  return parts.join("\n").trim();
}

function pushUniqueRef(bucket, seen, ref) {
  const key = ref.fileId || ref.localTextKey;
  if (!key || seen.has(key)) {
    return;
  }
  seen.add(key);
  bucket.push(ref);
}

const CORE_TECH_FILE_RE =
  /y[eê]u\s*c[aầ]u|tham\s*chi[eế]u|ch[uư][ơo]ng\s*v\b|chuong\s*v\b|tckt|tor\b|[đd]i[eề]u\s*kho[aả]n/i;
const SKIP_ATTACHMENT_RE =
  /bản\s*vẽ|ban\s*ve|drawing|\.dwg|TABH|bản\s*vẽ|cad\b|\.rar$|\.zip$|\.7z$/i;

/**
 * Ưu tiên file chính (file / fileOther*) đúng nội dung cần tóm tắt.
 * Bỏ bản vẽ / archive phụ để nút bấm không tải hàng trăm MB.
 */
function collectRelevantFileRefs(formValue, chapter) {
  const parsed = parseMaybeJson(formValue);
  if (!parsed || typeof parsed !== "object") {
    return collectFileRefs(formValue);
  }

  const named = [];
  const seen = new Set();
  const pushNamed = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const fileId = node.fileId || node.publicFileId;
    if (!fileId || typeof fileId !== "string" || seen.has(fileId)) {
      return;
    }
    seen.add(fileId);
    named.push({
      fileId,
      fileName: node.fileName || node.name || fileId,
    });
  };

  pushNamed(parsed.file);
  pushNamed(parsed.fileTech);
  pushNamed(parsed.fileName2);
  pushNamed(parsed.fileName1);
  for (const key of ["fileOther1", "fileOther2", "fileOther3", "fileOther4", "fileOther5"]) {
    pushNamed(parsed[key]);
  }
  if (Array.isArray(parsed.attachFiles)) {
    for (const item of parsed.attachFiles) {
      pushNamed(item);
    }
  }

  const all = collectFileRefs(parsed);
  for (const ref of all) {
    if (!seen.has(ref.fileId)) {
      seen.add(ref.fileId);
      named.push(ref);
    }
  }

  if (chapter !== "chuong-5") {
    return named.filter((ref) => !/\.(rar|zip|7z)$/i.test(ref.fileName || ""));
  }

  const primaryId = parsed.file?.fileId || parsed.file?.publicFileId || "";
  const core = named.filter((ref) => {
    const name = ref.fileName || "";
    if (ref.fileId === primaryId) {
      return true;
    }
    if (SKIP_ATTACHMENT_RE.test(name) && !CORE_TECH_FILE_RE.test(name)) {
      return false;
    }
    return CORE_TECH_FILE_RE.test(name);
  });

  if (core.length) {
    return core;
  }
  if (primaryId) {
    return named.filter((ref) => ref.fileId === primaryId);
  }
  return named.slice(0, 1);
}

function extractChapterFiles(hsmt) {
  const confList = hsmt?.bidaInvChapterConfList || [];
  const dtos = Array.isArray(hsmt?.bidoInvBiddingDTO) ? hsmt.bidoInvBiddingDTO : [];
  const buckets = {
    "chuong-2": [],
    "chuong-3": [],
    "chuong-5": [],
    "hsmt-full": [],
  };
  const seenByChapter = {
    "chuong-2": new Set(),
    "chuong-3": new Set(),
    "chuong-5": new Set(),
    "hsmt-full": new Set(),
  };

  for (const dto of dtos) {
    const chapter = classifyChapter(dto, confList);
    if (!chapter) {
      continue;
    }

    const formName =
      confNameByFormCode(confList, dto.formCode) ||
      confNameByFormCode(confList, dto.chapterCode) ||
      SECTION_RULES[chapter].label;

    const refs = [
      ...collectRelevantFileRefs(dto.formValue, chapter),
      ...collectRelevantFileRefs(dto.formContent, chapter),
      ...collectFileRefs(dto.invFileOutDTO),
    ];

    for (const ref of refs) {
      pushUniqueRef(buckets[chapter], seenByChapter[chapter], {
        ...ref,
        formCode: dto.formCode || "",
        chapterCode: dto.chapterCode || "",
        chapterLabel: SECTION_RULES[chapter].label,
        confName: formName,
      });
    }

    // Chương II: tách đúng E-CDNT 10.8 + 18.2
    if (chapter === "chuong-2") {
      const checklist = extractChuong2ChecklistText(dto.formValue);
      if (checklist.length >= MIN_TEXT_CHARS) {
        pushUniqueRef(buckets[chapter], seenByChapter[chapter], {
          kind: "text",
          localTextKey: `text:chuong-2-checklist:${dto.formCode || "BD_DATA_TABLE"}`,
          text: checklist,
          fileName: safeFileName("E-CDNT-10.8-va-18.2.txt", "chuong-2.txt"),
          formCode: dto.formCode || "",
          chapterCode: dto.chapterCode || "",
          chapterLabel: SECTION_RULES[chapter].label,
          confName: formName,
        });
      }
      continue;
    }

    // Chương III/V: lưu text webform (bảng NL/KN, bảng Y…) khi không/cùng có file
    const text = formValueToText(dto.formValue, formName);
    if (text.length >= MIN_TEXT_CHARS) {
      const localTextKey = `text:${dto.formCode || dto.chapterCode || chapter}:${Buffer.from(text.slice(0, 120)).toString("base64").slice(0, 32)}`;
      pushUniqueRef(buckets[chapter], seenByChapter[chapter], {
        kind: "text",
        localTextKey,
        text,
        fileName: safeFileName(`${formName || dto.formCode || chapter}.txt`, `${chapter}.txt`),
        formCode: dto.formCode || "",
        chapterCode: dto.chapterCode || "",
        chapterLabel: SECTION_RULES[chapter].label,
        confName: formName,
      });
    }
  }

  // Gói offline / KHAC: HSMT một file PDF
  const offline = hsmt?.bidInvContractorOfflineDTO;
  if (offline) {
    const offlineRefs = [];
    if (offline.fileId) {
      offlineRefs.push({
        fileId: offline.fileId,
        fileName: offline.fileName || "E-HSMT.pdf",
      });
    }
    if (Array.isArray(offline.listOtherFile)) {
      for (const item of offline.listOtherFile) {
        const fileId = item?.fileId || item?.id;
        if (fileId) {
          offlineRefs.push({
            fileId,
            fileName: item.fileName || item.name || `${fileId}.pdf`,
          });
        }
      }
    }
    for (const ref of offlineRefs) {
      pushUniqueRef(buckets["hsmt-full"], seenByChapter["hsmt-full"], {
        ...ref,
        formCode: "OFFLINE_HSMT",
        chapterCode: "OFFLINE",
        chapterLabel: SECTION_RULES["hsmt-full"].label,
        confName: "HSMT đầy đủ",
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
 * Tải Tiêu chuẩn đánh giá HSDT + Yêu cầu kỹ thuật (mọi cấu trúc HSMT) về data/hsmt/{notifyNo}/.
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
        if (ref.kind === "text" && ref.text) {
          const finalName = safeFileName(ref.fileName || `${folder}.txt`);
          const dest = await ensureUniquePath(chapterDir, finalName);
          await fs.writeFile(dest, ref.text, "utf8");
          saved.push({
            chapter: folder,
            chapterLabel: ref.chapterLabel,
            fileId: null,
            kind: "text",
            fileName: path.basename(dest),
            bytes: Buffer.byteLength(ref.text, "utf8"),
            relativePath: path.relative(paths.dataDir, dest).replace(/\\/g, "/"),
            sourceUrl: null,
            formCode: ref.formCode,
            chapterCode: ref.chapterCode,
            confName: ref.confName || "",
          });
          continue;
        }

        const { buffer, fileName, url } = await downloadBinary(config, ref.fileId);
        const finalName = safeFileName(ref.fileName || fileName || `${ref.fileId}.bin`);
        const dest = await ensureUniquePath(chapterDir, finalName);
        await fs.writeFile(dest, buffer);
        saved.push({
          chapter: folder,
          chapterLabel: ref.chapterLabel,
          fileId: ref.fileId,
          kind: "file",
          fileName: path.basename(dest),
          bytes: buffer.length,
          relativePath: path.relative(paths.dataDir, dest).replace(/\\/g, "/"),
          sourceUrl: url,
          formCode: ref.formCode,
          chapterCode: ref.chapterCode,
          confName: ref.confName || "",
        });
      } catch (error) {
        errors.push({
          chapter: folder,
          fileId: ref.fileId || null,
          fileName: ref.fileName,
          error: error.message,
        });
      }
    }
  }

  // Offline full HSMT: nếu không tách được mục, vẫn dùng file đầy đủ để tóm tắt
  const hasChecklistCore = saved.some((f) =>
    ["chuong-2", "chuong-3", "chuong-5"].includes(f.chapter),
  );
  if (!hasChecklistCore && buckets["hsmt-full"].length === 0) {
    errors.push({
      chapter: "all",
      error:
        "Không tìm thấy Chương II/III/V (E-CDNT 10.8–18.2, tiêu chuẩn đánh giá, yêu cầu kỹ thuật) trên HSMT.",
    });
  }

  const result = {
    // Có file lõi là thành công; lỗi file phụ (rar/bản vẽ) không chặn tóm tắt
    ok: saved.length > 0,
    notifyNo,
    downloadedAt: new Date().toISOString(),
    chapters: {
      "chuong-2": buckets["chuong-2"].length,
      "chuong-3": buckets["chuong-3"].length,
      "chuong-5": buckets["chuong-5"].length,
      "hsmt-full": buckets["hsmt-full"].length,
    },
    files: saved,
    errors,
  };

  await fs.mkdir(tenderDir, { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

/**
 * Tải tiêu chuẩn đánh giá + yêu cầu kỹ thuật cho danh sách gói.
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
