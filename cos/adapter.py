"""Codex exec adapter. No shell, login changes, arbitrary flags, or escalation."""
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

from .safety import Invalid, bounded_text


COMPLETION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "status": {"type": "string", "enum": ["completed", "blocked", "failed"]},
        "summary": {"type": "string"},
        "artifacts": {"type": "array", "items": {"type": "string"}},
        "decisions": {"type": "array", "items": {"type": "string"}},
        "next_steps": {"type": "array", "items": {"type": "string"}}
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
    if not isinstance(value, dict) or set(value) != set(COMPLETION_SCHEMA["required"]):
        raise Invalid("Final response does not match the completion contract")
    if value["status"] not in ("completed", "blocked", "failed"):
        raise Invalid("Invalid completion status")
    bounded_text(value["summary"], "summary", 30000)
    for k in ("artifacts", "decisions", "next_steps"):
        if not isinstance(value[k], list) or len(value[k]) > 30:
            raise Invalid("Invalid completion " + k)
        for v in value[k]:
            bounded_text(v, k, 3000)
    return value


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
        for key, args in (("version", ["--version"]), ("root", ["--help"]), ("exec", ["exec", "--help"]), ("resume", ["exec", "resume", "--help"])):
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
                "model_verified": False, "note": "Help-only check. Authentication, model routing and sandbox enforcement have not been exercised. Headless exec may reject approval-required operations; no automatic approval review is enabled.",
                "help": output}
        self.capabilities = caps
        return caps

    def argv(self, config, cwd, sandbox, schema_path, session=None):
        caps = self.capabilities
        if not caps or not caps["ok"] or caps["prefix"] != command_prefix(config):
            raise Invalid("Run a successful CLI preflight before real work")
        if sandbox not in ("read-only", "workspace-write"):
            raise Invalid("Unsupported sandbox")
        # Use config overrides for approval policy: the root TUI -a flag does
        # not propagate into exec in 0.149.0. Exec further restricts user-mode
        # headless approvals to Never (deny escalation), per its source.
        args = caps["prefix"] + ["--config", 'approval_policy="on-request"',
                                 "--config", 'approvals_reviewer="user"',
                                 "--config", "sandbox_workspace_write.writable_roots=[]",
                                 "--config", "sandbox_workspace_write.network_access=false",
                                 "--config", "sandbox_workspace_write.exclude_tmpdir_env_var=true",
                                 "--config", "sandbox_workspace_write.exclude_slash_tmp=true", "exec", "--sandbox", sandbox]
        if session:
            if not caps["resume"]:
                raise Invalid("Installed CLI cannot resume this task. Revise using a fresh session.")
            # Only exact session IDs captured for this task, never --last.
            session_id(session)
            args += ["resume"]
        args += ["--json", "--model", bounded_text(config["model"], "model", 150)]
        if caps["resume_skip_git" if session else "skip_git"]:
            args += ["--skip-git-repo-check"]
        if caps["resume_schema" if session else "schema"]:
            args += ["--output-schema", str(schema_path)]
        if session:
            args += [session]
        return args + ["-"]

    def run(self, config, cwd, sandbox, prompt, schema_path, cancel, update, session=None, validator=completion):
        args = self.argv(config, cwd, sandbox, schema_path, session)
        kwargs = dict(cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                      text=True, encoding="utf-8", errors="replace", shell=False, bufsize=1)
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True
        process = self.popen(args, **kwargs)
        job = None
        stream = queue.Queue(maxsize=256)
        readers = []
        done = threading.Event()
        def read(pipe, channel):
            try:
                while not done.is_set():
                    line = pipe.readline(131073)
                    if not line:
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
        event_errors = []
        ended, count, total_bytes = set(), 0, 0
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
                    return {"status": "cancelled", "summary": "Stopped by user", "session_id": captured}
                if time.monotonic() - started > config["timeout_seconds"]:
                    return {"status": "blocked", "summary": "Time limit reached; an approval or tool may be waiting. No escalation attempted.", "session_id": captured}
                try:
                    channel, line = stream.get(timeout=0.1)
                except queue.Empty:
                    continue
                if line is None:
                    ended.add(channel)
                    continue
                total_bytes += len(line.encode("utf-8"))
                if len(line) > 131072 or total_bytes > 16 * 1024 * 1024:
                    raise Invalid("Worker event stream exceeded safety limit")
                if channel == "stderr":
                    if len(errors) < 30:
                        errors.append(line.strip()[:1000])
                    continue
                count += 1
                if count > 20000:
                    raise Invalid("Too many worker events")
                try:
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
                    update({"progress": "CLI reported a failure", "event": typ})
                elif typ.startswith("item."):
                    item = e.get("item", {})
                    if not isinstance(item, dict):
                        malformed += 1
                        continue
                    if typ == "item.completed" and item.get("type") == "agent_message":
                        final = item.get("text", "")
                    if item.get("type") in ("command_execution", "file_change", "plan_update", "agent_message"):
                        update({"progress": str(item.get("text") or (item.get("type", "Working") + ": " + item.get("status", "updated")))[:500], "event": typ})
            code = process.wait(timeout=5)
            fatal = event_errors + [x for x in errors if x and not x.startswith("WARNING:")]
            if code or not completed or malformed or not captured or event_errors:
                msg = "; ".join(fatal[-4:]) or "No verified completed turn/session, or malformed events"
                blocked = any(x in msg.lower() for x in ("approval", "permission", "sandbox", "denied", "authentication", "unauthorized", "login"))
                return {"status": "blocked" if blocked else "failed", "summary": msg, "session_id": captured}
            result = validator(json.loads(final or "null"))
            return dict(result, session_id=captured)
        except (Invalid, ValueError, TypeError, OSError, subprocess.SubprocessError) as e:
            return {"status": "failed", "summary": str(e), "session_id": captured}
        finally:
            done.set()
            stop_process(process, job)
            for t in readers:
                t.join(timeout=2)
            for pipe in (process.stdout, process.stderr):
                pipe.close()
