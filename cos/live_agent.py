"""Two-way, task-scoped Codex app-server transport using the existing CLI login."""
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import tempfile
import uuid

from .adapter import MAX_EVENT_BYTES, WindowsJob, command_prefix, completion, session_id, stop_process
from .safety import Invalid
from .wire import CapturedText, Node, WireRecord, read_record, write_json


class AgentControl:
    def __init__(self):
        self.actions = queue.Queue()
        self.lock = threading.Lock()
        self.closed = False

    def submit(self, action):
        with self.lock:
            if self.closed:
                return False
            self.actions.put(action)
            return True

    def close(self):
        with self.lock:
            self.closed = True
            remaining = []
            while not self.actions.empty():
                remaining.append(self.actions.get_nowait())
            return remaining


def report(text, status, captured, artifacts, cwd=None):
    """The transport determines turn success; prose is a valid returned result."""
    try:
        value = json.loads(text)
    except (ValueError, TypeError):
        value = None
    parsed = value if isinstance(value, dict) else {}
    try:
        result = dict(completion(parsed))
    except Invalid:
        result = {"status": "completed", "summary": (parsed.get("summary") if isinstance(parsed.get("summary"), str) else None) or text or "Agent turn finished without a written summary.",
                  "artifacts": parsed.get("artifacts", []) if isinstance(parsed.get("artifacts"), list) else [],
                  "decisions": [], "next_steps": [], "report_format": "prose"}
    if status != "completed":
        result["status"] = "cancelled" if status == "interrupted" else "failed"
    paths = set(artifacts)
    if cwd and isinstance(text, str):
        base = Path(cwd).resolve()
        candidates = re.findall(r"\[[^\]\n]*\]\(<?([^\n)>]+)>?\)", text) + re.findall(r"`([^`\n]+)`", text)
        for candidate in candidates:
            candidate = re.sub(r":\d+(?::\d+)?$", "", candidate)
            path = Path(candidate)
            path = path if path.is_absolute() else base / path
            try:
                relative = path.absolute().relative_to(base)
                if path.resolve().is_relative_to(base) and path.is_file():
                    paths.add(str(relative))
            except (ValueError, OSError):
                pass
    result["artifacts"] = list(dict.fromkeys(x for x in result["artifacts"] + sorted(paths) if isinstance(x, str)))
    result = dict(result, session_id=captured, agent_report=str(text), execution_verified=status == "completed")
    if isinstance(text, CapturedText):
        path = text.record.path.with_suffix('.report.txt')
        text.save(path)
        result.update(agent_report_file=str(path), report_truncated=True)
        result.setdefault("delivery_notes", []).append("Full report saved in the report download; the live view shows a preview.")
    return result


def run_agent(adapter, config, cwd, sandbox, prompt, cancel, update, control, session=None,
              research_access=False, execution_policy="sandboxed"):
    caps = adapter.capabilities
    if not caps or not caps.get("app_server") or caps.get("prefix") != command_prefix(config):
        raise Invalid("This CLI needs an app-server capability check for live replies")
    if sandbox not in ("read-only", "workspace-write") or execution_policy not in ("sandboxed", "yolo"):
        raise Invalid("Unsupported agent execution policy")
    if execution_policy == "yolo" and sandbox != "workspace-write":
        raise Invalid("YOLO cannot enforce read-only access")
    if session:
        session_id(session)
    args = caps["prefix"] + ["app-server", "--listen", "stdio://"]
    kwargs = dict(cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                  text=True, encoding="utf-8", errors="replace", shell=False)
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    process = adapter.popen(args, **kwargs)
    job = None
    events = queue.Queue(maxsize=8)
    done = threading.Event()
    readers = []
    pending = {}
    requests = {}
    serial = 0
    captured = session
    turn_id = None
    final = ""
    artifacts = set()
    warnings = []
    started = time.monotonic()
    turn_status = None
    capture_dir = config.get("_capture_dir") or Path(tempfile.gettempdir()) / ("cos-agent-wire-" + str(uuid.uuid4()))

    def send(value):
        write_json(value, process.stdin)
        process.stdin.write("\n")
        process.stdin.flush()

    def call(method, params, action=None):
        nonlocal serial
        serial += 1
        pending[serial] = (method, action)
        send({"id": serial, "method": method, "params": params})

    def receipt(action, status, error=""):
        if action and action.get("message_id"):
            update({"delivery": {"id": action["message_id"], "status": status, "error": error}})

    def read(pipe, channel):
        try:
            while not done.is_set():
                line = read_record(pipe, capture_dir, done)
                if not line:
                    break
                value = line
                while not done.is_set():
                    try:
                        events.put((channel, value), timeout=.1)
                        break
                    except queue.Full:
                        pass
        finally:
            while not done.is_set():
                try:
                    events.put((channel, None), timeout=.1)
                    break
                except queue.Full:
                    pass

    def start_turn():
        policy = ({"type": "dangerFullAccess"} if execution_policy == "yolo" else
                  {"type": "readOnly", "networkAccess": bool(research_access)} if sandbox == "read-only" else
                  {"type": "workspaceWrite", "writableRoots": [], "networkAccess": bool(research_access)})
        call("turn/start", {"threadId": captured, "input": [{"type": "text", "text": prompt}],
                            "cwd": cwd, "model": config["model"], "sandboxPolicy": policy,
                            "approvalPolicy": "never" if execution_policy == "yolo" else "on-request"})

    try:
        if os.name == "nt":
            job = WindowsJob(process)
        update({"worker_pid": process.pid, "progress": "Connecting agent session", "progress_kind": "activity", "event": "process.started"})
        for channel, pipe in (("stdout", process.stdout), ("stderr", process.stderr)):
            thread = threading.Thread(target=read, args=(pipe, channel), daemon=True)
            thread.start()
            readers.append(thread)
        call("initialize", {"clientInfo": {"name": "chief_of_staff", "title": "Chief of Staff", "version": "1.0"},
                            "capabilities": {"experimentalApi": True}})
        while turn_status is None:
            if cancel.is_set():
                if captured and turn_id:
                    call("turn/interrupt", {"threadId": captured, "turnId": turn_id})
                return report(final or "Stopped by user. Saved files and session remain available.", "interrupted", captured, artifacts)
            if config["timeout_seconds"] and time.monotonic() - started > config["timeout_seconds"]:
                result = report(final or "Agent time limit reached. Continue this session to finish the work.", "interrupted", captured, artifacts)
                result["status"] = "blocked"
                return result
            if captured and turn_id:
                while not control.actions.empty():
                    action = control.actions.get_nowait()
                    if action["kind"] == "message":
                        call("turn/steer", {"threadId": captured, "expectedTurnId": turn_id,
                                           "input": [{"type": "text", "text": action["text"]}],
                                           "clientUserMessageId": action["message_id"]}, action)
                    else:
                        wire_id = action["wire_id"]
                        if wire_id not in requests:
                            receipt(action, "failed", "This request is no longer waiting for a response")
                            continue
                        send({"id": wire_id, "result": action["response"]})
                        requests.pop(wire_id)
                        update({"live_request_resolved": str(wire_id)})
                        receipt(action, "delivered")
            try:
                channel, line = events.get(timeout=.1)
            except queue.Empty:
                continue
            if line is None:
                if channel == "stdout":
                    raise Invalid("Agent connection closed before its turn finished")
                continue
            if isinstance(line, dict):
                warnings.append(line["capture_warning"])
                update({"progress": line["capture_warning"], "progress_kind": "activity"})
                continue
            if channel == "stderr":
                continue  # Diagnostic stderr is not evidence that the turn failed.
            record = None
            captured_text = None
            questions_omitted = False
            has_secret_questions = False
            try:
                if isinstance(line, Path):
                    record = WireRecord(line)
                    if not isinstance(record.root, Node):
                        raise ValueError()
                    event = record.root.preview()
                    original = record.root.get("params")
                    if isinstance(original, Node):
                        questions = original.get("questions")
                        if isinstance(questions, Node):
                            questions_omitted = len(questions) != len(event.get("params", {}).get("questions", []))
                            has_secret_questions = any(q.get("isSecret", False) for q in questions if isinstance(q, Node))
                        original_item = original.get("item")
                        if isinstance(original_item, Node):
                            captured_text = original_item.get("text")
                    record.close()
                else:
                    event = json.loads(line)
                if not isinstance(event, dict):
                    raise ValueError()
            except (ValueError, TypeError):
                if record:
                    record.close()
                warnings.append("An invalid app-server record was omitted.")
                continue
            if "method" not in event and "id" in event:
                method, action = pending.pop(event["id"], (None, None))
                if "error" in event:
                    error = str(event["error"].get("message", event["error"]))
                    if action:
                        # A rejected steer was never accepted; safely carry it to the next turn.
                        receipt(action, "queued_next" if method == "turn/steer" else "failed", error)
                        continue
                    raise Invalid(error)
                value = event.get("result", {})
                if method == "initialize":
                    send({"method": "initialized", "params": {}})
                    options = {"cwd": cwd, "model": config["model"],
                               "sandbox": "danger-full-access" if execution_policy == "yolo" else sandbox,
                               "approvalPolicy": "never" if execution_policy == "yolo" else "on-request",
                               "approvalsReviewer": "user"}
                    if session:
                        options["threadId"] = session
                    call("thread/resume" if session else "thread/start", options)
                elif method in ("thread/start", "thread/resume"):
                    sid = session_id(value["thread"]["id"])
                    if captured and sid != captured:
                        raise Invalid("CLI session does not match this agent")
                    captured = sid
                    update({"session_id": captured, "event": "thread.started", "progress": "Agent connected", "progress_kind": "activity"})
                    start_turn()
                elif method == "turn/start":
                    turn_id = value["turn"]["id"]
                    update({"turn_id": turn_id, "initial_sent": True, "progress": "Agent started working", "progress_kind": "activity"})
                elif method == "turn/steer":
                    if value.get("turnId") != turn_id:
                        receipt(action, "uncertain", "Agent acknowledged a different turn; inspect the session before retrying")
                    else:
                        receipt(action, "delivered")
                continue
            method = event.get("method", "")
            params = event.get("params") or {}
            if params.get("threadId") and params["threadId"] != captured:
                raise Invalid("Agent event belongs to another session")
            if "id" in event:
                supported = {"item/tool/requestUserInput", "item/commandExecution/requestApproval", "item/fileChange/requestApproval", "item/permissions/requestApproval", "mcpServer/elicitation/request"}
                if method not in supported:
                    send({"id": event["id"], "error": {"code": -32601, "message": "This client does not support this request"}})
                    continue
                if params.get("turnId") and turn_id and params["turnId"] != turn_id:
                    raise Invalid("Agent request belongs to a different turn")
                requests[event["id"]] = True
                update({"live_request": {"id": str(event["id"]), "wire_id": event["id"], "method": method,
                                         "params": params, "status": "pending", **({"capture_name": line.name, "questions_omitted": questions_omitted, "has_secret_questions": has_secret_questions} if record else {})}, "progress_kind": "activity", "progress": "Agent is waiting for your response"})
            elif method == "serverRequest/resolved":
                requests.pop(params.get("requestId"), None)
                update({"live_request_resolved": str(params.get("requestId"))})
            elif method == "turn/started":
                turn_id = params["turn"]["id"]
                update({"turn_id": turn_id})
            elif method in ("item/started", "item/completed"):
                item = params.get("item", {})
                typ = item.get("type")
                if typ == "agentMessage" and method == "item/completed":
                    text = item.get("text", "")
                    if captured_text is not None:
                        text = captured_text
                    if item.get("phase") != "commentary":
                        final = text
                    update({"progress": text, "progress_kind": "message", "event": method,
                            "agent_message": {"id": item.get("id"), "text": str(text), **({"capture_name": line.name} if record else {})}})
                elif typ in ("commandExecution", "fileChange", "mcpToolCall", "webSearch"):
                    if typ == "fileChange":
                        for change in item.get("changes", []):
                            path = Path(change.get("path", ""))
                            path = path if path.is_absolute() else Path(cwd) / path
                            try:
                                if path.is_file():
                                    artifacts.add(str(path.resolve().relative_to(Path(cwd).resolve())))
                            except ValueError:
                                pass
                    update({"progress": typ + ": " + item.get("status", "working"), "progress_kind": "activity", "event": method})
            elif method == "turn/completed":
                turn = params["turn"]
                if turn_id and turn["id"] != turn_id:
                    raise Invalid("Agent completed a different turn")
                turn_status = turn["status"]
                if turn.get("error"):
                    final = final or str(turn["error"].get("message", turn["error"]))
        # A turn can finish immediately before a steer receipt reaches stdout.
        # Give already-written requests a bounded chance to acknowledge or reject;
        # never infer delivery from the completed turn itself.
        receipt_deadline = time.monotonic() + .5
        while any(action for method, action in pending.values()) and time.monotonic() < receipt_deadline:
            try:
                channel, line = events.get(timeout=.05)
            except queue.Empty:
                continue
            if channel != "stdout" or line is None:
                continue
            try:
                if isinstance(line, Path):
                    saved_record = WireRecord(line)
                    try:
                        event = saved_record.root.preview() if isinstance(saved_record.root, Node) else None
                    finally:
                        saved_record.close()
                else:
                    event = json.loads(line)
            except (ValueError, TypeError):
                continue
            if not isinstance(event, dict) or "method" in event or event.get("id") not in pending:
                continue
            method, action = pending.pop(event["id"])
            if not action:
                continue
            if "error" in event:
                receipt(action, "queued_next", str(event["error"].get("message", event["error"])))
            elif event.get("result", {}).get("turnId") == turn_id:
                receipt(action, "delivered")
            else:
                receipt(action, "uncertain", "Agent acknowledged a different turn")
        result = report(final, turn_status, captured, artifacts, cwd)
        if warnings:
            result.setdefault("delivery_notes", []).extend(warnings)
        return result
    except (Invalid, ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as error:
        result = report(final or str(error), "failed", captured, artifacts)
        result["connection_error"] = str(error)
        return result
    finally:
        # Never silently resend a message whose acceptance is uncertain.
        for method, action in pending.values():
            receipt(action, "uncertain", "Connection ended before a delivery receipt; inspect the session before retrying")
        for action in control.close():
            receipt(action, "queued_next")
        if requests:
            update({"live_requests_closed": True})
        done.set()
        stop_process(process, job)
        for thread in readers:
            thread.join(timeout=2)
        for pipe in (process.stdin, process.stdout, process.stderr):
            try:
                pipe.close()
            except OSError:
                pass
