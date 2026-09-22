"""QRFLOW.codes API client, one file, standard library only (Python 3.9+).
Docs: https://qrflow.codes/developers

    from qrflow import QRFlow
    qr = QRFlow(os.environ["QRFLOW_KEY"])
    code = qr.create_code(type="url", destination_data={"url": "https://example.com/menu"}, label="Menu")["code"]
    print(code["short_url"], code["image_url"])
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional


class QRFlowError(Exception):
    def __init__(self, status: int, code: str, message: str, retry_after: Optional[int] = None):
        super().__init__(f"{status} {code}: {message}")
        self.status, self.code, self.message, self.retry_after = status, code, message, retry_after


class QRFlow:
    def __init__(self, key: str, base: str = "https://qrflow.codes/api/v1", timeout: float = 30.0):
        self.key, self.base, self.timeout = key, base.rstrip("/"), timeout

    def _call(self, method: str, path: str, body: Any = None, query: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base + path
        if query:
            url += "?" + urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {self.key}", "Accept": "application/json", **({"Content-Type": "application/json"} if data else {})})
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                raw = res.read()
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as e:
            raw = e.read()
            try:
                j = json.loads(raw) if raw else {}
            except ValueError:
                j = {}
            retry = e.headers.get("Retry-After")
            raise QRFlowError(e.code, j.get("error", "http_error"), j.get("message", f"HTTP {e.code}"), int(retry) if retry else None) from None

    def me(self): return self._call("GET", "/me")
    def catalog(self): return self._call("GET", "/catalog")
    def list_codes(self, limit: int = 50, q: Optional[str] = None): return self._call("GET", "/codes", query={"limit": limit, "q": q})
    def get_code(self, code_id: str): return self._call("GET", f"/codes/{code_id}")
    def create_code(self, **fields): return self._call("POST", "/codes", fields)
    def update_code(self, code_id: str, **patch): return self._call("PATCH", f"/codes/{code_id}", patch)
    def delete_code(self, code_id: str): return self._call("DELETE", f"/codes/{code_id}")
    def make_dynamic(self, code_id: str): return self._call("POST", f"/codes/{code_id}/dynamic")
    def scans(self, code_id: str, from_: Optional[str] = None, to: Optional[str] = None, group: str = "day"): return self._call("GET", f"/codes/{code_id}/scans", query={"from": from_, "to": to, "group": group})
    def bulk_create(self, rows: List[Dict[str, str]], **colors): return self._call("POST", "/codes/bulk", {"rows": rows, **colors})
    def domains(self): return self._call("GET", "/domains")
    def list_webhooks(self): return self._call("GET", "/webhooks")
    def create_webhook(self, url: str, events: List[str], description: Optional[str] = None): return self._call("POST", "/webhooks", {"url": url, "events": events, "description": description})
    def test_webhook(self, webhook_id: str): return self._call("POST", f"/webhooks/{webhook_id}")
    def delete_webhook(self, webhook_id: str): return self._call("DELETE", f"/webhooks/{webhook_id}")
    def image_url(self, code_id: str, size: int = 1024) -> str: return f"{self.base}/codes/{code_id}/image.svg?size={size}"


def verify_webhook(raw_body: bytes, signature_header: str, secret: str, tolerance_seconds: int = 300) -> bool:
    """Verify X-QRFLOW-Signature (t=…,v1=…): HMAC-SHA256 of f"{t}.{raw_body}" with the webhook secret."""
    t = re.search(r"t=(\d+)", signature_header)
    v1 = re.search(r"v1=([a-f0-9]+)", signature_header)
    if not t or not v1 or abs(time.time() - int(t.group(1))) > tolerance_seconds:
        return False
    expected = hmac.new(secret.encode(), t.group(1).encode() + b"." + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1.group(1))
