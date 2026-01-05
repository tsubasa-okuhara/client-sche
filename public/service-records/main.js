import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// あなたのSupabase
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

// iPhone 404 切り分け用デバッグ表示
function debugShowUrls() {
  const fnUrl = `${SUPABASE_URL}/functions/v1/parse-service-note-step`;
  const restUrl = `${SUPABASE_URL}/rest/v1/schedule_tasks_move?select=id&limit=1`;

  console.log("[debug] SUPABASE_URL =", SUPABASE_URL);
  console.log("[debug] fnUrl       =", fnUrl);
  console.log("[debug] restUrl     =", restUrl);

  // iPhoneはConsoleが見づらいので画面にも出す
  const el = document.getElementById("authStatus");
  if (el) {
    el.textContent = (el.textContent || "") + `\n[debug] fnUrl=${fnUrl}`;
  }
}
debugShowUrls();

// このページのURLに戻す（本番URLに合わせる）
const REDIRECT_TO = "https://client-sche.web.app/service-records/";

// DOM
const $email = document.getElementById("email");
const $sendLink = document.getElementById("sendLink");
const $check = document.getElementById("checkSession");
const $logout = document.getElementById("logout");
const $status = document.getElementById("authStatus");
const $fnCard = document.getElementById("fnCard");
const $stepId =
  document.getElementById("stepId") ||
  document.querySelector('input[name="stepId"]') ||
  null;
const $routeInput = document.getElementById("routeInput");
const $answer = $routeInput || document.getElementById("answer");
const $invoke = document.getElementById("invoke");
const $saveNote = document.getElementById("saveNote");
const $result = document.getElementById("result"); // 旧（残っててもOK）
const $resultCard = document.getElementById("resultCard");
const $resultSummary = document.getElementById("resultSummary");
const $resultFacts = document.getElementById("resultFacts");
const $resultRaw = document.getElementById("resultRaw");
const $resultSummaryEdit = document.getElementById("resultSummaryEdit");
const $loadMoves = document.getElementById("loadMoves");
const $movesResult = document.getElementById("movesResult");
const $movesList = document.getElementById("movesList");
const $movesSelected = document.getElementById("movesSelected");
const $confirmModal = document.getElementById("confirmModal");
const $confirmCancel = document.getElementById("confirmCancel");
const $confirmOk = document.getElementById("confirmOk");
// 帳票DOM
const $printCard = document.getElementById("printCard");
const $printBtn = document.getElementById("printBtn");
const $pOffice = document.getElementById("pOffice");
const $pHelper = document.getElementById("pHelper");
const $pClient = document.getElementById("pClient");
const $pDate = document.getElementById("pDate");
const $pTime = document.getElementById("pTime");
const $pDestination = document.getElementById("pDestination");
const $pMainSupport = document.getElementById("pMainSupport");
const $pRemarks = document.getElementById("pRemarks");
const $pRouteWalk = document.getElementById("pRouteWalk");
const $pRouteBus = document.getElementById("pRouteBus");
const $pRouteTrain = document.getElementById("pRouteTrain");
const $pRouteOther = document.getElementById("pRouteOther");

let handledHashSession = false;
let currentHelperName = null;
let lastAI = null;
let selectedMove = null;
let movesCache = [];
let selectedTask = null;
let savingLock = false;

function setStatus(msg) {
  $status.textContent = msg;
}

function setTaskCardVisible() {
  // task card UI は非表示運用
}

function setTaskListMessage() {
  // schedule_tasks は未使用
}

function renderSelectedTask() {
  // schedule_tasks は未使用
}

function setFnCardVisible(show) {
  if (!$fnCard) return;
  $fnCard.style.display = show ? "block" : "none";
}

function setFnResult(msg) {
  // 旧UI用（残っててもOK）
  if ($result) $result.textContent = msg;
  // 新UI用（メッセージだけ表示したい場合）
  if ($resultCard) $resultCard.style.display = "block";
  if ($resultFacts) $resultFacts.innerHTML = "";
  if ($resultRaw) $resultRaw.textContent = "";
}

function setSummaryText(text) {
  if (!$resultSummary) return;
  if ($resultCard) $resultCard.style.display = "block";
  $resultSummary.textContent = text || "";
}

function safeText(s) {
  return String(s ?? "");
}

function fmtTime(t) {
  return (t || "").slice(0, 5);
}

function setPillActive(el, active) {
  if (!el) return;
  el.style.background = active ? "#fff3e8" : "#fff";
  el.style.borderColor = active ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.25)";
  el.style.fontWeight = active ? "800" : "600";
}

function buildMainSupportText(fields, summary) {
  return (summary || "").trim();
}

function buildRemarksText(fields) {
  const memo = (fields?.memo || "").trim();
  return memo ? `メモ: ${memo}` : "";
}

function renderPaperPreview() {
  if (!selectedMove || !lastAI || !lastAI.fields || !lastAI.summary) {
    if ($printCard) $printCard.style.display = "none";
    return;
  }

  const t = selectedMove;
  const f = lastAI.fields;
  const s = lastAI.summary;

  if ($printCard) $printCard.style.display = "block";

  if ($pOffice) $pOffice.textContent = "（ビレッジ）";
  if ($pHelper)
    $pHelper.textContent = (t.primary_helper_name || t.helper_names || "").toString();
  if ($pClient) $pClient.textContent = (t.client_name || "").toString();
  if ($pDate) $pDate.textContent = (t.task_date || "").toString();
  if ($pTime) $pTime.textContent = `${fmtTime(t.start_time)}〜${fmtTime(t.end_time)}`;

  const dest =
    t.from_place && t.to_place
      ? `${t.from_place}→${t.to_place}`
      : t.note
      ? String(t.note)
      : f.destination || "";
  if ($pDestination) $pDestination.textContent = dest || "";

  if ($pMainSupport) $pMainSupport.textContent = buildMainSupportText(f, s);
  if ($pRemarks) $pRemarks.textContent = buildRemarksText(f);

  setPillActive($pRouteWalk, false);
  setPillActive($pRouteBus, false);
  setPillActive($pRouteTrain, false);
  setPillActive($pRouteOther, true);
}

function getStepIdSafe() {
  const v =
    $stepId && "value" in $stepId ? String($stepId.value || "").trim() : "";
  return v || "destination";
}

function getRouteSafe() {
  const v =
    $answer && "value" in $answer ? String($answer.value || "").trim() : "";
  return v;
}

function buildFactsFromFields(fields) {
  const lines = [];
  if (!fields || !fields.sections) return lines;

  // 状態
  if (fields.sections.condition && fields.condition) {
    const c = fields.condition;
    const parts = [];
    if (c.seizure) parts.push("発作あり");
    if (c["no-seizure"]) parts.push("発作なし");
    if (c.agitated) parts.push("興奮気味");
    if (c["slightly-unstable"]) parts.push("やや不安定");
    if (c.calm) parts.push("落ち着いていた");
    if (c["condition-changed"]) parts.push("変化あり");
    if (c["condition-unchanged"]) parts.push("変化なし");
    if (parts.length) lines.push(`状態: ${parts.join("・")}`);
  }

  // トイレ
  if (fields.sections.toilet && fields.toilet) {
    const t = fields.toilet;
    const parts = [];
    if (t.both) parts.push("排尿・排便");
    else {
      if (t.urination) parts.push("排尿");
      if (t.defecation) parts.push("排便");
    }
    if (t["no-toilet"]) parts.push("なし");
    if (t.diaper) parts.push("おむつ");
    if (t.assist) parts.push("介助");
    if (parts.length) lines.push(`トイレ: ${parts.join("・")}`);
  }

  // 天候（内部キーは mood のまま）
  if (fields.sections.mood && fields.mood) {
    const m =
      fields.mood === "sunny"
        ? "晴れ"
        : fields.mood === "cloudy-sun"
        ? "晴れ時々曇り"
        : fields.mood === "cloudy"
        ? "曇り"
        : fields.mood === "rainy"
        ? "雨"
        : "";
    if (m) lines.push(`天候: ${m}`);
  }

  // 食事・水分
  if (fields.sections.meal && (fields.mealFood || fields.mealWater)) {
    const parts = [];
    if (fields.mealFood === "all") parts.push("食事: 全量");
    if (fields.mealFood === "half") parts.push("食事: 半量");
    if (fields.mealFood === "none") parts.push("食事: なし");
    if (fields.mealWater === "enough") parts.push("水分: 十分");
    if (fields.mealWater === "lack") parts.push("水分: 不足");
    if (parts.length) lines.push(parts.join(" / "));
  }

  // 服薬
  if (fields.sections.medication && fields.medication) {
    const med =
      fields.medication === "taken"
        ? "服薬"
        : fields.medication === "forgot"
        ? "飲み忘れ"
        : fields.medication === "refused"
        ? "拒否"
        : "";
    if (med) lines.push(`服薬: ${med}`);
  }

  // メモ（短く）
  if (fields.memo && String(fields.memo).trim()) {
    const memo = String(fields.memo).trim().replace(/\s+/g, " ");
    const short = memo.length > 50 ? memo.slice(0, 49) + "…" : memo;
    lines.push(`メモ: ${short}`);
  }
  return lines;
}

function renderResultForHelpers(data) {
  if (!$resultCard || !$resultSummary || !$resultFacts || !$resultRaw) return;
  $resultCard.style.display = "block";

  const summary = safeText(data?.summary);
  const fields = data?.fields || null;

  // summary 表示と編集欄へ反映
  $resultSummary.textContent = summary || "（記録文が空です）";
  if ($resultSummaryEdit) $resultSummaryEdit.value = summary || "";

  // チェック結果は「選択されたものだけ」
  const facts = buildFactsFromFields(fields);
  $resultFacts.innerHTML = facts.map((x) => `<li>${safeText(x)}</li>`).join("");
  $resultRaw.textContent = ""; // JSONは画面に出さない
}

function formatMoveLine(m) {
  const d = m.task_date || "";
  const st = (m.start_time || "").slice(0, 5);
  const et = (m.end_time || "").slice(0, 5);
  const client = m.client_name || "";
  const from = m.from_place || "";
  const to = m.to_place || "";
  const routeText =
    from && to ? `${from}→${to}` : m.route_note || m.note || "";
  return `${d} ${st}-${et} ${client} / ${routeText}`;
}

function renderMovesList(items) {
  if (!$movesList) return;
  $movesList.innerHTML = "";

  if (!items || items.length === 0) {
    $movesList.innerHTML = `<div class="status">該当する移動予定がありません</div>`;
    if ($movesSelected) $movesSelected.textContent = "選択中の予定：なし";
    return;
  }

  items.forEach((m) => {
    const div = document.createElement("div");
    div.className = "moveCard";
    div.dataset.id = m.id;

    div.innerHTML = `
      <div class="moveTitle">${formatMoveLine(m)}</div>
      <div class="moveSub">担当: ${m.primary_helper_name || ""} / ${m.helper_names || ""}</div>
    `;

    div.addEventListener("click", () => {
      selectedMove = m;
      document
        .querySelectorAll(".moveCard.isSelected")
        .forEach((el) => el.classList.remove("isSelected"));
      div.classList.add("isSelected");
      if ($movesSelected)
        $movesSelected.textContent = "選択中の予定： " + formatMoveLine(m);
      if ($answer) {
        const from = m.from_place || "";
        const to = m.to_place || "";
        const routeText =
          from && to ? `${from}→${to}` : m.route_note || m.note || "";
        $answer.value = routeText.replace(/^→|→$/g, "");
      }
    });

    $movesList.appendChild(div);
  });

  if ($movesSelected) $movesSelected.textContent = "選択中の予定：なし";
}

async function logout() {
  try {
    setStatus("ログアウト中…");

    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // 画面状態を初期化
    currentHelperName = null;
    selectedTask = null;

    setFnCardVisible(false);

    if ($result) $result.textContent = "";
    if ($movesResult) $movesResult.textContent = "";
    if ($movesList) $movesList.textContent = "";
    if ($movesSelected) $movesSelected.textContent = "選択中の予定：なし";

    setStatus("ログアウトしました");
  } catch (e) {
    console.error(e);
    setStatus("ログアウトエラー: " + (e?.message || String(e)));
  }
}

async function loadMyMoves(helperName = currentHelperName) {
  if ($movesResult) $movesResult.textContent = "読込中…";
  if ($movesList) $movesList.innerHTML = "";
  selectedMove = null;
  if ($movesSelected) $movesSelected.textContent = "選択中の予定：なし";

  const profile = await loadMyHelperProfile();
  if (!profile || !profile.helper_name) {
    if ($movesResult)
      $movesResult.textContent = "helpers未登録: helper_name が取得できません";
    return;
  }

  const helperKey = profile.helper_name;
  const helperKeySafe = helperKey.replaceAll('"', '\\"');

  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);

  const fromObj = new Date(jst);
  fromObj.setDate(fromObj.getDate() - 7);
  const fromJst = fromObj.toISOString().slice(0, 10);

  const toObj = new Date(jst);
  toObj.setDate(toObj.getDate() + 14);
  const toJst = toObj.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("v_schedule_tasks_move_unwritten")
    .select(
      "id, task_date, start_time, end_time, client_name, helper_names, primary_helper_name, from_place, to_place, route_note, note, status"
    )
    .gte("task_date", fromJst)
    .lte("task_date", toJst)
    .or(
      `primary_helper_name.eq."${helperKeySafe}",helper_names.ilike.%${helperKeySafe}%`
    )
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(50);

  if (error) {
    if ($movesResult) $movesResult.textContent = error.message;
    return;
  }

  const items = data || [];
  movesCache = items;
  const header = `取得${items.length}件 (helper=${helperKey}, date=${fromJst}〜${toJst})`;
  if ($movesResult) $movesResult.textContent = header; // JSON出力はしない
  renderMovesList(items);
}

async function loadMyTasksNext7Days() {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);

  const toObj = new Date(today);
  toObj.setDate(toObj.getDate() + 7);
  const to = toObj.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("schedule_tasks_move")
    .select(
      "id, task_date, start_time, end_time, client_name, helper_names, primary_helper_name, from_place, to_place, route_note, status"
    )
    .gte("task_date", from)
    .lte("task_date", to)
    .order("task_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function afterLoginLoadTasks_() {
  const $result = document.getElementById("result");

  try {
    const tasks = await loadMyTasksNext7Days();
    if ($result) $result.textContent = JSON.stringify(tasks, null, 2);
    return tasks;
  } catch (e) {
    console.error(e);
    setStatus("予定取得エラー: " + (e?.message || String(e)));
    return [];
  }
}

async function loadMyHelperProfile() {
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("helpers")
    .select("helper_name,is_admin,email")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data; // ← 個人用なら is_admin=false
}

async function sendMagicLink() {
  const email = ($email.value || "").trim();
  if (!email) return setStatus("メールアドレスを入力してください。");

  setStatus("送信中…");

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: REDIRECT_TO,
    },
  });

  if (error) {
    console.error(error);
    setStatus("送信エラー: " + error.message);
    return;
  }

  setStatus("マジックリンクを送信しました。メールを確認してください。");
}

async function checkSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error(error);
      setStatus("セッション取得エラー: " + error.message);
      setTaskCardVisible(false);
      setFnCardVisible(false);
      return;
    }

    const session = data?.session;
    if (!session) {
      setStatus("未ログイン");
      setTaskCardVisible(false);
      setFnCardVisible(false);
      return;
    }

    const profile = await loadMyHelperProfile();
    if (!profile) {
      setStatus("helpers未登録");
      setTaskCardVisible(false);
      setFnCardVisible(false);
      return;
    }

    const tasks = await afterLoginLoadTasks_();
    // ヘルパー向けに表示を簡潔化
    setStatus(
      `ログインOK: ${profile.helper_name} / email=${profile.email}\n予定取得OK(${tasks.length}件)`
    );
    currentHelperName = profile.helper_name;
    setTaskCardVisible(true);
    setFnCardVisible(true);
  } catch (e) {
    console.error(e);
    setStatus("エラー: " + String(e.message || e));
    setTaskCardVisible(false);
    setFnCardVisible(false);
  }
}

async function handleHashSessionLogin() {
  if (handledHashSession) return false;

  const hash = location.hash.startsWith("#")
    ? location.hash.slice(1)
    : location.hash;
  const params = new URLSearchParams(hash);
  const access_token = params.get("access_token");
  if (!access_token) return false;

  handledHashSession = true;
  const refresh_token = params.get("refresh_token");
  if (!refresh_token) {
    setStatus(
      "ログイン用トークンが不足しています（refresh_tokenなし）。メールのリンクを『同じ端末・同じブラウザ』で開き直してください。"
    );
    return true; // ハッシュは処理済み扱い
  }

  try {
    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });
    if (error) throw error;

    history.replaceState(null, "", location.pathname + location.search);
    setStatus("ログイン済み");
    await checkSession();
    return true;
  } catch (e) {
    console.error(e);
    setStatus("エラー: " + String(e.message || e));
    return true; // ハッシュは処理済み扱い
  }
}

function buildCurrentTemplate() {
  const getCheck = (id) => !!document.getElementById(id)?.checked;
  const getRadio = (name) => {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el?.value || null;
  };
  const destination = ($routeInput?.value || "").trim();
  const memo = (document.getElementById("memo")?.value || "").trim();

  return {
    destination,
    sections: {
      condition: getCheck("sec_condition"),
      toilet: getCheck("sec_toilet"),
      mood: getCheck("sec_mood"),
      meal: getCheck("sec_meal"),
      medication: getCheck("sec_medication"),
      familyReport: getCheck("sec_familyReport"),
    },
    condition: {
      calm: getCheck("cond-calm"),
      "slightly-unstable": getCheck("cond-slightly-unstable"),
      agitated: getCheck("cond-agitated"),
      seizure: getCheck("cond-seizure"),
      "no-seizure": getCheck("cond-no-seizure"),
      "condition-changed": getCheck("cond-condition-changed"),
      "condition-unchanged": getCheck("cond-condition-unchanged"),
    },
    toilet: {
      urination: getCheck("toilet-urination"),
      defecation: getCheck("toilet-defecation"),
      both: getCheck("toilet-both"),
      "no-toilet": getCheck("toilet-no-toilet"),
      diaper: getCheck("toilet-diaper"),
      assist: getCheck("toilet-assist"),
    },
    mood: getRadio("mood"),
    mealFood: getRadio("mealFood"),
    mealWater: getRadio("mealWater"),
    medication: getRadio("medication"),
    interaction: getRadio("interaction"),
    memo,
  };
}

async function invokeEdgeFunction() {
  try {
    setFnResult("実行中…");

    const stepId = ($stepId?.value || "").trim();
    const answer = ($answer?.value || "").trim();

    if (!stepId) return setFnResult("stepId が空です");
    if (!answer) return setFnResult("answer が空です");

    const body = {
      stepId,
      answer,
      current: buildCurrentTemplate(),
    };

    const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-service-note-step`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();

    if (!res.ok) {
      setFnResult(`HTTP ${res.status}\n${text}`);
      return;
    }

    const data = JSON.parse(text);

    // 保存（後続の保存ボタンで使う）
    lastAI = { fields: data?.fields ?? null, summary: data?.summary ?? null };

    // 画面表示
    setFnResult(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
    setFnResult(String(e?.message || e));
  }
}

async function saveNote() {
  try {
    const taskId = selectedMove?.id;
    if (!taskId) {
      setFnResult("予定を選択してください（上の移動予定カードをクリック）");
      return;
    }

    // ★ここに入れる（lastAIの厳密チェック）
    if (!lastAI || !lastAI.fields || !lastAI.summary) {
      setFnResult(
        "Edge Function 実行結果が不完全です（fields/summary）。まず要約生成してください。"
      );
      return;
    }

    const { data: userRes, error: userErr } = await supabase.auth.getUser();
    if (userErr) {
      setFnResult("ユーザー取得エラー: " + userErr.message);
      return;
    }
    const user = userRes?.user;
    if (!user) {
      setFnResult("未ログインのため保存できません");
      return;
    }

    const profile = await loadMyHelperProfile();
    if (!profile?.helper_name) {
      setFnResult("helpers未登録: helper_name が取得できません");
      return;
    }

    const payload = {
      task_id: taskId,
      author_user_id: user.id,
      author_helper_name: profile.helper_name,
      fields: lastAI.fields,
      summary: $resultSummaryEdit?.value || lastAI.summary,
      status: "draft",
      updated_at: new Date().toISOString(),
    };

  const { data, error } = await supabase
    .from("service_notes_move")
    .upsert(payload, { onConflict: "task_id" })
    .select("id, task_id")
    .single();

    if (error) {
      setFnResult("保存エラー: " + error.message);
      return;
    }

    setFnResult(`保存OK: ${data?.id ?? "(id不明)"} / task_id=${data?.task_id ?? "(不明)"}`);
    selectedMove = null;
    if ($movesSelected) $movesSelected.textContent = "選択中の予定：なし";
    if ($answer) $answer.value = "";
    if ($resultSummaryEdit) $resultSummaryEdit.value = "";
    await loadMyMoves().catch(console.error);
    if ($printCard) $printCard.style.display = "none";
  } catch (e) {
    console.error(e);
    setFnResult(String(e?.message || e));
  }
}

function openConfirmModal() {
  if (!$confirmModal) return;
  $confirmModal.classList.add("is-open");
  $confirmModal.setAttribute("aria-hidden", "false");
}

function closeConfirmModal() {
  if (!$confirmModal) return;
  $confirmModal.classList.remove("is-open");
  $confirmModal.setAttribute("aria-hidden", "true");
}

async function onClickSave() {
  if (!selectedMove) {
    setFnResult("予定を選択してください（上の予定カードをクリック）");
    return;
  }
  if (!lastAI || !lastAI.fields || !lastAI.summary) {
    setFnResult("まだ記録文がありません（先に「記録文を作成」）");
    return;
  }
  openConfirmModal();
}

async function onConfirmSave() {
  if (savingLock) return;
  savingLock = true;
  try {
    if ($confirmOk) $confirmOk.disabled = true;
    if ($confirmCancel) $confirmCancel.disabled = true;
    await saveNote();
    closeConfirmModal();
  } finally {
    savingLock = false;
    if ($confirmOk) $confirmOk.disabled = false;
    if ($confirmCancel) $confirmCancel.disabled = false;
  }
}

if ($confirmModal) {
  $confirmModal.addEventListener("click", (e) => {
    if (e.target === $confirmModal) closeConfirmModal();
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeConfirmModal();
});

async function loadTasksForMe(helperName) {
  if (!$taskList) return;
  setTaskListMessage("予定取得は一時停止中です（schedule_tasks は今回未使用）");
  selectedTask = null;
  renderSelectedTask();
}

// ページ表示直後にハッシュログインを処理し、未処理なら通常チェック
handleHashSessionLogin()
  .then((handled) => {
    if (!handled) return checkSession();
    return null;
  })
  .catch(console.error);

// イベント
$sendLink.addEventListener("click", () => sendMagicLink().catch(console.error));
$check.addEventListener("click", () => checkSession().catch(console.error));
$invoke?.addEventListener("click", () =>
  invokeEdgeFunction().catch(console.error)
);
$saveNote?.addEventListener("click", () => onClickSave().catch(console.error));
$loadMoves?.addEventListener("click", () => loadMyMoves().catch(console.error));
$logout?.addEventListener("click", () => logout().catch(console.error));

$confirmCancel?.addEventListener("click", () => closeConfirmModal());
$confirmOk?.addEventListener("click", () => onConfirmSave().catch(console.error));
$printBtn?.addEventListener("click", () => window.print());

// 変更点: signInWithOtpのoptionsをemailRedirectToに修正／setSession引数をv2仕様（access_token, refresh_tokenのみ）に変更／ステータスに変更内容を表示／Edge Function の呼び出しに helper_key を追加
