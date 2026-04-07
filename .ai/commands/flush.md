# Flush - モバイル temp を本番に昇格

モバイルで書いた temp フォルダの MD を、正しい場所に移動して Notion に同期する。

## Temp → 本番マッピング

| Temp | 移動先 | Notion |
|------|--------|--------|
| `aspects/diet/temp/YYYY-MM-DD.md` | `aspects/diet/daily/YYYY-MM-DD.md` | meals DB |
| `aspects/devotions/temp/YYYY-MM-DD.md` | `aspects/devotions/YYYY-MM-DD.md` | devotion DB |
| `aspects/gym/temp/YYYY-MM-DD.md` | `aspects/gym/logs/YYYY-MM-DD.md` | なし |
| `aspects/people/church/temp/name.md` | ファイル内の「所属:」行でルーティング | なし |
| `aspects/people/family/temp/name.md` | `aspects/people/family/name.md` | なし |

TEMPLATE.md はスキップする。

## Steps

### 1. スキャン

以下のコマンドで処理対象ファイルを確認する:

```bash
find aspects/diet/temp aspects/devotions/temp aspects/gym/temp aspects/people/church/temp aspects/people/family/temp -name "*.md" ! -name "TEMPLATE.md" 2>/dev/null
```

ファイルが0件なら「処理するファイルはありません」と報告して終了。

### 2. プレビュー表示

各ファイルについて以下を表示:
- ファイルパス
- 移動先パス
- Notion 同期の有無
- 移動先ファイルが既に存在するか（⚠️ 既存あり / ✅ 新規）

ユーザーに確認を取る。

### 3. 各ファイルを処理

#### Diet (`aspects/diet/temp/YYYY-MM-DD.md`)

1. temp ファイルを読む
2. 移動先 `aspects/diet/daily/YYYY-MM-DD.md` が存在する場合はアペンド、なければ新規作成
3. temp ファイルの内容から食事エントリを parse（朝食/昼食/夕食）
4. 各食事エントリを Notion に登録:
   ```bash
   bun run scripts/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM
   ```
5. temp ファイルを削除

#### Devotion (`aspects/devotions/temp/YYYY-MM-DD.md`)

1. temp ファイルを読む
2. 移動先 `aspects/devotions/YYYY-MM-DD.md` が存在する場合は警告してスキップ（重複防止）
3. 移動先に移動（`mv` ではなく Read → Write → temp 削除）
4. Notion devotion DB に登録:
   ```bash
   bun run scripts/notion-add.ts --db devotion --title "デボーション" --date YYYY-MM-DD --start HH:MM --end HH:MM
   ```
   - 時間が不明な場合は `06:00-07:00` をデフォルト使用
5. `notion-update-page` の `replace_content` でページ本文を書き込む
6. `notion-update-page` で Book / Chapter / icon: 🙏 を設定
7. temp ファイルを削除

#### Gym (`aspects/gym/temp/YYYY-MM-DD.md`)

1. temp ファイルを読む
2. 移動先 `aspects/gym/logs/YYYY-MM-DD.md` が存在する場合は警告してスキップ
3. 移動先に移動（Read → Write → temp 削除）
4. Notion 同期なし
5. temp ファイルを削除

#### People - Church (`aspects/people/church/temp/name.md`)

1. temp ファイルを読む
2. ファイル内の `所属: new-hope/yokohama` または `所属: new-hope/tokyo` 行でルーティング先を決定
   - 所属行がない場合はユーザーに確認
3. 移動先 `aspects/people/church/new-hope/{yokohama|tokyo}/name.md`
4. 既存ファイルがある場合はユーザーに確認（上書き or スキップ）
5. Read → Write → temp 削除

#### People - Family (`aspects/people/family/temp/name.md`)

1. temp ファイルを読む
2. 移動先 `aspects/people/family/name.md`
3. 既存ファイルがある場合はユーザーに確認（上書き or スキップ）
4. Read → Write → temp 削除

### 4. 完了レポート

処理結果を表示:
- ✅ 処理済みファイル一覧（移動先 + Notion 登録状況）
- ⚠️ スキップしたファイルとその理由

### 5. コミット

変更をコミットする（`/pr` は実行しない）:
```
feat: flush temp files to production
```
