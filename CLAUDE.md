# Life - 人生管理リポジトリ

> GitHub を使った人生管理リポジトリ

## Quick Reference

**リポジトリ:** life（人生管理）
**言語:** 日本語（コード・ファイル名は英語）
**構造:** aspects/ 配下に生活の各側面を管理

## Commands

```bash
./dev                    # devcontainer を起動して Claude Code を開く
```

### Claude Code コマンド

```bash
# チーム相談
/ask:diet                # ダイエットチームに相談
/ask:job:search          # 就職活動チームに相談

# 開発ワークフロー
/pr                      # 変更をグループ化してPR作成
/plan                    # 実装計画を立てる（確認後に実行）
/code-review             # セキュリティ・品質レビュー
/cleanup-branches        # マージ済みブランチを削除
/learn                   # セッションからパターンを抽出・保存
```

## Directory Structure

```
aspects/
├── church/              # 教会関連
├── diary/               # 日記・振り返り
├── diet/                # ダイエット・健康管理（チーム対応）
├── guitar/              # ギター練習
├── job/                 # 就職・転職活動（チーム対応）
├── reading/             # 読書記録
└── tsumugi/             # 個人プロジェクト（サブモジュール）
```

## Git Workflow

### Commit Message Format

```
<type>: <description>
```

Types: feat, fix, refactor, docs, chore

### PR 作成

- `/pr` コマンドで論理的にグループ化されたPRを作成
- 1つの論理的変更につき1つのPR
- Conventional Commits 形式のタイトルを使用
- 詳細は `.claude/rules/git-workflow.md` を参照

## Aspects（生活の側面）

各 aspect は `aspects/` 配下のディレクトリで管理。aspect 固有の Claude 指示は各ディレクトリの `CLAUDE.md` に記載。

### チーム対応 aspect

- **diet** - ダイエットサポートチーム（栄養士、トレーナー、心理学者など）
- **job/search** - 就職活動サポートチーム（履歴書、面接、交渉など）

### サブモジュール

- **tsumugi** - 個人開発プロジェクト（独立した git リポジトリ）

## Claude Code & Devcontainer

### Devcontainer

- **ランタイム:** Node.js 20, Bun
- **ツール:** Claude Code CLI, GitHub CLI, Starship prompt
- **認証:** `~/.claude`, `~/.ssh`, `~/.config/gh` がホストからマウントされ永続化
- **起動:** `./dev` スクリプトで devcontainer 起動 + Claude Code 自動開始

### 新しい aspect の追加

1. `aspects/<name>/` ディレクトリを作成
2. 必要に応じて `CLAUDE.md` を追加（チーム構成、対応方針など）
3. 必要に応じて `.claude/commands/ask:<name>.md` にスキルを追加
4. `README.md` のテーブルを更新

## Security

- `.env` ファイルや認証情報をコミットしない
- 個人情報（住所、電話番号など）は Issue やコメントで管理し、リポジトリにはコミットしない
- 詳細は `.claude/rules/security.md` を参照
