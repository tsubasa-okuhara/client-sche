// 研修管理専用スプレッドシートID
const TRAINING_MGMT_SHEET_ID = "1Q26A9zEjfrI7Em7_Hp2UJbdTrNIT_kJQKb0DgVi5IpU";
const MINUTES_PDF_FOLDER_ID = "1WYIYxP0H6BgWE-HESj7A9Fl2NDE1Y-Xi";

const LEDGER_SHEET_NAME = "研修台帳";
const REPORT_SHEET_NAME = "研修報告（個人）";
const MINUTES_SHEET_NAME = "議事録";

const LEDGER_COL_TRAINING_ID = 1; // A
const LEDGER_COL_PDF_URL = 9; // I
const LEDGER_COL_ATTENDEES = 14; // N
const LEDGER_COL_CONTENT = 15; // O
const LEDGER_COL_COMMENT = 16; // P

const REPORT_COL_TRAINING_ID = 1; // A
const REPORT_COL_NAME = 2; // B
const REPORT_COL_ATTENDANCE = 3; // C
const REPORT_COL_CONFIRM = 4; // D
const REPORT_COL_SUBMITTED_ON = 5; // E
const REPORT_COL_CONTENT = 6; // F
const REPORT_COL_COMMENT = 7; // G
const REPORT_COL_USER_AGENT = 8; // H
const REPORT_COL_SIGNATURE_PNG = 9; // I

function doGet(e) {
  const mode = e && e.parameter && e.parameter.mode;
  if (mode === "attendance") return doGet_attendance();

  return HtmlService.createHtmlOutput("OK");
}

function updateLedgerFromReports_(trainingId) {
  if (!trainingId) {
    throw new Error("trainingId is required");
  }

  const ss = getSpreadsheet_();
  const ledgerSheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  if (!ledgerSheet) {
    throw new Error(`ledger sheet not found: ${LEDGER_SHEET_NAME}`);
  }

  const reportSheet = ss.getSheetByName(REPORT_SHEET_NAME);
  if (!reportSheet) {
    throw new Error(`report sheet not found: ${REPORT_SHEET_NAME}`);
  }

  const ledgerRow = findLedgerRow_(ledgerSheet, trainingId);
  if (ledgerRow < 2) {
    throw new Error(`trainingId not found in ledger: ${trainingId}`);
  }

  const reportLastRow = reportSheet.getLastRow();
  if (reportLastRow < 2) {
    throw new Error("report sheet has no data rows");
  }

  const reportValues = reportSheet
    .getRange(2, 1, reportLastRow - 1, REPORT_COL_SIGNATURE_PNG)
    .getValues();

  const attendees = [];
  const absentees = [];
  const contentSet = {};
  const comments = [];
  let found = false;

  reportValues.forEach(function (row) {
    const rowTrainingId = String(row[REPORT_COL_TRAINING_ID - 1] || "");
    if (rowTrainingId !== String(trainingId)) return;
    found = true;

    const name = String(row[REPORT_COL_NAME - 1] || "").trim();
    const attendance = String(row[REPORT_COL_ATTENDANCE - 1] || "").trim();
    const content = String(row[REPORT_COL_CONTENT - 1] || "").trim();
    const comment = String(row[REPORT_COL_COMMENT - 1] || "").trim();

    if (attendance === "attended") {
      if (name) attendees.push(name);
      if (content) contentSet[content] = true;
      if (name && comment) comments.push(`・${name}：${comment}`);
    } else if (attendance === "absent") {
      if (name) absentees.push(name);
    }
  });

  if (!found) {
    throw new Error(`no reports found for trainingId: ${trainingId}`);
  }

  const attendeesText = attendees.join("、");
  const contentText = Object.keys(contentSet)
    .map(function (v) {
      return `・${v}`;
    })
    .join("\n");

  let commentText = comments.join("\n");
  if (absentees.length > 0) {
    const absentLine = `欠席（資料確認）：${absentees.join("、")}`;
    commentText = commentText ? `${commentText}\n${absentLine}` : absentLine;
  }

  ledgerSheet.getRange(ledgerRow, LEDGER_COL_ATTENDEES).setValue(attendeesText);
  ledgerSheet.getRange(ledgerRow, LEDGER_COL_CONTENT).setValue(contentText);
  ledgerSheet.getRange(ledgerRow, LEDGER_COL_COMMENT).setValue(commentText);
  SpreadsheetApp.flush();
}

function generateMinutesPdfAndUpdateLedger_(trainingId) {
  const ss = getSpreadsheet_();
  const ledgerSheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  if (!ledgerSheet) {
    throw new Error(`ledger sheet not found: ${LEDGER_SHEET_NAME}`);
  }

  updateLedgerFromReports_(trainingId);

  const ledgerRow = findLedgerRow_(ledgerSheet, trainingId);
  if (ledgerRow < 2) {
    throw new Error(`trainingId not found in ledger: ${trainingId}`);
  }

  const minutesSheet =
    ss.getSheetByName(MINUTES_SHEET_NAME) || ss.insertSheet(MINUTES_SHEET_NAME);

  const rowValues = ledgerSheet
    .getRange(ledgerRow, 1, 1, ledgerSheet.getLastColumn())
    .getValues()[0];

  const minutesData = {
    training_id: rowValues[LEDGER_COL_TRAINING_ID - 1] || "",
    attendees: rowValues[LEDGER_COL_ATTENDEES - 1] || "",
    training_content: rowValues[LEDGER_COL_CONTENT - 1] || "",
    comment: rowValues[LEDGER_COL_COMMENT - 1] || "",
  };

  writeMinutesSheet_(minutesSheet, minutesData);

  const fileName = `議事録_${trainingId}`;
  const pdfBlob = exportSheetToPdf_(ss, minutesSheet, fileName);
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

  ledgerSheet.getRange(ledgerRow, LEDGER_COL_PDF_URL).setValue(pdfUrl);
  SpreadsheetApp.flush();
  return pdfUrl;
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.openById(TRAINING_MGMT_SHEET_ID);
  if (!ss) {
    throw new Error("training management spreadsheet not found");
  }
  return ss;
}

function findLedgerRow_(ledgerSheet, trainingId) {
  const lastRow = ledgerSheet.getLastRow();
  if (lastRow < 2) return -1;

  const ids = ledgerSheet
    .getRange(2, LEDGER_COL_TRAINING_ID, lastRow - 1, 1)
    .getValues();

  let rowIndex = -1;
  ids.forEach(function (row, i) {
    if (String(row[0] || "") === String(trainingId)) {
      rowIndex = i + 2;
    }
  });

  return rowIndex;
}

function writeMinutesSheet_(sheet, data) {
  sheet.clearContents();
  sheet.getRange("A1").setValue("研修議事録");
  sheet.getRange("A3").setValue("研修ID");
  sheet.getRange("B3").setValue(data.training_id);
  sheet.getRange("A4").setValue("参加者");
  sheet.getRange("B4").setValue(data.attendees);
  sheet.getRange("A5").setValue("研修内容");
  sheet.getRange("B5").setValue(data.training_content);
  sheet.getRange("A6").setValue("意見・感想");
  sheet.getRange("B6").setValue(data.comment);
}

function exportSheetToPdf_(ss, sheet, fileName) {
  const gid = sheet.getSheetId();
  const url =
    "https://docs.google.com/spreadsheets/d/" +
    ss.getId() +
    "/export?format=pdf" +
    "&gid=" +
    gid +
    "&portrait=true" +
    "&fitw=true" +
    "&sheetnames=false&printtitle=false&pagenumbers=false&gridlines=false" +
    "&fzr=false" +
    "&size=A4" +
    "&top_margin=0.5&bottom_margin=0.5&left_margin=0.5&right_margin=0.5";

  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + token },
  });

  return response.getBlob().setName(fileName + ".pdf");
}
