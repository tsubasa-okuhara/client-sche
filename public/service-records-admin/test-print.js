(function () {
  function qs(sel) { return document.querySelector(sel); }
  function qsa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  const page = qs(".page");
  const records = qsa(".record");

  function toggleLong() {
    const isLong = records[0].getAttribute("data-case") === "long";
    records.forEach((r) => r.setAttribute("data-case", isLong ? "normal" : "long"));

    const bodies = qsa(".record .block__content");
    if (!bodies.length) return;

    const shortText =
      "身体：入浴介助。足元の安全に留意し、声かけしながら移動。洗髪時は本人のペースを尊重し、湯温確認を実施。\n" +
      "家事：室内清掃（掃除機・拭き掃除）。水分摂取を促し、体調変化なし。";

    const longText =
      "身体：入浴介助。移動時は手すり確認と段差注意。衣類の着脱は本人主体で、必要時のみ部分介助。湯温・体調を都度確認し、のぼせ兆候がないか観察。\n" +
      "会話：本人の不安が高まりやすいため、見通し提示（次に何をするか）を短文で繰り返し、反応を確認。\n" +
      "家事：室内清掃（掃除機・拭き掃除・ベッド周り整え）。キッチン周りの片付けとゴミ出し準備。水分摂取を促し、飲水量を確認。\n" +
      "特記事項：途中、軽度のふらつきがあったため椅子で休憩。状態安定後に再開。次回、浴室マット位置の再確認が必要。";

    bodies[0].textContent = isLong ? shortText : longText;
    if (bodies[1]) bodies[1].textContent = isLong ? shortText : longText;
  }

  function toggleTwoUp() {
    const cur = page.getAttribute("data-layout");
    page.setAttribute("data-layout", cur === "two-up" ? "one-up" : "two-up");
  }

  document.addEventListener("click", function (e) {
    const btn = e.target && e.target.closest ? e.target.closest("[data-action]") : null;
    if (!btn) return;

    const act = btn.getAttribute("data-action");
    if (act === "print") window.print();
    if (act === "toggle-long") toggleLong();
    if (act === "toggle-two-up") toggleTwoUp();
  });
})();
