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
console.log("sample", raw.notifyNo, raw.id || raw.notifyId, raw.bidId, raw.bidNo);

async function post(path, body) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Referer: `${base}/web/guest/contractor-selection`,
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  const text = await res.text();
  console.log("\n", res.status, path);
  console.log(text.slice(0, 500).replace(/\s+/g, " "));
  return text;
}

const bodies = [
  { id: raw.id || raw.notifyId },
  { notifyId: raw.notifyId || raw.id },
  { bidId: raw.bidId },
  { notifyNo: raw.notifyNo, notifyVersion: raw.notifyVersion || "00" },
  {
    notifyId: raw.notifyId || raw.id,
    bidId: raw.bidId,
    notifyNo: raw.notifyNo,
    notifyVersion: raw.notifyVersion || "00",
    bidNo: raw.bidNo,
    investField: Array.isArray(raw.investField) ? raw.investField[0] : raw.investField,
  },
];

const paths = [
  "/o/egp-portal-contractor-selection-v2/services/ebidinv/bida-inv-chapter-confs",
  "/o/egp-portal-contractor-selection-v2/services/expose/lcnt/bid-po-bido-notify-contractor-view/get-by-id",
  "/o/egp-portal-contractor-selection-v2/services/ebidinv/bido-inv-bidding",
  "/o/egp-portal-contractor-selection-v2/services/ebidinv/get-bido-inv-bidding",
  "/o/egp-portal-contractor-selection-v2/services/ebidinv/bido-invitation",
];

for (const path of paths) {
  for (const [i, body] of bodies.entries()) {
    const text = await post(path, body);
    if (!text.includes("404") && !text.includes("no Route") && text.length > 5) {
      console.log("body#", i, "OK-ish");
    }
  }
}
