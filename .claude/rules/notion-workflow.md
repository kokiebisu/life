# Notion ワークフロー

## 基本方針

- **全イベント・タスクを Notion データベースで管理**
- Notion Calendar で閲覧（Google Calendar と双方向同期）
- タスクには Feedback 欄あり → 翌日 API で取得して次の日のスケジュールに反映

## 操作ルール

- **時間変更時: 前後の予定も連鎖チェックし、かぶりがあれば全部まとめて調整する**
- **タスク追加時: 必ず時間（--start/--end）と詳細説明（--desc）を入れる**（--allday は使わない）
- **完了済タスクの追加時**（「〜してた」「〜やった」等）→ ステータスを「完了」にセットする

## DB の使い分け

- **routine（習慣）**: 繰り返しやる活動。毎日・毎週やるもの（Devotion、ギター練習、sumitsugi開発など）
- **events（イベント）**: 一回限りの予定（飲み会、面談、見学など）
- 迷ったら「今後も繰り返すか？」で判断。繰り返すなら routine

## Notion DB 体制

### Schedule DBs

| DB | 環境変数 | プロパティ |
|----|---------|-----------|
| 習慣 | `NOTION_TASKS_DB` | Name / 日付 |
| イベント | `NOTION_EVENTS_DB` | 名前 / 日付 |
| ギター | `NOTION_GUITAR_DB` | 名前 / 日付 |
| 食事 | `NOTION_MEALS_DB` | 件名 / 実施日 |

### Other DBs

- `NOTION_ARTICLES_DB` — 記事（タイトル / ソース / URL / Aspect / Status）
- `NOTION_INVESTMENT_DB` — 投資（Investment / Buy Date / Status / Type / Notes）

## スクリプト一覧

共通ライブラリ: `scripts/lib/notion.ts`

CLI コマンドの使い方は `/calendar` コマンドを参照。
