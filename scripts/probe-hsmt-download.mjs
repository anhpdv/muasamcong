import fs from "node:fs/promises";
import { searchTenders } from "../src/api.js";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const base = config.baseUrl;
const page = await searchTenders(config, {
  pageNumber: 0,
  pageSize: 3,
  investFields: ["HH"],
  provCodes: ["01"],
  publicDateToday: true,
});
const raw = page.content[0];
const notifyId = raw.id || raw.notifyId;
console.log("sample", raw.notifyNo, notifyId, raw.processApply);

async function tryHsmt(token) {
  const url = `${base}/o/egp-portal-contractor-selection-v2/services/lcnt_tbmt_hsmt${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Referer: `${base}/web/guest/contractor-selection`,
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ id: notifyId, processApply: raw.processApply || "LDT" }),
  });
  const text = await res.text();
  console.log("HSMT", res.status, "token?", Boolean(token), text.slice(0, 200).replace(/\s+/g, " "));
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const noToken = await tryHsmt("");
const fake = await tryHsmt("test");

// probe download endpoints with a known public share id from templates
const sampleFileId = "b6077e541e79570e6551bd1086b1adb81c347a52827333511e58bb3ea5804187";
const downloadUrls = [
  `${base}/api/unau/edocproxy/file/share/${sampleFileId}`,
  `${base}/api/download/file/browser/public?fileId=${sampleFileId}`,
  `${base}/edoc-oldproxy-service/api/download/file/browser/public?fileId=${sampleFileId}`,
  `${base}/api/unau/download/file/browser/public?fileId=${sampleFileId}`,
];

for (const url of downloadUrls) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Referer: `${base}/web/guest/contractor-selection`,
    },
    redirect: "manual",
  });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log(
    "DL",
    res.status,
    res.headers.get("content-type"),
    res.headers.get("content-disposition"),
    buf.length,
    url.replace(base, ""),
    buf.slice(0, 40).toString("utf8").replace(/\s+/g, " "),
  );
}

console.log("noToken type", typeof noToken, Array.isArray(noToken?.bidoInvBiddingDTO), noToken?.bidoInvBiddingDTO?.length);
console.log("fake type", typeof fake);
