# People

人物プロファイルシステム。教会・家族・友人・仕事仲間など全ての人を管理する。

## ディレクトリ構造

```
aspects/people/
  church/     # 教会メンバー → 祈り記録あり
  family/     # 家族 → 祈り記録あり
  friend/     # 友人 → 祈り記録なし
  job/        # 仕事仲間 → 祈り記録なし
  other/      # その他 → 祈り記録なし
```

**ルール:** `church/` または `family/` 配下のファイルには「祈り記録」セクションを含める。

## テンプレート

### church/ または family/（祈り記録あり）

```markdown
# [Name]

[関係性・背景 1〜2行]

---

## 祈り記録

### [タイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered

[祈りの内容]

**更新:**
- YYYY-MM-DD: [変化・近況]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

### friend/ / job/ / other/（祈り記録なし）

```markdown
# [Name]

[関係性・背景 1〜2行]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

## 編集ルール

**出来事・記録:**
- その人に関する新しい情報を知ったら日付付きで追記する

**祈り記録（church/ または family/ のみ）:**
- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記
- 新しい祈りが始まったら: 新しい `### [タイトル]（開始: YYYY-MM-DD）` セクションを追加
- church の場合は `aspects/church/prayer-requests.md` の Active/Answered テーブルも同時に更新する

**`aspects/people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）
