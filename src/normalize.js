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
    crawledAt,
    raw,
  };
}

function buildDetailUrl(raw) {
  const params = new URLSearchParams({
    render: "detail",
    type: raw.type || "es-notify-contractor",
    stepCode: raw.stepCode || "notify-contractor-step-1-tbmt",
    id: raw.id || raw.notifyId || "",
    notifyId: raw.notifyId || raw.id || "",
    notifyNo: raw.notifyNo || "",
    bidMode: raw.bidMode || "",
    processApply: raw.processApply || "",
    step: "tbmt",
  });

  return `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${params}`;
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
