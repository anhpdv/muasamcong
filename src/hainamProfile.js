import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/** Năng lực mặc định — luôn giữ lại; file/text thêm vào vẫn được AI đọc cùng. */
export const DEFAULT_CAPABILITY_DOC = {
  id: "hainam-default-capability",
  title: "Năng lực mặc định · Công nghệ & hàng hóa thiết bị",
  fileName: "",
  source: "default",
  isDefault: true,
  content: `Công ty Hải Nam là đơn vị công nghệ, hoạt động trong lĩnh vực cung cấp hàng hóa và thiết bị công nghệ thông tin, điện tử, viễn thông và thiết bị kỹ thuật liên quan.

Phạm vi nhận thầu mặc định:
- Gói thầu công nghệ, CNTT, phần mềm, hạ tầng số, tích hợp hệ thống
- Cung cấp hàng hóa thiết bị: máy tính, máy chủ, thiết bị mạng, camera, thiết bị điện tử, thiết bị văn phòng công nghệ
- Cung cấp thiết bị kỹ thuật / hàng hóa có gắn công nghệ, lắp đặt và bàn giao kèm theo nếu gói yêu cầu

Định hướng đánh giá:
- Ưu tiên các gói thuộc lĩnh vực công nghệ và cung cấp thiết bị/hàng hóa
- Có thể xem xét gói hỗn hợp nếu phần lõi là thiết bị công nghệ hoặc hàng hóa kỹ thuật
- Chưa nhận các gói thuần xây lắp / tư vấn chuyên sâu ngoài năng lực công nghệ-thiết bị (trừ khi có dữ liệu bổ sung)

Ghi chú: Đây là năng lực MẶC ĐỊNH. Khi import/thêm file vào kho, AI đánh giá thầu phải đọc TOÀN BỘ (mặc định + mọi mục đã thêm).`,
  createdAt: "2026-10-30T09:30:00.000Z",
  updatedAt: "2026-10-30T09:30:00.000Z",
};

const DEFAULT_PROFILE = {
  companyName: "Hải Nam",
  rawText: "",
  notes:
    "Có năng lực mặc định (công nghệ & hàng hóa thiết bị). Thêm file/text vào kho — AI đọc toàn bộ khi đánh giá.",
  documents: [],
  imports: [],
  updatedAt: null,
  updatedBy: null,
};

function profilePath(paths) {
  return path.join(paths.dataDir, "hainam-profile.json");
}

function newId() {
  return crypto.randomUUID();
}

function withDocMeta(doc) {
  const content = String(doc.content || "");
  return {
    id: doc.id || newId(),
    title: doc.title || doc.fileName || "Năng lực",
    fileName: doc.fileName || "",
    source: doc.isDefault ? "default" : doc.source || "manual",
    isDefault: Boolean(doc.isDefault),
    content,
    chars: content.length,
    createdAt: doc.createdAt || new Date().toISOString(),
    updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
  };
}

function buildRawText(documents = []) {
  return documents
    .map((doc, index) => {
      const title = doc.title || doc.fileName || `Mục ${index + 1}`;
      const kind = doc.isDefault ? "MẶC ĐỊNH" : doc.source || "manual";
      const stamp = doc.updatedAt || doc.createdAt || "";
      return `##### ${title}\n(Loại: ${kind}${stamp ? ` · ${stamp}` : ""})\n\n${String(doc.content || "").trim()}`;
    })
    .filter((block) => block.trim())
    .join("\n\n==========\n\n");
}

function normalizeDocuments(profile) {
  let documents = [];

  if (Array.isArray(profile.documents) && profile.documents.length) {
    documents = profile.documents
      .map((doc) =>
        withDocMeta({
          ...doc,
          isDefault:
            Boolean(doc.isDefault) ||
            doc.id === DEFAULT_CAPABILITY_DOC.id ||
            doc.source === "default" ||
            doc.source === "seed",
        }),
      )
      .filter((doc) => doc.content.trim());
  } else {
    const legacy = String(profile.rawText || "").trim();
    if (legacy) {
      documents = [
        withDocMeta({
          id: newId(),
          title: "Năng lực (dữ liệu cũ)",
          source: "legacy",
          content: legacy,
          createdAt: profile.updatedAt || new Date().toISOString(),
        }),
      ];
    }
  }

  return ensureDefaultDocument(documents);
}

/** Luôn có đúng 1 mục mặc định ở đầu kho. */
function ensureDefaultDocument(documents = []) {
  const others = documents.filter(
    (doc) =>
      !doc.isDefault &&
      doc.id !== DEFAULT_CAPABILITY_DOC.id &&
      doc.source !== "default" &&
      doc.source !== "seed",
  );
  const existingDefault = documents.find(
    (doc) =>
      doc.isDefault ||
      doc.id === DEFAULT_CAPABILITY_DOC.id ||
      doc.source === "default" ||
      doc.source === "seed",
  );

  const defaultDoc = withDocMeta({
    ...DEFAULT_CAPABILITY_DOC,
    // giữ nội dung mặc định chuẩn; nếu user đã chỉnh default cũ thì ưu tiên bản chuẩn hệ thống
    content: DEFAULT_CAPABILITY_DOC.content,
    createdAt: existingDefault?.createdAt || DEFAULT_CAPABILITY_DOC.createdAt,
    updatedAt: DEFAULT_CAPABILITY_DOC.updatedAt,
  });

  return [defaultDoc, ...others];
}

export async function loadHainamProfile(paths) {
  try {
    const raw = JSON.parse(await fs.readFile(profilePath(paths), "utf8"));
    const documents = normalizeDocuments(raw);
    return {
      ...DEFAULT_PROFILE,
      ...raw,
      documents,
      rawText: buildRawText(documents),
      imports: Array.isArray(raw.imports) ? raw.imports : [],
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      const documents = ensureDefaultDocument([]);
      return {
        ...DEFAULT_PROFILE,
        documents,
        rawText: buildRawText(documents),
      };
    }
    throw error;
  }
}

export async function saveHainamProfile(paths, profile) {
  const documents = normalizeDocuments(profile);
  const next = {
    ...DEFAULT_PROFILE,
    ...profile,
    documents,
    rawText: buildRawText(documents),
    updatedAt: new Date().toISOString(),
  };
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.writeFile(profilePath(paths), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

/**
 * Thêm 1 hoặc nhiều mục năng lực (paste / import file).
 * mode append: thêm vào sau mặc định
 * mode replace: xóa các mục KHÔNG mặc định, giữ mặc định + thêm mới
 */
export async function importHainamProfile(
  paths,
  {
    text = "",
    texts = null,
    notes = "",
    companyName = "",
    fileName = "",
    title = "",
    mode = "append",
    user = null,
  } = {},
) {
  const current = await loadHainamProfile(paths);
  const chunks = Array.isArray(texts) && texts.length
    ? texts
    : [{ text, fileName, title }];

  const incomingDocs = [];
  for (const chunk of chunks) {
    const content = String(chunk.text || chunk.content || "").trim();
    if (!content) {
      continue;
    }
    const now = new Date().toISOString();
    incomingDocs.push(
      withDocMeta({
        id: newId(),
        title:
          chunk.title ||
          chunk.fileName ||
          title ||
          fileName ||
          `Năng lực ${now.slice(0, 16).replace("T", " ")}`,
        fileName: chunk.fileName || fileName || "",
        source: chunk.fileName || fileName ? "import" : "paste",
        isDefault: false,
        content,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  if (!incomingDocs.length) {
    throw new Error("Nội dung import trống");
  }

  const defaults = (current.documents || []).filter((doc) => doc.isDefault);
  const extras =
    mode === "replace"
      ? incomingDocs
      : [...(current.documents || []).filter((doc) => !doc.isDefault), ...incomingDocs];

  const documents = ensureDefaultDocument([...defaults, ...extras]);

  const imports = [
    ...(current.imports || []),
    ...incomingDocs.map((doc) => ({
      fileName: doc.fileName || doc.title,
      mode,
      chars: doc.chars,
      importedAt: doc.createdAt,
      importedBy: user?.username || null,
    })),
  ].slice(-100);

  return saveHainamProfile(paths, {
    ...current,
    companyName: companyName.trim() || current.companyName || "Hải Nam",
    notes: notes !== undefined && notes !== null ? String(notes) : current.notes,
    documents,
    imports,
    updatedBy: user?.username || current.updatedBy || null,
  });
}

export async function deleteHainamDocument(paths, documentId, user = null) {
  const current = await loadHainamProfile(paths);
  const target = (current.documents || []).find((doc) => doc.id === documentId);
  if (!target) {
    throw new Error("Không tìm thấy mục năng lực");
  }
  if (target.isDefault || target.id === DEFAULT_CAPABILITY_DOC.id) {
    throw new Error("Không thể xóa năng lực mặc định");
  }

  const documents = (current.documents || []).filter((doc) => doc.id !== documentId);
  return saveHainamProfile(paths, {
    ...current,
    documents,
    updatedBy: user?.username || current.updatedBy || null,
  });
}

/** Toàn bộ năng lực (mặc định + mọi mục thêm) — dùng cho AI đánh giá. */
export function getFullCapabilityText(profile) {
  const documents = normalizeDocuments(profile || {});
  if (!documents.length) {
    return "";
  }
  return buildRawText(documents);
}

export function profilePublicView(profile) {
  const documents = normalizeDocuments(profile || {});
  const text = buildRawText(documents);
  const extraCount = documents.filter((doc) => !doc.isDefault).length;
  return {
    companyName: profile?.companyName || "Hải Nam",
    notes: profile?.notes || "",
    rawText: text,
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      source: doc.source,
      isDefault: Boolean(doc.isDefault),
      chars: doc.chars,
      preview: doc.content.slice(0, 160),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })),
    documentCount: documents.length,
    extraCount,
    charCount: text.length,
    hasData: documents.length > 0,
    updatedAt: profile?.updatedAt || null,
    updatedBy: profile?.updatedBy || null,
    imports: profile?.imports || [],
  };
}
