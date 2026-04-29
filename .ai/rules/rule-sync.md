# ルールファイル管理

## `.ai/rules/` 追加時は `.claude/rules/` に symlink を張る（厳守）

`.ai/rules/<new>.md` を新規追加したら、**必ず `.claude/rules/<new>.md` に symlink を張る。**

```bash
cd /workspaces/life/.claude/rules
ln -s ../../.ai/rules/<new>.md <new>.md
```

**Why:** Claude Code は `.claude/rules/*.md` を auto-load する。`.ai/rules/` 直接ではなく `.claude/rules/` の symlink 経由でロードされるため、symlink が無いとルールが認識されない。

**How to apply:**

- `.ai/rules/` に `Write` で新ファイル作成 → 直後に `.claude/rules/` に symlink を張る
- `.ai/rules/<old>.md` を `<new>.md` にリネームしたら、`.claude/rules/` 側の symlink も張り直す
- 動作確認: 次のセッション開始時に system-reminder のロード一覧に新ルールが含まれるか確認

**過去の漏れ:** Phase 1 (PR #614) で `session-spawn.md` を追加したが symlink を忘れ、ルールが認識されないまま「復習したい」発言で spawn せず /fukushuu 起動した（2026-04-29）
