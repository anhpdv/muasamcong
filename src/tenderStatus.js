import fs from "node:fs/promises";
import { tenderKey } from "./normalize.js";

export const WORKFLOW_STATUSES = {
  theo_doi: "Theo dõi",
  luu: "Lưu",
  khong_tham_gia: "Không tham gia",
  da_nop_thau: "Đã nộp thầu",
};

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "theo_doi", label: "Theo dõi" },
  { value: "luu", label: "Lưu" },
  { value: "khong_tham_gia", label: "Không tham gia" },
  { value: "da_nop_thau", label: "Đã nộp thầu" },
];

export function isValidWorkflowStatus(value) {
  return !value || Object.hasOwn(WORKFLOW_STATUSES, value);
}

export function getWorkflowStatusLabel(value) {
  return WORKFLOW_STATUSES[value] || "";
}

export async function loadWorkflowStatuses(statusesPath) {
  try {
    const content = await fs.readFile(statusesPath, "utf8");
    const data = JSON.parse(content);
    return typeof data === "object" && data ? data : {};
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function saveWorkflowStatuses(statusesPath, statuses) {
  await fs.writeFile(
    statusesPath,
    `${JSON.stringify(statuses, null, 2)}\n`,
    "utf8",
  );
}

export function enrichWithWorkflowStatus(tender, statuses) {
  const key = tenderKey(tender);
  return {
    ...tender,
    tenderKey: key,
    workflowStatus: statuses[key] || "",
  };
}

export async function setWorkflowStatus(statusesPath, tender, workflowStatus) {
  if (!isValidWorkflowStatus(workflowStatus)) {
    throw new Error("Trạng thái không hợp lệ");
  }

  const statuses = await loadWorkflowStatuses(statusesPath);
  const key = tenderKey(tender);

  if (!workflowStatus) {
    delete statuses[key];
  } else {
    statuses[key] = workflowStatus;
  }

  await saveWorkflowStatuses(statusesPath, statuses);
  return { key, workflowStatus };
}
