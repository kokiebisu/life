# Life

GitHub を使った人生管理リポジトリ。

日記を読んで、チームが理解して、明日のタスクが進化する。
静的なチェックリストではなく、自分と一緒に成長する生きたシステム。

## 仕組み

- **Notion** でタスク・イベント・習慣・食事・ジム・ギター練習を一元管理
- **Notion Calendar**（Google Calendar 双方向同期）で閲覧
- **Claude Code** がセッション中にファイル変更を検知し、自動で worktree → PR → マージ
- マークダウンで日記・振り返り・学習ノートを記録

## ディレクトリ

```
aspects/           生活の各側面
  daily/           デイリーログ
  devotions/       デボーションノート
  events/          一回限りの予定
  tasks.md         タスク管理（Inbox / Archive）
  people/me.md     プロフィール（基本情報・キャリア・価値観・健康）
scripts/           Notion 連携・ユーティリティ
skills/            Claude Code スキル定義
docs/              設計ドキュメント
```

## アスペクト

`aspects/` 配下で生活の各側面を管理。チームがいるアスペクトは専門家ペルソナが対応する。

| アスペクト | 説明 | チーム |
|-----------|------|--------|
| [diet](aspects/diet/) | 減量・健康管理 | 6人 |
| [gym](aspects/gym/) | ジムセッション記録 | - |
| [guitar](aspects/guitar/) | ギター練習 | 3人 |
| [study](aspects/study/) | 起業・法律・技術の学習 | 9人 |
| [job](aspects/job/) | 就職・転職活動 | 6人 |
| [reading](aspects/reading/) | 読書記録 | 1人 |
| [church](aspects/church/) | 教会・音響PA | 3人 |
| [shopping](aspects/shopping/) | 買い物・冷蔵庫在庫管理 | - |
| [fashion](aspects/fashion/) | ワードローブ管理 | - |

## コマンド

```
/meal              食事を記録（daily + Notion + fridge 一括）
/kondate           献立を計画（在庫ベース）
/ask-diet          ダイエットチームに相談
/fridge-sync       冷蔵庫在庫を Notion に同期
/gym               ジムセッション（plan / log）
/study             学習セッション
/fukushuu          忘却曲線ベースの復習
/interview-prep    技術面接の対話式学習
/devotion          デボーション（次の章を自動検出）
/to-notion         church MD → Notion 同期
/calendar          Notion カレンダー操作
/event             イベント登録
/goal              壁打ちして目標を追加
/pr                変更をグループ化して PR 作成
/tidy              指示ファイルの整理
/cache             キャッシュ管理
/learn             ミスからの学習・再発防止
/analyze           ルール→コード分析
```

## セットアップ

```bash
./dev   # devcontainer 起動 → Claude Code 自動開始
```

Node.js 20 / Bun / Claude Code CLI / GitHub CLI

## 参考

- [life repo のススメ](https://zenn.dev/hand_dot/articles/85c9640b7dcc66)
- [2025年版 life repo](https://qiita.com/e99h2121/items/45c62307565458964b94)
