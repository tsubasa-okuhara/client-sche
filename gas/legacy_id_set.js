/**
 * 2026-01-1週目〜6週目の全シートに schedule_id を一括採番
 * schedule_id形式: YYYYMMDD-001
 */
function assignScheduleIds_2026_01_AllWeeks() {
  assignScheduleIds_AllWeeks_('2026-01');
}

/**
 * 指定年月(YYYY-MM)の「1週目〜6週目」シートに schedule_id を一括採番
 */
function assignScheduleIds_AllWeeks_(targetYm) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 対象シート名を列挙
  const weekSheets = [];
  for (let w = 1; w <= 6; w++) {
    const name = `${targetYm}-${w}週目`;
    const sh = ss.getSheetByName(name);
    if (sh) weekSheets.push(sh);
  }
  if (weekSheets.length === 0) {
    throw new Error(`対象の週シートが見つかりません: ${targetYm}-1週目〜6週目`);
  }

  // ① まず全シート横断で「日付ごとの最大連番」を集計（衝突回避）
  const tz = ss.getSpreadsheetTimeZone();
  const maxSeqByDateKey = new Map(); // dateKey(YYYYMMDD) -> maxSeq

  weekSheets.forEach(sh => {
    const blocks = detectDayBlocksByFixedOffsets_(sh);
    blocks.forEach(b => {
      const dObj = getDateFromHeaderCell_(sh.getRange(1, b.dayCol));
      if (!dObj) return;

      const dateKey = Utilities.formatDate(dObj, tz, 'yyyyMMdd');
      const numRows = Math.max(0, sh.getLastRow() - 3);
      if (numRows <= 0) return;

      const idVals = sh.getRange(4, b.scheduleIdCol, numRows, 1).getDisplayValues();
      for (let i = 0; i < idVals.length; i++) {
        const s = String(idVals[i][0] || '').trim();
        const m = s.match(/^(\d{8})-(\d{3})$/);
        if (!m) continue;
        const dk = m[1];
        const seq = parseInt(m[2], 10) || 0;
        const cur = maxSeqByDateKey.get(dk) || 0;
        if (seq > cur) maxSeqByDateKey.set(dk, seq);
      }
    });
  });

  // ② 各シートへ採番して書き込み
  let totalAssigned = 0;
  weekSheets.forEach(sh => {
    totalAssigned += assignScheduleIds_ForOneWeekSheet_(sh, maxSeqByDateKey);
  });

  ss.toast(`schedule_id 採番完了: ${totalAssigned}件`, '採番', 5);
}

/**
 * 1枚の週シートに対して schedule_id を採番して付与
 * - 既にIDがある行はスキップ
 * - 「ヘルパー/利用者/開始/終了/内容」のどれかが入っている行を予定行とみなす
 * - maxSeqByDateKey を更新しながら採番する（全体で衝突しない）
 * @return {number} このシートで採番した件数
 */
function assignScheduleIds_ForOneWeekSheet_(sh, maxSeqByDateKey) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tz = ss.getSpreadsheetTimeZone();
  const lastRow = sh.getLastRow();
  if (lastRow < 4) return 0;

  const numRows = lastRow - 3;

  const blocks = detectDayBlocksByFixedOffsets_(sh);
  if (blocks.length === 0) return 0;

  let assigned = 0;

  blocks.forEach(b => {
    const dObj = getDateFromHeaderCell_(sh.getRange(1, b.dayCol));
    if (!dObj) return;

    const dateKey = Utilities.formatDate(dObj, tz, 'yyyyMMdd');
    let seq = maxSeqByDateKey.get(dateKey) || 0;

    // 各列をまとめて読む（高速）
    const helperVals = sh.getRange(4, b.helperCol, numRows, 1).getDisplayValues();
    const clientVals = sh.getRange(4, b.clientCol, numRows, 1).getDisplayValues();
    const startVals  = sh.getRange(4, b.startCol,  numRows, 1).getDisplayValues();
    const endVals    = sh.getRange(4, b.endCol,    numRows, 1).getDisplayValues();
    const taskVals   = sh.getRange(4, b.taskCol,   numRows, 1).getDisplayValues();

    const idRange = sh.getRange(4, b.scheduleIdCol, numRows, 1);
    const idVals  = idRange.getDisplayValues(); // 既存ID

    // idVals を上書き用に作る（setValues用）
    const outIds = idVals.map(r => [String(r[0] || '').trim()]);

    for (let i = 0; i < numRows; i++) {
      // 既にIDがあるならスキップ
      if (outIds[i][0]) continue;

      const helper = String(helperVals[i][0] || '').trim();
      const client = String(clientVals[i][0] || '').trim();
      const st     = String(startVals[i][0]  || '').trim();
      const en     = String(endVals[i][0]    || '').trim();
      const task   = String(taskVals[i][0]   || '').trim();

      // “予定行”判定：どれか1つでも入っていれば採番対象
      if (!helper && !client && !st && !en && !task) continue;

      seq++;
      const newId = `${dateKey}-${String(seq).padStart(3, '0')}`;
      outIds[i][0] = newId;
      assigned++;
    }

    // この日付の最大連番を更新
    maxSeqByDateKey.set(dateKey, seq);

    // 変更があった日だけ書き込み（高速）
    // ※ outIds の中に空→値になったものがある場合のみ setValues しても良いが、
    //   ここでは単純化して常に書いてOK（numRowsが小さいので問題なし）
    idRange.setValues(outIds);
  });

  return assigned;
}

/**
 * 週シートの「日ブロック」を検出（固定オフセット版）
 * あなたの現在の週シート構造（10列/日ブロック）に合わせる:
 * - 3行目の「日にち」列を dayCol とし、
 *   helperCol=+1, clientCol=+2, startCol=+3, endCol=+4, taskCol=+5,
 *   scheduleIdCol=+8, statusCol=+9
 */
function detectDayBlocksByFixedOffsets_(sh) {
  const lastCol = sh.getLastColumn();
  const header = sh.getRange(3, 1, 1, lastCol).getDisplayValues()[0];

  const blocks = [];
  for (let c = 1; c <= lastCol; c++) {
    if (String(header[c - 1] || '').trim() !== '日にち') continue;

    // schedule_id が想定位置に無い（構造違い）場合はスキップ
    const scheduleIdCol = c + 8;
    if (scheduleIdCol > lastCol) continue;

    const scheduleIdLabel = String(header[scheduleIdCol - 1] || '').trim();
    if (scheduleIdLabel !== 'schedule_id') continue;

    blocks.push({
      dayCol: c,
      helperCol: c + 1,
      clientCol: c + 2,
      startCol:  c + 3,
      endCol:    c + 4,
      taskCol:   c + 5,
      scheduleIdCol: c + 8,
      statusCol: c + 9,
    });
  }
  return blocks;
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
