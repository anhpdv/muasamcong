const tests = [
  "render=search&keyword=PL2600157524&matchFields=planNo",
  "render=search&keyword=PL2600157524&searchWith=planNo",
  "render=search&keyword=PL2600157524&filterType=khlcnt&matchFields=planNo",
  "render=search&keyword=IB2600277918&matchFields=notifyNo",
  "render=search&keyword=IB2600277918&filterType=tbmt&matchFields=notifyNo",
  "render=search&keyword=IB2600277918&index=es-contractor-selection&type=es-notify-contractor&filterType=tbmt&matchFields=notifyNo",
];

for (const q of tests) {
  const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());

  const i = html.indexOf("quickSearchPayload:");
  const snippet = html.slice(i, i + 500);
  const notiType = snippet.match(/notiType:\s*'([^']+)'/);
  const keyword = snippet.match(/keyword:\s*'([^']*)'/);
  const matchFields = snippet.match(/matchFields:\s*(\[[^\]]*\]|null|'[^']*')/);
  console.log(q);
  console.log("  notiType default:", notiType?.[1]);
  console.log("  has planNo logic context:", html.includes("matchFields?.includes('planNo')"));
  const cu = html.match(/currentUrl:\s*"([^"]+)"/);
  if (cu) console.log("  currentUrl:", cu[1].slice(0, 120));
}
