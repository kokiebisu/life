# Life OS Fork Policy

`kokiebisu/life` は `kokiebisu/life-os` の personal fork。

## life-os に含める（generic）

以下は life-os に貢献できる generic な変更:

| 対象 | 説明 |
|------|------|
| `scripts/` | Notion 連携スクリプト（setup wizard 含む）|
| `aspects/diet/CLAUDE.md`, `aspect.json` | ダイエット aspect 設定 |
| `aspects/gym/CLAUDE.md`, `aspect.json`, `profile.md` | ジム aspect 設定（個人のジム情報除く）|
| `aspects/study/CLAUDE.md`, `aspect.json` | 学習 aspect 設定 |
| `.claude/rules/` | 汎用ルール（`context.md` 除く）|
| `.claude/skills/` | 汎用スキル |
| `CLAUDE.md` | 汎用指示（personal context 除く）|
| `life.config.example.json` | 設定例 |
| `package.json`, `tsconfig.json` | 設定ファイル |
| `bun.lock` | ロックファイル |

## life のみ（personal-only）

以下は life-os に含めない:

| 対象 | 理由 |
|------|------|
| `aspects/church/` | 教会・個人的信仰 |
| `aspects/people/` | 個人の人間関係 |
| `aspects/devotions/` | 個人デボーション記録 |
| `aspects/guitar/` | 個人的趣味 |
| `aspects/sound/` | 個人的趣味 |
| `aspects/reading/` | 個人的趣味 |
| `aspects/job/` | 個人の就職活動 |
| `aspects/*/events/` | 個人の予定記録 |
| `aspects/*/daily/` | 個人の日次記録 |
| `aspects/*/logs/` | 個人のアクティビティログ |
| `planning/` | 個人のプランニング全般 |
| `profile/` | 個人プロフィール |
| `memory-bank/` | 個人の設計決定メモ |
| `.claude/rules/context.md` | 個人の状況・近況 |
| `projects/` | 個人プロジェクト（サブモジュール）|

## upstream sync 手順（life-os → life）

```bash
./scripts/life-os-sync.sh pull
```

衝突時は personal data を優先（`git checkout --ours <file>`）。

## life-os への貢献手順

```bash
# 1. 貢献できるコミットを確認
./scripts/life-os-sync.sh contrib

# 2. life-os リポジトリで cherry-pick
cd /path/to/life-os
git cherry-pick <commit-hash>
git push origin main
```
