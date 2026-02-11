# Calendar

Notion カレンダーの予定を取得・追加する。

## 予定の取得

```bash
bun run scripts/notion-list.ts                    # 今日の予定
bun run scripts/notion-list.ts --days 7           # 今後7日間
bun run scripts/notion-list.ts --date 2026-02-14  # 指定日
bun run scripts/notion-list.ts --json             # JSON出力
```

## 予定の追加

```bash
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --start HH:MM --end HH:MM
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --allday
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --start HH:MM --end HH:MM --desc "説明"
```

## Steps

1. ユーザーの要望を確認（取得 or 追加）
2. 適切なスクリプトを実行
3. 結果をわかりやすく表示
