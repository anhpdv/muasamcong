const BASE = "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection";
const PORTLET =
  "p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2";

const tests = [
  `${PORTLET}&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&bidMode=1_MTHS&processApply=LDT&isInternet=1`,
  `${PORTLET}&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&bidMode=1_MTHS&processApply=LDT&planNo=&pno=&isInternet=1&caseKHKQ=&contractCode=`,
];

for (const q of tests) {
  const html = await fetch(`${BASE}?${q}`, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  console.log(q.slice(120, 200), /tạm thời không có/.test(html) ? "BROKEN" : "OK", html.includes("IB2600277918"));
}
