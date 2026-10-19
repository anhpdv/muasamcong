const BASE = "https://muasamcong.mpi.gov.vn";

const urls = [
  "render=search&keyword=PL2600157524",
  "render=search&keyword=PL2600157524&type=es-plan-project-p",
  "render=search&keyword=PL2600157524&index=es-plan-project-p",
  "render=search&keyWord=PL2600157524",
  "render=search&keyword=IB2600277918&type=es-notify-contractor",
  "render=search&keyword=IB2600277918&index=es-contractor-selection",
  "render=detail&type=es-notify-contractor&stepCode=notify-contractor-step-1-tbmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a&investField=HH&bidForm=DTRR",
  "render=detail&type=es-notify-contractor&stepCode=notify-contractor-step-2-kqmt&id=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyId=6be40e92-b1ad-4368-be6b-9e4fb650c8f0&notifyNo=IB2600277918&notifyVersion=00&bidMode=1_MTHS&processApply=LDT&step=tbmt&bidId=8e959fec-d195-422a-96a1-43f8445ed37a",
];

for (const q of urls) {
  const url = `${BASE}/web/guest/contractor-selection?${q}`;
  const html = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }).then((r) => r.text());
  const broken = /tạm thời không có/.test(html);
  console.log(broken ? "BROKEN" : "OK", q.slice(0, 90));
}
