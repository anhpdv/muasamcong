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
import { maybeRunDueScans, runScheduledScan } from "./scheduledScan.js";
import {
  filterQuotes,
  loadQuoteCatalog,
  quotePaths,
  runScheduledQuoteScan,
  scanQuotes,
} from "./quotes.js";
import {
  downloadQuoteDecision,
  readQuoteDecision,
  resolveDecisionFile,
} from "./quoteDecision.js";
import { scanTenders } from "./scan.js";
import { fetchTenderDocuments } from "./tenderDocuments.js";
import {
  decorateHsmtResult,
  downloadHsmtChapters,
  readHsmtManifest,
  resolveHsmtDir,
} from "./hsmtDownload.js";
import {
  deleteHainamDocument,
  importHainamProfile,
  loadHainamProfile,
  profilePublicView,
  saveHainamProfile,
} from "./hainamProfile.js";
import { getAiConfig } from "./aiClient.js";
import {
  analyzeTenderInvite,
  readTenderAnalysis,
} from "./tenderAnalysis.js";
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
import { syncToMtp, testMtpConnection, getMtpConfig } from "./mtpSync.js";

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
  let quoteScanPromise = null;
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

      const hsmtFileMatch = url.pathname.match(
        /^\/api\/tenders\/([^/]+)\/hsmt\/file$/,
      );

      const hsmtMatch = url.pathname.match(/^\/api\/tenders\/([^/]+)\/hsmt$/);

      if (hsmtFileMatch && request.method === "GET") {
        const id = decodeURIComponent(hsmtFileMatch[1]);
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );
        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        const chapter = String(url.searchParams.get("chapter") || "");
        const name = path.basename(String(url.searchParams.get("name") || ""));
        if (!["chuong-2", "chuong-3", "chuong-5", "hsmt-full"].includes(chapter) || !name) {
          sendJson(response, 400, { error: "Tham số file không hợp lệ" });
          return;
        }

        const tenderDir = resolveHsmtDir(paths, tender.notifyNo);
        const chapterDir = path.resolve(tenderDir, chapter);
        const filePath = path.resolve(chapterDir, name);
        if (!filePath.startsWith(chapterDir + path.sep)) {
          sendJson(response, 403, { error: "Forbidden" });
          return;
        }

        try {
          const content = await fs.readFile(filePath);
          response.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
            "Cache-Control": "no-store",
          });
          response.end(content);
        } catch (error) {
          if (error.code === "ENOENT") {
            sendJson(response, 404, { error: "Không tìm thấy file" });
            return;
          }
          throw error;
        }
        return;
      }

      if (hsmtMatch && request.method === "GET") {
        const id = decodeURIComponent(hsmtMatch[1]);
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );
        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        const manifest = await readHsmtManifest(paths, tender.notifyNo);
        const analysis = await readTenderAnalysis(paths, tender.notifyNo);
        sendJson(response, 200, {
          ok: true,
          available: Boolean(manifest),
          hsmt: decorateHsmtResult(manifest, tender.id || tender.notifyNo),
          analysis,
          ai: getAiConfig().configured
            ? { configured: true, model: getAiConfig().model }
            : { configured: false },
        });
        return;
      }

      if (hsmtMatch && request.method === "POST") {
        const id = decodeURIComponent(hsmtMatch[1]);
        const catalog = await loadTenderCatalog(paths);
        const tender = catalog.find(
          (item) => item.id === id || item.notifyNo === id || tenderKey(item) === id,
        );
        if (!tender) {
          sendJson(response, 404, { error: "Không tìm thấy gói thầu" });
          return;
        }

        const body = await readBody(request).catch(() => ({}));
        const force = Boolean(body?.force) || url.searchParams.get("force") === "1";
        const result = await downloadHsmtChapters(config, tender, paths, { force });
        const hasFiles = (result.files?.length || 0) > 0;
        const downloadOk = Boolean(result.ok || result.skipped || hasFiles);

        let analysis = null;
        let analysisError = null;
        // Phân tích khi đã có file (kể cả tải một phần lỗi archive/PDF phụ)
        if (hasFiles || downloadOk) {
          try {
            analysis = await analyzeTenderInvite(config, tender, paths, result, {
              force: true,
            });
          } catch (error) {
            analysisError = error.message;
            analysis = await readTenderAnalysis(paths, tender.notifyNo);
          }
        }

        const parts = [
          result.skipped
            ? `Đã có sẵn ${result.files?.length || 0} file HSMT`
            : hasFiles
              ? `Đã tải ${result.files?.length || 0} file HSMT`
              : result.error || "Tải HSMT thất bại",
        ];
        if (analysis?.error === "missing_ai_key") {
          parts.push("chưa cấu hình OPENAI_API_KEY trên server");
        } else if (analysis?.ok && analysis?.summary) {
          parts.push("đã tạo tóm tắt & đánh giá khả thi");
        } else if (analysis?.summary?.overview) {
          parts.push("đã chạy phân tích (có cảnh báo)");
        } else if (analysisError) {
          parts.push(`AI: ${analysisError}`);
        }

        sendJson(response, downloadOk ? 200 : 502, {
          ok: downloadOk,
          message: parts.join(" · "),
          hsmt: decorateHsmtResult(result, tender.id || tender.notifyNo),
          analysis,
          analysisError,
          ai: getAiConfig().configured
            ? { configured: true, model: getAiConfig().model }
            : { configured: false },
        });
        return;
      }

      if (url.pathname === "/api/hainam-profile" && request.method === "GET") {
        const profile = await loadHainamProfile(paths);
        sendJson(response, 200, {
          ok: true,
          profile: profilePublicView(profile),
          ai: {
            configured: getAiConfig().configured,
            model: getAiConfig().model,
          },
        });
        return;
      }

      if (url.pathname === "/api/hainam-profile" && request.method === "PUT") {
        const body = await readBody(request);
        const current = await loadHainamProfile(paths);
        const saved = await saveHainamProfile(paths, {
          ...current,
          companyName: body.companyName ?? current.companyName,
          notes: body.notes ?? current.notes,
          documents: Array.isArray(body.documents) ? body.documents : current.documents,
          updatedBy: user.username,
        });
        sendJson(response, 200, {
          ok: true,
          message: "Đã lưu thông tin Hải Nam",
          profile: profilePublicView(saved),
        });
        return;
      }

      if (url.pathname === "/api/hainam-profile/import" && request.method === "POST") {
        const body = await readBody(request);
        try {
          const saved = await importHainamProfile(paths, {
            text: body.text || body.content || "",
            texts: body.texts || null,
            title: body.title || "",
            notes: body.notes,
            companyName: body.companyName,
            fileName: body.fileName || "",
            mode: body.mode === "replace" ? "replace" : "append",
            user,
          });
          sendJson(response, 200, {
            ok: true,
            message: `Đã thêm ${saved.documents?.length || 0} mục vào kho năng lực`,
            profile: profilePublicView(saved),
          });
        } catch (error) {
          sendJson(response, 400, { error: error.message });
        }
        return;
      }

      const hainamDocMatch = url.pathname.match(
        /^\/api\/hainam-profile\/documents\/([^/]+)$/,
      );
      if (hainamDocMatch && request.method === "DELETE") {
        const docId = decodeURIComponent(hainamDocMatch[1]);
        try {
          const saved = await deleteHainamDocument(paths, docId, user);
          sendJson(response, 200, {
            ok: true,
            message: "Đã xóa mục năng lực",
            profile: profilePublicView(saved),
          });
        } catch (error) {
          sendJson(response, 400, { error: error.message });
        }
        return;
      }

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
          investFields: Array.isArray(body.investFields) ? body.investFields : [],
          provCode: body.provCode || "",
          provCodes: Array.isArray(body.provCodes) ? body.provCodes : [],
          fetchAll: body.fetchAll === true || body.fetchAll === "true",
          maxPages: Number(body.maxPages) || 50,
          publicDateToday: Boolean(body.publicDateToday),
          publicDateFrom: body.publicDateFrom || "",
          publicDateTo: body.publicDateTo || "",
          saveNew: body.saveNew !== false,
        };

        if (!scanOptions.provCode && !scanOptions.investField && !scanOptions.keyword
          && !(scanOptions.provCodes || []).length
          && !(scanOptions.investFields || []).length
          && scanOptions.fetchAll) {
          sendJson(response, 400, {
            error: "Chọn ít nhất tỉnh/thành hoặc lĩnh vực trước khi quét theo bộ lọc",
          });
          return;
        }

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

      if (url.pathname === "/api/quotes" && request.method === "GET") {
        const paths = quotePaths(config, rootDir);
        const q = String(url.searchParams.get("q") || "").trim();
        const items = filterQuotes(await loadQuoteCatalog(paths), { q });
        const page = paginate(
          items,
          Number(url.searchParams.get("page")) || 1,
          Number(url.searchParams.get("limit")) || 15,
        );
        const quoteState = await loadState(paths.quoteStatePath);
        sendJson(response, 200, {
          ok: true,
          items: page.items,
          pagination: page.pagination,
          lastCheckAt: quoteState?.lastCheckAt || null,
        });
        return;
      }

      const quoteDecisionFileMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)\/decision\/file$/);
      const quoteDecisionMatch = url.pathname.match(/^\/api\/quotes\/([^/]+)\/decision$/);

      if (quoteDecisionFileMatch && request.method === "GET") {
        const id = decodeURIComponent(quoteDecisionFileMatch[1]);
        const quotePathsResolved = quotePaths(config, rootDir);
        const quote = (await loadQuoteCatalog(quotePathsResolved)).find(
          (item) => item.id === id || item.notifyNo === id,
        );
        if (!quote) {
          sendJson(response, 404, { error: "Không tìm thấy yêu cầu báo giá" });
          return;
        }
        const file = await resolveDecisionFile(config, rootDir, quote);
        if (!file) {
          sendJson(response, 404, { error: "Chưa có file quyết định phê duyệt" });
          return;
        }
        const content = await fs.readFile(file.filePath);
        const type = file.fileName.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : "application/octet-stream";
        response.writeHead(200, {
          "Content-Type": type,
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
          "Cache-Control": "no-store",
        });
        response.end(content);
        return;
      }

      if (quoteDecisionMatch && request.method === "GET") {
        const id = decodeURIComponent(quoteDecisionMatch[1]);
        const quotePathsResolved = quotePaths(config, rootDir);
        const quote = (await loadQuoteCatalog(quotePathsResolved)).find(
          (item) => item.id === id || item.notifyNo === id,
        );
        if (!quote) {
          sendJson(response, 404, { error: "Không tìm thấy yêu cầu báo giá" });
          return;
        }
        sendJson(response, 200, await readQuoteDecision(config, rootDir, quote));
        return;
      }

      if (quoteDecisionMatch && request.method === "POST") {
        const id = decodeURIComponent(quoteDecisionMatch[1]);
        const quotePathsResolved = quotePaths(config, rootDir);
        const quote = (await loadQuoteCatalog(quotePathsResolved)).find(
          (item) => item.id === id || item.notifyNo === id,
        );
        if (!quote) {
          sendJson(response, 404, { error: "Không tìm thấy yêu cầu báo giá" });
          return;
        }
        const result = await downloadQuoteDecision(config, rootDir, quote);
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === "/api/quotes/scan" && request.method === "POST") {
        const body = await readBody(request);
        const scanOptions = {
          rootDir,
          keyword: body.keyword || body.q || "",
          matchType: body.matchType || "all-1",
          exclude: body.exclude || "",
          investor: body.investor || "",
          category: body.category || "",
          bidForm: body.bidForm || "",
          provCode: body.provCode || "",
          provCodes: Array.isArray(body.provCodes) ? body.provCodes : [],
          publicDateToday: Boolean(body.publicDateToday),
          publicDateFrom: body.publicDateFrom || "",
          publicDateTo: body.publicDateTo || "",
          validity: body.validity || "open",
          maxPages: Number(body.maxPages) || 10,
          pageSize: 10,
        };

        if (
          !scanOptions.keyword &&
          !scanOptions.provCode &&
          !(scanOptions.provCodes || []).length &&
          !scanOptions.bidForm &&
          !scanOptions.publicDateToday &&
          !scanOptions.publicDateFrom
        ) {
          sendJson(response, 400, {
            error: "Chọn tỉnh, phân loại, từ khóa hoặc khoảng ngày trước khi quét yêu cầu báo giá",
          });
          return;
        }

        if (!quoteScanPromise) {
          quoteScanPromise = scanQuotes(config, scanOptions).finally(() => {
            quoteScanPromise = null;
          });
        }
        const result = await quoteScanPromise;
        const page = paginate(result.items, body.page || 1, body.limit || 15);
        sendJson(response, 200, {
          ok: true,
          message:
            result.newCount > 0
              ? `Yêu cầu báo giá: ${result.checked} bản ghi, lưu mới ${result.newCount}`
              : `Yêu cầu báo giá: ${result.checked} bản ghi, không có bản ghi mới`,
          ...result,
          items: page.items,
          pagination: page.pagination,
        });
        return;
      }

      if (url.pathname === "/api/quotes/scan/default" && request.method === "POST") {
        if (!quoteScanPromise) {
          quoteScanPromise = runScheduledQuoteScan(config, rootDir).finally(() => {
            quoteScanPromise = null;
          });
        }
        const result = await quoteScanPromise;
        sendJson(response, 200, {
          ok: true,
          source: "schedule",
          message:
            result.newCount > 0
              ? `Quét YCBG mặc định: ${result.checked} bản ghi, lưu mới ${result.newCount}`
              : `Quét YCBG mặc định: ${result.checked} bản ghi, không có bản ghi mới`,
          ...result,
        });
        return;
      }

      if (url.pathname === "/api/scan/default" && request.method === "POST") {
        if (!scanPromise) {
          scanPromise = runScheduledScan(config, rootDir).finally(() => {
            scanPromise = null;
          });
        }

        const result = await scanPromise;
        sendJson(response, 200, {
          ok: true,
          source: "schedule",
          message:
            result.newCount > 0
              ? `Quét mặc định: ${result.checked} gói, lưu mới ${result.newCount} gói`
              : `Quét mặc định: ${result.checked} gói, không có gói mới`,
          ...result,
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

      if (url.pathname === "/api/mtp-config" && request.method === "GET") {
        const config = getMtpConfig();
        sendJson(response, 200, config);
        return;
      }

      if (url.pathname === "/api/test-mtp" && request.method === "GET") {
        const result = await testMtpConnection();
        sendJson(response, 200, result);
        return;
      }

      if (url.pathname === "/api/sync-mtp" && request.method === "POST") {
        const body = await readBody(request);
        const catalog = await loadTenderCatalog(paths);
        let targets = catalog;
        if (body.id) {
          targets = catalog.filter(
            (item) => item.id === body.id || item.notifyNo === body.id || tenderKey(item) === body.id,
          );
        }
        const syncResult = await syncToMtp(targets);
        sendJson(response, 200, {
          ok: syncResult.ok,
          message: syncResult.ok
            ? `Đã đồng bộ ${syncResult.synced}/${targets.length} gói thầu sang MTP`
            : `Đồng bộ: ${syncResult.synced} thành công, ${syncResult.failed} lỗi`,
          count: targets.length,
          mtpSync: syncResult,
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
