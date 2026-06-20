import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maybeRunDueScans, runScheduledScan } from "./scheduledScan.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function loadConfig() {
  const raw = await fs.readFile(path.join(rootDir, "config.json"), "utf8");
  return JSON.parse(raw);
}

const config = await loadConfig();

if (!config.schedule?.enabled) {
  console.error("Schedule chưa bật trong config.json");
  process.exit(1);
}

const mode = process.argv[2] || "daemon";

if (mode === "now") {
  const result = await runScheduledScan(config, rootDir);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const intervalMs = (config.schedule.checkIntervalSeconds || 30) * 1000;
const times = (config.schedule.times || []).join(", ");
const filters = config.schedule.filters || {};

console.log("AI Mua sắm công — Lịch quét tự động");
console.log(`Giờ quét (VN): ${times}`);
console.log(
  `Bộ lọc: ${(filters.provNames || []).join(", ")} · ${(filters.investFields || []).join(", ")} · mới đăng nhất`,
);
console.log(`Kiểm tra mỗi ${config.schedule.checkIntervalSeconds || 30} giây · Ctrl+C để dừng`);

setInterval(() => {
  maybeRunDueScans(config, rootDir).catch((error) => {
    console.error(`[scheduler] ${error.message}`);
  });
}, intervalMs);

maybeRunDueScans(config, rootDir).catch((error) => {
  console.error(`[scheduler] ${error.message}`);
});
