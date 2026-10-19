import fs from "node:fs";

const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const scripts = [...html.matchAll(/src="([^"]*egp-portal-contractor[^"]+)"/g)].map((m) => m[1]);
console.log("scripts", scripts.length);

for (const script of scripts.slice(0, 3)) {
  const url = script.startsWith("http") ? script : `https://muasamcong.mpi.gov.vn${script}`;
  const js = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  console.log("bundle", url.split("/").pop(), "len", js.length);

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
    "contractor-selection",
  ];

  for (const p of patterns) {
    let idx = 0;
    let c = 0;
    while ((idx = js.indexOf(p, idx)) >= 0 && c < 2) {
      console.log(p + ":", js.slice(Math.max(0, idx - 90), idx + 110).replace(/\s+/g, " "));
      idx += p.length;
      c += 1;
    }
  }
}
