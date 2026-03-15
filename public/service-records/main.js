import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xwnbdlcukycihgfrfcox.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM（index.html の id に合わせる）
const $movesMessage = document.getElementById("movesMessage");
const $movesList = document.getElementById("movesList");
const $formCard = document.getElementById("formCard");
const $formSelectedLabel = document.getElementById("formSelectedLabel");
const $dispClientName = document.getElementById("dispClientName");
const $dispTime = document.getElementById("dispTime");
const $dispHelperName = document.getElementById("dispHelperName");
const $dispRoute = document.getElementById("dispRoute");
const $dispNote = document.getElementById("dispNote");
const $dispBeneficiary = document.getElementById("dispBeneficiary");
const $formMemo = document.getElementById("formMemo");

/** 選択中の予定（schedule_tasks_move の1件）。後で保存処理で selectedTask.id を利用する。 */
let selectedTask = null;

// ----- URL パラメータ -----
function getHelperEmailFromUrl() {
  const params = new URLSearchParams(location.search);
  return (params.get("helper_email") || "").trim();
}

// ----- 未記入予定取得（schedule_tasks_move） -----
/**
 * helper_email と status='unwritten' で未記入予定を取得する。
 * @param {string} helperEmail
 * @returns {Promise<{ data: Array|null, error: Error|null }>}
 */
async function fetchUnwrittenMoves(helperEmail) {
  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select("id, task_date, start_time, end_time, client_name, helper_name, helper_email, route_note, to_place, note, beneficiary_number")
    .eq("helper_email", helperEmail)
    .eq("status", "unwritten")
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true });

  return { data: data || [], error };
}

function fmtTime(t) {
  return (t || "").slice(0, 5);
}

function formatTimeRange(m) {
  const st = fmtTime(m.start_time);
  const et = fmtTime(m.end_time);
  return st && et ? `${st}〜${et}` : st || et || "—";
}

/** 内容（note）を短く整形（長い場合は省略） */
function formatNote(note, maxLen = 80) {
  const s = String(note || "").trim().replace(/\s+/g, " ");
  if (!s) return "—";
  return s.length <= maxLen ? s : s.slice(0, maxLen) + "…";
}

// ----- 一覧描画 -----
function setMovesMessage(text) {
  if ($movesMessage) $movesMessage.textContent = text;
}

/** 取得失敗時用：一覧エリアにエラー表示（0件と混同しない） */
function renderMovesListError() {
  if (!$movesList) return;
  $movesList.innerHTML = '<p class="movesEmpty movesError">取得に失敗したため一覧を表示できません</p>';
}

function renderMovesList(items) {
  if (!$movesList) return;
  $movesList.innerHTML = "";

  if (!items || items.length === 0) {
    $movesList.innerHTML = '<p class="movesEmpty">未記入予定はありません</p>';
    return;
  }

  items.forEach((m) => {
    const card = document.createElement("div");
    card.className = "moveCard";
    card.dataset.id = m.id;

    const clientName = m.client_name || "—";
    const timeStr = formatTimeRange(m);
    const routeStr = (m.route_note || m.to_place || "").trim() || "—";
    const noteStr = formatNote(m.note);
    const beneficiaryStr = (m.beneficiary_number || "").toString().trim() || "—";

    card.innerHTML = `
      <div class="moveCardMain">
        <div class="moveCardRow moveCardClient">${escapeHtml(clientName)}</div>
        <div class="moveCardRow moveCardTime">${escapeHtml(timeStr)}</div>
        <div class="moveCardRow moveCardRoute"><span class="moveCardLabel">配車</span> ${escapeHtml(routeStr)}</div>
        <div class="moveCardRow moveCardNote"><span class="moveCardLabel">内容</span> ${escapeHtml(noteStr)}</div>
        <div class="moveCardRow moveCardBeneficiary"><span class="moveCardLabel">受給者番号</span> ${escapeHtml(beneficiaryStr)}</div>
      </div>
      <button type="button" class="btnRecord">記録する</button>
    `;

    const btn = card.querySelector(".btnRecord");
    const onSelect = () => {
      selectedTask = m;
      document.querySelectorAll(".moveCard.isSelected").forEach((el) => el.classList.remove("isSelected"));
      card.classList.add("isSelected");
      showFormFor(m);
    };

    if (btn) btn.addEventListener("click", (e) => { e.stopPropagation(); onSelect(); });
    card.addEventListener("click", () => onSelect());

    $movesList.appendChild(card);
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ----- フォーム表示・固定項目セット -----
function showFormFor(move) {
  if (!$formCard) return;
  selectedTask = move;

  if ($dispClientName) $dispClientName.textContent = move.client_name || "—";
  if ($dispTime) $dispTime.textContent = `${move.task_date || ""} ${formatTimeRange(move)}`.trim() || "—";
  if ($dispHelperName) $dispHelperName.textContent = move.helper_name || move.helper_email || "—";
  if ($dispRoute) $dispRoute.textContent = (move.route_note || move.to_place || "").trim() || "—";
  if ($dispNote) $dispNote.textContent = formatNote(move.note, 200);
  if ($dispBeneficiary) $dispBeneficiary.textContent = (move.beneficiary_number || "").toString().trim() || "—";

  if ($formSelectedLabel) $formSelectedLabel.textContent = `選択中: ${move.client_name || ""} ${formatTimeRange(move)}`;

  // 入力欄はクリア（必要なら前回値を保持する拡張も可）
  clearFormInputs();
  $formCard.style.display = "block";

  // フォームまでスクロール（スマホで見やすいように）
  $formCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function clearFormInputs() {
  document.querySelectorAll("#formCard input[type=radio]").forEach((el) => { el.checked = false; });
  if ($formMemo) $formMemo.value = "";
}

// ----- フォーム値をまとめて取得（後で保存処理を足しやすい形） -----
/**
 * 入力フォームの値を1オブジェクトで返す。保存API用にそのまま渡しやすい形。
 * @returns {{ taskId: string|null, condition: string|null, toilet: string|null, weather: string|null, meal: string|null, water: string|null, medication: string|null, interaction: string|null, memo: string }}
 */
function getFormValues() {
  const getRadio = (name) => {
    const el = document.querySelector(`#formCard input[name="${name}"]:checked`);
    return el ? el.value : null;
  };
  return {
    taskId: selectedTask ? selectedTask.id : null,
    condition: getRadio("condition"),
    toilet: getRadio("toilet"),
    weather: getRadio("weather"),
    meal: getRadio("meal"),
    water: getRadio("water"),
    medication: getRadio("medication"),
    interaction: getRadio("interaction"),
    memo: ($formMemo && $formMemo.value) ? $formMemo.value.trim() : "",
  };
}

// ----- 初期化 -----
async function init() {
  const helperEmail = getHelperEmailFromUrl();

  if (!helperEmail) {
    setMovesMessage("helper_email が指定されていません。URLに ?helper_email=xxx を付けて開いてください。");
    renderMovesList([]);
    return;
  }

  setMovesMessage("読み込み中…");
  const { data, error } = await fetchUnwrittenMoves(helperEmail);

  if (error) {
    setMovesMessage("取得できませんでした");
    renderMovesListError();
    console.error("[service-records] fetchUnwrittenMoves", error);
    return;
  }

  const list = data || [];
  setMovesMessage(`未記入 ${list.length} 件`);
  renderMovesList(list);
}

init().catch((e) => {
  setMovesMessage("取得できませんでした");
  renderMovesListError();
  console.error(e);
});

// 後で保存処理を足すときに getFormValues() と selectedTask / selectedTask.id を利用する
export { getFormValues, selectedTask };
