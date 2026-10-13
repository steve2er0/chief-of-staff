import json
import sqlite3
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import uuid


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def uid():
    return str(uuid.uuid4())


class Store:
    """All read/modify/write flows use one reentrant transaction lock."""
    def __init__(self, folder):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.instance = (self.folder / ".instance.lock").open("a+b")
        try:
            import os
            if os.name == "nt":
                import msvcrt
                self.instance.seek(0)
                self.instance.write(b"0")
                self.instance.flush()
                self.instance.seek(0)
                msvcrt.locking(self.instance.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(self.instance.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            self.instance.close()
            raise ValueError("Another service owns this data folder. Stop it before starting again.") from e
        self.lock = threading.RLock()
        self.db = sqlite3.connect(str(self.folder / "cos.sqlite3"), check_same_thread=False)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute("CREATE TABLE IF NOT EXISTS objects(kind TEXT, id TEXT, body TEXT NOT NULL, PRIMARY KEY(kind,id))")
        self.db.execute("CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, action TEXT, target TEXT, details TEXT)")
        self.db.commit()
        self.depth = 0

    @contextmanager
    def transaction(self):
        with self.lock:
            outer = self.depth == 0
            if outer:
                self.db.execute("BEGIN IMMEDIATE")
            self.depth += 1
            try:
                yield
                if outer:
                    self.db.commit()
            except BaseException:
                if outer:
                    self.db.rollback()
                raise
            finally:
                self.depth -= 1

    def get(self, kind, key):
        with self.lock:
            row = self.db.execute("SELECT body FROM objects WHERE kind=? AND id=?", (kind, key)).fetchone()
            if not row:
                raise ValueError("Unknown " + kind)
            return json.loads(row[0])

    def all(self, kind):
        with self.lock:
            return [json.loads(x[0]) for x in self.db.execute("SELECT body FROM objects WHERE kind=? ORDER BY rowid", (kind,))]

    def put(self, kind, obj):
        with self.transaction():
            self.db.execute("INSERT INTO objects(kind,id,body) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body", (kind, obj["id"], json.dumps(obj)))
        return obj

    def audit(self, action, target, details=""):
        with self.transaction():
            self.db.execute("INSERT INTO audit(time,action,target,details) VALUES (?,?,?,?)", (now(), action, target, str(details)[:3000]))

    def events(self):
        with self.lock:
            rows = self.db.execute("SELECT time,action,target,details FROM audit ORDER BY seq DESC LIMIT 100").fetchall()
            return [dict(zip(("time", "action", "target", "details"), r)) for r in rows]

    def close(self):
        with self.lock:
            self.db.close()
            self.instance.close()
