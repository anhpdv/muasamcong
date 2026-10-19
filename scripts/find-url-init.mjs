const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const patterns = [
  "refreshURLData",
  "Liferay.component",
  "quickSearchPayload",
  "searchWith",
  "convertQuickSearchToAdvanceSearch",
  "loadLocalStorage",
  "created()",
  "keyword",
  "notiType",
  "actionSearch",
  "render=search",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 8) {
    const s = html.slice(Math.max(0, idx - 90), idx + 220).replace(/\s+/g, " ");
    if (/refreshURL|quickSearch|searchWith|keyword|notiType|localStorage|created|mounted|init|URL/.test(s)) {
      console.log("\n", p, ":", s.slice(0, 280));
    }
    idx += p.length;
    c += 1;
  }
}
