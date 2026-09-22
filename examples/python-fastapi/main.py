# FastAPI: create codes and serve the print-ready SVG.
# Copy ../../python/qrflow.py next to this file. QRFLOW_KEY in the environment.
import os
import urllib.request

from fastapi import FastAPI, HTTPException, Response
from qrflow import QRFlow, QRFlowError

app = FastAPI()
qr = QRFlow(os.environ["QRFLOW_KEY"])


@app.post("/qr")
def make_qr(url: str, label: str | None = None):
    try:
        code = qr.create_code(type="url", destination_data={"url": url}, label=label)["code"]
    except QRFlowError as e:
        raise HTTPException(e.status, {"error": e.code, "message": str(e)})
    return {"id": code["id"], "short_url": code["short_url"]}


@app.get("/qr/{code_id}.svg")
def qr_image(code_id: str):
    req = urllib.request.Request(qr.image_url(code_id), headers={"Authorization": f"Bearer {os.environ['QRFLOW_KEY']}"})
    with urllib.request.urlopen(req) as r:
        return Response(r.read(), media_type="image/svg+xml")
