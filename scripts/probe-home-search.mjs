const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

const patterns = [
  "setItem('quickSearchPayload'",
  "actionSearch",
  "render=search",
  "contractor-selection",
  "searchWith",
  "planNo,name",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 5) {
    console.log("\n", p, ":", html.slice(Math.max(0, idx - 80), idx + 280).replace(/\s+/g, " "));
    idx += p.length;
    c += 1;
  }
}
