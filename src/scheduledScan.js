import fs from "node:fs/promises";
import path from "node:path";
import { isPublicDateToday, searchTenders } from "./api.js";
import { resolveDataPaths } from "./loadTenders.js";
import { normalizeTender, tenderKey } from "./normalize.js";
import { saveNewTenders } from "./scan.js";
import { ensureDataDir, loadState, saveState } from "./storage.js";

function log(message) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${message}`);
}

export function getScheduleFilters(config) {
  return config.schedule?.filters || {};
}

export async function fetchCandidates(config, options = {}) {
  const filters = getScheduleFilters(config);
  const pageSize = options.pageSize || config.schedule?.pageSize || config.pageSize || 10;
  const maxPages = options.maxPages || config.schedule?.maxPages || 5;
  const seenKeys = options.seenKeys || new Set();
  const collected = [];
  const collectedKeys = new Set();
  const timezone = config.schedule?.timezone || "Asia/Ho_Chi_Minh";
  const onlyToday = Boolean(filters.publicDateToday);

  for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
    const page = await searchTenders(config, {
      pageNumber,
      pageSize,
      provCodes: filters.provCodes || [],
      investFields: filters.investFields || [],
      sortBy: filters.sortBy || "publicDate",
      sortType: filters.sortType || "DESC",
      publicDateToday: Boolean(filters.publicDateToday),
      timezone,
    });

    if (!page.content?.length) {
      break;
    }

    let pageAllKnown = true;

    for (const raw of page.content) {
      if (onlyToday && !isPublicDateToday(raw.publicDate || raw.originalPublicDate, timezone)) {
        continue;
      }

      const key = tenderKey(normalizeTender(raw));
      if (!seenKeys.has(key)) {
        pageAllKnown = false;
      }
      if (!collectedKeys.has(key)) {
        collectedKeys.add(key);
        collected.push(raw);
      }
    }

    if (pageAllKnown) {
      break;
    }
  }

  return collected;
}

export async function runScheduledScan(config, rootDir) {
  const paths = resolveDataPaths(config, rootDir);
  await ensureDataDir(paths.dataDir);

  const state = await loadState(paths.statePath);
  const mutableState = {
    seenKeys: new Set(state?.seenKeys || []),
    lastCheckAt: state?.lastCheckAt || null,
    lastPublicDate: state?.lastPublicDate || null,
    initialized: true,
  };

  const filters = getScheduleFilters(config);
  const crawledAt = new Date().toISOString();

  const todayNote = filters.publicDateToday ? " · chỉ hôm nay" : "";
  log(
    `Bắt đầu quét theo lịch · Tỉnh: ${(filters.provNames || filters.provCodes || []).join(", ")} · Lĩnh vực: ${(filters.investFields || []).join(", ")}${todayNote}`,
  );

  const rawItems = await fetchCandidates(config, { seenKeys: mutableState.seenKeys });
  const normalized = rawItems.map((item) => normalizeTender(item, crawledAt));
  const newRecords = await saveNewTenders(paths, mutableState, normalized);

  if (normalized[0]?.publicDate) {
    mutableState.lastPublicDate = normalized[0].publicDate;
  }
  mutableState.lastCheckAt = crawledAt;
  await saveState(paths.statePath, mutableState);

  const result = {
    ok: true,
    checked: normalized.length,
    newCount: newRecords.length,
    skipped: normalized.length - newRecords.length,
    totalSeen: mutableState.seenKeys.size,
    filters,
    ranAt: crawledAt,
  };

  log(
    result.newCount > 0
      ? `Hoàn tất: ${result.newCount} gói mới, bỏ qua ${result.skipped} gói đã có`
      : `Hoàn tất: không có gói mới (đã kiểm tra ${result.checked} gói)`,
  );

  return result;
}

export function getVietnamDateParts(date = new Date(), timezone = "Asia/Ho_Chi_Minh") {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    timeKey: `${parts.hour}:${parts.minute}`,
  };
}

export async function loadScheduleState(scheduleStatePath) {
  try {
    const content = await fs.readFile(scheduleStatePath, "utf8");
    return JSON.parse(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { runs: {} };
    }
    throw error;
  }
}

export async function saveScheduleState(scheduleStatePath, state) {
  await fs.writeFile(scheduleStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function shouldRunSlot(config, slot, now = new Date(), alreadyRan = false) {
  if (alreadyRan) {
    return false;
  }

  const timezone = config.schedule?.timezone || "Asia/Ho_Chi_Minh";
  const { timeKey } = getVietnamDateParts(now, timezone);
  const [slotHour, slotMinute] = slot.split(":").map(Number);
  const [currentHour, currentMinute] = timeKey.split(":").map(Number);

  const slotTotal = slotHour * 60 + slotMinute;
  const currentTotal = currentHour * 60 + currentMinute;

  return currentTotal >= slotTotal;
}

export function getRunKey(dateKey, slot) {
  return `${dateKey}_${slot.replace(":", "")}`;
}

export async function maybeRunDueScans(config, rootDir) {
  if (!config.schedule?.enabled) {
    return null;
  }

  const paths = resolveDataPaths(config, rootDir);
  const scheduleStatePath = path.join(
    paths.dataDir,
    config.scheduleStateFile || "schedule-state.json",
  );
  const scheduleState = await loadScheduleState(scheduleStatePath);
  const timezone = config.schedule.timezone || "Asia/Ho_Chi_Minh";
  const { dateKey } = getVietnamDateParts(new Date(), timezone);
  const results = [];

  for (const slot of config.schedule.times || []) {
    const runKey = getRunKey(dateKey, slot);
    const alreadyRan = Boolean(scheduleState.runs?.[runKey]);

    if (!shouldRunSlot(config, slot, new Date(), alreadyRan)) {
      continue;
    }

    const result = await runScheduledScan(config, rootDir);
    scheduleState.runs = scheduleState.runs || {};
    scheduleState.runs[runKey] = {
      ranAt: result.ranAt,
      newCount: result.newCount,
      checked: result.checked,
    };
    await saveScheduleState(scheduleStatePath, scheduleState);
    results.push({ slot, ...result });
  }

  return results;
}
