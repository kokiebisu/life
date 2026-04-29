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
./scripts/life-os-sync.sh status       # life-os との乖離確認
./scripts/life-os-sync.sh pull         # life-os/main を life に取り込む
./scripts/life-os-sync.sh contrib      # life-os に貢献できるコミットを確認
./scripts/gen-agents-md.sh             # skills/ + .ai/rules/ から AGENTS.md を再生成（Codex 用）
```

### Claude Code スキル

スキル一覧と説明は `Skill` ツールで自動展開される（`.claude/skills/<name>/SKILL.md`）。CLAUDE.md では再列挙しない。

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
```

## Git & Security

- コミット形式・PR ワークフロー → `.ai/rules/git-workflow.md`
- セキュリティガイドライン → `.ai/rules/security.md`
- 認証（OAuth token のみ / API Key 禁止）→ `.ai/rules/auth.md`

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
