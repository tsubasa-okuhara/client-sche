/**
 * 「supabase転送」シートに入っている全レコードを
 * Supabase の schedule テーブルに【追記】する。
 *
 * 既存の schedule の行は一切削除しません。
 */
function sendSupabaseTransferAllToSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('supabase転送');
  if (!sh) throw new Error('シート「supabase転送」が見つかりません');

  const lastRow = sh.getLastRow();
  if (lastRow <= 1) {
    SpreadsheetApp.getActive().toast(
      'supabase転送 にデータがありません',
      'sendSupabaseTransferAllToSupabase',
      5
    );
    return;
  }

  // A2:G? の全データを取得
  const values = sh.getRange(2, 1, lastRow - 1, 7).getValues();

  // 空行を除外しつつオブジェクト配列へ
  const records = values
    .filter(row => {
      // date〜task のどれか1つでも値があれば採用
      const [date, name, client, start, end, task] = row;
      return date || name || client || start || end || task;
    })
    .map(row => ({
      date: row[0],                      // "2025-12-31"（Date でも文字列でもOK）
      name: row[1],
      client: row[2],
      start_time: formatTimeCell_(row[3]), // ★ ここで必ず "HH:mm" に変換
      end_time: formatTimeCell_(row[4]),   // ★ 同上
      task: row[5],
      sheet_name: row[6],
    }));

  if (!records.length) {
    SpreadsheetApp.getActive().toast(
      'supabase転送 に有効なデータがありません（空行のみ）',
      'sendSupabaseTransferAllToSupabase',
      5
    );
    return;
  }

  postScheduleAppendToSupabase_(records);
}

/**
 * Supabase の schedule テーブルに対して
 * 「records をそのまま INSERT する」だけの処理（削除なし）。
 */
function postScheduleAppendToSupabase_(records) {
  const props = PropertiesService.getScriptProperties();
  const baseUrl  = props.getProperty('SUPABASE_URL');          // 例: https://xxxx.supabase.co
  const anonKey  = props.getProperty('SUPABASE_ANON_KEY');
  const table    = props.getProperty('SUPABASE_TABLE_SCHEDULE') || 'schedule';

  if (!baseUrl || !anonKey) {
    throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY がスクリプトプロパティに設定されていません');
  }

  const headers = {
    'apikey': anonKey,
    'Authorization': 'Bearer ' + anonKey,
    'Content-Type': 'application/json',
  };

  const insertUrl = `${baseUrl}/rest/v1/${table}`;
  const insertRes = UrlFetchApp.fetch(insertUrl, {
    method: 'post',
    headers: {
      ...headers,
      'Prefer': 'return=representation', // または 'Prefer': 'return=minimal'
    },
    payload: JSON.stringify(records),
    muteHttpExceptions: true,
  });

  const insertCode = insertRes.getResponseCode();
  if (insertCode < 200 || insertCode >= 300) {
    throw new Error(
      `Supabase INSERT でエラー: HTTP ${insertCode} - ${insertRes.getContentText()}`
    );
  }

  SpreadsheetApp.getActive().toast(
    `Supabase(schedule) に supabase転送 から ${records.length}件 追記しました`,
    'postScheduleAppendToSupabase_',
    5
  );
}

