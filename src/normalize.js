function first(value) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

function joinLocations(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return "";
  }

  return locations
    .map((loc) => {
      const parts = [loc.provName, loc.districtName].filter(Boolean);
      return parts.join(" - ");
    })
    .join("; ");
}

export function extractProvinceInfo(locations) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return { provCodes: [], provNames: [], provCode: "", provName: "" };
  }

  const provCodes = [...new Set(locations.map((loc) => loc.provCode).filter(Boolean))];
  const provNames = [...new Set(locations.map((loc) => loc.provName).filter(Boolean))];

  return {
    provCodes,
    provNames,
    provCode: provCodes[0] || "",
    provName: provNames.join("; "),
  };
}

export function tenderKey(item) {
  return item.notifyNoStand || `${item.notifyNo}-${item.notifyVersion || "00"}`;
}

export function normalizeTender(raw, crawledAt = new Date().toISOString()) {
  const province = extractProvinceInfo(raw.locations);

  return {
    id: raw.id || raw.notifyId || "",
    notifyNo: raw.notifyNo || "",
    notifyVersion: raw.notifyVersion || "",
    notifyNoStand: raw.notifyNoStand || tenderKey(raw),
    bidName: first(raw.bidName),
    investorName: raw.investorName || "",
    investorCode: raw.investorCode || "",
    procuringEntityName: raw.procuringEntityName || "",
    planNo: raw.planNo || "",
    planType: raw.planType || "",
    investField: first(raw.investField),
    bidForm: raw.bidForm || "",
    bidMode: raw.bidMode || "",
    processApply: raw.processApply || "",
    status: raw.status || "",
    isInternet: raw.isInternet ?? "",
    publicDate: raw.publicDate || raw.originalPublicDate || "",
    bidOpenDate: raw.bidOpenDate || "",
    bidCloseDate: raw.bidCloseDate || "",
    locations: joinLocations(raw.locations),
    provCode: province.provCode,
    provName: province.provName,
    provCodes: province.provCodes,
    detailUrl: buildDetailUrl(raw),
    planUrl: buildPlanUrl(raw),
    crawledAt,
    raw,
  };
}

function firstValue(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

const PORTAL_GUEST = "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection";
const PORTLET_ID = "egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2";
const PORTLET_RENDER = `_${PORTLET_ID}_render`;

function buildPortletUrl(render, query = {}) {
  const params = new URLSearchParams({
    p_p_id: PORTLET_ID,
    p_p_lifecycle: "0",
    p_p_state: "normal",
    p_p_mode: "view",
    [PORTLET_RENDER]: render,
  });

  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== "") {
      params.set(key, String(value));
    }
  }

  return `${PORTAL_GUEST}?${params}`;
}

export function buildDetailUrl(raw = {}) {
  const notifyId = raw.notifyId || raw.id || "";
  const notifyNo = raw.notifyNo || "";

  if (!notifyId && !notifyNo) {
    return PORTAL_GUEST;
  }

  return buildPortletUrl("detail-v2", {
    type: raw.type || "es-notify-contractor",
    stepCode: raw.stepCode || "notify-contractor-step-1-tbmt",
    id: notifyId,
    notifyId,
    notifyNo,
    bidMode: raw.bidMode || "",
    processApply: raw.processApply || "",
    planNo: raw.planNo || "",
    bidId: raw.bidId || "",
    investField: firstValue(raw.investField),
    bidForm: raw.bidForm || "",
    isInternet: raw.isInternet ?? "",
    caseKHKQ: raw.caseKHKQ || "",
  });
}

export function buildPlanUrl(raw = {}, plan = {}) {
  const planNo = plan.planNo || raw.planNo || "";
  if (!planNo) {
    return "";
  }

  const planId = plan.id || plan.planId || "";
  if (planId) {
    return buildPlanDetailUrl(plan, { planNo, planType: raw.planType || plan.planType });
  }

  return buildPlanSearchUrl(planNo);
}

export function buildPlanDetailUrl(plan = {}, fallback = {}) {
  const planNo = plan.planNo || fallback.planNo || "";
  const planId = plan.id || plan.planId || "";
  if (!planId || !planNo) {
    return planNo ? buildPlanSearchUrl(planNo) : "";
  }

  return buildPortletUrl("detail-v2", {
    type: plan.type || "es-plan-project-p",
    stepCode: plan.stepCode || "plan-step-1",
    id: planId,
    planNo,
    planType: plan.planType || fallback.planType || "",
    planVersion: plan.planVersion || "00",
  });
}

export function buildPlanSearchUrl(planNo) {
  return buildPortletUrl("search", {
    keyword: planNo,
    searchWith: "planNo,name",
  });
}

export function buildTbmtSearchUrl(notifyNo) {
  return buildPortletUrl("index", {
    keyword: notifyNo,
    searchWith: "notifyNo,bidName",
  });
}

export function buildSearchUrl(keyword, searchWith = "") {
  const query = { keyword: keyword || "" };
  if (searchWith) {
    query.searchWith = searchWith;
  }
  return buildPortletUrl("search", query);
}

export function buildFileDownloadUrl(config, file = {}) {
  const baseUrl = config?.baseUrl || "https://muasamcong.mpi.gov.vn";

  if (file.url) {
    return file.url.startsWith("http") ? file.url : `${baseUrl}${file.url}`;
  }

  if (file.downloadUrl) {
    return file.downloadUrl.startsWith("http")
      ? file.downloadUrl
      : `${baseUrl}${file.downloadUrl}`;
  }

  const fileId = file.fileId || file.publicFileId || file.id || "";
  if (fileId) {
    return `${baseUrl}/api/unau/edocproxy/file/share/${fileId}`;
  }

  if (file.bucketName && file.fileName) {
    const params = new URLSearchParams({
      bucketName: file.bucketName,
      fileName: file.fileName,
    });
    return `${baseUrl}/o/egp-portal-file/services/download?${params}`;
  }

  return "";
}

export const CSV_COLUMNS = [
  "crawledAt",
  "notifyNo",
  "notifyVersion",
  "bidName",
  "investorName",
  "procuringEntityName",
  "investField",
  "bidForm",
  "publicDate",
  "bidCloseDate",
  "bidOpenDate",
  "locations",
  "provName",
  "planNo",
  "status",
  "isInternet",
  "detailUrl",
  "id",
];

export function toCsvRow(record) {
  return CSV_COLUMNS.map((column) => escapeCsv(record[column])).join(",");
}

function escapeCsv(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
