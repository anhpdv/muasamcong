import fs from "node:fs";

const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

fs.writeFileSync("scripts/search-page-snippet.txt", html.slice(0, 50000));

const needles = [
  "es-plan-project-p",
  "planNo",
  "keyword",
  "render=search",
  "render=detail",
  "contractor-selection",
  "filterType",
  "index",
  "Bidder selection plan",
  "Kế hoạch",
  "umFilter",
  "searchType",
];
for (const n of needles) {
  const i = html.indexOf(n);
  if (i >= 0) {
    console.log("---", n);
    console.log(html.slice(Math.max(0, i - 60), i + 120).replace(/\s+/g, " "));
  }
}
