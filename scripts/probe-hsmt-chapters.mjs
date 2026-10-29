import fs from "node:fs/promises";
import { searchTenders, postPortalService } from "../src/api.js";
import { fetchTenderDocuments } from "../src/tenderDocuments.js";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));

const page = await searchTenders(config, {
  pageNumber: 0,
  pageSize: 5,
  investFields: ["HH"],
  publicDateToday: true,
});

const raw = page.content?.[0];
if (!raw) {
  console.log("Không có gói thầu hôm nay để probe.");
  process.exit(0);
}

console.log("Sample:", raw.notifyNo, raw.bidId, raw.id || raw.notifyId);

const tender = {
  id: raw.id || raw.notifyId,
  notifyNo: raw.notifyNo,
  planNo: raw.planNo,
  investField: Array.isArray(raw.investField) ? raw.investField[0] : raw.investField,
  bidMode: raw.bidMode,
  processApply: raw.processApply,
  bidForm: raw.bidForm,
  planType: raw.planType,
  notifyVersion: raw.notifyVersion,
  raw,
};

const context = {
  id: raw.id || raw.notifyId || "",
  notifyId: raw.notifyId || raw.id || "",
  bidId: raw.bidId || "",
  notifyNo: raw.notifyNo || "",
  notifyVersion: raw.notifyVersion || "00",
  bidMode: raw.bidMode || "",
  processApply: raw.processApply || "",
  type: raw.type || "es-notify-contractor",
  stepCode: raw.stepCode || "notify-contractor-step-1-tbmt",
  planNo: raw.planNo || "",
  planType: raw.planType || "",
  investField: Array.isArray(raw.investField) ? raw.investField[0] : raw.investField || "",
  bidForm: raw.bidForm || "",
  packType: 0,
};

const endpoints = [
  ["get/bido-invitation-out", context],
  ["get/bido-invitation-out-list", context],
  ["get/bido-invitation-out-file-list", context],
  ["get/bido-bid-file-list pack0", { ...context, packType: 0 }],
  ["get/bido-bid-file-list pack1", { ...context, packType: 1 }],
];

for (const [label, body] of endpoints) {
  const path = label.replace(/ pack\d+$/, "");
  try {
    const data = await postPortalService(config, path, body, { allowHtml: true });
    const text = JSON.stringify(data);
    console.log("\n==", label, "==");
    console.log("keys:", data && typeof data === "object" ? Object.keys(data) : typeof data);
    console.log("has chapter?", /chapter|Chương|chuong|packName/i.test(text));
    const chapterHits = [...text.matchAll(/Chương\s*\d+|chapterName[^,]{0,80}|packName[^,]{0,80}/gi)].slice(0, 20);
    console.log("hits:", chapterHits.map((m) => m[0]));
    console.log("size:", text.length);
  } catch (error) {
    console.log("\n==", label, "ERR", error.message);
  }
}

const docs = await fetchTenderDocuments(config, tender);
console.log("\n== fetchTenderDocuments summary ==");
console.log(
  JSON.stringify(
    {
      notifyNo: docs.notifyNo,
      attachCount: docs.hsmt.attachments.length,
      webformCount: docs.hsmt.webforms.length,
      chapters: docs.hsmt.chapters.map((c) => ({
        title: c.title,
        files: c.files.map((f) => f.name),
      })),
      zip: Boolean(docs.hsmt.zipUrl),
      attachSample: docs.hsmt.attachments.slice(0, 8).map((f) => ({
        name: f.name,
        section: f.section,
      })),
    },
    null,
    2,
  ),
);
