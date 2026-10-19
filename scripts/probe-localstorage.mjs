const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&matchFields=planNo",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

let idx = 0;
let c = 0;
while ((idx = html.indexOf("quickSearchPayload", idx)) >= 0 && c < 20) {
  const s = html.slice(Math.max(0, idx - 100), idx + 200).replace(/\s+/g, " ");
  if (/setItem|getItem|keyword|matchFields|render|localStorage|created|mounted/.test(s)) {
    console.log("\n", c, s);
  }
  idx += 1;
  c += 1;
}
