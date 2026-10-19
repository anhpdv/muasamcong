const q =
  "p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-plan-project-p&stepCode=plan-step-1&id=9ec3b1b2-4421-42c2-b2c6-c47367031c9d&planNo=PL2600157524&planType=TX&planVersion=00";
const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());
console.log(/tạm thời không có/.test(html) ? "BROKEN" : "OK", html.includes("PL2600157524"));
