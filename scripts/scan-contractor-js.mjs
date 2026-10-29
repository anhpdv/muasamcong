const base = "https://muasamcong.mof.gov.vn";
const roots = [
  "/o/egp-portal-contractor-selection-v2/",
  "/o/egp-portal-contractor-selection-v2/js/",
  "/o/egp-portal-contractor-selection-v2/js/app/",
  "/o/egp-portal-contractor-selection-v2/js/chunk/",
];

const keywords = [
  "bido-bid-file",
  "bido-invitation",
  "chapterName",
  "Chương III",
  "Chương V",
  "Chương 3",
  "Chương 5",
  "edocproxy",
  "file/share",
  "bid-file-list",
  "invitation-out",
  "packType",
  "getChapter",
  "hsmt",
  "expose/lcnt",
];

async function tryFetch(path) {
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "*/*" },
    redirect: "manual",
  });
  const text = await res.text();
  return { url, status: res.status, text };
}

// Known Liferay module patterns from older probes / common Vue builds
const candidates = [
  "/o/egp-portal-contractor-selection-v2/js/app.js",
  "/o/egp-portal-contractor-selection-v2/js/main.js",
  "/o/egp-portal-contractor-selection-v2/js/index.js",
  "/o/egp-portal-contractor-selection-v2/js/chunk-vendors.js",
  "/o/egp-portal-contractor-selection-v2/js/app.bundle.js",
  "/o/egp-portal-contractor-selection-v2/js/contractor-selection.js",
  "/o/egp-portal-contractor-selection-v2/js/detail.js",
  "/o/egp-portal-contractor-selection-v2/js/vue/app.js",
];

for (const path of candidates) {
  const result = await tryFetch(path);
  console.log(result.status, path, result.text.slice(0, 80).replace(/\s+/g, " "));
}

// Fetch detail page HTML specifically and extract JS/module URLs
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;
const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.log("\ndetail html", html.length);
const urls = new Set();
for (const match of html.matchAll(/\/o\/egp-portal-contractor-selection-v2\/[^"'\\\s>]{5,200}/g)) {
  urls.add(match[0].replace(/&amp;/g, "&"));
}
console.log([...urls].join("\n"));

for (const match of html.matchAll(/Liferay\.ModuleExporter|__CONFIG__|modules = |resolvePath|js\/[a-zA-Z0-9._/-]+\.js/g)) {
  // keep scanning later
}
const moduleHits = [...html.matchAll(/["'](\/o\/egp-portal-contractor-selection-v2\/js\/[^"']+)["']/g)].map(
  (m) => m[1],
);
console.log("\nmodule js");
console.log([...new Set(moduleHits)].join("\n"));
