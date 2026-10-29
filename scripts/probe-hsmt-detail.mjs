import fs from "node:fs/promises";
import { searchTenders } from "../src/api.js";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const base = config.baseUrl;

async function post(url, body) {
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
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

const page = await searchTenders(config, {
  pageNumber: 0,
  pageSize: 5,
  investFields: ["HH"],
  provCodes: ["01", "08", "15", "25", "33", "44"],
  publicDateToday: true,
});

const raw = page.content[0];
console.log("picked", raw.notifyNo, raw.id || raw.notifyId, raw.bidId);

const detailUrl = `${base}/o/egp-portal-contractor-selection-v2/services/expose/lcnt/bid-po-bido-notify-contractor-view/get-by-id`;
for (const [i, body] of [
  { id: raw.id || raw.notifyId },
  { notifyId: raw.notifyId || raw.id },
  {
    notifyId: raw.notifyId || raw.id,
    id: raw.id || raw.notifyId,
    notifyNo: raw.notifyNo,
    bidId: raw.bidId,
    notifyVersion: raw.notifyVersion || "00",
  },
].entries()) {
  const result = await post(detailUrl, body);
  console.log("detail#", i, result.status, result.text.slice(0, 260).replace(/\s+/g, " "));
}

const htmlRes = await fetch(`${base}/web/guest/contractor-selection`, {
  headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
});
const html = await htmlRes.text();
const scripts = [...html.matchAll(/src=(?:"([^"]+\.js[^"]*)"|'([^']+\.js[^']*)')/g)].map(
  (m) => m[1] || m[2],
);
const interesting = scripts.filter((s) =>
  /contractor|selection|bid|egp|chunk|app|main|vendor/i.test(s),
);
console.log("interesting scripts", interesting.length);

const keywords = [
  "bido-bid-file",
  "bido-invitation",
  "chapterName",
  "Chương III",
  "Chương V",
  "edocproxy",
  "file/share",
  "bid-file-list",
  "invitation-out",
  "packType",
  "getChapter",
  "hsmt",
];

for (const src of interesting) {
  const url = src.startsWith("http") ? src : new URL(src, base).toString();
  try {
    const js = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
    const found = keywords.filter((k) => js.toLowerCase().includes(k.toLowerCase()));
    if (!found.length) continue;
    console.log("\nJS", url);
    console.log("keywords", found);
    for (const k of found) {
      const idx = js.toLowerCase().indexOf(k.toLowerCase());
      console.log("---", k, "---");
      console.log(js.slice(Math.max(0, idx - 120), idx + 180).replace(/\s+/g, " "));
    }
  } catch (error) {
    console.log("js err", url, error.message);
  }
}
