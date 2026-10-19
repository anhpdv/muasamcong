import fs from "node:fs";

const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const combos = [...html.matchAll(/\/combo\?[^"']+/g)].map((m) => m[0]);
console.log("combos", combos.length);
for (const c of combos) {
  if (/contractor|egp/i.test(c)) console.log(c.slice(0, 250));
}

const combo = combos.find((c) => /egpportalcontractorselection|contractor-selection/i.test(c));
if (!combo) {
  console.log("no combo found");
  process.exit(1);
}

const url = `https://muasamcong.mpi.gov.vn${combo.replace(/&amp;/g, "&")}`;
console.log("fetching", url.slice(0, 200));
const js = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
fs.writeFileSync("scripts/combo-snippet.txt", js.slice(0, 200000));
console.log("len", js.length);

const patterns = [
  "filterType",
  "khlcnt",
  "render",
  "keyword",
  "URLSearchParams",
  "location.search",
  "getQuery",
  "parseQuery",
  "planNo",
  "notifyNo",
  "es-plan-project-p",
  "es-notify-contractor",
  "stepCode",
  "render=detail",
  "searchAdvancePayload",
  "tabSearch",
  "indexSelect",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = js.indexOf(p, idx)) >= 0 && c < 3) {
    console.log("\n---", p);
    console.log(js.slice(Math.max(0, idx - 100), idx + 150).replace(/\s+/g, " "));
    idx += p.length;
    c += 1;
  }
}
