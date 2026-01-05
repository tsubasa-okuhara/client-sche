TS + Supabase カレンダー 開発ドキュメント（helpers版）

このドキュメントは、helpers カレンダープロジェクトの「動作原理・バグ・解決方法・構成」をまとめたものです。

【0. フォルダ構成】
client-sche/
  public/helpers/
    index.html
    style.css
    src/main.ts
    dist/main.js
  tsconfig.json
  docs/

【1. dist/main.js が動いていなかった問題】
原因: index.html の script 読み込みがコメントアウトされていた。
解決: <script src="./dist/main.js"></script>

【2. type="module" にすると動かなかった】
原因: file:// + ESModule の問題
解決: 普通の <script> を使う

【3. Supabase import で tsc が落ちた】
原因: tsc は https import を解決できない
解決: CDN＋グローバル supabase 方式へ変更

【4. supabase is not defined】
原因: CDN より先に main.js を読み込んでいた
解決:
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="./dist/main.js"></script>

【5. open public/helpers/index.html が動かない】
原因: ターミナルの現在位置が public/helpers 内だった
解決:
cd /Users/mewself/client-sche
open public/helpers/index.html

【6. 画面に何も見えない問題】
原因: 非同期処理が動いているか視覚化できていなかった
解決: 画面下に setStatus() で黄色の帯を出す

【7. Supabase URL / ANON KEY の取り方】
URL: Settings → Data API → Project URL
anon: Settings → API Keys → Legacy anon → public

【8. 成功パターン index.html】
Supabase CDN → dist/main.js の順で読み込む

【9. 成功パターン main.ts】
supabase.createClient を使い、2025-12 を表示するロジック

【10. 成功パターン CSS（白いカード）】
.schedule-item {
  background: #fff;
  border-left: 4px solid #f78da7;
  border-radius: 6px;
}

【11. 全体チェックリスト】
- dist/main.js を正しく読み込めているか？
- CDN の順番は正しいか？
- Supabase のキーは全文か？
- groupByDate と renderCalendar が呼ばれているか？
