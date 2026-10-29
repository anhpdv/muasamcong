const base = "https://muasamcong.mof.gov.vn";
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;

const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

for (const needle of ["urlHsmt", "siteKey", "downloadFilePublic", "localhost:1234", "edoc-oldproxy", "browser/public"]) {
  let from = 0;
  for (let i = 0; i < 5; i += 1) {
    const idx = html.indexOf(needle, from);
    if (idx < 0) break;
    console.log(`\n==== ${needle} #${i + 1} ====`);
    console.log(html.slice(Math.max(0, idx - 120), idx + 500).replace(/\s+/g, " "));
    from = idx + needle.length;
  }
}
