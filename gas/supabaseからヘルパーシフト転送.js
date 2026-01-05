function getSupabaseConfig_() {
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('SUPABASE_URL');
  const key = props.getProperty('SUPABASE_SERVICE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY が設定されていません。');
  return { url, apiKey: key };
}

/** 分 → "HH:MM"（24:00対応） */
function minutesToTimeString_(mins) {
  if (mins == null || mins === '') return '';
  mins = Number(mins);
  if (isNaN(mins)) return '';
  if (mins === 1440) return '24:00';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return Utilities.formatString('%02d:%02d', h, m);
}

/** "HH:MM" or "HH:MM:SS" → 分数 */
function timeToMinutesFlex_(s) {
  if (s == null) return null;
  s = String(s).trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;

  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h === 24 && min === 0) return 1440;
  return h * 60 + min;
}

/** pattern の秒を落とす（例: "-15:00:00" → "-15:00" / "12:00:00-" → "12:00-"） */
function normalizePattern_(p) {
  if (!p) return '';
  p = String(p).trim();
  if (p === '終日') return p;
  return p.replace(/(\d{1,2}:\d{2}):\d{2}/g, '$1');
}

function getLastDayOfMonth_(year, month) {
  return new Date(year, month, 0).getDate(); // month は 1〜12
}

/**
 * このブックの「必要情報!B1」を元に、ヘルパーシフト-YYYY-MM を作成/更新して取り込む
 */
function importHelperShiftsHereFromSupabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const info = ss.getSheetByName('必要情報');
  if (!info) throw new Error('シート「必要情報」が見つかりません');

  const base = info.getRange('B1').getValue();
  if (!(base instanceof Date)) throw new Error('必要情報!B1 に日付が入っていません（例: 2026/01/01）');

  const year = base.getFullYear();
  const month = base.getMonth() + 1;
  const ym = Utilities.formatString('%04d-%02d', year, month);
  const firstDay = `${ym}-01`;
  const lastDay = Utilities.formatString('%s-%02d', ym, getLastDayOfMonth_(year, month));

  // 出力先シート（無ければ作成）
  const sheetName = `ヘルパーシフト-${ym}`;
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);
  sh.clear();

  // 見出し（A〜H）
  const header = ['日付','曜日','ヘルパー名','パターン','開始','終了','備考','週'];
  sh.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');

  // D〜H をテキストに（パターン/開始/終了/備考/週 が崩れないように）
  sh.getRange(2, 4, 5000, 5).setNumberFormat('@');

  // Supabase 取得
  const { url, apiKey } = getSupabaseConfig_();
  const endpoint =
    url + '/rest/v1/helper_shift_requests'
      + '?date=gte.' + firstDay
      + '&date=lte.' + lastDay
      + '&order=date,helper_name,start_minutes';

  const res = UrlFetchApp.fetch(endpoint, {
    method: 'get',
    headers: {
      apikey: apiKey,
      Authorization: 'Bearer ' + apiKey,
      Accept: 'application/json'
    },
    muteHttpExceptions: true
  });

  const code = res.getResponseCode();
  if (code >= 300) throw new Error('Supabase 取得エラー: ' + code + ' / ' + res.getContentText());

  const rows = JSON.parse(res.getContentText()) || [];
  if (!rows.length) {
    SpreadsheetApp.getActive().toast(`${sheetName}: 0件でした`, 'Supabase取込', 5);
    return;
  }

  // 出力整形
  const tz = ss.getSpreadsheetTimeZone();
  const values = rows.map(r => {
    const dObj = new Date(r.date);
    const weekday = '日月火水木金土'.charAt(dObj.getDay());

    // 週番号（1〜6）：日付の「日」から算出
    const day = parseInt(String(r.date).split('-')[2], 10);
    const weekIdx = (day && !isNaN(day)) ? (Math.floor((day - 1) / 7) + 1) : '';

    const pat = normalizePattern_(r.pattern);
    const startStr = minutesToTimeString_(r.start_minutes);
    const endStr = minutesToTimeString_(r.end_minutes);

    return [
      r.date,
      weekday,
      r.helper_name,
      String(pat),
      String(startStr),
      String(endStr),
      String(r.note || ''),
      String(weekIdx)
    ];
  });

  sh.getRange(2, 1, values.length, header.length).setValues(values);
  SpreadsheetApp.getActive().toast(`${sheetName}: ${values.length}件 取込完了`, 'Supabase取込', 5);
}