import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchProvinces } from "./api.js";
import {
  filterAndSortTenders,
  loadState,
  loadTenderCatalog,
  paginate,
  resolveDataPaths,
  toPublicTender,
} from "./loadTenders.js";
import { runMonitor } from "./monitor.js";
import { maybeRunDueScans } from "./scheduledScan.js";
import { scanTenders } from "./scan.js";
import { fetchTenderDocuments } from "./tenderDocuments.js";
import {
  setWorkflowStatus,
  WORKFLOW_STATUS_OPTIONS,
} from "./tenderStatus.js";
import { tenderKey } from "./normalize.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function loadConfig() {
  const raw = await fs.readFile(path.join(rootDir, "config.json"), "utf8");
  return JSON.parse(raw);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) {
    return {};
  }

  return JSON.parse(text);
}

async function serveStatic(request, response) {
  const url = new URL(request.url, "http://localhost");
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(publicDir, filePath);

  if (!absolutePath.startsWith(publicDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const content = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath);
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

function countByWorkflowStatus(catalog) {
  return {
    luu: catalog.filter((item) => item.workflowStatus === "luu").length,
    theo_doi: catalog.filter((item) => item.workflowStatus === "theo_doi")
      .length,
    khong_tham_gia: catalog.filter(
      (item) => item.workflowStatus === "khong_tham_gia",
    ).length,
    da_nop_thau: catalog.filter((item) => item.workflowStatus === "da_nop_thau")
      .length,
  };
}

function createServer(config, paths) {
  let scanPromise = null;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");

    try {
      if (url.pathname === "/api/provinces" && request.method === "GET") {
        const provinces = await fetchProvinces(config);
        sendJson(response, 200, { provinces });
        return;
      }

      if (url.pathname === "/api/workflow-statuses" && request.method === "GET") {
        sendJson(response, 200, { options: WORKFLOW_STATUS_OPTIONS });
        return;
      }

      if (url.pathname === "/api/tenders" && request.method === "GET") {
        const catalog = await loadTenderCatalog(paths);
        const filtered = filterAndSortTenders(catalog, {
          q: url.searchParams.get("q") || "",
          field: url.searchParams.get("field") || "",
          provCode: url.searchParams.get("provCode") || "",
          workflowStatus: url.searchParams.get("workflowStatus") || "",
          sort: url.searchParams.get("sort") || "publicDate",
          order: url.searchParams.get("order") || "desc",
        });
        const page = paginate(
          filtered,
          url.searchParams.get("page"),
          url.searchParams.get("limit"),
        );

        sendJson(response, 200, { ...page, source: "catalog" });
        return;
      }

      const statusMatch = url.pathname.match(
        /^\/api\/tenders\/([^/]+)\/status$/,
      );

      const documentsMatch = url.pathname.match(
        /^\/api\/tenders\/([^/]+)\/documents$/,
      );

      if (documentsMatch && request.method === "GET") {
        const id = decodeURIComponent(documentsMatch[1]);
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );

        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        const documents = await fetchTenderDocuments(config, tender);
        sendJson(response, 200, documents);
        return;
      }

      if (statusMatch && request.method === "PATCH") {
        const id = decodeURIComponent(statusMatch[1]);
        const body = await readBody(request);
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );

        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        await setWorkflowStatus(
          paths.statusesPath,
          tender,
          body.workflowStatus || "",
        );

        const updated = {
          ...toPublicTender({
            ...tender,
            workflowStatus: body.workflowStatus || "",
          }),
        };

        sendJson(response, 200, { ok: true, item: updated });
        return;
      }

      if (url.pathname.startsWith("/api/tenders/") && request.method === "GET") {
        const id = decodeURIComponent(url.pathname.split("/").pop());
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );

        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        sendJson(response, 200, {
          ...toPublicTender(tender),
          raw: tender.raw,
        });
        return;
      }

      if (url.pathname === "/api/stats" && request.method === "GET") {
        const catalog = await loadTenderCatalog(paths);
        const state = await loadState(paths.statePath);
        const counts = countByWorkflowStatus(catalog);

        sendJson(response, 200, {
          totalSaved: counts.luu,
          totalTracked: counts.theo_doi,
          totalKhongThamGia: counts.khong_tham_gia,
          totalDaNopThau: counts.da_nop_thau,
          totalCatalog: catalog.length,
          lastCheckAt: state?.lastCheckAt ?? null,
          lastPublicDate: state?.lastPublicDate ?? null,
          initialized: Boolean(state?.initialized),
        });
        return;
      }

      if (url.pathname === "/api/scan" && request.method === "POST") {
        const body = await readBody(request);
        const scanOptions = {
          rootDir,
          pageNumber: Number(body.pageNumber) || 0,
          pageSize: Number(body.pageSize) || config.pageSize || 10,
          keyword: body.keyword || body.q || "",
          investField: body.investField || body.field || "",
          provCode: body.provCode || "",
          saveNew: body.saveNew !== false,
        };

        if (!scanPromise) {
          scanPromise = scanTenders(config, scanOptions).finally(() => {
            scanPromise = null;
          });
        }

        const result = await scanPromise;
        let items = result.items;

        if (body.workflowStatus) {
          items = items.filter(
            (item) => item.workflowStatus === body.workflowStatus,
          );
        }

        const page = paginate(items, body.page || 1, body.limit || 15);

        sendJson(response, 200, {
          ...result,
          items: page.items,
          pagination: page.pagination,
        });
        return;
      }

      if (url.pathname === "/api/refresh" && request.method === "POST") {
        const result = await runMonitor(config, { mode: "once" });
        sendJson(response, 200, {
          ok: true,
          message: `Phát hiện ${result.newCount} gói thầu mới`,
          ...result,
        });
        return;
      }

      if (request.method === "GET") {
        await serveStatic(request, response);
        return;
      }

      sendJson(response, 405, { error: "Method not allowed" });
    } catch (error) {
      console.error(error);
      sendJson(response, 500, { error: error.message || "Internal server error" });
    }
  });
}

const config = await loadConfig();
const paths = resolveDataPaths(config, rootDir);
const port = Number(process.env.PORT || config.webPort || 3000);
const server = createServer(config, paths);

server.listen(port, () => {
  console.log(`Giao diện AI Mua sắm công: http://localhost:${port}`);

  if (config.schedule?.enabled) {
    const intervalMs = (config.schedule.checkIntervalSeconds || 30) * 1000;
    const times = (config.schedule.times || []).join(", ");
    const filters = config.schedule.filters || {};
    console.log(`Lịch quét: ${times} (VN) · ${(filters.provNames || []).join(", ")}`);
    setInterval(() => {
      maybeRunDueScans(config, rootDir).catch((error) => {
        console.error(`[schedule] ${error.message}`);
      });
    }, intervalMs);
  }
});
