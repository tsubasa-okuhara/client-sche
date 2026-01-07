/**
 * 設定シート「必要情報」の B1 から年月を読み取り、
 * 「YYYY-MM-1週目〜YYYY-MM-6週目」シートに
 * 日曜始まり6週分のレイアウトを生成する
 *
 * 例：必要情報!B1 = 2025/01/01 の場合
 *   → シート名 "2025-01-1週目" 〜 "2025-01-6週目" を生成
 */
function generateWeekSheetsFromConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName('必要情報');
  if (!config) {
    throw new Error('設定シート「必要情報」が見つかりません');
  }

  const cell = config.getRange('B1');
  const raw = cell.getValue();         // Date か文字列
  const disp = cell.getDisplayValue(); // "2025/12/01" などの文字列

  let baseDate;

  if (raw instanceof Date) {
    baseDate = raw;
  } else {
    const text = String(disp).trim();
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) {
      baseDate = parsed;
    } else {
      throw new Error('必要情報!B1 に有効な日付を入力してください（例: 2025/12/1）');
    }
  }

  const year  = baseDate.getFullYear();
  const month = baseDate.getMonth() + 1; // 0始まりなので +1

  generateWeekSheetsForMonth_(year, month);
}

/**
 * 実処理本体（年・月を引数に受け取る）
 *
 * シート名は "YYYY-MM-1週目"〜"YYYY-MM-6週目"
 */
function generateWeekSheetsForMonth_(year, month) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weekLabels = ['1週目', '2週目', '3週目', '4週目', '5週目', '6週目'];

  // 指定月の1日
  const firstOfMonth = new Date(year, month - 1, 1);

  // カレンダー用の「最初の日曜」を求める（前月に食い込む場合あり）
  const startSunday = new Date(firstOfMonth);
  startSunday.setDate(firstOfMonth.getDate() - firstOfMonth.getDay()); // day=0(日)ならそのまま

  const monthStr = ('0' + month).slice(-2); // "01"〜"12" にゼロ埋め

  for (let w = 0; w < 6; w++) {
    const weekStart = new Date(startSunday); // コピーを作る
    weekStart.setDate(startSunday.getDate() + w * 7); // w週目の日曜

    const weekLabel = weekLabels[w];                    // "1週目" など
    const sheetName = `${year}-${monthStr}-${weekLabel}`; // "2025-01-1週目" 等

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    sheet.clear();

    fillWeekSheetLayout(sheet, weekStart, year, month, sheetName);
  }
}

/**
 * 1週ぶん（7日分）のレイアウトを横方向に並べる（拡張版）
 * - 1日あたり 10列（+ 空き1列）
 * - 既存：日にち/ヘルパー名/利用者名/開始/終了/内容/何週目か
 * - 追加：sheet_name / schedule_id / status / updated_at
 */
function fillWeekSheetLayout(sheet, weekStart, year, month, sheetName) {
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  const DATA_ROWS_PER_DAY = 10; // 1日あたり入力用に確保する行数
  const COLUMNS_PER_DAY   = 10; // ★ 7 → 10 に増やす
  const GAP_COLS          = 1;
  const BLOCK_WIDTH       = COLUMNS_PER_DAY + GAP_COLS;
  const BASE_ROW          = 1;
  const BASE_COL          = 2;  // B列開始

  const tz = Session.getScriptTimeZone();

  // 必要な列数を確保
  const lastNeededCol = BASE_COL - 1 + BLOCK_WIDTH * 7;
  const currentMax = sheet.getMaxColumns();
  if (currentMax < lastNeededCol) {
    sheet.insertColumnsAfter(currentMax, lastNeededCol - currentMax);
  }

  // 7日分ループ（日〜土）
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime());
    d.setDate(weekStart.getDate() + i);

    const inTargetMonth = (d.getMonth() === month - 1);

    const dateStr = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    const youbi   = WEEKDAYS[d.getDay()];

    const col = BASE_COL + i * BLOCK_WIDTH;

    // ① 1行目: 日付
    const dateCell = sheet.getRange(BASE_ROW, col);
    dateCell.setValue(dateStr);
    if (!inTargetMonth) dateCell.setBackground('#dddddd');

    // ② 2行目: 曜日
    sheet.getRange(BASE_ROW + 1, col).setValue(youbi);

    // ③ 3行目: ヘッダ行（10列）
    sheet.getRange(BASE_ROW + 2, col, 1, COLUMNS_PER_DAY).setValues([[
      '日にち',
      'ヘルパー名',
      '利用者名',
      '開始時間',
      '終了時間',
      '内容',
      '何週目か',
      'sheet_name',
      'schedule_id',
      'status',
      // 'updated_at' を入れるなら COLUMNS_PER_DAY を 11 にして末尾に追加してください
    ]]);
    sheet.getRange(BASE_ROW + 2, col, 1, COLUMNS_PER_DAY).setFontWeight('bold');

    // ④ データ入力行（4〜）
    const dataStartRow = BASE_ROW + 3;

    // A) 「日にち」列を日付で埋める（入力ミス防止に効果大）
    const dateColValues = Array.from({ length: DATA_ROWS_PER_DAY }, () => [dateStr]);
    sheet.getRange(dataStartRow, col + 0, DATA_ROWS_PER_DAY, 1).setValues(dateColValues);

    // B) 「何週目か」列（週ラベル）を埋める（例：2026-01-1週目）
    const weekLabelValues = Array.from({ length: DATA_ROWS_PER_DAY }, () => [sheetName]);
    sheet.getRange(dataStartRow, col + 6, DATA_ROWS_PER_DAY, 1).setValues(weekLabelValues);

    // C) sheet_name 列も同じ値を入れておく（後で集計しやすい）
    sheet.getRange(dataStartRow, col + 7, DATA_ROWS_PER_DAY, 1).setValues(weekLabelValues);

    // D) status のデフォルト（例：confirmed）
    const statusValues = Array.from({ length: DATA_ROWS_PER_DAY }, () => ['confirmed']);
    sheet.getRange(dataStartRow, col + 9, DATA_ROWS_PER_DAY, 1).setValues(statusValues);

    // schedule_id（col+8）は空でOK（後で採番）
  }

  // 列幅調整
  sheet.setColumnWidths(BASE_COL, BLOCK_WIDTH * 7, 110);
}




/**
 * すべての「◯週目」シートを対象に
 * schedule_id が空の行だけ自動発番する
 */
// function assignScheduleIds_AllWeekSheets() {
//   const ss = SpreadsheetApp.getActive();
//   const sheets = ss.getSheets();

//   sheets.forEach(sheet => {
//     const name = sheet.getName();
//     if (!/週目$/.test(name)) return; // 週シート以外は無視

//     assignScheduleIds_OneSheet_(sheet);
//   });

//   SpreadsheetApp.getUi().alert('schedule_id の自動発番が完了しました');
// }

/**
 * 1枚の週シートに対して schedule_id を付与
 */
function assignScheduleIds_OneSheet_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 4) return;

  const headerDates = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];

  // 日付ごとの最大連番を記録
  const counters = {};

  // 4行目以降を走査
  for (let col = 1; col <= lastCol; col++) {
    const dateStr = headerDates[col - 1];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    const dataStartRow = 4;

    for (let row = dataStartRow; row <= lastRow; row++) {
      const helper = sheet.getRange(row, col + 1).getValue();
      if (!helper) continue; // 空行

      const scheduleIdCell = sheet.getRange(row, col + 8); // schedule_id 列
      const currentId = scheduleIdCell.getValue();
      if (currentId) continue; // すでにある → 触らない

      // この日付のカウンタ初期化
      if (!counters[dateStr]) {
        counters[dateStr] = findMaxScheduleIndex_(sheet, dateStr) + 1;
      }

      const idx = counters[dateStr]++;
      const ymd = dateStr.replace(/-/g, '');
      const newId = `${ymd}-${String(idx).padStart(3, '0')}`;

      scheduleIdCell.setValue(newId);
    }
  }
}

/**
 * 既存の schedule_id から最大連番を探す
 */
function findMaxScheduleIndex_(sheet, dateStr) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const ymd = dateStr.replace(/-/g, '');
  let max = 0;

  for (let col = 1; col <= lastCol; col++) {
    const d = sheet.getRange(1, col).getDisplayValue();
    if (d !== dateStr) continue;

    for (let row = 4; row <= lastRow; row++) {
      const id = sheet.getRange(row, col + 8).getValue();
      if (typeof id === 'string' && id.startsWith(ymd + '-')) {
        const n = parseInt(id.split('-')[1], 10);
        if (!isNaN(n)) max = Math.max(max, n);
      }
    }
  }
  return max;
}

 function assignScheduleIds_AllWeekSheets() {
  const ss = SpreadsheetApp.getActive();
  const sheets = ss.getSheets();

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (!/週目$/.test(name)) return;
    assignScheduleIds_OneSheet_(sheet);
  });

  // ✅ トリガーでもOK
  console.log('schedule_id の自動発番が完了しました');
  ss.toast('schedule_id の自動発番が完了しました', '完了', 5);
}