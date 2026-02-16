# Sync from Notion

Notion → repo 逆同期。Notion 上の変更（時間変更・完了マーク・フィードバック）をリポジトリのイベントファイルに反映する。

## Steps

1. dry-run でプレビュー → ユーザーに確認
2. 実行
3. 結果報告（追加・更新・保持件数、フィードバック内容）

## Commands

```bash
# プレビュー
bun run scripts/notion-pull.ts --dry-run

# 実行
bun run scripts/notion-pull.ts

# 特定日
bun run scripts/notion-pull.ts --date $ARGUMENTS --dry-run
```
