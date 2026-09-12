import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const envPath = path.join(rootDir, ".env");

// Tự động load .env nếu có
try {
  if (typeof process.loadEnvFile === "function") {
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  } else if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim();
        let val = trimmed.slice(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch (e) {
  // Bỏ qua nếu không load được .env
}

export async function syncToMtp(tenders) {
  if (!tenders) {
    return;
  }

  const tenderList = Array.isArray(tenders) ? tenders : [tenders];
  if (tenderList.length === 0) {
    return;
  }

  const mtpUrl = (process.env.MTP_BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
  const endpoint = process.env.MTP_API_ENDPOINT || "/api/method/crawl_document.api.msc.save_msc_tender";
  const apiUrl = `${mtpUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  // Cấu hình headers bao gồm Authorization nếu được khai báo trong .env
  const headers = {
    "Content-Type": "application/json",
  };

  const apiKey = process.env.MTP_API_KEY;
  const apiSecret = process.env.MTP_API_SECRET;
  const authToken = process.env.MTP_AUTH_TOKEN;

  if (apiKey && apiSecret) {
    headers["Authorization"] = `token ${apiKey}:${apiSecret}`;
  } else if (authToken) {
    headers["Authorization"] = authToken.startsWith("token ")
      ? authToken
      : `token ${authToken}`;
  }

  for (const tender of tenderList) {
    const key = tender.notifyNoStand || tender.notifyNo || tender.id || "unknown";

    const { raw, provCodes, ...cleanTender } = tender;

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ tender_data: cleanTender }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[MTP Sync] HTTP ${response.status} khi lưu gói thầu ${key}:`, errText.substring(0, 300));
        continue;
      }

      const resData = await response.json();
      const msg = resData?.message || resData;
      if (msg?.success) {
        console.log(`[MTP Sync] ✅ Đã lưu gói thầu ${key} sang MTP (docname: ${msg.docname})`);
      } else {
        console.error(`[MTP Sync] ❌ Lỗi từ MTP API cho gói ${key}:`, msg);
      }
    } catch (error) {
      console.error(`[MTP Sync Error] Lỗi kết nối khi lưu gói thầu ${key}:`, error.message);
    }
  }
}

