# Calendar Sync ルール

## 必須: スケジュール変更時は Notion Calendar も更新する

デイリープラン・週次プラン・ルーティンなどスケジュールに関わるマークダウンファイルを作成・変更したら、**必ず Notion Calendar も同期する。**

### 具体的に

1. **新しいデイリープランを作成した場合** → プラン内のタスク・イベントを Notion に登録
2. **既存のスケジュールを変更した場合** → 変更内容を Notion に反映（追加・時間変更）
3. **イベントを別の日に移動した場合** → 移動先に新規登録

### 手順

```bash
# 既存の予定を確認（全DB統合）
bun run scripts/notion-list.ts --date YYYY-MM-DD --json
bun run scripts/notion-list.ts --date YYYY-MM-DD --db events  # イベントDBのみ

# 予定を追加（--db で対象DB指定。デフォルト: routine）
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --start HH:MM --end HH:MM
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --start HH:MM --end HH:MM --db events
bun run scripts/notion-add.ts --title "タイトル" --date YYYY-MM-DD --allday
```

### 注意

- 既存イベントは上書き・削除しない（新規追加のみ）
- マークダウンだけ更新して Notion を更新し忘れないこと
- 重複登録を避けるため、登録前に必ず既存の予定を確認する

## 必須: 週次の買い物リストを Notion に作成する

週次プラン・献立を作成したら、**買い出し用の Notion ページも作る。**
スマホから直接チェックしながら買い物できるようにする。

### ページの形式

- **件名:** `YYYY-MM-DD`（例: `2026-02-14`）
- **実施日:** 買い出し日
- **種類:** `買い出し`
- **内容（ブロック）:** 店舗ごとにセクション分け + カテゴリ別チェックリスト（to_do ブロック）
- **推定合計金額** を callout ブロックに記載

### 手順

1. 週次の献立（`aspects/diet/weekly/YYYY-MM-DD-meal-plan.md`）から買い物リストを抽出
2. 「食事」DB（`NOTION_MEALS_DB`）にページを作成し、ブロックとして買い物リストを追加
3. デイリープランの買い出し欄に Notion ページの URL を貼る
4. Notion Calendar の買い出しイベントの Description にも買い物リストページの URL を貼る

### カテゴリ例

- 肉・魚
- 卵・乳製品
- 野菜・果物
- 主食
- 豆腐・納豆
- おやつ
- 調味料（なければ）
- その他（100均など別店舗）
