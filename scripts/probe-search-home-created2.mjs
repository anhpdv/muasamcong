const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("el: '#search-home'");
const chunk = html.slice(idx, idx + 120000);
const patterns = ["created()", "created ()", "created:function", "beforeMount", "currentUrl", "textSearch", "actionSearchQuick", "convertQuickSearchPayloadToPayload"];
for (const p of patterns) {
  const i = chunk.indexOf(p);
  console.log(p, i);
  if (i >= 0) console.log(chunk.slice(i, i + 800).replace(/\s+/g, " ").slice(0, 500));
}
