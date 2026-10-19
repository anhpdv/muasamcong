const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("el: '#search-home'");
console.log("found", idx >= 0);
if (idx >= 0) {
  const chunk = html.slice(idx, idx + 15000);
  for (const p of ["created()", "mounted()", "refreshURLData", "quickSearchPayload", "keyword", "searchWith", "actionSearch", "loadLocalStorage", "convertQuickSearch", "notiType", "renderUrl", "viewDetail", "openDetail", "goDetail", "notifyNo"]) {
    let i = 0;
    let c = 0;
    while ((i = chunk.indexOf(p, i)) >= 0 && c < 2) {
      console.log("\n", p, chunk.slice(Math.max(0, i - 80), i + 200).replace(/\s+/g, " "));
      i += p.length;
      c += 1;
    }
  }
}
