# Notion ワークフロー

## 基本方針

- **全イベント・タスクを Notion データベースで管理**（Google Calendar 不要）
- Notion Calendar で閲覧（Google Calendar と双方向同期）
- タスクには Feedback 欄あり → 翌日 API で取得して次の日のスケジュールに反映

## 操作ルール

- **Notion 時間変更時: 前後の予定も連鎖チェックし、かぶりがあれば全部まとめて調整する**（1個ずつ直さない）
- **Notion タスク追加時: 必ず時間（--start/--end）と詳細説明（--desc）を入れる**（--allday は使わない）

## Notion DB 体制

### Schedule DBs（ScheduleDbConfig — カレンダー型・日付クエリ対応）

| DB | 環境変数 | プロパティ | 対応ディレクトリ |
|----|---------|-----------|----------------|
| 習慣 | `NOTION_TASKS_DB` | Name / 日付 | `aspects/routine/` |
| イベント | `NOTION_EVENTS_DB` | 名前 / 日付 | `planning/events/` |
| ギター | `NOTION_GUITAR_DB` | 名前 / 日付 | `aspects/guitar/` |
| 食事 | `NOTION_MEALS_DB` | 件名 / 実施日 | `aspects/diet/` |

### Article DB（ArticleDbConfig）

- `NOTION_ARTICLES_DB` — タイトル / ソース / URL / Aspect / Status

### Investment DB（InvestmentDbConfig）

- `NOTION_INVESTMENT_DB` — Investment / Buy Date / Status / Type / Notes

### 廃止済み

- Journal DB（2026-02-13 廃止）、`notion-journal.ts` も削除済み

## スクリプト

- **共通ライブラリ:** `scripts/lib/notion.ts`（ScheduleDbConfig / ArticleDbConfig / InvestmentDbConfig 抽象化・normalizePages 等）
- `notion-add.ts` — 予定追加（--db 対応）
- `notion-list.ts` — 全 DB 統合一覧 / --db 対応
- `notion-daily-plan.ts` — 全 DB 読取
- `notion-sync-event-file.ts` — パスベース DB 解決
- `sumitsugi-sync-events.ts` — events DB へ同期
- `notion-backfill-icons.ts` — 全 DB 対応
