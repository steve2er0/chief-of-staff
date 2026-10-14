"""Disk-backed JSON records. Large strings and containers never fill the event queue.

The original JSON is retained; an on-disk index allows bounded previews and exact
permission replies. Only the browser preview is shortened, never the wire data.
"""
import codecs
import json
from pathlib import Path
import re
import sqlite3
import uuid

CHUNK = 65536
PREVIEW = 8192


class CapturedText(str):
    def __new__(cls, preview, record, start, size):
        value = super().__new__(cls, preview)
        value.record, value.start, value.size = record, start, size
        return value

    def save(self, target):
        with self.record.decoded.open('rb') as src, Path(target).open('wb') as dst:
            src.seek(self.start)
            remaining = self.size
            while remaining:
                chunk = src.read(min(CHUNK, remaining))
                if not chunk:
                    raise ValueError('Incomplete captured text')
                dst.write(chunk)
                remaining -= len(chunk)


class RawJSON:
    def __init__(self, node):
        self.path = node.record.path
        self.start, self.end = node.row[3:5]

    def write(self, sink):
        decoder = codecs.getincrementaldecoder('utf-8')()
        with self.path.open('rb') as src:
            src.seek(self.start)
            remaining = self.end - self.start
            while remaining:
                chunk = src.read(min(CHUNK, remaining))
                if not chunk:
                    raise ValueError('Incomplete captured JSON')
                sink.write(decoder.decode(chunk))
                remaining -= len(chunk)
            sink.write(decoder.decode(b'', final=True))


def write_json(value, sink):
    if isinstance(value, RawJSON):
        value.write(sink)
    elif isinstance(value, dict):
        sink.write('{')
        for i, (key, item) in enumerate(value.items()):
            if i:
                sink.write(',')
            sink.write(json.dumps(key) + ':')
            write_json(item, sink)
        sink.write('}')
    elif isinstance(value, list):
        sink.write('[')
        for i, item in enumerate(value):
            if i:
                sink.write(',')
            write_json(item, sink)
        sink.write(']')
    else:
        sink.write(json.dumps(value, ensure_ascii=False))


class Node:
    def __init__(self, record, row):
        self.record, self.row = record, row

    def get(self, key, default=None):
        row = self.record.db.execute('SELECT * FROM nodes WHERE parent=? AND name=?', (self.row[0], str(key))).fetchone()
        return self.record.value(row) if row else default

    def children(self):
        for row in self.record.db.execute('SELECT * FROM nodes WHERE parent=? ORDER BY id', (self.row[0],)):
            yield row[2], self.record.value(row)

    def __len__(self):
        return self.record.db.execute('SELECT count(*) FROM nodes WHERE parent=?', (self.row[0],)).fetchone()[0]

    def __iter__(self):
        return (value for key, value in self.children())

    def preview(self, budget=None):
        budget = budget if budget is not None else [65536]
        result = {} if self.row[2] == 'object' else []
        # Keep protocol identity/safety fields even if tool output came first.
        rows = self.record.db.execute("SELECT * FROM nodes WHERE parent=? ORDER BY CASE WHEN name IN ('id','method','type','threadId','turnId','status','phase','isSecret','questions') THEN 0 ELSE 1 END,id", (self.row[0],))
        for row in rows:
            if budget[0] <= 0:
                break
            key, value = row[2], self.record.value(row)
            value = value.preview(budget) if isinstance(value, Node) else value
            budget[0] -= len(key or '') + (len(value) if isinstance(value, str) else 32)
            if isinstance(result, dict):
                result[key] = value
            else:
                result.append(value)
        return result


class WireRecord:
    def __init__(self, path):
        self.path = Path(path)
        self.decoded = self.path.with_suffix('.text')
        self.index = self.path.with_suffix('.sqlite')
        self.db = sqlite3.connect(self.index)
        self.db.execute('PRAGMA cache_size=-512')
        if not self.db.execute("SELECT name FROM sqlite_master WHERE name='nodes'").fetchone():
            self.db.execute('CREATE TABLE nodes(id INTEGER PRIMARY KEY,parent INTEGER,name TEXT,kind TEXT,start INTEGER,end INTEGER,text_start INTEGER,text_size INTEGER,scalar TEXT)')
            self.db.execute('CREATE UNIQUE INDEX children ON nodes(parent,name)')
            try:
                with self.path.open('rb') as src, self.decoded.open('wb') as text:
                    Parser(src, text, self.db).parse()
                self.db.commit()
            except Exception:
                self.db.close()
                self.index.unlink(missing_ok=True)
                self.decoded.unlink(missing_ok=True)
                raise ValueError('Invalid captured JSON record')
        self.root = self.value(self.db.execute('SELECT * FROM nodes WHERE id=1').fetchone())

    def value(self, row):
        if row is None:
            return None
        if row[3] in ('object', 'array'):
            # Node indexes: id,parent,name,kind,start,end,text_start,text_size,scalar
            return Node(self, (row[0], row[2], row[3], row[4], row[5]))
        if row[3] == 'string':
            with self.decoded.open('rb') as src:
                src.seek(row[6])
                preview = src.read(min(row[7], PREVIEW)).decode('utf-8', errors='ignore')
            return CapturedText(preview, self, row[6], row[7]) if row[7] > PREVIEW else preview
        return json.loads(row[8])

    def close(self):
        self.db.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class Parser:
    def __init__(self, src, text, db):
        self.src, self.text, self.db = src, text, db
        self.chunk, self.pos, self.offset = b'', 0, 0

    def peek(self):
        if self.pos == len(self.chunk):
            self.chunk, self.pos = self.src.read(CHUNK), 0
        return self.chunk[self.pos:self.pos+1]

    def take(self):
        value = self.peek()
        if not value:
            raise ValueError('Incomplete JSON record')
        self.pos += 1
        self.offset += 1
        return value

    def space(self):
        while self.peek() and self.peek() in b' \r\n\t':
            self.take()

    def string(self):
        if self.take() != b'"':
            raise ValueError('Expected a JSON string')
        start = self.text.tell()
        decoder = codecs.getincrementaldecoder('utf-8')()
        while True:
            if not self.peek():
                raise ValueError('Unterminated JSON string')
            tail = self.chunk[self.pos:]
            match = re.search(br'["\\\x00-\x1f]', tail)
            size = match.start() if match else len(tail)
            if size:
                raw = tail[:size]
                decoder.decode(raw)  # Validate UTF-8 across chunk boundaries.
                self.text.write(raw)
                self.pos += size
                self.offset += size
                continue
            value = self.take()
            decoder.decode(b'', final=True)
            decoder = codecs.getincrementaldecoder('utf-8')()
            if value == b'"':
                break
            if value != b'\\':
                raise ValueError('Invalid JSON string control character')
            escape = self.take()
            if escape == b'u':
                digits = b''.join(self.take() for _ in range(4))
                code = int(digits, 16)
                if 0xD800 <= code <= 0xDBFF:
                    if self.take() + self.take() != b'\\u':
                        raise ValueError('Invalid Unicode surrogate pair')
                    low = int(b''.join(self.take() for _ in range(4)), 16)
                    if not 0xDC00 <= low <= 0xDFFF:
                        raise ValueError('Invalid Unicode surrogate pair')
                    code = 0x10000 + ((code - 0xD800) << 10) + low - 0xDC00
                self.text.write(chr(code).encode('utf-8'))
            else:
                self.text.write(json.loads(b'"\\' + escape + b'"').encode('utf-8'))
        return start, self.text.tell() - start

    def value(self, parent=None, name=None, depth=0):
        if depth > 128:
            raise ValueError('Invalid protocol JSON nesting')
        self.space()
        start, token = self.offset, self.peek()
        kind = 'object' if token == b'{' else 'array' if token == b'[' else 'string' if token == b'"' else 'scalar'
        nid = self.db.execute('INSERT INTO nodes(parent,name,kind,start) VALUES (?,?,?,?)', (parent, name, kind, start)).lastrowid
        text_start = text_size = scalar = None
        if kind == 'string':
            text_start, text_size = self.string()
        elif kind in ('object', 'array'):
            self.take()
            self.space()
            closing = b'}' if kind == 'object' else b']'
            index = 0
            if self.peek() != closing:
                while True:
                    if kind == 'object':
                        key_start, key_size = self.string()
                        # Object names are indexed on disk; protocol keys are short.
                        self.text.flush()
                        with Path(self.text.name).open('rb') as keys:
                            keys.seek(key_start)
                            key = keys.read(min(key_size, PREVIEW)).decode('utf-8')
                        self.space()
                        if self.take() != b':':
                            raise ValueError('Expected a JSON colon')
                    else:
                        key = str(index)
                    self.value(nid, key, depth+1)
                    index += 1
                    self.space()
                    if self.peek() == closing:
                        break
                    if self.take() != b',':
                        raise ValueError('Expected a JSON comma')
                    self.space()
            self.take()
        else:
            raw = bytearray()
            while self.peek() and self.peek() not in b',}] \t\r\n':
                raw.extend(self.take())
                if len(raw) > PREVIEW:
                    raise ValueError('Invalid JSON scalar')
            scalar = raw.decode('ascii')
            json.loads(scalar)
        self.db.execute('UPDATE nodes SET end=?,text_start=?,text_size=?,scalar=? WHERE id=?', (self.offset, text_start, text_size, scalar, nid))

    def parse(self):
        self.value()
        self.space()
        if self.peek():
            raise ValueError('Trailing JSON data')


def read_record(pipe, folder, done, threshold=65536):
    """Read one record in bounded chunks, spilling before any large allocation."""
    first = pipe.readline(threshold)
    if not first:
        return None
    if first.endswith('\n'):
        return first
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (str(uuid.uuid4()) + '.json')
    with path.open('w', encoding='utf-8') as dst:
        dst.write(first)
        while not done.is_set():
            chunk = pipe.readline(threshold)
            if not chunk:
                break
            dst.write(chunk)
            if chunk.endswith('\n'):
                break
    return path
