// Express: create codes and proxy the print-ready SVG. node server.js (Node 18+)
import express from "express";
import { QRFlow, QRFlowError } from "qrflow";

const app = express();
app.use(express.json());
const qr = new QRFlow(process.env.QRFLOW_KEY);

app.post("/qr", async (req, res) => {
  try {
    const { code } = await qr.createCode({ type: "url", destination_data: { url: req.body.url }, label: req.body.label });
    res.status(201).json({ id: code.id, short_url: code.short_url });
  } catch (e) {
    if (e instanceof QRFlowError) return res.status(e.status).json({ error: e.code, message: e.message });
    throw e;
  }
});

app.get("/qr/:id.svg", async (req, res) => {
  res.type("image/svg+xml").send(await qr.image(req.params.id));
});

app.listen(3000, () => console.log("http://localhost:3000"));
