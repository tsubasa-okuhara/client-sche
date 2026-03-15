// 研修 点呼（参加/不参加）専用 WebApp
// 既存の doGet() と衝突しないように別名を使用

const ATTENDANCE_SHEET_NAME = "研修_参加確認";
const ATTENDANCE_SETTINGS_SHEET_NAME = "settings";
const ATTENDANCE_DEADLINE_CELL = "B4";
const ATTENDANCE_SETTINGS_ID_CELL = "B1";
const ATTENDANCE_SETTINGS_DATE_CELL = "B2";
const ATTENDANCE_SETTINGS_SEQ_CELL = "B3";
const ATTENDANCE_META_LABEL_CELL = "B5";
const ATTENDANCE_META_NOTICE_CELL = "F5";
const ATTENDANCE_META_TITLE_CELL = "B6";
const ATTENDANCE_META_CONTENT_CELL = "B7";
const ATTENDANCE_NAMES_SHEET_NAME = "helpers";

// Webアプリ表示用（既存 doGet とは別名）
function doGet_attendance() {
  return HtmlService.createHtmlOutputFromFile("attendance_form").setTitle(
    "研修 点呼（参加/不参加）",
  );
}

// 送信処理
function attendance_submit(payload) {
  try {
    const data =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? payload
        : null;
    if (!data) {
      return { ok: false, message: "入力データが不正です。" };
    }

    const name = String(data.name || "").trim();
    const trainingAttendance = String(data.training_attendance || "").trim();
    const partyAttendance = String(data.party_attendance || "").trim();
    const note = String(data.note || "");
    const userAgent = String(data.user_agent || "");

    if (!name) {
      return { ok: false, message: "氏名は必須です。" };
    }
    if (!trainingAttendance) {
      return { ok: false, message: "研修参加の選択が必要です。" };
    }
    if (!partyAttendance) {
      return { ok: false, message: "懇親会参加の選択が必要です。" };
    }

    const deadline = getAttendanceDeadline_();
    if (deadline && new Date() > deadline) {
      return {
        ok: false,
        message: "締切を過ぎたため受付できません。担当者へご連絡ください。",
      };
    }

    const trainingIdResult = attendance_getOrCreateTrainingId_();
    if (!trainingIdResult.ok) {
      return { ok: false, message: trainingIdResult.message };
    }
    const trainingId = trainingIdResult.training_id;

    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(ATTENDANCE_SHEET_NAME);
    if (!sheet) {
      return {
        ok: false,
        message: `シート「${ATTENDANCE_SHEET_NAME}」が見つかりません。`,
      };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const existing = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
      const duplicate = existing.some(function (row) {
        return (
          String(row[0] || "").trim() === String(trainingId).trim() &&
          String(row[1] || "").trim() === String(name).trim()
        );
      });
      if (duplicate) {
        return { ok: false, message: "この研修は既に回答済みです。" };
      }
    }

    sheet.appendRow([
      new Date(),
      trainingId,
      name,
      trainingAttendance,
      partyAttendance,
      note,
      userAgent,
    ]);

    return { ok: true, message: "送信しました。" };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

function getAttendanceDeadline_() {
  const ss = getSpreadsheet_();
  const settings = ss.getSheetByName(ATTENDANCE_SETTINGS_SHEET_NAME);
  if (!settings) return null;

  const value = settings.getRange(ATTENDANCE_DEADLINE_CELL).getValue();
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function attendance_getMeta() {
  try {
    const ss = getSpreadsheet_();
    const settings = ss.getSheetByName(ATTENDANCE_SETTINGS_SHEET_NAME);
    if (!settings) {
      return { ok: false, message: "settings シートが見つかりません。" };
    }

    const trainingLabel = String(
      settings.getRange(ATTENDANCE_META_LABEL_CELL).getValue() || "",
    ).trim();
    const trainingTitle = String(
      settings.getRange(ATTENDANCE_META_TITLE_CELL).getValue() || "",
    ).trim();
    const trainingContent = String(
      settings.getRange(ATTENDANCE_META_CONTENT_CELL).getValue() || "",
    ).trim();
    const notice = String(
      settings.getRange(ATTENDANCE_META_NOTICE_CELL).getValue() || "",
    ).trim();

    return {
      ok: true,
      training_label: trainingLabel,
      training_title: trainingTitle,
      training_content: trainingContent,
      notice: notice,
    };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

function attendance_listNames() {
  try {
    const ss = getSpreadsheet_();
    const sheet = ss.getSheetByName(ATTENDANCE_NAMES_SHEET_NAME);
    if (!sheet) {
      return { ok: false, message: "名簿シートが見つかりません。" };
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { ok: true, names: [] };
    }

    const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    const names = values
      .map(function (row) {
        return String(row[0] || "").trim();
      })
      .filter(function (v) {
        return v;
      });

    return { ok: true, names };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

// settings!A1〜B3 に ID 管理値を保持（B1/B2/B3 を使用）
function attendance_getOrCreateTrainingId_() {
  const ss = getSpreadsheet_();
  const settings = ss.getSheetByName(ATTENDANCE_SETTINGS_SHEET_NAME);
  if (!settings) {
    return { ok: false, message: "settings シートが見つかりません。" };
  }

  const tz = "Asia/Tokyo";
  const today = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  const storedId = String(
    settings.getRange(ATTENDANCE_SETTINGS_ID_CELL).getValue() || "",
  ).trim();
  const storedDate = String(
    settings.getRange(ATTENDANCE_SETTINGS_DATE_CELL).getValue() || "",
  ).trim();
  const storedSeqRaw = settings
    .getRange(ATTENDANCE_SETTINGS_SEQ_CELL)
    .getValue();
  const storedSeq = Number(storedSeqRaw);

  let seq = Number.isFinite(storedSeq) ? storedSeq : 0;
  let trainingId = storedId;

  if (!storedDate || storedDate !== today) {
    seq = seq + 1;
    trainingId = attendance_formatTrainingId_(today, seq);
    settings.getRange(ATTENDANCE_SETTINGS_ID_CELL).setValue(trainingId);
    settings.getRange(ATTENDANCE_SETTINGS_DATE_CELL).setValue(today);
    settings.getRange(ATTENDANCE_SETTINGS_SEQ_CELL).setValue(seq);
  } else if (!trainingId) {
    if (seq <= 0) seq = 1;
    trainingId = attendance_formatTrainingId_(today, seq);
    settings.getRange(ATTENDANCE_SETTINGS_ID_CELL).setValue(trainingId);
    settings.getRange(ATTENDANCE_SETTINGS_DATE_CELL).setValue(today);
    settings.getRange(ATTENDANCE_SETTINGS_SEQ_CELL).setValue(seq);
  }

  if (!trainingId) {
    return { ok: false, message: "training_id の生成に失敗しました。" };
  }

  return { ok: true, training_id: trainingId };
}

function attendance_formatTrainingId_(dateStr, seq) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) {
    throw new Error("invalid date for training_id");
  }
  const yyyy = parts[0];
  const mm = parts[1];
  const dd = parts[2];
  const seqText = String(seq).padStart(3, "0");
  return `R${yyyy}-${mm}${dd}-${seqText}`;
}
