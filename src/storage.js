import fs from "node:fs/promises";
import path from "node:path";

export async function ensureDataDir(dataDir) {
  await fs.mkdir(dataDir, { recursive: true });
}

export async function loadState(statePath) {
  try {
    const content = await fs.readFile(statePath, "utf8");
    const state = JSON.parse(content);
    return {
      seenKeys: new Set(state.seenKeys || []),
      lastCheckAt: state.lastCheckAt || null,
      lastPublicDate: state.lastPublicDate || null,
      initialized: Boolean(state.initialized),
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        seenKeys: new Set(),
        lastCheckAt: null,
        lastPublicDate: null,
        initialized: false,
      };
    }
    throw error;
  }
}

export async function saveState(statePath, state) {
  const payload = {
    seenKeys: [...state.seenKeys],
    lastCheckAt: state.lastCheckAt,
    lastPublicDate: state.lastPublicDate,
    initialized: state.initialized,
  };
  await fs.writeFile(statePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function appendJsonl(jsonlPath, records) {
  if (records.length === 0) {
    return;
  }

  const lines = records.map((record) => JSON.stringify(record)).join("\n");
  await fs.appendFile(jsonlPath, `${lines}\n`, "utf8");
}

export async function appendCsv(csvPath, records, columns, toCsvRow) {
  if (records.length === 0) {
    return;
  }

  let prefix = "";
  try {
    await fs.access(csvPath);
  } catch {
    prefix = `\uFEFF${columns.join(",")}\n`;
  }

  const rows = records.map((record) => toCsvRow(record)).join("\n");
  await fs.appendFile(csvPath, `${prefix}${rows}\n`, "utf8");
}

export function resolvePaths(config) {
  const dataDir = path.resolve(config.dataDir);
  return {
    dataDir,
    jsonlPath: path.join(dataDir, config.jsonlFile),
    csvPath: path.join(dataDir, config.csvFile),
    statePath: path.join(dataDir, config.stateFile),
  };
}
