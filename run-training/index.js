const express = require("express");
const puppeteer = require("puppeteer-core");

const app = express();
app.use(express.json({ limit: "10mb" })); // 署名画像があるので大きめ

app.options("*", (req, res) => {
  res.set("Allow", "POST, OPTIONS");
  return res.status(204).send("");
});

app.post("/api/training", async (req, res) => {
  try {
    const GAS_ENDPOINT = process.env.GAS_ENDPOINT || "";
    if (!GAS_ENDPOINT) {
      return res.status(500).json({
        ok: false,
        code: "missing_gas_endpoint",
        message: "GAS_ENDPOINT is not set",
      });
    }

    const p = req.body || {};
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return res.status(400).json({
        ok: false,
        code: "invalid_payload",
        message: "JSON object required",
      });
    }
    if (!p.name)
      return res
        .status(400)
        .json({ ok: false, code: "missing_name", message: "name is required" });
    if (p.confirm_understanding !== true) {
      return res.status(400).json({
        ok: false,
        code: "missing_confirmation",
        message: "confirm_understanding must be true",
      });
    }
    const sig = String(p.signature_png || "");
    if (!sig.startsWith("data:image/png;base64,")) {
      return res.status(400).json({
        ok: false,
        code: "invalid_signature",
        message: "signature_png must be data:image/png;base64,...",
      });
    }

    const html = buildA4TrainingHtml(p);

    const browser = await puppeteer.launch({
      executablePath:
        process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
      headless: true,
    });

    let pdfBuffer;
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
      await page.close();
    } finally {
      await browser.close();
    }

    const pdfBase64 = pdfBuffer.toString("base64");

    const submittedOn = String(p.submitted_on || "");
    const safeName = String(p.name || "不明").replace(/[\\/:*?"<>|]/g, "_");
    const pdfName =
      p.pdf_name || `研修報告書_感染症_${safeName}_${submittedOn}.pdf`;

    const gasRes = await fetch(GAS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...p, pdf_base64: pdfBase64, pdf_name: pdfName }),
    });

    const text = await gasRes.text();
    if (!gasRes.ok) {
      return res.status(502).json({
        ok: false,
        code: "gas_error",
        message: `GAS ${gasRes.status}`,
        detail: text.slice(0, 500),
      });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({
        ok: false,
        code: "invalid_gas_response",
        message: "GAS response not JSON",
        detail: text.slice(0, 500),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "internal_error",
      message: String(err?.message || err),
    });
  }
});

app.post("/api/training-report", async (req, res) => {
  try {
    const GAS_REPORT_ENDPOINT = process.env.GAS_REPORT_ENDPOINT || "";
    if (!GAS_REPORT_ENDPOINT) {
      return res.status(500).json({
        ok: false,
        code: "missing_gas_report_endpoint",
        message: "GAS_REPORT_ENDPOINT is not set",
      });
    }

    const contentType = (req.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return res.status(400).json({
        ok: false,
        code: "invalid_content_type",
        message: "Content-Type must be application/json",
      });
    }

    const p = req.body || {};
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return res.status(400).json({
        ok: false,
        code: "invalid_payload",
        message: "JSON object required",
      });
    }
    if (!p.training_id) {
      return res.status(400).json({
        ok: false,
        code: "missing_training_id",
        message: "training_id is required",
      });
    }
    if (!p.name) {
      return res.status(400).json({
        ok: false,
        code: "missing_name",
        message: "name is required",
      });
    }
    if (!["attended", "absent"].includes(p.attendance)) {
      return res.status(400).json({
        ok: false,
        code: "invalid_attendance",
        message: 'attendance must be "attended" or "absent"',
      });
    }
    if (p.confirm_understanding !== true) {
      return res.status(400).json({
        ok: false,
        code: "missing_confirmation",
        message: "confirm_understanding must be true",
      });
    }

    const gasRes = await fetch(GAS_REPORT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(p),
    });

    const text = await gasRes.text();
    if (!gasRes.ok) {
      return res.status(502).json({
        ok: false,
        code: "gas_error",
        message: `GAS ${gasRes.status}`,
        detail: text.slice(0, 500),
      });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({
        ok: false,
        code: "invalid_gas_response",
        message: "GAS response not JSON",
        detail: text.slice(0, 500),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "internal_error",
      message: String(err?.message || err),
    });
  }
});

app.post("/api/training-list", async (req, res) => {
  try {
    const GAS_TRAINING_LIST_ENDPOINT =
      process.env.GAS_TRAINING_LIST_ENDPOINT || "";
    if (!GAS_TRAINING_LIST_ENDPOINT) {
      return res.status(500).json({
        ok: false,
        code: "missing_gas_training_list_endpoint",
        message: "GAS_TRAINING_LIST_ENDPOINT is not set",
      });
    }

    const contentType = (req.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return res.status(400).json({
        ok: false,
        code: "invalid_content_type",
        message: "Content-Type must be application/json",
      });
    }

    const p = req.body || {};
    if (!p || typeof p !== "object" || Array.isArray(p)) {
      return res.status(400).json({
        ok: false,
        code: "invalid_payload",
        message: "JSON object required",
      });
    }

    const limitRaw = Number(p.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 200;

    const gasRes = await fetch(GAS_TRAINING_LIST_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ...p, limit }),
    });

    const text = await gasRes.text();
    if (!gasRes.ok) {
      return res.status(502).json({
        ok: false,
        code: "gas_error",
        message: `GAS ${gasRes.status}`,
        detail: text.slice(0, 500),
      });
    }

    try {
      return res.status(200).json(JSON.parse(text));
    } catch {
      return res.status(502).json({
        ok: false,
        code: "invalid_gas_response",
        message: "GAS response not JSON",
        detail: text.slice(0, 500),
      });
    }
  } catch (err) {
    return res.status(500).json({
      ok: false,
      code: "internal_error",
      message: String(err?.message || err),
    });
  }
});

function buildA4TrainingHtml(p) {
  const esc = escapeHtml;
  const attendanceLabel =
    p.attendance === "attended"
      ? "当日参加"
      : p.attendance === "absent"
        ? "欠席（資料確認）"
        : String(p.attendance || "");

  const name = esc(String(p.name || ""));
  const title = esc(String(p.training_title || ""));
  const date = esc(String(p.training_date || ""));
  const submittedOn = esc(String(p.submitted_on || ""));
  const comment = esc(String(p.comment || "")).replace(/\n/g, "<br>");
  const sig = String(p.signature_png || ""); // dataURLは壊さない

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Yu Gothic", Meiryo, system-ui, sans-serif; color:#111; }
  h1 { font-size: 18px; margin: 0 0 10px; text-align:center; }
  .meta { font-size: 12px; margin-bottom: 10px; text-align:center; color:#333; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #222; padding: 8px; vertical-align: top; }
  th { width: 26%; background: #f3f4f6; text-align: left; }
  .sigbox { height: 110px; }
  .sigimg { max-height: 95px; max-width: 100%; object-fit: contain; display:block; }
  .note { font-size: 11px; color:#444; margin-top: 8px; }
</style>
</head>
<body>
  <h1>研修報告書（個人）</h1>
  <div class="meta">感染症の予防及びまん延防止に関する研修（訪問系）</div>

  <table>
    <tr><th>氏名</th><td>${name}</td></tr>
    <tr><th>研修名</th><td>${title}</td></tr>
    <tr><th>研修実施日</th><td>${date}</td></tr>
    <tr><th>提出区分</th><td>${esc(attendanceLabel)}</td></tr>
    <tr><th>記入日</th><td>${submittedOn}</td></tr>
    <tr><th>所感</th><td>${comment}</td></tr>
    <tr><th>署名（手書き）</th><td class="sigbox"><img class="sigimg" src="${sig}"></td></tr>
  </table>

  <div class="note">※本PDFはWebフォーム入力内容に基づき自動生成されます。</div>
</body>
</html>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[m],
  );
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`training-service listening on ${PORT}`));
