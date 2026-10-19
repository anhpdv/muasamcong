const PORTLET =
  "p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2";

const detailParams =
  "type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a&investField=HH&bidForm=DTRR";

const url = `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&${detailParams}`;
const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
console.log("broken", /tạm thời không có/.test(html));
console.log("has notify", html.includes("IB2600277918"));
console.log("has bid name", html.includes("hóa chất") || html.includes("Mua sắm"));
const refresh = html.match(/refreshURLData:\s*(\{[^}]+\})/);
console.log("refresh", refresh?.[1]?.slice(0, 300));
