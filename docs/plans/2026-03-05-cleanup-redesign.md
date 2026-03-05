# /cleanup リデザイン 実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 過去の未完了エントリを全て洗い出し、routine は自動削除、それ以外は1件ずつ対話的に処理する `/cleanup` スキルを作る。

**Architecture:** CLIスクリプト `scripts/notion-cleanup.ts` で未完了エントリを取得・JSON出力し、スキルファイル `.claude/commands/cleanup.md` がそのスクリプトを呼び出して対話的に処理する。既存の `queryDbByStatus` + `normalizePages` を活用。

**Tech Stack:** Bun, Notion API (`scripts/lib/notion.ts`), Claude Code skill (`.claude/commands/cleanup.md`)

---

### Task 1: CLIスクリプト `notion-cleanup.ts` を作成

**Files:**
- Create: `scripts/notion-cleanup.ts`

このスクリプトは全スケジュールDBから未完了エントリを取得し、日付が今日より前のものだけを抽出してJSON出力する。

**Step 1: スクリプトを作成**

```typescript
#!/usr/bin/env bun
/**
 * 過去の未完了エントリ取得
 *
 * 使い方:
 *   bun run scripts/notion-cleanup.ts          # 全期間の過去未完了（JSON）
 *   bun run scripts/notion-cleanup.ts --date 2026-03-01  # 指定日のみ
 */

import {
  type ScheduleDbName, type NormalizedEntry, SCHEDULE_DB_CONFIGS,
  getScheduleDbConfigOptional, queryDbByStatus, normalizePages, todayJST,
  parseArgs,
} from "./lib/notion";

async function main() {
  const { opts } = parseArgs();
  const today = todayJST();
  const targetDate = opts.date || null;

  const allEntries: NormalizedEntry[] = [];
  const dbNames = Object.keys(SCHEDULE_DB_CONFIGS) as ScheduleDbName[];

  // 各DBの未完了ステータス名（statusDone以外を取得するためnot-doneで絞る）
  const queries = dbNames.map(async (name) => {
    const dbConf = getScheduleDbConfigOptional(name);
    if (!dbConf) return;
    const { apiKey, dbId, config } = dbConf;

    // ステータスが完了でないものを取得
    // Notion APIではstatus != Xのフィルタを使う
    const filter: Record<string, unknown> = {
      and: [
        { property: config.statusProp, status: { does_not_equal: config.statusDone } },
        // 日付が存在するもののみ（日付なしは対象外）
        { property: config.dateProp, date: { is_not_empty: true } },
        // 日付が今日より前
        { property: config.dateProp, date: { before: today + "T00:00:00+09:00" } },
        ...(config.extraFilter ? [config.extraFilter] : []),
      ],
    };

    if (targetDate) {
      // 指定日のみに絞る
      (filter.and as any[]).push(
        { property: config.dateProp, date: { on_or_after: targetDate + "T00:00:00+09:00" } },
        { property: config.dateProp, date: { on_or_before: targetDate + "T23:59:59+09:00" } },
      );
    }

    const data = await dbConf.apiKey
      ? await (async () => {
          const { notionFetch } = await import("./lib/notion");
          return notionFetch(apiKey, `/databases/${dbId}/query`, {
            filter,
            sorts: [{ property: config.dateProp, direction: "ascending" }],
          });
        })()
      : { results: [] };

    allEntries.push(...normalizePages(data.results, config, name));
  });
  await Promise.all(queries);

  // 日付順でソート
  allEntries.sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  console.log(JSON.stringify(allEntries, null, 2));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
```

注: `notionFetch` を直接使ってカスタムフィルタでクエリする。`queryDbByStatus` は完了ステータス名しか指定できないため、`does_not_equal` + `date.before` の組み合わせには直接APIコールが必要。

**Step 2: 動作確認**

```bash
bun run scripts/notion-cleanup.ts
```

Expected: 過去の未完了エントリがJSON配列で出力される。

**Step 3: コミット**

```bash
git add scripts/notion-cleanup.ts
git commit -m "feat: add notion-cleanup.ts for fetching past incomplete entries"
```

---

### Task 2: `/cleanup` スキルファイルを書き換え

**Files:**
- Modify: `.claude/commands/cleanup.md`

**Step 1: スキルファイルを書き換える**

新しい `cleanup.md` の内容:

```markdown
# Cleanup - 過去の未完了エントリ整理

過去の未完了エントリを全て洗い出し、1件ずつ対話的に処理する。

## Steps

1. **過去の未完了エントリを取得する**
   ```bash
   bun run scripts/notion-cleanup.ts
   # 日付指定の場合:
   # bun run scripts/notion-cleanup.ts --date $ARGUMENTS
   ```

2. **routine エントリを自動削除する**
   - source が `routine` のエントリを全て抽出
   - `notion-delete.ts` で一括削除
   - 削除したエントリ名と件数を報告
   ```bash
   bun run scripts/notion-delete.ts <routine-id1> <routine-id2> ...
   ```

3. **残りのエントリを1件ずつ対話的に処理する**
   - 日付が古い順に1件ずつ提示する
   - 各エントリについて以下を表示:
     - DB名（events/todo/meals/groceries/guitar/sound）
     - タイトル
     - 日付
     - ステータス
   - 選択肢を提示（推奨を明記する）:
     1. 削除（guitar/sound の場合は日付クリア）
     2. 今日に移動
     3. 別日に移動（日付を聞く）
     4. 完了にする
   - DB種別に応じた推奨:
     - meals → 削除を推奨（過去の食事は不要）
     - groceries → 削除を推奨（過去の買い出しは不要）
     - todo → 今日に移動を推奨（やるべきことは持ち越す）
     - events → 削除を推奨（過去のイベントは不要）
     - guitar/sound → 削除（日付クリア）を推奨

4. **各エントリの処理を実行する**
   - 削除: `bun run scripts/notion-delete.ts <page-id>`
   - 日付クリア（guitar/sound）: `notion-update-page` で日付を null に
   - 今日に移動: `notion-update-page` で日付を今日（終日）に変更
   - 別日に移動: `notion-update-page` で指定日（終日）に変更
   - 完了にする: `notion-update-page` でステータスを完了に変更

5. **キャッシュをクリアする**
   ```bash
   bun run scripts/cache-status.ts --clear
   ```

6. **結果サマリを報告する**
   - 削除○件、移動○件、完了○件
   - 今日のエントリを表示して確認:
   ```bash
   bun run scripts/notion-list.ts --date $(TZ=Asia/Tokyo date +%Y-%m-%d)
   ```

## 引数

- `$ARGUMENTS` が空 → 全期間の過去未完了
- `$ARGUMENTS` が日付（YYYY-MM-DD） → その日のみ対象

## 注意

- 完了済みエントリには触らない
- guitar/sound の「削除」は日付クリア（Lesson ページは再利用するため）
- todo を移動するとき、時間指定は外して終日にする
- 全件必ず処理する（スキップなし）
- routine は自動削除（ユーザー確認不要）

## tasks.md との同期

- todo を「完了にする」場合、`planning/tasks.md` に対応エントリがあれば `[x]` に変更して Archive に移動
- todo を「削除」する場合、`planning/tasks.md` の対応エントリも削除

## 予定キャンセル時

1. Notion: `notion-delete.ts` でページごと完全削除
2. イベントファイル: キャンセルセクションに記録を残す
```

**Step 2: コミット**

```bash
git add .claude/commands/cleanup.md
git commit -m "feat: redesign /cleanup to interactive per-entry processing"
```

---

### Task 3: 動作テスト

**Step 1: スクリプト単体テスト**

```bash
bun run scripts/notion-cleanup.ts
```

Expected: JSON配列が出力される。routine/todo/events等が混在。日付が全て今日より前。

**Step 2: 日付指定テスト**

```bash
bun run scripts/notion-cleanup.ts --date 2026-03-04
```

Expected: 2026-03-04 のエントリのみ出力。

**Step 3: `/cleanup` を実行して対話フローを確認**

手動で `/cleanup` を実行し、routine が自動削除され、残りが1件ずつ提示されることを確認。

**Step 4: コミット（テスト結果に応じて修正があれば）**

```bash
git add -A
git commit -m "fix: adjust cleanup script based on testing"
```

---

### Task 4: PR 作成

`/pr` を実行してPRを作成する。
