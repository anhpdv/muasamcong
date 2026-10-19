const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&matchFields=planNo",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const patterns = [
  "render ==",
  "render===",
  "'search'",
  "quickSearchPayload =",
  "quickSearchPayload=",
  "matchFields=planNo",
  "getUrl",
  "parseParam",
  "initQuick",
  "convertQuickSearchToAdvanceSearch",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 3) {
    console.log("\n", p, ":", html.slice(Math.max(0, idx - 100), idx + 200).replace(/\s+/g, " "));
    idx += p.length;
    c += 1;
  }
}
