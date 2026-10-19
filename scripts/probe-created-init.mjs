const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const start = html.indexOf("if (JSON.parse(localStorage.getItem('quickSearchPayload'))");
console.log(html.slice(Math.max(0, start - 1500), start + 2000).replace(/\s+/g, " "));
