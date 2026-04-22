# 学習ノート知識定着システム改善 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/study` のセッション終了時にコーネル式キューを自動生成し、`/fukushuu` のフィードバックを3段階化し、既存ノート約30件にキューを一括追加する。

**Architecture:** 3つのスキル SKILL.md を編集・作成する。コードの変更はなく、すべて Claude への指示（プロンプト）の変更。review-log.json のスキーマに `confidence` フィールドを追加（後方互換）。

**Tech Stack:** Markdown (SKILL.md), JSON (review-log.json)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `skills/study/SKILL.md` | Modify | Step 7 にキュー自動生成ステップを追加、MD テンプレートにキューセクション追加 |
| `skills/fukushuu/SKILL.md` | Modify | 3段階フィードバック、review-log.json スキーマ拡張、キュー不在時の提案 |
| `skills/backfill-cues/SKILL.md` | Create | 既存ノートへのキュー一括追加スキル |

---

### Task 1: `/study` の MD テンプレートにキューセクションを追加

**Files:**
- Modify: `skills/study/SKILL.md:110-142` (MD 内容テンプレート)

- [ ] **Step 1: MD テンプレートにキューセクションを挿入**

`skills/study/SKILL.md` の MD 内容テンプレート（Step 4 内）で、`💡 まとめ` と `❓ 残った疑問・次回へ` の間に新セクションを追加する。

変更前:
```markdown
## 💡 まとめ

（セッション終了時に記入）

## ❓ 残った疑問・次回へ

（理解できなかった点、次のセッションで深めたいこと）
```

変更後:
```markdown
## 💡 まとめ

（セッション終了時に記入）

## ❓ 自分への質問（コーネル式キュー）

（セッション終了時に自動生成）

## ❓ 残った疑問・次回へ

（理解できなかった点、次のセッションで深めたいこと）
```

- [ ] **Step 2: 変更を確認**

`skills/study/SKILL.md` を Read して、テンプレート内にキューセクションが正しい位置（💡 まとめ の後、❓ 残った疑問 の前）に挿入されていることを確認する。

- [ ] **Step 3: コミット**

```bash
git add skills/study/SKILL.md
git commit -m "feat: study テンプレートにコーネル式キューセクションを追加"
```

---

### Task 2: `/study` の Step 7 にキュー自動生成を追加

**Files:**
- Modify: `skills/study/SKILL.md:196-231` (Step 7: セッション終了)

- [ ] **Step 1: Step 7 にキュー生成ステップを挿入**

Step 7 の手順2（まとめ作成）と手順3（MD 更新）の間に、以下の手順 2.5 を挿入する。手順 2.5 の後、既存の手順3〜6 はそのまま維持する（手順3 の「MD を最終内容で更新する」が、キューも含めた全文を書き込む）。

挿入する内容（手順2 の直後に追加）:

```markdown
2.5. **コーネル式キューを生成する**:
   - ノート内容（📝 ノート + 🔑 キーワード + 💡 まとめ）を分析する
   - 3〜5問の質問を生成する。質問タイプはノート内容に応じて最適なバランスで選ぶ:
     - **概念確認型:** 「〇〇とは？」「〇〇と〇〇の違いは？」
     - **応用型:** 「このケースでどう設計する？」「なぜこの方法を選ぶ？」
     - **判断力型:** 「〇〇のメリット・デメリットは？」「どういう条件で〇〇を使う？」
   - ユーザーの就活目標（テックリード / シニアフルスタック）を踏まえ、面接で問われそうな角度を優先する
   - ユーザーに提示して確認する（追加・削除・修正OK）
   - 確定したキューを MD の `## ❓ 自分への質問（コーネル式キュー）` セクションに書き込む

   例:
   ```
   セッションの内容から復習用の質問を作りました:

   1. B-Treeインデックスの計算量は？なぜ「オール4の秀才型」と言えるか？
   2. インデックスが適用されない5つのパターンを挙げよ
   3. カーディナリティが高くてもインデックスが効かないケースとは？
   4. パーティションの3種類（レンジ・リスト・ハッシュ）はそれぞれどういうデータに適しているか？

   追加・修正したい質問はありますか？（なければそのまま保存します）
   ```
```

- [ ] **Step 2: 変更を確認**

`skills/study/SKILL.md` を Read して、Step 7 の流れが以下の順序になっていることを確認:
1. 終了確認
2. まとめ・残った疑問を作成
3. **(新規)** コーネル式キューを生成・確認
4. MD を最終内容で更新
5. Notion に同期
6. キャッシュクリア
7. 完了報告

- [ ] **Step 3: コミット**

```bash
git add skills/study/SKILL.md
git commit -m "feat: study セッション終了時にコーネル式キューを自動生成"
```

---

### Task 3: `/fukushuu` の3段階フィードバック化

**Files:**
- Modify: `skills/fukushuu/SKILL.md:64-79` (Step 4: 対話的クイズ)

- [ ] **Step 1: Step 4 のフィードバック部分を書き換え**

`skills/fukushuu/SKILL.md` の Step 4「各ノートの処理」の手順4〜5 を以下に置き換える。

変更前:
```markdown
4. 全問終了後:「このノート、覚えてた？ (y/n)」と聞く
5. 回答に応じて次回スケジュールを伝える:
   - y → 「次回は〇〇日です」
   - n → 「もう一度、明日復習しましょう」
```

変更後:
```markdown
4. 全問終了後、AskUserQuestion で3段階の自己評価を聞く:
   - ⭕ 完璧（全問スラスラ答えられた）
   - 🔺 あいまい（方向性は合ってたが細部が怪しい）
   - ❌ 忘れた（ほぼ思い出せなかった）
5. 回答に応じて次回スケジュールを伝える:
   - ⭕ 完璧 → review_count +1、通常間隔テーブル通り。「次回は〇〇日です」
   - 🔺 あいまい → review_count・interval_days 変更なし、last_reviewed だけ今日に更新。「同じ間隔でもう1回復習します。次回は〇〇日です」
   - ❌ 忘れた → review_count を 0 にリセット、interval_days を 1 に。「もう一度、明日復習しましょう」
```

- [ ] **Step 2: 変更を確認**

`skills/fukushuu/SKILL.md` を Read して、手順4〜5 が3段階になっていることを確認。

- [ ] **Step 3: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "feat: fukushuu フィードバックを3段階化（完璧/あいまい/忘れた）"
```

---

### Task 4: `/fukushuu` の review-log.json スキーマ拡張

**Files:**
- Modify: `skills/fukushuu/SKILL.md:87-104` (Step 5: review-log.json を更新)

- [ ] **Step 1: Step 5 の JSON サンプルとフィールド説明を更新**

変更前:
```markdown
```json
{
  "aspects/study/system-design/fundamentals/scale-from-zero.md": {
    "last_reviewed": "YYYY-MM-DD",
    "interval_days": 3,
    "review_count": 2
  }
}
```

- `last_reviewed`: 今日の日付（JST）
- `review_count`: y なら +1、n なら 0 にリセット
- `interval_days`: 上記の interval_map から review_count に対応する値
```

変更後:
```markdown
```json
{
  "aspects/study/system-design/fundamentals/scale-from-zero.md": {
    "last_reviewed": "YYYY-MM-DD",
    "interval_days": 3,
    "review_count": 2,
    "confidence": "perfect"
  }
}
```

- `last_reviewed`: 今日の日付（JST）。3段階すべてで更新する
- `review_count`: ⭕ 完璧 → +1、🔺 あいまい → 変更なし、❌ 忘れた → 0 にリセット
- `interval_days`: ⭕ 完璧 → interval_map から review_count に対応する値、🔺 あいまい → 変更なし、❌ 忘れた → 1
- `confidence`: 最新の自己評価。`"perfect"` / `"fuzzy"` / `"forgot"` のいずれか。既存エントリに `confidence` がなくても正常動作する（後方互換）
```

- [ ] **Step 2: 変更を確認**

`skills/fukushuu/SKILL.md` を Read して、JSON サンプルに `confidence` フィールドが含まれ、フィールド説明が3段階に対応していることを確認。

- [ ] **Step 3: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "feat: fukushuu review-log に confidence フィールドを追加"
```

---

### Task 5: `/fukushuu` のキュー不在時の処理改善

**Files:**
- Modify: `skills/fukushuu/SKILL.md:81-85` (コーネル式キューがないノートの場合)

- [ ] **Step 1: キュー不在時の処理にキュー生成提案を追加**

変更前:
```markdown
### コーネル式キューがないノートの場合

`❓ 自分への質問` セクションが存在しない、または空のとき:
- `🧒 一言で言うと` を隠した状態でノートのタイトルだけ見せ「このトピック、何を学んだか説明してみて」と問いかける
- ユーザーの説明後に `一言で言うと` と主要ポイントを表示する
```

変更後:
```markdown
### コーネル式キューがないノートの場合

`❓ 自分への質問` セクションが存在しない、または空のとき:
- `🧒 一言で言うと` を隠した状態でノートのタイトルだけ見せ「このトピック、何を学んだか説明してみて」と問いかける
- ユーザーの説明後に `一言で言うと` と主要ポイントを表示する
- 自己評価（3段階）の後、「このノートにコーネル式キューがなかったので、今の内容から生成しますか？」と提案する
  - ユーザーが承諾 → ノート内容から 3〜5問のキューを生成し、MD の `💡 まとめ` の後に `## ❓ 自分への質問（コーネル式キュー）` セクションとして書き込む。Notion にも同期する
  - ユーザーが辞退 → そのまま次のノートへ進む
```

- [ ] **Step 2: 変更を確認**

`skills/fukushuu/SKILL.md` を Read して、キュー不在時の処理にキュー生成提案が追加されていることを確認。

- [ ] **Step 3: コミット**

```bash
git add skills/fukushuu/SKILL.md
git commit -m "feat: fukushuu キュー不在ノートでキュー生成を提案"
```

---

### Task 6: `/backfill-cues` スキルを新規作成

**Files:**
- Create: `skills/backfill-cues/SKILL.md`

- [ ] **Step 1: スキルディレクトリとファイルを作成**

`skills/backfill-cues/SKILL.md` を以下の内容で作成する:

```markdown
---
name: backfill-cues
description: 既存の学習ノートにコーネル式キュー（自分への質問）を一括追加する。「キュー追加」「バックフィル」などに使う。
---

# backfill-cues — 既存ノートへのコーネル式キュー一括追加

既存の学習ノートに `❓ 自分への質問（コーネル式キュー）` を一括追加し、`/fukushuu` での復習を有効にする。

## Step 1: 今日の日付を確認

```bash
TZ=Asia/Tokyo date +%Y-%m-%d
```

## Step 2: 対象ノートを特定

Glob で `aspects/study/**/notes/*.md` を取得し、以下を**除外**する:

- `**/CLAUDE.md`
- `**/README.md`
- `**/roadmap.md`
- `aspects/study/team/**`

各ノートを Read し、`## ❓ 自分への質問（コーネル式キュー）` セクションの有無をチェックする。

- セクションが**ある**（質問が1問以上）→ スキップ
- セクションが**ない**、または空 → 対象

ユーザーに対象件数を報告する:

```
コーネル式キューがないノートが {N} 件見つかりました。
1件ずつキューを生成して書き込みます。
```

対象が 0 件なら「すべてのノートにキューがあります ✅」と伝えて終了。

## Step 3: 1件ずつキューを生成・書き込み

対象ノートを日付の古い順に処理する。各ノートについて:

1. ノートを Read する（📝 ノート + 🔑 キーワード + 💡 まとめ を読む）
2. 3〜5問のコーネル式キューを生成する。質問タイプはノート内容に応じて最適なバランスで選ぶ:
   - **概念確認型:** 「〇〇とは？」「〇〇と〇〇の違いは？」
   - **応用型:** 「このケースでどう設計する？」「なぜこの方法を選ぶ？」
   - **判断力型:** 「〇〇のメリット・デメリットは？」「どういう条件で〇〇を使う？」
   - ユーザーの就活目標（テックリード / シニアフルスタック）を踏まえ、面接で問われそうな角度を優先する
3. MD に書き込む: `## 💡 まとめ` セクションの後、`## ❓ 残った疑問・次回へ` セクションの前に挿入する

   ```markdown
   ## ❓ 自分への質問（コーネル式キュー）

   1. 質問1
   2. 質問2
   3. 質問3
   ```

4. Notion に同期する: フロントマターの `notion_id` を使い、`notion-update-page` の `replace_content` で MD 全体を Notion ページ本文に反映する
5. 進捗を報告する: `[{処理済み}/{全件}] {ファイル名} ✅ ({N}問生成)`

**注意:** ユーザーへの確認は不要（1件ずつ承認を求めない）。全件を連続処理する。

## Step 4: review-log.json をリセット

全件の処理が完了したら、`aspects/study/review-log.json` を Write で更新する:

- 全エントリの `review_count` を `0` に設定
- 全エントリの `interval_days` を `0` に設定
- `last_reviewed` と `confidence` はそのまま残す（または削除してもよい）

これにより、全ノートが次回の `/fukushuu` で復習対象になる。

## Step 5: キャッシュクリアと完了報告

```bash
bun run scripts/cache-status.ts --clear
```

```
バックフィル完了 ✅

📝 処理済み: {N} 件
🔄 review-log リセット済み（全ノートが復習対象に戻りました）

次回 /fukushuu で新しいキューを使った復習ができます。
```
```

- [ ] **Step 2: ファイルが正しく作成されたことを確認**

`skills/backfill-cues/SKILL.md` を Read して、フロントマター（name, description）と Step 1〜5 が正しく記述されていることを確認。

- [ ] **Step 3: コミット**

```bash
git add skills/backfill-cues/SKILL.md
git commit -m "feat: backfill-cues スキルを新規作成（既存ノートへのキュー一括追加）"
```

---

### Task 7: 最終確認

- [ ] **Step 1: 全ファイルの整合性を確認**

以下の3ファイルを Read して、相互の整合性を確認する:

1. `skills/study/SKILL.md` — テンプレートにキューセクションがある、Step 7 にキュー生成がある
2. `skills/fukushuu/SKILL.md` — 3段階フィードバック、confidence フィールド、キュー不在時の提案
3. `skills/backfill-cues/SKILL.md` — キュー生成方針が `/study` と一致、review-log リセットのスキーマが `/fukushuu` と一致

確認ポイント:
- キューセクション名が全ファイルで `## ❓ 自分への質問（コーネル式キュー）` に統一されているか
- キュー配置場所が全ファイルで「💡 まとめ の後、❓ 残った疑問 の前」に統一されているか
- confidence の値が `/fukushuu` と `/backfill-cues` で `"perfect"` / `"fuzzy"` / `"forgot"` に統一されているか

- [ ] **Step 2: 不整合があれば修正してコミット**
