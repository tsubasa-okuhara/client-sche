/**
 * ===== 単体テスト用：1週目だけチェック =====
 */
function checkWish_2026_01_1week() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ym = '2026-01';

  const wishIndex = buildWishIndex_('ヘルパーシフト-' + ym);

  const sheet = ss.getSheetByName(`${ym}-1週目`);
  if (!sheet) throw new Error('シートが見つかりません: ' + `${ym}-1週目`);

  checkWishOnWeekSheet_(sheet, ym, wishIndex);
  ss.toast('希望シフト照合：1週目チェック完了', 'チェック', 5);
}

/**
 * ===== 本番用：必要情報!B1 の年月で 1〜6週目を一括チェック =====
 */
function checkWish_AllWeeksFromConfig() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const info = ss.getSheetByName('必要情報');
  if (!info) throw new Error('シート「必要情報」が見つかりません');

  const base = info.getRange('B1').getValue();
  if (!(base instanceof Date)) throw new Error('必要情報!B1 に日付が入っていません（例: 2026/01/01）');

  const ym = Utilities.formatString('%04d-%02d', base.getFullYear(), base.getMonth() + 1);

  // 希望シフトの index は最初に1回だけ作る
  const wishIndex = buildWishIndex_('ヘルパーシフト-' + ym);

  for (let w = 1; w <= 6; w++) {
    const sheetName = `${ym}-${w}週目`;
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    checkWishOnWeekSheet_(sheet, ym, wishIndex);
  }

  ss.toast(`${ym} 1〜6週目 チェック完了`, 'チェック', 5);
}

/**
 * ===== 週シート1枚分のチェック本体 =====
 * - schedule_id がある行だけ判定
 * - NGなら ヘルパー名セルを赤、status を conflict
 * - OKなら 色クリア、status が conflict なら confirmed に戻す
 */
function checkWishOnWeekSheet_(sheet, targetYm, wishIndex) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 4) return;

  const blocks = detectDayBlocks_(sheet);
  if (blocks.length === 0) return;

  const tz = ss.getSpreadsheetTimeZone();

  blocks.forEach(b => {
    const dObj = getDateFromHeaderCell_(sheet.getRange(1, b.dayCol));
    if (!dObj) return;

    const dateStr = Utilities.formatDate(dObj, tz, 'yyyy-MM-dd');
    if (!dateStr.startsWith(targetYm)) return;

    const numRows = lastRow - 3;

    const helperRange = sheet.getRange(4, b.helperCol, numRows, 1);
    const startRange  = sheet.getRange(4, b.startCol,  numRows, 1);
    const endRange    = sheet.getRange(4, b.endCol,    numRows, 1);
    const idRange     = sheet.getRange(4, b.idCol,     numRows, 1);
    const statusRange = sheet.getRange(4, b.statusCol, numRows, 1);

    const helpers  = helperRange.getDisplayValues();
    const starts   = startRange.getDisplayValues();
    const ends     = endRange.getDisplayValues();
    const ids      = idRange.getDisplayValues();
    const statuses = statusRange.getDisplayValues();

    const bg = helpers.map(() => ['']);
    const newStatus = statuses.map(r => [String(r[0] || '').trim()]);

    for (let i = 0; i < numRows; i++) {
      const helperName = String(helpers[i][0] || '').trim();
      const scheduleId = String(ids[i][0] || '').trim();

      // schedule_id/ヘルパー名が無い行は対象外
      if (!scheduleId || !helperName) {
        bg[i][0] = '';
        continue;
      }

      const sMin = timeToMinutesFlex_(starts[i][0]);
      const eMin = timeToMinutesFlex_(ends[i][0]);

      // 開始が無い行は判定不能なので未チェック扱い
      if (sMin == null) {
        bg[i][0] = '';
        continue;
      }

      const ok = isWithinWish_(wishIndex, dateStr, helperName, sMin, eMin);

      if (ok) {
        bg[i][0] = '';
        if (newStatus[i][0] === 'conflict') newStatus[i][0] = 'confirmed';
      } else {
        bg[i][0] = '#ff9999';
        newStatus[i][0] = 'conflict';
      }
    }

    helperRange.setBackgrounds(bg);
    statusRange.setValues(newStatus);
  });
}

/**
 * ===== 日ブロック検出（現行レイアウト固定オフセット） =====
 * 3行目の「日にち」列を dayCol とし、
 * helperCol=+1, startCol=+3, endCol=+4, idCol=+8, statusCol=+9
 */
function detectDayBlocks_(sheet) {
  const lastCol = sheet.getLastColumn();
  const header = sheet.getRange(3, 1, 1, lastCol).getDisplayValues()[0];

  const blocks = [];
  for (let c = 1; c <= lastCol; c++) {
    if (String(header[c - 1] || '').trim() !== '日にち') continue;

    blocks.push({
      dayCol: c,
      helperCol: c + 1,
      startCol:  c + 3,
      endCol:    c + 4,
      idCol:     c + 8,
      statusCol: c + 9,
    });
  }
  return blocks;
}

/**
 * ===== 希望シートを高速検索できる index に変換 =====
 * Map<dateStr, Map<helperName, slots[]>>
 */
function buildWishIndex_(wishSheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(wishSheetName);
  if (!sh) throw new Error('希望シートが見つかりません: ' + wishSheetName);

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return new Map();

  // A..F があれば足りる（週や備考は不要なので6列に縮小）
  const values = sh.getRange(2, 1, lastRow - 1, 6).getDisplayValues();

  const index = new Map();

  values.forEach(r => {
    const dateStr = String(r[0] || '').trim(); // A
    const helper  = String(r[2] || '').trim(); // C
    const pattern = String(r[3] || '').trim(); // D
    const startS  = String(r[4] || '').trim(); // E
    const endS    = String(r[5] || '').trim(); // F
    if (!dateStr || !helper) return;

    const slot = wishRowToSlot_(pattern, startS, endS);
    if (!slot) return;

    if (!index.has(dateStr)) index.set(dateStr, new Map());
    const byHelper = index.get(dateStr);
    if (!byHelper.has(helper)) byHelper.set(helper, []);
    byHelper.get(helper).push(slot);
  });

  // slots を開始時刻でソート
  for (const [, byHelper] of index.entries()) {
    for (const [, slots] of byHelper.entries()) {
      slots.sort((a, b) => a.start - b.start);
    }
  }

  return index;
}

/** 希望行 → スロット（start/end minutes） */
function wishRowToSlot_(pattern, startS, endS) {
  if (!pattern) return null;
  if (pattern === '終日') return { start: 0, end: 1440 };

  let s = timeToMinutesFlex_(startS);
  let e = timeToMinutesFlex_(endS);

  // E/F が空でも pattern から復元
  if ((s == null || e == null) && pattern) {
    const p = String(pattern).trim();

    let m = p.match(/^\-(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (m) { s = 0; e = timeToMinutesFlex_(m[1]); }

    m = p.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\-$/);
    if (m) { s = timeToMinutesFlex_(m[1]); e = 1440; }

    m = p.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\-(\d{1,2}:\d{2}(?::\d{2})?)$/);
    if (m) { s = timeToMinutesFlex_(m[1]); e = timeToMinutesFlex_(m[2]); }
  }

  if (s == null || e == null) return null;
  return { start: s, end: e };
}

/**
 * ===== 予定が希望スロットに合致するか（あなたのルール）=====
 * 1) end が空（未確定）→ start が希望内ならOK（暫定OK）
 * 2) start/end 両方ある → 完全に収まる(slot.start ≤ start かつ end ≤ slot.end)だけOK
 * 3) 境界は含める（<= / 18:00ちょうどOK）
 * 4) 希望が無い日はNG
 */
function isWithinWish_(wishIndex, dateStr, helperName, sMin, eMin) {
  const byDate = wishIndex.get(dateStr);
  if (!byDate) return false;

  const slots = byDate.get(helperName);
  if (!slots || slots.length === 0) return false;

  for (const slot of slots) {
    // 1) end未確定 → startが希望内ならOK
    if (eMin == null) {
      if (slot.start <= sMin && sMin <= slot.end) return true;
      continue;
    }

    // 2) 完全に収まるならOK（境界含む）
    if (slot.start <= sMin && eMin <= slot.end) return true;
  }
  return false;
}

/** 1行目の日付セルを Date に変換 */
function getDateFromHeaderCell_(range) {
  const v = range.getValue();
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(range.getDisplayValue() || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/** "HH:MM" / "HH:MM:SS" / "24:00" → minutes */
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