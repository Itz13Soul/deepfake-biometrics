import json
import os
import sys
from http.server import BaseHTTPRequestHandler

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _core import analyze, DEMO_FAKE, THRESHOLD

MAX_BYTES = 4_400_000


class handler(BaseHTTPRequestHandler):
    def _send(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200, {"ok": True, "model": "xception_stage2_full", "threshold": THRESHOLD, "fake_threshold": DEMO_FAKE})

    def do_POST(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BYTES:
            self._send(413, {"status": "error", "message": "Send one image smaller than 4 MB."})
            return
        data = self.rfile.read(n)
        try:
            self._send(200, analyze(data))
        except Exception:
            self._send(422, {"status": "error", "message": "This file could not be read as an image."})

    def log_message(self, *args):
        pass
