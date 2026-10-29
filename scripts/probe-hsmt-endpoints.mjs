import fs from "node:fs/promises";

const config = JSON.parse(await fs.readFile("config.json", "utf8"));
const base = config.baseUrl;

const pageRes = await fetch(`${base}${config.searchEndpoint}`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Referer: `${base}/web/guest/contractor-selection`,
    "User-Agent": "Mozilla/5.0",
  },
  body: JSON.stringify([
    {
      pageSize: 3,
      pageNumber: 0,
      sortBy: "publicDate",
      sortType: "DESC",
      query: [
        {
          index: "es-contractor-selection",
          keyWord: "",
          matchType: "all-1",
          matchFields: ["publicDate^10"],
          filters: [
            {
              fieldName: "type",
              searchType: "in",
              fieldValues: ["es-notify-contractor"],
            },
            {
              fieldName: "investField",
              searchType: "in",
              fieldValues: ["HH"],
            },
          ],
        },
      ],
    },
  ]),
});

const page = (await pageRes.json()).page;
const raw = page.content[0];
console.log("sample", raw.notifyNo, raw.id || raw.notifyId, raw.bidId);

const prefixes = [
  "/o/egp-portal-contractor-selection-v2/services",
  "/o/egp-portal-contractor-selection/services",
  "/o/egp-portal-home/services",
];

const paths = [
  "expose/lcnt/bid-po-bido-notify-contractor-view/get-by-id",
  "expose/lcnt/bido-bid-file-list",
  "expose/lcnt/bido-invitation-out",
  "expose/lcnt/bido-invitation-out-file-list",
  "get/bido-bid-file-list",
  "get/bido-invitation-out",
  "get/bido-invitation-out-file-list",
  "smart/get/bido-bid-file-list",
];

const bodies = [
  { id: raw.id || raw.notifyId },
  { notifyId: raw.notifyId || raw.id },
  {
    notifyId: raw.notifyId || raw.id,
    bidId: raw.bidId,
    notifyNo: raw.notifyNo,
    notifyVersion: raw.notifyVersion || "00",
    packType: 0,
  },
  {
    id: raw.id || raw.notifyId,
    notifyId: raw.notifyId || raw.id,
    bidId: raw.bidId,
    notifyNo: raw.notifyNo,
    notifyVersion: raw.notifyVersion || "00",
    bidMode: raw.bidMode,
    processApply: raw.processApply,
    type: raw.type,
    stepCode: raw.stepCode,
    planNo: raw.planNo,
    investField: Array.isArray(raw.investField) ? raw.investField[0] : raw.investField,
    packType: 0,
  },
];

for (const prefix of prefixes) {
  for (const path of paths) {
    const url = `${base}${prefix}/${path}`;
    for (const [i, body] of bodies.entries()) {
      try {
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
        if (res.status === 404 || res.status === 405) {
          continue;
        }
        console.log("\nHIT", res.status, prefix, path, "body#", i);
        console.log(text.slice(0, 300).replace(/\s+/g, " "));
        const chapter = /Chương|chapterName|packName|fileName/i.test(text);
        console.log("has file/chapter markers?", chapter);
      } catch (error) {
        console.log("ERR", prefix, path, error.message);
      }
    }
  }
}
