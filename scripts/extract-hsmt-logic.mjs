const base = "https://muasamcong.mof.gov.vn";
const detail =
  `${base}/web/guest/contractor-selection?p_p_id=egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_egpportalcontractorselectionv2_WAR_egpportalcontractorselectionv2_render=detail-v2&type=es-notify-contractor&id=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyId=9cfe31b0-d63f-40cb-be1e-ad3e8d4b9d95&notifyNo=IB2600576149&bidId=fbbec6f7-29b0-4bff-a116-84b9a64e4a28&investField=HH`;

const html = await (await fetch(detail, { headers: { "User-Agent": "Mozilla/5.0" } })).text();

function dumpAround(label, needle, radius = 500) {
  let from = 0;
  let count = 0;
  while (count < 8) {
    const idx = html.indexOf(needle, from);
    if (idx < 0) break;
    console.log(`\n==== ${label} #${count + 1} @${idx} ====`);
    console.log(html.slice(Math.max(0, idx - radius), idx + radius).replace(/\s+/g, " "));
    from = idx + needle.length;
    count += 1;
  }
}

for (const needle of [
  "urlEdoc",
  "chapterNames",
  "BD_EVALUATION",
  "BD_TECH",
  "BD_CONTRACT_CONDITION",
  "fileTech",
  "filterFormValueAttrFileBm",
  "downloadFile(",
  "dtlHsmt",
  "bidoInvBiddingDTO",
  "param_hsmt",
  "Chương III",
  "Chương V",
  "Tiêu chuẩn đánh giá hồ sơ dự thầu",
  "Yêu cầu về kỹ thuật",
]) {
  dumpAround(needle, needle, 350);
}

// Extract unique BD.* chapter codes near HSMT section
const codes = [...html.matchAll(/BD\.[A-Z0-9.]+|BD_[A-Z0-9_]+/g)].map((m) => m[0]);
console.log("\nBD codes sample", [...new Set(codes)].slice(0, 80));
