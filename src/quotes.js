import path from "node:path";
import { searchQuotes } from "./api.js";
import { buildDetailUrl, tenderKey } from "./normalize.js";
import { loadTendersFromJsonl, resolveDataPaths } from "./loadTenders.js";
import {
  appendJsonl,
  ensureDataDir,
  loadState,
  saveState,
} from "./storage.js";

export const QUOTE_BID_FORMS = [
  { value: "HHDVK", label: "Gói thầu hàng hóa/dịch vụ" },
  { value: "VATTU", label: "Vật tư" },
  { value: "VATTU_ALL", label: "Vật tư (tất cả)" },
  { value: "THUOC", label: "Thuốc" },
  { value: "HH", label: "Hàng hóa" },
];

const QUOTE_FORM_LABELS = Object.fromEntries(
  QUOTE_BID_FORMS.map((item) => [item.value, item.label]),
);

export function quotePaths(config, rootDir) {
  const paths = resolveDataPaths(config, rootDir);
  return {
    ...paths,
    quotesPath: path.join(paths.dataDir, config.quoteFile || "quotes.jsonl"),
    quoteStatePath: path.join(paths.dataDir, config.quoteStateFile || "quote-state.json"),
  };
}

function firstLocation(locations) {
  if (!Array.isArray(locations) || !locations.length) {
    return { provCode: "", provName: "", districtName: "" };
  }
  const loc = locations[0] || {};
  return {
    provCode: loc.provCode || "",
    provName: loc.provName || "",
    districtName: loc.districtName || "",
  };
}

export function normalizeQuote(raw, crawledAt = new Date().toISOString()) {
  const loc = firstLocation(raw.locations);
  const notifyNo = raw.notifyNo || "";
  const notifyVersion = raw.notifyVersion || "00";
  const name = raw.name || raw.pname || raw.bidName || "";
  return {
    id: raw.id || "",
    notifyNo,
    notifyVersion,
    notifyNoStand: `${notifyNo}-${notifyVersion}`,
    name,
    investorName: raw.investorName || "",
    investorCode: raw.investorCode || "",
    bidForm: raw.bidForm || "",
    bidFormLabel: QUOTE_FORM_LABELS[raw.bidForm] || raw.bidForm || "—",
    status: raw.status || "",
    publicDate: raw.publicDate || "",
    bidCloseDate: raw.bidCloseDate || "",
    provCode: loc.provCode,
    provName: loc.provName,
    districtName: loc.districtName,
    locations: raw.locations || [],
    stepCode: raw.stepCode || "request-quote-step-1",
    type: "es-ycbg",
    detailUrl: buildDetailUrl({
      ...raw,
      type: "es-ycbg",
      stepCode: raw.stepCode || "request-quote-step-1",
    }),
    crawledAt,
  };
}

function includesText(haystack, needle) {
  const h = String(haystack || "").toLowerCase();
  const n = String(needle || "").trim().toLowerCase();
  return !n || h.includes(n);
}

function matchesExclude(item, excludeText) {
  const parts = String(excludeText || "")
    .split(/[,;]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
  if (!parts.length) {
    return true;
  }
  const blob = `${item.name} ${item.investorName} ${item.notifyNo}`.toLowerCase();
  return parts.every((part) => !blob.includes(part));
}

export function filterQuotes(items, options = {}) {
  return items.filter((item) => {
    if (!matchesExclude(item, options.exclude)) {
      return false;
    }
    if (options.investor && !includesText(`${item.investorName} ${item.investorCode}`, options.investor)) {
      return false;
    }
    if (options.category && !includesText(item.name, options.category)) {
      return false;
    }
    if (options.q) {
      const blob = `${item.notifyNo} ${item.name} ${item.investorName} ${item.provName}`;
      if (!includesText(blob, options.q)) {
        return false;
      }
    }
    return true;
  });
}

async function fetchQuotePages(config, options = {}) {
  const pageSize = Math.min(Number(options.pageSize) || config.pageSize || 10, 10);
  const maxPages = Math.max(1, Math.min(Number(options.maxPages) || 10, 30));
  const collected = [];
  const seen = new Set();

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await searchQuotes(config, {
      ...options,
      pageNumber,
      pageSize,
    });
    const content = page.content || [];
    if (!content.length) {
      break;
    }
    for (const raw of content) {
      const key = `${raw.notifyNo || ""}-${raw.notifyVersion || "00"}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      collected.push(raw);
    }
    if (content.length < pageSize) {
      break;
    }
  }

  return collected;
}

export async function loadQuoteCatalog(paths) {
  const items = await loadTendersFromJsonl(paths.quotesPath);
  const byKey = new Map();
  for (const item of items) {
    byKey.set(tenderKey(item), item);
  }
  return [...byKey.values()].sort((a, b) =>
    String(b.publicDate || "").localeCompare(String(a.publicDate || "")),
  );
}

export async function scanQuotes(config, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const paths = quotePaths(config, rootDir);
  await ensureDataDir(paths.dataDir);

  const state = await loadState(paths.quoteStatePath);
  const crawledAt = new Date().toISOString();
  const rawItems = await fetchQuotePages(config, options);
  const normalized = filterQuotes(
    rawItems.map((item) => normalizeQuote(item, crawledAt)),
    {
      exclude: options.exclude || "",
      investor: options.investor || "",
      category: options.category || "",
    },
  );

  const savedKeys = new Set((await loadQuoteCatalog(paths)).map((item) => tenderKey(item)));
  const newRecords = [];
  for (const item of normalized) {
    const key = tenderKey(item);
    state.seenKeys.add(key);
    if (!savedKeys.has(key)) {
      newRecords.push(item);
      savedKeys.add(key);
    }
  }

  if (newRecords.length) {
    await appendJsonl(paths.quotesPath, newRecords);
  }

  state.lastCheckAt = crawledAt;
  if (normalized[0]?.publicDate) {
    state.lastPublicDate = normalized[0].publicDate;
  }
  state.initialized = true;
  await saveState(paths.quoteStatePath, state);

  return {
    ok: true,
    checked: normalized.length,
    newCount: newRecords.length,
    skipped: normalized.length - newRecords.length,
    totalSeen: state.seenKeys.size,
    ranAt: crawledAt,
    items: normalized,
  };
}

export async function runScheduledQuoteScan(config, rootDir) {
  const filters = config.schedule?.filters || {};
  const quoteSchedule = config.quoteSchedule || {};
  const result = await scanQuotes(config, {
    rootDir,
    provCodes: filters.provCodes || [],
    bidForms: quoteSchedule.bidForms || ["HHDVK"],
    validity: quoteSchedule.validity || "open",
    publicDateToday: quoteSchedule.publicDateToday !== false,
    timezone: config.schedule?.timezone || "Asia/Ho_Chi_Minh",
    maxPages: quoteSchedule.maxPages || config.schedule?.maxPages || 10,
    pageSize: config.schedule?.pageSize || 10,
    sortBy: "publicDate",
    sortType: "DESC",
  });

  console.log(
    `[${result.ranAt}] Yêu cầu báo giá: kiểm tra ${result.checked}, lưu mới ${result.newCount}`,
  );
  return result;
}
