import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_PROFILE = {
  companyName: "Hải Nam",
  rawText: "",
  notes: "",
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

function buildRawText(documents = []) {
  return documents
    .map((doc, index) => {
      const title = doc.title || doc.fileName || `Mục ${index + 1}`;
      const source = doc.source || "manual";
      const stamp = doc.updatedAt || doc.createdAt || "";
      return `##### ${title}\n(Nguồn: ${source}${stamp ? ` · ${stamp}` : ""})\n\n${String(doc.content || "").trim()}`;
    })
    .filter((block) => block.trim())
    .join("\n\n==========\n\n");
}

function normalizeDocuments(profile) {
  if (Array.isArray(profile.documents) && profile.documents.length) {
    return profile.documents
      .map((doc) => ({
        id: doc.id || newId(),
        title: doc.title || doc.fileName || "Năng lực",
        fileName: doc.fileName || "",
        source: doc.source || "manual",
        content: String(doc.content || ""),
        chars: String(doc.content || "").length,
        createdAt: doc.createdAt || new Date().toISOString(),
        updatedAt: doc.updatedAt || doc.createdAt || new Date().toISOString(),
      }))
      .filter((doc) => doc.content.trim());
  }

  // tương thích dữ liệu cũ: 1 khối rawText
  const legacy = String(profile.rawText || "").trim();
  if (!legacy) {
    return [];
  }
  return [
    {
      id: newId(),
      title: "Năng lực (dữ liệu cũ)",
      fileName: "",
      source: "legacy",
      content: legacy,
      chars: legacy.length,
      createdAt: profile.updatedAt || new Date().toISOString(),
      updatedAt: profile.updatedAt || new Date().toISOString(),
    },
  ];
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
      return { ...DEFAULT_PROFILE };
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
 * mode: append (mặc định) | replace
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
    incomingDocs.push({
      id: newId(),
      title:
        chunk.title ||
        chunk.fileName ||
        title ||
        fileName ||
        `Năng lực ${now.slice(0, 16).replace("T", " ")}`,
      fileName: chunk.fileName || fileName || "",
      source: chunk.fileName || fileName ? "import" : "paste",
      content,
      chars: content.length,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (!incomingDocs.length) {
    throw new Error("Nội dung import trống");
  }

  const documents =
    mode === "replace" ? incomingDocs : [...(current.documents || []), ...incomingDocs];

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
  const documents = (current.documents || []).filter((doc) => doc.id !== documentId);
  return saveHainamProfile(paths, {
    ...current,
    documents,
    updatedBy: user?.username || current.updatedBy || null,
  });
}

/** Toàn bộ năng lực ghép từ mọi mục — dùng cho AI đánh giá. */
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
  return {
    companyName: profile?.companyName || "Hải Nam",
    notes: profile?.notes || "",
    rawText: text,
    documents: documents.map((doc) => ({
      id: doc.id,
      title: doc.title,
      fileName: doc.fileName,
      source: doc.source,
      chars: doc.chars,
      preview: doc.content.slice(0, 160),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    })),
    documentCount: documents.length,
    charCount: text.length,
    hasData: documents.length > 0,
    updatedAt: profile?.updatedAt || null,
    updatedBy: profile?.updatedBy || null,
    imports: profile?.imports || [],
  };
}
