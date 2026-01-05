# このリポジトリ向け Copilot 指示

## 全体像

静的サイトを **Firebase Hosting** で配信しています。ソースは複数の小さな TypeScript + Vite サブプロジェクトに分かれており、最終的に `public/` 以下のビルド済みファイルがホスティングされます。

## 主要コンポーネント

- **`helpers-ts/`** — ヘルパー希望シフト機能。Vite ビルドで `../public/helpers` に出力。`@supabase/supabase-js` 利用。**重要**: Vite 設定に `base: "/helpers/"` と `build.outDir: "../public/helpers"` があり、`/helpers/` サブパス配信を維持。
- **`client-ts/`**, **`helper-ts/`**, **`helpers-ts/`** — 各サブプロジェクトは `tsc && vite build` でビルド。
- **`public/`** — Firebase Hosting 対象ディレクトリ。**原則として、ビルド生成物を配置する場所であり、直接編集しません。修正は対応する `*-ts/src/` を編集して`npm run build`し直すこと。**
- **`firebase.json`** — Hosting 設定。`rewrites` で `/helpers/**` → `/helpers/index.html` にリライト（SPA 対応）。キャッシュ制御も設定済み。
- **`gas/`** — Google Apps Script（別途デプロイ）。データ移送やスケジュール生成に使用。

## 重要なビルド・デプロイコマンド

### helpers-ts のビルド・確認

```bash
cd helpers-ts
npm install
npm run build
# ↓ 出力先確認
ls -la ../public/helpers
# ↓ outDir が効いているか確認
npm run build -- --debug | grep "writing.*public/helpers"
```

### 開発サーバ（各サブプロジェクト）

```bash
cd helpers-ts
npm run dev
# → http://localhost:5173 (デフォルト)
```

### Firebase ホスティング: ローカルエミュレータで全体確認

```bash
cd <repo-root>
firebase emulators:start --only hosting
# → http://localhost:5000/helpers/
```

### Firebase Hosting にデプロイ

```bash
firebase deploy --only hosting
```

## プロジェクト固有の注意点（重要）

### Vite 設定: `helpers-ts` の例

`helpers-ts/vite.config.ts` には以下が設定されていることを確認してください：

```typescript
export default {
  base: "/helpers/", // スクリプト・アセット参照のプレフィックス
  build: {
    outDir: "../public/helpers", // ビルド出力先
    emptyOutDir: true, // 出力時に既存ファイルを削除
  },
  // ...
};
```

これにより：

- ビルド後の `index.html` 内のスクリプト参照は `/helpers/assets/...` 等になる
- `../public/helpers/` に最終出力される
- Firebase の `rewrites` と組み合わせて `/helpers/**` → SPA として正しく配信される

### 修正の原則

**`public/` ディレクトリは原則的にビルド生成物であり、直接編集してはいけません。** すべての修正は対応する `*-ts/src/` を編集して`npm run build`し直してください。これにより：

- ソースコード（`src/`）が単一の真実の源（SSOT）となる
- ビルドプロセスを通じて常に整合性が取れた状態を保つ
- CI/CD パイプラインと齟齬が生じない

例外として緊急時に `public/` を直接修正した場合、**必ず対応する `*-ts/src/` も同じ内容に修正し、ビルドで上書きして確認すること。**

### ビルド確認の最短手順

```bash
cd helpers-ts
npm run build
ls -la ../public/helpers/assets
grep -n "/helpers/" ../public/helpers/index.html
```

期待される出力：

- `../public/helpers/assets/` ディレクトリが存在
- `index.html` に `/helpers/` で始まるスクリプト/アセット参照が複数行表示される

### ビルド出力の詳細検証

より詳しく調査する場合：

```bash
cd helpers-ts
npm run build -- --debug | tail -n 120
ls -la ../public/helpers/
grep -n "/helpers/" ../public/helpers/index.html | head -n 5
# → "/helpers/assets/…" が見えれば OK
```

## 参考ファイル（初動で必ず開く場所）

- **`helpers-ts/vite.config.ts`** — ビルド出力先・base 設定
- **`helpers-ts/package.json`** — ビルドスクリプト
- **`helpers-ts/src/main.ts`** — エントリポイント
- **`helpers-ts/index.html`** — HTML テンプレート
- **`public/helpers/index.html`** — ビルド済み出力例
- **`firebase.json`** — ホスティング設定・rewrites
- **`public/helpers/src/main.ts`** (存在すれば) — プリビルド版ソース

## よくある作業パターン

### パターン A: helpers-ts の UI を修正

1. `helpers-ts/src/main.ts` を編集
2. `cd helpers-ts && npm run build`
3. `public/helpers/` に出力されたことを確認
4. `firebase deploy --only hosting`

### パターン B: Supabase 接続設定を変更

1. `helpers-ts/src/` の Supabase クライアント初期化を修正
2. `npm run dev` でローカル確認（必要に応じて Supabase アクセス環境を用意）
3. ビルド・デプロイ

### パターン C: スタイル・レイアウト変更

1. `helpers-ts/src/` の CSS/HTML を修正
2. `npm run build`
3. `firebase emulators:start --only hosting` で `http://localhost:5000/helpers/` にアクセス確認
4. デプロイ

## 外部連携ポイント

- **`@supabase/supabase-js`** — Supabase バックエンド（`helpers-ts` で使用）
- **`gas/` (Google Apps Script)** — バックエンドデータ処理。修正時は Supabase への整合性を確認。

## 開発上のルール・慣習

1. 各 `*-ts` サブプロジェクトは独立した Vite アプリ
2. `public/` は最終成果物（デプロイ対象）
3. ビルドスクリプトは `tsc && vite build`（型チェック後に bundling）
4. Firebase rewrites により SPA として動作

---

**不明点や追記して欲しい箇所があれば連絡してください。**
