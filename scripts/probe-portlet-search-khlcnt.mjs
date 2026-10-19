const PORTLET =
  "p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=search";

const url = `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&keyword=PL2600157524&searchWith=planNo,name`;
const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
console.log("broken", /tạm thời không có/.test(html));
const refresh = html.match(/refreshURLData:\s*(\{[^}]+\})/);
console.log("refresh", refresh?.[1]);
const payload = html.match(/quickSearchPayload:\s*\{[^\}]{0,350}/);
console.log("payload", payload?.[0]?.replace(/\s+/g, " "));
const notiType = html.match(/notiType:\s*'([^']+)'/);
console.log("notiType", notiType?.[1]);
