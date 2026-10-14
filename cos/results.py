"""Preserve reports and stream valid artifacts; incomplete capture is a handoff."""
import hashlib
import json
from pathlib import Path
import shutil

from .safety import Invalid, local_file


def file_digest(path):
    sha = hashlib.sha256()
    with Path(path).open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            sha.update(chunk)
    return sha.hexdigest()


def capture_result(folder, cwd, result, expected_outputs, baseline, write_task, on_capture=None):
    folder = Path(folder)
    folder.mkdir(exist_ok=True)
    links, issues = [], list(result.get("handoff_issues", []))
    complete = result["status"] == "completed"
    raw = result.get("agent_report")
    supplied = isinstance(raw, str) and bool(raw.strip())
    if not supplied:
        raw = json.dumps(result, indent=2, ensure_ascii=False)
    report = folder / "agent-report.txt"
    report_link = None
    try:
        report.write_text(raw, encoding="utf-8")
        report_link = {"name": report.name, "label": "Original agent report" if supplied else "Saved execution handoff", "sha256": file_digest(report)}
        if on_capture:
            on_capture(report_link)
    except OSError as error:
        issues.append("Could not save the report download: " + str(error) + ". Its text is retained in the task record. Restore writable snapshot storage and recapture it.")

    listed = result.get("artifacts", [])
    if not isinstance(listed, list):
        issues.append("The artifacts field must contain a list of relative file paths. Correct the report; its text was preserved.")
        listed = []
    refs, declared = set(), set()
    for index, ref in enumerate(listed):
        if not isinstance(ref, str) or not ref.strip():
            issues.append("Artifact entry " + str(index + 1) + " is not a non-empty file path. Replace it with a relative file path.")
        else:
            refs.add(ref)
            declared.add(ref)
    refs.update(expected_outputs)
    changed = False
    for index, ref in enumerate(sorted(refs)):
        target = folder / ("artifact-%02d.txt" % index)
        try:
            # A trailing slash commonly denotes an accidentally listed folder.
            # Validate the remaining path normally before identifying that issue.
            path_ref = ref.rstrip("/\\") if ref.endswith(("/", "\\")) else ref
            source = local_file(cwd, path_ref, False, max_bytes=None)
            if not complete and ref not in declared and not source.is_file():
                continue  # Unproduced planned outputs are expected in a partial run.
            source = local_file(cwd, path_ref, max_bytes=None)
            before = source.stat()
            size = before.st_size
            available = shutil.disk_usage(folder).free
            if size + 5 * 1024 * 1024 > available:
                raise Invalid("Not enough snapshot disk space: file is " + str(size) + " bytes; " + str(available) + " bytes free. Free disk space and recapture it")
            sha = hashlib.sha256()
            with source.open("rb") as src, target.open("wb") as dst:
                for chunk in iter(lambda: src.read(1024 * 1024), b""):
                    dst.write(chunk)
                    sha.update(chunk)
            after = source.stat()
            if target.stat().st_size != size or (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                raise Invalid("File changed during capture. Recapture after the file stops changing")
            digest = sha.hexdigest()
            changed = changed or (ref in expected_outputs and baseline.get(ref) != digest)
            link = {"name": target.name, "label": ref, "sha256": digest,
                    "source_path": ref, "bytes": size, "partial": not complete}
            links.append(link)
            if on_capture:
                on_capture(link)
        except (Invalid, OSError, ValueError) as error:
            try:
                target.unlink(missing_ok=True)
            except OSError:
                pass  # An incomplete copy is never linked or accepted.
            message = "Could not capture " + ref + ": " + str(error)
            if "directory" in str(error).lower():
                message += ". List the individual files in that directory instead."
            elif "missing" in str(error).lower():
                message += ". Restore the required file or correct its reported path."
            else:
                message += ". Correct this entry or recapture the file; other valid snapshots are retained."
            issues.append(message)
    if complete and write_task and not any(link.get("source_path") for link in links):
        issues.append("No project files could be captured for this editable assignment. Supply the deliverables or correct their paths before review.")
    notes = []
    if expected_outputs and complete and write_task and not changed and any(link.get("source_path") for link in links):
        notes.append("The expected files were unchanged during this run. Existing files were captured; assess the reported checks and assignment criteria during review.")
    return links + ([report_link] if report_link else []), issues, notes
