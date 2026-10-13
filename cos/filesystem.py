"""Local path selection: directory metadata only, with no file reads or writes."""
import os
from pathlib import Path

from .safety import Invalid, bounded_text, local_reference, working_directory


LIST_LIMIT = 300


def browse_paths(mode="directory", path="", root="", query="", show_hidden=False, protected=()):
    if mode not in ("directory", "references"):
        raise Invalid("Unknown path picker mode")
    query = bounded_text(query, "folder search", 200, False).casefold()
    if not isinstance(show_hidden, bool):
        raise Invalid("Invalid hidden-file option")
    base = Path(working_directory(root, protected)) if mode == "references" else None
    value = bounded_text(path or str(base or Path.home()), "folder path", 1000)
    if value.startswith(("\\\\", "//")) or (os.name == "nt" and value.startswith("\\")):
        raise Invalid("Network and device paths are not supported")
    folder = Path(value).expanduser()
    if not folder.is_absolute():
        raise Invalid("Use an absolute local folder path")
    if base:
        try:
            relative = folder.relative_to(base).as_posix()
        except ValueError:
            raise Invalid("Choose references inside the working directory")
        if relative != ".":
            local_reference(base, relative)
    folder = folder.resolve(strict=True)
    if not folder.is_dir():
        raise Invalid("Choose a directory to browse")
    reason = ""
    if mode == "directory":
        try:
            working_directory(str(folder), protected)
        except Invalid as error:
            reason = str(error)
    entries, truncated = [], False
    with os.scandir(folder) as scan:
        for entry in scan:
            if (not show_hidden and entry.name.startswith(".")) or query not in entry.name.casefold():
                continue
            try:
                link = entry.is_symlink()
                directory = entry.is_dir(follow_symlinks=mode == "directory")
                file = entry.is_file(follow_symlinks=False)
                if mode == "directory" and not directory:
                    continue
                if not (directory or file or link):
                    continue
                if len(entries) == LIST_LIMIT:
                    truncated = True
                    break
                target = folder / entry.name
                relative = target.relative_to(base).as_posix() if base else ""
                unavailable = "Symbolic links cannot be selected" if link and base else ""
                if base and not unavailable:
                    try:
                        local_reference(base, relative)
                    except (Invalid, OSError) as error:
                        unavailable = str(error)
                entries.append({"name": entry.name, "path": str(target), "relative": relative,
                                "kind": "directory" if directory else "link" if link else "file",
                                "selectable": not unavailable, "reason": unavailable})
            except OSError:
                # A disappearing or unreadable entry does not break navigation.
                continue
    entries.sort(key=lambda item: (item["kind"] != "directory", item["name"].casefold()))
    parent = None if folder == (base or Path(folder.anchor)) else str(folder.parent)
    return {"path": str(folder), "root": str(base) if base else "", "parent": parent,
            "home": str(base or Path.home()), "entries": entries, "truncated": truncated,
            "selectable": not reason if mode == "directory" else folder != base, "reason": reason}
