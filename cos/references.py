"""Browser-selected reference files kept as immutable local input snapshots."""
import copy
import re
import shutil
from pathlib import Path, PureWindowsPath

from .safety import Invalid, bounded_text, digest, local_file
from .store import now, uid


class ReferenceMixin:
    def import_reference(self, name, data):
        name = bounded_text(name, "reference file name", 255)
        if name in (".", "..") or Path(name).name != name or PureWindowsPath(name).name != name or any(ord(c) < 32 for c in name):
            raise Invalid("Choose a file name without directory components")
        if not isinstance(data, bytes) or len(data) > 8 * 1024 * 1024:
            raise Invalid("Choose reference files no larger than 8 MiB each")
        identity = uid()
        extension = Path(name).suffix
        stored_name = "source" + (extension if re.fullmatch(r"\.[A-Za-z0-9]{1,12}", extension) else ".bin")
        folder = self.data / "references" / identity
        folder.mkdir(parents=True)
        record = {"id": identity, "name": name, "size": len(data), "sha256": digest(data),
                  "stored_name": stored_name, "created": now(), "project_id": None,
                  "source": "Browser-selected file; original remains unchanged"}
        try:
            (folder / stored_name).write_bytes(data)
            self.store.put("reference", record)
        except BaseException:
            shutil.rmtree(folder)
            raise
        return self.reference_metadata(record)

    @staticmethod
    def reference_metadata(record):
        return {k: record[k] for k in ("id", "name", "size", "sha256")}

    def reference_file(self, identity):
        record = self.store.get("reference", identity)
        path = local_file(self.data / "references", record["id"] + "/" + record["stored_name"])
        if path.stat().st_size != record["size"] or digest(path.read_bytes()) != record["sha256"]:
            raise Invalid("Reference snapshot changed: " + record["name"])
        return path

    def project_references(self, identities, project_id):
        if not isinstance(identities, list) or len(identities) > 30 or any(not isinstance(x, str) for x in identities):
            raise Invalid("Invalid selected reference files")
        result = []
        for identity in dict.fromkeys(identities):
            record = self.store.get("reference", identity)
            if record["project_id"] not in (None, project_id):
                raise Invalid("Reference belongs to another project; select the file again")
            self.reference_file(identity)
            result.append(self.reference_metadata(record))
        return result

    def bind_project_references(self, references, project_id):
        for reference in references:
            record = self.store.get("reference", reference["id"])
            record["project_id"] = project_id
            self.store.put("reference", record)

    def validate_reference_files(self, project):
        for reference in project.get("reference_files", []):
            record = self.store.get("reference", reference["id"])
            if reference != self.reference_metadata(record):
                raise Invalid("Reference metadata changed; review the project context")
            self.reference_file(reference["id"])

    def reference_context(self, project):
        result = copy.deepcopy(project)
        self.validate_reference_files(project)
        if result.get("reference_files"):
            result["reference_files"] = [dict(ref, path=str(self.reference_file(ref["id"])), access="read-only")
                                         for ref in result["reference_files"]]
        return result

    def discard_reference(self, identity):
        with self.store.transaction():
            record = self.store.get("reference", identity)
            if record["project_id"] is not None:
                raise Invalid("Saved reference snapshots are retained for project history")
            folder = self.data / "references" / record["id"]
            self.reference_file(identity)
            shutil.rmtree(folder)
            self.store.db.execute("DELETE FROM objects WHERE kind='reference' AND id=?", (identity,))
        return {"discarded": True}
