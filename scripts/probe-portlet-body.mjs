async function portletBody(q) {
  const html = await fetch(`https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?${q}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  }).then((r) => r.text());

  const start = html.indexOf('id="portlet_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2"');
  const end = html.indexOf("</section>", start);
  const body = html.slice(start, end);
  console.log("\n===", q.slice(0, 80), "===");
  console.log("len", body.length);
  console.log("broken", /tạm thời không có/.test(body));
  console.log("has app id", body.match(/id="[^"]+"/g)?.slice(0, 10));
  const scripts = [...body.matchAll(/<script[^>]*>([\s\S]{0,500})/g)].map((m) => m[1].slice(0, 200));
  console.log("inline scripts", scripts.length);
  for (const s of scripts.slice(0, 3)) console.log(s.replace(/\s+/g, " "));
}

await portletBody("render=search&keyword=IB2600277918&searchWith=notifyNo,bidName");
await portletBody(
  "render=detail&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a",
);
await portletBody("render=search&keyword=PL2600157524&searchWith=planNo,name&filterType=khlcnt");
