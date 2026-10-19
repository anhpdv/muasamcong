const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("el: '#search-home'");
const chunk = html.slice(idx, idx + 120000);
const created = chunk.indexOf("created() {");
console.log(chunk.slice(created, created + 4000).replace(/\s+/g, " "));
