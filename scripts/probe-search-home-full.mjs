const html = await fetch(
  "https://muasamcong.mpi.gov.vn/web/guest/contractor-selection?render=index&keyword=IB2600277918&searchWith=notifyNo,bidName",
  { headers: { "User-Agent": "Mozilla/5.0" } },
).then((r) => r.text());

const idx = html.indexOf("el: '#search-home'");
const end = html.indexOf("new Vue({", idx + 100);
const chunk = html.slice(idx, idx + 200000);

for (const p of [
  "refreshURLData",
  "Liferay.component",
  "getParameter",
  "keyword",
  "IB2600277918",
  "mounted()",
  "created()",
  "loadLocalStorage",
  "initSearch",
  "autoSearch",
  "actionSearch",
  "searchQuick",
  "quickSearch",
  "currentUrl",
  "textSearch",
]) {
  let i = 0;
  let c = 0;
  while ((i = chunk.indexOf(p, i)) >= 0 && c < 4) {
    const s = chunk.slice(Math.max(0, i - 90), i + 220).replace(/\s+/g, " ");
    if (/keyword|search|init|mount|create|refresh|IB2600277918|action|quick|localStorage|URL/.test(s)) {
      console.log("\n", p, ":", s.slice(0, 300));
    }
    i += p.length;
    c += 1;
  }
}
