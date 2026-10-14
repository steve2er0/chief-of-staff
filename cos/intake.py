"""One durable, read-only CoS orientation when a project is created."""
from .safety import Invalid
from .store import now


SETUP_INSTRUCTION = (
    "This is the initial project setup review. Get oriented before replying. "
    "Read the owner's vision and selected references, and inspect the supplied working directory read-only. "
    "Use a bounded overview of the folder, relevant documentation and entry points to understand existing work. "
    "Skip generated files, dependency folders and unrelated material. Do not implement anything or run project code. "
    "If there is no existing work, say this is a fresh starting point and reason from the vision and any references. "
    "An empty folder is valid; it is not a blocker and does not require the owner to create files or repeat the vision. "
    "Explain briefly what is already available, what this vision adds, and suggest one small concrete next step. "
    "Name the few relevant files when they substantiate your understanding. Distinguish inspected evidence from inference. "
    "Do not hand the initial inspection back to the owner as 'review existing project work' or ask permission for this read-only review. "
    "If a reference is unavailable, state that limit and still build on available context. "
    "Do not claim you have read files you have not inspected, invent technical definitions or validation results, "
    "make edits, delegate agents, create assignments or produce a detailed work map."
)


class SetupReviewMixin:
    def request_project_review(self, pid):
        with self.config_lock, self.store.transaction():
            project = self.store.get("project", pid)
            existing = next((r for r in self.store.all("setup_review") if r["id"] == pid), None)
            if existing:
                if existing["state"] in ("pending", "running") or (
                        existing["state"] == "completed" and existing["based_on_version"] == project["version"]):
                    return existing
                if existing.get("job_id") and self.store.get("job", existing["job_id"]).get("recovery_lock"):
                    raise Invalid("Confirm the previous CoS call has stopped before retrying the project review")
            if self.config()["mode"] != "codex":
                raise Invalid("Use Codex mode for a CoS project review")
            review = {"id": pid, "project_id": pid, "state": "pending", "created": now(), "updated": now(),
                      "based_on_version": project["version"], "job_id": None,
                      "progress": "Your CoS will review the vision, project folder and selected references."}
            self.store.put("setup_review", review)
            self.store.audit("project.review_requested", pid)
            return review

    def cancel_project_review(self, pid):
        with self.config_lock, self.store.transaction():
            review = self.store.get("setup_review", pid)
            if review["state"] != "pending":
                raise Invalid("Use Stop call for an active project review")
            review.update(state="cancelled", updated=now(), progress="Project review cancelled before it started.")
            self.store.put("setup_review", review)
            return review

    def _recover_project_reviews(self):
        for review in self.store.all("setup_review"):
            if review["state"] == "running":
                job = self.store.get("job", review["job_id"])
                review.update(state=job["state"], progress=job["progress"], updated=now())
                self.store.put("setup_review", review)

    def _start_project_reviews(self):
        # CLI help can be slow. Reserve no config/store lock until it finishes.
        if self.shutdown.is_set() or self.config()["mode"] != "codex":
            return
        for review in self.store.all("setup_review"):
            if review["state"] != "pending":
                continue
            with self.store.transaction():
                project = self.store.get("project", review["project_id"])
                if (self.slots_full() or self._locked(project["cwd"], "read-only") or
                        any(j["project_id"] == project["id"] and j["state"] == "running" for j in self.store.all("job"))):
                    continue
            try:
                if self.adapter.capabilities is None:
                    self.preflight()
                with self.config_lock, self.store.transaction():
                    review = self.store.get("setup_review", review["id"])
                    if self.shutdown.is_set() or review["state"] != "pending" or self.config()["mode"] != "codex":
                        continue
                    project = self.store.get("project", review["project_id"])
                    if (self.slots_full() or self._locked(project["cwd"], "read-only") or
                            any(j["project_id"] == project["id"] and j["state"] == "running" for j in self.store.all("job"))):
                        continue
                    job = self._coordinator(project, "intake", project["vision"], "Automatic project setup review")
                    review.update(state="running", job_id=job["id"], based_on_version=project["version"],
                                  progress="Your CoS is getting oriented to the project.", updated=now())
                    self.store.put("setup_review", review)
            except Exception as error:
                with self.store.transaction():
                    review = self.store.get("setup_review", review["id"])
                    if review["state"] == "pending":
                        review.update(state="failed", progress=str(error), updated=now())
                        self.store.put("setup_review", review)

    def _finish_project_review(self, job):
        if job["kind"] != "intake":
            return
        review = self.store.get("setup_review", job["project_id"])
        if review.get("job_id") == job["id"]:
            review.update(state=job["state"], progress=job["progress"], updated=now())
            if job.get("proposal_id"):
                review["proposal_id"] = job["proposal_id"]
            self.store.put("setup_review", review)
