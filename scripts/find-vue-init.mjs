const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=PL2600157524&searchWith=planNo,name",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

// Extract large inline script blocks from search portlet
const start = html.indexOf("new Vue({");
let count = 0;
let idx = start;
while ((idx = html.indexOf("new Vue({", idx)) >= 0 && count < 5) {
  const chunk = html.slice(idx, idx + 8000);
  if (chunk.includes("quickSearchPayload") || chunk.includes("searchAdvancePayload")) {
    console.log("\n=== Vue app", count, "el:", chunk.match(/el:\s*'([^']+)'/)?.[1], "===");
    const created = chunk.indexOf("created()");
    const mounted = chunk.indexOf("mounted()");
    const loadLS = chunk.indexOf("loadLocalStorage");
    console.log("created snippet:", chunk.slice(created, created + 600).replace(/\s+/g, " "));
    if (loadLS >= 0) console.log("loadLS:", chunk.slice(loadLS, loadLS + 400).replace(/\s+/g, " "));
  }
  idx += 10;
  count += 1;
}

// Search for URL param bootstrap outside Vue
const idx2 = html.indexOf("refreshURLData");
console.log("\nrefresh block:", html.slice(idx2, idx2 + 600).replace(/\s+/g, " "));
