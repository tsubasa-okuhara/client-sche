// ===== Supabase =====
const API_URL = "https://xwnbdlcukycihgfrfcox.supabase.co/rest/v1/schedule";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

// ===== 固定：滝澤さん専用 =====
const HELPER_NAME = "滝澤";

// ===== カレンダー年月 =====
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// 月初/翌月初（※絞り込み用）
function monthRangeISO(year, month) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1); // 翌月1日（lt 用）
  const toISO = d =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .split("T")[0];
  return { start: toISO(start), end: toISO(end) };
}

// 滝澤さん＆今表示中の月だけ取得（通信量最小化）
// ✅ 毎回最新：キャッシュを使わず取得
// ✅ 毎回最新：URLに余計なクエリは付けない（PostgRESTは未知キーNG）
async function fetchSchedulesForMonth() {
  const { start, end } = monthRangeISO(currentYear, currentMonth);

  const url = `${API_URL}?select=*`
            + `&name=eq.${encodeURIComponent(HELPER_NAME)}`
            + `&date=gte.${start}&date=lt.${end}`
            + `&order=date.asc,start_time.asc`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      apikey: API_KEY,
      Authorization: `Bearer ${API_KEY}`,
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache'
    },
    cache: 'no-store'
  });

  if (!res.ok) {
    console.error('Supabase fetch failed:', res.status, await res.text());
    return [];
  }
  return res.json();
}

function getDateLabel(dateObj) {
  const m = dateObj.getMonth() + 1;
  const d = dateObj.getDate();
  const w = dateObj.getDay();
  const label = `${m}月${d}日（${"日月火水木金土"[w]}）`;
  const color = w === 0 ? "red" : w === 6 ? "blue" : "";
  return { label, color };
}

function formatTime(t) {
  if (!t) return "";
  if (typeof t === "string" && /^\d{1,2}:\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function groupByDate(data) {
  const map = {};
  data.forEach(item => {
    (map[item.date] ||= []).push(item);
  });
  return map;
}

// 同時刻・同内容を1カードに集約
function groupByClientTimeTask(data) {
  const map = {};
  data.forEach(item => {
    const key = `${item.client}_${item.start_time}_${item.task || ""}`;
    if (!map[key]) {
      map[key] = {
        client: item.client,
        start: item.start_time,
        end: item.end_time || "",
        task: item.task || "",
        names: []
      };
    }
    map[key].names.push(item.name);
  });
  return Object.values(map);
}

async function renderCalendar() {
  const container = document.getElementById("calendar-body");
  container.innerHTML = "";

  const schedules = await fetchSchedulesForMonth();        // ← すでに name=滝澤 で取得
  const byDate = groupByDate(schedules);

  document.getElementById("month-label").textContent = `${currentYear}年${currentMonth}月`;

  const firstDay = new Date(currentYear, currentMonth - 1, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  let row = document.createElement("tr");
  for (let i = 0; i < startDow; i++) row.appendChild(document.createElement("td"));

  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(currentYear, currentMonth - 1, day);
    const dateStr = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000)
      .toISOString().split("T")[0];
    const { label, color } = getDateLabel(dateObj);
    const wday = dateObj.getDay();

    const cell = document.createElement("td");
    cell.className = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][wday];

    const dayBox = document.createElement("div");
    dayBox.className = "day-box";

    const labelBox = document.createElement("div");
    labelBox.className = "day-label";
    labelBox.textContent = label;
    if (color) labelBox.style.color = color;
    dayBox.appendChild(labelBox);

    // —— その日の滝澤さんデータだけで“予定あり/なし”を判定 ——
    const dayRaw = byDate[dateStr] || [];
    const dayItems = groupByClientTimeTask(dayRaw);
    const hasItems = dayItems.length > 0;

    // 🔹予定ゼロなら empty-day クラスを付ける
    if (!hasItems) cell.classList.add("empty-day");

    // 予定の描画
    if (hasItems) {
      dayItems.forEach(group => {
        const entry = document.createElement("div");
        entry.className = "schedule-entry";
        entry.innerHTML = `
          <div><strong>👤 利用者:</strong> ${group.client || ""}</div>
          <div><strong>🕒 時間:</strong> ${formatTime(group.start)}〜${formatTime(group.end)}</div>
          <div><strong>📝 内容:</strong> ${group.task || ""}</div>
        `;
        dayBox.appendChild(entry);
      });
    }

    cell.appendChild(dayBox);
    row.appendChild(cell);

    if (wday === 6 || day === daysInMonth) {
      container.appendChild(row);
      row = document.createElement("tr");
    }
  }
}

document.addEventListener("DOMContentLoaded", renderCalendar);

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  else if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderCalendar();
}