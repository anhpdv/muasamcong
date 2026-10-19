const planDetail =
  "render=detail&type=es-plan-project-p&stepCode=plan-step-1&id=9ec3b1b2-4421-42c2-b2c6-c47367031c9d&planNo=PL2600157524&planType=TX&planVersion=00&step=khlcnt";

const planSearch = "render=search&keyword=PL2600157524&searchWith=planNo,name";

for (const q of [planDetail, planSearch]) {
  const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());
  const refresh = html.match(/refreshURLData:\s*(\{[^}]+\})/);
  console.log("\n", q.slice(0, 60));
  console.log("broken", /tạm thời không có/.test(html));
  console.log("refresh", refresh?.[1]?.slice(0, 200));
}
