// === 研修設計（管理者）: Phase1 ===
const PLANNER_SHEET_ID = "1OPFsKSPaaQX5XC1f9pvVPmJ2S3rH4Uv11d6GeX0rgJM";
const PLANNER_SHEET_NAME = "研修設計（管理者）";

const PLANNER_HEADERS = [
  "timestamp",
  "training_id",
  "status",
  "name",
  "title",
  "content",
  "comment",
  "user_agent",
  "payload_json",
];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("研修管理")
    .addItem("研修設計チャットを開く", "openPlannerSidebar")
    .addToUi();
}

function openPlannerSidebar() {
  const html =
    HtmlService.createHtmlOutputFromFile("admin_planner").setTitle(
      "研修設計チャット",
    );
  SpreadsheetApp.getUi().showSidebar(html);
}

function savePlannerDraft(payload) {
  try {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : null;
    if (!data) {
      return {
        ok: false,
        code: "invalid_payload",
        message: "payload must be object",
      };
    }

    const sheet = getOrCreatePlannerSheet_();
    const headerRow = ensurePlannerHeader_(sheet);
    const trainingId = generateTrainingId_(sheet, headerRow);
    const status = data.status === "confirmed" ? "confirmed" : "draft";

    const row = Object.assign({}, data, {
      timestamp: new Date(),
      training_id: trainingId,
      status,
      payload_json: JSON.stringify(data),
    });

    appendPlannerRow_(sheet, headerRow, row);

    return { ok: true, training_id: trainingId };
  } catch (err) {
    return { ok: false, code: "internal_error", message: String(err) };
  }
}

function getOrCreatePlannerSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (
    ss.getSheetByName(PLANNER_SHEET_NAME) || ss.insertSheet(PLANNER_SHEET_NAME)
  );
}

function ensurePlannerHeader_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(PLANNER_HEADERS);
    return PLANNER_HEADERS.slice();
  }

  const lastCol = sheet.getLastColumn();
  const headerRow =
    lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  const missing = PLANNER_HEADERS.filter((h) => headerRow.indexOf(h) === -1);
  if (missing.length > 0) {
    sheet
      .getRange(1, headerRow.length + 1, 1, missing.length)
      .setValues([missing]);
    return headerRow.concat(missing);
  }

  return headerRow;
}

function buildPlannerRowByHeader_(headerRow, obj) {
  return headerRow.map(function (key) {
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : "";
  });
}

function appendPlannerRow_(sheet, headerRow, rowObj) {
  const row = buildPlannerRowByHeader_(headerRow, rowObj);
  sheet.appendRow(row);
}

function generateTrainingId_(sheet, headerRow) {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const yyyy = Utilities.formatDate(now, tz, "yyyy");
  const mm = Utilities.formatDate(now, tz, "MM");
  const dd = Utilities.formatDate(now, tz, "dd");
  const reiwa = Number(yyyy) - 2018;
  const prefix = `R${reiwa}-${mm}${dd}-`;

  const idColIndex = headerRow.indexOf("training_id");
  if (idColIndex === -1) {
    return `${prefix}001`;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return `${prefix}001`;
  }

  const values = sheet.getRange(2, idColIndex + 1, lastRow - 1, 1).getValues();
  let maxSeq = 0;
  values.forEach(function (row) {
    const id = String(row[0] || "");
    if (id.indexOf(prefix) !== 0) return;
    const m = id.match(/-(\d+)$/);
    if (!m) return;
    const num = Number(m[1]);
    if (Number.isFinite(num) && num > maxSeq) maxSeq = num;
  });

  const next = String(maxSeq + 1).padStart(3, "0");
  return `${prefix}${next}`;
}
