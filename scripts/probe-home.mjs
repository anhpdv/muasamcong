const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

let idx = 0;
let c = 0;
while ((idx = html.indexOf("quickSearchPayload", idx)) >= 0 && c < 15) {
  console.log(html.slice(Math.max(0, idx - 120), idx + 250).replace(/\s+/g, " "));
  idx += 1;
  c += 1;
}
