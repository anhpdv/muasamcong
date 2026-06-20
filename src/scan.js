import { searchTenders } from "./api.js";
import { resolveDataPaths, toPublicTender } from "./loadTenders.js";
import {
  enrichWithWorkflowStatus,
  loadWorkflowStatuses,
} from "./tenderStatus.js";
import {
  CSV_COLUMNS,
  normalizeTender,
  tenderKey,
  toCsvRow,
} from "./normalize.js";
import {
  appendCsv,
  appendJsonl,
  ensureDataDir,
  loadState,
  saveState,
} from "./storage.js";

async function loadJsonlKeys(jsonlPath) {
  try {
    const { loadTendersFromJsonl } = await import("./loadTenders.js");
    const items = await loadTendersFromJsonl(jsonlPath);
    return new Set(items.map((item) => tenderKey(item)));
  } catch {
    return new Set();
  }
}

export async function trackTenders(paths, state, records) {
  const newTracked = [];

  for (const item of records) {
    const key = tenderKey(item);
    if (!state.seenKeys.has(key)) {
      state.seenKeys.add(key);
      newTracked.push(item);
    }
  }

  if (newTracked.length > 0) {
    await appendJsonl(paths.trackedPath, newTracked);
  }

  return newTracked;
}

export async function saveNewTenders(paths, state, records) {
  await trackTenders(paths, state, records);

  const savedKeys = await loadJsonlKeys(paths.jsonlPath);
  const newSaved = [];

  for (const item of records) {
    const key = tenderKey(item);
    if (!savedKeys.has(key)) {
      newSaved.push(item);
      savedKeys.add(key);
    }
  }

  if (newSaved.length > 0) {
    await appendJsonl(paths.jsonlPath, newSaved);
    await appendCsv(paths.csvPath, newSaved, CSV_COLUMNS, toCsvRow);
  }

  return newSaved;
}

export async function scanTenders(config, options = {}) {
  const paths = resolveDataPaths(config, options.rootDir || process.cwd());
  await ensureDataDir(paths.dataDir);

  const state = await loadState(paths.statePath);
  const mutableState = {
    seenKeys: new Set(state?.seenKeys || []),
    lastCheckAt: state?.lastCheckAt || null,
    lastPublicDate: state?.lastPublicDate || null,
    initialized: Boolean(state?.initialized),
  };

  const page = await searchTenders(config, {
    pageNumber: options.pageNumber || 0,
    pageSize: options.pageSize || config.pageSize || 10,
    keyword: options.keyword || "",
    investField: options.investField || "",
    provCode: options.provCode || "",
  });

  const crawledAt = new Date().toISOString();
  const normalized = page.content.map((item) =>
    normalizeTender(item, crawledAt),
  );

  const shouldSave = options.saveNew !== false;
  const newRecords = shouldSave
    ? await saveNewTenders(paths, mutableState, normalized)
    : [];

  mutableState.initialized = true;
  mutableState.lastCheckAt = crawledAt;
  if (normalized[0]?.publicDate) {
    mutableState.lastPublicDate = normalized[0].publicDate;
  }

  if (shouldSave) {
    await saveState(paths.statePath, mutableState);
  }

  const statuses = await loadWorkflowStatuses(paths.statusesPath);

  const items = normalized.map((item) => {
    const withStatus = enrichWithWorkflowStatus(item, statuses);
    return toPublicTender(withStatus);
  });

  return {
    ok: true,
    source: "api",
    message:
      newRecords.length > 0
        ? `Quét được ${items.length} gói thầu, lưu mới ${newRecords.length} gói`
        : `Quét được ${items.length} gói thầu, không có gói mới`,
    items,
    newCount: newRecords.length,
    checked: items.length,
    totalElements: page.totalElements ?? items.length,
    totalSeen: mutableState.seenKeys.size,
    filters: {
      keyword: options.keyword || "",
      investField: options.investField || "",
      provCode: options.provCode || "",
    },
  };
}
