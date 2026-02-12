# Life - 人生管理リポジトリ

> GitHub を使った人生管理リポジトリ

## Quick Reference

**リポジトリ:** life（人生管理）
**言語:** 日本語（コード・ファイル名は英語）
**構造:** aspects/ 配下に生活の各側面を管理

## Commands

```bash
./dev                    # devcontainer を起動して Claude Code を開く
./scripts/tsumugi-sync.sh            # tsumugi ↔ LIFE タスク同期
./scripts/tsumugi-sync.sh --dry-run  # 同期プレビュー（変更なし）
```

### Claude Code コマンド

```bash
# チーム相談
/ask:diet                # ダイエットチームに相談
/ask:job:search          # 就職活動チームに相談

# タスク同期
/sync:tsumugi            # tsumugi ↔ LIFE Linear タスク同期

# 目標管理
/goal                    # 壁打ちして新しい目標を追加

# 開発ワークフロー
/pr                      # 変更をグループ化してPR作成
```

## Directory Structure

```
profile/
├── basic.md             # 基本情報・居住・生活リズム・信仰・趣味
├── health.md            # 身体・ダイエット・ジム・食事
├── career.md            # 職歴・スキル・tsumugi・財務
├── love.md              # 恋愛・結婚・ラブタイプ分析
└── personality.md       # 価値観・人生の軸・ビジョン
aspects/
├── church/              # 教会関連
├── diary/               # 日記・振り返り
├── diet/                # ダイエット・健康管理（チーム対応）
├── fukuoka/             # 福岡移住検討（チーム対応）
├── guitar/              # ギター練習（チーム対応）
├── investment/          # 投資（チーム対応）
├── job/                 # 就職・転職活動（チーム対応）
├── planning/            # ライフプランニング（横断管理）
├── reading/             # 読書記録（チーム対応）
├── study/               # 学習（起業・法律・技術）（チーム対応）
└── tsumugi/             # tsumugi関連イベント・記録
projects/
└── tsumugi/             # 個人プロジェクト（サブモジュール）
memory-bank/
├── project-context.md   # プロジェクト全体の背景・目的
├── active-context.md    # 現在進行中の作業・フォーカス
├── decisions.md         # 設計判断とその理由の記録
├── patterns.md          # うまくいったパターン・避けるべきパターン
└── progress.md          # 各 aspect の進捗・状態
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

- **diet** - ダイエットサポートチーム（栄養士、トレーナー、心理学者など6人）
- **guitar** - ギターチーム（瀬戸涼介、黒田奏、橋本海の3人）
- **investment** - 投資チーム（Buffett, Munger, Thiel, Wood, Dalio, Soros, Fisher, Marks の8人）
- **study** - 学習チーム（起業メンター5人 + 法律メンター1人 + 技術メンター3人）
- **job/search** - 就職活動サポートチーム（履歴書、面接、交渉など）
- **fukuoka** - 福岡移住アドバイザー（田中誠）
- **reading** - 読書ナビゲーター（村上葉月）
- **planning** - ライフコーチ（松本あかり）- 全aspect横断管理

### サブモジュール

- **tsumugi** - 個人プロジェクト（本業。開発+営業。独立した git リポジトリ）

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

## Memory Bank

`memory-bank/` はセッション間で文脈を引き継ぐための記憶システム。

### 運用ルール

- **セッション開始時:** `memory-bank/` のファイルを読んで現在の文脈を把握する
- **セッション中:** 重要な決定や発見があれば該当ファイルに追記する
- **セッション終了時:** `active-context.md` を更新して次回に引き継ぐ

### ファイルの役割

| ファイル | 更新タイミング | 内容 |
|---------|--------------|------|
| `project-context.md` | 構造変更時 | プロジェクト背景・ユーザー情報 |
| `active-context.md` | 毎セッション | 現在の作業・次にやること |
| `decisions.md` | 判断時 | 設計判断と理由 |
| `patterns.md` | 発見時 | 効果的/非効果的なパターン |
| `progress.md` | 進捗時 | aspect ごとの進捗状態 |

## Security

- `.env` ファイルや認証情報をコミットしない
- 個人情報（住所、電話番号など）は Issue やコメントで管理し、リポジトリにはコミットしない
- 詳細は `.claude/rules/security.md` を参照
