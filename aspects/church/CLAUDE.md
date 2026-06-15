# Church Aspect

## verses.md / messages/ 編集後（厳守）

`aspects/church/verses.md` または `aspects/church/messages/*.md` を編集したら、**確認不要で即座に `/to-notion` を実行する。** 「同期しますか？」と聞かない。

- `verses.md` → `/to-notion verses`
- `messages/*.md` → `/to-notion messages`

**prayer-requests.md は MD のみ管理。Notion 同期不要。**

## messages 同期の責務範囲（厳守）

`notion-sync-messages.ts` はページ**本文（ブロック）のみ**を MD から同期する。**タイトル・シリーズ・テーマ・日付などのプロパティは一切触らない。**

- タイトル（例: "Sunday Service" / "Good Friday Service"）はカレンダー同期・手動設定が source of truth
- シリーズ・テーマなどのプロパティも手動管理
- 対応する Notion ページが存在しない日の MD はスキップ（スクリプトでページ作成しない）

## 聖書通読ステータスの確認（厳守）

bible-reading.csv や Notion の聖書通読ページを作成・更新するときは、**csv だけを信じず、必ず `aspects/devotions/` の最新ファイルを確認する。**

- どの書巻を読んでいるか → devotion ファイルのタイトル・本文に記録されている
- 完了しているかどうか → csv の `status` は更新が遅れることがある。devotion ファイルで実態を確認する

```bash
# 最近読んだ書巻を確認
grep -rh "^# " aspects/devotions/ | sort | tail -20
```

## people/ ファイルの編集ルール

church メンバーの人物ファイル（`aspects/people/<name>.md`、`relation: church`）の編集ルールは
[aspects/people/CLAUDE.md](../people/CLAUDE.md) を参照。

church 固有の追加ルール: 祈り記録の追加・Answered 化と同時に `aspects/church/prayer-requests.md` の Active/Answered テーブルも更新する。

## 写真・手書きメモからの転記（厳守）

写真からメッセージノートを起こすとき、**タイトル・聖書箇所番号など後で修正コストが発生する重要な情報が読み取れない・確信が持てない場合は、断定せずに「（要確認）」を付けてユーザーに確認してから記録する。**

- ❌ 悪い例: 推測でタイトルを書いてコミット → 後で修正 PR が必要になる
- ✅ 良い例: タイトルが読み取れなければ「タイトルは読み取れませんでした（要確認）」と伝えてから作成する

**過去のミス（2026-06-14）:** 写真の字が密集していてタイトルを誤読。「絶好調の落とし穴」を「恵みを返しなさい」と書いてコミット・Notion 同期した後、修正 PR が必要になった。
