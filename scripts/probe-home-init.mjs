const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

const idx = html.indexOf("el: '#home'");
const chunk = html.slice(idx, idx + 50000);
console.log("chunk len", chunk.length);

for (const p of ["created()", "mounted()", "location.search", "URLSearchParams", "getParam", "keyword", "quickSearchPayload.keyword", "actionSearch()"]) {
  let i = 0;
  let c = 0;
  while ((i = chunk.indexOf(p, i)) >= 0 && c < 3) {
    console.log("\n", p, chunk.slice(Math.max(0, i - 100), i + 250).replace(/\s+/g, " "));
    i += p.length;
    c += 1;
  }
}
