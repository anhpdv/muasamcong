const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&matchFields=planNo",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const patterns = [
  "setItem('quickSearchPayload'",
  'setItem("quickSearchPayload"',
  "getURLParameter",
  "getParameter",
  "URLParameters",
  "currentURL",
  "keyword",
  "render",
  "actionSearch",
  "searchWith",
  "planNo,name",
  "notifyNo,bidName",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 4) {
    const s = html.slice(Math.max(0, idx - 120), idx + 220).replace(/\s+/g, " ");
    console.log("\n", p, ":", s);
    idx += p.length;
    c += 1;
  }
}
