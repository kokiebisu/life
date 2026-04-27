# sql — SQL 学習・面接対策

> JOIN / Window / CTE / Index / Pagination / Transaction / Performance を体系的に押さえるための練習ログ。

## 運用

1. **トピックを学ぶ前に** — `patterns/<topic>.md` の型を確認する（あれば）
2. **学習したら** — `notes/YYYY-MM-DD-N.md` を作成（フロントマター必須、コーネル式キュー必須）
3. **Notion 登録** — 「勉強（トピック別）」DB（`NOTION_STUDY_TOPIC_DB`）に新規ページ作成
   - カテゴリ: `SQL`
   - トピック: 学んだ概念（`JOIN` / `Window` / `CTE` 等）
   - 名前: `SQL: <トピック>`（例: `SQL: JOIN`）
   - 日付: 学んだ日
4. **notion_id を md フロントマターに書き戻す** — 以降 `/fukushuu` が復習対応
5. **patterns/ を更新** — 型に学びがあれば追記

## ノートのフロントマター

```yaml
---
date: YYYY-MM-DD
category: sql
topic: JOIN                 # patterns/<topic>.md があれば一致させる（小文字 kebab-case）
notion_id: <UUID>           # 登録後に書き戻す
---
```

## トピック

| トピック | ファイル | 状態 |
|---|---|---|
| JOIN | [patterns/join.md](patterns/join.md) | 準備中 |
| Window 関数 | [patterns/window.md](patterns/window.md) | 未着手 |
| CTE | [patterns/cte.md](patterns/cte.md) | 未着手 |
| Index | — | 未着手 |
| Pagination | — | 未着手 |
| Transaction | — | 未着手 |
| Performance | — | 未着手 |

## 復習との連携

- `aspects/study/sql/notes/*.md` は `/fukushuu` の対象になる（`aspects/study/**` を Glob しているため）
- 各ノートに `❓ 自分への質問（コーネル式キュー）` セクションを必ず書く
- 復習履歴は `## 🔁 復習で詰まったところ` として md と Notion ページの両方に追記される
