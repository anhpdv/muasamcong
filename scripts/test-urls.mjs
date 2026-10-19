import { buildDetailUrl, buildPlanSearchUrl, buildPlanUrl } from "../src/normalize.js";
import { readFileSync } from "node:fs";

const tender = JSON.parse(readFileSync("data/tenders.jsonl", "utf8").split("\n")[1]);
console.log("detailUrl:", buildDetailUrl(tender.raw));
console.log("planUrl:", buildPlanUrl(tender.raw));
console.log("planSearch:", buildPlanSearchUrl(tender.planNo));
