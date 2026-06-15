#!/usr/bin/env bash
# PostToolUse hook: .agents/rules/ に新規ファイルが追加されたら .claude/rules/ に symlink を自動作成
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# stdin から tool_input の file_path を取得
file_path=$(cat | python3 -c "
import json, sys
data = json.load(sys.stdin)
tool_input = data.get('tool_input', {})
print(tool_input.get('file_path', ''))
" 2>/dev/null)

[ -z "$file_path" ] && exit 0

# .agents/rules/*.md に一致するか確認
case "$file_path" in
  */.agents/rules/*.md | */.agents/rules/*.md)
    ;;
  *)
    # 絶対パスかつ .agents/rules/ 配下
    if ! echo "$file_path" | grep -q '\.agents/rules/.*\.md$'; then
      exit 0
    fi
    ;;
esac

name=$(basename "$file_path")
symlink="$REPO_ROOT/.claude/rules/$name"
target="../../.agents/rules/$name"

if [ ! -e "$symlink" ] && [ ! -L "$symlink" ]; then
  ln -s "$target" "$symlink"
  echo "rule-sync: created .claude/rules/$name → $target" >&2
fi
