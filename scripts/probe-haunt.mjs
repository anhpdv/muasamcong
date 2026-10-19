const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const i = html.indexOf("indexSelectParam:");
console.log(html.slice(Math.max(0, i - 500), i + 1500).replace(/\s+/g, " "));

const j = html.indexOf("search-advantage-haunt");
console.log("\n\n--- haunt ---\n");
console.log(html.slice(Math.max(0, j - 200), j + 800).replace(/\s+/g, " "));
