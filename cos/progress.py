"""Human updates and tool activity are separate; neither implies completion."""
import json
import re
from .owner_requests import validate_requests, apply_request_update
from .safety import Invalid


TOOL_EVENT = re.compile(r"^(command_execution|file_change|plan_update):\s*\w+$")


def message_details(text):
    if not isinstance(text, str) or not text.strip():
        return None
    value = text.strip()
    if TOOL_EVENT.fullmatch(value):
        return None
    if value.startswith(("{", "[")):
        try:
            data = json.loads(value)
        except ValueError:
            return None  # Don't expose fragments of a structured response.
        if not isinstance(data, dict) or not isinstance(data.get("summary"), str):
            return None
        value = data["summary"].strip()
        status = data.get("status")
    else:
        status = None
    if not value:
        return None
    result={"text": value[:2000], "reported_status": status if status in ("blocked", "failed") else None}
    if isinstance(locals().get("data"),dict) and "user_requests" in data:
        try:result["user_requests"]=validate_requests(data["user_requests"])
        except Invalid:result["user_requests_error"]="Malformed explicit owner request; prior requests remain unchanged"
    return result


def apply_progress(record, changes, at):
    record.update({k: v for k, v in changes.items() if k in ("session_id", "worker_pid")})
    record["updated"] = record["last_activity_at"] = at
    if changes.get("event") == "process.started":
        record.setdefault("started_at", at)
    raw = str(changes.get("progress", ""))[:2000]
    details = None if changes.get("progress_kind") == "activity" else message_details(raw)
    if details:
        if changes.get("reported_status") in ("blocked", "failed"):
            details["reported_status"] = changes["reported_status"]
        record.update(progress=details["text"], latest_update=details["text"], latest_update_at=at,
                      reported_status=details["reported_status"])
    elif raw:
        record["activity"] = raw
        record.setdefault("progress", "Agent is working.")
    if "user_requests" in changes or (details and "user_requests" in details):
        apply_request_update(record,changes.get("user_requests",details.get("user_requests") if details else None),at)
    if details and details.get("user_requests_error"):record["user_requests_error"]=details["user_requests_error"]
    if "history" in record:
        record["history"] = (record["history"] + [{"at": at, "event": changes.get("event", "progress"),
            "kind": "message" if details else "activity", "text": raw}])[-100:]


def activity_snapshot(record):
    """Presentation for old saved records as well as newly streamed events."""
    result = dict(record)
    if not result.get("latest_update"):
        for event in reversed(record.get("history", [])):
            if event.get("kind") == "activity" or event.get("event") in ("process.started", "thread.started"):
                continue
            details = message_details(event.get("text"))
            if details:
                result.update(latest_update=details["text"], latest_update_at=event["at"],
                              reported_status=details["reported_status"])
                break
    if not result.get("started_at"):
        result["started_at"] = next((h["at"] for h in record.get("history", []) if h.get("event") == "process.started"), None)
    result.setdefault("last_activity_at", record.get("updated"))
    return result
