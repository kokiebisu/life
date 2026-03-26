# Gym Aspect

このディレクトリはジムセッションの記録と管理を担当します。

## ディレクトリ構成

| パス | 内容 |
|------|------|
| `logs/YYYY-MM-DD.md` | ジムセッション実績ログ |
| `gyms/<chain>/<location>.md` | ジムのマシン一覧・設備情報 |
| `profile.md` | ジム会員情報・個人目標 |
| `../goal.md` | 共有目標（diet と gym が参照） |

## メニュー生成

静的なメニューファイルは持たない。`/gym plan` 実行時に以下を動的参照してメニューを決定する:

1. `logs/` の直近3日のログ → 前回の種目・重量・フィードバック
2. `gyms/<location>.md` → 利用可能なマシン一覧
3. `../goal.md` → 現在の目標（重量・体組成）

## ログフォーマット

`logs/YYYY-MM-DD.md`:

```markdown
# ジムログ YYYY-MM-DD

## 種目名
- 重量: Xkg × Y回 × Zセット

メモ: （体感メモ）
```

詳細な操作手順は `.claude/skills/gym/SKILL.md` を参照。
