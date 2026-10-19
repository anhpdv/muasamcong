const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

// Find all references to searchWith near URL parsing
let idx = 0;
let c = 0;
while ((idx = html.indexOf("searchWith", idx)) >= 0 && c < 30) {
  const s = html.slice(Math.max(0, idx - 120), idx + 180);
  if (/getParam|currentURL|location|keyword|localStorage|setItem|created|mounted|quickSearch|URL/.test(s)) {
    console.log(c, s.replace(/\s+/g, " "));
  }
  idx += 1;
  c += 1;
}
