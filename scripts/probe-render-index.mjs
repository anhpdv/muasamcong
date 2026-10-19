const urls = [
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=PL2600157524&searchWith=planNo,name",
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
];

for (const url of urls) {
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  console.log("\n", url.split("?")[1].slice(0, 90));
  console.log("broken", /tạm thời không có/.test(html));
  console.log("search-home", html.includes("search-home"));
  const m = html.match(/quickSearchPayload:\s*\{[^\}]{0,350}/);
  console.log("payload", m?.[0]?.replace(/\s+/g, " "));
}
