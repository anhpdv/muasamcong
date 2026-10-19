const detail =
  "type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a";

const urls = [
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=detail&${detail}`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail&${detail}`,
  `https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index&render=detail&${detail}`,
];

for (const url of urls) {
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  const bodyStart = html.indexOf('id="portlet_egpportalcontractorselectionv2');
  const body = html.slice(bodyStart, bodyStart + 2000);
  console.log("\n", url.includes("p_p_id") ? "portlet" : "guest", "broken", /tạm thời không có/.test(body), "len", body.length);
}
