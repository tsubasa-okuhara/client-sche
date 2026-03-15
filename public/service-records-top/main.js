/**
 * サービス記録トップ
 * - URL の helper_email を取得
 * - 移動未記入件数: schedule_tasks_move（helper_email, status=unwritten）
 * - 居宅未記入件数: home_schedule_tasks（helper_email, status=pending）
 * - Supabase 設定は public/service-records/main.js に合わせて流用
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://xwnbdlcukycihgfrfcox.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh3bmJkbGN1a3ljaWhnZnJmY294Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDczMzU1ODIsImV4cCI6MjA2MjkxMTU4Mn0.WxvvQsY0Efildt9YC55eU0Nus_8E6nufB-_oZ9yMXbI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getHelperEmail() {
  const params = new URLSearchParams(location.search);
  return (params.get("helper_email") || "").trim();
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setCountAndButton(kind, count, error) {
  const countEl = document.getElementById(`${kind}Count`);
  const subEl = document.getElementById(`${kind}Sub`);
  const btnEl = document.getElementById(
    `btn${kind === "move" ? "Move" : "Home"}`,
  );
  if (!countEl || !btnEl) return;

  if (error) {
    countEl.textContent = "取得できませんでした";
    if (subEl) subEl.textContent = "";
    btnEl.classList.add("is-disabled");
    btnEl.removeAttribute("href");
    btnEl.setAttribute("aria-disabled", "true");
    return;
  }

  const n = typeof count === "number" ? count : 0;
  countEl.textContent =
    n === 0 ? "未記入予定はありません" : `未記入予定 ${n}件`;
  if (subEl)
    subEl.textContent =
      n === 0
        ? ""
        : kind === "move"
          ? "未記入の移動予定を記録します"
          : "未記入の居宅予定を記録します";
  if (n === 0) {
    btnEl.classList.add("is-disabled");
    btnEl.removeAttribute("href");
    btnEl.setAttribute("aria-disabled", "true");
  } else {
    btnEl.classList.remove("is-disabled");
    btnEl.setAttribute("href", kind === "move" ? getMoveUrl() : getHomeUrl());
    btnEl.removeAttribute("aria-disabled");
  }
}

function getMoveUrl() {
  const email = getHelperEmail();
  const base = "/service-records/";
  return email ? `${base}?helper_email=${encodeURIComponent(email)}` : base;
}

function getHomeUrl() {
  const email = getHelperEmail();
  const base = "/service-records-home/";
  return email ? `${base}?helper_email=${encodeURIComponent(email)}` : base;
}

async function fetchHomeCount(supabase, helperEmail) {
  if (!helperEmail) return { count: 0, error: true };
  try {
    const { count, error } = await supabase
      .from("home_schedule_tasks")
      .select("id", { count: "exact", head: true })
      .eq("helper_email", helperEmail)
      .eq("status", "pending");

    if (error) return { count: 0, error: true };
    return { count: count ?? 0, error: false };
  } catch (_) {
    return { count: 0, error: true };
  }
}

function initLinks() {
  const btnMove = document.getElementById("btnMove");
  const btnHome = document.getElementById("btnHome");
  if (btnMove) btnMove.href = getMoveUrl();
  if (btnHome) btnHome.href = getHomeUrl();
}

async function main() {
  const helperEmail = getHelperEmail();
  setText(
    "helperEmail",
    helperEmail ? `ヘルパー: ${helperEmail}` : "ヘルパー: （未指定）",
  );
  initLinks();

  if (!helperEmail) {
    setCountAndButton("move", 0, true);
    setCountAndButton("home", 0, true);
    return;
  }

  const [moveResult, homeResult] = await Promise.all([
    fetchMoveCount(supabase, helperEmail),
    fetchHomeCount(supabase, helperEmail),
  ]);
  setCountAndButton("move", moveResult.count, moveResult.error);
  setCountAndButton("home", homeResult.count, homeResult.error);
}

async function fetchMoveCount(supabase, helperEmail) {
  console.log("[move] helperEmail =", helperEmail);

  if (!helperEmail) {
    console.log("[move] helperEmail missing");
    return { count: 0, error: true };
  }

  try {
    const { count, error } = await supabase
      .from("schedule_tasks_move")
      .select("id", { count: "exact", head: true })
      .eq("helper_email", helperEmail)
      .eq("status", "unwritten");

    console.log("[move] result =", { count, error });

    if (error) {
      return { count: 0, error: true };
    }

    return { count: count ?? 0, error: false };
  } catch (e) {
    console.error("[move] fetch failed", e);
    return { count: 0, error: true };
  }
}

main();
