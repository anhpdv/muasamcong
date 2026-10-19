const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&filterType=khlcnt",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const markers = [
  "quickSearchPayload",
  "matchFields",
  "filterType",
  "render",
  "getParameter",
  "URLUtil",
  "parseQuery",
];
for (const m of markers) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(m, idx)) >= 0 && c < 8) {
    const s = html.slice(Math.max(0, idx - 80), idx + 160).replace(/\s+/g, " ");
    if (/quickSearch|matchFields|filterType|render|keyword|planNo|notifyNo|getParam|parse|created|mounted|init/.test(s)) {
      console.log("\n", m, ":", s);
    }
    idx += m.length;
    c += 1;
  }
}
