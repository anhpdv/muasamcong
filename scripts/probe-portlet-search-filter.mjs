const url =
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=search&keyword=PL2600157524&searchWith=planNo,name";
const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
const idx = html.indexOf("searchAdvancePayload");
console.log(html.slice(idx, idx + 500).replace(/\s+/g, " "));
const idx2 = html.indexOf("convertQuickSearchToAdvanceSearch");
console.log("\n", html.slice(idx2, idx2 + 400).replace(/\s+/g, " "));
