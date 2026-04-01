#!/usr/bin/env python3
import json
import os
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"


class RillHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/api/deepseek":
            self.send_error(404, "Not Found")
            return

        api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
        if not api_key:
            self._send_json(
                500,
                {
                    "error": {
                        "message": "Missing DEEPSEEK_API_KEY on server.",
                    }
                },
            )
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8")
            payload = json.loads(body)
        except Exception:
            self._send_json(400, {"error": {"message": "Invalid JSON payload"}})
            return

        upstream_req = Request(
            DEEPSEEK_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )

        try:
            with urlopen(upstream_req, timeout=60) as resp:
                data = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except HTTPError as e:
            error_data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(error_data)))
            self.end_headers()
            self.wfile.write(error_data)
        except URLError:
            self._send_json(502, {"error": {"message": "Failed to reach DeepSeek API"}})

    def _send_json(self, status_code, obj):
        raw = json.dumps(obj).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main():
    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("0.0.0.0", port), RillHandler)
    print(f"RiLL server running at http://localhost:{port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
