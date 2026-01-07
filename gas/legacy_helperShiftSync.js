/**
 * helperShiftSync.js
 *
 * Supabase の helper_shift_requests を増分同期し、
 * Googleスプレッドシートに月別シート「ヘルパーシフト-YYYY-MM」を自動生成して upsert する。
 */

/**
 * メイン関数：ヘルパー希望シフトリクエストを同期
 */
function syncHelperShiftRequestsToMonthlySheets() {
  const lock = LockService.getScriptLock();

  // 最大 30 秒待機してロック取得（競合防止）
  try {
    lock.waitLock(30000);
  } catch (e) {
    console.error("Could not acquire lock:", e);
    return;
  }

  try {
    // 設定値を読み込む
    const props = PropertiesService.getScriptProperties();
    const SUPABASE_URL = props.getProperty("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY =
      props.getProperty("SUPABASE_SERVICE_ROLE_KEY") ||
      props.getProperty("SUPABASE_SERVICE_KEY") ||
      props.getProperty("SUPABASE_ANON_KEY");
    const SHEET_ID = props.getProperty("SHEET_ID");
    const SHEET_PREFIX = props.getProperty("SHEET_PREFIX") || "ヘルパーシフト-";
    let lastSyncIso =
      props.getProperty("HELPER_SHIFT_LAST_SYNC_ISO") || "1970-01-01T00:00:00Z";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SHEET_ID) {
      console.error(
        "Missing required properties: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SHEET_ID"
      );
      return;
    }

    console.log("Starting sync from:", lastSyncIso);

    // Supabase から増分データを取得
    const rows = fetchAllSupabaseRows_(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      lastSyncIso
    );

    if (!rows || rows.length === 0) {
      console.log("No new rows to sync");
      return;
    }

    console.log(`Fetched ${rows.length} rows from Supabase`);

    // 月ごとにグループ化
    const byMonth = {};
    let maxUpdatedAt = lastSyncIso;

    for (const row of rows) {
      const dateStr = row.date || "";
      if (!dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) continue;

      const [yyyy, mm] = dateStr.split("-");
      const monthKey = `${yyyy}-${mm}`;

      if (!byMonth[monthKey]) {
        byMonth[monthKey] = [];
      }
      byMonth[monthKey].push(row);

      // 最大 updated_at を追跡
      if (row.updated_at > maxUpdatedAt) {
        maxUpdatedAt = row.updated_at;
      }
    }

    // 月ごとにシートを処理
    const spreadsheet = SpreadsheetApp.openById(SHEET_ID);

    for (const monthKey in byMonth) {
      const sheetName = SHEET_PREFIX + monthKey;
      const monthRows = byMonth[monthKey];

      // シートを取得または作成
      const sheet = ensureMonthlySheet_(spreadsheet, sheetName);

      // 行をシートに upsert
      upsertRowsToSheet_(sheet, monthRows);

      console.log(`Synced ${monthRows.length} rows to sheet: ${sheetName}`);
    }

    // 最終同期時刻を更新
    props.setProperty("HELPER_SHIFT_LAST_SYNC_ISO", maxUpdatedAt);
    console.log("Updated HELPER_SHIFT_LAST_SYNC_ISO to:", maxUpdatedAt);
  } catch (error) {
    console.error("Error in syncHelperShiftRequestsToMonthlySheets:", error);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Supabase から helper_shift_requests を取得（増分）
 * @param {string} supabaseUrl
 * @param {string} serviceRoleKey
 * @param {string} lastSyncIso - 最後の同期時刻（ISO 8601）
 * @returns {Array} rows
 */
function fetchAllSupabaseRows_(supabaseUrl, serviceRoleKey, lastSyncIso) {
  const table = "helper_shift_requests";
  const select =
    "id, created_at, updated_at, helper_name, date, pattern, start_minutes, end_minutes";

  // 増分条件：updated_at > lastSyncIso
  const filter = encodeURIComponent(`updated_at.gt.${lastSyncIso}`);

  const url = `${supabaseUrl}/rest/v1/${table}?select=${encodeURIComponent(
    select
  )}&${filter}&order=updated_at.asc&limit=5000`;

  const options = {
    method: "get",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  const status = response.getResponseCode();

  if (status !== 200) {
    console.error(`Supabase API error (${status}):`, response.getContentText());
    return [];
  }

  try {
    const data = JSON.parse(response.getContentText());
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Error parsing Supabase response:", e);
    return [];
  }
}

/**
 * 月別シート「ヘルパーシフト-YYYY-MM」を取得または作成
 * @param {Sheet} spreadsheet
 * @param {string} sheetName
 * @returns {Sheet} sheet
 */
function ensureMonthlySheet_(spreadsheet, sheetName) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    // シートを新規作成
    sheet = spreadsheet.insertSheet(sheetName);

    // ヘッダー行を作成
    const headers = [
      "ID",
      "ヘルパー名",
      "日付",
      "曜日",
      "パターン",
      "開始時刻",
      "終了時刻",
      "created_at",
      "updated_at",
    ];
    sheet.appendRow(headers);

    // ヘッダーをボールド＋背景色
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight("bold");
    headerRange.setBackground("#e8f0fe");

    // 列幅を自動調整
    for (let i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, 120);
    }
  }

  return sheet;
}

/**
 * シートに行をupsert（更新または挿入）
 * @param {Sheet} sheet
 * @param {Array} rows - Supabaseから取得した行オブジェクト
 */
function upsertRowsToSheet_(sheet, rows) {
  const values = sheet.getDataRange().getValues();

  // ID → 行インデックスのマップ（ヘッダーは1行目）
  const idToRowIndex = {};
  for (let i = 1; i < values.length; i++) {
    const id = values[i][0];
    if (id) {
      idToRowIndex[id] = i + 1; // getRange は 1-indexed
    }
  }

  // 新規追加する行と更新する行を分ける
  const rowsToAdd = [];

  for (const row of rows) {
    const id = row.id || "";
    const helperName = row.helper_name || "";
    const date = row.date || "";
    const pattern = row.pattern || "";
    const startMin =
      row.start_minutes != null ? minutesToHHMM_(row.start_minutes) : "";
    const endMin =
      row.end_minutes != null ? minutesToHHMM_(row.end_minutes) : "";
    const createdAt = row.created_at || "";
    const updatedAt = row.updated_at || "";

    // 曜日を計算
    const weekday = date ? weekdayJa_(new Date(date + "T00:00:00Z")) : "";

    const sheetRow = [
      id,
      helperName,
      date,
      weekday,
      pattern,
      startMin,
      endMin,
      createdAt,
      updatedAt,
    ];

    if (idToRowIndex[id]) {
      // 既存行を更新
      const rowNum = idToRowIndex[id];
      sheet.getRange(rowNum, 1, 1, sheetRow.length).setValues([sheetRow]);
    } else {
      // 新規追加
      rowsToAdd.push(sheetRow);
    }
  }

  // 新規行をまとめて追加
  if (rowsToAdd.length > 0) {
    sheet
      .getRange(
        sheet.getLastRow() + 1,
        1,
        rowsToAdd.length,
        rowsToAdd[0].length
      )
      .setValues(rowsToAdd);
  }
}

/**
 * 曜日を日本語で返す
 * @param {Date} date
 * @returns {string} 例: "月", "火", ...
 */
function weekdayJa_(date) {
  const days = ["日", "月", "火", "水", "木", "金", "土"];
  return days[date.getDay()];
}

/**
 * 分数を "HH:MM" 形式に変換
 * @param {number} minutes
 * @returns {string} 例: "09:30"
 */
function minutesToHHMM_(minutes) {
  if (minutes == null || isNaN(minutes)) return "";
  const hh = Math.floor(minutes / 60);
  const mm = minutes % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
