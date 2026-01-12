# client-sche

## 本番 URL

- ひろば（ポータル）: https://client-sche.web.app/
- スケジュール確認: https://client-sche.web.app/helpers/
- 希望シフト記入: https://client-sche.web.app/helper-shift/

## 開発

### スケジュール確認（helpers-ts）

```bash
cd helpers-ts
npm install
npm run dev
```

## 運用（GAS）

- 運用入口：cronMain（15 分トリガー）
- 希望シフト同期：runHelperShiftSync → importHelperShiftsHereFromSupabase
- 同時実行防止：LockService 使用（cronMain 内）
