const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("el: '#search-home'");
const chunk = html.slice(idx, idx + 80000);

const created = chunk.indexOf("created()");
const mounted = chunk.indexOf("mounted()");
console.log("created:", chunk.slice(created, created + 2500).replace(/\s+/g, " "));
console.log("\nmounted:", chunk.slice(mounted, mounted + 1500).replace(/\s+/g, " "));

// keyword assignment
let i = 0;
let c = 0;
while ((i = chunk.indexOf(".keyword", i)) >= 0 && c < 15) {
  const s = chunk.slice(Math.max(0, i - 60), i + 100);
  if (/quickSearch|URL|param|refresh|location|keyword\s*=/.test(s)) {
    console.log("\nkw:", s.replace(/\s+/g, " "));
    c += 1;
  }
  i += 1;
}
