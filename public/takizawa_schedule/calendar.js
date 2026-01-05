// ===== Supabase =====
const API_URL = "https://xwnbdlcukycihgfrfcox.supabase.co/rest/v1/schedule";
const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

// ===== 固定：滝澤さん専用 =====
const HELPER_NAME = "滝澤";

// ===== カレンダー年月（選択で上書き） =====
let currentYear  = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;

// ===== 初期化：月選択UI =====
let pickerYear = new Date().getFullYear();

function initApp() {
  // 初期は月選択のみ表示
  document.getElementById('month-picker').style.display = 'block';
  document.getElementById('calendar-area').style.display = 'none';

  buildMonthPicker(pickerYear);

  // 年移動＆今月
  document.getElementById('prev-year').onclick = () => { pickerYear -= 1; buildMonthPicker(pickerYear); };
  document.getElementById('next-year').onclick = () => { pickerYear += 1; buildMonthPicker(pickerYear); };
  document.getElementById('this-month').onclick = () => {
    const now = new Date();
    selectMonth(now.getFullYear(), now.getMonth()+1);
  };

  // 戻るボタン
  document.getElementById('back-to-picker').onclick = () => {
    document.getElementById('calendar-area').style.display = 'none';
    document.getElementById('month-picker').style.display = 'block';
  };

  // 直接リンク（?year=&month=）があれば即表示
  const p = new URLSearchParams(location.search);
  const y = parseInt(p.get('year'), 10);
  const m = parseInt(p.get('month'), 10);
  if (!Number.isNaN(y) && !Number.isNaN(m)) {
    selectMonth(y, m);
  }
}

function buildMonthPicker(year) {
  document.getElementById('picker-year').textContent = year;
  const grid = document.getElementById('month-grid');
  grid.innerHTML = '';

  const now = new Date();
  const nowY = now.getFullYear();
  const nowM = now.getMonth()+1;

  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement('button');
    btn.textContent = `${m}月`;
    btn.className = 'month-btn';
    if (year === nowY && m === nowM) btn.classList.add('is-current');
    btn.onclick = () => selectMonth(year, m);
    grid.appendChild(btn);
  }
}

function selectMonth(year, month) {
  currentYear  = year;
  currentMonth = month;

  // 表示切替
  document.getElementById('month-picker').style.display = 'none';
  document.getElementById('calendar-area').style.display = 'block';

  // URLに年月を反映（ブックマーク/再読込に便利）
  const url = new URL(location.href);
  url.searchParams.set('year', String(year));
  url.searchParams.set('month', String(month));
  history.replaceState(null, '', url.toString());

  renderCalendar();
}

// ===== 日付ユーティリティ =====
function monthRangeISO(year, month) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 1); // 翌月1日（lt 用）
  const toISO = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                        .toISOString().split("T")[0];
  return { start: toISO(start), end: toISO(end) };
}

// ===== Supabase 取得（最新・キャッシュ無効） =====
async function fetchSchedulesForMonth() {
  const { start, end } = monthRangeISO(currentYear, currentMonth);
  const url = `${API_URL}?select=*`
            + `&name=eq.${encodeURIComponent(HELPER_NAME)}`
            + `&date=gte.${start}&date=lt.${end}`
            + `&order=date.asc,start_time.asc`;
  try {
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
  } catch (e) {
    console.error('fetch error:', e);
    return [];
  }
}

// ===== 表示ユーティリティ =====
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
  data.forEach(item => { (map[item.date] ||= []).push(item); });
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

// ===== カレンダー描画 =====
async function renderCalendar() {
  const container = document.getElementById("calendar-body");
  container.innerHTML = "";

  const schedules = await fetchSchedulesForMonth(); // name=滝澤 で取得済み
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

    const dayRaw = byDate[dateStr] || [];
    const dayItems = groupByClientTimeTask(dayRaw);
    const hasItems = dayItems.length > 0;

    if (!hasItems) cell.classList.add("empty-day");

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

// 月送り
function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  else if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  renderCalendar();
}

// DOM 準備後スタート
document.addEventListener("DOMContentLoaded", initApp);