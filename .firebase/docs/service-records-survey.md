# サービス記録（移動 vs 居宅）調査メモ

調査日: 2026-03-15  
目的: 「移動のサービス記録」と「居宅のサービス記録」の関連ファイル・入力項目・送信先・画面構成の整理（変更なし・調査のみ）

---

## 1. 関連ファイル一覧

### 移動のサービス記録（実装済み）

| 種別 | パス | 役割 |
|------|------|------|
| フロント | `public/service-records/index.html` | 画面：ログイン、未記入一覧、チェック・メモ、記録文下書き、帳票プレビュー、保存確認モーダル |
| フロント | `public/service-records/main.js` | 認証、未記入一覧取得・表示、テンプレート組み立て、Edge Function 呼び出し、Supabase 保存、帳票プレビュー |
| スタイル | `public/service-records/style.css` | サービス記録画面のスタイル |
| 管理 | `public/service-records-admin/index.html` | 管理者用：日付範囲・利用者フィルタ、一覧・印刷 |
| 管理 | `public/service-records-admin/main.js` | 移動記録の管理一覧取得・印刷レンダリング（`v_service_records_move_admin`） |
| 管理 | `public/service-records-admin/test-print.html` | 印刷レイアウト検証用（サンプルで「移動支援」「居宅（身体）」の2パターンあり） |
| バックエンド | `_archive/supabase/functions/parse-service-note-step/index.ts` | 移動用：チェック・メモを JSON に整形し要約文を生成（OpenAI 利用） |

### 居宅のサービス記録（ルート・API のみ定義、フロント未実装）

| 種別 | パス | 役割 |
|------|------|------|
| 設定 | `firebase.json` | `/service-records-home/**` → `service-records-home/index.html`、および下記 API の rewrite |
| API（Firebase Functions） | （本リポジトリ外の functionId 参照） | 下記 4 つ。**実装はこのリポジトリにはない**（別プロジェクト or 未デプロイの可能性） |

- `getHomeScheduleTasksPending` ← `/api/home-schedule-tasks/pending`
- `getHomeServiceCheckItems` ← `/api/home-service-check-items`
- `getHomeServiceRecordLatest` ← `/api/home-service-records/latest`
- `postHomeServiceRecord` ← `/api/home-service-records` (POST)

- **フロント**: `public/service-records-home/` フォルダは**存在しない**（firebase.json では参照されているが未作成）

### その他参照

- `public/index.html`: 「📝 サービス記録」リンクは `/service-records/` のみ（居宅専用リンクなし）
- `public/service-records-admin/test-print.html`: 印刷サンプルとして「居宅（身体）」「移動支援」の2ケースを静的表示

---

## 2. 移動と居宅の違い

| 項目 | 移動のサービス記録 | 居宅のサービス記録 |
|------|---------------------|---------------------|
| **予定の元データ** | 移動予定（出発→到着）。`schedule_tasks_move` / 未記入は `v_schedule_tasks_move_unwritten` | 居宅予定。API `getHomeScheduleTasksPending` で取得想定（実装は未確認） |
| **画面** | `/service-records/` で実装済み | `/service-records-home/` はフォルダ未作成 |
| **入力の特徴** | 「行き先（出発→到着）」必須。経路（徒歩・バス・電車・その他）あり。天候あり | test-print のサンプルでは「サービス種別＝居宅（身体）」「場所＝自宅」。記録本文は身体・家事など（移動の「行き先」とは別） |
| **記録保存先** | Supabase: `service_notes_move`（task_id で upsert） | API: `postHomeServiceRecord`（実装・DB は本リポジトリ外） |
| **管理画面** | `v_service_records_move_admin` で一覧・印刷（移動のみ） | 管理画面から居宅の一覧取得は現状なし（移動のみ） |
| **AI/要約** | Supabase Edge Function `parse-service-note-step` で要約文生成（移動支援用文言） | 本リポジトリ内に居宅用の Edge Function は見当たらない |

---

## 3. 入力項目一覧（移動のサービス記録）

### 3.1 画面セクション順

1. **ログイン**  
   - メールアドレス、リンク送信 / ログイン確認 / ログアウト

2. **1) サービス記録 未記入一覧**  
   - 未記入一覧を読み込む → 一覧から 1 件選択（入力項目ではないが、選択がその後の記録に紐づく）

3. **2) チェックとメモ**

| 項目 | 要素 ID / name | 種別 | 内容 |
|------|----------------|------|------|
| 行き先（出発→到着） | `routeInput` (id=routeInput / answer) | テキスト | 例：自宅→まごめ園 |
| 記録する項目（大枠） | sec_condition, sec_toilet, sec_mood, sec_meal, sec_medication, sec_familyReport | チェックボックス | 状態・トイレ・天候・食事・服薬・家族連絡の ON/OFF |
| 状態 | cond-calm, cond-slightly-unstable, cond-agitated, cond-seizure, cond-no-seizure, cond-condition-changed, cond-condition-unchanged | チェック（複数可） | 落ち着いていた / やや不安定 / 興奮気味 / 発作あり・なし / 変化あり・なし |
| トイレ | toilet-urination, toilet-defecation, toilet-both, toilet-no-toilet, toilet-diaper, toilet-assist | チェック（複数可） | 排尿・排便・両方・なし・おむつ・介助 |
| 天候 | name=mood | ラジオ | sunny / cloudy-sun / cloudy / rainy |
| 食事・水分 | name=mealFood, name=mealWater | ラジオ | 食事: all/half/none、水分: enough/lack |
| 服薬 | name=medication | ラジオ | taken / forgot / refused |
| 家族連絡 | sec_familyReport のみ（専用入力カードはなし） | セクション ON/OFF | 記録に含めるかどうかのみ |
| 交流 | name=interaction | ラジオ | had / none |
| メモ | memo | テキストエリア | 50 文字程度目安 |

4. **3) 記録文（下書き）**  
   - 「記録文を作成」→ Edge Function で要約生成 → 「記録文（AI下書き）」表示 → 編集可  
   - 「確定して保存」で DB 保存

5. **帳票プレビュー（管理者のみ）**  
   - 事業所名・利用者確認欄・ヘルパー名・利用者名・日付・時間・行先・主な援助内容・備考・経路（徒歩・バス・電車・その他）

### 3.2 buildCurrentTemplate() が送るオブジェクト（main.js）

- `destination`, `sections`（condition, toilet, mood, meal, medication, familyReport）
- `condition`（calm, slightly-unstable, agitated, seizure, no-seizure, condition-changed, condition-unchanged）
- `toilet`（urination, defecation, both, no-toilet, diaper, assist）
- `mood`, `mealFood`, `mealWater`, `medication`, `interaction`, `memo`

---

## 4. 送信先 API / テーブル / 関数名

### 移動のサービス記録

| 処理 | 送信先 | メソッド/種別 | 備考 |
|------|--------|----------------|------|
| 未記入一覧取得 | Supabase | REST: `v_schedule_tasks_move_unwritten` select | 期間・担当ヘルパーでフィルタ |
| 予定の補足取得 | Supabase | REST: `schedule_tasks_move` select | 7 日分など |
| 記録文（要約）生成 | Supabase Edge Function | POST `functions/v1/parse-service-note-step` | body: `{ stepId, answer, current }` |
| 記録の保存 | Supabase | REST: `service_notes_move` upsert | onConflict: task_id。task_id, author_user_id, author_helper_name, fields, summary, status 等 |
| 管理者一覧 | Supabase | REST: `v_service_records_move_admin` select | 日付範囲・利用者名フィルタ |

### 居宅のサービス記録（設定上のみ）

| 処理 | 送信先 | メソッド/種別 | 備考 |
|------|--------|----------------|------|
| 未記入予定一覧？ | Firebase Function | GET `/api/home-schedule-tasks/pending` | functionId: getHomeScheduleTasksPending（実装はリポジトリ外） |
| チェック項目マスタ？ | Firebase Function | GET `/api/home-service-check-items` | functionId: getHomeServiceCheckItems |
| 直近記録取得？ | Firebase Function | GET `/api/home-service-records/latest` | functionId: getHomeServiceRecordLatest |
| 記録保存？ | Firebase Function | POST `/api/home-service-records` | functionId: postHomeServiceRecord |

---

## 5. 共通化できそうなところ

1. **認証フロー**  
   - マジックリンク + `helpers` の helper_name 取得は移動と同一にできる。  
   - 居宅用フロントを作る場合、`public/service-records/main.js` の `loadMyHelperProfile` / `checkSession` / `sendMagicLink` 等を共通モジュール化するか、居宅用にコピーしてエンドポイントだけ差し替える形が考えられる。

2. **入力項目の共通部分**  
   - 状態・トイレ・食事・服薬・メモなどは移動と居宅で重なりうる。  
   - 「行き先」「天候」「経路」は移動固有。「サービス種別」「場所」「身体/生活」の種別は居宅固有。  
   - 共通の「チェック＋メモ」コンポーネント＋設定で「移動用」「居宅用」の項目セットを切り替える形にすると、UI と buildCurrentTemplate 的な処理を共通化しやすい。

3. **要約文生成（AI）**  
   - `parse-service-note-step` は移動支援用の文言（「〜までの移動支援を行いました」等）がハードコードされている。  
   - 居宅用には別プロンプトまたは `stepId`/種別で分岐が必要。  
   - 「フィールド整形＋要約」のパイプラインは共通にし、テキストテンプレートだけ移動/居宅で切り替えると共通化しやすい。

4. **管理・印刷**  
   - `service-records-admin` は現在 `v_service_records_move_admin` のみ。  
   - 居宅の記録が別テーブル/API になる場合、同じ管理画面で「移動」「居宅」タブまたはフィルタで切り替え、`renderPaperOne_` のような印刷レンダリングを種別ごとに分岐させる形で共通化できる。  
   - test-print の「居宅（身体）」レイアウトをそのまま流用可能。

5. **帳票レイアウト**  
   - 事業所名・利用者・ヘルパー・日付・時間などは共通。  
   - 移動：行先・経路・主な援助内容・備考。  
   - 居宅：サービス種別・場所・記録本文。  
   - 共通の紙テンプレート＋「移動用」「居宅用」のブロック差し替えで共通化できる。

6. **保存確認モーダル**  
   - 「確定して保存しますか？」の流れは移動と同一にしてよい。  
   - 保存 API だけ `service_notes_move` vs `postHomeServiceRecord` に切り替えればよい。

---

## 補足

- **居宅のフロント**: `public/service-records-home/` は現状ないため、居宅の入力画面を作る場合は新規作成か、`service-records/` を「種別（移動/居宅）」で切り替える構成のどちらかになる。  
- **居宅の API**: Firebase の functionId はこのリポジトリの `functions/index.js` には存在しない。別リポジトリ or Firebase プロジェクトで管理されている可能性がある。  
- **familyReport**: 移動では「家族連絡」はセクションの ON/OFF（sec_familyReport）のみで、専用の入力カードはない。Edge Function の型・プロンプトには `familyReport` が含まれている。
