"""Create a transfer archive from a narrow source allowlist, not the workspace."""
import hashlib
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent
files = [root / name for name in ("app.py", "README.md", "package_source.py", ".gitignore")]
for folder, suffixes in (("cos", {".py"}), ("static", {".html", ".css", ".js"}),
                         ("tests", {".py"}), ("docs", {".md"})):
    files += [p for p in (root / folder).rglob("*") if p.is_file() and p.suffix in suffixes and "__pycache__" not in p.parts]
archive = root.parent / "chief-of-staff-source.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for path in sorted(files):
        if path.is_symlink():
            raise ValueError("Refusing source symlink: " + str(path))
        z.write(path, "chief-of-staff/" + str(path.relative_to(root)).replace("\\", "/"))
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert all(not any(x in name.split("/") for x in ("runtime", "qa-runtime", "preflight-runtime", "node_modules", ".git", ".codex", ".aws", "qa-fixtures", "__pycache__", ".relocation", "evidence")) for name in z.namelist())
sha = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix(".zip.sha256").write_text(sha + "  " + archive.name + "\n", encoding="utf-8")
print(str(archive))
print("Files:", len(files), "Bytes:", archive.stat().st_size, "SHA256:", sha)
