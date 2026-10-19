const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

const idx = html.indexOf("actionSearch()");
console.log(html.slice(Math.max(0, idx - 200), idx + 1200).replace(/\s+/g, " "));
