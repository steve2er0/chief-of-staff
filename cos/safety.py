import hashlib
import io
import os
from pathlib import Path, PureWindowsPath
import zipfile
import xml.etree.ElementTree as ET


class Invalid(ValueError):
    pass


def digest(data):
    return hashlib.sha256(data).hexdigest()


def bounded_text(value, name="text", maximum=30000, required=True):
    if not isinstance(value, str) or len(value) > maximum or "\x00" in value:
        raise Invalid("Invalid " + name)
    value = value.strip()
    if required and not value:
        raise Invalid(name + " is required")
    return value


def overlaps(a, b):
    a, b = os.path.normcase(str(Path(a).resolve())), os.path.normcase(str(Path(b).resolve()))
    try:
        return os.path.commonpath([a, b]) in (a, b)
    except ValueError:
        return False


def working_directory(value, protected=()):
    value = bounded_text(value, "working directory", 1000)
    if value.startswith(("\\\\", "//")) or (os.name == "nt" and value.startswith("\\")):
        raise Invalid("Network and device paths are not supported")
    p = Path(value).expanduser()
    if not p.is_absolute():
        raise Invalid("Use an absolute local working directory")
    p = p.resolve(strict=True)
    if not p.is_dir() or p == Path(p.anchor) or p == Path.home().resolve():
        raise Invalid("Select a project folder, not a filesystem root or home folder")
    if any(overlaps(p, x) for x in protected):
        raise Invalid("Working directory overlaps protected app storage or source")
    return str(p)


def local_file(root, relative, must_exist=True):
    relative = bounded_text(relative, "relative file path", 1000)
    # Treat both separator styles as traversal, on every platform.
    w = PureWindowsPath(relative)
    parts = relative.replace("\\", "/").split("/")
    if w.drive or w.is_absolute() or relative.startswith("/") or any(x in ("", ".", "..") for x in parts) or ":" in relative:
        raise Invalid("File references must be simple relative paths inside the project")
    base = Path(root).resolve()
    current = base
    for part in parts:
        current = current / part
        if current.is_symlink():
            raise Invalid("Symbolic links are not permitted for file references or outputs")
    p = current.resolve()
    try:
        p.relative_to(base)
    except ValueError:
        raise Invalid("Path escapes the project")
    if p == base:
        raise Invalid("Path escapes the project")
    if must_exist and not p.is_file():
        raise Invalid("Referenced artifact is missing: " + relative)
    if must_exist and p.stat().st_size > 8 * 1024 * 1024:
        raise Invalid("Artifact exceeds the 8 MiB limit")
    return p


def local_reference(root, relative):
    """A reference may name a file or folder; outputs must still be files."""
    p = local_file(root, relative, must_exist=False)
    if p.is_dir():
        return p
    return local_file(root, relative)


def docx_text(data, filename):
    if not filename.lower().endswith(".docx") or len(data) > 8 * 1024 * 1024:
        raise Invalid("Choose a .docx file smaller than 8 MiB")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            infos = z.infolist()
            if len(infos) > 2000 or sum(x.file_size for x in infos) > 32 * 1024 * 1024:
                raise Invalid("DOCX archive is too large")
            names = [x.filename for x in infos]
            if len(names) != len(set(names)):
                raise Invalid("Duplicate DOCX archive entries")
            if any(x.flag_bits & 1 for x in infos):
                raise Invalid("Encrypted DOCX is unsupported")
            if "word/document.xml" not in names:
                raise Invalid("No Word document body found")
            info = z.getinfo("word/document.xml")
            if info.file_size > 2 * 1024 * 1024:
                raise Invalid("Word body is too large")
            xml = z.read(info)
        # Reject UTF-16/32 before parsing, so null-interleaved declarations
        # cannot bypass the byte-level entity/DOCTYPE guard.
        if b"\x00" in xml:
            raise Invalid("Only UTF-8 compatible Word body XML is supported")
        if b"<!DOCTYPE" in xml.upper() or b"<!ENTITY" in xml.upper():
            raise Invalid("XML declarations and entities are not permitted")
        root = ET.fromstring(xml)
        ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
        paragraphs = ["".join(n.text or "" for n in p.iter(ns + "t"))
                      for p in root.iter(ns + "p")]
        return bounded_text("\n".join(paragraphs), "Word text", 30000), digest(data)
    except (zipfile.BadZipFile, ET.ParseError, RuntimeError, KeyError) as e:
        raise Invalid("Cannot read this DOCX: " + str(e)) from e
