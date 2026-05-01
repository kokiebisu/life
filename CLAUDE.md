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
./dev <branch>           # worktree を作って新 VS Code ウィンドウで開く（複数セッション分離用、devcontainer 内専用）
./scripts/life-os-sync.sh status       # life-os との乖離確認
./scripts/life-os-sync.sh pull         # life-os/main を life に取り込む
./scripts/life-os-sync.sh contrib      # life-os に貢献できるコミットを確認
./scripts/gen-agents-md.sh             # skills/ + .ai/rules/ から AGENTS.md を再生成（Codex 用）
bd ready -l defer --json               # defer キューの ready タスクを確認（→ /resume で再開）
```

### Claude Code スキル

スキル一覧と説明は `Skill` ツールで自動展開される（`.claude/skills` は `../skills` への symlink）。CLAUDE.md では再列挙しない。

> **スキル自動起動（厳守）:** 「デボーションしたい」「デボーションやりたい」などの発言は即 `/devotion` スキルを起動する。章や箇所をユーザーに聞かない（スキルが自動検出する）。

### Codex から `.claude/` を使う

Codex は Claude Code の `Skill` / hooks をネイティブ実行できないため、以下の互換ルールで扱う。

#### `.claude/skills`

`.claude/skills` は `../skills` への symlink。Codex は実体である `skills/<name>/SKILL.md` を読む。

- ユーザーが `/skill-name` のようにスキル名を指定した場合、または依頼内容が明らかに `skills/<name>/SKILL.md` に対応する場合は、その `SKILL.md` を読んで手順に従う
- スキル本文の相対パスは `skills/<name>/` から解決する
- `scripts/` や `assets/` などがスキル配下にある場合は、手で再実装せず既存資産を優先する
- スキルが Claude Code 専用ツールを前提にしている場合は、Codex で使える shell / MCP / repo scripts に置き換えて実行する
- 置き換え不能な場合だけ、何が使えないかを短く説明して次善策で進める

#### `.claude/hooks`

- Codex は Claude Code hooks を自動発火できない
- hooks に重要な検証・整形・同期がある場合は、hook ファイルの中身を読んで、対応する script / command を手動で実行する
- hook のロジックが長期運用に必要なら、Git hooks・GitHub Actions・`scripts/` 配下の明示コマンドへ移す提案をする

#### `.claude/rules`

- `.claude/rules` の内容は `./scripts/gen-agents-md.sh` で `AGENTS.md` に反映する
- ルールを追加・変更した場合は、可能なら `./scripts/gen-agents-md.sh` を実行して Codex 用の指示も更新する

## Directory Structure

```
aspects/people/me.md     # ユーザープロフィール（基本情報・キャリア・価値観・健康・恋愛）
aspects/                 # 生活の各側面（各ディレクトリに CLAUDE.md あり）
  tasks.md               # タスク管理（Inbox / Archive）
  events/                # 一回限りの予定
  daily/                 # デイリーログ
  devotions/             # デボーションノート（YYYY-MM-DD.md）
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

## Devcontainer

- **ランタイム:** Node.js 20, Bun
- **ツール:** Claude Code CLI, GitHub CLI
- **起動:** `./dev` スクリプトで devcontainer 起動 + Claude Code 自動開始

## 実装プラン実行

- **常に Subagent-Driven（現セッション内）で実行する。** Parallel Session は使わない
- 理由: タスクは順番依存が多く、1人リポジトリなのでワークツリー分離のメリットがない
