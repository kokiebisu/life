# sync:lessons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** カリキュラム DB のレッスンページに MD ファイルの内容を自動書き込みするスキルを作成する

**Architecture:** `.claude/skills/sync-lessons/SKILL.md` にスキルを作成。Claude が MD を読み、aspect 固有の strip ルール（各 CLAUDE.md 参照）で不要セクションを除外し、Notion MCP `notion-update-page` の `replace_content` で書き込む。既存の `notion-update-sound-lessons.ts` を廃止する。

**Tech Stack:** Claude Code Skills, Notion MCP, Bun scripts (notion-list.ts)

---

### Task 1: スキルファイル作成

**Files:**
- Create: `.claude/skills/sync-lessons/SKILL.md`

**Step 1: ディレクトリ作成**

Run: `mkdir -p .claude/skills/sync-lessons`

**Step 2: SKILL.md を作成**

```markdown
---
name: sync-lessons
description: >
  Use when lesson pages in the curriculum DB (guitar/sound) have empty content,
  when registering lessons to the curriculum DB, or when the user asks about
  lesson content and the Notion page is empty. Also use when explicitly invoked
  via /sync:lessons. TRIGGER proactively: if you touch a curriculum page and
  notice it has no body content, invoke this skill immediately.
---

# Sync Lessons — カリキュラムページ本文同期

## Overview

カリキュラム DB（ギター・音響等）の Notion ページに、リポジトリの MD レッスンファイルの内容を書き込む。

## When to Use

- レッスンをカリキュラム DB に登録したとき（`/event`, `/calendar` 等）
- Notion のレッスンページに触れて本文が空だと気づいたとき
- ユーザーがレッスン内容について質問し、Notion ページが空だったとき
- ユーザーが明示的に `/sync:lessons` を実行したとき
- `/cleanup`, `/from:notion` でレッスンページを処理するとき

**空ページを放置してはいけない。** レッスンページの本文が空のまま処理を終えることは許されない。

## 引数

- `$ARGUMENTS` の形式:
  - `guitar 6` → ギター Lesson 6 のみ
  - `sound` → Sound 全レッスン
  - `guitar` → ギター全レッスン
  - `all` or 引数なし → 全カリキュラムの空ページを検出して一括処理

## 処理手順

### 1. 対象 aspect の特定

カリキュラム DB の aspect 一覧:

| aspect | DB flag | MD パス | カリキュラム値 |
|--------|---------|---------|---------------|
| guitar | `--db guitar` | `aspects/guitar/phase*/lesson-*.md` | ギター |
| sound | `--db sound` | `aspects/sound/phase*/lesson-*.md` | 音響 |

今後 aspect が追加されたらこの表に追加する。

### 2. Notion ページの検索

```bash
bun run scripts/notion-list.ts --db {guitar|sound} --all --json
```

- `--all` で日付に関係なく全レッスンを取得
- レスポンスからページ ID とタイトルを取得

### 3. 空ページの判定

各ページに対して `notion-fetch` でページ本文を確認:
- 本文が空 or 実質的に内容がない → 書き込み対象
- 既に内容がある → スキップ（上書きしない）

**特定レッスンが指定された場合:** 空でなくても書き込む（明示的な再同期）

### 4. MD ファイルの読み込みと strip

1. タイトルからレッスン番号を抽出（"Lesson 6: ..." → 6）
2. `aspects/{aspect}/phase*/lesson-{NN}.md` を Read ツールで読む
3. **対象 aspect の CLAUDE.md を読み、「除外するセクション」「Notion 書式ルール」を確認する**
4. 以下を strip する:
   - タイトル行（最初の `# Lesson ...` 行）
   - 各 aspect の CLAUDE.md に記載された除外セクション

### 5. Notion ページに書き込み

`notion-update-page` の `replace_content` で本文全体を設定する。

**フォーマットは各 aspect の CLAUDE.md「Notion 書式ルール」に従う。**

### 6. 結果報告

書き込んだページのリストを報告:
```
sync:lessons 完了:
- ✅ Lesson 6: dim＆オルタード（guitar）
- ✅ Lesson 7: 分数コード（guitar）
- ⏭️ Lesson 1: フィンガーピッキング（guitar）— 既に内容あり、スキップ
```
```

**Step 3: コミット**

```bash
git add .claude/skills/sync-lessons/SKILL.md
git commit -m "feat: add sync:lessons skill for curriculum page content sync"
```

---

### Task 2: ギターで動作確認

**手動テスト。スキルを invoke して、ギターの空ページ1つに書き込めることを確認する。**

**Step 1: カリキュラム DB のギターレッスン一覧を取得**

Run: `bun run scripts/notion-list.ts --db guitar --all --json`

**Step 2: 空ページを1つ特定**

- 結果からページ ID を取得
- `notion-fetch` でページ本文を確認
- 空のページを1つ選ぶ

**Step 3: 対応する MD ファイルを読む**

- レッスン番号から `aspects/guitar/phase*/lesson-{NN}.md` を特定
- Read ツールで読む

**Step 4: strip して書き込む**

- タイトル行、「練習メニュー（1週間）」、「次回予告」を除外
- `notion-update-page` の `replace_content` で書き込む

**Step 5: 書き込み結果を確認**

- `notion-fetch` でページ本文を再確認
- 内容が正しく入っていることを確認

---

### Task 3: Sound で動作確認

**Task 2 と同様の手順を Sound で実施。**

- Sound の strip ルール: タイトル行、「復習メニュー」、「次回予告」、「Phase まとめ」
- `bun run scripts/notion-list.ts --db sound --all --json` で一覧取得
- 空ページ1つに書き込み → 確認

---

### Task 4: 全空ページ一括処理

**Step 1: ギター全レッスンの空ページを検出して一括書き込み**

- `notion-list.ts --db guitar --all --json` → 全ページ取得
- 各ページを `notion-fetch` → 空なら書き込み
- 結果報告

**Step 2: Sound 全レッスンの空ページを検出して一括書き込み**

- 同上

**Step 3: コミット（変更があれば）**

---

### Task 5: `notion-update-sound-lessons.ts` 廃止

**Files:**
- Delete: `scripts/notion-update-sound-lessons.ts`

**Step 1: スクリプト削除**

```bash
git rm scripts/notion-update-sound-lessons.ts
```

**Step 2: スクリプトへの参照を検索して除去**

```bash
grep -r "notion-update-sound-lessons" --include="*.md" .
```

見つかった参照を更新 or 削除する。

**Step 3: コミット**

```bash
git commit -m "chore: remove notion-update-sound-lessons.ts, replaced by sync:lessons skill"
```

---

### Task 6: 関連ドキュメント更新

**Files:**
- Modify: `aspects/guitar/CLAUDE.md` — スキルへの参照を追加
- Modify: `aspects/sound/CLAUDE.md` — スキルへの参照を追加

**Step 1: guitar CLAUDE.md 更新**

「Notion レッスンページの内容反映（必須）」セクションに、sync:lessons スキルが自動で処理する旨を追記。

**Step 2: sound CLAUDE.md 更新**

同様に sync:lessons スキルへの参照を追記。

**Step 3: コミット**

```bash
git add aspects/guitar/CLAUDE.md aspects/sound/CLAUDE.md
git commit -m "docs: reference sync:lessons skill in guitar and sound CLAUDE.md"
```
