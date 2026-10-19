const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const patterns = [
  "renderUrlDetail",
  "render=detail",
  "detailContractor",
  "openDetail",
  "goDetail",
  "viewDetail",
  "notifyNo",
  "stepCode",
  "bidId",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 4) {
    const s = html.slice(Math.max(0, idx - 60), idx + 220).replace(/\s+/g, " ");
    if (/function|url|render|detail|notify|step|bidId|window/.test(s)) {
      console.log("\n", p, ":", s);
    }
    idx += p.length;
    c += 1;
  }
}
