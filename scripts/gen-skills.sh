#!/bin/bash
# gen-skills.sh — .ai/commands/ から Codex skills を生成する
# 各 skills/<name>/SKILL.md を作成・上書きする

set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMANDS_DIR="$REPO_ROOT/.ai/commands"
SKILLS_DIR="$REPO_ROOT/skills"

# コマンド名 → (skill_dir_name, description) のマッピング
declare -A SKILL_NAMES
declare -A SKILL_DESCS

SKILL_NAMES["ask:diet"]="ask-diet"
SKILL_DESCS["ask:diet"]="ダイエット・健康管理について相談したいとき。食事内容・カロリー・体重・栄養バランスなどの相談に使う。専門チームとして回答する。"

SKILL_NAMES["ask:job:search"]="ask-job-search"
SKILL_DESCS["ask:job:search"]="就職活動について相談したいとき。履歴書・職務経歴書・面接対策・求人選び・オファー交渉などに使う。専門チームとして回答する。"

SKILL_NAMES["cache"]="cache"
SKILL_DESCS["cache"]="キャッシュの確認・クリア・分析をするとき。「キャッシュ確認して」「キャッシュクリアして」「ヒット率を見たい」などに使う。"

SKILL_NAMES["calendar"]="calendar"
SKILL_DESCS["calendar"]="Notion カレンダーの予定を確認・追加・変更するとき。デイリープラン作成・スケジュール調整・既存予定の確認などに使う。"

SKILL_NAMES["devotion"]="devotion"
SKILL_DESCS["devotion"]="デボーション（聖書の学び）を始めるとき。「デボーションしたい」「デボーションやろう」「聖書読もう」などに使う。章は自動検出する。"

SKILL_NAMES["event"]="event"
SKILL_DESCS["event"]="イベント・予定を Notion カレンダーに登録するとき。飲み会・会議・外出など日時が決まっている予定の登録に使う。移動時間・重複チェックも自動処理する。"

SKILL_NAMES["fridge-sync"]="fridge-sync"
SKILL_DESCS["fridge-sync"]="fridge.md（冷蔵庫在庫）を Notion の「冷蔵庫の在庫」ページに同期するとき。「冷蔵庫同期して」「fridge 更新して」に使う。"

SKILL_NAMES["from:notion"]="from-notion"
SKILL_DESCS["from:notion"]="Notion の変更をリポジトリの md ファイルに逆同期するとき。Notion 上で時間変更・完了マーク・フィードバックをした後に使う。"

SKILL_NAMES["fukushuu"]="fukushuu"
SKILL_DESCS["fukushuu"]="学習ノートを復習したいとき。「復習しよう」「スペーシドリピティションやりたい」などに使う。忘却曲線に基づいて期日が来たノートをクイズ形式で復習する。"

SKILL_NAMES["goal"]="goal"
SKILL_DESCS["goal"]="新しい目標を追加・整理したいとき。「目標について壁打ちしたい」「新しい目標を追加したい」などに使う。ライフコーチとして対話しながら goals.md に反映する。"

SKILL_NAMES["kondate"]="kondate"
SKILL_DESCS["kondate"]="献立を計画したいとき。「献立考えて」「食事プランを立てたい」「何食分か作り置き計画したい」などに使う。在庫ベースで提案し Notion meals DB と daily ファイルに一括登録する。"

SKILL_NAMES["learn"]="learn"
SKILL_DESCS["learn"]="Claude のミスを指摘して再発防止策を適用するとき。「また同じミスをした」「ルールに追加して」「再発防止して」などに使う。"

SKILL_NAMES["meal"]="meal"
SKILL_DESCS["meal"]="食事を記録するとき。「〇〇食べた」「朝食記録したい」「ご飯ログ」など食事トラッキングに使う。daily ファイル・Notion meals DB・fridge.md を一括更新する。"

SKILL_NAMES["pr"]="pr"
SKILL_DESCS["pr"]="プルリクエストを作成するとき。変更をグループ化して PR を作成する。コミット後に自動で呼ばれることもある。"

SKILL_NAMES["tidy"]="tidy"
SKILL_DESCS["tidy"]="指示ファイル（CLAUDE.md・rules・commands・memory）の重複・配置ミスを整理するとき。「ルールが散らかってきた」「指示ファイル整理したい」などに使う。"

# 生成処理
mkdir -p "$SKILLS_DIR"

for cmd_file in "$COMMANDS_DIR"/*.md; do
  cmd_name="$(basename "$cmd_file" .md)"

  if [[ -z "${SKILL_NAMES[$cmd_name]+_}" ]]; then
    echo "WARNING: No mapping for '$cmd_name', skipping"
    continue
  fi

  skill_dir_name="${SKILL_NAMES[$cmd_name]}"
  description="${SKILL_DESCS[$cmd_name]}"
  skill_dir="$SKILLS_DIR/$skill_dir_name"
  skill_file="$skill_dir/SKILL.md"

  mkdir -p "$skill_dir"

  cmd_body="$(cat "$cmd_file")"

  cat > "$skill_file" <<SKILLEOF
---
name: $skill_dir_name
description: $description
---

$cmd_body
SKILLEOF

  echo "Generated: $skill_file"
done

echo "Done. $(ls "$SKILLS_DIR"/*/SKILL.md 2>/dev/null | wc -l) skills generated."
