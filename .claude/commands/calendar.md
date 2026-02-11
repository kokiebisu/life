# Calendar

Google Calendar の予定を取得・追加する。

## 予定の取得

```bash
bun run scripts/gcal-list.ts              # 今日の予定
bun run scripts/gcal-list.ts --days 7     # 今後7日間
bun run scripts/gcal-list.ts --date 2026-02-14  # 指定日
```

## 予定の追加

```bash
bun run scripts/gcal-add.ts --title "タイトル" --date YYYY-MM-DD --start HH:MM --end HH:MM
bun run scripts/gcal-add.ts --title "タイトル" --date YYYY-MM-DD --allday
```

## Steps

1. ユーザーの要望を確認（取得 or 追加）
2. 適切なスクリプトを実行
3. 結果をわかりやすく表示

## 初回セットアップがまだの場合

`scripts/gcal-apps-script.js` の手順に従って Google Apps Script をデプロイし、`.env.local` に `GCAL_APPS_SCRIPT_URL` と `GCAL_SECRET` を設定する。
