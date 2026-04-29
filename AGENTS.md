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
./scripts/life-os-sync.sh status       # life-os との乖離確認
./scripts/life-os-sync.sh pull         # life-os/main を life に取り込む
./scripts/life-os-sync.sh contrib      # life-os に貢献できるコミットを確認
./scripts/gen-agents-md.sh             # skills/ + .ai/rules/ から AGENTS.md を再生成（Codex 用）
```

### Claude Code コマンド

```bash
# 食事・健康
/ask-diet                # ダイエットチームに相談
/meal                    # 食事を記録（daily + Notion meals + fridge 一括）
/kondate                 # 献立を計画（在庫ベース + Notion 登録）
/fridge-sync             # fridge.md を Notion の冷蔵庫ページに同期

# 就職活動
/ask-job-search          # 就職活動チームに相談
/interview-prep          # 技術面接の対話式学習セッション

# ジム
/gym                     # ジムセッション（plan / log）

# 学習
/study                   # 学習セッション開始・ノート記録・Notion 登録
/fukushuu                # 忘却曲線ベースの復習（スペーシドリピティション）

# 教会
/devotion                # デボーション（自動で次の章を検出）
/to-notion               # church MD ファイルを Notion に同期

# Notion・カレンダー
/from-notion             # Notion からデータ同期
/calendar                # Notion カレンダー操作
/event                   # イベント登録

# その他
/pr                      # 変更をグループ化してPR作成
/tidy                    # 指示ファイルの重複・配置を整理
/learn                   # ミスからの学習・再発防止
/automate                # セッション内容を仕組み化（skill/script/rule/hook 化を計画→実装）
/analyze                 # ルール→コード リファクタリング分析
```

> **スキル自動起動（厳守）:** 「デボーションしたい」「デボーションやりたい」などの発言は即 `/devotion` スキルを起動する。章や箇所をユーザーに聞かない（スキルが自動検出する）。

## Directory Structure

```
aspects/people/me.md     # ユーザープロフィール（基本情報・キャリア・価値観・健康・恋愛）
aspects/                 # 生活の各側面（各ディレクトリに CLAUDE.md あり）
  tasks.md               # タスク管理（Inbox / Archive）
  events/                # 一回限りの予定
  daily/                 # デイリーログ
  devotions/             # デボーションノート（YYYY-MM-DD.md）
projects/sumitsugi/      # 個人プロジェクト（サブモジュール）
memory-bank/             # セッション間の記憶（decisions.md）
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
- `projects/sumitsugi/` — 個人プロジェクト・本業（サブモジュール）

## Devcontainer

- **ランタイム:** Node.js 20, Bun
- **ツール:** Claude Code CLI, GitHub CLI
- **起動:** `./dev` スクリプトで devcontainer 起動 + Claude Code 自動開始

## 実装プラン実行

- **常に Subagent-Driven（現セッション内）で実行する。** Parallel Session は使わない
- 理由: タスクは順番依存が多く、1人リポジトリなのでワークツリー分離のメリットがない

## Memory Bank

`memory-bank/decisions.md` に設計判断とその理由を記録する。重要な判断をしたら追記すること。

---

# 認証ルール（厳守）

## OAuth token のみ使用 / API Key 禁止

**Anthropic / Claude 関連のサービスへ認証するときは、OAuth token を使う。** API Key (`sk-ant-...`) は基本使わない。

### 対象

- Claude Code CLI
- Claude Agent SDK
- Anthropic SDK (`@anthropic-ai/sdk`, `anthropic` Python SDK)
- 自作のスクリプト・ツールが Claude API を叩く場合
- 新しい開発で Anthropic 系サービスに接続するとき

### 理由

- OAuth token は Claude Code のサブスクリプションに紐づくため、別課金が発生しない
- API Key は従量課金が別計上され、コスト管理が分散する
- 1人リポジトリなのでサブスク経由で十分

### やること

1. SDK / スクリプトを書くときは OAuth token (`CLAUDE_CODE_OAUTH_TOKEN` 等の環境変数) を使う
2. `ANTHROPIC_API_KEY` を要求するコードを書かない
3. ドキュメント・README で認証手順を書くときも OAuth を案内する

### 例外（ユーザーが明示的に許可した場合のみ）

- API Key でしか動かない機能（バッチ API 等）を使う必要があり、ユーザーが明示的に「API Key で OK」と言ったとき
- 例外を使う場合も `.env` に入れて gitignore する（`.ai/rules/security.md` 参照）

迷ったら OAuth。API Key を使う前に必ずユーザーに確認する。

---

# Calendar Sync ルール

## 睡眠（厳守）
- 目標: 22:00就寝→5:00起床（7h）。理想23:00 / MUST 24:00
- 24:00以降にタスクを配置しない。就寝遅延時は起床もずらす

## 食事（厳守）
- 食事エントリは原則1時間。fridge.md で食材在庫を確認する

## DB 優先度
events > todo > routine > meals > groceries

## md↔Notion 同期（必須）
- md を変更したら Notion も更新。逆も同様。片方だけで終わらせない
- スケジュール変更後は `notion-list.ts --date` で全エントリを再確認する

## 連鎖チェック（厳守）
- 時間変更時: 前後の予定も連鎖チェック
- 買い出し移動時: その買い出しで調達する食材を使う食事も確認・移動する

## 基本ルール
- 1ブロック=1タスク（「A + B」「A or B」禁止）
- ルーティンを events/ に書かない（devotion DB 側で管理）
- events/ = 未来の一回限り予定（行事・集まり）、daily/ = その日の実績記録
- events/ にタスク（手続き・作業）が混在していても、Notion 登録先は内容で判断する（→ todo DB）
- 曜日は `date` コマンドで確認。暗算しない
- キャンセル: Notion は `notion-delete.ts` で完全削除、events/ にキャンセル記録

---

# コミュニケーションルール

## 壁打ち対応（厳守）

「壁打ちしたい」「相談したい」「どうしよう」= **選択肢メニューではなく、分析 + 提案 + 議論。**

### やること

1. **文脈を分析する** — なぜその状況になったか、背景を読み解く
2. **自分の意見・推奨を述べる** — 「こうしたほうがいいと思う」を明確に言う
3. **判断材料を提示する** — 依存関係、スケジュール制約、過去の傾向など
4. **推奨案を明示する** — 迷わせない。「おすすめはこれ」と言い切る

### やらないこと

- 選択肢を並べて「どれにしますか？」で終わること
- ユーザーに丸投げすること
- 一般論だけ述べて具体的な提案をしないこと

## 選択肢の提示（厳守）

選択肢を出すときは**必ずどれが推奨かを明記する。** 推奨なしで並べるだけは禁止。

- AskUserQuestion の場合: 推奨オプションを先頭に置き `(Recommended)` を付ける
- テキストで列挙する場合: `← おすすめ` や `**推奨**` 等で明示する

## チーム・コーチ主導の依頼（厳守）

「コーチ主導で」「チームに任せる」「判断に任せる」と言われたら、**専門家として自分で決断して実行する。** ユーザーに「どちらにしますか？」と聞くのは禁止。

- 迷う場面ほど、専門判断を示して動く
- 選択肢を提示して丸投げしない

## 機材・製品スペックの断定（厳守）

機材や製品のスペック（端子・給電方式・互換性等）を断定する前に、**公式スペックページで確認すること。** Web検索の断片的な情報だけで断定しない。

- 補助的な機能（付属ケーブル等）を主要仕様と誤解しやすいので注意
- 不確実な場合は「確認が必要」と伝え、断定を避ける

## 解説の難易度（厳守）

**毎回の説明・解説は「15歳が分かるレベル」まで噛み砕く。** 専門用語をそのまま使わない・前提知識を仮定しない。

- 専門用語が必要なときは、初出で1行の言い換えを併記する（例: 「bucket lookup（map の中で値を探す手順）」）
- たとえ話・具体例を先に出してから抽象論に移る
- 「〇〇とは△△で〜」と定義から始める書き方を避ける。「ポイントは〇〇」「要はこういうこと」から入る
- 数値や根拠は最後に補足。冒頭から $O(n)$ や数式を出さない
- 文章を長く繋げない。1文 = 1つのアイデア

「専門家同士の説明」モードはユーザーが明示的に求めたとき（「テック寄りで」等）に限る。デフォルトは平易モード。

---

# ユーザー状況

- 2026-02-13 最終出社。2/14以降 life OS 開発を本業として2-3ヶ月集中していたが、2026-03-17 に方針変更
- **2026-03-17〜: life OS 開発を一旦停止。次の就職活動に集中する**
- 横浜在住
- 優先度: 就職活動 > 運動/減量 > ギター > study > 読書
- kawa（Expo アプリ）は廃止 → Notion 統合に切替済（2026-02-11）

## 次にやること

- ハローワークで手続き（離職票届き次第）
- 失業保険の手続きと再就職手当の活用を検討中

---

# エントリー削除（厳守）

エントリを削除するときは**必ず以下の手順を踏む。** 省略・自己判断での削除は禁止。

## 禁止事項

- Notion MCP (`notion-update-page` 等) で直接ステータス変更して削除扱いにすること
- md ファイルだけ、または Notion だけを削除すること
- `notion-delete.ts` を使わずに削除すること

## 必須手順

1. `bun run scripts/notion-delete.ts <id>` で Notion ページを完全削除
2. 対応する md ファイルから該当行を削除
3. 連鎖チェック: 削除対象に依存する予定を確認（買い出し→食事、イベント→関連タスク等）
4. `bun run scripts/cache-status.ts --clear`
5. `bun run scripts/notion-list.ts --date` で削除後の状態を確認

---

# Git Workflow

## Commit Message Format
```
<type>: <description>
```
Types: feat, fix, refactor, docs, chore

## main への直接コミット禁止 / worktree 必須（厳守）

**PR を出すときは必ず git worktree を使う。** main への直接コミット・プッシュ禁止。

```bash
# 1. unstaged changes があれば stash
git stash

# 2. worktree を作成（main から feature ブランチ）
BRANCH="<type>/<short-description>"
git worktree add .worktrees/$BRANCH -b $BRANCH

# 3. worktree 内で作業
cd .worktrees/$BRANCH
git stash pop   # stash した場合のみ
git add <files>
git commit -m "..."
git push -u origin HEAD
gh pr create ...

# 4. マージ後に worktree を削除
cd /workspaces/life
git worktree remove .worktrees/$BRANCH --force
git branch -D $BRANCH 2>/dev/null || true
git pull origin main
```

セッションごとに worktree を作成して影響範囲を分離すること。

## worktree 削除前の uncommitted check（厳守）

`git worktree remove --force` の前に、**必ず** `git -C .worktrees/<branch> status --porcelain` で未コミット変更がないか確認する。

- 空でない場合: その worktree に次の PR の変更が残っている可能性あり。`--force` で消すと untracked file は完全消失する
- 残っている変更が必要なものなら: その worktree でコミット・push してから削除、または stash してから削除
- 不要なゴミなら: ユーザーに確認してから `--force`

`git fsck --lost-found` で復旧できる場合もあるが（stash や tracked file の blob は残る）、untracked file は消える。force は最後の手段。

複数 PR を順番に作るとき、Group 1 の worktree に Group 2 の変更が残ったままになる動線が起きやすい。`status --porcelain` を必ず挟むこと。

## セッション開始時の worktree チェック（厳守）

セッション開始時に `git worktree list` で残存 worktree を確認する。main 以外の worktree があれば:

1. 各ブランチの PR 状態を `gh pr list --head <branch> --state all` で確認
2. **マージ済み PR あり** → worktree を削除（`git worktree remove --force` + `git branch -D`）
3. **PR なし・未マージ** → ユーザーに報告し、削除 or 継続を確認
4. 確認後 `git pull origin main` で main を最新にする

放置 worktree は main と乖離してマージ不能になるため、早めに処理する。

## 自動コミットポイント（厳守）

セッション中、Claude が「切れ目」を判断し、worktree → コミット → PR → マージまで**ユーザーに確認せず自動実行する。**

### コミットポイントの判断基準

以下のいずれかに該当し、未コミットの変更がある場合にコミットポイントとする：

1. **スキル完了時** — `/meal`、`/devotion`、`/study`、`/kondate`、`/gym`、`/event` 等のスキルが完了し、ファイル変更が発生したとき
2. **話題の切り替わり時** — ユーザーが別トピックに移る発言をしたとき、それまでの変更を先にコミット
3. **変更蓄積時** — 未コミットの変更ファイルがある状態で新しい作業に入ろうとしたとき

### 自動実行の手順

1. `git stash` → worktree 作成 → `git stash pop`
2. `git add` → `git commit` → `git push -u origin HEAD`
3. `gh pr create` → `gh pr merge --merge --delete-branch`
4. main に戻って worktree 削除 → `git pull origin main`

### PR の粒度

- 1コミットポイント = 1PR（変更をまとめすぎない）
- PR タイトル・本文は `/pr` スキルに従う

## `gh pr create` 失敗時のフォールバック（厳守）<!-- コード化済み: scripts/create-pr.ts -->

`gh pr create` が "No commits between main and ..." エラーで失敗した場合、**即座に `gh api` で直接 PR を作成する。** リトライしない。

```bash
gh api repos/kokiebisu/life/pulls --method POST \
  --field title="<title>" \
  --field head="<branch>" \
  --field base="main" \
  --field body="<body>"
```

## unstaged changes がある状態での操作（厳守）

`git pull` / `git checkout` がエラーになっても `git reset --hard` で解決しない。

1. `git stash` で変更を退避する
2. 操作を実行する（pull / checkout 等）
3. `git stash pop` で変更を戻す

`git reset --hard` を実行する前は必ず `git status` で unstaged changes がないことを確認すること。

## `git stash drop` 禁止（厳守）

`git stash drop` は使わない。代わりに `git stash pop` を使う。

- 理由: stash には**現セッションと無関係な未コミット変更も含まれる**（他のスキル・他のセッションが残した dirty file）。drop は不可逆で、無関係な作業を巻き込んで消す
- `pop` は apply 成功時だけ stash を消すので安全（conflict 時は stash を保持）
- 「stash の中身は不要」と判断したくなっても、`pop` で戻して再判断する
- 古い stash の整理が本当に必要な場合は、必ず `git stash show -p stash@{N}` で全内容を確認してから drop する
- **複数 stash を drop する場合、必ず高い index から低い index へ順に drop する**（`{3}` → `{2}` → `{1}` → `{0}`）。低い index から drop すると残り stash の index が前にシフトし、想定外の別 stash を消す
- 連続 drop の前に毎回 `git stash list` を再実行して、残った index を確認しなおす

復旧手段: `git fsck --no-reflogs --lost-found` で dangling commit を見つけて `git checkout <sha> -- <path>` で個別ファイル復旧は可能だが、最後の手段。untracked を含む stash は復旧困難。

## Submodule（sumitsugi）
- `projects/sumitsugi` のサブモジュールポインタ変更は PR に含めない
- サブモジュールの更新は sumitsugi リポジトリ側で管理する
- `git status` に出ても基本スキップする

---

# 面接ノート作成ルール

## 面接ノート作成時（厳守）

Notion に面接ページを作成する際、「聞きたいこと」セクションに
**この会社特有のプラス評価につながる質問を1つ必ず追加する。**

- 内容は募集要項・公式ページから具体的な情報を抜粋して作る
- `aspects/job/search/interviews/questions-to-ask.md` の汎用質問と重複しない
- 例: ARR・技術選定の背景・特定機能の課題・最近のプロダクト戦略など
  → 「〜というプロダクト戦略を拝見しましたが、エンジニアとしてどう関わっていますか？」

---

# Memory 保存ルール

- 新しいルール・preference・状況は `CLAUDE.md` または `.claude/rules/` 配下に追加する
- `~/.claude/projects/.../memory/MEMORY.md` には**個人情報（住所・財務・恋愛等コミット禁止の情報）のみ**保存する

---

# Notion ワークフロー

## sync スクリプトを迂回しない（厳守）

`notion-sync-*.ts` や `notion-add.ts` などの sync スクリプトがエラーで失敗したとき、**MCP 直接操作（`notion-update-page` 等）で迂回してはいけない。** 必ずスクリプトを修正して使う。

- 理由: sync スクリプトは source of truth の正規化・重複チェック・プロパティマッピングを担っているため、MCP 直接操作は一貫性を壊す
- 正しい手順:
  1. エラーの原因（スキーマ不一致・マッチング失敗等）を特定する
  2. スクリプトを修正する
  3. `--dry-run` で影響範囲を確認する
  4. 本番実行する

## 破壊的 sync の dry-run 必須（厳守）

Notion の既存エントリを更新する可能性がある sync スクリプトを実行する前に、**必ず `--dry-run` で「どのエントリが更新されるか」を確認する。**

- 同日複数エントリがある場合、マッチング戦略によっては意図しないエントリを上書きする（例: 主日礼拝の代わりに Worship Team Audition を上書きなど）
- dry-run 出力で `更新: <date> 「<title>」` のタイトルが自分の意図と一致しているか確認する
- 不一致なら実行せず、スクリプトのマッチングロジックを修正する

## notion-list で見つからない場合（厳守）

`notion-list.ts` はスケジュール系 DB のみ対象。**ジム DB など対象外の DB は表示されない。**

- `notion-list.ts` で見つからなくても「存在しない」と判断しない
- ユーザーが「Notion にある」と言ったら、`notion-search` で再検索するか、ユーザーに URL を確認する前に `notion-search` を試みる

## job DB（仕事探し）の検索（厳守）

job DB のページタイトルは「面接」「カジュアル面談」など汎用名になる。**会社名はプロパティにしか入らないため、会社名で `notion-search` してもヒットしない場合がある。**

- 会社名で検索してヒットしない場合 → 「面接」「カジュアル面談」などタイトル側のキーワードで再検索するか、ユーザーに「URLを貼ってください」と依頼する
- ユーザーが URL を貼った場合は即 `notion-fetch` する（AskUserQuestion で選択肢を出さない）

## タイトル正規化（厳守）

`notion-add.ts` にはタイトル正規化機能が組み込まれている。**タイトルを手動で決める前に `scripts/notion-add.ts` の `TITLE_KEYWORD_LIST` を参照し、既存の canonical タイトルに合わせること。**

- 「開発」「コーディング」「実装」「life-os」→ `開発`
- 「ジム」「筋トレ」「トレーニング」→ `ジム`
- 「勉強」「学習」→ `勉強`
- 「ギター」「練習」→ `ギター練習`
- 「買い出し」「買い物」→ `買い出し`
- 他のキーワードは `TITLE_KEYWORD_LIST`（[scripts/notion-add.ts](../../scripts/notion-add.ts)）で確認する

`notion-add.ts` 経由であれば自動適用される。`notion-create-pages` など MCP 直接登録の場合は**手動で確認・統一すること。**

## Job DB（`NOTION_JOB_DB`）の会社名セット（厳守）

job DB にエントリを作成・更新する際は、**必ず `profile/career.md` の「現在の所属 > 会社名」を読んで `会社名` プロパティにセットすること。**

- 求職中の場合: `会社名` は設定しない（空欄）か、面接先の企業名をセット
- 入社後: `profile/career.md` を更新してから job DB エントリを作成

**Job DB プロパティ一覧:**

| プロパティ | 型     | 選択肢                                     |
| -------- | ------ | ------------------------------------------ |
| 名前     | title  | —                                          |
| 日付     | date   | —                                          |
| 会社名   | select | kickflow株式会社 / フリーランス / その他    |
| 種別     | select | 面接 / 業務 / カジュアル面談 / その他       |

## select プロパティ設定前のスキーマ確認（厳守）<!-- コード化済み: validateSelectValue() in scripts/lib/notion.ts -->

`notion-update-page` で select プロパティを設定する前に、**必ず DB のスキーマを確認してから正しいプロパティ名・選択肢を指定する。**

- プロパティ名に `select:` `rich_text:` などのプレフィックスは**不要**。プロパティ名をそのまま使う
- select の選択肢（`カテゴリ`・`本` など）は DB の既存値と完全一致が必要。推測で入力しない
- スキーマ確認は `bun -e "..."` でDB プロパティ一覧を取得するか、`notion-fetch` で確認する

## プロパティ名エラー時の対応（厳守）

`notion-update-page` で `"Property not found"` エラーが出たら、**必ず `notion-fetch` でDBスキーマを確認してから正しいプロパティ名でリトライする。** エラーを無視して先に進まない。

## Notion MCP サーバー名

- `ReadMcpResourceTool` のサーバー名は **`claude.ai Notion`**（スペース・ドット入り）
- ツール名の `mcp__claude_ai_Notion__*` と混同しないこと

## 日時のタイムゾーン（厳守）<!-- コード化済み: ensureJST() in scripts/lib/notion.ts -->

Notion MCP (`notion-update-page`) で日時プロパティを設定するとき、**必ず `+09:00`（JST）を付ける。** タイムゾーンなしで渡すと UTC 扱いになり、カレンダー上で9時間ずれる。

```
// ✅ OK: +09:00 を明示 → 正しく 10:00 JST になる
"date:日付:start": "2026-02-21T10:00:00+09:00"
```

- `notion-update-page` の `date:*:start` / `date:*:end` すべてが対象
- 日付のみ（時刻なし）の場合は `2026-02-21` で OK（タイムゾーン不要）
- **時刻を含む場合は例外なく `+09:00` を付けること**

## notion-pull dry-run の確認（厳守）<!-- コード化済み: validateDryRunEntries() in scripts/notion/notion-pull.ts -->

`notion-pull.ts --dry-run` の出力に以下の異常が含まれる場合、**実行前にユーザーに確認する。** そのまま実行しない。

- 時刻が `24:xx` 以降（例: `26:43`）
- 移動時間が 120分 超
- 開始時刻が元の予定より大幅に早い（2時間以上）

## 勉強系 DB の使い分け（厳守）

「勉強」系の Notion DB は4種類あり、用途で使い分ける。`--db` を間違えると別 DB に入って履歴が分断される。

| タイトル | `--db` flag | 用途 |
|---------|------------|------|
| 勉強（面接対策） | `interview` | 面接対策セッション（コーディング・模擬・コードレビュー等） |
| 勉強（読書） | `study` | 本を読むセッション |
| 勉強（トピック別） | `topic` | トピック単位の学習（アルゴリズム・特定領域の深堀り等） |
| 勉強（復習） | （`/fukushuu` 専用） | スペーシドリピティション復習サマリー |

- 面接対策は `--db interview` を使う。`--db study` は本を読むときだけ
- `notion-add.ts` は `interview` DB のテンプレートを持たないので、API 直叩きでページ本文を書く（`会社` プロパティも必須）
- タイトルは `勉強（面接対策）` など DB 名と一致させる。`TITLE_KEYWORD_LIST` の自動正規化（「勉強」→「勉強（読書）」）は誤解を招くため、`--title "勉強（面接対策）"` のように明示的に渡す

## scripts パスの確認（厳守）

Notion 関連スクリプトは **`scripts/notion/` 配下**にある。`scripts/` 直下には存在しない。

```bash
# ✅ OK
bun run scripts/notion/notion-add.ts
bun run scripts/notion/notion-list.ts

# ❌ NG（パスエラーになる）
bun run scripts/notion-add.ts
```

初めて使うスクリプトは `ls scripts/notion/` で存在確認してから実行する。

## キャッシュ（厳守）

- `notion-update-page` や `notion-add.ts` で時間変更・更新した後、`notion-list.ts` で確認する前に必ず `bun run scripts/cache-status.ts --clear` を実行する

## 操作ルール

- **新規ページには必ずアイコンとカバー画像をつける**
- **完了済みのページは基本いじらない**
- **時間変更時: 前後の予定も連鎖チェック**
- **タスク追加時: 必ず時間（--start/--end）を入れる**（--allday フラグは廃止済み。エラーが出ても --allday で逃げず、ユーザーに時間を確認する）
- **説明・詳細はページ本文に書く**（後述「ページ本文ルール」参照）
- **完了済タスクの追加時**（「〜してた」等）→ ステータスを「完了」にセット
- **同名エントリがある場合は確認する**
- **重複エントリ防止**: 登録前に `notion-list.ts --date` で既存エントリを取得
- **日付未設定の既存ページに注意**: `notion-fetch` でDB を確認するか、ユーザーに確認する

## DB の使い分け

- **events**: 行事・集まり（人と会う、参加する予定）
- **todo**: やらないといけないこと（タスク、作業、手続き）
- **devotion**: デボーション・習慣（繰り返しやるもの）
- **その他**: 実績ログ・作業記録（「〜してた」「〜やってた」など、タスクではない活動記録）

**迷ったときの判断基準:**
- 「行事・集まり？」→ Yes なら events
- 「やらないといけないこと？」→ Yes なら todo
- 「繰り返しやる？」→ Yes なら devotion
- 「〜してた（実績）？」→ Yes なら **その他**（todo ではない）

詳しい間違えやすい例は `/event` コマンド参照。

## md の配置場所と Notion DB は独立（厳守）

**Notion の登録先 DB は、ファイルの配置場所ではなく内容で判断する。**

- `events/` ファイルにタスク（手続き・作業・確認）が書いてあっても → **todo DB**
- `tasks.md` に書いてあるイベント的なものがあっても → **events DB**

ファイルの置き場所に引きずられて DB を選ばないこと。

## ページ本文ルール（Description プロパティ廃止）

**DB の Description / 説明プロパティは使わない。** 内容はすべてページ本文に書く。

- `--desc` オプションは廃止済み。`notion-add.ts` に渡しても無視される
- 説明・詳細・レシピ・レッスン内容などは、ページ作成後に `notion-update-page` の `replace_content` でページ本文に書き込む
- **手順:** `notion-add.ts` → ページ ID 取得 → `notion-update-page`（`replace_content`）で本文を書く

## 既存ページの確認（厳守）

Notion にページを**新規作成する前に**、必ず既存ページの存在を確認する。検索でヒットしなくても存在する場合がある（JST/UTC ズレで日付フィルターが機能しないケースなど）。

- `notion-search` でヒットしない場合でも、**`notion-list.ts --date` または DB を `notion-fetch` で直接確認**してから判断する
- md ファイルがすでに存在する場合（`/devotion` 等で作成済み）は、対応する Notion ページも存在する可能性が高い
- **`validate-entry.ts` は類似タイトルの検出のみ。** 既存ページへの追記が必要なケースは検出できない。必ず `notion-list.ts --date` で確認し、既存ページがあれば新規作成せず**そのページに追記する**

## 重複バリデーション（厳守）<!-- コード化済み: validate-entry.ts + notion-add.ts checkDuplicate -->

Notion にスケジュール系エントリ（devotion / events / todo / meals / groceries / study）を **直接登録する前に**、必ず `validate-entry.ts` を実行する:

```
bun run scripts/validate-entry.ts --date YYYY-MM-DD --title "タイトル" --start HH:MM --end HH:MM
```

- **終了コード 1** → 類似エントリあり。登録中止。ユーザーに確認する
- **終了コード 0** → 問題なし。登録してよい
- `notion-add.ts` 経由の場合は内部で自動チェックされるため不要
- Notion MCP (`notion-create-pages` / `notion-update-page`) で直接登録する場合は**必ず実行すること**

CLI コマンドの使い方は `/calendar` コマンドを参照。

---

# プロフィール参照

ユーザーのプロフィール情報は `aspects/people/me.md` に一元管理されている。

## 個人的背景に触れる前に必ず読む（厳守）

ユーザーの**個人的背景（家族・信仰遍歴・幼少期・価値観・キャリア・恋愛・健康・財務）に触れる話題が出たら、推測で答える前に必ず `aspects/people/me.md` を読む。** 「必要に応じて」と曖昧にして読まずに済ませない。

- 推測で書いて訂正されるより、最初に読む方が早く正確
- セッション中に一度読めば十分（再読は不要）
- 該当セクションだけでなく全文を見ること（背景は複数セクションに散らばる）
- 関連する他のファイル（`aspects/people/family/`, `aspects/people/church/...`, `memory/career-private.md` 等）も話題に応じて読む

| セクション | 内容 | 主な参照元 |
|-----------|------|-----------|
| 基本情報 | 氏名・年齢・出身・言語・居住・生活リズム | 全チーム |
| キャリア | 職歴・技術スキル・働き方の軸 | job チーム、planning |
| 価値観・人生の軸 | 生き方のスタンス・信仰・優先順位 | goal、planning |
| 恋愛・パートナーシップ観 | 求めるもの・自己課題（詳細 → memory/love.md） | 恋愛相談時 |
| 健康・ダイエット | 身体状態・ジム・食事 | diet チーム |
| 財務 | 詳細 → memory/career-private.md | planning |

> 新しい情報が出たら即座に `aspects/people/me.md` を更新すること。

---

# Security Guidelines

## Mandatory Security Checks

Before ANY commit:

- [ ] No hardcoded secrets (API keys, passwords, tokens)
- [ ] No exact addresses (street number, building name). Area names and store names are OK.
- [ ] No phone numbers
- [ ] Error messages don't leak sensitive data

## Secret Management

```
# NEVER: Hardcoded secrets in files
api_key = "sk-proj-xxxxx"

# ALWAYS: Use environment variables or keep in .env (gitignored)
```

## Security Response Protocol

If security issue found:

1. STOP immediately
2. Fix CRITICAL issues before continuing
3. Rotate any exposed secrets
4. Review related files for similar issues

---

# Task Capture（タスク自動キャプチャ）

## ルール

会話中にユーザーが「やるべきこと」「やりたいこと」を言ったら、**自動で `aspects/tasks.md` の Inbox に追加する。**

### タスクと判断する基準

- 「〜しなきゃ」「〜やらないと」「〜する必要がある」
- 「〜買わないと」「〜確認しておく」「〜連絡する」
- 「〜調べたい」「〜申し込む」「〜予約する」
- 明らかにアクションが必要な発言全般
- ただし、今この会話の中で完結する作業（「このファイル編集して」等）はタスクではない

### イベント（タスクではない → `aspects/events/` へ）

- 飲み会・会議・予定など「日時が決まっているスケジュール」はイベント
- `aspects/events/YYYY-MM-DD.md` に追加
- **Notion events DB にも必ず登録する**（`notion-add.ts --db events --start HH:MM --end HH:MM`）。説明が必要なら作成後に `notion-update-page` の `replace_content` でページ本文に書き込む
- `aspects/tasks.md` には入れない

### 買いたいもの（タスクではない → `aspects/shopping/stores/` へ）

「〇〇で〜買いたい」「〇〇の〜が欲しい」などの発言は、**`tasks.md` ではなく `aspects/shopping/stores/` で管理する。**

1. Web Search で商品を調べる（価格・商品ページURL・画像URL）
2. 該当店舗の `aspects/shopping/stores/店舗名.md` に追記する（ファイルがなければ新規作成）
3. Notion ショッピング DB（`51f39ff99e804451a4f17d60f6869755`）にレコードを作成する
   - `notion-create-pages` で商品名・店舗・価格・URLをプロパティにセット
   - カバー画像に商品画像URLをセット
   - ページ本文にも商品画像を `![]()` で埋め込む
4. `tasks.md` には**入れない**

> 食材・食品の買い出しは `aspects/shopping/groceries/` で管理する（`/kondate` 経由）。`stores/` には入れない。

### タスクと判断しないもの

- イベント・予定（上記参照）
- 買いたいもの（上記参照）
- 会話中に Claude に依頼して、その場で完了するもの
- 単なる感想・雑談
- 既に `tasks.md` に存在するもの（重複しない）
- レッスン内容・カリキュラムの学習トピック・CLAUDE.md の「次の課題」（ユーザー自身の発言ではない）

### 追加フォーマット

```markdown
- [ ] タスク内容 (YYYY-MM-DD)
```

- 日付はキャプチャした日
- 期限がわかる場合は `📅 YYYY-MM-DD` を末尾に追加
- aspect が明確なら `#aspect名` タグをつける

例:
```markdown
- [ ] 確定申告の書類を準備する (2026-02-12) #planning
- [ ] ジムのロッカーの使い方を確認する (2026-02-12) #diet 📅 2026-02-14
```

### 動作

1. タスクを検出したら `aspects/tasks.md` の `## Inbox` セクション末尾に追加
2. **Notion todo DB にも登録する**（`notion-add.ts --db todo --start HH:MM --end HH:MM`）。時間はユーザーに確認するか、文脈から適切に設定する。説明が必要なら作成後に `notion-update-page` の `replace_content` でページ本文に書く
3. ユーザーに「タスクに追加しておいた」と軽く報告（1行で十分）
4. 会話の流れを止めない。メインの話題を優先する

### 既存タスクの編集（厳守）

タスクの内容を変更（説明追加・タイトル変更・ステータス変更等）したら、**md と Notion の両方を更新する。** 片方だけで終わらせない。

- md を編集 → 対応する Notion ページも更新
- Notion を編集 → 対応する md も更新

### Notion 側で完了済みタスクの同期（厳守）

ユーザーが「Notion で完了した」「もう終わった」「全部 DONE」など**既存タスクの完了を言及した**ら、即座に `notion-sync-tasks.ts` で全件同期する。

```bash
bun run scripts/notion/notion-sync-tasks.ts --dry-run   # プレビュー
bun run scripts/notion/notion-sync-tasks.ts             # 実行
```

- `/from-notion`（`notion-pull.ts`）は**日付範囲フィルタ付き**のため、過去日に完了した Inbox の古いタスクは拾えない。必ず `notion-sync-tasks.ts` を使う
- 手で tasks.md の `[ ]` を `[x]` に書き換えるのは禁止。Notion が source of truth なのでスクリプト経由で同期する

---

## Available Commands

コマンドを呼び出すときは、対応する `skills/<name>/SKILL.md` を読んでその指示に従うこと。

- **`/analyze`** — ルールファイル（.ai/rules/・CLAUDE.md・skills/）を分析し、コードに置き換えた方が一貫性のある箇所を検出・レポート・実装する。「分析して」「リファクタして」に使う。 → `skills/analyze/SKILL.md`
- **`/ask-diet`** — ダイエット・健康管理について相談したいとき。食事内容・カロリー・体重・栄養バランスなどの相談に使う。専門チームとして回答する。 → `skills/ask-diet/SKILL.md`
- **`/automate`** — 成功した手順やセッションの作業内容を仕組み化（skill / script / rule / hook）したいとき。「これ仕組み化したい」「自動化したい」「次回も再現できるようにしたい」などに使う。 → `skills/automate/SKILL.md`
- **`/backfill-cues`** — 既存の学習ノートにコーネル式キュー（自分への質問）を一括追加する。「キュー追加」「バックフィル」などに使う。 → `skills/backfill-cues/SKILL.md`
- **`/calendar`** — Notion カレンダーの予定を確認・追加・変更するとき。デイリープラン作成・スケジュール調整・既存予定の確認などに使う。 → `skills/calendar/SKILL.md`
- **`/devotion`** — デボーション（聖書の学び）を始めるとき。「デボーションしたい」「デボーションやろう」「聖書読もう」などに使う。章は自動検出する。 → `skills/devotion/SKILL.md`
- **`/event`** — イベント・予定を Notion カレンダーに登録するとき。飲み会・会議・外出など日時が決まっている予定の登録に使う。移動時間・重複チェックも自動処理する。 → `skills/event/SKILL.md`
- **`/fridge-sync`** — fridge.md（冷蔵庫在庫）を Notion の「冷蔵庫の在庫」ページに同期するとき。「冷蔵庫同期して」「fridge 更新して」に使う。 → `skills/fridge-sync/SKILL.md`
- **`/from-notion`** — Notion の変更をリポジトリの md ファイルに逆同期するとき。Notion 上で時間変更・完了マーク・フィードバックをした後に使う。 → `skills/from-notion/SKILL.md`
- **`/fukushuu`** — 学習ノートを復習したいとき。「復習しよう」「スペーシドリピティションやりたい」などに使う。忘却曲線に基づいて期日が来たノートをクイズ形式で復習する。 → `skills/fukushuu/SKILL.md`
- **`/gym`** — ジムセッションの予定登録（/gym plan）と実績ログ記録（/gym log）。引数: $ARGUMENTS → `skills/gym/SKILL.md`
- **`/interview-prep`** — 技術面接の対話式学習セッション。「面接対策やろう」「Day 1 やろう」「Go goroutine やろう」「DB やろう」「システム設計やろう」など、就職活動の技術面接対策を進めたいときに起動する。引数: $ARGUMENTS → `skills/interview-prep/SKILL.md`
- **`/kondate`** — 献立を計画したいとき。「献立考えて」「食事プランを立てたい」「何食分か作り置き計画したい」などに使う。在庫ベースで提案し Notion meals DB と daily ファイルに一括登録する。 → `skills/kondate/SKILL.md`
- **`/learn`** — Claude のミスを指摘して再発防止策を適用するとき。「また同じミスをした」「ルールに追加して」「再発防止して」などに使う。 → `skills/learn/SKILL.md`
- **`/meal`** — 食事を記録するとき。「〇〇食べた」「朝食記録したい」「ご飯ログ」など食事トラッキングに使う。daily ファイル・Notion meals DB・fridge.md を一括更新する。 → `skills/meal/SKILL.md`
- **`/pr`** — プルリクエストを作成するとき。変更をグループ化して PR を作成する。コミット後に自動で呼ばれることもある。 → `skills/pr/SKILL.md`
- **`/study`** — 学習セッションの開始・ノート記録・Notion登録。引数: $ARGUMENTS → `skills/study/SKILL.md`
- **`/tidy`** — 指示ファイル（CLAUDE.md・rules・commands・memory）の重複・配置ミスを整理するとき。「ルールが散らかってきた」「指示ファイル整理したい」などに使う。 → `skills/tidy/SKILL.md`
- **`/to-notion`** — church MDファイル（prayer-requests.md, verses.md, messages/）をNotionに同期するとき。引数: $ARGUMENTS → `skills/to-notion/SKILL.md`

