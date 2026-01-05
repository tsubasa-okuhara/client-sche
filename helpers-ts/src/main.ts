import "./style.css";
import { client } from "./supabaseClient";

type MergedRow = {
  date?: string;
  client?: string;
  start_time?: string;
  end_time?: string;
  task?: string;
  sheet_name?: string | null;
  helpers?: string[];
  helper_count?: number;
  [k: string]: any;
};

declare global {
  interface Window {
    __allMerged?: MergedRow[];
  }
}

// ===== ここから設定値（必要に応じて変える） =====
const TARGET_YEAR = 2025;
const TARGET_MONTH = 12; // 1〜12 月

let currentYear: number = TARGET_YEAR;
let currentMonth: number = TARGET_MONTH;
let currentHelperFilter: string | null = null;
let currentViewMode: "month" | "week" | "day" = "month";
let currentFocusedDate: string | null = null; // "YYYY-MM-DD"

function setStatus(message: string) {
  console.log("[STATUS]", message);
  const el = document.getElementById("status");
  if (el) el.textContent = message;
}

function getDebugArea(): HTMLElement {
  let pre = document.getElementById("debug-schedules");
  if (!pre) {
    pre = document.createElement("pre");
    pre.id = "debug-schedules";
    pre.style.marginTop = "16px";
    pre.style.fontSize = "12px";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.backgroundColor = "#f0f0f0";
    pre.style.borderTop = "2px solid #ccc";
    pre.style.padding = "12px";
    document.body.appendChild(pre);
  }
  return pre as HTMLElement;
}

function groupByDateMerged(rows: MergedRow[]) {
  return rows.reduce((map: Record<string, MergedRow[]>, row) => {
    const key = row.date ?? "unknown";
    if (!map[key]) map[key] = [];
    map[key].push(row);
    return map;
  }, {} as Record<string, MergedRow[]>);
}

function normalizeMergedFromView(row: any): MergedRow {
  return {
    date: row.date,
    client: row.client,
    start_time: row.start_time,
    end_time: row.end_time,
    task: row.task,
    sheet_name: null,
    helpers: row.helpers
      ? String(row.helpers)
          .split("・")
          .map((h) => h.trim())
          .filter((h) => h.length > 0)
      : [],
  };
}

function isDateInCurrentView(
  _dateStr: string,
  _year: number,
  _month: number,
  _weekIndex: number | null
) {
  return true;
}

function getFocusedWeekIndex(year: number, month: number) {
  if (!currentFocusedDate) return null;
  const parts = currentFocusedDate.split("-");
  if (parts.length !== 3) return null;
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (y !== year || m !== month) return null;
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay();
  const weekIndex = Math.floor((firstDay + (d - 1)) / 7);
  return weekIndex;
}

function renderCalendar(
  year: number,
  month: number,
  grouped: Record<string, MergedRow[]>
) {
  const tbody = document.getElementById("calendar-body");
  if (!tbody) return;
  const monthLabel = document.getElementById("month-label");
  if (monthLabel) monthLabel.textContent = `${year}年${month}月`;
  tbody.innerHTML = "";
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const focusedWeekIndex =
    currentViewMode === "week" ? getFocusedWeekIndex(year, month) : null;
  let day = 1;
  for (let week = 0; week < 6; week++) {
    const tr = document.createElement("tr");
    for (let dow = 0; dow < 7; dow++) {
      const td = document.createElement("td");
      td.className = "calendar-cell";
      if ((week === 0 && dow < firstDay) || day > daysInMonth) {
        td.innerHTML = "";
        tr.appendChild(td);
        continue;
      }
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(
        day
      ).padStart(2, "0")}`;
      const inView = isDateInCurrentView(dateStr, year, month, week);
      if (!inView) {
        td.style.display = "none";
        tr.appendChild(td);
        day++;
        continue;
      }
      const isFocusedWeek =
        currentViewMode === "week" &&
        focusedWeekIndex !== null &&
        week === focusedWeekIndex;
      const isDimWeek =
        currentViewMode === "week" &&
        focusedWeekIndex !== null &&
        week !== focusedWeekIndex;
      const isFocusedDay =
        currentViewMode === "day" && currentFocusedDate === dateStr;
      const header = document.createElement("div");
      header.textContent = String(day);
      header.className = "day-number";
      td.appendChild(header);
      const list = document.createElement("div");
      list.className = "schedule-list";
      const items = grouped[dateStr] || [];
      const sortedItems = items.slice().sort((a, b) => {
        const aTime = a.start_time || "99:99";
        const bTime = b.start_time || "99:99";
        return aTime.localeCompare(bTime);
      });
      for (const row of sortedItems) {
        const itemDiv = document.createElement("div");
        itemDiv.className = "schedule-item";
        const helpersLabel = (row.helpers || []).join("・");
        const isJoint = (row.helpers || []).length > 1;
        const helpersText = isJoint ? `${helpersLabel}（合同）` : helpersLabel;
        const helpersClass = isJoint
          ? "helpers-name joint"
          : "helpers-name single";
        const clientName = row.client ?? "";
        const start = row.start_time ?? "";
        const end = row.end_time ?? "";
        const task = row.task ?? "";
        itemDiv.innerHTML =
          `<div class=\"helpers-line\"><span class=\"${helpersClass}\">` +
          `${helpersText}</span></div>` +
          `<div><strong>${clientName}</strong></div>` +
          `<div>${start}〜${end}　${task}</div>`;
        list.appendChild(itemDiv);
      }
      td.appendChild(list);
      td.onclick = () => {
        currentFocusedDate = dateStr;
        if (currentViewMode === "day") {
          openDayPopup(dateStr, sortedItems);
        } else if (currentViewMode === "week") {
          loadSchedulesForMonth(currentYear, currentMonth);
        }
      };
      if (isFocusedWeek) td.classList.add("week-focus");
      else if (isDimWeek) td.classList.add("week-dim");
      if (isFocusedDay) td.classList.add("day-focus");
      day++;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    if (day > daysInMonth) break;
  }
}

function getWeeklyRangesForMonth(year: number, month: number) {
  const firstDate = new Date(year, month - 1, 1);
  const firstDay = firstDate.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const weeks: { from: string; to: string }[] = [];
  let start = 1 - firstDay; // may be <=0
  while (start <= daysInMonth) {
    const fromDate = new Date(year, month - 1, Math.max(1, start));
    const toDate = new Date(year, month - 1, Math.min(daysInMonth, start + 6));
    const from = `${fromDate.getFullYear()}-${String(
      fromDate.getMonth() + 1
    ).padStart(2, "0")}-${String(fromDate.getDate()).padStart(2, "0")}`;
    const to = `${toDate.getFullYear()}-${String(
      toDate.getMonth() + 1
    ).padStart(2, "0")}-${String(toDate.getDate()).padStart(2, "0")}`;
    weeks.push({ from, to });
    start += 7;
  }
  return weeks;
}

// ヘルパー名＋日付（例: "奥原21"）を分解
function parseHelperAndDay(q: string): { helper: string; day: number } | null {
  const s = String(q || "").trim();
  const m = s.match(/^(.+?)[\s　]*([1-9]|[12][0-9]|3[01])$/);
  if (!m) return null;
  const helper = m[1].trim();
  const day = parseInt(m[2], 10);
  if (!helper || Number.isNaN(day)) return null;
  return { helper, day };
}

// start_time を "分" に変換（null/空は末尾に）
function timeToMinutes(t: string | null | undefined): number {
  if (!t) return Number.POSITIVE_INFINITY; // null/空は末尾
  const m = t.trim().match(/^(\d{1,2}):(\d{2})/); // "08:30" or "08:30〜" の先頭を許容
  if (!m) return Number.POSITIVE_INFINITY;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  return hh * 60 + mm;
}

// quick popup を表示する（既に取得済みの window.__allMerged を利用）
function showSchedulePopup(helper: string, day: number) {
  const label = document.getElementById("month-label")?.textContent || "";
  const m = label.match(/(\d{4})年\s*(\d{1,2})月/);
  const year = m ? Number(m[1]) : currentYear;
  const month = m ? Number(m[2]) : currentMonth;
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  const dateStr = `${year}-${mm}-${dd}`;

  const source: MergedRow[] = Array.isArray(window.__allMerged)
    ? window.__allMerged
    : [];

  function normalizeForMatch(s: any) {
    return String(s || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  const needle = normalizeForMatch(helper);

  const items = source.filter((r) => {
    if (!r.date) return false;
    if (r.date !== dateStr) return false;
    const helpers = Array.isArray(r.helpers) ? r.helpers : [];
    return helpers.some((h) => normalizeForMatch(h).includes(needle));
  });

  // 開始時間でソート（早い順、null は末尾）
  items.sort((a, b) => {
    const aMin = timeToMinutes(a.start_time);
    const bMin = timeToMinutes(b.start_time);
    return aMin - bMin;
  });

  // dialog 要素を用意
  let dialog = document.getElementById(
    "quickPopup"
  ) as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "quickPopup";
    dialog.className = "quick-popup";
    document.body.appendChild(dialog);
  }

  dialog.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = `${dateStr} の予定（${helper}）`;
  dialog.appendChild(title);

  if (!items || items.length === 0) {
    const p = document.createElement("p");
    p.textContent = "この日の予定はありません。";
    dialog.appendChild(p);
  } else {
    for (const row of items) {
      const div = document.createElement("div");
      div.className = "popup-item";
      const helpersLabel = (row.helpers || []).join("・");
      const clientName = row.client ?? "";
      const start = row.start_time ?? "";
      const end = row.end_time ?? "";
      const task = row.task ?? "";
      div.innerHTML =
        `<div><strong>${helpersLabel}</strong></div>` +
        `<div>${clientName}</div>` +
        `<div>${start}〜${end}　${task}</div>`;
      dialog.appendChild(div);
    }
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", () => dialog && dialog.close());
  dialog.appendChild(closeBtn);

  // show
  try {
    dialog.showModal();
  } catch (e) {
    // ブラウザが dialog をサポートしていない場合は代替の alert
    alert(
      items && items.length
        ? `${items.length} 件表示`
        : "この日の予定はありません。"
    );
  }
}

function getDateRangeForView(year: number, month: number) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    daysInMonth
  ).padStart(2, "0")}`;
  if (!currentFocusedDate || currentViewMode === "month")
    return { from: monthStart, to: monthEnd };
  if (currentViewMode === "day")
    return { from: currentFocusedDate, to: currentFocusedDate };
  if (currentViewMode === "week") {
    const [y, m, d] = currentFocusedDate.split("-").map(Number);
    const focused = new Date(y, m - 1, d);
    const dayOfWeek = focused.getDay();
    const weekStartDate = new Date(focused);
    weekStartDate.setDate(focused.getDate() - dayOfWeek);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekStartDate.getDate() + 6);
    const from = `${weekStartDate.getFullYear()}-${String(
      weekStartDate.getMonth() + 1
    ).padStart(2, "0")}-${String(weekStartDate.getDate()).padStart(2, "0")}`;
    const to = `${weekEndDate.getFullYear()}-${String(
      weekEndDate.getMonth() + 1
    ).padStart(2, "0")}-${String(weekEndDate.getDate()).padStart(2, "0")}`;
    return { from, to };
  }
  return { from: monthStart, to: monthEnd };
}

async function loadSchedulesForMonth(year: number, month: number) {
  try {
    setStatus(`Supabase から ${year}年${month}月 の予定を取得中…`);
    let ranges: { from: string; to: string }[];
    if (currentViewMode === "week") {
      ranges = [getDateRangeForView(year, month)];
    } else {
      ranges = getWeeklyRangesForMonth(year, month);
    }
    const allRows: any[] = [];
    for (const range of ranges) {
      const from = range.from;
      const to = range.to;
      let query = client
        .from("v_schedule_merged")
        .select(
          "date, client, start_time, end_time, task, helpers, helper_count"
        )
        .gte("date", from)
        .lte("date", to);
      if (currentHelperFilter && currentHelperFilter.trim() !== "") {
        const key = currentHelperFilter.trim();
        query = query.ilike("helpers", `%${key}%`);
      }
      const { data, error } = await query
        .order("date", { ascending: true })
        .limit(5000);
      console.log(
        "range fetch:",
        from,
        "〜",
        to,
        "rows:",
        data ? data.length : 0
      );
      if (error) {
        console.error("loadSchedulesForMonth error:", error);
        setStatus(
          `Supabase 接続エラー: ${from}〜${to} の取得でエラー → ${String(
            error.message || error
          )}`
        );
        return;
      }
      if (data && data.length > 0) allRows.push(...data);
    }
    if (allRows.length === 0) {
      setStatus(`${year}年${month}月 のデータが 0 件でした。`);
      const emptyGrouped = {} as Record<string, MergedRow[]>;
      renderCalendar(year, month, emptyGrouped);
      return;
    }
    console.log("fetched total rows:", allRows.length);
    const merged = allRows.map(normalizeMergedFromView);
    window.__allMerged = merged;
    const grouped = groupByDateMerged(merged as MergedRow[]);
    renderCalendar(year, month, grouped);
    setStatus(`取得完了: ${merged.length} 件`);
  } catch (err) {
    console.error(err);
    setStatus("不明なエラーが発生しました");
  }
}

// 検索入力を処理：奥原21 形式ならポップアップ、そうでなければ通常の絞り込み
function handleSearchInput(helperFilterEl: HTMLInputElement | null) {
  const q = helperFilterEl ? helperFilterEl.value || "" : "";
  const parsed = parseHelperAndDay(q);
  if (parsed) {
    // 既に取得済みの配列を使う（追加 fetch は行わない）
    if (!Array.isArray(window.__allMerged) || window.__allMerged.length === 0) {
      // データ未取得時は簡易メッセージ
      let dialog = document.getElementById(
        "quickPopup"
      ) as HTMLDialogElement | null;
      if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.id = "quickPopup";
        document.body.appendChild(dialog);
      }
      dialog.innerHTML = `<p>データがまだ読み込まれていません。まず月表示でデータを取得してください。</p><button type=button id=qpClose>閉じる</button>`;
      const btn = document.getElementById("qpClose");
      btn?.addEventListener("click", () => dialog && dialog.close());
      try {
        dialog.showModal();
      } catch (e) {
        alert(
          "データがまだ読み込まれていません。まず月表示でデータを取得してください。"
        );
      }
      return;
    }

    showSchedulePopup(parsed.helper, parsed.day);
    // 検索ボックスはクリアして通常の絞り込みと二重実行しない
    if (helperFilterEl) helperFilterEl.value = "";
    return;
  }

  // 通常の絞り込み動作（既存の挙動を維持）
  currentHelperFilter = q || null;
  loadSchedulesForMonth(currentYear, currentMonth);
}

function openDayPopup(_dateStr: string, _sortedItems: MergedRow[]) {
  // ポップアップ実装は後で
  console.log("openDayPopup", _dateStr, _sortedItems.length);
}

// 初期化
function init() {
  const prevMonthBtn = document.getElementById("prev-month-btn");
  const nextMonthBtn = document.getElementById("next-month-btn");
  const viewMonth = document.getElementById("view-month");
  const viewWeek = document.getElementById("view-week");
  const viewDay = document.getElementById("view-day");
  const helperFilter = document.getElementById(
    "helper-filter"
  ) as HTMLInputElement | null;
  const applyFilterBtn = document.getElementById("apply-helper-filter");
  if (prevMonthBtn)
    prevMonthBtn.addEventListener("click", () => {
      currentMonth -= 1;
      if (currentMonth < 1) {
        currentMonth = 12;
        currentYear -= 1;
      }
      loadSchedulesForMonth(currentYear, currentMonth);
    });
  if (nextMonthBtn)
    nextMonthBtn.addEventListener("click", () => {
      currentMonth += 1;
      if (currentMonth > 12) {
        currentMonth = 1;
        currentYear += 1;
      }
      loadSchedulesForMonth(currentYear, currentMonth);
    });
  if (viewMonth)
    viewMonth.addEventListener("click", () => {
      currentViewMode = "month";
      loadSchedulesForMonth(currentYear, currentMonth);
    });
  if (viewWeek)
    viewWeek.addEventListener("click", () => {
      currentViewMode = "week";
      loadSchedulesForMonth(currentYear, currentMonth);
    });
  if (viewDay)
    viewDay.addEventListener("click", () => {
      currentViewMode = "day";
      loadSchedulesForMonth(currentYear, currentMonth);
    });
  if (applyFilterBtn && helperFilter) {
    applyFilterBtn.addEventListener("click", () =>
      handleSearchInput(helperFilter)
    );
    helperFilter.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearchInput(helperFilter);
      }
    });
  }
  loadSchedulesForMonth(currentYear, currentMonth);
  const debugEl = getDebugArea();
  debugEl.dataset.ready = "1";
}

document.addEventListener("DOMContentLoaded", init);
