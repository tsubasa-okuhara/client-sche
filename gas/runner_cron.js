/**
 * 運用入口（15分トリガー）
 * - 希望シフト：毎回
 * - スケジュール：06-18時の偶数時のみ
 * - 同時実行防止あり
 */
function cronMain() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) {
    console.log("cronMain skipped (lock busy)");
    return;
  }

  try {
    console.log("cronMain start", new Date());

    // 1) 希望シフト同期（毎回）
    try {
      if (typeof runHelperShiftSync === "function") {
        runHelperShiftSync();
      }
    } catch (e) {
      console.error("runHelperShiftSync failed", e);
    }

    // 2) スケジュール同期（2時間ごと）
    if (shouldRunScheduleSync_()) {
      try {
        if (typeof runScheduleSync === "function") {
          runScheduleSync();
        }
      } catch (e) {
        console.error("runScheduleSync failed", e);
      }
    }
  } finally {
    lock.releaseLock();
  }
}

/**
 * 06:00-18:00 の偶数時（00分）のみ true
 */
function shouldRunScheduleSync_() {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();

  if (m !== 0) return false;
  if (h < 6 || h > 18) return false;
  return h % 2 === 0; // 6,8,10,12,14,16,18
}
