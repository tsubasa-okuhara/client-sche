import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "./style.css";

const SUPABASE_URL = "https://xwnbdlcukycihgfrfcox.supabase.co"; // あなたのURL
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * グローバルステータスバナーを表示・更新する
 * @param message メッセージ文字列
 * @param type 'info' (青) | 'ok' (緑) | 'error' (赤)
 */
function setStatus(
  message: string,
  type: "info" | "ok" | "error" = "info"
): void {
  const statusEl = document.getElementById(
    "status"
  ) as HTMLParagraphElement | null;
  if (!statusEl) return;

  statusEl.textContent = message;
  statusEl.className = `status-banner status-${type}`;

  // エラーの場合は自動スクロール
  if (type === "error") {
    statusEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

// ★ 時刻入力の厳密検証と変換ユーティリティ
const DEFAULT_START_MIN = 6 * 60; // 06:00
const DEFAULT_END_MIN = 24 * 60; // 24:00

/**
 * "HH:MM" 形式の時刻文字列を分単位に変換（厳密版）
 * @param hhmm "HH:MM" 形式（例: "12:30"）
 * @returns 分単位（例: 750）、不正なら null
 */
function toMinutesStrict(hhmm: string): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 24) return null;
  if (mm < 0 || mm > 59) return null;
  if (hh === 24 && mm !== 0) return null; // 24:00 のみ許可
  return hh * 60 + mm;
}

/**
 * 本番(dist)の index.html が SPAシェル（<div id="app"></div> だけ）になっても
 * 画面が真っ白にならないように、必要なHTMLを #app に注入する。
 * （既に helperName 等が存在するなら注入しない）
 */
const APP_TEMPLATE = `
  <div class="topbar" style="margin:8px 0 12px;">
    <a class="backBtn" href="https://client-sche.web.app/" aria-label="ひろばに戻る">
      ← ひろばに戻る
    </a>
  </div>
  <main style="max-width:600px;margin:16px auto;font-family:system-ui;">
    <h1>ヘルパー希望シフト</h1>

    <div style="margin:8px 0;display:flex;align-items:center;gap:8px">
      <label>氏名：
        <input id="helperName" type="text" placeholder="例：奥原" />
      </label>
    </div>

    <div style="margin:8px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <label>日付：
        <input id="date" type="date" />
      </label>
      <button id="prevDayBtn" type="button">◀ 前の日</button>
      <button id="nextDayBtn" type="button">次の日 ▶</button>
      <button id="loadBtn" type="button">この日の入力済みを読み込む</button>
    </div>

    <hr />

    <h2 style="font-size:1rem">希望スロット</h2>
    <p style="font-size:0.85rem;color:#666">
      「＋ スロット追加」で、1日の中に複数の出られる時間帯を登録できます。
    </p>

    <div id="slotsContainer"></div>

    <button id="addSlotBtn" type="button" style="margin-top:8px">
      ＋ スロット追加
    </button>

    <hr style="margin:16px 0" />

    <button id="submitBtn" type="button">送信</button>
    <p id="status" style="margin-top:16px;color:#333"></p>

    <hr style="margin-top:24px" />

    <h2 style="font-size:1.1rem;margin-bottom:8px">送信済み内容（確認用）</h2>
    <p style="font-size:0.85rem;color:#666">
      氏名と日付（＝月）を指定して「この月の入力状況を表示」を押すと、
      その月に入力された希望が一覧表示されます。
    </p>

    <button id="loadMonthlySummaryBtn" type="button" style="margin-bottom:8px">
      この月の入力状況を表示
    </button>

    <div id="summaryCards" style="display:flex;gap:8px;overflow-x:auto;padding:4px 0"></div>
  </main>
`;

function ensureAppMarkup() {
  // 既に画面が存在するなら何もしない
  if (document.getElementById("helperName")) return;

  const app = document.getElementById("app");
  // #app が無い構成でも安全に動くように body に入れる
  const mount = app ?? document.body;
  mount.innerHTML = APP_TEMPLATE;
}

type ShiftPattern = "終日" | string;

interface HelperShiftRequest {
  helper_name: string;
  date: string; // "YYYY-MM-DD"
  pattern: ShiftPattern;
  start_minutes: number | null;
  end_minutes: number | null;
  note: string | null;
}

// "HH:MM" → 分数
function timeStringToMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}

// 分数 → "HH:MM"
function minutesToTimeString(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// pattern を組み立てる
function buildPattern(allday: string, start: string, end: string): string {
  if (allday === "終日") return "終日";

  const s = start.trim();
  const e = end.trim();

  // ★ 両方埋まっているとき
  if (s && e) return `${s}-${e}`;

  // ★ 開始だけ → "12:00-"
  if (s && !e) return `${s}-`;

  // ★ 終了だけ → "-12:00"
  if (!s && e) return `-${e}`;

  // ★ 両方空 → 無効（あとで判定）
  return "";
}

// pattern → {start, end} 分数
function parsePatternToMinutes(pattern: string): {
  start: number | null;
  end: number | null;
} {
  const DAY_START = 0;
  const DAY_END = 24 * 60;

  if (pattern === "終日") return { start: DAY_START, end: DAY_END };

  const m1 = pattern.match(/^-(\d{1,2}:\d{2})$/);
  if (m1) {
    const end = timeStringToMinutes(m1[1]);
    return { start: DAY_START, end };
  }

  const m2 = pattern.match(/^(\d{1,2}:\d{2})-$/);
  if (m2) {
    const start = timeStringToMinutes(m2[1]);
    return { start, end: DAY_END };
  }

  const m3 = pattern.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (m3) {
    const start = timeStringToMinutes(m3[1]);
    const end = timeStringToMinutes(m3[2]);
    return { start, end };
  }

  return { start: null, end: null };
}

function createSlotRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "slot-row";
  row.style.border = "1px solid #ddd";
  row.style.padding = "8px";
  row.style.marginTop = "8px";
  row.style.borderRadius = "4px";

  row.innerHTML = `
    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
      <label>
        終日：
        <select class="allday">
          <option value="">（選択しない）</option>
          <option value="終日">終日</option>
        </select>
      </label>
      <label>
        希望時間帯 :
        <input class="start" type="time" />
      </label>
      <label>
        から：
        <input class="end" type="time" />
      </label>
        まで：
      <label style="flex: 1 1 100%;">
        備考：
        <input class="note" type="text" placeholder="例：午前のみ" style="width: 100%;" />
      </label>
      <button type="button" class="remove-slot-btn" style="margin-top: 4px;">
        このスロットを削除
      </button>
    </div>
  `;

  const removeBtn = row.querySelector(
    ".remove-slot-btn"
  ) as HTMLButtonElement | null;
  removeBtn?.addEventListener("click", () => {
    row.remove();
  });

  return row;
}

function updateSubmitButtonEnabled() {
  const helperNameInput = document.getElementById(
    "helperName"
  ) as HTMLInputElement | null;
  const dateInput = document.getElementById("date") as HTMLInputElement | null;
  const submitBtn = document.getElementById(
    "submitBtn"
  ) as HTMLButtonElement | null;

  if (!helperNameInput || !dateInput || !submitBtn) return;

  const hasName = helperNameInput.value.trim().length > 0;
  const hasDate = dateInput.value.trim().length > 0;

  submitBtn.disabled = !(hasName && hasDate);
}

function shiftDate(dateStr: string, deltaDays: number): string {
  // dateStr が "2026-01-01" のような形式だと想定
  if (!dateStr) {
    return dateStr;
  }
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return dateStr;

  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);

  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");

  return `${yy}-${mm}-${dd}`;
}

function formatWeekday(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  const w = ["日", "月", "火", "水", "木", "金", "土"][dt.getDay()];
  return w;
}

function buildSlotLabel(row: HelperShiftRequest): string {
  if (row.pattern === "終日") {
    return "終日";
  }

  const startStr = minutesToTimeString(row.start_minutes);
  const endStr = minutesToTimeString(row.end_minutes);

  if (row.pattern.startsWith("-")) {
    // "-12:00" のようなパターン → "-12:00"
    return `-${endStr}`;
  }
  if (row.pattern.endsWith("-")) {
    // "12:00-" のようなパターン → "12:00-"
    return `${startStr}-`;
  }

  // "12:00-15:00" のようなパターン → "12:00-15:00"
  return `${startStr}-${endStr}`;
}

async function submitOneDay() {
  const helperName = (
    document.getElementById("helperName") as HTMLInputElement
  ).value.trim();
  const date = (document.getElementById("date") as HTMLInputElement).value;

  if (!helperName) {
    alert("氏名を入力してください");
    return;
  }
  if (!date) {
    alert("日付を選択してください");
    return;
  }

  const slotRows = document.querySelectorAll<HTMLDivElement>(".slot-row");
  const payloads: HelperShiftRequest[] = [];

  // ★ 部分的な入力（不完全なスロット）を検出するフラグ
  let hasInvalid = false;
  // ★ 完全空でない行が1つでもあれば true
  let hasAnyTouched = false;

  slotRows.forEach((row) => {
    const allday =
      (row.querySelector(".allday") as HTMLSelectElement | null)?.value ?? "";
    const start =
      (row.querySelector(".start") as HTMLInputElement | null)?.value ?? "";
    const end =
      (row.querySelector(".end") as HTMLInputElement | null)?.value ?? "";
    const note =
      (row.querySelector(".note") as HTMLInputElement | null)?.value.trim() ??
      "";

    const pattern = buildPattern(allday, start, end);
    const s = start.trim();
    const e = end.trim();

    const isCompletelyEmpty = !allday && !s && !e && !note;
    if (isCompletelyEmpty) return; // 完全に空なら無視

    // 完全空ではない＝何か入力された
    hasAnyTouched = true;

    // ★ 厳密な時刻検証：start / end がどちらか入力されていたら "HH:MM" 形式で必ず完全であること
    // pattern が '終日' なら時刻チェックスキップ
    if (allday !== "終日" && (s || e)) {
      // s が入力 → 厳密チェック（toMinutesStrict で null ならエラー）
      if (s && toMinutesStrict(s) === null) {
        hasInvalid = true;
        return;
      }
      // e が入力 → 厳密チェック
      if (e && toMinutesStrict(e) === null) {
        hasInvalid = true;
        return;
      }
    }

    // pattern が空なら部分入力（備考のみ等）とみなしてエラー
    if (!pattern) {
      hasInvalid = true;
      return;
    }

    // 時刻補完（start/end が空なら DEFAULT を使う）
    let finalSMin: number | null = null;
    let finalEMin: number | null = null;

    if (pattern === "終日") {
      finalSMin = 0;
      finalEMin = DEFAULT_END_MIN;
    } else if (pattern.startsWith("-")) {
      // "-15:00" 形式 → start なし、end あり
      finalSMin = DEFAULT_START_MIN;
      finalEMin = toMinutesStrict(e);
    } else if (pattern.endsWith("-")) {
      // "12:00-" 形式 → start あり、end なし
      finalSMin = toMinutesStrict(s);
      finalEMin = DEFAULT_END_MIN;
    } else {
      // "12:00-15:00" 形式 → 両方あり
      finalSMin = toMinutesStrict(s);
      finalEMin = toMinutesStrict(e);
    }

    // 範囲チェック（開始 < 終了）
    if (finalSMin !== null && finalEMin !== null) {
      if (finalSMin >= finalEMin) {
        hasInvalid = true;
        return;
      }
    } else if (finalSMin === null || finalEMin === null) {
      // toMinutesStrict が失敗した場合
      hasInvalid = true;
      return;
    }

    payloads.push({
      helper_name: helperName,
      date,
      pattern,
      start_minutes: finalSMin,
      end_minutes: finalEMin,
      note: note || null,
    });
  });

  // ★ 時刻フォーマット不正があった場合は送信を中止
  if (hasInvalid) {
    setStatus(
      "エラー：終日・時間を確認してください（終日を選ぶか、開始/終了をHH:MMで両方入力してください）",
      "error"
    );
    alert("時間は「HH:MM」の形式で入力してください（例：12:00）。");
    return;
  }

  // ★休み扱いは「何も触っていない」場合のみ（備考だけ等は hasInvalid で止まる）
  if (!hasAnyTouched) {
    setStatus("この日は休みとして登録中…（希望スロットなし）", "info");

    const { error: delError } = await supabase
      .from("helper_shift_requests")
      .delete()
      .eq("helper_name", helperName)
      .eq("date", date);

    if (delError) {
      console.error("delete error", delError);
      setStatus(`削除エラー: ${delError.message}`, "error");
    } else {
      setStatus(
        "この日は「休み」として登録しました（希望スロットなし）✅",
        "ok"
      );
    }
    return;
  }

  // ここまで来たら、少なくとも1つは有効スロットがある
  setStatus("Supabaseへ送信中…", "info");

  // まず、その helper/date の既存スロットを全削除してから
  const { error: delError } = await supabase
    .from("helper_shift_requests")
    .delete()
    .eq("helper_name", helperName)
    .eq("date", date);

  if (delError) {
    console.error("delete error", delError);
    setStatus(`削除エラー: ${delError.message}`, "error");
    return;
  }

  // 新しいスロットをまとめて upsert
  const { error } = await supabase
    .from("helper_shift_requests")
    .upsert(payloads, {
      onConflict: "helper_name,date,start_minutes,end_minutes",
    });

  if (error) {
    console.error("Supabase error", error);
    setStatus(`エラー: ${error.message}`, "error");
  } else {
    setStatus("Supabase への送信が完了しました ✅", "ok");

    // ★ 送信に成功したら、この月のサマリも更新しておく
    loadMonthSummaryFromSupabase().catch((e) => console.error(e));
  }
}

async function loadOneDayFromSupabase() {
  const helperName = (
    document.getElementById("helperName") as HTMLInputElement
  ).value.trim();
  const date = (document.getElementById("date") as HTMLInputElement).value;
  const statusEl = document.getElementById("status") as HTMLParagraphElement;
  const slotsContainer = document.getElementById(
    "slotsContainer"
  ) as HTMLDivElement | null;

  if (!helperName) {
    alert("氏名を入力してください");
    return;
  }
  if (!date) {
    alert("日付を選択してください");
    return;
  }
  if (!slotsContainer) return;

  statusEl.textContent = "Supabase から入力済みデータを取得中…";

  const { data, error } = await supabase
    .from("helper_shift_requests")
    .select("*")
    .eq("helper_name", helperName)
    .eq("date", date)
    .order("start_minutes", { ascending: true });

  if (error) {
    console.error("load error", error);
    statusEl.textContent = `取得エラー: ${error.message}`;
    return;
  }

  // いったんスロットを全部クリア
  slotsContainer.innerHTML = "";

  if (!data || data.length === 0) {
    // レコードが無い → この日は休み
    slotsContainer.appendChild(createSlotRow());
    statusEl.textContent = "この日は入力済みの希望はありません（休み扱い）";
    return;
  }

  // レコードごとにスロット行を作成
  for (const row of data) {
    const slotRow = createSlotRow();

    const alldaySelect = slotRow.querySelector(
      ".allday"
    ) as HTMLSelectElement | null;
    const startInput = slotRow.querySelector(
      ".start"
    ) as HTMLInputElement | null;
    const endInput = slotRow.querySelector(".end") as HTMLInputElement | null;
    const noteInput = slotRow.querySelector(".note") as HTMLInputElement | null;

    if (row.pattern === "終日") {
      if (alldaySelect) alldaySelect.value = "終日";
      if (startInput) startInput.value = "";
      if (endInput) endInput.value = "";
    } else {
      // 終日でない場合は pattern と minutes から復元する

      if (alldaySelect) alldaySelect.value = ""; // 終日はオフ

      const startStr = minutesToTimeString(row.start_minutes);
      const endStr = minutesToTimeString(row.end_minutes);

      if (row.pattern.startsWith("-")) {
        // 例: "-12:00" → 終了だけ
        if (startInput) startInput.value = "";
        if (endInput) endInput.value = endStr;
      } else if (row.pattern.endsWith("-")) {
        // 例: "12:00-" → 開始だけ
        if (startInput) startInput.value = startStr;
        if (endInput) endInput.value = "";
      } else {
        // 例: "12:00-15:00" → 開始・終了両方
        if (startInput) startInput.value = startStr;
        if (endInput) endInput.value = endStr;
      }
    }
    if (noteInput) noteInput.value = row.note ?? "";

    slotsContainer.appendChild(slotRow);
  }

  statusEl.textContent = "Supabase から入力済みの希望を読み込みました ✅";
}

async function loadMonthSummaryFromSupabase() {
  const helperName = (
    document.getElementById("helperName") as HTMLInputElement
  ).value.trim();
  const dateInput = document.getElementById("date") as HTMLInputElement | null;
  const statusEl = document.getElementById("status") as HTMLParagraphElement;
  const summaryContainer = document.getElementById(
    "summaryCards"
  ) as HTMLDivElement | null;

  if (!helperName) {
    alert("氏名を入力してください");
    return;
  }
  if (!dateInput) return;

  const date = dateInput.value;
  if (!date) {
    alert("日付を選択してください（表示したい月のどの日でもOKです）");
    return;
  }
  if (!summaryContainer) return;

  // date ("2026-01-06") から年・月を取り出す
  const [y, m] = date.split("-").map((v) => parseInt(v, 10));
  if (!y || !m) {
    alert("日付の形式が不正です");
    return;
  }
  const firstDay = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDayNum = new Date(y, m, 0).getDate();
  const lastDay = `${y}-${String(m).padStart(2, "0")}-${String(
    lastDayNum
  ).padStart(2, "0")}`;

  statusEl.textContent = "この月の入力済みの希望を取得中…";

  const { data, error } = await supabase
    .from("helper_shift_requests")
    .select("*")
    .eq("helper_name", helperName)
    .gte("date", firstDay)
    .lte("date", lastDay)
    .order("date", { ascending: true })
    .order("start_minutes", { ascending: true });

  // いったんカードをクリア
  summaryContainer.innerHTML = "";

  if (error) {
    console.error("summary load error", error);
    statusEl.textContent = `取得エラー: ${error.message}`;
    return;
  }

  if (!data || data.length === 0) {
    statusEl.textContent = "この月には入力済みの希望がありません。";
    return;
  }

  // date ごとにまとめる
  const grouped = new Map<string, HelperShiftRequest[]>();
  for (const row of data as HelperShiftRequest[]) {
    const list = grouped.get(row.date) ?? [];
    list.push(row);
    grouped.set(row.date, list);
  }

  // 横スクロールのカードを生成
  for (const [dateStr, rows] of grouped) {
    const card = document.createElement("div");
    card.style.flex = "0 0 auto"; // 横に並ぶ
    card.style.minWidth = "160px";
    card.style.border = "1px solid #ccc";
    card.style.borderRadius = "12px";
    card.style.padding = "8px 12px";
    card.style.backgroundColor = "#fafafa";
    card.style.cursor = "pointer";

    const weekday = formatWeekday(dateStr);
    let html = `<div style="font-weight:bold; margin-bottom:4px;">${dateStr}（${weekday}）</div>`;

    for (const r of rows) {
      const label = buildSlotLabel(r);
      const note = r.note ? `　/ 備考: ${r.note}` : "";
      html += `<div style="font-size:0.9rem; margin-left:4px;">${label}${note}</div>`;
    }

    card.innerHTML = html;

    // ★ カードをクリックしたら、その日を編集フォームに読み込む
    card.addEventListener("click", () => {
      dateInput.value = dateStr;
      loadOneDayFromSupabase().catch((e) => console.error(e));
    });

    summaryContainer.appendChild(card);
  }

  statusEl.textContent = "この月の入力済みの希望を表示しました ✅";
}

document.addEventListener("DOMContentLoaded", () => {
  // ★ まずHTMLを用意（本番の白画面対策）
  ensureAppMarkup();

  const slotsContainer = document.getElementById(
    "slotsContainer"
  ) as HTMLDivElement | null;
  const addSlotBtn = document.getElementById(
    "addSlotBtn"
  ) as HTMLButtonElement | null;
  const submitBtn = document.getElementById(
    "submitBtn"
  ) as HTMLButtonElement | null;
  const helperNameInput = document.getElementById(
    "helperName"
  ) as HTMLInputElement | null;
  const dateInput = document.getElementById("date") as HTMLInputElement | null;
  const prevDayBtn = document.getElementById(
    "prevDayBtn"
  ) as HTMLButtonElement | null;
  const nextDayBtn = document.getElementById(
    "nextDayBtn"
  ) as HTMLButtonElement | null;
  const loadBtn = document.getElementById(
    "loadBtn"
  ) as HTMLButtonElement | null;
  const summaryBtn = document.getElementById(
    "loadMonthlySummaryBtn"
  ) as HTMLButtonElement | null;

  if (slotsContainer) {
    slotsContainer.appendChild(createSlotRow());
  }

  addSlotBtn?.addEventListener("click", () => {
    if (slotsContainer) {
      slotsContainer.appendChild(createSlotRow());
    }
  });

  // ★ 最初はボタンを無効にしておく
  if (submitBtn) {
    submitBtn.disabled = true;
  }

  // ★ 氏名と日付が変わるたびに有効/無効を更新
  helperNameInput?.addEventListener("input", updateSubmitButtonEnabled);
  dateInput?.addEventListener("input", updateSubmitButtonEnabled);

  submitBtn?.addEventListener("click", () => {
    submitOneDay().catch((e) => console.error(e));
  });

  // ▼ 前の日ボタン
  prevDayBtn?.addEventListener("click", () => {
    if (!dateInput) return;
    const current = dateInput.value;
    if (!current) return;

    const newDate = shiftDate(current, -1);
    dateInput.value = newDate;

    if (slotsContainer) {
      slotsContainer.innerHTML = "";
      slotsContainer.appendChild(createSlotRow());
    }

    updateSubmitButtonEnabled();
  });

  // ▼ 次の日ボタン
  nextDayBtn?.addEventListener("click", () => {
    if (!dateInput) return;
    const current = dateInput.value;
    if (!current) return;

    const newDate = shiftDate(current, 1);
    dateInput.value = newDate;

    if (slotsContainer) {
      slotsContainer.innerHTML = "";
      slotsContainer.appendChild(createSlotRow());
    }

    updateSubmitButtonEnabled();
  });

  // この日の入力済みを読み込む
  loadBtn?.addEventListener("click", () => {
    loadOneDayFromSupabase().catch((e) => console.error(e));
  });

  // この月の入力状況カード
  summaryBtn?.addEventListener("click", () => {
    loadMonthSummaryFromSupabase().catch((e) => console.error(e));
  });

  // ★ 初期状態のボタン有効/無効を決める
  updateSubmitButtonEnabled();
});
