"""Private, task-scoped artifact access and explicit desktop file selection."""
from pathlib import Path
import re
import subprocess
import sys

from .safety import Invalid, local_file


PREVIEW_LIMIT = 20 * 1024 * 1024


def referenced_paths(text):
    """Only explicit Markdown links and inline file references are candidates."""
    if not isinstance(text, str):
        return []
    return re.findall(r"\[[^\]\n]*\]\(<?([^\n)>]+)>?\)", text) + re.findall(r"`([^`\n]+)`", text)


def relative_reference(cwd, value):
    if not isinstance(value, str):
        raise Invalid("Invalid artifact path")
    value = re.sub(r":\d+(?::\d+)?$", "", value.strip())
    base = Path(cwd)
    if base.absolute() != base.resolve():
        raise Invalid("The agent's working directory now contains a symbolic link")
    # local_file rejects network paths, drives, traversal and every symlink.
    path = Path(value)
    if path.is_absolute():
        try:
            value = path.relative_to(base).as_posix()
        except ValueError:
            raise Invalid("Artifact is outside this agent's working directory")
    local_file(cwd, value, must_exist=False, max_bytes=None)
    return value.replace("\\", "/")


def image_type(path):
    """Serve only inert raster formats, identified by bytes rather than a name."""
    if path.stat().st_size > PREVIEW_LIMIT:
        raise Invalid("Image exceeds the 20 MiB inline preview limit; download it to view")
    with path.open("rb") as stream:
        header = stream.read(32)
    if header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if header.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if header.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if header.startswith(b"RIFF") and header[8:12] == b"WEBP":
        return "image/webp"
    raise Invalid("This file has no supported raster image preview; download it to view")


def reveal_file(path, platform=None, runner=None):
    """Select a known file on the app host; never execute a file or use a shell."""
    platform = platform or sys.platform
    runner = runner or subprocess.Popen
    if platform == "darwin":
        command = ["/usr/bin/open", "-R", str(path)]
    elif platform == "win32":
        command = ["explorer.exe", "/select," + str(path)]
    else:
        return {"revealed": False, "reason": "Folder selection is unavailable on this app host. Use the file download instead."}
    try:
        runner(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
               stderr=subprocess.DEVNULL, shell=False)
    except OSError:
        return {"revealed": False, "reason": "The app host could not open its file manager. Use the file download instead."}
    return {"revealed": True, "platform": platform}


class ArtifactMixin:
    def _artifact_references(self, task):
        refs = set()
        texts = [m.get("text", "") for m in task.get("conversation", []) if m.get("role") != "user"]
        result = task.get("result") or {}
        texts.extend([result.get("summary", ""), result.get("agent_report", ""), task.get("latest_update", "")])
        candidates = list(result.get("artifacts", [])) if isinstance(result.get("artifacts"), list) else []
        candidates += [link.get("source_path") for link in task.get("output_links", [])]
        for text in texts:
            candidates.extend(referenced_paths(text))
        for value in candidates:
            try:
                refs.add(relative_reference(task["context"]["cwd"], value))
            except (Invalid, OSError, ValueError):
                continue
        return refs

    def artifact(self, tid, relative):
        """A message may expose only its own explicitly referenced project files."""
        task = self.store.get("task", tid)
        if not isinstance(relative, str) or relative not in self._artifact_references(task):
            raise Invalid("Unknown agent artifact")
        return local_file(task["context"]["cwd"], relative, max_bytes=None)

    def reveal_artifact(self, tid, name=None, relative=None):
        task = self.store.get("task", tid)
        location = "project"
        if name is not None:
            link = next((link for link in task.get("output_links", []) if link.get("name") == name), None)
            if not link:
                raise Invalid("Unknown task output")
            path = None
            if link.get("source_path"):
                try:
                    cwd = task["context"]["cwd"]
                    relative = relative_reference(cwd, link["source_path"])
                    path = local_file(cwd, relative, max_bytes=None)
                except (Invalid, OSError):
                    pass
            if path is None:
                path = self.output(tid, name)
                location = "saved snapshot"
        elif relative is not None:
            path = self.artifact(tid, relative)
        else:
            raise Invalid("Choose a generated file")
        return dict(reveal_file(path), location=location, scope="app_host")
