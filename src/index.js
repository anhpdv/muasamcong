import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMonitor, watchMonitor } from "./monitor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function loadConfig() {
  const configPath = path.join(rootDir, "config.json");
  const raw = await fs.readFile(configPath, "utf8");
  return JSON.parse(raw);
}

const mode = process.argv[2] || "once";

const config = await loadConfig();

if (mode === "watch") {
  await watchMonitor(config);
} else if (mode === "init") {
  const result = await runMonitor(config, { mode: "init" });
  console.log(
    `Init xong. Đã theo dõi ${result.totalSeen} gói, chưa ghi dữ liệu mới.`,
  );
} else if (mode === "once") {
  const result = await runMonitor(config, { mode: "once" });
  console.log(
    `Xong. Kiểm tra ${result.checked} gói, phát hiện ${result.newCount} gói mới.`,
  );
} else {
  console.error("Cách dùng: node src/index.js [once|watch|init]");
  process.exit(1);
}
