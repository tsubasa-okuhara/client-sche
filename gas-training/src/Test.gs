/***************
 * WebApp 疎通テスト（clasp管理）
 ***************/

// ★WebApp の /exec URL（必ず /exec）
const WEBAPP_URL =
  "https://script.google.com/macros/s/AKfycbyJfIUorjUjrhjocl7WMHTuGuOJrbywdp8Lboqd5T8uYzAEnJO3bisb7EtHdzZdogTVSA/exec";

function webappTestTrainingList() {
  const payload = { limit: 50, token: TRAINING_API_TOKEN };

  const res = UrlFetchApp.fetch(WEBAPP_URL + "?mode=training_list", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  Logger.log("status=%s", res.getResponseCode());
  Logger.log(res.getContentText());
}

function webappTestMinutesGenerate(trainingId) {
  const tid = trainingId || "R2026-0301-001";
  const payload = { training_id: tid, token: TRAINING_API_TOKEN };

  const res = UrlFetchApp.fetch(WEBAPP_URL + "?mode=minutes_generate", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  Logger.log("status=%s", res.getResponseCode());
  Logger.log(res.getContentText());
}

function webappTestDebugOpen() {
  const payload = { token: TRAINING_API_TOKEN };

  const res = UrlFetchApp.fetch(WEBAPP_URL + "?mode=debug_open", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  Logger.log("status=%s", res.getResponseCode());
  Logger.log(res.getContentText());
}
