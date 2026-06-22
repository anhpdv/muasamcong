import { postPortalService, searchByIndex } from "./api.js";
import { formatMoney } from "./loadTenders.js";
import {
  buildDetailUrl,
  buildFileDownloadUrl,
  buildPlanSearchUrl,
  buildPlanUrl,
} from "./normalize.js";

function firstValue(value) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function buildPortalContext(tender) {
  const raw = tender.raw || {};
  return {
    id: raw.id || raw.notifyId || tender.id || "",
    notifyId: raw.notifyId || raw.id || tender.id || "",
    bidId: raw.bidId || "",
    notifyNo: raw.notifyNo || tender.notifyNo || "",
    notifyVersion: raw.notifyVersion || tender.notifyVersion || "00",
    bidMode: raw.bidMode || tender.bidMode || "",
    processApply: raw.processApply || tender.processApply || "",
    type: raw.type || "es-notify-contractor",
    stepCode: raw.stepCode || "notify-contractor-step-1-tbmt",
    planNo: raw.planNo || tender.planNo || "",
    planType: raw.planType || tender.planType || "",
    investField: firstValue(raw.investField || tender.investField),
    bidForm: raw.bidForm || tender.bidForm || "",
  };
}

function isFileLike(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Boolean(
    value.fileName ||
      value.fileId ||
      value.publicFileId ||
      value.downloadUrl ||
      value.url ||
      (value.bucketName && value.fileName),
  );
}

function collectFiles(node, section = "", path = [], files = [], seen = new Set()) {
  if (!node) {
    return files;
  }

  if (Array.isArray(node)) {
    for (const item of node) {
      collectFiles(item, section, path, files, seen);
    }
    return files;
  }

  if (typeof node !== "object") {
    return files;
  }

  if (isFileLike(node)) {
    const key = [
      node.fileId,
      node.publicFileId,
      node.fileName,
      node.url,
      node.downloadUrl,
    ]
      .filter(Boolean)
      .join("|");

    if (!seen.has(key)) {
      seen.add(key);
      files.push({
        name: node.fileName || node.name || node.title || "Tệp đính kèm",
        section: section || path.join(" / "),
        raw: node,
      });
    }
  }

  const nextPath = node.chapterName || node.packName || node.name || node.title;
  const childPath = nextPath ? [...path, String(nextPath)] : path;

  for (const [field, value] of Object.entries(node)) {
    if (field === "raw") {
      continue;
    }
    if (value && typeof value === "object") {
      collectFiles(value, section, childPath, files, seen);
    }
  }

  return files;
}

function toPublicFile(config, file) {
  const url = buildFileDownloadUrl(config, file.raw);
  return {
    name: file.name,
    section: file.section,
    url,
  };
}

async function tryPortal(config, servicePath, body) {
  try {
    const data = await postPortalService(config, servicePath, body, {
      allowHtml: true,
    });
    return data;
  } catch {
    return null;
  }
}

async function refreshTenderRaw(config, tender) {
  const notifyNo = tender.notifyNo || tender.raw?.notifyNo;
  if (!notifyNo) {
    return tender.raw || {};
  }

  try {
    const results = await searchByIndex(config, {
      index: "es-contractor-selection",
      keyword: notifyNo,
      matchFields: ["notifyNo"],
      filters: [
        {
          fieldName: "type",
          searchType: "in",
          fieldValues: ["es-notify-contractor"],
        },
      ],
      pageSize: 1,
    });

    return results[0] || tender.raw || {};
  } catch {
    return tender.raw || {};
  }
}

async function fetchPlanRecord(config, planNo) {
  if (!planNo) {
    return null;
  }

  const results = await searchByIndex(config, {
    index: "es-contractor-selection",
    keyword: planNo,
    matchFields: ["planNo"],
    filters: [
      {
        fieldName: "type",
        searchType: "in",
        fieldValues: ["es-plan-project-p"],
      },
    ],
    pageSize: 1,
  });

  return results[0] || null;
}

async function fetchPlanDocuments(config, tender, planRecord) {
  const context = buildPortalContext(tender);
  const planNo = planRecord?.planNo || context.planNo;
  if (!planNo) {
    return { plan: null, files: [], zipUrl: "" };
  }

  const planBody = {
    planNo,
    planType: planRecord?.planType || context.planType || "",
    id: planRecord?.id || planRecord?.planId || "",
    type: planRecord?.type || "es-plan-project-p",
    stepCode: planRecord?.stepCode || "plan-project-step-1-khlcnt",
  };

  const responses = await Promise.all([
    tryPortal(config, "get/bido-plan-project-out", planBody),
    tryPortal(config, "get/bido-plan-project-out-file-list", planBody),
    tryPortal(config, "get/bido-plan-project-out-list", planBody),
  ]);

  const files = [];
  const seen = new Set();
  for (const response of responses) {
    collectFiles(response, "KHLCNT", ["Kế hoạch LCNT"], files, seen);
  }

  return {
    plan: planRecord,
    planName: firstValue(planRecord?.bidName) || planRecord?.pname || planRecord?.name || "",
    investorName: planRecord?.investorName || "",
    investTotal: planRecord?.investTotal || firstValue(planRecord?.bidPrice) || "",
    decisionDate: planRecord?.decisionDate || planRecord?.publicDate || "",
    files: files.map((file) => toPublicFile(config, file)).filter((file) => file.url),
    zipUrl: "",
    planUrl: buildPlanUrl(tender.raw || {}, planRecord || { planNo }),
    searchUrl: buildPlanSearchUrl(planNo),
  };
}

async function fetchHsmtDocuments(config, tender, raw) {
  const context = buildPortalContext({ ...tender, raw });
  const baseBody = {
    ...context,
    packType: 0,
  };

  const responses = await Promise.all([
    tryPortal(config, "get/bido-invitation-out", baseBody),
    tryPortal(config, "get/bido-invitation-out-list", baseBody),
    tryPortal(config, "get/bido-invitation-out-file-list", baseBody),
    tryPortal(config, "get/bido-bid-file-list", { ...baseBody, packType: 0 }),
    tryPortal(config, "get/bido-bid-file-list", { ...baseBody, packType: 1 }),
    tryPortal(config, "get/bido-bid-file-list", {
      notifyId: context.notifyId,
      bidId: context.bidId,
      notifyVersion: context.notifyVersion,
    }),
  ]);

  const attachments = [];
  const webforms = [];
  const chapters = [];
  const seenAttach = new Set();
  const seenWebform = new Set();

  for (const [index, response] of responses.entries()) {
    const isWebform = index >= 4;
    const bucket = isWebform ? webforms : attachments;
    const seen = isWebform ? seenWebform : seenAttach;
    const section = isWebform ? "Biểu mẫu webform" : "File đính kèm";
    collectFiles(response, section, ["Hồ sơ mời thầu"], bucket, seen);

    if (response && typeof response === "object" && !Array.isArray(response)) {
      for (const [key, value] of Object.entries(response)) {
        if (!/chapter|pack|list|tree/i.test(key)) {
          continue;
        }
        if (Array.isArray(value)) {
          for (const item of value) {
            chapters.push({
              title:
                item.chapterName ||
                item.packName ||
                item.name ||
                item.title ||
                key,
              files: collectFiles(item, section, [], [], new Set())
                .map((file) => toPublicFile(config, file))
                .filter((file) => file.url),
            });
          }
        }
      }
    }
  }

  const zipCandidates = await Promise.all([
    tryPortal(config, "get/bido-bid-file-download-all", baseBody),
    tryPortal(config, "get/bido-bid-file-zip", baseBody),
    tryPortal(config, "get/bido-invitation-out-file-zip", baseBody),
  ]);

  let zipUrl = "";
  for (const candidate of zipCandidates) {
    const url =
      candidate?.url ||
      candidate?.downloadUrl ||
      buildFileDownloadUrl(config, candidate || {});
    if (url) {
      zipUrl = url;
      break;
    }
  }

  return {
    attachments: attachments
      .map((file) => toPublicFile(config, file))
      .filter((file) => file.url),
    webforms: webforms
      .map((file) => toPublicFile(config, file))
      .filter((file) => file.url),
    chapters: chapters.filter((chapter) => chapter.files.length > 0),
    zipUrl,
    detailUrl: buildDetailUrl(raw),
  };
}

export async function fetchTenderDocuments(config, tender) {
  const raw = await refreshTenderRaw(config, tender);
  const mergedTender = { ...tender, raw };

  const [planResult, hsmtResult] = await Promise.all([
    fetchPlanDocuments(
      config,
      mergedTender,
      await fetchPlanRecord(config, mergedTender.planNo || raw.planNo),
    ),
    fetchHsmtDocuments(config, mergedTender, raw),
  ]);

  return {
    notifyNo: mergedTender.notifyNo,
    planNo: mergedTender.planNo || raw.planNo || "",
    detailUrl: buildDetailUrl(raw),
    planUrl: planResult.planUrl || buildPlanUrl(raw, planResult.plan),
    planSearchUrl: planResult.searchUrl || buildPlanSearchUrl(mergedTender.planNo || ""),
    khlcnt: {
      planNo: planResult.plan?.planNo || mergedTender.planNo || "",
      planName: planResult.planName || "",
      investorName: planResult.investorName || mergedTender.investorName || "",
      investTotal: planResult.investTotal || "",
      investTotalLabel: formatMoney(planResult.investTotal || firstValue(planResult.plan?.bidPrice)),
      decisionDate: planResult.decisionDate || "",
      files: planResult.files,
      planUrl: planResult.planUrl,
      searchUrl: planResult.searchUrl,
    },
    hsmt: {
      attachments: hsmtResult.attachments,
      webforms: hsmtResult.webforms,
      chapters: hsmtResult.chapters,
      zipUrl: hsmtResult.zipUrl,
      detailUrl: hsmtResult.detailUrl,
    },
  };
}
