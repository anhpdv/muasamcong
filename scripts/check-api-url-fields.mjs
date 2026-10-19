import { readFileSync } from "node:fs";
import { searchByIndex } from "../src/api.js";

const config = JSON.parse(readFileSync("config.json", "utf8"));
config.baseUrl = config.baseUrl || "https://muasamcong.mpi.gov.vn";

const item = (
  await searchByIndex(config, {
    index: "es-contractor-selection",
    keyword: "IB2600277918",
    matchFields: ["notifyNo"],
    filters: [{ fieldName: "type", searchType: "in", fieldValues: ["es-notify-contractor"] }],
    pageSize: 1,
  })
)[0];

const urlKeys = Object.keys(item).filter((k) => /url|link|href|path|detail/i.test(k));
console.log("url keys", urlKeys);
for (const k of urlKeys) console.log(k, item[k]);
