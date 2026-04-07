# Notion ワークフロー

## notion-list で見つからない場合（厳守）

`notion-list.ts` はスケジュール系 DB のみ対象。**ジム DB など対象外の DB は表示されない。**

- `notion-list.ts` で見つからなくても「存在しない」と判断しない
- ユーザーが「Notion にある」と言ったら、`notion-search` で再検索するか、ユーザーに URL を確認する前に `notion-search` を試みる

## タイトル正規化（厳守）

`notion-add.ts` にはタイトル正規化機能が組み込まれている。**タイトルを手動で決める前に `scripts/notion-add.ts` の `TITLE_KEYWORD_LIST` を参照し、既存の canonical タイトルに合わせること。**

- 「開発」「コーディング」「実装」「life-os」→ `開発`
- 「ジム」「筋トレ」「トレーニング」→ `ジム`
- 「勉強」「学習」→ `勉強`
- 「ギター」「練習」→ `ギター練習`
- 「買い出し」「買い物」→ `買い出し`
- 他のキーワードは `TITLE_KEYWORD_LIST`（[scripts/notion-add.ts](../../scripts/notion-add.ts)）で確認する

`notion-add.ts` 経由であれば自動適用される。`notion-create-pages` など MCP 直接登録の場合は**手動で確認・統一すること。**

## Job DB（`NOTION_JOB_DB`）の会社名セット（厳守）

job DB にエントリを作成・更新する際は、**必ず `profile/career.md` の「現在の所属 > 会社名」を読んで `会社名` プロパティにセットすること。**

- 求職中の場合: `会社名` は設定しない（空欄）か、面接先の企業名をセット
- 入社後: `profile/career.md` を更新してから job DB エントリを作成

**Job DB プロパティ一覧:**

| プロパティ | 型     | 選択肢                                     |
| -------- | ------ | ------------------------------------------ |
| 名前     | title  | —                                          |
| 日付     | date   | —                                          |
| 会社名   | select | kickflow株式会社 / フリーランス / その他    |
| 種別     | select | 面接 / 業務 / カジュアル面談 / その他       |

## プロパティ名エラー時の対応（厳守）

`notion-update-page` で `"Property not found"` エラーが出たら、**必ず `notion-fetch` でDBスキーマを確認してから正しいプロパティ名でリトライする。** エラーを無視して先に進まない。

## Notion MCP サーバー名

- `ReadMcpResourceTool` のサーバー名は **`claude.ai Notion`**（スペース・ドット入り）
- ツール名の `mcp__claude_ai_Notion__*` と混同しないこと

## 日時のタイムゾーン（厳守）

Notion MCP (`notion-update-page`) で日時プロパティを設定するとき、**必ず `+09:00`（JST）を付ける。** タイムゾーンなしで渡すと UTC 扱いになり、カレンダー上で9時間ずれる。

```
// ✅ OK: +09:00 を明示 → 正しく 10:00 JST になる
"date:日付:start": "2026-02-21T10:00:00+09:00"
```

- `notion-update-page` の `date:*:start` / `date:*:end` すべてが対象
- 日付のみ（時刻なし）の場合は `2026-02-21` で OK（タイムゾーン不要）
- **時刻を含む場合は例外なく `+09:00` を付けること**

## notion-pull dry-run の確認（厳守）

`notion-pull.ts --dry-run` の出力に以下の異常が含まれる場合、**実行前にユーザーに確認する。** そのまま実行しない。

- 時刻が `24:xx` 以降（例: `26:43`）
- 移動時間が 120分 超
- 開始時刻が元の予定より大幅に早い（2時間以上）

## キャッシュ（厳守）

- `notion-update-page` や `notion-add.ts` で時間変更・更新した後、`notion-list.ts` で確認する前に必ず `bun run scripts/cache-status.ts --clear` を実行する

## 操作ルール

- **新規ページには必ずアイコンとカバー画像をつける**
- **完了済みのページは基本いじらない**
- **時間変更時: 前後の予定も連鎖チェック**
- **タスク追加時: 必ず時間（--start/--end）を入れる**（--allday フラグは廃止済み。エラーが出ても --allday で逃げず、ユーザーに時間を確認する）
- **説明・詳細はページ本文に書く**（後述「ページ本文ルール」参照）
- **完了済タスクの追加時**（「〜してた」等）→ ステータスを「完了」にセット
- **同名エントリがある場合は確認する**
- **重複エントリ防止**: 登録前に `notion-list.ts --date` で既存エントリを取得
- **日付未設定の既存ページに注意**: `notion-fetch` でDB を確認するか、ユーザーに確認する

## DB の使い分け

- **events**: 行事・集まり（人と会う、参加する予定）
- **todo**: やらないといけないこと（タスク、作業、手続き）
- **devotion**: デボーション・習慣（繰り返しやるもの）
- **その他**: 実績ログ・作業記録（「〜してた」「〜やってた」など、タスクではない活動記録）

**迷ったときの判断基準:**
- 「行事・集まり？」→ Yes なら events
- 「やらないといけないこと？」→ Yes なら todo
- 「繰り返しやる？」→ Yes なら devotion
- 「〜してた（実績）？」→ Yes なら **その他**（todo ではない）

詳しい間違えやすい例は `/event` コマンド参照。

## md の配置場所と Notion DB は独立（厳守）

**Notion の登録先 DB は、ファイルの配置場所ではなく内容で判断する。**

- `events/` ファイルにタスク（手続き・作業・確認）が書いてあっても → **todo DB**
- `tasks.md` に書いてあるイベント的なものがあっても → **events DB**

ファイルの置き場所に引きずられて DB を選ばないこと。

## ページ本文ルール（Description プロパティ廃止）

**DB の Description / 説明プロパティは使わない。** 内容はすべてページ本文に書く。

- `--desc` オプションは廃止済み。`notion-add.ts` に渡しても無視される
- 説明・詳細・レシピ・レッスン内容などは、ページ作成後に `notion-update-page` の `replace_content` でページ本文に書き込む
- **手順:** `notion-add.ts` → ページ ID 取得 → `notion-update-page`（`replace_content`）で本文を書く

## 既存ページの確認（厳守）

Notion にページを**新規作成する前に**、必ず既存ページの存在を確認する。検索でヒットしなくても存在する場合がある（JST/UTC ズレで日付フィルターが機能しないケースなど）。

- `notion-search` でヒットしない場合でも、**`notion-list.ts --date` または DB を `notion-fetch` で直接確認**してから判断する
- md ファイルがすでに存在する場合（`/devotion` 等で作成済み）は、対応する Notion ページも存在する可能性が高い
- **`validate-entry.ts` は類似タイトルの検出のみ。** 既存ページへの追記が必要なケースは検出できない。必ず `notion-list.ts --date` で確認し、既存ページがあれば新規作成せず**そのページに追記する**

## 重複バリデーション（厳守）

Notion にスケジュール系エントリ（devotion / events / todo / meals / groceries / guitar / sound / study）を **直接登録する前に**、必ず `validate-entry.ts` を実行する:

```
bun run scripts/validate-entry.ts --date YYYY-MM-DD --title "タイトル" --start HH:MM --end HH:MM
```

- **終了コード 1** → 類似エントリあり。登録中止。ユーザーに確認する
- **終了コード 0** → 問題なし。登録してよい
- `notion-add.ts` 経由の場合は内部で自動チェックされるため不要
- Notion MCP (`notion-create-pages` / `notion-update-page`) で直接登録する場合は**必ず実行すること**

CLI コマンドの使い方は `/calendar` コマンドを参照。
