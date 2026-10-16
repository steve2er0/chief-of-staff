"""Private, task-scoped artifact access and explicit desktop file selection."""
from pathlib import Path
import re
import subprocess
import sys

from .safety import Invalid, bounded_text, local_file


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
        raise Invalid("Image exceeds the 20 MiB inline preview limit; use Show in folder to view it locally")
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
    raise Invalid("This file has no supported raster image preview; use Show in folder to view it locally")


def normalized_reference(value):
    value = re.sub(r":\d+(?::\d+)?$", "", bounded_text(value, "artifact reference", 1000).strip()).replace("\\", "/")
    return value.rstrip("/") or "/"


def reveal_reference(task, value):
    """Resolve only the run folder or its explicitly captured original checkout.

    Relative child paths always belong to the run folder. An original checkout
    must be named explicitly (absolute path or its exact, unambiguous basename).
    No parent search, sibling search or current project-settings fallback occurs.
    """
    value = normalized_reference(value)
    roots = [(Path(task["context"]["cwd"]), "project")]
    worktree = task.get("worktree") or {}
    source = worktree.get("source_cwd") or worktree.get("source")
    if source and Path(source) != roots[0][0]:
        roots.append((Path(source), "original project folder"))
    if value.startswith("//"):
        raise Invalid("Network and device paths are not supported")
    path = Path(value)
    if path.is_absolute():
        selected = next(((root, label, path.relative_to(root).as_posix()) for root, label in roots
                         if path == root or root in path.parents), None)
        if selected is None:
            raise Invalid("Artifact is outside this run's recorded folders")
    else:
        aliases = [(root, label, ".") for root, label in roots if "/" not in value and Path(value) == Path(root.name)]
        if len(aliases) > 1:
            raise Invalid("This folder name is ambiguous; use its recorded absolute path")
        selected = aliases[0] if aliases else (roots[0][0], roots[0][1], value)
    root, label, relative = selected
    if (not root.is_absolute() or root == Path(root.anchor) or str(root).startswith(("//", "\\\\")) or
            root.absolute() != root.resolve()):
        raise Invalid("The recorded folder is invalid or now contains a symbolic link")
    if not root.is_dir():
        raise Invalid("The recorded project folder is missing")
    target = root if relative == "." else local_file(root, relative, must_exist=False, max_bytes=None)
    if not target.is_file() and not target.is_dir():
        raise Invalid("Referenced artifact is missing: " + value)
    return target, label


def reveal_file(path, platform=None, runner=None):
    """Select a known file on the app host; never execute a file or use a shell."""
    platform = platform or sys.platform
    runner = runner or subprocess.Popen
    if platform == "darwin":
        command = ["/usr/bin/open", str(path)] if path.is_dir() else ["/usr/bin/open", "-R", str(path)]
    elif platform == "win32":
        command = ["explorer.exe", str(path)] if path.is_dir() else ["explorer.exe", "/select," + str(path)]
    else:
        return {"revealed": False, "reason": "Folder selection is unavailable on this app host. Copy the verified host path to open it locally."}
    try:
        runner(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
               stderr=subprocess.DEVNULL, shell=False)
    except OSError:
        return {"revealed": False, "reason": "The app host could not open its file manager. Copy the verified host path to open it locally."}
    return {"revealed": True, "platform": platform}


class ArtifactMixin:
    def _artifact_candidates(self, task):
        texts = [m.get("text", "") for m in task.get("conversation", []) if m.get("role") != "user"]
        result = task.get("result") or {}
        texts.extend([result.get("summary", ""), result.get("agent_report", ""), task.get("latest_update", "")])
        candidates = list(result.get("artifacts", [])) if isinstance(result.get("artifacts"), list) else []
        candidates += [link.get("source_path") for link in task.get("output_links", [])]
        for text in texts:
            candidates.extend(referenced_paths(text))
        return candidates

    def _artifact_references(self, task):
        refs = set()
        for value in self._artifact_candidates(task):
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
                    path, location = reveal_reference(task, link["source_path"])
                except (Invalid, OSError):
                    pass
            if path is None:
                path = self.output(tid, name)
                location = "saved snapshot"
        elif relative is not None:
            reference = normalized_reference(relative)
            permitted = set()
            for value in self._artifact_candidates(task):
                try:
                    permitted.add(normalized_reference(value))
                    permitted.add(relative_reference(task["context"]["cwd"], value))
                except (Invalid, OSError, ValueError):
                    continue
            if reference not in permitted:
                raise Invalid("Unknown agent artifact")
            path, location = reveal_reference(task, reference)
        else:
            raise Invalid("Choose a generated file")
        return dict(reveal_file(path), location=location, scope="app_host", path=str(path),
                    kind="directory" if path.is_dir() else "file")
