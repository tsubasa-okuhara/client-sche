/**
 * 移動サービス記録転送（GAS → Supabase upsert）
 * Sheet: 移動サービス記録転送
 * Table: schedule_tasks_move
 * Key: sheet_schedule_id（on_conflict）
 */
function upsertMoveTasksToSupabase() {
  const props = PropertiesService.getScriptProperties();
  const SUPABASE_URL = props.getProperty("SUPABASE_URL");
  const SERVICE_ROLE_KEY = props.getProperty("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が未設定です"
    );
  }

  const SHEET_NAME = "移動サービス記録転送";
  const TABLE = "schedule_tasks_move";
  const CONFLICT_KEY = "sheet_schedule_id";

  const sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error(`シート「${SHEET_NAME}」が見つかりません`);

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length <= 1) {
    Logger.log("データ行がありません");
    return;
  }

  const header = values[0].map((h) => String(h || "").trim());
  const rows = values.slice(1);

  // 必須カラム（シート側のヘッダ名と一致している前提）
  const required = [
    "sheet_schedule_id",
    "task_date",
    "start_time",
    "end_time",
    "client_name",
    "primary_helper_name",
  ];

  // ヘッダ検証（不足なら即エラー）
  const missing = required.filter((k) => !header.includes(k));
  if (missing.length) {
    throw new Error(`ヘッダ不足: ${missing.join(", ")}`);
  }

  // note から「出発→到着」を補完する
  const parseRoute = (note) => {
    const s = String(note || "").trim();
    if (!s) return { from_place: null, to_place: null };
    const m = s.replace(/\s+/g, "").match(/^(.+?)(?:→+|〜|~|～)(.+)$/);
    if (!m) return { from_place: null, to_place: null };
    const from_place = m[1]?.trim() || null;
    const to_place = m[2]?.trim() || null;
    if (!from_place || !to_place) return { from_place: null, to_place: null };
    return { from_place, to_place };
  };

  // 行→オブジェクト化
  const payload = rows
    .filter((row) => row.join("").trim() !== "")
    .map((row) => {
      const obj = {};
      header.forEach((h, i) => (obj[h] = row[i] ?? ""));
      return obj;
    })
    .map((r) => {
      // デフォルト補完
      if (!r.helper_names) r.helper_names = r.primary_helper_name;
      if (!r.status) r.status = "planned";
      // route補完（from/toが空ならnoteから抽出）
      if (!r.from_place || !r.to_place) {
        const { from_place, to_place } = parseRoute(r.note);
        if (!r.from_place) r.from_place = from_place;
        if (!r.to_place) r.to_place = to_place;
      }
      // route_note 補完
      if (!r.route_note && r.note) r.route_note = r.note;
      return r;
    })
    .filter((r) => {
      // sheet_schedule_id が空は upsertキーにならないので除外
      if (!String(r.sheet_schedule_id || "").trim()) return false;
      return required.every((k) => String(r[k] || "").trim() !== "");
    });

  if (!payload.length) {
    Logger.log("送信対象データがありません（必須未充足/空行のみ）");
    return;
  }

  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?on_conflict=${CONFLICT_KEY}`;
  const CHUNK = 200;

  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK);

    const res = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(chunk),
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      muteHttpExceptions: true,
    });

    const status = res.getResponseCode();
    const body = res.getContentText();

    Logger.log(
      `Chunk ${i}-${i + chunk.length - 1} / ${payload.length} rows, Status: ${status}`
    );
    Logger.log(`Response Body: ${body}`);

    if (status >= 300) {
      throw new Error(`Supabase upsert error: ${status}\n${body}`);
    }
  }
}
