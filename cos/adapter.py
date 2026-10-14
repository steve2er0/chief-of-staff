"""Codex exec adapter with explicit, assignment-approved execution policies."""
import json
import os
from pathlib import Path
import queue
import re
import shutil
import signal
import subprocess
import threading
import time
import uuid
import tempfile

from .wire import CapturedText, Node, WireRecord, read_record

from .safety import Invalid, bounded_text
from .progress import message_details
from .owner_requests import REQUEST_SCHEMA, validate_requests


# Legacy structured completion validation retains its field budget.
# Transport records use disk-backed capture rather than this limit.
MAX_EVENT_BYTES = 4 * 1024 * 1024


def model_payload(result):
    """Separate adapter evidence from fields returned by the structured model."""
    return {key: value for key, value in result.items()
            if key not in ("session_id", "agent_report", "execution_verified")}


COMPLETION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "status": {"type": "string", "enum": ["completed", "blocked", "failed"]},
        "summary": {"type": "string"},
        "artifacts": {"type": "array", "description": "All delivered relative file paths; list files, not directories.", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "next_steps": {"type": "array", "items": {"type": "string"}},
        "user_requests": REQUEST_SCHEMA
    }, "required": ["status", "summary", "artifacts", "decisions", "next_steps"]
}


def session_id(value):
    try:
        if not isinstance(value, str) or str(uuid.UUID(value)) != value.lower():
            raise ValueError()
    except (ValueError, AttributeError):
        raise Invalid("Invalid captured CLI session ID")
    return value


def completion(value):
    if not isinstance(value, dict):
        raise Invalid("Final report must be a JSON object")
    missing = set(COMPLETION_SCHEMA["required"]) - set(value)
    unknown = set(value) - set(COMPLETION_SCHEMA["properties"])
    if missing:
        raise Invalid("Final report is missing fields: " + ", ".join(sorted(missing)))
    if unknown:
        raise Invalid("Final report contains unsupported fields: " + ", ".join(sorted(unknown)))
    if value["status"] not in ("completed", "blocked", "failed"):
        raise Invalid("Final report status must be completed, blocked or failed")
    if not isinstance(value["summary"], str) or not value["summary"].strip():
        raise Invalid("Completion field 'summary' must be non-empty text")
    if "\x00" in value["summary"] or len(value["summary"]) > MAX_EVENT_BYTES:
        raise Invalid("Completion field 'summary' contains a null character or exceeds the capture buffer")
    for k in ("artifacts", "decisions", "next_steps"):
        if not isinstance(value[k], list):
            raise Invalid("Completion field '" + k + "' must be a list")
        if k == "artifacts":
            continue  # Inspect individual entries during capture; retain valid files.
        for index, v in enumerate(value[k]):
            if not isinstance(v, str) or not v.strip() or "\x00" in v or len(v) > MAX_EVENT_BYTES:
                raise Invalid("Completion field '" + k + "' entry " + str(index + 1) + " must be non-empty text without null characters, within the capture buffer")
    if "user_requests" in value:
        validate_requests(value["user_requests"])
    return value


def retained_report(raw, issue, captured, status="blocked"):
    """Retain an unverified handoff without promoting it to a completed result."""
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except (ValueError, TypeError):
        value = None
    value = value if isinstance(value, dict) else {}
    summary = value.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        summary = raw if isinstance(raw, str) and raw.strip() else issue + " The agent did not return a final report."
    result = {"status": status, "summary": summary, "session_id": captured,
              "agent_report": raw if isinstance(raw, str) else json.dumps(raw) if raw is not None else "",
              "reported_status": value.get("status"), "handoff_issues": [issue],
              "artifacts": value.get("artifacts") if isinstance(value.get("artifacts"), list) else [],
              "decisions": [x for x in value.get("decisions", []) if isinstance(x, str) and x.strip()] if isinstance(value.get("decisions"), list) else [],
              "next_steps": [x for x in value.get("next_steps", []) if isinstance(x, str) and x.strip()] if isinstance(value.get("next_steps"), list) else []}
    if "user_requests" in value:
        try:
            result["user_requests"] = validate_requests(value["user_requests"])
        except Invalid as error:
            result["handoff_issues"].append("Owner request metadata: " + str(error) + ". Correct the request envelope; earlier owner requests remain unchanged.")
    if isinstance(raw, CapturedText):
        path = raw.record.path.with_suffix('.report.txt')
        raw.save(path)
        result.update(agent_report_file=str(path), report_truncated=True)
    return result


def command_prefix(config):
    name = bounded_text(config["executable"], "CLI executable", 1000)
    if name.startswith("-") or "\n" in name:
        raise Invalid("Invalid CLI executable")
    found = shutil.which(name) if not Path(name).is_absolute() else name
    if not found or not Path(found).is_file():
        raise Invalid("CLI executable was not found. Configure its absolute path.")
    found = str(Path(found).resolve())
    # Windows .cmd wrappers require a shell: use native binary or node.exe + JS.
    if Path(found).suffix.lower() in (".cmd", ".bat", ".ps1", ".sh"):
        raise Invalid("Shell wrappers are unsupported. Use a native Codex binary, or node.exe and the Codex .js entrypoint.")
    entry = config.get("entrypoint", "")
    if entry:
        entry = Path(bounded_text(entry, "Codex JS entrypoint", 1000)).expanduser()
        if not entry.is_absolute() or entry.suffix.lower() != ".js" or not entry.is_file():
            raise Invalid("Entrypoint must be an absolute path to the installed Codex .js file")
        if Path(found).name.lower() not in ("node", "node.exe"):
            raise Invalid("A JS entrypoint requires node or node.exe")
        return [found, str(entry.resolve())]
    return [found]


class WindowsJob:
    """Kill-on-close Job Object; assign while child still awaits stdin."""
    def __init__(self, process):
        import ctypes as c
        from ctypes import wintypes as w
        class Basic(c.Structure):
            _fields_ = [("PerProcessUserTimeLimit", c.c_int64), ("PerJobUserTimeLimit", c.c_int64),
                        ("LimitFlags", w.DWORD), ("MinimumWorkingSetSize", c.c_size_t),
                        ("MaximumWorkingSetSize", c.c_size_t), ("ActiveProcessLimit", w.DWORD),
                        ("Affinity", c.c_size_t), ("PriorityClass", w.DWORD), ("SchedulingClass", w.DWORD)]
        class IO(c.Structure):
            _fields_ = [(x, c.c_uint64) for x in ("ReadOperationCount", "WriteOperationCount", "OtherOperationCount", "ReadTransferCount", "WriteTransferCount", "OtherTransferCount")]
        class Extended(c.Structure):
            _fields_ = [("BasicLimitInformation", Basic), ("IoInfo", IO), ("ProcessMemoryLimit", c.c_size_t),
                        ("JobMemoryLimit", c.c_size_t), ("PeakProcessMemoryUsed", c.c_size_t), ("PeakJobMemoryUsed", c.c_size_t)]
        self.kernel = c.WinDLL("kernel32", use_last_error=True)
        self.kernel.CreateJobObjectW.argtypes = [c.c_void_p, w.LPCWSTR]
        self.kernel.CreateJobObjectW.restype = w.HANDLE
        self.kernel.SetInformationJobObject.argtypes = [w.HANDLE, c.c_int, c.c_void_p, w.DWORD]
        self.kernel.AssignProcessToJobObject.argtypes = [w.HANDLE, w.HANDLE]
        self.kernel.TerminateJobObject.argtypes = [w.HANDLE, w.UINT]
        self.kernel.CloseHandle.argtypes = [w.HANDLE]
        self.handle = self.kernel.CreateJobObjectW(None, None)
        info = Extended()
        info.BasicLimitInformation.LimitFlags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not self.handle or not self.kernel.SetInformationJobObject(self.handle, 9, c.byref(info), c.sizeof(info)) or not self.kernel.AssignProcessToJobObject(self.handle, w.HANDLE(int(process._handle))):
            self.close()
            raise Invalid("Cannot attach Windows process cleanup job; worker launch refused")

    def close(self):
        if self.handle:
            self.kernel.TerminateJobObject(self.handle, 1)
            self.kernel.CloseHandle(self.handle)
            self.handle = None


def stop_process(process, job=None):
    if job:
        job.close()
    elif os.name != "nt":
        # Kill group even if the root already exited; descendants may remain.
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            pass
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    elif process.poll() is None:
        process.kill()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=3)


class CodexAdapter:
    def __init__(self, popen=subprocess.Popen, runner=subprocess.run):
        self.popen, self.runner = popen, runner
        self.capabilities = None

    def preflight(self, config):
        prefix = command_prefix(config)
        output = {}
        for key, args in (("version", ["--version"]), ("root", ["--help"]), ("exec", ["exec", "--help"]), ("resume", ["exec", "resume", "--help"]), ("app_server", ["app-server", "--help"])):
            r = self.runner(prefix + args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15, shell=False)
            output[key] = (r.stdout + "\n" + r.stderr)[:60000] if r.returncode == 0 else ""
        required = {"json": "--json" in output["exec"], "sandbox": "--sandbox" in output["exec"],
                    "model": "--model" in output["exec"],
                    "config": "--config" in output["root"]}
        version = next((x for x in output["version"].splitlines() if x.startswith("codex-cli")), output["version"].strip())
        caps = {"id": "preflight", "prefix": prefix, "version": version, "required": required,
                "ok": all(required.values()) and bool(output["version"]),
                "schema": "--output-schema" in output["exec"],
                "resume": "SESSION_ID" in output["resume"] and "--json" in output["resume"],
                "resume_schema": "--output-schema" in output["resume"],
                "skip_git": "--skip-git-repo-check" in output["exec"],
                "resume_skip_git": "--skip-git-repo-check" in output["resume"],
                "yolo": "--dangerously-bypass-approvals-and-sandbox" in output["exec"],
                "resume_yolo": "--dangerously-bypass-approvals-and-sandbox" in output["resume"],
                "app_server": "--listen" in output["app_server"] or "--stdio" in output["app_server"],
                "model_verified": False, "note": "Help-only check. Authentication, model routing and sandbox enforcement have not been exercised. Headless exec may reject approval-required operations; no automatic approval review is enabled.",
                "help": output}
        self.capabilities = caps
        return caps

    def argv(self, config, cwd, sandbox, schema_path, session=None, research_access=False, execution_policy="sandboxed"):
        caps = self.capabilities
        if not caps or not caps["ok"] or caps["prefix"] != command_prefix(config):
            raise Invalid("Run a successful CLI preflight before real work")
        if sandbox not in ("read-only", "workspace-write"):
            raise Invalid("Unsupported sandbox")
        if type(research_access) is not bool or (research_access and sandbox != "workspace-write"):
            raise Invalid("Research access requires an approved workspace-write assignment")
        if execution_policy not in ("sandboxed", "yolo") or (execution_policy == "yolo" and sandbox != "workspace-write"):
            raise Invalid("YOLO requires an explicitly approved editable assignment")
        # Use config overrides for approval policy: the root TUI -a flag does
        # not propagate into exec in 0.149.0. Exec further restricts user-mode
        # headless approvals to Never (deny escalation), per its source.
        args = caps["prefix"] + (["exec"] if execution_policy == "yolo" else ["--config", 'approval_policy="on-request"',
                                 "--config", 'approvals_reviewer="user"',
                                 "--config", "sandbox_workspace_write.writable_roots=[]",
                                 "--config", "sandbox_workspace_write.network_access=" + ("true" if research_access else "false"),
                                 "--config", "sandbox_workspace_write.exclude_tmpdir_env_var=true",
                                 "--config", "sandbox_workspace_write.exclude_slash_tmp=true", "exec", "--sandbox", sandbox])
        if session:
            if not caps["resume"]:
                raise Invalid("Installed CLI cannot resume this task. Revise using a fresh session.")
            # Only exact session IDs captured for this task, never --last.
            session_id(session)
            args += ["resume"]
        if execution_policy == "yolo":
            if not caps.get("resume_yolo" if session else "yolo"):
                raise Invalid("Installed CLI does not advertise YOLO for this invocation. Recheck CLI capabilities or select sandboxed execution.")
            args += ["--dangerously-bypass-approvals-and-sandbox"]
        args += ["--json", "--model", bounded_text(config["model"], "model", 150)]
        if caps["resume_skip_git" if session else "skip_git"]:
            args += ["--skip-git-repo-check"]
        if schema_path is not None and caps["resume_schema" if session else "schema"]:
            args += ["--output-schema", str(schema_path)]
        if session:
            args += [session]
        return args + ["-"]

    def run_interactive(self, config, cwd, sandbox, prompt, cancel, update, control, session=None,
                        research_access=False, execution_policy="sandboxed"):
        from .live_agent import run_agent
        return run_agent(self, config, cwd, sandbox, prompt, cancel, update, control, session,
                         research_access, execution_policy)

    def run(self, config, cwd, sandbox, prompt, schema_path, cancel, update, session=None, validator=completion, research_access=False, execution_policy="sandboxed", plain_report=False):
        time_limit = config["timeout_seconds"]
        if type(time_limit) is not int or not 0 <= time_limit <= 14400:
            raise Invalid("Invalid worker time limit")
        args = self.argv(config, cwd, sandbox, None if plain_report else schema_path, session, research_access=research_access, execution_policy=execution_policy)
        kwargs = dict(cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                      text=True, encoding="utf-8", errors="replace", shell=False, bufsize=1)
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        process = self.popen(args, **kwargs)
        job = None
        stream = queue.Queue(maxsize=8)
        readers = []
        done = threading.Event()
        capture_folder = config.get("_capture_dir") or Path(tempfile.gettempdir()) / ("cos-exec-wire-" + str(uuid.uuid4()))
        def read(pipe, channel):
            try:
                while not done.is_set():
                    line = read_record(pipe, config.get('_capture_dir') or capture_folder, done)
                    if line is None:
                        break
                    while not done.is_set():
                        try:
                            stream.put((channel, line), timeout=0.1)
                            break
                        except queue.Full:
                            continue
            finally:
                while not done.is_set():
                    try:
                        stream.put((channel, None), timeout=0.1)
                        break
                    except queue.Full:
                        continue
        final, completed, errors, malformed, captured = None, False, [], 0, session
        event_errors, capture_issues = [], []
        ended = set()
        started = time.monotonic()
        try:
            if os.name == "nt":
                job = WindowsJob(process)
            update({"worker_pid": process.pid, "progress": "CLI process started; waiting for events", "event": "process.started"})
            for channel, pipe in (("stdout", process.stdout), ("stderr", process.stderr)):
                t = threading.Thread(target=read, args=(pipe, channel), daemon=True)
                t.start()
                readers.append(t)
            process.stdin.write(prompt)
            process.stdin.close()
            while len(ended) < 2:
                if cancel.is_set():
                    return retained_report(final, "Stopped by user. Saved project files remain available for continuation.", captured, "cancelled")
                if time_limit and time.monotonic() - started > time_limit:
                    return retained_report(final, "Approved assignment time limit reached (" + str(time_limit) + " seconds). Partial edits remain on disk; revise to resume.", captured)
                try:
                    channel, line = stream.get(timeout=0.1)
                except queue.Empty:
                    continue
                if line is None:
                    ended.add(channel)
                    continue
                if isinstance(line, dict):
                    if len(capture_issues) < 20:
                        capture_issues.append(line["capture_issue"])
                    update({"progress": line["capture_issue"], "progress_kind": "activity", "event": "capture.warning"})
                    continue
                if channel == "stderr":
                    if isinstance(line, Path):
                        with line.open(encoding="utf-8") as diagnostic:
                            line = diagnostic.read(1000)
                    errors.append(line.strip()[:1000])
                    errors = errors[-30:]
                    continue
                try:
                    captured_text = None
                    if isinstance(line, Path):
                        with_record = WireRecord(line)
                        try:
                            if not isinstance(with_record.root, Node):
                                raise ValueError("invalid event")
                            e = with_record.root.preview()
                            original_item = with_record.root.get('item')
                            if isinstance(original_item, Node):
                                captured_text = original_item.get('text')
                        finally:
                            with_record.close()
                    else:
                        e = json.loads(line)
                    if not isinstance(e, dict) or not isinstance(e.get("type"), str):
                        raise ValueError("invalid event")
                except (ValueError, TypeError):
                    malformed += 1
                    update({"progress": "Malformed CLI event; final output will not be trusted", "event": "malformed"})
                    continue
                typ = e["type"]
                if typ == "thread.started":
                    sid = e.get("thread_id")
                    session_id(sid)
                    if (session and sid != session) or (captured and captured != sid):
                        raise Invalid("CLI session does not match this task")
                    captured = sid
                    update({"session_id": sid, "progress": "Session started", "event": typ})
                elif typ == "turn.completed":
                    completed = True
                elif typ in ("turn.failed", "error"):
                    event_errors.append(str(e.get("error", e.get("message", typ)))[:1000])
                    event_errors = event_errors[-30:]
                    update({"progress": "CLI reported a failure", "event": typ})
                elif typ.startswith("item."):
                    item = e.get("item", {})
                    if not isinstance(item, dict):
                        malformed += 1
                        continue
                    if typ == "item.completed" and item.get("type") == "agent_message":
                        final = captured_text if captured_text is not None else item.get("text", "")
                    if item.get("type") in ("command_execution", "file_change", "plan_update", "agent_message"):
                        raw = str(item.get("text") or (item.get("type", "Working") + ": " + item.get("status", "updated")))
                        details = message_details(raw) if item.get("type") == "agent_message" else None
                        update({"progress": details["text"] if details else raw[:2000],
                                "reported_status": details["reported_status"] if details else None,
                                "progress_kind": "message" if details else "activity", "event": typ,
                                **({"user_requests": details["user_requests"]} if details and "user_requests" in details else {})})
            code = process.wait(timeout=5)
            fatal = event_errors + [x for x in errors if x and not x.startswith("WARNING:")]
            if code or not completed or not captured or event_errors:
                msg = "; ".join(fatal[-4:]) or ("CLI exited with code " + str(code) if code else "No verified completed turn/session")
                blocked = any(x in msg.lower() for x in ("approval", "permission", "sandbox", "denied", "authentication", "unauthorized", "login"))
                return retained_report(final, msg, captured, "blocked" if blocked else "failed")
            if malformed or capture_issues:
                issues = capture_issues + ([str(malformed) + " malformed CLI event(s). Verify or rerun the interrupted log capture before acceptance."] if malformed else [])
                result = retained_report(final, issues[0], captured)
                result["handoff_issues"] = issues + result["handoff_issues"][1:]
                result["execution_verified"] = True
                return result
            if plain_report:
                from .live_agent import report
                return report(final or "", "completed", captured, set(), cwd)
            try:
                result = validator(json.loads(final or "null"))
            except (Invalid, ValueError, TypeError) as error:
                result = retained_report(final, "Final report format: " + str(error) + ". The original report and valid files are retained for review.", captured)
                result["execution_verified"] = True
                return result
            return dict(result, session_id=captured, agent_report=final, execution_verified=True)
        except (Invalid, ValueError, TypeError, OSError, subprocess.SubprocessError) as e:
            return retained_report(final, str(e), captured, "failed")
        finally:
            done.set()
            stop_process(process, job)
            for t in readers:
                t.join(timeout=2)
            for pipe in (process.stdout, process.stderr):
                pipe.close()
