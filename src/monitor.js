import { fetchLatestTenders } from "./api.js";
import { normalizeTender, tenderKey } from "./normalize.js";
import { saveNewTenders, trackTenders } from "./scan.js";
import { resolveDataPaths } from "./loadTenders.js";
import { ensureDataDir, loadState, saveState } from "./storage.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function log(message) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${message}`);
}

export async function runMonitor(config, { mode = "once" } = {}) {
  const paths = resolveDataPaths(config, rootDir);
  await ensureDataDir(paths.dataDir);

  const state = await loadState(paths.statePath);
  const page = await fetchLatestTenders(config, 0);
  const crawledAt = new Date().toISOString();
  const normalized = page.content.map((item) =>
    normalizeTender(item, crawledAt),
  );

  if (!state.initialized) {
    if (mode === "init" || config.initMarkSeenOnly) {
      await trackTenders(paths, state, normalized);
      state.initialized = true;
      state.lastCheckAt = crawledAt;
      state.lastPublicDate = normalized[0]?.publicDate || null;
      await saveState(paths.statePath, state);

      log(
        mode === "init"
          ? `Đã khởi tạo state với ${normalized.length} gói thầu hiện có (chưa ghi file).`
          : `Lần chạy đầu: đánh dấu ${normalized.length} gói hiện có, chỉ lưu gói mới từ lần sau.`,
      );
      return { newCount: 0, totalSeen: state.seenKeys.size };
    }
  }

  const newRecords = await saveNewTenders(paths, state, normalized);

  if (newRecords.length > 0) {
    for (const record of newRecords) {
      log(`Gói mới: ${record.notifyNo} | ${record.bidName}`);
    }
  } else {
    log("Không có gói thầu mới.");
  }

  state.initialized = true;
  state.lastCheckAt = crawledAt;
  if (normalized[0]?.publicDate) {
    state.lastPublicDate = normalized[0].publicDate;
  }
  await saveState(paths.statePath, state);

  return {
    newCount: newRecords.length,
    totalSeen: state.seenKeys.size,
    checked: normalized.length,
  };
}

export async function watchMonitor(config) {
  const intervalMs = config.pollIntervalMinutes * 60 * 1000;
  log(
    `Bắt đầu theo dõi mỗi ${config.pollIntervalMinutes} phút. Nhấn Ctrl+C để dừng.`,
  );

  const tick = async () => {
    try {
      const result = await runMonitor(config, { mode: "watch" });
      log(
        `Hoàn tất: ${result.newCount} gói mới, tổng đã theo dõi ${result.totalSeen}.`,
      );
    } catch (error) {
      log(`Lỗi: ${error.message}`);
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}
