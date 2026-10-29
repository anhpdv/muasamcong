import json
import sys

try:
    import pymupdf as fitz
except Exception:
    import fitz

payload = json.load(sys.stdin)
results = []

for item in payload.get("files", []):
    path = item.get("path")
    chapter = item.get("chapter") or ""
    name = item.get("name") or ""
    entry = {
        "chapter": chapter,
        "name": name,
        "path": path,
        "pages": 0,
        "chars": 0,
        "text": "",
        "error": None,
        "isScanLikely": False,
    }
    try:
        doc = fitz.open(path)
        entry["pages"] = doc.page_count
        parts = []
        images = 0
        for page in doc:
            parts.append(page.get_text("text") or "")
            images += len(page.get_images())
        text = "\n".join(parts).strip()
        entry["text"] = text
        entry["chars"] = len(text)
        entry["isScanLikely"] = entry["chars"] < 80 and images > 0
        doc.close()
    except Exception as exc:
        entry["error"] = str(exc)
    results.append(entry)

print(json.dumps({"ok": True, "files": results}, ensure_ascii=False))
