---
name: gym
description: ジムセッションの予定登録（/gym plan）と実績ログ記録（/gym log）。引数: $ARGUMENTS
---

# gym — ジムセッション管理

## 引数パース

`$ARGUMENTS` を確認する:
- `plan` または `plan <日付>` または `plan <日付> <時間>` → `/gym plan` フローへ
- `log` → `/gym log` フローへ
- 引数なし or 不明 → ユーザーに「plan か log を指定してください」と確認する

---

## /gym plan — ジム予定を routine DB に登録

### 日付・時刻の決定

1. `TZ=Asia/Tokyo date` で今日の日付を確認する
2. `$ARGUMENTS` から日付・時刻を抽出する:
   - 日付未指定: 今日の日付を使う（ユーザーに確認して進む）
   - 時刻未指定: デフォルトは `12:30`（開始）、`14:00`（終了）
   - 開始時刻指定あり: 終了時刻 = 開始時刻 + 90分で計算する
3. ISO8601 形式に変換する: `YYYY-MM-DDT12:30:00+09:00`（JST 必須）

### 重複チェック

```bash
bun run scripts/validate-entry.ts --date YYYY-MM-DD --title "ジム（BIG3）" --start HH:MM --end HH:MM
```

- 終了コード 1（類似エントリあり）→ ユーザーに確認してから登録するか判断する
- 終了コード 0 → 次のステップへ

### 登録

```bash
bun run scripts/notion-add.ts --db routine --title "ジム（BIG3）" --date YYYY-MM-DD --start YYYY-MM-DDT12:30:00+09:00 --end YYYY-MM-DDT14:00:00+09:00
```

### キャッシュクリア

```bash
bun run scripts/cache-status.ts --clear
```

### 完了報告

「ジム（BIG3）を [日付] [時間] で routine DB に登録しました」と報告する。

---

## /gym log — ジム実績を記録する

### 準備

1. `TZ=Asia/Tokyo date +%Y-%m-%d` で今日の日付（`DATE`）を取得する
2. `aspects/diet/gym-logs/` ディレクトリが存在しない場合は作成する:
   ```bash
   mkdir -p aspects/diet/gym-logs
   ```
3. 最新のログファイルを確認して前回の重量を取得する:
   ```bash
   ls -t aspects/diet/gym-logs/*.md 2>/dev/null | head -1
   ```
   存在する場合はそのファイルを読み、ベンチプレス・スクワット・デッドリフトの重量を抽出してユーザーに提示する。

### データ収集

BIG3の種目ごとにユーザーに確認する:

```
今日のジムログを記録します。前回: ベンチ 20kg / スクワット 20kg / デッドリフト 20kg

ベンチプレス: 重量(kg)・セット数・回数を教えてください
（例: 22.5 3 15）
```

スクワット、デッドリフトも同様に確認する。体感メモも任意で確認する。

### Notion 重複チェック

`.env.local` から `NOTION_GYM_DB` を読み取る。

Notion MCP の `notion-search` で同日・同種目のエントリを確認する:
- 検索クエリ: `ジム DATE`
- 既存エントリがあればユーザーに確認してから登録する（種目単位で判定）

### Notion ジムログDB に登録（3エントリ）

`.env.local` から `NOTION_GYM_DB` の値を取得し、Notion MCP の `notion-create-pages` を使って BIG3の各種目を1エントリずつ登録する。

各エントリのパラメータ:
- `database_id`: `NOTION_GYM_DB` の値
- `icon`: `{"type": "emoji", "emoji": "🏋️"}`
- `cover`: `{"type": "external", "external": {"url": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1200"}}`
- `title:名前`: `ジム DATE`（例: `ジム 3/17`）
- `date:日付`: `DATE`（`YYYY-MM-DD` 形式、タイムゾーン不要）
- `select:種目`: `ベンチプレス` / `スクワット` / `デッドリフト`
- `number:重量`: 重量の数値（例: `22.5`）
- `number:セット数`: セット数（例: `3`）
- `number:回数`: 回数（例: `15`）
- `rich_text:メモ`: 体感メモ（空でも可）

### キャッシュクリア

```bash
bun run scripts/cache-status.ts --clear
```

### ローカル MD を保存

`aspects/diet/gym-logs/DATE.md` を以下のフォーマットで作成する:

```markdown
# ジムログ DATE

## ベンチプレス
- 重量: Xkg × Y回 × Zセット

## スクワット
- 重量: Xkg × Y回 × Zセット

## デッドリフト
- 重量: Xkg × Y回 × Zセット

メモ: （体感メモがあれば）
```

### 前回比を計算して報告

前回ログと比較し、各種目の重量差を計算して報告する:

```
ジムログを記録しました（DATE）

| 種目 | 今回 | 前回 | 差 |
|------|------|------|-----|
| ベンチプレス | 22.5kg | 20kg | +2.5kg |
| スクワット | 20kg | 20kg | ±0 |
| デッドリフト | 20kg | 20kg | ±0 |

Notion ジムログDB ✅ / ローカル MD ✅
```

前回ログがない場合は「初回セッションです」と記載する。
