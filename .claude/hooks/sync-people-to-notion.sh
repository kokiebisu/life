#!/usr/bin/env bash
# PostToolUse hook: aspects/people/ 編集時に Prayer Requests Notion サブページへ自動同期指示

set -euo pipefail

INPUT=$(cat)

FILE_PATH=$(echo "$INPUT" | grep -o '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*"file_path"[[:space:]]*:[[:space:]]*"//' | sed 's/"$//')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# aspects/people/ 配下の .md ファイルのみ対象
if ! echo "$FILE_PATH" | grep -qE 'aspects/people/.+\.md$'; then
  exit 0
fi

# ファイル名（拡張子なし）を取得
BASENAME=$(basename "$FILE_PATH" .md)

# person → Notion ページID マッピング
declare -A PAGE_IDS
PAGE_IDS["shinya"]="330ce17f-7b98-817c-8cdd-f92f58399983"
PAGE_IDS["midori"]="330ce17f-7b98-813f-a29b-e8c0c5b92cec"
PAGE_IDS["jayce"]="330ce17f-7b98-813c-b2d3-ff5293de49c5"
PAGE_IDS["michael"]="330ce17f-7b98-8153-a939-d5440288d409"
PAGE_IDS["kazuya"]="330ce17f-7b98-81da-b1f1-ca97304aa3a7"
PAGE_IDS["tantan"]="330ce17f-7b98-8136-bfce-e51bf0f3045e"
PAGE_IDS["p"]="330ce17f-7b98-817c-b48a-fd6d14c92238"
PAGE_IDS["emiri"]="330ce17f-7b98-8155-9825-e226803c2f3a"
PAGE_IDS["yuiho"]="330ce17f-7b98-81ee-9756-dccebb40457d"
PAGE_IDS["taiki"]="330ce17f-7b98-8145-a360-cdbea911d2aa"
PAGE_IDS["wes"]="330ce17f-7b98-812a-a912-ed4b20a7535c"
PAGE_IDS["shiori"]="330ce17f-7b98-813c-adfa-c65f2b6e0ced"
PAGE_IDS["kazuki"]="330ce17f-7b98-81bd-8c8b-cac1ab7e3143"
PAGE_IDS["nathan"]="330ce17f-7b98-815f-a333-ea846f92d07f"
PAGE_IDS["ivan"]="330ce17f-7b98-814f-9b75-c2d9bdf0cc71"
PAGE_IDS["mariya"]="330ce17f-7b98-8196-a160-f5b8430e14d0"
PAGE_IDS["me"]="330ce17f-7b98-8176-a27d-f4a84d807dae"
# 家族メンバー（dad/mom/grandma/dog）は家族ページにまとめる
PAGE_IDS["dad"]="330ce17f-7b98-8190-b32d-e7fdce7c0df7"
PAGE_IDS["mom"]="330ce17f-7b98-8190-b32d-e7fdce7c0df7"
PAGE_IDS["grandma"]="330ce17f-7b98-8190-b32d-e7fdce7c0df7"
PAGE_IDS["dog"]="330ce17f-7b98-8190-b32d-e7fdce7c0df7"

PAGE_ID="${PAGE_IDS[$BASENAME]:-}"

if [ -z "$PAGE_ID" ]; then
  exit 0
fi

# Claude への指示を hookSpecificOutput として出力
cat <<EOF
{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "${FILE_PATH} が更新されました。notion-update-page（replace_content）で Notion サブページ（ID: ${PAGE_ID}）を最新内容に更新してください。aspects/people/ の該当ファイルを読み、祈り内容・みことば・記録を反映すること。"}}
EOF
