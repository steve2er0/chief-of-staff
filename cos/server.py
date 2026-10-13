import base64
import binascii
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading
from urllib.parse import parse_qs, quote, urlsplit

from .safety import Invalid, docx_text, digest
from .filesystem import browse_paths


class LocalServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, service):
        self.service = service
        self.token = secrets.token_urlsafe(32)
        self.csrf = secrets.token_urlsafe(32)
        self.mutation_lock = threading.RLock()
        self.static = Path(__file__).resolve().parent.parent / "static"
        super().__init__(("127.0.0.1", port), Handler)
        self.origin = "http://127.0.0.1:" + str(self.server_port)
        self.allowed_hosts = {"127.0.0.1:" + str(self.server_port), "localhost:" + str(self.server_port)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Do not leak the one-time launch token in HTTP logs.
        pass

    def send(self, status, data, content_type="application/json; charset=utf-8", cookie=False, attachment=None):
        if content_type.startswith("application/json"):
            data = json.dumps(data, ensure_ascii=False).encode("utf-8")
        elif isinstance(data, str):
            data = data.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if cookie:
            self.send_header("Set-Cookie", "cos_session=" + self.server.token + "; HttpOnly; SameSite=Strict; Path=/")
        if attachment:
            fallback = "".join(c for c in attachment if 32 <= ord(c) < 127).replace('"', '').replace('\\', '') or "reference"
            self.send_header("Content-Disposition", 'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + quote(attachment, safe=""))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if self.headers.get("Host") not in self.server.allowed_hosts:
            raise Invalid("Invalid host")
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            value = cookie["cos_session"].value if "cos_session" in cookie else ""
        except Exception:
            value = ""
        return secrets.compare_digest(value, self.server.token)

    def do_GET(self):
        try:
            u = urlsplit(self.path)
            if self.headers.get("Host") not in self.server.allowed_hosts:
                return self.send(403, {"error": "Invalid host"})
            if u.path == "/" and secrets.compare_digest(parse_qs(u.query).get("token", [""])[0], self.server.token):
                return self.send(200, (self.server.static / "index.html").read_bytes(), "text/html; charset=utf-8", cookie=True)
            if not self.authorized():
                return self.send(401, {"error": "Open the private launch URL printed by the service."})
            if u.path == "/":
                return self.send(200, (self.server.static / "index.html").read_bytes(), "text/html; charset=utf-8")
            if u.path in ("/app.js", "/workspace.js", "/conversation-feedback.js", "/reference-files.js", "/path-picker.js", "/styles.css"):
                path = self.server.static / u.path[1:]
                return self.send(200, path.read_bytes(), "text/javascript; charset=utf-8" if path.suffix == ".js" else "text/css; charset=utf-8")
            if u.path == "/api/state":
                return self.send(200, dict(self.server.service.snapshot(), csrf=self.server.csrf))
            parts = u.path.strip("/").split("/")
            if len(parts) == 3 and parts[:2] == ["api", "reference"]:
                record = self.server.service.store.get("reference", parts[2])
                file = self.server.service.reference_file(parts[2])
                return self.send(200, file.read_bytes(), "application/octet-stream", attachment=record["name"])
            if len(parts) == 4 and parts[:2] == ["api", "output"]:
                p = self.server.service.output(parts[2], parts[3])
                return self.send(200, p.read_bytes(), "application/octet-stream", attachment=p.name)
            return self.send(404, {"error": "Not found"})
        except (Invalid, ValueError, FileNotFoundError, OSError) as e:
            self.send(400, {"error": str(e)})

    def do_POST(self):
        with self.server.mutation_lock:
            self._post()

    def _post(self):
        try:
            if not self.authorized():
                return self.send(401, {"error": "Private session required"})
            if self.headers.get("Origin") != self.server.origin or not secrets.compare_digest(self.headers.get("X-CoS-CSRF", ""), self.server.csrf):
                return self.send(403, {"error": "Invalid request origin or CSRF token"})
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 12 * 1024 * 1024 or not self.headers.get("Content-Type", "").startswith("application/json"):
                return self.send(413, {"error": "Use a JSON request smaller than 12 MiB"})
            self.connection.settimeout(10)
            raw = json.loads(self.rfile.read(length))
            if not isinstance(raw, dict):
                raise Invalid("Request must be an object")
            path = urlsplit(self.path).path
            s = self.server.service
            request_id = raw.pop("request_id", None)
            import uuid
            try:
                if str(uuid.UUID(request_id)) != request_id:
                    raise ValueError()
            except (ValueError, TypeError, AttributeError):
                raise Invalid("A UUID request_id is required for safe repeated actions")
            if path == "/api/browse":
                # Navigation is read-only and ephemeral; don't retain listings in
                # mutation idempotency records or alter project context.
                return self.send(200, browse_paths(raw.get("mode", "directory"), raw.get("path", ""),
                    raw.get("root", ""), raw.get("query", ""), raw.get("show_hidden", False),
                    protected=(s.data, self.server.static.parent)))
            fingerprint = digest(json.dumps({"path": path, "body": raw}, sort_keys=True).encode())
            try:
                earlier = s.store.get("request", request_id)
            except ValueError:
                earlier = None
            if earlier:
                if earlier["fingerprint"] != fingerprint:
                    raise Invalid("Request ID already used with different input")
                return self.send(200, earlier["result"])
            if path == "/api/project":
                result = s.project(raw, raw.get("id"))
            elif path == "/api/project-review":
                result = s.request_project_review(raw["project_id"])
            elif path == "/api/cancel-project-review":
                result = s.cancel_project_review(raw["project_id"])
            elif path == "/api/discuss":
                result = s.discuss(raw["project_id"], raw["text"], raw.get("method", "local"), request_id=request_id)
            elif path == "/api/breakdown":
                result = s.breakdown(raw["project_id"], raw.get("method", "local"))
            elif path == "/api/proposal":
                result = s.adopt_proposal(raw["id"], raw["action"], raw.get("data"))
            elif path == "/api/work-item":
                result = s.work_item(raw["project_id"], raw, raw.get("id"))
            elif path == "/api/delegate":
                result = s.prepare_delegation(raw["project_id"], raw["item_ids"])
            elif path == "/api/partial":
                result = s.partial_result(raw["id"], raw["note"])
            elif path == "/api/portfolio":
                result = s.portfolio_preferences(raw)
            elif path == "/api/focus-advice":
                result = s.focus_advice()
            elif path == "/api/record":
                result = s.record(raw["project_id"], raw["text"], raw.get("category", "suggestion"), raw.get("provenance", "User entry"))
            elif path == "/api/resolve":
                result = s.resolve_batch(raw["items"])
            elif path == "/api/plan":
                result = s.plan(raw["project_id"], raw["bullets"], raw.get("source", "Pasted daily log"), raw.get("method", "local"))
            elif path == "/api/edit-plan":
                result = s.edit_plan(raw["id"], raw["revision"], raw["specs"])
            elif path == "/api/approve":
                result = s.approve(raw["id"], raw["revision"])
            elif path == "/api/launch":
                result = s.launch(raw["id"])
            elif path == "/api/action":
                result = s.action(raw["id"], raw["action"], raw.get("note", ""), raw.get("confirmed_stopped", False), raw.get("fresh", False), raw.get("complete_item", False))
            elif path == "/api/review":
                result = s.review(raw["id"], raw.get("method", "local"))
            elif path == "/api/stop-job":
                result = s.stop_job(raw["id"], raw.get("confirmed_stopped", False))
            elif path == "/api/briefing":
                result = s.briefing()
            elif path == "/api/settings":
                result = s.settings(raw)
            elif path == "/api/preflight":
                result = s.preflight()
            elif path == "/api/reference-upload":
                result = s.import_reference(raw["filename"], base64.b64decode(raw["base64"], validate=True))
            elif path == "/api/reference-discard":
                result = s.discard_reference(raw["id"])
            elif path == "/api/import":
                # Browser-picked bytes only: no server-side arbitrary path access.
                data = base64.b64decode(raw["base64"], validate=True)
                text, sha = docx_text(data, raw["filename"])
                result = {"text": text, "source": "Read-only DOCX import: " + Path(raw["filename"]).name + " / SHA256 " + sha, "sha256": sha}
            else:
                return self.send(404, {"error": "Unknown action"})
            s.store.put("request", {"id": request_id, "fingerprint": fingerprint, "result": result})
            self.send(200, result)
        except (Invalid, ValueError, KeyError, TypeError, binascii.Error, FileNotFoundError, OSError) as e:
            self.send(400, {"error": str(e)})
        except Exception:
            self.send(500, {"error": "Unexpected server error; consult the local audit log"})
