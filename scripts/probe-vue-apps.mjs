const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=search&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const vueApps = [...html.matchAll(/new Vue\(\{[^}]*el:\s*'([^']+)'/g)].map((m) => m[1]);
console.log("vue apps", vueApps);

for (const el of vueApps) {
  const idx = html.indexOf(`el: '#${el.replace("#", "")}'`);
  if (idx < 0) continue;
  const chunk = html.slice(idx, idx + 3000);
  if (/keyword|render|quickSearch|loadLocalStorage/.test(chunk)) {
    console.log("\n===", el, "===");
    const created = chunk.indexOf("created()");
    if (created >= 0) console.log(chunk.slice(created, created + 800).replace(/\s+/g, " "));
  }
}
