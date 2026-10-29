const base = "https://muasamcong.mof.gov.vn";
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;

const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

const apiHits = [
  ...html.matchAll(/\/o\/egp-portal-contractor-selection-v2\/services\/[^"'\\\s]{5,180}/g),
].map((m) => m[0].replace(/\\/g, ""));
console.log("APIs:\n" + [...new Set(apiHits)].sort().join("\n"));

for (const needle of [
  "detailBidaInvChapterConfs",
  "loadHsmt",
  "loadDetailHsmt",
  "getHsmt",
  "bidoInvBidding",
  "downloadFile: function",
  "downloadFile(",
  "urlContractorFe",
  "/hsmst",
  "formCode",
  "'C3'",
  "'C5'",
  "code === 'C3'",
  "code === 'C5'",
  "pcode === 'C3'",
  "pcode === 'C5'",
]) {
  const idx = html.indexOf(needle);
  if (idx < 0) {
    console.log("\nMISS", needle);
    continue;
  }
  console.log(`\n==== ${needle} @${idx} ====`);
  console.log(html.slice(Math.max(0, idx - 250), idx + 500).replace(/\s+/g, " "));
}
