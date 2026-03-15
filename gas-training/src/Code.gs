/***************
 * 研修管理 中核GAS（新スプレッドシート専用）
 ***************/

// 研修管理専用スプレッドシートID（固定）
const TRAINING_MGMT_SHEET_ID = "1Q26A9zEjfrl7Em7_Hp2UJBdTrNIT_kJQKb0DgiV5lpU";

const API_TOKEN = "village-training-core-2026-02-20-very-secret-987654321";

function assertToken_(p) {
  const token = String((p && p.token) || "");
  if (token !== TRAINING_API_TOKEN) throw new Error("unauthorized");
}

// 議事録PDFの保存先フォルダ
const MINUTES_PDF_FOLDER_ID = "1WYIYxP0H6BgWE-HESj7A9Fl2NDE1Y-Xi";

// シート名
const LEDGER_SHEET_NAME = "研修台帳";
const REPORT_SHEET_NAME = "研修報告（個人）";
const MINUTES_TEMPLATE_SHEET_NAME = "研修議事録_テンプレート";
const MASTER_SHEET_NAME = "研修マスタ（設計用）";

// 研修台帳の列（1始まり）
const LEDGER_COL_TRAINING_ID = 1; // A
const LEDGER_COL_MINUTES_PDF_URL = 9;
const LEDGER_COL_ATTENDEES = 14; // N（参加者）
const LEDGER_COL_CONTENT = 15; // O（研修内容）
const LEDGER_COL_COMMENT = 16; // P（意見・感想）

// 研修報告（個人）の列（1始まり）
const REPORT_COL_TRAINING_ID = 1; // A
const REPORT_COL_NAME = 2; // B
const REPORT_COL_ATTENDANCE = 3; // C attended/absent
const REPORT_COL_CONFIRM = 4; // D TRUE/FALSE
const REPORT_COL_SUBMITTED_ON = 5; // E
const REPORT_COL_CONTENT = 6; // F
const REPORT_COL_COMMENT = 7; // G
const REPORT_COL_USER_AGENT = 8; // H
const REPORT_COL_SIGNATURE_PNG = 9; // I（dataURL。今回の集計では未使用）

// テンプレ転記セル（固定）
const MINUTES_CELL_TITLE = "B3";
const MINUTES_CELL_DATE = "B4";
const MINUTES_CELL_LOCATION = "B5";
const MINUTES_CELL_NAME = "B6";
const MINUTES_CELL_CONTENT = "B7";
const MINUTES_CELL_COMMENT = "B8";

/**
 * 公開：研修IDを指定して
 * 1) 個人報告を集計→台帳(N/O/P)更新
 * 2) 議事録シート作成→転記
 * 3) PDF出力→台帳I列へURL更新
 */
function generateMinutesPdfAndUpdateLedger_(trainingId) {
  if (!trainingId) throw new Error("trainingId is required");

  const ss = getSpreadsheet_();
  const ledger = getSheetByNameOrThrow_(ss, LEDGER_SHEET_NAME);

  // 1) 個人報告集計→台帳反映
  updateLedgerFromReports_(trainingId);

  // 台帳行を特定
  const ledgerRow = findRowByValue_(ledger, LEDGER_COL_TRAINING_ID, trainingId);
  if (ledgerRow < 2)
    throw new Error("trainingId not found in ledger: " + trainingId);

  const existingUrl = String(
    ledger.getRange(ledgerRow, LEDGER_COL_MINUTES_PDF_URL).getDisplayValue() ||
      "",
  ).trim();
  if (existingUrl) {
    return {
      ok: true,
      trainingId,
      minutesSheetName: "議事録_" + trainingId,
      pdfUrl: existingUrl,
      reused: true,
    };
  }

  // 2) テンプレコピーして議事録シート作成
  const template = getSheetByNameOrThrow_(ss, MINUTES_TEMPLATE_SHEET_NAME);
  const minutesSheetName = "議事録_" + trainingId;

  // 既存があれば再利用、なければコピー
  let minutes = ss.getSheetByName(minutesSheetName);
  if (!minutes) minutes = template.copyTo(ss).setName(minutesSheetName);

  // 3) 台帳から転記値を取る（B=テーマ, C=開催日, D=開催場所 は「研修台帳」の想定通り）
  // ※ 研修台帳の列が変わるならここだけ調整してください
  const trainingTitle = String(
    ledger.getRange(ledgerRow, 2).getDisplayValue() || "",
  ); // B
  const trainingDate = String(
    ledger.getRange(ledgerRow, 3).getDisplayValue() || "",
  ); // C
  const location = String(
    ledger.getRange(ledgerRow, 4).getDisplayValue() || "",
  ); // D

  const attendees = String(
    ledger.getRange(ledgerRow, LEDGER_COL_ATTENDEES).getDisplayValue() || "",
  );
  const content = String(
    ledger.getRange(ledgerRow, LEDGER_COL_CONTENT).getDisplayValue() || "",
  );
  const comment = String(
    ledger.getRange(ledgerRow, LEDGER_COL_COMMENT).getDisplayValue() || "",
  );

  // テンプレのB3〜B8へ転記
  minutes.getRange(MINUTES_CELL_TITLE).setValue(trainingTitle);
  minutes.getRange(MINUTES_CELL_DATE).setValue(trainingDate);
  minutes.getRange(MINUTES_CELL_LOCATION).setValue(location);
  minutes.getRange(MINUTES_CELL_NAME).setValue(attendees);
  minutes.getRange(MINUTES_CELL_CONTENT).setValue(content);
  minutes.getRange(MINUTES_CELL_COMMENT).setValue(comment);

  SpreadsheetApp.flush();

  // 4) PDF生成→フォルダ保存
  const pdfBlob = exportSheetToPdf_(ss, minutes, minutesSheetName);

  let folder;
  try {
    folder = DriveApp.getFolderById(MINUTES_PDF_FOLDER_ID);
  } catch (e) {
    throw new Error(
      "MINUTES_PDF_FOLDER_ID が不正 or 権限なし: " + MINUTES_PDF_FOLDER_ID,
    );
  }
  const pdfFile = folder.createFile(pdfBlob);
  const pdfUrl = pdfFile.getUrl();

  // 5) 台帳(I列)へ反映
  ledger.getRange(ledgerRow, LEDGER_COL_MINUTES_PDF_URL).setValue(pdfUrl);

  SpreadsheetApp.flush();

  return {
    ok: true,
    trainingId,
    minutesSheetName,
    pdfUrl,
    fileId: pdfFile.getId(),
  };
}

/**
 * 個人報告（研修報告（個人））を集計して、台帳の N/O/P を更新
 */
function updateLedgerFromReports_(trainingId) {
  const ss = getSpreadsheet_();
  const ledger = getSheetByNameOrThrow_(ss, LEDGER_SHEET_NAME);
  const report = getSheetByNameOrThrow_(ss, REPORT_SHEET_NAME);

  const ledgerRow = findRowByValue_(ledger, LEDGER_COL_TRAINING_ID, trainingId);
  if (ledgerRow < 2)
    throw new Error("trainingId not found in ledger: " + trainingId);

  const lastRow = report.getLastRow();
  if (lastRow < 2) throw new Error("report sheet has no data rows");

  const values = report
    .getRange(2, 1, lastRow - 1, REPORT_COL_SIGNATURE_PNG)
    .getValues();

  const attendees = [];
  const absentees = [];
  const contentSet = new Set();
  const comments = [];

  let found = false;

  values.forEach((r) => {
    const tid = String(r[REPORT_COL_TRAINING_ID - 1] || "").trim();
    if (tid !== String(trainingId).trim()) return;
    found = true;

    const name = String(r[REPORT_COL_NAME - 1] || "").trim();
    const attendance = String(r[REPORT_COL_ATTENDANCE - 1] || "").trim();
    const content = String(r[REPORT_COL_CONTENT - 1] || "").trim();
    const comment = String(r[REPORT_COL_COMMENT - 1] || "").trim();

    if (attendance === "attended") {
      if (name) attendees.push(name);
      if (content) contentSet.add(content);
      if (comment) comments.push(`・${name || "参加者"}：${comment}`);
    } else if (attendance === "absent") {
      if (name) absentees.push(name);
    }
  });

  if (!found) throw new Error("no reports found for trainingId: " + trainingId);

  const attendeesText = attendees.join("、");
  const contentText = Array.from(contentSet)
    .map((x) => `・${x}`)
    .join("\n");

  let commentText = comments.join("\n");
  if (absentees.length > 0) {
    const absentLine = `欠席（資料確認）：${absentees.join("、")}`;
    commentText = commentText ? `${commentText}\n${absentLine}` : absentLine;
  }

  ledger.getRange(ledgerRow, LEDGER_COL_ATTENDEES).setValue(attendeesText);
  ledger.getRange(ledgerRow, LEDGER_COL_CONTENT).setValue(contentText);
  ledger.getRange(ledgerRow, LEDGER_COL_COMMENT).setValue(commentText);
  SpreadsheetApp.flush();
}

/** ===== ユーティリティ ===== */

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss)
    throw new Error(
      "active spreadsheet not found. Open the spreadsheet and run again.",
    );
  return ss;
}

function getSheetByNameOrThrow_(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) throw new Error("sheet not found: " + name);
  return sh;
}

function findRowByValue_(sheet, col, value) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const vals = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0] || "").trim() === String(value).trim()) return i + 2;
  }
  return -1;
}

function exportSheetToPdf_(ss, sheet, fileBaseName) {
  const gid = sheet.getSheetId();
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    ss.getId() +
    "/export?format=pdf" +
    "&gid=" +
    gid +
    "&portrait=true&fitw=true" +
    "&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false&fzr=false" +
    "&size=A4&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5";

  const token = ScriptApp.getOAuthToken();
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });
  return res.getBlob().setName(String(fileBaseName || "minutes") + ".pdf");
}

/** 動作確認 */
function runTest_R8_0208_001() {
  const r = generateMinutesPdfAndUpdateLedger_("R8-0208-001");
  Logger.log(JSON.stringify(r));
}

//////////////////

/**
 * テスト①：集計だけ（研修台帳の N/O/P が埋まるか）
 */
function test01_updateLedgerFromReports_R8_0208_001() {
  const trainingId = "R8-0208-001";
  updateLedgerFromReports_(trainingId);

  const ss = getSpreadsheet_();
  const ledger = getSheetByNameOrThrow_(ss, LEDGER_SHEET_NAME);
  const row = findRowByValue_(ledger, LEDGER_COL_TRAINING_ID, trainingId);
  if (row < 2)
    throw new Error("ledger row not found after update: " + trainingId);

  const attendees = ledger
    .getRange(row, LEDGER_COL_ATTENDEES)
    .getDisplayValue();
  const content = ledger.getRange(row, LEDGER_COL_CONTENT).getDisplayValue();
  const comment = ledger.getRange(row, LEDGER_COL_COMMENT).getDisplayValue();

  Logger.log("=== test01 result ===");
  Logger.log("trainingId=%s row=%s", trainingId, row);
  Logger.log("attendees(N)=%s", attendees);
  Logger.log("content(O)=%s", content);
  Logger.log("comment(P)=%s", comment);

  return { ok: true, trainingId, row, attendees, content, comment };
}

/**
 * テスト②：PDFまで（集計→テンプレ転記→PDF→I列URL）
 */
function test02_generateMinutesPdf_R8_0208_001() {
  const trainingId = "R8-0208-001";
  const r = generateMinutesPdfAndUpdateLedger_(trainingId);
  Logger.log("=== test02 result ===");
  Logger.log(JSON.stringify(r));
  return r;
}

/**
 * テスト③：事前チェック（必須シート・フォルダ権限・ID行の存在）
 * ※ 実行前にこれを1回やると事故が減ります
 */
function test00_precheck_R8_0208_001() {
  const trainingId = "R8-0208-001";

  const ss = getSpreadsheet_();

  // シート存在確認
  getSheetByNameOrThrow_(ss, LEDGER_SHEET_NAME);
  getSheetByNameOrThrow_(ss, REPORT_SHEET_NAME);
  getSheetByNameOrThrow_(ss, MINUTES_TEMPLATE_SHEET_NAME);

  // 台帳行確認
  const ledger = ss.getSheetByName(LEDGER_SHEET_NAME);
  const ledgerRow = findRowByValue_(ledger, LEDGER_COL_TRAINING_ID, trainingId);
  if (ledgerRow < 2)
    throw new Error("研修台帳に trainingId が無い: " + trainingId);

  // 報告行確認（trainingId が存在するかだけ）
  const report = ss.getSheetByName(REPORT_SHEET_NAME);
  const lastRow = report.getLastRow();
  if (lastRow < 2) throw new Error("研修報告（個人）にデータ行が無い");
  const reportIds = report
    .getRange(2, REPORT_COL_TRAINING_ID, lastRow - 1, 1)
    .getValues()
    .flat();
  const hasReport = reportIds.some(
    (v) => String(v || "").trim() === String(trainingId).trim(),
  );
  if (!hasReport)
    throw new Error("研修報告（個人）に trainingId の行が無い: " + trainingId);

  // フォルダ権限確認
  try {
    DriveApp.getFolderById(MINUTES_PDF_FOLDER_ID).getName();
  } catch (e) {
    throw new Error(
      "PDF保存フォルダIDが不正 or 権限なし: " + MINUTES_PDF_FOLDER_ID,
    );
  }

  Logger.log("precheck OK: %s", trainingId);
  return { ok: true, trainingId };
}

function doPost(e) {
  const requestId = Utilities.getUuid();
  const receivedAt = new Date().toISOString();

  try {
    const mode =
      (e && e.parameter && e.parameter.mode) ||
      (e && e.parameters && e.parameters.mode && e.parameters.mode[0]) ||
      "";

    const raw =
      e && e.postData && typeof e.postData.contents === "string"
        ? e.postData.contents
        : "{}";
    const p = JSON.parse(raw || "{}");

    switch (mode) {
      case "training_list": {
        assertToken_(p);
        const limit = Math.min(Number(p.limit || 200) || 200, 500);

        const ss = getSpreadsheet_();
        const sh = ss.getSheetByName(MASTER_SHEET_NAME);
        if (!sh) throw new Error("sheet not found: " + MASTER_SHEET_NAME);

        const lastRow = sh.getLastRow();
        if (lastRow < 2)
          return json_({ ok: true, requestId, receivedAt, items: [] });

        // A:training_id B:title C:date D:location
        const values = sh.getRange(2, 1, lastRow - 1, 7).getDisplayValues();
        const items = values
          .filter((r) => String(r[0] || "").trim())
          .slice(0, limit)
          .map((r) => ({
            training_id: String(r[0] || "").trim(),
            training_title: String(r[2] || "").trim(),
            training_date: String(r[5] || "").trim(),
            location: String(r[6] || "").trim(),
          }));

        return json_({ ok: true, requestId, receivedAt, items });
      }

      case "minutes_generate": {
        assertToken_(p);
        const trainingId = String(p.training_id || "").trim();
        if (!trainingId)
          return json_({
            ok: false,
            message: "training_id is required",
            requestId,
            receivedAt,
          });

        const result = generateMinutesPdfAndUpdateLedger_(trainingId);
        return json_({ ok: true, requestId, receivedAt, result });
      }

      case "debug_open": {
        const ss = getSpreadsheet_();
        const folder = DriveApp.getFolderById(MINUTES_PDF_FOLDER_ID);
        return json_({
          ok: true,
          requestId,
          receivedAt,
          spreadsheet: { id: ss.getId(), name: ss.getName(), url: ss.getUrl() },
          folder: {
            id: MINUTES_PDF_FOLDER_ID,
            name: folder.getName(),
            url: folder.getUrl(),
          },
          sheets: ss.getSheets().map((s) => s.getName()),
        });
      }

      default:
        return json_({
          ok: false,
          message: "invalid mode",
          mode,
          requestId,
          receivedAt,
        });
    }
  } catch (err) {
    return json_({
      ok: false,
      code: "internal_error",
      message: String(err),
      requestId,
      receivedAt,
    });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function debug_openById_() {
  const file = DriveApp.getFileById(TRAINING_MGMT_SHEET_ID);
  const ss = SpreadsheetApp.open(file);
  Logger.log("OK open: %s", ss.getName());
  Logger.log(
    "Sheets: %s",
    ss
      .getSheets()
      .map((s) => s.getName())
      .join(", "),
  );
}

function diag_env() {
  Logger.log("=== diag_env start ===");
  Logger.log("Runtime TZ: %s", Session.getScriptTimeZone());
  Logger.log(
    "ActiveUser: %s",
    safe_(() => Session.getActiveUser().getEmail()),
  );
  Logger.log(
    "EffectiveUser: %s",
    safe_(() => Session.getEffectiveUser().getEmail()),
  );

  Logger.log("typeof SpreadsheetApp: %s", typeof SpreadsheetApp);
  Logger.log("typeof DriveApp: %s", typeof DriveApp);
  Logger.log("typeof UrlFetchApp: %s", typeof UrlFetchApp);

  // SpreadsheetApp のプロパティ参照だけ試す
  try {
    Logger.log("SpreadsheetApp.openById is: %s", SpreadsheetApp.openById);
  } catch (e) {
    Logger.log("ERROR reading SpreadsheetApp.openById: %s", e);
  }

  // DriveApp は生きてるか
  try {
    const f = DriveApp.getFileById(TRAINING_MGMT_SHEET_ID);
    Logger.log("Drive file name: %s", f.getName());
  } catch (e) {
    Logger.log("ERROR DriveApp.getFileById: %s", e);
  }

  // openById を実際に叩く
  try {
    const ss = SpreadsheetApp.openById(TRAINING_MGMT_SHEET_ID);
    Logger.log("openById OK. ss name: %s", ss.getName());
  } catch (e) {
    Logger.log("ERROR SpreadsheetApp.openById: %s", e);
  }

  // open(file) も試す
  try {
    const f = DriveApp.getFileById(TRAINING_MGMT_SHEET_ID);
    const ss2 = SpreadsheetApp.open(f);
    Logger.log("SpreadsheetApp.open(file) OK. ss name: %s", ss2.getName());
  } catch (e) {
    Logger.log("ERROR SpreadsheetApp.open(file): %s", e);
  }

  Logger.log("=== diag_env end ===");
}

function safe_(fn) {
  try {
    return fn();
  } catch (e) {
    return null;
  }
}

function sanity_open() {
  const id = "1Q26A9zEjfrl7Em7_Hp2UJBdTrNIT_kJQKb0DgiV5lpU"; // IDだけ
  const ss = SpreadsheetApp.openById(id);
  Logger.log(ss.getId());
  Logger.log(ss.getName());
}

function sanity_active() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log(ss.getId());
  Logger.log(ss.getName());
}

function debug_pdf_folder() {
  const folder = DriveApp.getFolderById(MINUTES_PDF_FOLDER_ID);
  Logger.log("folder name=%s", folder.getName());
  Logger.log("folder url=%s", folder.getUrl());
}
