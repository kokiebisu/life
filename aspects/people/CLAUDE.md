# People

人物プロファイルシステム。教会・家族・友人・仕事仲間など全ての人を管理する。

ファイル名: `aspects/people/<英語名またはローマ字>.md`

## relation ごとのテンプレート

### relation: church または family（祈り記録あり）

```markdown
# [Name]

relation: church
[関係性・背景 1〜2行]

---

## 祈り記録

### [タイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered

[祈りの内容]

**みことば:**
- [書名 章:節] — [みことばの文章]
- [書名 章:節] — [みことばの文章]

**更新:**
- YYYY-MM-DD: [変化・近況]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

### relation: friend / job / other（祈り記録なし）

```markdown
# [Name]

relation: friend / job / other
[関係性・背景 1〜2行]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

## 編集ルール

**出来事・記録:**
- その人に関する新しい情報を知ったら日付付きで追記する

**祈り記録（relation: church または family を含む場合）:**
- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記
- 新しい祈りが始まったら: 新しい `### [タイトル]（開始: YYYY-MM-DD）` セクションを追加
- church の場合は `aspects/church/prayer-requests.md` の Active/Answered テーブルも同時に更新する

**みことば（relation: church または family を含む場合）:**
- 各祈り課題に関連する聖書箇所を2箇所添える
- 形式: `- [書名 章:節] — [みことばの文章]`
- 祈りのテーマに直接応じた箇所を選ぶ（例: 進路 → 箴言3:5-6、平安 → フィリピ4:6-7）

**プロフィール・状況更新時のみことばレビュー（厳守）:**
`## プロフィール` または `## 祈り記録` の内容を変更したら、**確認不要で即座に `prayer-verse-review` スキルを実行する。**
単純な `**更新:**` への日付と近況の追記だけの場合は不要。

**`aspects/people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）
