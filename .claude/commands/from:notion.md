# Sync from Notion

Notion → repo 逆同期。Notion 上の変更（時間変更・完了マーク・フィードバック）をリポジトリのイベントファイルに反映する。

## 自動エンリッチ機能

pull 時に以下を自動検出・補完する:

- **移動時間**: `@ 場所名` を含むイベントの移動時間を自動計算し、Notion の日付・開始時間・終了時間・場所プロパティを更新
- **アイコン・カバー**: 未設定のページにアイコンとカバー画像を自動追加

`--no-enrich` でスキップ可能。dry-run でもエンリッチのプレビューが表示される。

## 重複解決（Conflict Resolution）

pull 後、`schedule.json` の `conflictRules` に基づいて自動解決された `conflictResolutions` を確認:

- `delete` → `notion-delete.ts` で Notion ページ削除
- `shift` → `notion-update-page` で時間変更
- `shrink` → `notion-update-page` で時間変更

## Steps

1. dry-run でプレビュー → ユーザーに確認
2. 実行
3. 結果報告（追加・更新・保持・エンリッチ件数、フィードバック内容）

## Commands

```bash
# プレビュー
bun run scripts/notion-pull.ts --dry-run

# 実行
bun run scripts/notion-pull.ts

# 特定日
bun run scripts/notion-pull.ts --date $ARGUMENTS --dry-run

# エンリッチなし
bun run scripts/notion-pull.ts --no-enrich
```
