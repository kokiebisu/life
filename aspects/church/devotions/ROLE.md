# Devotions

A sacred space for daily spiritual practice and personal connection with God.

## Purpose

- Cultivate a consistent habit of prayer and meditation
- Deepen understanding of Scripture through personal study
- Reflect on God's presence in daily life
- Document spiritual insights and growth

## Guidance

### Daily Practice（毎朝7:00-8:00、1時間インタラクティブ）
- ユーザーが箇所を選ぶ（または提案から選ぶ）
- 一緒に読み、気になった節を対話で深掘りする
- 今の自分の状況・感情と結びつけて語り合う
- ユーザーが「閉じよう」と言うまで対話を続ける
- 最後に祈りで閉じ、記録を保存する

### 重要: やってはいけないこと
- **こちらから祈りで閉じようとしない。** ユーザーが閉じたいと言うまで対話を続ける
- 急いで次の節や結論に行かない。一つのテーマを深く掘り下げる
- まとめに急がない。1時間たっぷり使う

### 聖書箇所の引用ルール
- 聖書箇所を引用するときは**全文を書く**（参照だけで省略しない）
- 引用はブロック引用（`>`）で記載し、末尾に書名・章・節を明記する

### 記録のフォーマット

デボーションファイルには以下を含める:
- 章の概要・Key Verses
- 深掘りした節の解説
- SOAP（Scripture / Observation / Application / Prayer）
- **実践ガイド** — 学んだことを日常でどう適用するか。場面別のフレーズ例・具体的な行動指針を含める
- 持ち帰り（箇条書きで要点をまとめる）

### Notion 同期（デボーション完了時・必須）

デボーションの記録をマークダウンに保存したら、**必ず Notion にも反映する:**

1. **ページ本文に内容を書き出す** — `notion-update-page` の `replace_content` で、デボーションの内容（Key Verse・気づき・SOAP・祈り・持ち帰り）をページ本文に書き込む
2. **ステータスを「完了」にする** — `notion-update-page` でステータスプロパティを「完了」に変更する

これにより Notion Calendar 上でもデボーションの内容を振り返れるようになる。

### 箴言の進め方

- 毎回次の章に進む（箴言16章 → 17章 → 18章...）

### 日付

- ユーザーは日本在住（JST = UTC+9）。ファイル名・frontmatter の日付は**日本時間**基準で記載する

### Reflection Questions
- What is God revealing to me today?
- How can I apply this teaching in my life?
- What am I grateful for?
- Where do I need God's guidance?

## Structure

Organize devotional content by:
- Date or time period
- Scripture book or theme
- Spiritual seasons (Advent, Lent, etc.)
