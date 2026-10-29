const base = "https://muasamcong.mof.gov.vn";
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;

const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

function dump(needle, radius = 800) {
  let from = 0;
  for (let i = 0; i < 6; i += 1) {
    const idx = html.indexOf(needle, from);
    if (idx < 0) break;
    console.log(`\n==== ${needle} #${i + 1} ====`);
    console.log(html.slice(Math.max(0, idx - 200), idx + radius).replace(/\s+/g, " "));
    from = idx + needle.length;
  }
}

for (const n of [
  "loadHsmt()",
  "loadHsmt:",
  "loadHsmt: function",
  "function loadHsmt",
  "dtlHsmt =",
  "dtlHsmt:",
  "bida-inv-chapter-confs",
  "ebidinv/",
  "downloadFile: function",
  "downloadFile(fileId",
  "api/unau/edocproxy",
  "/api/unau/edocproxy/file/share/",
  "getFileShare",
  "fileShare",
]) {
  dump(n, 900);
}

const apis = [...html.matchAll(/\/o\/egp-portal-contractor-selection-v2\/services\/[a-zA-Z0-9_./-]{5,120}/g)].map(
  (m) => m[0],
);
console.log("\nALL APIS\n" + [...new Set(apis)].sort().join("\n"));
