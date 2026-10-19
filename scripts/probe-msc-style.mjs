const html = await fetch("https://muasamcong.mpi.gov.vn/web/guest/home", {
  headers: { "User-Agent": "Mozilla/5.0" },
}).then((r) => r.text());

const styles = [...html.matchAll(/href="([^"]*\.css[^"]*)"/g)].map((m) => m[1]).slice(0, 15);
console.log("css", styles);

const colors = [];
for (const p of ["#egp-header", "primary", "--primary", "background", "color:", "#0", "#1", "#2", "egp-", "btn-primary", "font-family"]) {
  let idx = 0;
  let c = 0;
  while ((idx = html.indexOf(p, idx)) >= 0 && c < 3) {
    const s = html.slice(idx, idx + 120).replace(/\s+/g, " ");
    if (/color|background|font|#[0-9a-fA-F]{3,6}/.test(s)) colors.push(s);
    idx += p.length;
    c += 1;
  }
}
console.log("\ncolors sample", [...new Set(colors)].slice(0, 12));

// inline style blocks
const styleBlocks = [...html.matchAll(/<style[^>]*>([\s\S]{0,2000}?)<\/style>/g)].map((m) => m[1]);
for (const block of styleBlocks.slice(0, 3)) {
  if (/header|primary|color|background/.test(block)) {
    console.log("\nstyle block:", block.slice(0, 500).replace(/\s+/g, " "));
  }
}
