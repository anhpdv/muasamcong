const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const needles = [
  "notify-contractor-step-1-tbmt",
  "window.location",
  "renderDetail",
  "viewDetail",
  "detailUrl",
  "goToDetail",
  "openNotify",
  "indexUrl",
  "currentUrl",
];
for (const n of needles) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(n, idx)) >= 0 && c < 5) {
    console.log("\n", n, ":", html.slice(Math.max(0, idx - 80), idx + 250).replace(/\s+/g, " "));
    idx += n.length;
    c += 1;
  }
}
