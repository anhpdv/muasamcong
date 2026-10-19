const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&filterType=khlcnt",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("matchFields?.includes('planNo')");
console.log(html.slice(Math.max(0, idx - 2500), idx + 800).replace(/\s+/g, " "));
