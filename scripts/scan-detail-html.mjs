const base = "https://muasamcong.mof.gov.vn";
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;

const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();
console.log("len", html.length);

const patterns = [
  /Chương\s*(III|V|3|5)[^<]{0,80}/gi,
  /chapterName[^,]{0,100}/gi,
  /bido[-a-z0-9_/]{5,80}/gi,
  /edocproxy[^"'\\\s]{0,80}/gi,
  /file\/share\/[a-z0-9-]{10,60}/gi,
  /expose\/lcnt\/[a-z0-9_/-]{5,100}/gi,
  /get\/bido[-a-z0-9_/]{5,80}/gi,
  /packType[^,]{0,40}/gi,
  /Yêu cầu về kỹ thuật[^<]{0,40}/gi,
  /Tiêu chuẩn đánh giá[^<]{0,60}/gi,
];

for (const pattern of patterns) {
  const hits = [...html.matchAll(pattern)].map((m) => m[0]).slice(0, 15);
  if (hits.length) {
    console.log("\nPATTERN", pattern);
    console.log([...new Set(hits)].join("\n"));
  }
}

// Dump nearby context for Chương III / V if present
for (const label of ["Chương III", "Chương V", "Chương 3", "Chương 5", "Tiêu chuẩn đánh giá", "Yêu cầu về kỹ thuật"]) {
  const idx = html.indexOf(label);
  if (idx >= 0) {
    console.log("\nCONTEXT", label);
    console.log(html.slice(idx - 100, idx + 250).replace(/\s+/g, " "));
  }
}
