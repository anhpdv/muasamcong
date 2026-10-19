const base =
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index";

const urls = [
  `${base}&keyword=IB2600277918&searchWith=notifyNo,bidName`,
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918&searchWith=notifyNo,bidName",
  "https://muasamcong.mpi.gov.vn/web/guest/home",
];

for (const url of urls) {
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  const vueEls = [...html.matchAll(/el:\s*'#([^']+)'/g)].map((m) => m[1]);
  const refresh = html.match(/refreshURLData:\s*(\{[^}]+\})/)?.[1]?.slice(0, 180);
  const hasActionSearch = html.includes("actionSearch()");
  const setsLS = html.includes("setItem(\"quickSearchPayload\"");
  console.log("\nURL", url.slice(60, 130));
  console.log("vue", vueEls.slice(0, 8));
  console.log("refresh", refresh);
  console.log("actionSearch", hasActionSearch, "setLS", setsLS);
}
