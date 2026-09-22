# Flask: receive and verify QRFLOW webhooks.
# Copy ../../python/qrflow.py next to this file. QRFLOW_WEBHOOK_SECRET in the environment.
import json
import os

from flask import Flask, abort, request
from qrflow import verify_webhook

app = Flask(__name__)


@app.post("/qrflow")
def hook():
    raw = request.get_data()  # bytes, before any parsing
    if not verify_webhook(raw, request.headers.get("X-QRFLOW-Signature", ""), os.environ["QRFLOW_WEBHOOK_SECRET"]):
        abort(401)
    evt = json.loads(raw)
    if evt["event"] == "scan":
        for s in evt["data"]["scans"]:
            print(s["code_id"], s["scanned_at"], s["country"], s["device"])
    return "", 204
