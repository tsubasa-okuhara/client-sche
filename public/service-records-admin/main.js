import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xwnbdlcukycihgfrfcox.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const ADMIN_REDIRECT_TO = "https://client-sche.web.app/service-records-admin/";

// DOM
const $email = document.getElementById("email");
const $sendLink = document.getElementById("sendLink");
const $checkSession = document.getElementById("checkSession");
const $logoutBtn = document.getElementById("logoutBtn");
const $authStatus = document.getElementById("authStatus");
const $panel = document.getElementById("panel");

const $groups = document.getElementById("groups");
const $meta = document.getElementById("meta");

const $fromDate = document.getElementById("fromDate");
const $toDate = document.getElementById("toDate");
const $applyRange = document.getElementById("applyRange");
const $clientFilter = document.getElementById("clientFilter");
const $applyClient = document.getElementById("applyClient");

const $reloadBtn = document.getElementById("reloadBtn");
const $printBtn = document.getElementById("printBtn");
const $printAllBtn =
  document.getElementById("printAllBtn") || document.getElementById("printBtn");
const $printArea = document.getElementById("printArea");

function setAuthStatus(msg) {
  if ($authStatus) $authStatus.textContent = msg || "";
}
function showPanel(show) {
  if ($panel) $panel.style.display = show ? "block" : "none";
}

async function loadMyHelperProfile() {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const user = userRes?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("helpers")
    .select("helper_name,is_admin,email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function sendMagicLink() {
  const email = ($email?.value || "").trim();
  if (!email) return setAuthStatus("メールアドレスを入力してください。");

  setAuthStatus("送信中…");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: ADMIN_REDIRECT_TO },
  });

  if (error) {
    console.error(error);
    setAuthStatus("送信エラー: " + error.message);
    return;
  }
  setAuthStatus(
    "送信しました。メールのリンクを同じ端末・同じブラウザで開いてください。"
  );
}

async function logout() {
  await supabase.auth.signOut();
  showPanel(false);
  if ($groups) $groups.innerHTML = "";
  if ($meta) $meta.textContent = "";
  setAuthStatus("ログアウトしました。");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}
function iso(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fmtTime(t) {
  return String(t || "").slice(0, 5);
}

function normalizeText_(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

// 車系ワードは「バス扱い」に寄せる（文言統一）
function normalizeTransportWords_(s) {
  return normalizeText_(s).replace(/(車|タクシー|カーシェア|送迎|🚗)/g, "バス");
}

// 遊具ワード → 「公園を散歩した」に統一
function normalizePlaygroundText_(s) {
  const t = normalizeText_(s);
  if (!t) return t;
  const hit = /(滑り台|すべり台|ブランコ|鉄棒|ジャングルジム|遊具|公園)/.test(
    t
  );
  if (!hit) return t;
  if (/公園.*散歩/.test(t)) return t;
  return "公園を散歩した";
}

function detectRouteCategory_(text) {
  const t = normalizeText_(text);
  if (!t) return "other";
  if (/(電車|JR|地下鉄|東急|線\b)/i.test(t)) return "train";
  if (/(バス|都バス|車|送迎|タクシー|カーシェア|🚗)/i.test(t)) return "bus";
  if (/(徒歩|歩|散歩)/i.test(t)) return "walk";
  return "other";
}

function buildDestinationText_(r) {
  const from = r.from_place || "";
  const to = r.to_place || "";
  if (from && to) return `${from}→${to}`;
  return r.route_note || r.task_note || (r.fields?.destination ?? "") || "";
}

function buildMainSupportText_(r) {
  const base = normalizeTransportWords_(r.summary || "");
  return normalizePlaygroundText_(base);
}

function buildRemarksText_(r) {
  const memo = normalizePlaygroundText_(
    normalizeTransportWords_(r.fields?.memo || "")
  );
  return memo ? `補足：${memo}` : "";
}

function renderPaperOne_(r, idx, total) {
  const helper = r.primary_helper_name || r.author_helper_name || "";
  const client = r.client_name || "";
  const date = r.task_date || "";
  const time = `${fmtTime(r.start_time)}〜${fmtTime(r.end_time)}`;
  const dest = buildDestinationText_(r);

  const routeSource = [
    r.route_note,
    r.task_note,
    r.summary,
    r.fields?.destination,
    r.fields?.memo,
  ]
    .filter(Boolean)
    .join(" / ");
  const routeCat = detectRouteCategory_(routeSource);

  const mainText = buildMainSupportText_(r);
  const remarks = buildRemarksText_(r);

  const wrap = document.createElement("div");
  // 2件/ページ運用: 半ページ固定 + 2件ごと改ページ
  wrap.className = "paper paper--half";
  if ((idx + 1) % 2 === 0 && idx !== total - 1) {
    wrap.classList.add("page-break-after");
  }

  wrap.innerHTML = `
    <div class="paper-title">サービス実施記録</div>
    <div class="paper-grid">
      <div class="cell label label-office">事業所名</div>
      <div class="cell value">（ビレッジ）</div>
      <div class="cell label label-confirm">利用者確認欄</div>
      <div class="cell value"></div>

      <div class="cell label label-helper">ヘルパー名</div>
      <div class="cell value">${escapeHtml_(helper)}</div>
      <div class="cell label label-client">利用者名</div>
      <div class="cell value">${escapeHtml_(client)}</div>

      <div class="cell label label-date">日付</div>
      <div class="cell value">${escapeHtml_(date)}</div>
      <div class="cell label label-time">時間</div>
      <div class="cell value">${escapeHtml_(time)}</div>

      <div class="cell label label-dest">行先</div>
      <div class="cell value">${escapeHtml_(dest)}</div>
      <div class="cell label label-main">主な援助内容</div>
      <div class="cell value big">${escapeHtml_(mainText)}</div>

      <div class="cell label label-remarks">備考</div>
      <div class="cell value remarks">${escapeHtml_(remarks)}</div>

      <div class="cell label label-route">経路</div>
      <div class="cell value" style="grid-column: span 3;">
        <div class="route-box">
          <span class="pill ${
            routeCat === "walk" ? "is-active" : ""
          }">徒歩</span>
          <span class="pill ${
            routeCat === "bus" ? "is-active" : ""
          }">バス</span>
          <span class="pill ${
            routeCat === "train" ? "is-active" : ""
          }">電車</span>
          <span class="pill ${
            routeCat === "other" ? "is-active" : ""
          }">その他</span>
        </div>
      </div>
    </div>
  `;

  // 最後は改ページ不要（page-break-after が付いていれば外す）
  if (idx === total - 1) wrap.classList.remove("page-break-after");
  return wrap;
}

function escapeHtml_(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderPrintArea_(records) {
  if (!$printArea) return;
  $printArea.innerHTML = "";
  const total = records.length;
  records.forEach((r, i) => {
    // “枠(高さ確保)” + “中身(縮小)” にするため wrapper を追加
    const wrap = document.createElement("div");
    wrap.className = "paperWrap";
    wrap.appendChild(renderPaperOne_(r, i, total));
    $printArea.appendChild(wrap);
  });
}

async function loadAdminRecords() {
  if (!$groups) return;

  const from = ($fromDate?.value || "").trim();
  const to = ($toDate?.value || "").trim();
  const clientKey = ($clientFilter?.value || "").trim();

  let q = supabase
    .from("v_service_records_move_admin")
    .select(
      "note_id, task_id, task_date, start_time, end_time, client_name, helper_names, primary_helper_name, summary, author_helper_name, route_note, task_note, from_place, to_place, fields"
    )
    .order("client_name", { ascending: true })
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (from) q = q.gte("task_date", from);
  if (to) q = q.lte("task_date", to);
  if (clientKey) q = q.ilike("client_name", `%${clientKey}%`);

  const { data, error } = await q.limit(5000);
  if (error) {
    console.error(error);
    if ($meta) $meta.textContent = "取得エラー: " + error.message;
    $groups.innerHTML = "";
    return;
  }

  const rows = data || [];
  if ($meta) $meta.textContent = `取得 ${rows.length} 件`;

  const byClient = new Map();
  for (const r of rows) {
    const c = r.client_name || "（不明）";
    const d = r.task_date || "（日付不明）";
    if (!byClient.has(c)) byClient.set(c, new Map());
    const byDate = byClient.get(c);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(r);
  }

  $groups.innerHTML = "";

  for (const [clientName, byDate] of byClient.entries()) {
    const clientWrap = document.createElement("div");
    clientWrap.className = "clientGroup";

    const dates = Array.from(byDate.keys()).sort();
    const total = dates.reduce((sum, d) => sum + byDate.get(d).length, 0);

    clientWrap.innerHTML = `
      <div class="clientHeader">
        <div class="clientName">${escapeHtml(clientName)}</div>
        <div class="clientMeta">${dates.length}日 / ${total}件</div>
      </div>
    `;

    for (const dateStr of dates) {
      const day = document.createElement("div");
      day.className = "dayBlock";
      day.innerHTML = `<div class="dayTitle">${escapeHtml(dateStr)}</div>`;

      const list = byDate
        .get(dateStr)
        .slice()
        .sort((a, b) =>
          String(a.start_time || "").localeCompare(String(b.start_time || ""))
        );

      for (const r of list) {
        const row = document.createElement("div");
        row.className = "noteRow";

        const lineLeft = `${fmtTime(r.start_time)}〜${fmtTime(r.end_time)}`;
        const lineRight = `記入: ${r.author_helper_name || "—"}`;

        row.innerHTML = `
          <div class="noteTop">
            <div>${escapeHtml(lineLeft)} <span class="badge">${escapeHtml(
          r.primary_helper_name || ""
        )}</span></div>
            <div>${escapeHtml(lineRight)}</div>
          </div>
          <div class="noteSub">${escapeHtml(r.summary || "")}</div>
        `;
        day.appendChild(row);
      }

      clientWrap.appendChild(day);
    }

    $groups.appendChild(clientWrap);
  }

  // 印刷用の帳票DOMも更新（rows がスコープ内のここで呼ぶ）
  renderPrintArea_(rows);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function checkSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data?.session;
    if (!session) {
      showPanel(false);
      setAuthStatus("未ログイン");
      return;
    }

    const profile = await loadMyHelperProfile();
    if (!profile) {
      showPanel(false);
      setAuthStatus("helpers未登録（管理者登録が必要）");
      return;
    }
    if (!profile.is_admin) {
      showPanel(false);
      setAuthStatus(`権限なし（adminのみ）: ${profile.helper_name || ""}`);
      return;
    }

    setAuthStatus(`ログインOK（管理者）: ${profile.helper_name || ""}`);
    showPanel(true);

    if ($fromDate && !$fromDate.value) {
      const d = new Date();
      $fromDate.value = iso(d);
    }
    if ($toDate && !$toDate.value) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      $toDate.value = iso(d);
    }

    await loadAdminRecords();
  } catch (e) {
    console.error(e);
    showPanel(false);
    setAuthStatus("エラー: " + String(e?.message || e));
  }
}

// events
$sendLink?.addEventListener("click", () =>
  sendMagicLink().catch(console.error)
);
$checkSession?.addEventListener("click", () =>
  checkSession().catch(console.error)
);
$logoutBtn?.addEventListener("click", () => logout().catch(console.error));
$reloadBtn?.addEventListener("click", () =>
  checkSession().catch(console.error)
);
$applyRange?.addEventListener("click", () =>
  loadAdminRecords().catch(console.error)
);
$applyClient?.addEventListener("click", () =>
  loadAdminRecords().catch(console.error)
);
$printBtn?.addEventListener("click", async () => {
  await loadAdminRecords().catch(console.error); // 最新化
  if (!$printArea || !$printArea.querySelector(".paper")) {
    alert("印刷対象がありません（先に絞り込み→表示してください）");
    return;
  }
  window.print();
});

// boot
checkSession().catch(console.error);

// ===== build marker (反映確認用) =====
(function showBuildMarker() {
  try {
    const id = getComputedStyle(document.documentElement)
      .getPropertyValue("--build-id")
      .replace(/["']/g, "")
      .trim();
    const el = document.createElement("div");
    el.id = "buildMarker";
    el.textContent = `build: ${id || "unknown"}`;
    document.body.appendChild(el);
  } catch (e) {}
})();

// ===== 画面で印刷レイアウトを疑似表示（確認用トグル） =====
// URL末尾に ?printPreview=1 を付けると、画面でも 2up の配置が見える
if (new URLSearchParams(location.search).get("printPreview") === "1") {
  document.body.classList.add("is-print-preview");
}
