# qrflow (Python)

A single-file client for the QRFLOW.codes API. Python 3.9+, standard library only. Copy `qrflow.py` next to your code (a PyPI package will follow).

```python
import os
from qrflow import QRFlow, QRFlowError

qr = QRFlow(os.environ["QRFLOW_KEY"])
code = qr.create_code(type="url", destination_data={"url": "https://acme.com/menu"}, label="Table tents")["code"]
print(code["short_url"])                       # print this
qr.update_code(code["id"], destination_data={"url": "https://acme.com/menu-fall"})
print(qr.scans(code["id"], group="day"))
```

Methods: `me`, `catalog`, `list_codes`, `get_code`, `create_code`, `update_code`, `delete_code`, `make_dynamic`, `scans`, `bulk_create`, `domains`, `list_webhooks`, `create_webhook`, `test_webhook`, `delete_webhook`, `image_url`, plus `verify_webhook(raw_body, header, secret)`.

Docs: https://qrflow.codes/developers · Markdown for agents: https://qrflow.codes/llms-full.txt
