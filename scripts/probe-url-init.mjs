const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918&index=es-contractor-selection&type=es-notify-contractor&filterType=tbmt",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const needles = [
  "getUrlParam",
  "getQuery",
  "queryString",
  "URLSearchParams",
  "filterType",
  "notiType",
  "keyword",
  "render",
  "planNo",
  "notifyNo",
  "created()",
  "mounted()",
  "initFrom",
  "parseUrl",
  "currentURL",
];
for (const n of needles) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(n, idx)) >= 0 && c < 4) {
    const snippet = html.slice(Math.max(0, idx - 120), idx + 200);
    if (/function|created|mounted|keyword|filterType|notiType|planNo|notifyNo|render/.test(snippet)) {
      console.log("\n---", n, "---");
      console.log(snippet.replace(/\s+/g, " "));
    }
    idx += n.length;
    c += 1;
  }
}
