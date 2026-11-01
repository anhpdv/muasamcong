import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

try:
    import pymupdf as fitz
except Exception:
    import fitz


def strip_xml_text(xml_bytes: bytes) -> str:
    try:
        root = ET.fromstring(xml_bytes)
    except Exception:
        return ""
    parts = []
    for node in root.iter():
        if node.text and node.text.strip():
            parts.append(node.text.strip())
        if node.tail and node.tail.strip():
            parts.append(node.tail.strip())
    return "\n".join(parts)


def extract_docx(path: str) -> str:
    with zipfile.ZipFile(path) as zf:
        names = [n for n in zf.namelist() if n.startswith("word/") and n.endswith(".xml")]
        prefer = ["word/document.xml"] + [n for n in names if n != "word/document.xml"]
        chunks = []
        for name in prefer:
            if name in zf.namelist():
                chunks.append(strip_xml_text(zf.read(name)))
        return "\n".join(c for c in chunks if c).strip()


def extract_xlsx(path: str) -> str:
    with zipfile.ZipFile(path) as zf:
        shared = []
        if "xl/sharedStrings.xml" in zf.namelist():
            shared_xml = zf.read("xl/sharedStrings.xml")
            root = ET.fromstring(shared_xml)
            ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            for si in root.findall(".//m:si", ns):
                texts = [t.text or "" for t in si.findall(".//m:t", ns)]
                shared.append("".join(texts).strip())
        chunks = []
        sheet_names = sorted(
            n for n in zf.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)
        )
        for sheet in sheet_names[:12]:
            root = ET.fromstring(zf.read(sheet))
            ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
            rows = []
            for row in root.findall(".//m:sheetData/m:row", ns):
                cells = []
                for cell in row.findall("m:c", ns):
                    cell_type = cell.attrib.get("t")
                    value_node = cell.find("m:v", ns)
                    if value_node is None or value_node.text is None:
                        continue
                    raw = value_node.text
                    if cell_type == "s":
                        try:
                            cells.append(shared[int(raw)])
                        except Exception:
                            cells.append(raw)
                    else:
                        cells.append(raw)
                if cells:
                    rows.append(" | ".join(cells))
            if rows:
                chunks.append(f"[{Path(sheet).name}]\n" + "\n".join(rows[:4000]))
        return "\n\n".join(chunks).strip()


def sniff_kind(path: str, name: str) -> str:
    lower = (name or path or "").lower()
    if lower.endswith(".pdf"):
        return "pdf"
    if lower.endswith(".docx"):
        return "docx"
    if lower.endswith(".xlsx"):
        return "xlsx"
    if lower.endswith((".txt", ".html", ".htm", ".md", ".csv", ".json")):
        return "text"
    try:
        with open(path, "rb") as fh:
            head = fh.read(8)
        if head.startswith(b"%PDF"):
            return "pdf"
        if head.startswith(b"PK"):
            # office zip
            with zipfile.ZipFile(path) as zf:
                names = set(zf.namelist())
                if "word/document.xml" in names:
                    return "docx"
                if any(n.startswith("xl/") for n in names):
                    return "xlsx"
    except Exception:
        pass
    return "unknown"


def extract_pdf(path: str):
    doc = fitz.open(path)
    parts = []
    images = 0
    for page in doc:
        parts.append(page.get_text("text") or "")
        images += len(page.get_images())
    text = "\n".join(parts).strip()
    entry = {
        "pages": doc.page_count,
        "text": text,
        "chars": len(text),
        "isScanLikely": len(text) < 80 and images > 0,
        "error": None,
    }
    doc.close()
    return entry


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
        "kind": "unknown",
    }
    try:
        kind = sniff_kind(path, name)
        entry["kind"] = kind
        if kind == "pdf":
            entry.update(extract_pdf(path))
        elif kind == "docx":
            text = extract_docx(path)
            entry["text"] = text
            entry["chars"] = len(text)
            entry["pages"] = 1
        elif kind == "xlsx":
            text = extract_xlsx(path)
            entry["text"] = text
            entry["chars"] = len(text)
            entry["pages"] = 1
        elif kind == "text":
            text = Path(path).read_text(encoding="utf-8", errors="ignore")
            entry["text"] = text
            entry["chars"] = len(text)
            entry["pages"] = 1
        else:
            entry["error"] = f"Định dạng chưa hỗ trợ trích text ({Path(path).suffix or 'no-ext'})"
    except Exception as exc:
        entry["error"] = str(exc)
    results.append(entry)

print(json.dumps({"ok": True, "files": results}, ensure_ascii=False))
