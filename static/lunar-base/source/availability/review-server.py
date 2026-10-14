"""Loopback-only UI fixture. No CoS service/database/jobs and no POST support."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit
local=Path(__file__).resolve().parent
root=local.parents[2]
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/':file=local/'review-fixture.html'
        elif path=='/fixture.js':file=local/'review-fixture.js'
        elif path.startswith('/lunar-base/'):
            file=(root/path.lstrip('/')).resolve()
            if not file.is_relative_to(root/'lunar-base'):self.send_error(403);return
        else:self.send_error(404);return
        if not file.is_file():self.send_error(404);return
        body=file.read_bytes();self.send_response(200);self.send_header('Content-Type',{'js':'text/javascript','html':'text/html','css':'text/css','png':'image/png'}.get(file.suffix[1:],'application/octet-stream'));self.send_header('Content-Length',len(body));self.end_headers();self.wfile.write(body)
    def do_PUT(self):
        if self.path!='/qa-capture' or self.headers.get('Origin')!='http://127.0.0.1:8907':self.send_error(403);return
        size=int(self.headers.get('Content-Length','0'))
        if not 0<size<80*1024*1024:self.send_error(413);return
        (local/'availability-browser-samples.json').write_bytes(self.rfile.read(size))
        self.send_response(200);self.end_headers()
    def do_POST(self):self.send_error(405,'No operational state writes are supported')
    def log_message(self,*args):pass
print('Synthetic availability QA: http://127.0.0.1:8907/ (no jobs or backend)',flush=True)
ThreadingHTTPServer(('127.0.0.1',8907),Handler).serve_forever()
