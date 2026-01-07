/**
 * 1つの週シート（例: "1週目"）の内容を
 * 「iPhoneスケジュール管理」シートへフラットに書き出す。
 *
 * - 先に iPhoneスケジュール管理 から同じ sheet_name の行を削除
 * - そのあと新しいレコードを書き込み
 */
/**
 * 1つの週シート（例: "2025-12-1週目"）の内容を
 * 「supabase転送」シートへフラットに書き出す。
 *
 * - 先に supabase転送 から同じ sheet_name の行を削除
 * - そのあと新しいレコードを書き込み
 */
function exportWeekToIphoneList(weekSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const weekSheet = ss.getSheetByName(weekSheetName);
  if (!weekSheet) {
    throw new Error(`週シートが見つかりません: ${weekSheetName}`);
  }

  const iphoneSheet = getOrCreateIphoneSheet_();
  const records = collectWeekRecords_(weekSheet, weekSheetName);

  // いったん「その週名」の古い行を削除
  deleteIphoneRowsBySheetName_(iphoneSheet, weekSheetName);

  if (!records.length) {
    SpreadsheetApp.getActive().toast(
      `週「${weekSheetName}」に有効なデータはありませんでした。`,
      'exportWeekToIphoneList',
      5
    );
    return;
  }

  // オブジェクト配列 → 2次元配列に変換
  const values = records.map(r => [
    r.date,
    r.name,
    r.client,
    r.start_time,
    r.end_time,
    r.task,
    r.sheet_name,
  ]);

  const startRow = iphoneSheet.getLastRow() + 1;
  iphoneSheet
    .getRange(startRow, 1, values.length, values[0].length)
    .setValues(values);

  SpreadsheetApp.getActive().toast(
    `週「${weekSheetName}」のデータ ${records.length}件を supabase転送 に書き出しました。`,
    'exportWeekToIphoneList',
    5
  );
}

/**
 * 「iPhoneスケジュール管理」シートを取得（なければ新規作成）し、
 * A1:G1 にヘッダも整える。
 */
function getOrCreateIphoneSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const SHEET_NAME = 'supabase転送';

  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }

  // ヘッダがなければ作る
  if (sh.getLastRow() === 0) {
    sh
      .getRange(1, 1, 1, 7)
      .setValues([['date', 'name', 'client', 'start_time', 'end_time', 'task', 'sheet_name']]);
  } else {
    const header = sh.getRange(1, 1, 1, 7).getValues()[0];
    if (!String(header[0] || '').trim()) {
      sh
        .getRange(1, 1, 1, 7)
        .setValues([['date', 'name', 'client', 'start_time', 'end_time', 'task', 'sheet_name']]);
    }
  }

  return sh;
}

/**
 * iPhoneシートから、sheet_name が指定週名の行だけ削除する
 * （2行目以降を一旦全部読み込み → 残したい行だけ書き戻す方式）
 */
function deleteIphoneRowsBySheetName_(sheet, weekSheetName) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return; // データなし（ヘッダのみ）

  const range = sheet.getRange(2, 1, lastRow - 1, 7);
  const values = range.getValues();

  const kept = values.filter(row => row[6] !== weekSheetName); // G列=sheet_name

  // 一度クリアしてから残したい行だけ書き戻す
  range.clearContent();
  if (kept.length > 0) {
    sheet.getRange(2, 1, kept.length, 7).setValues(kept);
  }
}

/**
 * 週シート（横7日ブロック）を走査して、
 * [{date, name, client, start_time, end_time, task, sheet_name}, ...] を返す
 *
 * ここは「1行を1件とカウントする条件」をどうするかが運用ルールになります。
 * 今は「name / client / start_time / end_time / task がすべて空ならスキップ」
 */
function collectWeekRecords_(weekSheet, weekSheetName) {
  const records = [];

  // ★ generateWeekSheetsForMonth_ のレイアウトと揃える
  const DATA_ROWS_PER_DAY = 10; // 4〜13行目
  const COLUMNS_PER_DAY   = 7;  // date〜sheet_name 列
  const GAP_COLS          = 1;  // ブロック間の空き列
  const BLOCK_WIDTH       = COLUMNS_PER_DAY + GAP_COLS; // 7+1=8列ぶん
  const BASE_ROW          = 1;  // 1行目 = 日付
  const BASE_COL          = 2;  // B列から開始

  const tz = Session.getScriptTimeZone();

  // 日〜土の7日分ループ
  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const col = BASE_COL + dayIndex * BLOCK_WIDTH;

    // ブロック上端の1行目の日付（"2025-12-01" 文字列 or Date 想定）
    const dateTopCell = weekSheet.getRange(BASE_ROW, col);
    const dateTopRaw  = dateTopCell.getValue();
    const dateTopDisp = dateTopCell.getDisplayValue();

    let dateTopStr;
    if (dateTopRaw instanceof Date) {
      dateTopStr = Utilities.formatDate(dateTopRaw, tz, 'yyyy-MM-dd');
    } else if (dateTopDisp) {
      dateTopStr = String(dateTopDisp);
    } else {
      // 日付が取れない列はスキップ
      continue;
    }

    const dataStartRow = BASE_ROW + 3; // 4行目から
    const numRows      = DATA_ROWS_PER_DAY;

    const range = weekSheet.getRange(
      dataStartRow,
      col,
      numRows,
      COLUMNS_PER_DAY
    );
    const rows = range.getValues();

    for (let i = 0; i < rows.length; i++) {
      const [dateCell, name, client, start, end, task, sheetNameCell] = rows[i];

      // 1件としてカウントする条件：
      // name / client / start / end / task が全部空ならスキップ
      if (!name && !client && !start && !end && !task) {
        continue;
      }

      // 行の1列目（"日にち"列）に値があれば優先。なければブロック上端の日付
      let dateStr;
      if (dateCell instanceof Date) {
        dateStr = Utilities.formatDate(dateCell, tz, 'yyyy-MM-dd');
      } else if (dateCell) {
        dateStr = String(dateCell);
      } else {
        dateStr = dateTopStr;
      }

      records.push({
        date: dateStr,
        name: String(name || ''),
        client: String(client || ''),
        start_time: formatTimeCell_(start),
        end_time: formatTimeCell_(end),
        task: String(task || ''),
        sheet_name: String(sheetNameCell || weekSheetName),
      });
    }
  }

  return records;
}

/**
 * 時刻セルを "HH:mm" 形式の文字列にそろえるヘルパー
 * - Date型ならスクリプトのタイムゾーンで "HH:mm" にフォーマット
 * - 文字列ならそのまま（前後スペースだけトリム）
 */
function formatTimeCell_(v) {
  if (v == null || v === '') return '';

  if (Object.prototype.toString.call(v) === '[object Date]') {
    const tz = Session.getScriptTimeZone();
    return Utilities.formatDate(v, tz, 'HH:mm');
  }

  const s = String(v).trim();
  return s;
}

/**
 * 6週分まとめて書き出したいとき用
 * 必要に応じて使ってください。
 */
function exportAllWeeksFromConfig() {
  for (let i = 1; i <= 6; i++) {
    exportWeekFromConfig_(i);
  }
}


/**
 * 必要情報!B1 の年月から
 * "YYYY-MM-◯週目" のシート名を作って exportWeekToIphoneList を呼ぶ
 *
 * weekIndex: 1〜6
 */
function exportWeekFromConfig_(weekIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = ss.getSheetByName('必要情報');
  if (!config) throw new Error('設定シート「必要情報」が見つかりません');

  const base = config.getRange('B1').getValue(); // Date 前提
  if (!(base instanceof Date)) {
    throw new Error('必要情報!B1 に有効な日付を入れてください');
  }

  const year  = base.getFullYear();
  const month = base.getMonth() + 1;
  const monthStr = ('0' + month).slice(-2);

  const weekLabels = ['1週目', '2週目', '3週目', '4週目', '5週目', '6週目'];
  const label = weekLabels[weekIndex - 1];
  const sheetName = `${year}-${monthStr}-${label}`;   // 例: 2025-12-1週目

  exportWeekToIphoneList(sheetName);
}

function exportWeek1FromConfig() {
  exportWeekFromConfig_(1);
}

