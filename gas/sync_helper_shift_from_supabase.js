/**
 * 現役：Supabase helper_shift_requests → Sheets（月別：ヘルパーシフト-YYYY-MM）
 * 実行関数：importHelperShiftsHereFromSupabase
 * 月の基準：必要情報!B1
 */

function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty("SUPABASE_URL");
  const key = props.getProperty("SUPABASE_SERVICE_KEY");
  if (!url || !key)
    throw new Error(
      "SUPABASE_URL / SUPABASE_SERVICE_KEY が設定されていません。"
    );
  return { url, apiKey: key };
}

/** 分 → "HH:MM"（24:00対応） */
function minutesToTimeString_(mins) {
  if (mins == null || mins === "") return "";
  mins = Number(mins);
  if (isNaN(mins)) return "";
  if (mins === 1440) return "24:00";
  var h = Math.floor(mins / 60);
  var m = mins % 60;
  return Utilities.formatString("%02d:%02d", h, m);
}

/** YYYY-MM の「その月の最終日」を返す */
function getLastDayOfMonth_(year, month) {
  return new Date(year, month, 0).getDate(); // month は 1〜12
}

/**
 * Supabase helper_shift_requests → シート「ヘルパーシフト-YYYY-MM」に書き出す
 */
function importHelperShiftsFromSupabase() {
  var ss = SpreadsheetApp.getActive();
  var infoSheet = ss.getSheetByName("必要情報");
  if (!infoSheet) throw new Error("シート「必要情報」が見つかりません");

  var baseDate = infoSheet.getRange("B1").getValue();
  if (!(baseDate instanceof Date))
    throw new Error("必要情報!B1 に日付が入っていません（例: 2026/01/01）");

  var year = baseDate.getFullYear();
  var month = baseDate.getMonth() + 1;

  var monthStr = Utilities.formatString("%04d-%02d", year, month);
  var firstDay = monthStr + "-01";
  var lastDay = Utilities.formatString(
    "%s-%02d",
    monthStr,
    getLastDayOfMonth_(year, month)
  );

  var sheetName = "ヘルパーシフト-" + monthStr;
  var sheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
  sheet.clear();

  var header = [
    "日付",
    "曜日",
    "ヘルパー名",
    "パターン",
    "開始",
    "終了",
    "備考",
    "週",
  ];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  // ★ D〜H をテキスト固定（D=4, H=8 → 5列分）
  sheet.getRange(2, 4, 5000, 5).setNumberFormat("@");

  var config = getSupabaseConfig_();
  var url =
    config.url +
    "/rest/v1/helper_shift_requests" +
    "?date=gte." +
    firstDay +
    "&date=lte." +
    lastDay +
    "&order=date,helper_name,start_minutes";

  var res = UrlFetchApp.fetch(url, {
    method: "get",
    headers: {
      apikey: config.apiKey,
      Authorization: "Bearer " + config.apiKey,
      Accept: "application/json",
    },
    muteHttpExceptions: true,
  });

  var code = res.getResponseCode();
  if (code >= 300)
    throw new Error(
      "Supabase 取得エラー: " + code + " / " + res.getContentText()
    );

  var rows = JSON.parse(res.getContentText());
  if (!rows.length) return;

  var values = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var d = new Date(r.date);
    var weekday = "日月火水木金土".charAt(d.getDay());

    var weekIdx = getWeekIndexInMonth_(r.date);

    values.push([
      r.date,
      weekday,
      r.helper_name,
      String(normalizePattern_(r.pattern)),
      String(minutesToTimeString_(r.start_minutes)),
      String(minutesToTimeString_(r.end_minutes)),
      r.note || "",
      String(weekIdx), // ★ H列
    ]);
  }

  sheet.getRange(2, 1, values.length, values[0].length).setValues(values);
}

/** "HH:MM" or "HH:MM:SS" → 分数 */
function timeStringToMinutes_(s) {
  if (!s) return null;
  s = String(s).trim();

  // ★ 秒ありにも対応
  var m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  var h = parseInt(m[1], 10);
  var min = parseInt(m[2], 10);

  // "24:00" / "24:00:00" 対応
  if (h === 24 && min === 0) return 1440;

  return h * 60 + min;
}

/** pattern の秒を落とす（例: "-15:00:00" → "-15:00" / "12:00:00-" → "12:00-"） */
function normalizePattern_(p) {
  if (!p) return "";
  p = String(p).trim();
  if (p === "終日") return p;
  // HH:MM:SS を HH:MM に
  return p.replace(/(\d{1,2}:\d{2}):\d{2}/g, "$1");
}

/** YYYY-MM-DD → その月の「週番号（1〜6）」 */
function getWeekIndexInMonth_(dateStr) {
  // dateStr: "2026-01-04" 等
  const parts = String(dateStr).split("-");
  if (parts.length !== 3) return "";
  const day = parseInt(parts[2], 10);
  if (!day || isNaN(day)) return "";
  return Math.floor((day - 1) / 7) + 1; // 1〜6
}
