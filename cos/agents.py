"""Direct agent starts and follow-ups; planning is optional, permissions stay frozen."""
import copy
from contextlib import ExitStack
import json
from pathlib import Path
import shutil
import subprocess
import threading

from .adapter import session_id
from .safety import Invalid, bounded_text, digest, working_directory
from .store import now, uid
from .safety import local_file
from .wire import Node, RawJSON, WireRecord


def git(cwd, *args, input=None, check=True):
    result = subprocess.run(["git", "-C", str(cwd), *args], input=input, capture_output=True, timeout=60, shell=False)
    if check and result.returncode:
        raise Invalid(result.stderr.decode("utf-8", errors="replace").strip() or "Git worktree preparation failed")
    return result


def isolate_workspace(cwd, destination, branch, file_refs=(), cancel=None):
    """Copy current tracked edits and untracked inputs without modifying the source."""
    cwd, destination = Path(cwd).resolve(), Path(destination).resolve()
    probe = git(cwd, "rev-parse", "--show-toplevel", check=False)
    if probe.returncode:
        return None
    root = Path(probe.stdout.decode().strip()).resolve()
    if git(root, "rev-parse", "--verify", "HEAD", check=False).returncode:
        return None
    offset = Path(cwd).resolve().relative_to(root)
    # A worktree cannot safely represent initialized submodules as copied files.
    if (root / ".gitmodules").exists():
        raise Invalid("This repository has submodules. Turn off separate worktrees to use its shared folder.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        owned = git(destination, "branch", "--show-current", check=False)
        common = git(destination, "rev-parse", "--git-common-dir", check=False)
        source_common = git(root, "rev-parse", "--git-common-dir").stdout.decode().strip()
        if owned.returncode or owned.stdout.decode().strip() != branch or common.returncode or (destination / common.stdout.decode().strip()).resolve() != (root / source_common).resolve():
            raise Invalid("An unrelated workspace occupies the preparation destination")
        git(root, "worktree", "remove", "--force", str(destination))
        git(root, "branch", "-D", branch)
    patch = git(root, "diff", "--binary", "HEAD").stdout
    untracked = git(root, "ls-files", "--others", "--exclude-standard", "-z").stdout.split(b"\0")
    git(root, "worktree", "add", "-b", branch, str(destination), "HEAD")
    try:
        def copy_input(source, target):
            if cancel and cancel.is_set():
                raise Invalid("Workspace preparation stopped")
            if source.is_symlink() or not source.resolve().is_relative_to(root):
                raise Invalid("Cannot copy a linked or external input: " + str(source))
            if not target.resolve().is_relative_to(destination.resolve()) or target.is_symlink():
                raise Invalid("Cannot copy an input through a worktree link: " + str(target))
            if source.is_dir():
                target.mkdir(parents=True, exist_ok=True)
                for child in source.iterdir():
                    # Git metadata is never an agent input, even for a folder reference.
                    if child.name != ".git":
                        copy_input(child, target / child.name)
            elif source.is_file():
                target.parent.mkdir(parents=True, exist_ok=True)
                with source.open("rb") as src, target.open("wb") as dst:
                    for chunk in iter(lambda: src.read(1024 * 1024), b""):
                        if cancel and cancel.is_set():
                            raise Invalid("Workspace preparation stopped")
                        dst.write(chunk)
                shutil.copystat(source, target)
            else:
                raise Invalid("Declared input is missing or is not a regular file: " + str(source))
        if patch:
            git(destination, "apply", "--binary", "-", input=patch)
        for entry in untracked:
            if not entry:
                continue
            relative = Path(entry.decode("utf-8", errors="surrogateescape"))
            source = root / relative
            target = destination / relative
            # Do not follow links out of the supplied project while copying inputs.
            if source.is_symlink() or not source.is_file() or not source.resolve().is_relative_to(root):
                raise Invalid("Cannot copy this untracked input into a worktree: " + str(relative))
            copy_input(source, target)
        # Copy only owner-declared ignored inputs, never all ignored files.
        for ref in file_refs:
            source = Path(cwd) / ref
            relative = source.absolute().relative_to(root)
            copy_input(source, destination / relative)
        folder = destination / offset
        if not folder.is_dir():
            raise Invalid("Selected project subfolder does not exist in the prepared worktree")
        return {"path": str(destination), "cwd": str(folder), "source": str(root), "source_cwd": str(cwd), "branch": branch}
    except BaseException:
        # Only discard this newly created copy; the original checkout is untouched.
        git(root, "worktree", "remove", "--force", str(destination), check=False)
        git(root, "branch", "-D", branch, check=False)
        raise


class AgentMixin:
    def start_agents(self, raw, request_id=None):
        specs = raw.get("agents")
        if not isinstance(specs, list) or not specs:
            raise Invalid("Add at least one agent instruction")
        prepared = []
        config = self.config()
        for value in specs:
            if not isinstance(value, dict):
                raise Invalid("Each agent needs an instruction")
            text = bounded_text(value.get("instructions"), "agent instructions", 6000)
            access = raw.get("access", "workspace-write")
            prepared.append({"title": bounded_text(value.get("title") or text.splitlines()[0][:100], "agent title", 160),
                             "goal": text[:1000], "purpose": text, "access": access,
                             "execution_policy": raw.get("execution_policy", config["default_execution_policy"]) if access == "workspace-write" else "sandboxed",
                             "research_access": raw.get("research_access", False),
                             "time_limit": raw.get("time_limit", "none"), "expected_outputs": [],
                             "criteria": ["Address the owner's instructions and report the work, checks and remaining limitations."]})
        from .service import normalized_spec
        prepared = [normalized_spec(value) for value in prepared]
        if type(raw.get("isolate", config["default_isolate"])) is not bool:
            raise Invalid("Separate worktrees must be a boolean")
        if config["mode"] == "codex" and not self.adapter.capabilities:
            self.preflight()
        with self.config_lock, self.store.transaction():
            key = request_id or uid()
            fingerprint = digest(json.dumps(raw, sort_keys=True).encode())
            try:
                existing = self.store.get("agent_start", key)
                if existing.get("fingerprint") != fingerprint:
                    raise Invalid("Start ID already used with different instructions")
                return self.store.get("plan", existing["plan_id"])
            except ValueError as error:
                if isinstance(error, Invalid):
                    raise
            if raw.get("project_id"):
                project = self.store.get("project", raw["project_id"])
            else:
                project = self.project({"name": raw.get("project_name") or Path(raw.get("cwd") or "New project").name,
                                        "vision": prepared[0]["purpose"], "cwd": raw.get("cwd", "")})
                # Direct starts don't spend a slot on an unsolicited planning call.
                if config["mode"] == "codex":
                    self.cancel_project_review(project["id"])
            plan = self._draft(project["id"], "Direct agent start", "Owner start", prepared, "Owner instructions")
            plan["direct_agents"] = True
            plan["isolate"] = raw.get("isolate", config["default_isolate"])
            self.store.put("plan", plan)
            approved = self.approve(plan["id"], plan["revision"])
            if approved.get("refreshed"):
                raise Invalid("Could not capture the current project context")
            launched = self.launch(plan["id"])
            self.store.put("agent_start", {"id": key, "plan_id": launched["id"], "fingerprint": fingerprint})
            self.store.audit("agents.started", launched["id"], str(len(launched["task_ids"])) + " owner-started agents")
            return launched

    def prepare_agents(self):
        """Reserve source folders briefly; Git and input copies run outside store locks."""
        with self.store.transaction():
            for task in self.store.all("task"):
                if task["state"] != "queued" or task.get("workspace_preparation") != "pending":
                    continue
                cwd = task["context"]["cwd"]
                if self._locked(cwd, "read-only"):
                    continue
                task.update(workspace_preparation="preparing", progress="Preparing separate checkout", updated=now())
                self.store.put("task", task)
                cancel = threading.Event()
                thread = threading.Thread(target=self._prepare_agent, args=(task, cancel), daemon=True)
                self.preparations[task["id"]] = {"cancel": cancel, "thread": thread, "cwd": cwd, "access": "read-only"}
                thread.start()

    def _prepare_agent(self, task, cancel):
        tree = None
        try:
            if cancel.is_set():
                raise Invalid("Workspace preparation stopped")
            tree = isolate_workspace(task["context"]["cwd"], self.data / "worktrees" / task["id"],
                                     "codex/cos-" + task["id"], task["context"].get("file_refs", []), cancel)
            if cancel.is_set():
                raise Invalid("Workspace preparation stopped")
            with self.store.transaction():
                saved = self.store.get("task", task["id"])
                if cancel.is_set() or saved["state"] != "queued":
                    raise Invalid("Workspace preparation stopped")
                if tree:
                    tree["workspace_id"] = task["id"]
                    saved["worktree"] = tree
                    saved["context"]["cwd"] = tree["cwd"]
                saved.update(workspace_preparation="ready", progress="Waiting for an agent slot", updated=now())
                self.store.put("task", saved)
                tree = None  # Committed checkout is retained for the agent and future turns.
        except Exception as error:
            if tree:
                git(tree["source"], "worktree", "remove", "--force", tree["path"], check=False)
                git(tree["source"], "branch", "-D", tree["branch"], check=False)
            with self.store.transaction():
                saved = self.store.get("task", task["id"])
                saved.update(state=saved.get("stop_target", "paused") if cancel.is_set() else "failed",
                             workspace_preparation="pending" if cancel.is_set() else "failed", progress=str(error), updated=now())
                self.store.put("task", saved)
        finally:
            with self.store.transaction():
                self.preparations.pop(task["id"], None)

    def agent_prompt(self, task):
        scoped = "Handle the subtasks yourself within this one assignment. Do not spawn or delegate to other agents. " if task.get("assignment_scope") == "project" else ""
        network = ("The owner explicitly approved public web research for this assignment, including public source downloads inside the project. Do not upload project files, private content or credentials, use signed-in accounts or send messages. " if task.get("research_access") else "Use local references; ask for permission if public source downloads are essential. ")
        if task.get("execution_policy") == "yolo":
            network = "The owner explicitly approved YOLO execution: CLI commands run without sandboxing or command approval prompts, with command network access. Assigned scope still applies. Browser permissions remain separate. "
        return (scoped + network + "Work toward the owner's instructions. Own routine implementation, checks and recovery. "
                "Keep progress concise and report meaningful changes of activity. Stay within the chosen project and execution permissions. "
                "Read selected references without modifying imported originals. Project planning and dependencies are background guidance. "
                "Ask only when a meaningful owner decision or essential permission is needed. Use the live user-input tool when available; "
                "the owner can reply and steer this session. Do not publish, send messages to others, change credentials or upload private content "
                "without explicit owner instructions. A reply does not silently expand filesystem or network permissions. "
                "Return a readable summary of changes, checks, limitations and the next useful action. "
                "You may return the completion JSON, but plain text is also valid. If using JSON, list delivered files relative to cwd in artifacts.\n" +
                json.dumps({"instructions": task["purpose"], "follow_up": task.get("continuation_note", ""),
                            "assignment": {k: task.get(k) for k in ("goal", "purpose", "criteria", "expected_outputs", "continuation_note", "resume_context", "execution_policy", "research_access", "time_limit")},
                            "project": self.reference_context(task["context"]), "execution": {k: task.get(k) for k in ("access", "execution_policy", "research_access")}}, ensure_ascii=False))

    def reply_agent(self, tid, text="", request_id=None, confirmed_stopped=False, fresh=False):
        text = bounded_text(text or "Continue from the saved work and finish the remaining goal.", "agent reply", 6000)
        with self.config_lock, self.store.transaction():
            key = request_id or uid()
            fingerprint = digest(json.dumps([tid, text, confirmed_stopped, fresh]).encode())
            try:
                previous = self.store.get("agent_reply", key)
                if previous["fingerprint"] != fingerprint:
                    raise Invalid("Reply ID already used with different input")
                return self.store.get("task", previous["task_id"])
            except ValueError as error:
                if isinstance(error, Invalid):
                    raise
            task = self.store.get("task", tid)
            if task["state"] == "superseded":
                agent_id = task.get("agent_id", task["id"])
                task = next((t for t in reversed(self.store.all("task")) if t.get("agent_id", t["id"]) == agent_id and t["state"] != "superseded"), task)
            if task.get("recovery_lock") and confirmed_stopped is not True:
                raise Invalid("Confirm the previous worker and its tools have stopped before continuing")
            if task["state"] == "stopping":
                raise Invalid("Wait for the agent and its tools to stop before continuing")
            message = {"id": key, "role": "user", "text": text, "at": now(), "status": "pending"}
            task.setdefault("conversation", []).append(message)
            if task["state"] == "queued":
                task["continuation_note"] = task.get("continuation_note", "") + "\n" + text
            elif task["id"] in self.active:
                message["status"] = "queued"
                control = self.active[task["id"]].get("control")
                if not task.get("interactive") or not control or not control.submit({"kind": "message", "text": text, "message_id": key}):
                    message["status"] = "queued_next"
            elif task["state"] in ("ready_for_review", "accepted", "failed", "blocked", "paused", "cancelled", "interrupted"):
                task = self._continue_agent(task, text, fresh=fresh)
            else:
                raise Invalid("This agent cannot continue from its current state")
            task["updated"] = now()
            self.store.put("task", task)
            self.store.put("agent_reply", {"id": key, "fingerprint": fingerprint, "task_id": task["id"]})
            self.store.audit("agent.reply", task["id"], text)
            return task

    def _continue_agent(self, task, text, fresh=False):
        # Use the task's captured folder, CLI, model and permissions even if defaults changed.
        if task["config"]["mode"] == "codex" and not fresh and not task.get("session_id"):
            raise Invalid("No captured session is available. Choose Start a fresh session.")
        if task.get("session_id"):
            session_id(task["session_id"])
        unsent = [m["text"] for m in task.get("conversation", []) if m.get("status") in ("pending", "queued", "queued_next") and m["text"] != task["purpose"]]
        if text != "\n\n".join(unsent) and text not in unsent:
            unsent.append(text)
        text = "\n\n".join(unsent) or text
        previous = copy.deepcopy(task)
        if previous.pop("recovery_lock", False):
            previous["cleanup_confirmed_at"] = now()
        previous.update(prior_state=task["state"], state="superseded", updated=now())
        next_task = copy.deepcopy(task)
        for key in ("result", "review", "review_note", "accepted_at", "finished_at", "started_at", "worker_pid", "turn_id", "stop_target", "recovery_lock", "revision_plan", "latest_update", "latest_update_at", "reported_status", "error", "connection_error", "prior_state", "user_requests", "user_request_links", "user_requests_error"):
            next_task.pop(key, None)
        for message in next_task.get("conversation", []):
            if message.get("status") in ("queued_next", "queued"):
                message["status"] = "pending"
        next_task.update(id=uid(), agent_id=task.get("agent_id", task["id"]), parent_task_id=task["id"], managed_agent=True,
                         state="queued", created=now(), updated=now(), last_activity_at=now(), progress="Follow-up queued for the same agent",
                         continuation_note=text, history=[], output_links=[], decisions_needed=[], handoff_issues=[],
                         snapshot_limits=[], delivery_notes=[], live_requests=[], session_id=None if fresh else task.get("session_id"), attempt=0)
        if next_task.get("workspace_preparation") in ("pending", "preparing", "failed") and not next_task.get("worktree"):
            next_task["workspace_preparation"] = "pending"
        self.store.put("task", previous)
        self.store.put("task", next_task)
        if next_task.get("work_item_id"):
            item = self.store.get("work_item", next_task["work_item_id"])
            if item["status"] not in ("done", "deferred"):
                item["status"] = "doing"
            item.setdefault("task_ids", []).append(next_task["id"])
            item["updated"] = now()
            self.store.put("work_item", item)
        self.store.audit("agent.continued", next_task["id"], task["id"])
        return next_task

    def continue_pending_agent(self, tid):
        task = self.store.get("task", tid)
        pending = [m for m in task.get("conversation", []) if m.get("status") == "queued_next"]
        if pending and task["state"] in ("ready_for_review", "failed", "blocked") and task.get("session_id") and not self.shutdown.is_set():
            self._continue_agent(task, "\n\n".join(m["text"] for m in pending))

    def respond_agent(self, tid, rid, raw, request_id=None):
        with self.store.transaction(), ExitStack() as captures:
            task = self.store.get("task", tid)
            request = next((r for r in task.get("live_requests", []) if r["id"] == rid and r["status"] == "pending"), None)
            if not request or tid not in self.active or not task.get("interactive"):
                raise Invalid("This request is no longer waiting in the active session")
            params, method = request["params"], request["method"]
            record = captures.enter_context(WireRecord(self.live_capture(tid, request["capture_name"]))) if request.get("capture_name") else None
            full_params = record.root.get("params") if record else None
            if method == "item/tool/requestUserInput":
                answers = raw.get("answers", {})
                questions = list(params["questions"]) if not record else full_params.get("questions")
                get = lambda q, key: q.get(key)
                if not isinstance(answers, dict) or any(get(q, "id") not in answers for q in questions) or sum(1 for _ in questions) != len(answers):
                    raise Invalid("Answer each question in this request")
                response = {"answers": {key: {"answers": [bounded_text(answer, "answer", 6000)]} for key, answer in answers.items()}}
                text = "Answered the agent's question."
                if not any(q.get("isSecret") for q in questions):
                    text = ""
                    for q in questions:
                        entry = str(q.get("question", ""))[:300] + "\n" + answers[q.get("id")] + "\n"
                        text += entry[:max(0, 8192-len(text))]
                        if len(text) >= 8192:
                            text += "\nAdditional answers were sent in this response."
                            break
            elif method in ("item/commandExecution/requestApproval", "item/fileChange/requestApproval"):
                decision = raw.get("decision")
                if decision not in ("accept", "acceptForSession", "decline", "cancel"):
                    raise Invalid("Choose allow or decline for this exact request")
                response, text = {"decision": decision}, "Tool request: " + decision
            elif method == "item/permissions/requestApproval":
                if raw.get("decision") not in ("accept", "decline"):
                    raise Invalid("Choose allow or decline for this permission request")
                allow = raw.get("decision") == "accept"
                permission = full_params.get("permissions") if record else params.get("permissions", {})
                response = {"permissions": RawJSON(permission) if allow and isinstance(permission, Node) else permission if allow else {}, "scope": "turn"}
                text = "Permission request: " + ("allowed for this turn" if allow else "declined")
            else:
                # MCP elicitation is relayed, never automatically granted.
                decision = raw.get("decision")
                if decision not in ("accept", "decline", "cancel"):
                    raise Invalid("Choose a response to this tool request")
                content = raw.get("content")
                if decision == "accept" and params.get("mode") in ("form", "openai/form") and not isinstance(content, dict):
                    raise Invalid("Provide the requested tool fields")
                response, text = {"action": decision, "content": content if decision == "accept" else None}, "Tool request: " + decision
            mid = request_id or uid()
            control = self.active[tid].get("control")
            if not control or not control.submit({"kind": "response", "wire_id": request["wire_id"], "response": response, "message_id": mid}):
                raise Invalid("Agent stopped before the response could be sent. Continue its saved session.")
            request["status"] = "sending"
            task.setdefault("conversation", []).append({"id": mid, "role": "user", "text": text, "at": now(), "status": "queued"})
            self.store.put("task", task)
            self.store.audit("agent.response", tid, method)
            return task

    def live_capture(self, tid, name):
        task = self.store.get("task", tid)
        if not any(r.get("capture_name") == name for r in task.get("live_requests", []) + task.get("conversation", [])):
            raise Invalid("Unknown agent capture")
        return local_file(self.data / "outputs" / tid / "wire", name, max_bytes=None)

    def answer_and_continue(self, pid, rid, raw, request_id=None):
        with self.config_lock, self.store.transaction():
            project = self.store.get("project", pid)
            record = next((r for r in project["records"] if r["id"] == rid), None)
            if not record or not record.get("user_request_task_id"):
                raise Invalid("This question is not linked to an agent")
            action = raw.get("action", "answer")
            answer = raw.get("answer", "")
            self.resolve_batch([{"project_id": pid, "record_id": rid, "action": action, "answer": answer}])
            text = record["text"] + "\nOwner response: " + (answer if action == "answer" else action)
            return self.reply_agent(record["user_request_task_id"], text, request_id,
                                    raw.get("confirmed_stopped", False), raw.get("fresh", False))
