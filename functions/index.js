const { onRequest } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

exports.trainingProxy = onRequest(
  { region: "asia-northeast1", timeoutSeconds: 120, memory: "512MiB" },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.set("Allow", "POST, OPTIONS");
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res
        .status(405)
        .json({ ok: false, code: "method_not_allowed", message: "POST only." });
    }

    const GAS_ENDPOINT = process.env.GAS_ENDPOINT || "";
    if (!GAS_ENDPOINT) {
      return res.status(500).json({
        ok: false,
        code: "missing_gas_endpoint",
        message: "GAS_ENDPOINT is not configured.",
      });
    }

    const contentType = (req.get("content-type") || "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return res.status(400).json({
        ok: false,
        code: "invalid_content_type",
        message: "Content-Type must be application/json.",
      });
    }

    try {
      const payload = parseJsonBody(req.body);
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        return res.status(400).json({
          ok: false,
          code: "invalid_payload",
          message: "Request body must be a JSON object.",
        });
      }

      if (!payload.name) {
        return res.status(400).json({
          ok: false,
          code: "missing_name",
          message: "name is required.",
        });
      }

      if (payload.confirm_understanding !== true) {
        return res.status(400).json({
          ok: false,
          code: "missing_confirmation",
          message: "confirm_understanding must be true.",
        });
      }

      const signature = String(payload.signature_png || "");
      if (!signature.startsWith("data:image/png;base64,")) {
        return res.status(400).json({
          ok: false,
          code: "invalid_signature",
          message: "signature_png must be data:image/png;base64,...",
        });
      }

      const submittedOn = payload.submitted_on || "";
      const name = payload.name || "不明";
      const pdfNameRaw = `研修報告書_感染症_${name}_${submittedOn}.pdf`;
      const pdfName = sanitizeFileName(pdfNameRaw);
      const html = buildTrainingHtml(payload);

      const pdfBuffer = await renderPdfBuffer(html);
      const pdfBase64 = pdfBuffer.toString("base64");

      const gasPayload = {
        ...payload,
        pdf_base64: pdfBase64,
        pdf_name: pdfName,
      };

      logger.info("Sending PDF to GAS", {
        hasName: Boolean(payload?.name),
        attendance: payload?.attendance,
        pdfBytes: pdfBuffer.length,
      });

      const gasRes = await fetch(GAS_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(gasPayload),
      });

      const text = await gasRes.text();
      if (!gasRes.ok) {
        const limitedBody = truncateText(text, 500);
        logger.error("GAS error", { status: gasRes.status, body: limitedBody });
        return res.status(502).json({
          ok: false,
          code: "gas_error",
          message: `GAS error: ${gasRes.status} ${limitedBody}`,
        });
      }

      try {
        const data = JSON.parse(text);
        return res.status(200).json(data);
      } catch (err) {
        logger.error("Invalid GAS JSON response", err);
        return res.status(502).json({
          ok: false,
          code: "invalid_gas_response",
          message: "GAS response is not valid JSON.",
        });
      }
    } catch (err) {
      logger.error("Training proxy failed", err);
      return res.status(500).json({
        ok: false,
        code: "proxy_error",
        message: err?.message || "Proxy request failed.",
      });
    }
  }
);

function parseJsonBody(body) {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch (_) {
      return null;
    }
  }
  return body;
}

function renderPdfBuffer(html) {
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const buffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    await page.close();
    return buffer;
  });
}

async function withBrowser(fn) {
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

function buildTrainingHtml(payload) {
  const values = {
    name: escapeHtml(payload.name || ""),
    training_title: escapeHtml(payload.training_title || ""),
    training_date: escapeHtml(payload.training_date || ""),
    attendance: escapeHtml(formatAttendance(payload.attendance)),
    submitted_on: escapeHtml(payload.submitted_on || ""),
    comment: escapeHtml(payload.comment || "").replace(/\n/g, "<br>"),
    signature_png: String(payload.signature_png || ""),
  };

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>研修報告書（個人）</title>
    <style>
      body { font-family: "Noto Sans JP", "Yu Gothic", "Hiragino Kaku Gothic ProN", sans-serif; color: #111; }
      h1 { font-size: 20px; margin: 0 0 12px; text-align: center; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #333; padding: 8px; vertical-align: top; }
      th { background: #f5f5f5; width: 22%; text-align: left; }
      .signature { height: 120px; }
      .signature img { max-height: 110px; max-width: 100%; }
      .note { font-size: 10px; color: #555; margin-top: 6px; }
    </style>
  </head>
  <body>
    <h1>研修報告書（個人）</h1>
    <table>
      <tr>
        <th>研修名</th>
        <td>${values.training_title}</td>
      </tr>
      <tr>
        <th>研修実施日</th>
        <td>${values.training_date}</td>
      </tr>
      <tr>
        <th>氏名</th>
        <td>${values.name}</td>
      </tr>
      <tr>
        <th>提出区分</th>
        <td>${values.attendance}</td>
      </tr>
      <tr>
        <th>記入日</th>
        <td>${values.submitted_on}</td>
      </tr>
      <tr>
        <th>所感</th>
        <td>${values.comment}</td>
      </tr>
      <tr>
        <th>署名</th>
        <td class="signature"><img src="${values.signature_png}" alt="署名" /></td>
      </tr>
    </table>
    <div class="note">※ 本PDFはシステムで自動生成されています。</div>
  </body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeFileName(value) {
  return String(value || "training.pdf").replace(/[\\/:*?"<>|]/g, "_");
}

function formatAttendance(value) {
  if (value === "attended") return "当日参加";
  if (value === "absent") return "欠席（資料確認）";
  return value || "";
}

function truncateText(value, maxLength) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength - 3)) + "...";
}
