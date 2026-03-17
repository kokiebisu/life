# /gym コマンド設計

**日付:** 2026-03-17
**ステータス:** 承認済み

---

## 概要

```
/gym plan [日付] [時間]   → ジム予定を Notion routine DB に登録
/gym log                  → 実績を Notion ジムログDB + ローカル MD に記録
```

**アーキテクチャ方針:**
- `/gym plan` はスタンダードなスケジュールエントリ → `notion-add.ts --db routine` を使用
- `/gym log` はカスタムプロパティ（種目・重量・セット数・回数）を持つ → Notion MCP（`notion-create-pages`）を直接使用。`notion-add.ts` はスタンダードな `title/date/status` 構造のみ対応のため不適

---

## 一回限りのセットアップ（実装前に必須）

### 1. Notion ジムログDB を作成する

Notion で新しいデータベースを作成し、以下のプロパティを設定する:

| プロパティ名 | 型 | 設定 |
|------------|-----|------|
| 名前 | title | - |
| 日付 | date | - |
| 種目 | select | 選択肢: ベンチプレス / スクワット / デッドリフト |
| 重量 | number | フォーマット: 数値 |
| セット数 | number | フォーマット: 数値 |
| 回数 | number | フォーマット: 数値 |
| メモ | rich_text | - |

作成後、DB の ID を取得する。

### 2. 環境変数を設定する

`.env.local` に追加:
```
NOTION_GYM_DB=<作成したジムログDBのID>
```

Skill 実行時は `.env.local` を読んで `NOTION_GYM_DB` の値を取得し、`notion-create-pages` の `database_id` パラメータに渡す。

### 3. `aspects/diet/CLAUDE.md` のディレクトリ構成表を更新する

```
| `gym-logs/YYYY-MM-DD.md` | ジムセッションの実績ログ |
```

---

## `/gym plan`

### 目的

ジムセッションの予定を Notion カレンダーに登録する。

### 登録先

**Notion routine DB**（`NOTION_TASKS_DB`）
- 理由: ジムは週3回の繰り返し習慣。routine DB は `Name / 日付 / ステータス` を持ち、特定日付のエントリ登録に対応

### 動作

1. 引数をパース
   - 日付未指定: 今日 or ユーザーに確認
   - 時間未指定: デフォルト `12:30-14:00`（`gym-menu.md` のトリガー時間 12:30 + 合計90分）
   - 開始時刻指定あり: 開始時刻 + 90分で終了時刻を計算（例: `15:00` → `16:30`）
2. `validate-entry.ts --date YYYY-MM-DD --title "ジム（BIG3）" --start HH:MM --end HH:MM` で重複チェック
3. `notion-add.ts --db routine` でページ作成（タイトル: `ジム（BIG3）`）
   - 時刻は JST 形式で渡す: `--start 2026-03-20T12:30:00+09:00 --end 2026-03-20T14:00:00+09:00`
4. `bun run scripts/cache-status.ts --clear`
5. 登録完了を報告

### 引数例

```
/gym plan             → 今日 12:30-14:00 で登録（確認あり）
/gym plan 3/20        → 3/20 12:30-14:00 で登録
/gym plan 3/20 15:00  → 3/20 15:00-16:30 で登録（開始時刻 + 90分）
```

---

## `/gym log`

### 目的

BIG3の重量・セット数・回数を記録し、プログレッシブオーバーロードの推移を追跡可能にする。

### 保存先

1. **Notion ジムログDB**（`NOTION_GYM_DB`）- 重量推移の追跡用
2. **ローカル MD**（`aspects/diet/gym-logs/YYYY-MM-DD.md`）- バックアップ・ローカル参照用

### Notion ジムログDB への登録

ジムログ DB はカスタムプロパティを持つため `validate-entry.ts`（standard schedule DBs のみ対応）は使用しない。重複チェックは `notion-search` MCP で行う。

**1セッション = 3回の `notion-create-pages` 呼び出し**（ベンチプレス・スクワット・デッドリフト各1回）

各 `notion-create-pages` 呼び出しに必ず含めるもの:
- `database_id`: `.env.local` から読んだ `NOTION_GYM_DB` の値
- `icon`: `{"type": "emoji", "emoji": "🏋️"}`
- `cover`: 適切な外部画像URL（例: Unsplash のジム系画像）
- `date:日付`: `YYYY-MM-DD` 形式（時刻なし、タイムゾーン不要）

### ローカル MD フォーマット

ファイル: `aspects/diet/gym-logs/YYYY-MM-DD.md`

```markdown
# ジムログ YYYY-MM-DD

## ベンチプレス
- 重量: 22.5kg × 15回 × 3セット

## スクワット
- 重量: 20kg × 15回 × 3セット

## デッドリフト
- 重量: 20kg × 15回 × 3セット

メモ: （体感・フォームメモ）
```

### 動作

1. 今日の日付を確認（`TZ=Asia/Tokyo date`）
2. `aspects/diet/gym-logs/` ディレクトリが未作成の場合は `mkdir -p` で作成
3. 直近セッションのログを取得（`gym-logs/` の最新ファイル）して前回の重量を提示
4. BIG3の種目ごとに重量・セット数・回数をユーザーに確認
5. `notion-search` で同日・同種目の重複確認。既存があればユーザーに確認してから登録（種目単位で判定）
6. `notion-create-pages` でジムログDB に3エントリ登録（icon・cover・NOTION_GYM_DB を設定）
7. `bun run scripts/cache-status.ts --clear`
8. ローカル MD ファイルを `aspects/diet/gym-logs/YYYY-MM-DD.md` に作成・保存
9. 「前回比」を計算して報告（例: ベンチプレス +2.5kg）

---

## ファイル構成

```
aspects/diet/gym-logs/          # 新規作成（初回 mkdir -p）
  YYYY-MM-DD.md
aspects/diet/gym-menu.md        # 既存: BIG3メニュー・方針
aspects/diet/CLAUDE.md          # 既存: gym-logs/ エントリを追加する
.claude/skills/gym/
  SKILL.md                      # スキル定義
```

**`scripts/lib/notion.ts` への変更は不要。** ジムログ DB は Notion MCP を直接使用するため、`SCHEDULE_DB_CONFIGS` への追加は行わない。

---

## スコープ外

- グラフ・チャート（Notion の折れ線グラフは非対応）
- BIG3以外の種目（将来的に拡張可能）
- 体重・体脂肪率の記録（diet チームの担当）
