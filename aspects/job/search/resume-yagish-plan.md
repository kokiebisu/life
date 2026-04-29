# Yagish 職務経歴書 リード版改善 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存 `aspects/job/search/resume-yagish.md` を、設計書 [resume-yagish-design.md](resume-yagish-design.md) の磨きポイント3つに沿って改善する（disり表現の整え／要確認項目の埋め／ビジネス成果は据え置き）。

**Architecture:** 1ファイル `resume-yagish.md` を直接編集する。新規ファイルは作らない。worktree `chore/resume-yagish-update` で作業し、1 PR にまとめてマージする。

**Tech Stack:** Markdown 編集のみ。git worktree、gh CLI。

---

## File Structure

- 編集: `aspects/job/search/resume-yagish.md` （既存ファイル）
- 参照: `aspects/job/search/resume-yagish-design.md` （設計書）
- ブランチ: `chore/resume-yagish-update`

---

## Tasks

### Task 1: worktree 作成

**Files:** worktree 作成のみ

- [ ] **Step 1: 既存 untracked / unstaged 変更を確認**

```bash
cd /workspaces/life
git status --short
```

期待: `.devcontainer/devcontainer.json` の M と `.worktrees/` の untracked が見える状態（これは別件、stash 不要）。新たに resume-yagish.md の変更があれば stash する。

- [ ] **Step 2: worktree 作成**

```bash
cd /workspaces/life
BRANCH="chore/resume-yagish-update"
git worktree add .worktrees/$BRANCH -b $BRANCH
cd .worktrees/$BRANCH
```

期待: `.worktrees/chore/resume-yagish-update/` が main の最新 commit から作成される。

---

### Task 2: freee の資本金・従業員数を IR で取得

**Files:** 編集なし（情報収集のみ、メモを後続タスクで使う）

- [ ] **Step 1: freee の IR ページを確認**

```bash
# 公開 IR ページからの取得（手動または WebFetch ツール）
# https://corp.freee.co.jp/company/profile/
# https://corp.freee.co.jp/ir/
```

取得項目:
- 資本金（最新値）
- 従業員数（連結ベース、最新値）

- [ ] **Step 2: 取得した数値をメモする**

例:
- 資本金: ◯◯億◯◯百万円（YYYY年MM月時点）
- 従業員数: 連結 ◯◯◯名（YYYY年MM月時点）

これは後続 Task 5 で resume-yagish.md に反映する。

---

### Task 3: freee Eラーニングプロジェクト記述の disり表現書き換え

**Files:**
- 編集: `aspects/job/search/resume-yagish.md` の line 84 付近（プロジェクト2 の業務内容）

- [ ] **Step 1: 編集前の該当箇所を確認**

`aspects/job/search/resume-yagish.md` line 84 の以下の文を確認：

```
チーム全員が未経験のコードベース統合と前例のない OEM 連携という二重の不確実性、PdM とエンジニア間の対立、上場企業 OEM 先との厳格な要件調整といった組織的課題に直面。上長との 1on1on1 を自ら設計し、ペアプロでドメイン知識を共有、リファインメントを整備してチームの信頼関係を再構築しながらリリースを実現。
```

- [ ] **Step 2: 結果ベース表現に書き換え**

Edit ツールで以下に置き換え：

```
チーム全員が未経験のコードベース統合と前例のない OEM 連携という二重の技術的不確実性、複雑なステークホルダー構造の中で、上長と連携して構造的な支援を引き出し、ペアプロによるドメイン知識共有とリファインメント整備で開発体制を再構築。上場企業 OEM 先との3者間で要件合意を形成し、リリースを実現。
```

書き換えのポイント:
- 「PdM とエンジニア間の対立」→ 削除（「複雑なステークホルダー構造」に吸収）
- 「組織的課題に直面」→ 「複雑なステークホルダー構造の中で」（負の語彙を中立に）
- 「厳格な要件調整」→ 「3者間で要件合意を形成」（結果ベース）
- 「信頼関係を再構築しながら」→ 「開発体制を再構築」（負の含意を持つ「信頼関係再構築」を中立に）

- [ ] **Step 3: 編集後の整合性確認**

書き換え後の段落を音読し、以下を確認:
- 主体（自分が何をしたか）が明確
- 結果（リリース実現、合意形成）が前面に出ている
- 「対立」「課題」「混乱」など負の語彙が消えている

---

### Task 4: 自己 PR の disり表現書き換え

**Files:**
- 編集: `aspects/job/search/resume-yagish.md` line 264 付近（自己 PR「技術とリーダーシップの両立」）

- [ ] **Step 1: 編集前の該当箇所を確認**

`aspects/job/search/resume-yagish.md` line 264 の以下の文を確認：

```
freee では Eラーニングチームのプロダクトリードとして、OEM 提供元・freee PSIRT チームを含む複数ステークホルダー間のセキュリティ要件調整を主導。チーム全員が未経験のコードベースへの統合と前例のない OEM 連携という二重の技術的不確実性、PdM・エンジニア間の対立、上場企業である OEM 先との厳格な要件調整といった組織的課題に直面しながらも、24卒・25卒を含むエンジニア3名のチームをまとめ、「freee Eラーニング」を 2026 年 2 月にリリースしました。
```

- [ ] **Step 2: 結果ベース表現に書き換え**

Edit ツールで以下に置き換え：

```
freee では Eラーニングチームのプロダクトリードとして、OEM 提供元・freee PSIRT チームを含む複数ステークホルダー間のセキュリティ要件調整を主導。チーム全員が未経験のコードベースへの統合と前例のない OEM 連携という二重の技術的不確実性に対し、上場企業 OEM 先との3者間で要件合意を形成し、24卒・25卒を含むエンジニア3名のチームをまとめながら開発体制を整備して、「freee Eラーニング」を 2026 年 2 月にリリースしました。
```

書き換えのポイント:
- 「PdM・エンジニア間の対立」→ 削除
- 「厳格な要件調整といった組織的課題に直面しながらも」→ 「3者間で要件合意を形成し」（結果ベース）
- 「チームをまとめ」→ 「チームをまとめながら開発体制を整備して」（行動ベース）

- [ ] **Step 3: 編集後の整合性確認**

書き換え後の段落を音読し、以下を確認:
- 「対立」「課題」「混乱」「直面」など負の語彙が消えている
- リリース実現までの主体的行動が明確

---

### Task 5: freee の資本金・従業員数を resume-yagish.md に反映

**Files:**
- 編集: `aspects/job/search/resume-yagish.md` line 32-33（フリー株式会社の会社情報テーブル）

- [ ] **Step 1: 編集前の該当箇所を確認**

`aspects/job/search/resume-yagish.md` line 32-33 を確認：

```
| 資本金 | 要確認（東証プライム上場 4478） |
| 従業員数 | 要確認 |
```

- [ ] **Step 2: Task 2 で取得した数値に書き換え**

Edit ツールで以下のように置き換え（Task 2 の取得値を埋める）：

```
| 資本金 | ◯◯億◯◯百万円（YYYY年MM月時点） |
| 従業員数 | 連結 ◯◯◯名（YYYY年MM月時点） |
```

- [ ] **Step 3: 入力時のメモから「要確認」項目を削除**

`aspects/job/search/resume-yagish.md` 末尾の「入力時のメモ」セクション（line 278 付近）を確認：

```
- **要確認の項目**: フリー株式会社の資本金・従業員数、Groundtruth の従業員数（IR ページや採用ページで調べる）
```

Edit ツールで以下に置き換え（Groundtruth 分は据え置きでも OK だが、設計書の方針通り「チーム規模」表現で確定済みなら削除）：

```
- **要確認の項目**: なし（freee の資本金・従業員数は IR より反映済み、Groundtruth はチーム規模として記載）
```

---

### Task 6: 全体レビュー

**Files:** 編集対象 `aspects/job/search/resume-yagish.md` 全体

- [ ] **Step 1: 軸ブレチェック**

ファイル全体を Read ツールで読み直し、以下をチェック:
- 「リード経験を主軸として打ち出す」軸からブレていないか
- 職務要約・自己 PR で「リード経験」の言及が一貫しているか

- [ ] **Step 2: 数値表現の重複チェック**

以下の数値が複数箇所で重複していないかチェック（重複していたら自己 PR 側を残してプロジェクト記述側を簡潔化）:
- 70%短縮（CI/CD ビルド時間）
- 20%削減（離脱率）/ 20%向上（導入実績）
- 10%以上向上（インプレッション）
- 1秒以内（レスポンスタイム）

- [ ] **Step 3: 文字数チェック**

職務要約・自己 PR が Yagish の入力欄に収まる範囲であることを確認:
- 職務要約: 概ね 300〜400 文字
- 自己 PR: 概ね 800〜1200 文字

長すぎる場合は、設計書の重み付けマップを参照して「主役」要素を残し「サブ」要素を削る。

---

### Task 7: コミット & PR 作成

**Files:** worktree 内のすべての変更

- [ ] **Step 1: 変更内容の最終確認**

```bash
cd /workspaces/life/.worktrees/chore/resume-yagish-update
git diff aspects/job/search/resume-yagish.md
```

期待: disり表現の書き換え (2箇所)、資本金・従業員数の数値、入力時のメモの整理が反映されている。

- [ ] **Step 2: ステージング & コミット**

```bash
git add aspects/job/search/resume-yagish.md
git commit -m "$(cat <<'EOF'
chore: 職務経歴書(Yagish) リード版を磨く

- disり表現を結果ベース・主体行動ベースに書き換え (freee Eラーニング記述・自己PR)
- フリー株式会社の資本金・従業員数を IR より反映
- 「要確認の項目」セクションを更新

設計書: aspects/job/search/resume-yagish-design.md
EOF
)"
```

- [ ] **Step 3: push**

```bash
git push -u origin HEAD
```

- [ ] **Step 4: PR 作成**

```bash
gh pr create --title "chore: 職務経歴書(Yagish) リード版を磨く" --body "$(cat <<'EOF'
## Summary
- disり表現を結果ベース・主体行動ベースに書き換え（freee Eラーニング記述・自己PR）
- フリー株式会社の資本金・従業員数を IR より反映
- 「要確認の項目」セクションを更新

設計書: [resume-yagish-design.md](aspects/job/search/resume-yagish-design.md)

## Test plan
- [ ] 書き換え後の resume-yagish.md を音読し、負の語彙が消えていることを確認
- [ ] 数値表現の重複がないことを確認
- [ ] 文字数が Yagish の入力欄に収まることを確認

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

`gh pr create` が「No commits between main and ...」エラーで失敗した場合のフォールバック（git-workflow.md より）:

```bash
gh api repos/kokiebisu/life/pulls --method POST \
  --field title="chore: 職務経歴書(Yagish) リード版を磨く" \
  --field head="chore/resume-yagish-update" \
  --field base="main" \
  --field body="..."
```

- [ ] **Step 5: PR をマージ**

```bash
gh pr merge <PR番号> --squash --delete-branch
```

- [ ] **Step 6: worktree 削除 & main 同期**

```bash
cd /workspaces/life
git worktree remove .worktrees/chore/resume-yagish-update --force
git branch -D chore/resume-yagish-update 2>/dev/null || true
git pull origin main
```

期待: main が最新の commit に追いつき、worktree が消える。

- [ ] **Step 7: プランファイルを別 PR で削除（オプション）**

実装が完了したら `aspects/job/search/resume-yagish-plan.md` は不要になる（履歴は git log に残る）。
別 worktree でプランファイル削除の PR を作るか、次の機会のためにそのまま残すかを判断。

判断基準: 設計書 (`resume-yagish-design.md`) は将来の応募時に参照する可能性があるので残す。プラン (`resume-yagish-plan.md`) は実装が終われば不要なので削除推奨。

---

## 完了基準

- [ ] `aspects/job/search/resume-yagish.md` の disり表現が結果ベース表現に書き換わっている
- [ ] フリー株式会社の資本金・従業員数が記入されている
- [ ] 全体を読み直して軸ブレ・数値重複・文字数オーバーがない
- [ ] PR がマージされ、main が最新になっている
- [ ] worktree がクリーンアップされている

---

## 注意事項

- **Groundtruth の従業員数**は設計書の方針通り「約10名（自身が所属したチームの規模）」のまま据え置く（実装ステップ不要）
- **freee Eラーニングのビジネス成果**はリリース直後で数値が取れない（ユーザー確認済み）ため、技術的成果での補強は既に記載済みの状態を維持
- **既存 worktree（`fix/dead-path-refs`、`chore/monthly-tidy-yml`）** は別件のため触らない
