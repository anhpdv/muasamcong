import fs from "node:fs/promises";
import path from "node:path";
import { buildDetailUrl, buildPlanUrl, tenderKey } from "./normalize.js";
import {
  enrichWithWorkflowStatus,
  getWorkflowStatusLabel,
  loadWorkflowStatuses,
} from "./tenderStatus.js";

export async function loadTendersFromJsonl(jsonlPath) {
  try {
    const content = await fs.readFile(jsonlPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());

    return lines
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch {
          console.warn(`Bỏ qua dòng JSONL lỗi tại dòng ${index + 1}`);
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function loadState(statePath) {
  try {
    const content = await fs.readFile(statePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

const INVEST_FIELD_LABELS = {
  HH: "Hàng hóa",
  XL: "Xây lắp",
  TV: "Tư vấn",
  PT: "Phi tư vấn",
  HON_HOP: "Hỗn hợp",
};

const BID_FORM_LABELS = {
  CHCT: "Chào hàng cạnh tranh",
  DTRR: "Đấu thầu rộng rãi",
  DTHC: "Đấu thầu hạn chế",
  MTHS: "Một túi hồ sơ",
  "1_MTHS": "Một túi hồ sơ",
};

const STATUS_LABELS = {
  "01": "Chưa đóng thầu",
  "02": "Đã đóng thầu",
  "03": "Đã hủy",
};

export function formatInvestField(code) {
  return INVEST_FIELD_LABELS[code] || code || "—";
}

export function formatBidForm(code) {
  return BID_FORM_LABELS[code] || code || "—";
}

export function formatStatus(code) {
  return STATUS_LABELS[code] || code || "—";
}

export function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatMoney(value, unit = "VND") {
  if (value == null || value === "") {
    return "—";
  }

  const amount = Array.isArray(value) ? value[0] : value;
  const number = Number(amount);
  if (Number.isNaN(number)) {
    return String(amount);
  }

  return `${new Intl.NumberFormat("vi-VN").format(number)} ${unit}`;
}

export function attachStorageStatus(tender, { isSaved = false, isTracked = false } = {}) {
  return {
    ...tender,
    isSaved: Boolean(isSaved),
    isTracked: Boolean(isTracked),
  };
}

export function toPublicTender(tender) {
  const bidPrice = tender.raw?.bidPrice;
  return {
    id: tender.id,
    notifyNo: tender.notifyNo,
    notifyVersion: tender.notifyVersion,
    bidName: tender.bidName,
    investorName: tender.investorName,
    procuringEntityName: tender.procuringEntityName,
    investField: tender.investField,
    investFieldLabel: formatInvestField(tender.investField),
    bidForm: tender.bidForm,
    bidFormLabel: formatBidForm(tender.bidForm),
    status: tender.status,
    statusLabel: formatStatus(tender.status),
    isInternet: tender.isInternet === 1 ? "Qua mạng" : "Không qua mạng",
    publicDate: tender.publicDate,
    publicDateLabel: formatDate(tender.publicDate),
    bidCloseDate: tender.bidCloseDate,
    bidCloseDateLabel: formatDate(tender.bidCloseDate),
    bidOpenDate: tender.bidOpenDate,
    bidOpenDateLabel: formatDate(tender.bidOpenDate),
    locations: tender.locations,
    provCode: tender.provCode || "",
    provName: tender.provName || "",
    planNo: tender.planNo,
    planUrl: buildPlanUrl(tender.raw || {}, { planNo: tender.planNo, planType: tender.planType }),
    bidPrice: formatMoney(bidPrice),
    crawledAt: tender.crawledAt,
    crawledAtLabel: formatDate(tender.crawledAt),
    detailUrl: buildDetailUrl(tender.raw || tender),
    tenderKey: tender.tenderKey || tenderKey(tender),
    workflowStatus: tender.workflowStatus || "",
    workflowStatusLabel: getWorkflowStatusLabel(tender.workflowStatus),
  };
}

export async function loadTenderCatalog(paths) {
  const statuses = await loadWorkflowStatuses(paths.statusesPath);
  const state = await loadState(paths.statePath);
  const seenKeys = new Set(state?.seenKeys || []);
  const saved = await loadTendersFromJsonl(paths.jsonlPath);
  const tracked = await loadTendersFromJsonl(paths.trackedPath);
  const savedKeys = new Set(saved.map((item) => tenderKey(item)));
  const catalog = new Map();

  for (const item of tracked) {
    const key = tenderKey(item);
    catalog.set(
      key,
      attachStorageStatus(item, {
        isSaved: savedKeys.has(key),
        isTracked: seenKeys.has(key),
      }),
    );
  }

  for (const item of saved) {
    const key = tenderKey(item);
    catalog.set(
      key,
      attachStorageStatus(item, {
        isSaved: true,
        isTracked: seenKeys.has(key),
      }),
    );
  }

  for (const key of seenKeys) {
    if (catalog.has(key)) {
      continue;
    }

    const notifyNo = key.replace(/-\d+$/, "");
    catalog.set(
      key,
      attachStorageStatus(
        {
          id: key,
          notifyNo,
          notifyNoStand: key,
          notifyVersion: key.split("-").pop() || "00",
          bidName: "Gói thầu đang theo dõi (chưa có chi tiết đầy đủ)",
          investorName: "",
          procuringEntityName: "",
          investField: "",
          bidForm: "",
          status: "",
          isInternet: "",
          publicDate: "",
          bidCloseDate: "",
          bidOpenDate: "",
          locations: "",
          provCode: "",
          provName: "",
          planNo: "",
          crawledAt: state?.lastCheckAt || "",
          detailUrl: `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=${encodeURIComponent(notifyNo)}`,
          raw: null,
        },
        { isSaved: false, isTracked: true },
      ),
    );
  }

  return Array.from(catalog.values()).map((item) =>
    enrichWithWorkflowStatus(item, statuses),
  );
}

export function filterAndSortTenders(tenders, options = {}) {
  const {
    q = "",
    field = "",
    provCode = "",
    workflowStatus = "",
    sort = "publicDate",
    order = "desc",
  } = options;

  const keyword = q.trim().toLowerCase();

  let result = tenders;

  if (keyword) {
    result = result.filter((item) =>
      [
        item.notifyNo,
        item.bidName,
        item.investorName,
        item.procuringEntityName,
        item.locations,
        item.provName,
        item.planNo,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword),
    );
  }

  if (field) {
    result = result.filter((item) => item.investField === field);
  }

  if (provCode) {
    result = result.filter((item) => {
      const codes = [
        ...(item.provCodes || []),
        item.provCode,
        ...(item.raw?.locations?.map((loc) => loc.provCode) || []),
      ].filter(Boolean);
      return codes.includes(provCode);
    });
  }

  if (workflowStatus) {
    result = result.filter((item) => item.workflowStatus === workflowStatus);
  }

  const direction = order === "asc" ? 1 : -1;
  result = result.map(toPublicTender);
  result.sort((left, right) => {
    const leftValue = left[sort] ?? "";
    const rightValue = right[sort] ?? "";

    if (sort.includes("Date") || sort === "crawledAt") {
      return (new Date(leftValue) - new Date(rightValue)) * direction;
    }

    return String(leftValue).localeCompare(String(rightValue), "vi") * direction;
  });

  return result;
}

export function paginate(items, page = 1, limit = 20) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const start = (safePage - 1) * safeLimit;

  return {
    items: items.slice(start, start + safeLimit),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / safeLimit)),
    },
  };
}

export function resolveDataPaths(config, rootDir) {
  const dataDir = path.resolve(rootDir, config.dataDir);
  return {
    dataDir,
    jsonlPath: path.join(dataDir, config.jsonlFile),
    trackedPath: path.join(dataDir, config.trackedFile || "tracked.jsonl"),
    csvPath: path.join(dataDir, config.csvFile),
    statePath: path.join(dataDir, config.stateFile),
    statusesPath: path.join(dataDir, config.statusesFile || "tender-statuses.json"),
  };
}
