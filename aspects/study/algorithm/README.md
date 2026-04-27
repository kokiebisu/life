# algorithm — LeetCode Medium 練習

> Go で Sliding Window / DFS / BFS などのパターンを安定して書けるようにするための練習ログ。

## 運用

1. **問題を解く前に** — `patterns/<pattern>.md` の型を確認する
2. **解いたら** — `notes/YYYY-MM-DD-N.md` を作成（フロントマター必須、コーネル式キュー必須）
3. **Notion 登録** — 「勉強（トピック別）」DB（`NOTION_STUDY_TOPIC_DB`）に新規ページ作成
   - カテゴリ: `アルゴリズム`
   - トピック: 解いたパターン（`Sliding Window` 等）
   - 名前: 問題番号 + タイトル（例: `3. Longest Substring Without Repeating Characters`）
   - 日付: 解いた日
4. **notion_id を md フロントマターに書き戻す** — 以降 `/fukushuu` が復習対応
5. **patterns/ を更新** — 型に学びがあれば追記、典型問題リストにリンク追加

## ノートのフロントマター

```yaml
---
date: YYYY-MM-DD
category: algorithm
problem: "3. Longest Substring Without Repeating Characters"
leetcode_id: 3
pattern: sliding-window     # patterns/<pattern>.md と一致させる
language: go
difficulty: medium
status: solved              # solved | stuck | reviewed
time_spent_min: 25
notion_id: <UUID>           # 登録後に書き戻す
---
```

## パターン

| パターン | ファイル | 状態 |
|---|---|---|
| Sliding Window | [patterns/sliding-window.md](patterns/sliding-window.md) | 準備中 |
| DFS | [patterns/dfs.md](patterns/dfs.md) | 準備中 |
| BFS | [patterns/bfs.md](patterns/bfs.md) | 準備中 |

## 復習との連携

- `aspects/study/algorithm/notes/*.md` は `/fukushuu` の対象になる（`aspects/study/**` を Glob しているため）
- 各ノートに `❓ 自分への質問（コーネル式キュー）` セクションを必ず書く
- 復習履歴は `## 🔁 復習で詰まったところ` として md と Notion ページの両方に追記される
