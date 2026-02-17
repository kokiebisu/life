# Notion ワークフロー

## Notion MCP サーバー名

- `ReadMcpResourceTool` のサーバー名は **`claude.ai Notion`**（スペース・ドット入り）
- ツール名の `mcp__claude_ai_Notion__*` と混同しないこと

## 日時のタイムゾーン（厳守）

Notion MCP (`notion-update-page`) で日時プロパティを設定するとき、**必ず `+09:00`（JST）を付ける。** タイムゾーンなしで渡すと UTC 扱いになり、カレンダー上で9時間ずれる。

```
// ❌ NG: タイムゾーンなし → UTC として解釈され 19:00 JST になる
"date:日付:start": "2026-02-21T10:00"

// ✅ OK: +09:00 を明示 → 正しく 10:00 JST になる
"date:日付:start": "2026-02-21T10:00:00+09:00"
```

- `notion-update-page` の `date:*:start` / `date:*:end` すべてが対象
- 日付のみ（時刻なし）の場合は `2026-02-21` で OK（タイムゾーン不要）
- **時刻を含む場合は例外なく `+09:00` を付けること**

## 基本方針

- **全イベント・タスクを Notion データベースで管理**
- Notion Calendar で閲覧（Google Calendar と双方向同期）
- タスクには Feedback 欄あり → 翌日 API で取得して次の日のスケジュールに反映

## 操作ルール

- **新規ページには必ずアイコンとカバー画像をつける**: スクリプト経由なら `pickTaskIcon` + `pickCover` を使う。Notion MCP（`notion-create-pages`）で直接作成する場合も `icon`（emoji）と `cover`（外部画像URL）を指定する
- **完了済みのページは基本いじらない**: ステータスが「完了」のエントリは、ユーザーから明示的に指示がない限り内容・プロパティを変更しない
- **時間変更時: 前後の予定も連鎖チェックし、かぶりがあれば全部まとめて調整する**
- **タスク追加時: 必ず時間（--start/--end）を入れる**（--allday は使わない）
- **説明・詳細はページ本文に書く**（後述「ページ本文ルール」参照）
- **完了済タスクの追加時**（「〜してた」「〜やった」等）→ ステータスを「完了」にセットする
- **同名エントリがある場合は確認する**: 同名のエントリが既にある場合、既存エントリを勝手に移動・変更せず「同じ名前のエントリがあるけど、新しく追加していい？」とユーザーに確認する
- **重複エントリ防止**: 登録前に `notion-list.ts --date YYYY-MM-DD --json` で既存エントリを取得。同名・同内容があれば `notion-update-page` で更新、ない場合のみ新規登録
- **日付未設定の既存ページに注意**: DB によっては日付未設定のページが既に存在する場合がある（例: ギター DB のレッスンページ）。`notion-list.ts --date` では日付未設定ページは表示されないため、**新規作成する前に Notion MCP（`notion-fetch` でDB を確認するか、ユーザーに既存ページの有無を確認する）**。日付を入れるだけで済む場合は `notion-update-page` でプロパティを更新する

## DB の使い分け

- **events**: 行事・集まり（人と会う、参加する予定）
- **todo**: やらないといけないこと（タスク、作業、手続き）
- **routine**: 繰り返しやること（毎日・毎週やるもの）

**迷ったときの判断基準:**
- 「行事・集まり？」→ Yes なら events
- 「やらないといけないこと？」→ Yes なら todo
- 「繰り返しやる？」→ Yes なら routine

### 間違えやすい例（重要）

**デスクワーク・書類手続き系は必ず todo DB に入れる:**
- ❌ 間違い: 「証明書XMLダウンロード」を events DB に登録
- ✅ 正解: 「証明書XMLダウンロード」は todo DB に登録
- events DB は**物理的に人と会う or 場所に行く予定**に限定する
- パソコン作業・申請・書類整理・ダウンロード等は全て todo DB

**電話・窓口での問い合わせ・手続きも todo DB に入れる:**
- ❌ 間違い: 「国保の保険料を試算してもらう（役所の窓口 or 電話）」を events DB に登録
- ✅ 正解: 「国保の保険料を試算してもらう」は todo DB に登録
- **窓口に行く日時が確定していても todo DB に入れる**（events DB には移動しない）
- 手続き・申請・問い合わせは全て todo DB で管理する

## Notion DB 体制

### Schedule DBs

| DB       | 環境変数              | プロパティ  | ステータス | 用途                             |
| -------- | --------------------- | ----------- | ---------- | -------------------------------- |
| 習慣     | `NOTION_TASKS_DB`     | Name / 日付 | ステータス | 繰り返しルーティン               |
| イベント | `NOTION_EVENTS_DB`    | 名前 / 日付 | ステータス | 一回限りの予定                   |
| ギター   | `NOTION_GUITAR_DB`    | 名前 / 日付 | ステータス | ギター練習・レッスン             |
| 食事     | `NOTION_MEALS_DB`     | 名前 / 日付 | ステータス | 食事メニュー（調理・食べるもの） |
| 買い出し | `NOTION_GROCERIES_DB` | 件名 / 日付 | ステータス | 買い出し・買い物                 |

### Other DBs

- `NOTION_ARTICLES_DB` — 記事（タイトル / ソース / URL / Aspect / Status）
- `NOTION_INVESTMENT_DB` — 投資（Investment / Buy Date / Status / Type / Notes）

## ページ本文ルール（Description プロパティ廃止）

**DB の Description / 説明プロパティは使わない。** 内容はすべてページ本文に書く。

- `--desc` オプションは廃止済み。`notion-add.ts` に渡しても無視される
- 説明・詳細・レシピ・レッスン内容などは、ページ作成後に `notion-update-page` の `replace_content` でページ本文に書き込む
- **手順:** `notion-add.ts` → ページ ID 取得 → `notion-update-page`（`replace_content`）で本文を書く

## Notion 操作の安全ルール

### Notion ページ ID の取り違え防止

複数エントリを一括更新するとき、**更新前に ID→タイトルの対応表を書き出して確認する。** UUID の目視コピーは取り違えやすいため、JSON 出力から ID を拾うときは必ずタイトルとセットで扱う。

### スクリプト実行前に構文を確認する

- `notion-add.ts` 等を呼ぶ前に、必ず正しい引数形式を使う（`--title` 必須）
- 構文が不明なら `--help` や使い方コメントを確認してから実行する
- **間違った構文で試行錯誤しない** — 誤実行が副作用を起こすリスクがある

### 実行後に必ず結果を検証する

- `notion-add.ts` でエントリを追加した後、`notion-list.ts --date` で**追加した対象だけでなく、同じ日の全エントリ**を確認する
- 既存エントリが意図せず消えていないか確認する
- 異常があれば即座にユーザーに報告し、Notion MCP で復旧する

### 削除時はページごと完全削除する

- ユーザーが「消して」「削除して」と言った場合、**日付クリアではなくページごとゴミ箱に入れる**
- ページ削除は `notion-delete.ts` を使う: `bun run scripts/notion-delete.ts <page-id>`
- 複数ページの一括削除にも対応: `bun run scripts/notion-delete.ts <id1> <id2> ...`

### 類似名エントリに注意する

- 「Aパーティ」と「Aパーティ買い出し」のように名前が似たエントリを扱うとき、重複検出の誤判定に注意する
- 重複検出でスキップされた場合、本当に同一エントリか（名前・時間が完全一致か）を確認する
- 誤判定でブロックされたら、Notion MCP（`notion-create-pages`）で直接登録する

### 予定の日付変更・前倒し（重要）

- 既存のページがある場合、**新しくページを作成せず、既存ページを更新する**
- 予定を前倒ししたり日付を変更する場合、`notion-update-page` でプロパティを更新すれば、アイコンやその他の属性も保持される
- **間違った手順:** 日付クリア → 新規作成 → 削除 → 元に戻す
- **正しい手順:** 既存ページの日付・ステータスを直接更新する

## notion-pull 対象 DB

`notion-pull.ts` は以下の DB を Notion → ローカルファイルに逆同期する:

| DB        | 同期先ファイル                         |
| --------- | -------------------------------------- |
| events    | `planning/events/YYYY-MM-DD.md`        |
| guitar    | `aspects/guitar/events/YYYY-MM-DD.md`  |
| meals     | `aspects/diet/events/YYYY-MM-DD.md`    |
| routine   | `aspects/routine/events/YYYY-MM-DD.md` |
| groceries | `aspects/diet/groceries/YYYY-MM-DD.md` |
| todo      | `planning/tasks.md`（Inbox / Archive） |

- 完了ステータスの判定: `"Done"` or `"完了"` → `[x]` にマーク
- routine DB のステータスプロパティは `ステータス`（日本語）。`Status`（英語）ではない

## スクリプト一覧

共通ライブラリ: `scripts/lib/notion.ts`

CLI コマンドの使い方は `/calendar` コマンドを参照。
