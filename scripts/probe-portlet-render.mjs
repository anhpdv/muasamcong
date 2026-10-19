const PORTLET =
  "p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view";

const detailParams =
  "type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a&investField=HH&bidForm=DTRR";

const planParams =
  "type=es-plan-project-p&stepCode=plan-step-1&id=9ec3b1b2-4421-42c2-b2c6-c47367031c9d&planNo=PL2600157524&planType=TX&planVersion=00&step=khlcnt";

const urls = [
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail&${detailParams}`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&${detailParams}`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail&${planParams}`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index&keyword=IB2600277918&searchWith=notifyNo,bidName`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${PORTLET}&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=search&keyword=PL2600157524&searchWith=planNo,name`,
];

for (const url of urls) {
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  const broken = /tạm thời không có/.test(html);
  const render = url.match(/_render=([^&]+)/)?.[1];
  console.log(render, broken ? "BROKEN" : "OK", "len", html.length);
}
