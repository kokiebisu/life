# ルールファイル管理

## `.agents/rules/` への追加は自動で `.claude/rules/` に symlink される

`PostToolUse` フック（`scripts/rule-sync.sh`）が `.agents/rules/*.md` への Write/Edit を検知し、`.claude/rules/` に symlink を自動作成する。手動操作は不要。

**Why:** Claude Code は `.claude/rules/*.md` を auto-load する。`.agents/rules/` 直接ではなく `.claude/rules/` の symlink 経由でロードされるため、symlink が必要。フックで自動化済み。

**リネームの場合のみ手動対応が必要:**

`.agents/rules/<old>.md` を `<new>.md` にリネームしたら、古い symlink を手動で張り直す:

```bash
cd /workspaces/life/.claude/rules
rm <old>.md
ln -s ../../.agents/rules/<new>.md <new>.md
```
