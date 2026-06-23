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
  buildSessionCookie,
  clearSessionCookie,
  createAuthStore,
  parseCookies,
} from "./auth.js";
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
  ".png": "image/png",
};

const PUBLIC_PATHS = new Set([
  "/",
  "/login.html",
  "/login.css",
  "/login.js",
  "/logo-hainam.png",
]);

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function resolveAuthPaths(paths) {
  return {
    ...paths,
    usersPath: path.join(paths.dataDir, "users.json"),
    sessionsPath: path.join(paths.dataDir, "sessions.json"),
  };
}

async function getRequestUser(request, auth) {
  const cookies = parseCookies(request.headers.cookie);
  return auth.getSessionUser(cookies[auth.SESSION_COOKIE]);
}

async function serveFile(response, absolutePath) {
  const content = await fs.readFile(absolutePath);
  const ext = path.extname(absolutePath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
  });
  response.end(content);
}

async function serveStaticFile(response, filePath) {
  const normalized = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(publicDir, normalized);

  if (!absolutePath.startsWith(publicDir)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    await serveFile(response, absolutePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      sendText(response, 404, "Not found");
      return;
    }
    throw error;
  }
}

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

async function serveStatic(request, response, user) {
  const url = new URL(request.url, "http://localhost");
  const pathname = url.pathname;

  if (PUBLIC_PATHS.has(pathname)) {
    if (pathname === "/") {
      if (user) {
        redirect(response, "/app");
        return;
      }
      await serveStaticFile(response, "/login.html");
      return;
    }
    await serveStaticFile(response, pathname);
    return;
  }

  if (!user) {
    if (pathname.startsWith("/api/")) {
      sendJson(response, 401, { error: "Yêu cầu đăng nhập" });
      return;
    }
    redirect(response, "/");
    return;
  }

  if (pathname === "/app" || pathname === "/index.html") {
    await serveStaticFile(response, "/index.html");
    return;
  }

  if (pathname === "/admin" || pathname === "/admin.html") {
    if (user.role !== "admin") {
      redirect(response, "/app");
      return;
    }
    await serveStaticFile(response, "/admin.html");
    return;
  }

  let filePath = pathname;
  if (filePath === "/") {
    filePath = "/index.html";
  }
  await serveStaticFile(response, filePath);
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

function createServer(config, paths, auth) {
  let scanPromise = null;
  const sessionTtlSeconds = (config.auth?.sessionTtlHours || 168) * 60 * 60;

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const user = await getRequestUser(request, auth);

    try {
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const body = await readBody(request);
        const account = await auth.authenticate(body.username, body.password);
        if (!account) {
          sendJson(response, 401, { error: "Sai tài khoản hoặc mật khẩu" });
          return;
        }

        const session = await auth.createSession(account.id);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie": buildSessionCookie(session.token, sessionTtlSeconds),
        });
        response.end(JSON.stringify({ ok: true, user: account }));
        return;
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const cookies = parseCookies(request.headers.cookie);
        await auth.destroySession(cookies[auth.SESSION_COOKIE]);
        response.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Set-Cookie": clearSessionCookie(),
        });
        response.end(JSON.stringify({ ok: true }));
        return;
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        if (!user) {
          sendJson(response, 401, { error: "Chưa đăng nhập" });
          return;
        }
        sendJson(response, 200, { user });
        return;
      }

      if (url.pathname.startsWith("/api/admin/")) {
        if (!user) {
          sendJson(response, 401, { error: "Yêu cầu đăng nhập" });
          return;
        }
        if (user.role !== "admin") {
          sendJson(response, 403, { error: "Không có quyền quản trị" });
          return;
        }

        if (url.pathname === "/api/admin/users" && request.method === "GET") {
          const users = await auth.listUsers();
          sendJson(response, 200, { users });
          return;
        }

        if (url.pathname === "/api/admin/users" && request.method === "POST") {
          const body = await readBody(request);
          const created = await auth.createUser(body);
          sendJson(response, 201, { ok: true, user: created });
          return;
        }

        const userMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
        if (userMatch && request.method === "PATCH") {
          const id = decodeURIComponent(userMatch[1]);
          const body = await readBody(request);
          const updated = await auth.updateUser(id, body);
          sendJson(response, 200, { ok: true, user: updated });
          return;
        }

        if (userMatch && request.method === "DELETE") {
          const id = decodeURIComponent(userMatch[1]);
          await auth.deleteUser(id, user.id);
          sendJson(response, 200, { ok: true });
          return;
        }

        sendJson(response, 404, { error: "Not found" });
        return;
      }

      if (url.pathname.startsWith("/api/") && !user) {
        sendJson(response, 401, { error: "Yêu cầu đăng nhập" });
        return;
      }

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
        await serveStatic(request, response, user);
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
const paths = resolveAuthPaths(resolveDataPaths(config, rootDir));
const auth = createAuthStore(paths, config);
const bootstrap = await auth.ensureBootstrapAdmin();
const port = Number(process.env.PORT || config.webPort || 3000);
const server = createServer(config, paths, auth);

server.listen(port, () => {
  console.log(`Giao diện AI Mua sắm công: http://localhost:${port}`);
  if (bootstrap) {
    console.log(
      `[auth] Tạo tài khoản admin mặc định: ${bootstrap.username} / ${bootstrap.password}`,
    );
    console.log("[auth] Hãy đổi mật khẩu ngay sau khi đăng nhập.");
  }

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
