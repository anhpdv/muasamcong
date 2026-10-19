const urls = {
  detail:
    "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=detail&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a",
  planSearch:
    "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  tbmtSearch:
    "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918&searchWith=notifyNo,bidName",
  home: "https://muasamcong.mpi.gov.vn/web/guest/home",
};

for (const [name, url] of Object.entries(urls)) {
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  const broken = /tạm thời không có|temporarily unavailable|not available/i.test(html);
  const portletLen = html.slice(html.indexOf("portlet_egpportalcontractorselectionv2"), html.indexOf("portlet_egpportalcontractorselectionv2") + 3000).length;
  console.log(name, broken ? "BROKEN" : "OK", "portlet~", portletLen);
}
