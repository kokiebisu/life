# /kondate コマンド実装プラン

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在庫ベースで作り置き対応の複数食分献立を AI が自動提案し、一括で daily ファイルと Notion meals DB に登録する `/kondate` コマンドを実装する。

**Architecture:** `.claude/commands/kondate.md` を1ファイル作成するのみ。既存スクリプト（`notion-add.ts`、`notion-grocery-gen.ts`、`notion-list.ts`）を呼び出す Claude Code コマンドファイル。コードの新規実装は不要。

**Tech Stack:** Markdown（Claude Code コマンド形式）、`bun run scripts/notion-add.ts`、`bun run scripts/notion-grocery-gen.ts`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `.claude/commands/kondate.md` | コマンド本体。フロー全体を記述 |
| Modify | `aspects/diet/CLAUDE.md` | すでに `/kondate` 例外ルールを追記済み（変更不要） |

---

## Task 1: コマンドファイルの作成

**Files:**
- Create: `.claude/commands/kondate.md`

### 作成する内容の仕様（以下をそのまま実装する）

コマンドは以下の5ステップで動作する。スペック（`docs/superpowers/specs/2026-03-17-kondate-design.md`）を完全に踏まえること。

---

- [ ] **Step 1: 既存コマンドの構造を確認する**

  `meal.md` と `event.md` のフォーマットを参考にする（すでに読んでいる）。
  コマンドファイルの構造: タイトル + 1行説明 + 引数 + Step 見出し + 注意事項

- [ ] **Step 2: `.claude/commands/kondate.md` を作成する**

  以下の内容で作成する:

  ```markdown
  # Kondate - 献立計画

  在庫ベースで作り置きを考慮した複数食分の献立を自動提案し、daily ファイルと Notion meals DB に一括登録する。

  ## Step 1: 状況把握

  \```bash
  TZ=Asia/Tokyo date "+%Y-%m-%d %H:%M %a"
  \```

  以下を読む:
  - `aspects/diet/fridge.md` — 生鮮食品の在庫
  - `aspects/diet/pantry.md` — 常備調味料（在庫チェック不要、常にあるものとして扱う）
  - `profile/health.md` — NG食材（トマト・マヨネーズ・ケチャップ・マスタード）
  - 直近の `aspects/diet/daily/YYYY-MM-DD.md` — 登録済み食事の確認

  Notion events DB で今後のイベント（外食・飲み会等）を確認する:
  \```bash
  bun run scripts/notion-list.ts --days 7 --json
  \```

  状況把握後、除外される食事枠をユーザーに提示してから食数を聞く:
  ```
  〇日分で計画します。
  ・火曜夜: events DB に「飲み会」があるため除外（外食として記載）

  何食分計画しますか？（例: 朝3・昼0・夕3 = 6食）
  ```

  ## Step 2: 献立を自動提案する

  食数の回答を受けたら、以下の優先順位で献立を構成する:

  1. **作り置き向き食材を特定** — fridge.md で量が多い食材（肉・キャベツ等）を複数食にまたがって使い切る計画を立てる
  2. **実在レシピを検索** — 以下の優先順で使用:
     - [クラシル](https://www.kurashiru.com/) — メイン
     - [白ごはん.com](https://www.sirogohan.com/) — 和食基本
     - [Nadia](https://oceans-nadia.com/) — アレンジ
     - [DELISH KITCHEN](https://delishkitchen.tv/) — 簡単メニュー
  3. **NG食材を除外** — `profile/health.md` の食べられないもの参照
  4. **全材料を提示** — 調味料含め全材料を1人前換算で表示

  **在庫にない食材の扱い:**
  - 原則は `fridge.md` にある食材のみで組む
  - 少量の不足食材がある場合は「⚠️ 不足」として提案に含める（承認時に買い出し登録）
  - `pantry.md` の常備調味料は在庫チェック不要

  レシピが見つからない場合は別プラットフォームで再検索。それでも見つからない場合のみオートミール等のシンプルな定番に差し替える。

  **提案フォーマット:**
  ```
  【月 朝食】オートミール + 蜂蜜
    材料: オートミール 40g、蜂蜜 大さじ1
    推定: ~300kcal
    在庫: ✅ 全材料あり

  【月 夕食】豚キャベツ蒸し（クラシル）
    材料: 豚こま 200g、キャベツ 1/4個、生姜 1片、
          酒 大さじ1、醤油 大さじ1、ごま油 小さじ1
    推定: ~480kcal
    在庫: ✅ 全材料あり

  【火 夕食】豚の生姜焼き + 玄米（白ごはん.com）※作り置き豚こま使用
    材料: 豚こま 150g（作り置き）、玄米パック 1食、
          醤油 大さじ1.5、みりん 大さじ1、酒 大さじ1、砂糖 小さじ1
    推定: ~550kcal
    在庫: ⚠️ 不足: 長ねぎ（承認時に買い出し登録します）
  ```

  ## Step 3: ユーザー承認 or 修正

  - 「OK」「LGTM」→ Step 4 へ
  - 「〇〇を変えて」「火曜の夕食なしにして」→ 該当部分のみ差し替えて再提案
  - 修正は何度でも対応する

  ## Step 4: 一括登録（承認後・確認なしで自動実行）

  ### 4a. Notion meals DB に登録

  全食事を `notion-add.ts` で登録する（`notion-add.ts` が内部で重複チェックとレシピ生成を自動実行するため、別途 `validate-entry.ts` や `notion-recipe-gen.ts` は呼ばない）:

  \```bash
  bun run scripts/notion-add.ts --db meals --title "メニュー名" --date YYYY-MM-DD --start HH:MM --end HH:MM
  \```

  **食事時間のデフォルト:**
  - 朝食: 08:00〜09:00
  - 昼食: 12:00〜13:00
  - 夕食: 19:00〜20:00

  類似エントリが検出された場合（終了コード 1）はユーザーに確認してから登録する。

  ### 4b. daily ファイル作成・更新

  `aspects/diet/daily/YYYY-MM-DD.md` を作成または更新。フォーマットは `aspects/diet/daily/2026-03-06.md` と同一:

  ```markdown
  # YYYY-MM-DD（曜日）

  ## 朝食 08:00-09:00
  メニュー名
  - 材料1 量
  - 材料2 量
  - ~XXX kcal

  ## 昼食 12:00-13:00
  メニュー名
  - 材料1 量
  - ~XXX kcal

  ## 夕食 19:00-20:00
  メニュー名
  - 材料1 量
  - 材料2 量
  - ~XXX kcal

  **合計: ~XXXX kcal**
  ```

  スキップした食事枠は「—」と記載。外食は「外食（詳細）」と記載。

  ### 4c. fridge.md は変更しない

  消費時にイベント駆動で減算する既存ルール通り。`/kondate` では触らない。

  ### 4d. 不足食材がある場合: 買い出しリスト更新

  ⚠️ 不足食材が1つ以上あった場合、`notion-grocery-gen.ts` で買い出しリストを再生成する:

  \```bash
  bun run scripts/notion-grocery-gen.ts --date YYYY-MM-DD
  \```

  手動で Notion 買い出しページを編集しない（フォーマット崩れ防止）。

  ## Step 5: 報告（1-2行で簡潔に）

  ```
  6食分の献立を登録した。
  月: 朝 オートミール(300) / 夕 豚キャベツ蒸し(480)
  火: 朝 オートミール(300) / 夕 豚生姜焼き+玄米(550)
  水: 朝 オートミール(300) / 夕 豚キャベツ炒め(460)
  合計推定: ~2,390kcal/日平均
  ✅ 買い出しリスト更新済（長ねぎ追加）
  ```

  ## 注意

  - **全 Step を1回のレスポンスで完了させる。** Step 1 だけで止まらない（ただし Step 3 でユーザーの承認を待つ）
  - Step 2 でレシピを検索するため WebSearch を使う
  - NG食材チェック: `profile/health.md` 参照（トマト、マヨネーズ、ケチャップ、マスタード）
  - 食事の所要時間は原則1時間で登録する
  - `/meal` との棲み分け: `/kondate` は計画（未来）、`/meal` は記録（過去）
  ```

- [ ] **Step 3: ファイルが正しく作成されたか確認する**

  ```bash
  head -5 .claude/commands/kondate.md
  ```

  期待出力:
  ```
  # Kondate - 献立計画
  ```

- [ ] **Step 4: スペックとのチェックリスト確認**

  以下がすべてコマンドファイルに含まれているか確認する:

  - [ ] `TZ=Asia/Tokyo date` で現在時刻確認
  - [ ] `fridge.md` と `pantry.md` 両方を読む
  - [ ] `profile/health.md` でNG食材確認
  - [ ] Notion events DB でイベント確認（`notion-list.ts`）
  - [ ] 除外食事枠をユーザーに提示してから食数を聞く
  - [ ] レシピは4プラットフォームから検索（クラシル優先）
  - [ ] 全材料を1人前換算で提示
  - [ ] `pantry.md` の調味料は在庫チェック不要と明記
  - [ ] ⚠️ 不足食材の扱いが明記
  - [ ] Step 3 でユーザー承認を待つ
  - [ ] `notion-add.ts --db meals` で登録（validate-entry.ts は別途不要と明記）
  - [ ] daily ファイルのフォーマットが `2026-03-06.md` 参照と明記
  - [ ] スキップ枠は「—」、外食は「外食（詳細）」
  - [ ] fridge.md は変更しないと明記
  - [ ] 不足食材があれば `notion-grocery-gen.ts` で買い出し更新
  - [ ] 全 Step を1回のレスポンスで完了（Step 3 待ちは例外）

- [ ] **Step 5: コミット**

  ```bash
  git add .claude/commands/kondate.md
  git commit -m "feat: /kondate コマンド追加（作り置き対応・献立計画）"
  ```

---

## 完了基準

- `.claude/commands/kondate.md` が作成されている
- スペックの全要件がコマンドに反映されている
- `/kondate` と打てばコマンドが起動する（Claude Code のコマンドリストに表示）
