import { readFileSync } from "node:fs";
import { searchByIndex } from "../src/api.js";

const config = JSON.parse(readFileSync("config.json", "utf8"));
config.baseUrl = config.baseUrl || "https://muasamcong.mpi.gov.vn";

const plan = (
  await searchByIndex(config, {
    index: "es-contractor-selection",
    keyword: "PL2600157524",
    matchFields: ["planNo"],
    filters: [
      {
        fieldName: "type",
        searchType: "in",
        fieldValues: ["es-plan-project-p"],
      },
    ],
    pageSize: 1,
  })
)[0];

console.log(
  JSON.stringify(
    {
      id: plan?.id,
      planNo: plan?.planNo,
      type: plan?.type,
      stepCode: plan?.stepCode,
      planType: plan?.planType,
      planVersion: plan?.planVersion,
    },
    null,
    2,
  ),
);
