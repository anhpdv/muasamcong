const detail =
  "render=detail&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a";

const search =
  "render=search&keyword=IB2600277918&index=es-contractor-selection&type=es-notify-contractor&filterType=tbmt";

for (const [name, q] of [
  ["detail", detail],
  ["search filtered", search],
]) {
  const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());

  console.log("\n===", name, "===");
  console.log("broken portlet", /tạm thời không có/.test(html));
  console.log("has vue mount", /egp-portal-contractor-selection-v2/.test(html));
  console.log("has notifyNo in page", html.includes("IB2600277918"));
  console.log("has render param echo", html.includes("render=search") || html.includes("render=detail"));

  const markers = ["filterType", "khlcnt", "keyword", "notifyNo", "searchAdvancePayload", "mounted", "created()"];
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i >= 0) console.log(m, ":", html.slice(i, i + 80).replace(/\s+/g, " "));
  }
}
