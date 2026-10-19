const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("egpportalcontractorselectionv2");
console.log("occurrences", (html.match(/egpportalcontractorselectionv2/g) || []).length);

let i = 0;
let c = 0;
while ((i = html.indexOf("egpportalcontractorselectionv2", i)) >= 0 && c < 8) {
  console.log("\n", html.slice(Math.max(0, i - 80), i + 200).replace(/\s+/g, " "));
  i += 1;
  c += 1;
}

const renderIdx = html.indexOf("_render=search");
console.log("\n_render=search count", (html.match(/_render=search/g) || []).length);
if (renderIdx >= 0) console.log(html.slice(renderIdx - 100, renderIdx + 300));
