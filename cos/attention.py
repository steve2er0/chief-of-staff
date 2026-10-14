"""Read-only attention queue derived from durable workflow records."""


def attention_queue(store):
    items = []
    projects = {p["id"]: p for p in store.all("project")}

    def add(kind, target, project_id, title, reason, action, group, priority, updated):
        if project_id not in projects:
            return
        items.append({"id": kind + ":" + target, "kind": kind, "target_id": target,
                      "project_id": project_id, "project": projects[project_id]["name"],
                      "title": title, "reason": reason, "action": action,
                      "group": group, "priority": priority, "updated": updated})

    for plan in store.all("plan"):
        if plan["state"] in ("draft", "approved"):
            approved = plan["state"] == "approved"
            stale = projects.get(plan["project_id"], {}).get("version") != plan["context"]["version"]
            add("plan", plan["id"], plan["project_id"], plan["specs"][0]["title"],
                "Project context changed; review the refreshed brief before approval." if stale else
                "Approved assignment is waiting for your explicit launch." if approved else "Review the scope, execution policy and completion criteria.",
                "Review & launch" if approved and not stale else "Review assignment", "approvals", 3 if approved else 4, plan.get("created", ""))

    tasks = {t["id"]: t for t in store.all("task")}
    for task in tasks.values():
        status = task["state"]
        pending = [r for r in task.get("live_requests", []) if r["status"] in ("pending", "sending")]
        if pending and status == "running":
            request = pending[0]
            params = request["params"]
            reason = " · ".join(q["question"] for q in params.get("questions", [])) or params.get("reason") or params.get("message") or "The agent needs a tool permission."
            add("task", task["id"], task["project_id"], task["title"], reason, "Reply to agent", "handoffs", 0, task["updated"])
            continue
        linked = task.get("user_request_links",{})
        if task.get("user_requests",{}).get("state")=="needs_user" and any(r["id"]==v["record_id"] and r["status"] in ("open","suggested") for r in projects.get(task["project_id"],{}).get("records",[]) for v in linked.values()):
            continue
        if status == "ready_for_review":
            if task.get("managed_agent") and not task.get("decisions_needed") and task.get("user_requests", {}).get("state") != "needs_user":
                continue  # Finished managed-agent work is collected in Results; acceptance is optional.
            add("task", task["id"], task["project_id"], task["title"],
                "Review changes, reported checks and remaining limits before accepting.", "Review result", "reviews", 2, task["updated"])
        elif status in ("blocked", "failed", "interrupted", "paused"):
            add("task", task["id"], task["project_id"], task["title"],
                (task.get("handoff_issues") or [None])[0] or (task.get("result") or {}).get("summary") or task.get("latest_update") or task.get("progress") or "Decide how to continue the saved work.",
                "Review handoff & resume", "handoffs", 0 if status != "paused" else 3, task["updated"])

    for project in projects.values():
        for record in project["records"]:
            if record.get("user_request_task_id") and tasks.get(record["user_request_task_id"], {}).get("state") in ("superseded", "cancelled"):
                continue
            if record["status"] == "open" and record["category"] == "question":
                add("record", record["id"], project["id"], record["text"], "Reply to continue the agent." if record.get("user_request_task_id") else "Save your answer in project context.",
                    "Answer question", "handoffs", 1, record["created"])
            elif record["status"] == "suggested" and record["category"] in ("decision", "assumption"):
                add("record", record["id"], project["id"], record["text"], "Review this proposed decision or assumption.",
                    "Review decision", "approvals", 4, record["created"])

    # Retried coordinator failures must not remain as duplicate attention items.
    latest_jobs = {}
    for job in store.all("job"):
        latest_jobs[(job["project_id"], job["kind"])] = job
    for job in latest_jobs.values():
        if job["state"] in ("failed", "blocked", "interrupted"):
            add("job", job["id"], job["project_id"], "CoS " + job["kind"], job.get("progress", "CoS call needs attention."),
                "Review CoS handoff", "handoffs", 0, job.get("updated", ""))
    return sorted(items, key=lambda item: (item["priority"], item["updated"], item["id"]))
