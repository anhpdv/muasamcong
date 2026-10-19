const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const patterns = [
  "renderUrlDetailContract(",
  "renderUrlDetailContractV2(",
  "renderUrlDetailContract (",
];
for (const p of patterns) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 3) {
    // find method definition - look backwards for renderUrlDetailContract
    const start = html.lastIndexOf("renderUrlDetailContract", idx - 5);
    if (start > idx - 200) {
      console.log("\n=== def near", p, "===");
      console.log(html.slice(start, start + 1200).replace(/\s+/g, " "));
    }
    idx += p.length;
    c += 1;
  }
}

// direct search for function body
const def = html.indexOf("renderUrlDetailContract(type");
console.log("\n=== direct def ===");
console.log(html.slice(def, def + 1500).replace(/\s+/g, " "));
