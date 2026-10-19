const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("renderDetailUrl");
let i = idx;
let c = 0;
while ((i = html.indexOf("renderDetail", i)) >= 0 && c < 10) {
  console.log(html.slice(i, i + 350).replace(/\s+/g, " "));
  i += 20;
  c += 1;
}
