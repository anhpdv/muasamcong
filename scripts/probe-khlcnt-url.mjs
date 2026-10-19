const queries = [
  "render=search&keyword=PL2600157524&filterType=khlcnt",
  "render=search&keyword=PL2600157524&type=es-plan-project-p&filterType=khlcnt",
  "render=search&keyword=PL2600157524&index=es-contractor-selection&type=es-plan-project-p&filterType=khlcnt",
  "render=search&keyword=PL2600157524&planNo=PL2600157524&filterType=khlcnt",
];

for (const q of queries) {
  const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());

  console.log("\n===", q, "===");
  const i = html.indexOf("Liferay.currentURL");
  if (i >= 0) console.log(html.slice(i, i + 300).replace(/\s+/g, " "));

  const j = html.indexOf("searchAdvancePayload");
  if (j >= 0) {
    let count = 0;
    let idx = j;
    while (count < 5) {
      const k = html.indexOf("searchAdvancePayload", idx);
      if (k < 0) break;
      console.log(html.slice(k, k + 120).replace(/\s+/g, " "));
      idx = k + 20;
      count++;
    }
  }

  const quick = html.indexOf("quickSearch");
  if (quick >= 0) console.log("quick:", html.slice(quick, quick + 200).replace(/\s+/g, " "));
}
