# Church Aspect

## verses.md / messages/ 編集後（厳守）

`aspects/church/verses.md` または `aspects/church/messages/*.md` を編集したら、**確認不要で即座に `/to-notion` を実行する。** 「同期しますか？」と聞かない。

- `verses.md` → `/to-notion verses`
- `messages/*.md` → `/to-notion messages`

**prayer-requests.md は MD のみ管理。Notion 同期不要。**

## 聖書通読ステータスの確認（厳守）

bible-reading.csv や Notion の聖書通読ページを作成・更新するときは、**csv だけを信じず、必ず `aspects/church/devotions/` の最新ファイルを確認する。**

- どの書巻を読んでいるか → devotion ファイルのタイトル・本文に記録されている
- 完了しているかどうか → csv の `status` は更新が遅れることがある。devotion ファイルで実態を確認する

```bash
# 最近読んだ書巻を確認
grep -rh "^# " aspects/church/devotions/ | sort | tail -20
```

## people/ ファイルの編集ルール

church メンバーの人物ファイルは `aspects/people/<name>.md`（`relation: church`）で管理する。

`aspects/people/<name>.md` を編集するとき:

- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記。`prayer-requests.md` の Answered テーブルにも追記する。
- 新しい祈りが始まったら: 新しい `### [タイトル]（開始: YYYY-MM-DD）` セクションを追加。`prayer-requests.md` の Active テーブルも更新する。
- その人の出来事を知ったら: `## 出来事・記録` に日付付きで追記する。
- **`aspects/people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）。
