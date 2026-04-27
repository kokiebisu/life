# Life - 人生管理リポジトリ

> GitHub を使った人生管理リポジトリ
> 日記を読んで、チームが理解して、明日のタスクが進化する。

## Quick Reference

**リポジトリ:** life（人生管理）
**言語:** 日本語（コード・ファイル名は英語）
**構造:** aspects/ 配下に生活の各側面を管理

## Commands

```bash
./dev                    # devcontainer を起動して Claude Code を開く
./scripts/notion-cron-sync.sh          # 昨日の Notion データを md に同期（cron 用）
./scripts/life-os-sync.sh status       # life-os との乖離確認
./scripts/life-os-sync.sh pull         # life-os/main を life に取り込む
./scripts/life-os-sync.sh contrib      # life-os に貢献できるコミットを確認
./scripts/gen-agents-md.sh             # skills/ + .ai/rules/ から AGENTS.md を再生成（Codex 用）
```

### Claude Code コマンド

```bash
# 食事・健康
/ask-diet                # ダイエットチームに相談
/meal                    # 食事を記録（daily + Notion meals + fridge 一括）
/kondate                 # 献立を計画（在庫ベース + Notion 登録）
/fridge-sync             # fridge.md を Notion の冷蔵庫ページに同期

# 就職活動
/ask-job-search          # 就職活動チームに相談
/interview-prep          # 技術面接の対話式学習セッション

# ジム
/gym                     # ジムセッション（plan / log）

# 学習
/study                   # 学習セッション開始・ノート記録・Notion 登録
/fukushuu                # 忘却曲線ベースの復習（スペーシドリピティション）

# 教会
/devotion                # デボーション（自動で次の章を検出）
/to-notion               # church MD ファイルを Notion に同期

# Notion・カレンダー
/from-notion             # Notion からデータ同期
/calendar                # Notion カレンダー操作
/event                   # イベント登録

# その他
/goal                    # 壁打ちして新しい目標を追加
/pr                      # 変更をグループ化してPR作成
/tidy                    # 指示ファイルの重複・配置を整理
/cache                   # キャッシュ管理（status / clear / analyze）
/learn                   # ミスからの学習・再発防止
/automate                # セッション内容を仕組み化（skill/script/rule/hook 化を計画→実装）
/analyze                 # ルール→コード リファクタリング分析
```

> **スキル自動起動（厳守）:** 「デボーションしたい」「デボーションやりたい」などの発言は即 `/devotion` スキルを起動する。章や箇所をユーザーに聞かない（スキルが自動検出する）。

## Directory Structure

```
aspects/people/me.md     # ユーザープロフィール（基本情報・キャリア・価値観・健康・恋愛）
aspects/                 # 生活の各側面（各ディレクトリに CLAUDE.md あり）
  tasks.md               # タスク管理（Inbox / Archive）
  events/                # 一回限りの予定
  daily/                 # デイリーログ
  devotions/             # デボーションノート（YYYY-MM-DD.md）
projects/sumitsugi/      # 個人プロジェクト（サブモジュール）
memory-bank/             # セッション間の記憶（decisions.md）
```

## Git & Security

- コミット形式・PR ワークフロー → `.ai/rules/git-workflow.md`
- セキュリティガイドライン → `.ai/rules/security.md`

## Fork 管理（life-os との同期）

- **upstream remote:** `life-os` → `https://github.com/kokiebisu/life-os.git`
- **personal-only の定義:** `docs/life-os-personal-policy.md` 参照
- **upstream sync:** `./scripts/life-os-sync.sh pull`
- **life-os への貢献:** `./scripts/life-os-sync.sh contrib` で対象コミットを確認 → cherry-pick で life-os に PR

## Aspects（生活の側面）

各 aspect は `aspects/` 配下。固有の指示は各 `CLAUDE.md` に記載。

| Aspect     | チーム     | 概要                                  |
| ---------- | ---------- | ------------------------------------- |
| diet       | 6人チーム  | ダイエット・健康管理 → Notion: 食事DB |
| gym        | -          | ジムセッション記録 → Notion: ジムDB   |
| guitar     | 3人チーム  | ギター練習                            |
| study      | 9人チーム  | 学習（起業・法律・技術）              |
| job/search | 6人チーム  | 就職活動                              |
| reading    | 村上葉月   | 読書記録                              |
| routine    | -          | 習慣・ルーティン → Notion: 習慣DB     |
| church     | -          | 教会関連                              |

**その他:**

- `aspects/tasks.md` — タスク管理（Inbox / Archive）
- `aspects/events/` — 一回限りの予定
- `aspects/daily/` — デイリーログ
- `projects/sumitsugi/` — 個人プロジェクト・本業（サブモジュール）

## Devcontainer

- **ランタイム:** Node.js 20, Bun
- **ツール:** Claude Code CLI, GitHub CLI
- **起動:** `./dev` スクリプトで devcontainer 起動 + Claude Code 自動開始

## 実装プラン実行

- **常に Subagent-Driven（現セッション内）で実行する。** Parallel Session は使わない
- 理由: タスクは順番依存が多く、1人リポジトリなのでワークツリー分離のメリットがない

## Memory Bank

`memory-bank/decisions.md` に設計判断とその理由を記録する。重要な判断をしたら追記すること。
