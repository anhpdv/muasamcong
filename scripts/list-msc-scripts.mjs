const base = "https://muasamcong.mof.gov.vn";
const html = await (
  await fetch(`${base}/web/guest/contractor-selection`, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
  })
).text();

console.log("len", html.length);
const scripts = [];
for (const match of html.matchAll(/src=["']([^"']+\.js[^"']*)["']/g)) {
  scripts.push(match[1]);
}
console.log(scripts.join("\n"));
console.log("--- egp paths ---");
for (const match of html.matchAll(/\/o\/egp[^"'\\\s>]{5,160}/g)) {
  console.log(match[0]);
}
