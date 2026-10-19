const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

const idx = html.indexOf('id="egp-header"');
console.log(html.slice(idx, idx + 2500).replace(/\s+/g, " "));

const searchIdx = html.indexOf("content__search");
console.log("\n--- search ---\n");
console.log(html.slice(searchIdx, searchIdx + 1500).replace(/\s+/g, " "));
