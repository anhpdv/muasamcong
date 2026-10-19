const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

let idx = 0;
let c = 0;
while ((idx = html.indexOf("refreshURLData", idx)) >= 0 && c < 10) {
  console.log(html.slice(Math.max(0, idx - 100), idx + 400).replace(/\s+/g, " "));
  idx += 1;
  c += 1;
}
