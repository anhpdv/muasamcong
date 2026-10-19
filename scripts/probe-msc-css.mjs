const cssUrl =
  "https://muasamcong.mpi.gov.vn/o/egp-portal-home/css/main.css?browserId=other&themeId=egpportaltheme_WAR_egpportaltheme&minifierType=css&languageId=vi_VN&b=7413";
const css = await fetch(cssUrl, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
const needles = [
  "#egp-header",
  ".header",
  "content__search",
  "search-button",
  "0a314d",
  "be8a4b",
  "bc7434",
  "primary",
  "font-family",
  "background",
];
for (const n of needles) {
  let idx = 0;
  let c = 0;
  while ((idx = css.indexOf(n, idx)) >= 0 && c < 4) {
    console.log(n + ":", css.slice(Math.max(0, idx - 40), idx + 120).replace(/\s+/g, " "));
    idx += n.length;
    c += 1;
  }
}
