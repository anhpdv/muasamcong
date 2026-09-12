import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

/**
 * Tải trực tiếp biến môi trường từ file .env (hỗ trợ UTF-8 BOM, comment, quote, nạp lại động)
 */
export function loadEnv() {
  const candidatePaths = [
    path.join(rootDir, ".env"),
    path.join(rootDir, "..", ".env"),
    path.resolve(".env")
  ];

  for (const envFile of candidatePaths) {
    if (fs.existsSync(envFile)) {
      try {
        let content = fs.readFileSync(envFile, "utf8");
        // Remove UTF-8 BOM if present
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }

        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;

          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();

            // Tách comment ở cuối dòng (ví dụ: KEY=VAL # comment)
            const hashIdx = val.indexOf(" #");
            if (hashIdx > 0) {
              val = val.slice(0, hashIdx).trim();
            }

            if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
              val = val.slice(1, -1);
            }

            process.env[key] = val;
          }
        }
      } catch (err) {
        console.error(`[MTP Sync] Lỗi khi đọc file .env tại ${envFile}:`, err.message);
      }
    }
  }
}

// Nạp env khi module vừa load
loadEnv();

/**
 * Trả về cấu hình MTP hiện tại (dùng cho debug)
 */
export function getMtpConfig() {
  loadEnv(); // Cập nhật lại từ .env nếu file vừa thay đổi

  const mtpUrl = (process.env.MTP_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const endpoint = process.env.MTP_API_ENDPOINT || "/api/method/crawl_document.api.msc.save_msc_tender";
  const apiUrl = `${mtpUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const apiKey = (process.env.MTP_API_KEY || "").trim();
  const apiSecret = (process.env.MTP_API_SECRET || "").trim();
  const authToken = (process.env.MTP_AUTH_TOKEN || "").trim();
  const hasAuth = Boolean((apiKey && apiSecret) || authToken);

  return {
    mtpUrl,
    endpoint,
    apiUrl,
    hasAuth,
    apiKeyPreview: apiKey ? `${apiKey.slice(0, 6)}...` : "(trống)",
    apiSecretPreview: apiSecret ? `${apiSecret.slice(0, 4)}...${apiSecret.slice(-4)}` : "(trống)",
    envFileExists: candidatePathsExists(),
    envFilePath: path.join(rootDir, ".env"),
  };
}

function candidatePathsExists() {
  return fs.existsSync(path.join(rootDir, ".env")) || fs.existsSync(path.join(rootDir, "..", ".env"));
}

/**
 * Build headers cho request tới MTP
 */
function buildHeaders(includeAuth = true) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!includeAuth) {
    return headers;
  }

  const apiKey = (process.env.MTP_API_KEY || "").trim();
  const apiSecret = (process.env.MTP_API_SECRET || "").trim();
  const authToken = (process.env.MTP_AUTH_TOKEN || "").trim();

  if (apiKey && apiSecret) {
    headers["Authorization"] = `token ${apiKey}:${apiSecret}`;
  } else if (authToken) {
    headers["Authorization"] = authToken.startsWith("token ")
      ? authToken
      : `token ${authToken}`;
  }

  return headers;
}

/**
 * Test kết nối tới MTP backend
 */
export async function testMtpConnection() {
  const config = getMtpConfig();
  const headers = buildHeaders(true);

  const result = {
    config,
    connectivity: null,
    auth: null,
    doctypeExists: null,
  };

  // Test 1: Connectivity & Auth check
  try {
    const pingUrl = `${config.mtpUrl}/api/method/frappe.auth.get_logged_user`;
    const t0 = Date.now();
    const res = await fetch(pingUrl, {
      method: "GET",
      headers,
    });
    const elapsed = Date.now() - t0;
    const body = await res.text();

    result.connectivity = {
      ok: res.ok,
      status: res.status,
      elapsed: `${elapsed}ms`,
      url: pingUrl,
    };

    if (res.ok) {
      try {
        const data = JSON.parse(body);
        result.auth = {
          ok: true,
          loggedAs: data.message || data,
        };
      } catch {
        result.auth = {
          ok: false,
          error: "Không parse được response JSON",
          body: body.substring(0, 200),
        };
      }
    } else {
      result.auth = {
        ok: false,
        status: res.status,
        error: body.substring(0, 300),
      };
    }
  } catch (err) {
    result.connectivity = {
      ok: false,
      error: err.message,
      url: `${config.mtpUrl}/api/method/frappe.auth.get_logged_user`,
    };
  }

  // Test 2: Kiểm tra DocType MTP MSC Tender tồn tại qua API
  try {
    const docUrl = `${config.mtpUrl}/api/resource/MTP MSC Tender?limit_page_length=1`;
    const res = await fetch(docUrl, {
      method: "GET",
      headers: buildHeaders(false), // Dùng guest header nếu auth chưa đúng
    });
    const body = await res.text();

    if (res.ok) {
      try {
        const data = JSON.parse(body);
        result.doctypeExists = {
          ok: true,
          count: data.data?.length ?? 0,
          message: "DocType MTP MSC Tender tồn tại trên Cloud",
        };
      } catch {
        result.doctypeExists = { ok: false, error: "Invalid JSON", body: body.substring(0, 200) };
      }
    } else {
      result.doctypeExists = {
        ok: false,
        status: res.status,
        error: body.substring(0, 300),
      };
    }
  } catch (err) {
    result.doctypeExists = { ok: false, error: err.message };
  }

  return result;
}

/**
 * Đồng bộ danh sách tender sang MTP backend.
 * Nếu API Key/Secret trong .env bị lỗi 401, tự động fallback sang Guest request
 * vì API save_msc_tender cho phép allow_guest=True.
 */
export async function syncToMtp(tenders) {
  if (!tenders) {
    return { ok: true, synced: 0, failed: 0, errors: [], skipped: true };
  }

  const tenderList = Array.isArray(tenders) ? tenders : [tenders];
  if (tenderList.length === 0) {
    return { ok: true, synced: 0, failed: 0, errors: [], skipped: true };
  }

  const config = getMtpConfig();
  const syncResults = {
    ok: true,
    synced: 0,
    failed: 0,
    errors: [],
    warnings: [],
    apiUrl: config.apiUrl,
    hasAuth: config.hasAuth,
  };

  for (const tender of tenderList) {
    const key = tender.notifyNoStand || tender.notifyNo || tender.id || "unknown";
    const { raw, provCodes, ...cleanTender } = tender;
    const bodyPayload = JSON.stringify({ tender_data: cleanTender });

    let response = null;
    let usedGuestFallback = false;

    try {
      // 1. Thử gửi với Auth header trước
      response = await fetch(config.apiUrl, {
        method: "POST",
        headers: buildHeaders(true),
        body: bodyPayload,
      });

      // 2. Nếu trả về 401 AuthenticationError, tự động thử lại mà KHÔNG gửi Auth header (Guest)
      if (response.status === 401 && config.hasAuth) {
        usedGuestFallback = true;
        const warnMsg = `[MTP Sync Warning] API Key/Secret trong .env bị lỗi 401 cho gói ${key}. Đang tự động thử lại với Guest mode...`;
        console.warn(warnMsg);
        if (!syncResults.warnings.includes(warnMsg)) {
          syncResults.warnings.push(warnMsg);
        }

        response = await fetch(config.apiUrl, {
          method: "POST",
          headers: buildHeaders(false),
          body: bodyPayload,
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        const errMsg = `HTTP ${response.status} cho ${key}: ${errText.substring(0, 300)}`;
        console.error(`[MTP Sync] ${errMsg}`);
        syncResults.failed += 1;
        syncResults.errors.push(errMsg);
        continue;
      }

      const resData = await response.json();
      const msg = resData?.message || resData;
      if (msg?.success) {
        const modeNote = usedGuestFallback ? " (Guest Mode fallback)" : "";
        console.log(`[MTP Sync] ✅ Đã lưu gói thầu ${key} sang MTP (docname: ${msg.docname})${modeNote}`);
        syncResults.synced += 1;
      } else {
        const errMsg = `API error cho ${key}: ${JSON.stringify(msg).substring(0, 300)}`;
        console.error(`[MTP Sync] ❌ ${errMsg}`);
        syncResults.failed += 1;
        syncResults.errors.push(errMsg);
      }
    } catch (error) {
      const errMsg = `Lỗi kết nối cho ${key}: ${error.message}`;
      console.error(`[MTP Sync Error] ${errMsg}`);
      syncResults.failed += 1;
      syncResults.errors.push(errMsg);
    }
  }

  syncResults.ok = syncResults.failed === 0;

  return syncResults;
}
