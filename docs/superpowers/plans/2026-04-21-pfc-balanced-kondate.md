# PFCバランス献立 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/kondate` と `/meal` にPFCバランス追跡を組み込み、週次の栄養目標から逆算した献立提案を実現する。

**Architecture:** `nutrition-targets.md` にPFC目標を定義し、daily ファイルにPFC列を追加。`/kondate` スキルに週次集計 Step を追加し、`/meal` スキルにPFC概算ロジックを追加する。全てスキルファイル（Markdown）とデータファイル（Markdown）の変更のみで、スクリプトの新規作成は不要。

**Tech Stack:** Claude Code Skills (Markdown), aspects/diet/ data files (Markdown)

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `aspects/diet/nutrition-targets.md` | Create | PFC目標値の定義（日次・週次） |
| `.claude/skills/kondate/SKILL.md` | Modify | Step 0（PFC集計）追加、提案フォーマットにPFC追加 |
| `.claude/skills/meal/SKILL.md` | Modify | PFC概算ロジック追加、daily 書き込みフォーマット変更 |
| `aspects/diet/CLAUDE.md` | Modify | daily フォーマット定義にPFC列を追加 |

---

### Task 1: nutrition-targets.md を作成する

**Files:**
- Create: `aspects/diet/nutrition-targets.md`

- [ ] **Step 1: nutrition-targets.md を作成**

```markdown
# 栄養目標

> 最終更新: 2026-04-21
> 体重変化に応じて手動で更新する。

## 身体データ

- 性別: 男性
- 年齢: 30歳
- 身長: 167cm
- 体重: 60kg
- 活動量: 軽め（デスクワーク + ジム週2-3回）

## 算出根拠

- 基礎代謝（Mifflin-St Jeor式）: 1,489 kcal
- TDEE（活動係数1.375）: 2,047 kcal
- 減量目標（-300kcal）: 約 1,750 kcal/日

## 日次目標

| 栄養素 | 割合 | 目標 |
|--------|------|------|
| カロリー | — | 1,750 kcal |
| たんぱく質 (P) | 30% | 131g |
| 脂質 (F) | 25% | 49g |
| 炭水化物 (C) | 45% | 197g |

## 週次目標

| 栄養素 | 目標 |
|--------|------|
| カロリー | 12,250 kcal |
| たんぱく質 (P) | 920g |
| 脂質 (F) | 340g |
| 炭水化物 (C) | 1,380g |

## 週の起点

月曜日（月〜日で1週間）

## PFC概算の基準値

よく使う食材の概算PFC（100gあたり）:

| 食材 | P | F | C | kcal |
|------|---|---|---|------|
| 鶏むね肉（皮なし） | 23g | 1g | 0g | 108 |
| 鶏もも肉（皮なし） | 19g | 5g | 0g | 127 |
| 豚こま肉 | 19g | 15g | 0g | 216 |
| 牛タン | 15g | 22g | 0g | 269 |
| 鮭 | 22g | 4g | 0g | 133 |
| 卵（1個 60g） | 7g | 6g | 0g | 80 |
| 木綿豆腐 | 7g | 4g | 2g | 72 |
| 納豆（1パック 45g） | 7g | 5g | 5g | 90 |
| 玄米パック（1食 160g） | 4g | 1g | 56g | 248 |
| オートミール（40g） | 5g | 2g | 25g | 140 |
| 玉ねぎ（1個 200g） | 2g | 0g | 18g | 74 |
| キャベツ（1/4個 250g） | 3g | 0g | 13g | 58 |
| ブロッコリー（100g） | 4g | 0g | 5g | 33 |

### コンビニ食の概算

| 食品 | P | F | C | kcal |
|------|---|---|---|------|
| おにぎり（1個） | 4g | 2g | 38g | 200 |
| サンドイッチ（1個） | 10g | 12g | 30g | 300 |
| コンビニ弁当 | 25g | 25g | 85g | 700 |
| カップ麺 | 8g | 15g | 50g | 380 |
| サラダチキン（1個） | 25g | 2g | 1g | 120 |
```

- [ ] **Step 2: Commit**

```bash
git add aspects/diet/nutrition-targets.md
git commit -m "docs: 栄養目標ファイル追加（PFCバランス献立の基盤）"
```

---

### Task 2: `/kondate` スキルに Step 0（PFC集計）を追加する

**Files:**
- Modify: `.claude/skills/kondate/SKILL.md`

- [ ] **Step 1: Step 1 の前に Step 0 を挿入する**

現在の `## Step 1: 状況把握` の直前に、新しい `## Step 0: 今週のPFC実績を集計する` セクションを追加する。

追加内容:

```markdown
## Step 0: 今週のPFC実績を集計する

Step 1 の状況把握と並行して、今週の栄養バランスを確認する。

1. `aspects/diet/nutrition-targets.md` からPFC目標を読み込む
2. 今週（月〜日）の `aspects/diet/daily/*.md` を全て読む
3. 各食事の PFC 値を合計して「今週の実績」を算出（`P: —` の外食は除外）
4. 週目標との差分から「残り日数で1日あたり必要なPFC」を逆算

**ユーザーに表示するフォーマット:**

    【今週の栄養バランス】（月〜火 実績 / 水〜日 残り）
            実績    週目標   残り5日で1日あたり
    P:     50g    920g    → 174g/日（通常より多め ↑）
    F:     30g    340g    → 62g/日（通常どおり）
    C:    100g   1,380g   → 256g/日（通常どおり）
    kcal:  900   12,250   → 2,270 kcal/日

5. 不足が大きい栄養素を特定し、Step 2 のメニュー選定で優先する:
   - たんぱく質不足 → 鶏むね肉・卵・豆腐・魚を優先
   - 脂質過多 → 蒸し・茹で系を優先、揚げ物・炒め物を避ける
   - 炭水化物不足 → 玄米・オートミールをしっかり組む

PFC概算には `nutrition-targets.md` の「PFC概算の基準値」テーブルを使用する。テーブルにない食材は一般的な栄養価から概算する。
```

- [ ] **Step 2: Step 1 の読み込みリストに nutrition-targets.md を追加する**

`## Step 1: 状況把握` の「以下を読む:」リストに追加:

```markdown
- `aspects/diet/nutrition-targets.md` — PFC目標値・食材の概算PFC
```

- [ ] **Step 3: Step 2 の提案フォーマットにPFCを追加する**

`## Step 2: 献立を自動提案する` の「**提案フォーマット:**」を以下に差し替える:

```markdown
**提案フォーマット:**

    【月 朝食】オートミール + 蜂蜜
      材料: オートミール 40g、蜂蜜 大さじ1
      推定: ~300kcal | P: 5g | F: 2g | C: 25g
      在庫: ✅ 全材料あり

    【月 夕食】豚キャベツ蒸し（クラシル）
      材料: 豚こま 200g、キャベツ 1/4個、生姜 1片、
            酒 ��さじ1、醤油 大さじ1、ごま油 小さじ1
      推定: ~480kcal | P: 40g | F: 32g | C: 15g
      在庫: ✅ 全材料あり
      📊 Pが日目標の31%カバー

    【火 夕食】豚の生姜焼き + 玄米（白ごはん.com）※作り置き豚こま使用
      材料: 豚こま 150g（作り置き）、玄米パック 1食、
            醤油 大さじ1.5、みりん 大さじ1、酒 大さじ1、砂糖 小さじ1
      推定: ~550kcal | P: 33g | F: 24g | C: 60g
      在庫: ⚠️ 不足: 長ねぎ（承認時に買い出し登録します）

PFC値は `nutrition-targets.md` の基準値テーブルを使って概算する。テーブルにない食材は一般的な栄養価から概算。
```

- [ ] **Step 4: Step 4b の daily フォーマットにPFCを追加する**

`### 4b. daily ファイル作成・更新` のフォーマットを以下に差し替える:

```markdown
    # YYYY-MM-DD（曜日）

    ## 朝食 08:00-09:00
    メニュー名
    - 材料1 量
    - 材料2 量
    - ~XXX kcal | P: XXg | F: XXg | C: XXg

    ## 昼食 12:00-13:00
    メニュー名
    - 材料1 量
    - ~XXX kcal | P: XXg | F: XXg | C: XXg

    ## 夕食 19:00-20:00
    メニュー名
    - 材料1 量
    - 材料2 量
    - ~XXX kcal | P: XXg | F: XXg | C: XXg

    **合計: ~XXXX kcal | P: XXXg | F: XXg | C: XXXg**
    **目標比: P: XX% | F: XX% | C: XX%**

外食は `P: — | F: — | C: —` と記載。
```

- [ ] **Step 5: Step 5 の報告フォーマットにPFCを追加する**

`## Step 5: 報告` を以下に差し替える:

```markdown
    6食分の献立を登録した。
    月: 朝 オートミール(300) / 夕 豚キャベツ蒸し(480)
    火: 朝 オートミール(300) / 夕 豚生姜焼き+玄米(550)
    水: 朝 オートミール(300) / 夕 豚キャベツ炒め(460)
    合計推定: ~2,390kcal/日平均 | P: 130g/日 | F: 50g/日 | C: 200g/日
    📊 今週のPFC目標カバー率: P 85% / F 92% / C 88%
    ✅ 買い出しリスト更新済（長ねぎ追加）
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/kondate/SKILL.md
git commit -m "feat: /kondate にPFC集計・提案・記録を追加"
```

---

### Task 3: `/meal` スキルにPFC概算ロジックを追加する

**Files:**
- Modify: `.claude/skills/meal/SKILL.md`

- [ ] **Step 1: Step 1 の読み込みリストに nutrition-targets.md を追加する**

`## Step 1: 現在時刻と状況を確認する` のリストに追加:

```markdown
- `aspects/diet/nutrition-targets.md` — PFC概算の基準値テーブル
```

- [ ] **Step 2: Step 3 のテーブルにPFC列を追加する**

`## Step 3: 食事の種類を判別する` のテーブルを以下に差し替える:

```markdown
| 種類 | 判定基準 | レシピ | kcal | PFC |
|------|----------|--------|------|-----|
| 自炊（新規） | 献立にあるメニュー or 食材から調理 | `notion-add.ts` で自動生成 | レシピから算出 | 材料から概算 |
| 残り物・簡易 | 「残り」「パン」「オートミール」「納豆」等 | `--no-recipe` | 概算 | 主要食材から概算 |
| コンビニ・購入品 | 「コンビニ」「カップ」「おにぎり」等 | `--no-recipe` | 一般値で概算 | コンビニ基準値で概算 |
| 外食 | 「外食」「〇〇と」「飲み会」等 | `--no-recipe` | `—` | `P: — \| F: — \| C: —` |

PFC概算には `nutrition-targets.md` の「PFC概算の基準値」テーブルを使用する。テーブルにない食材は一般的な栄養価から概算。
```

- [ ] **Step 3: Step 5a の daily フォーマットにPFCを追加する**

`### 5a. daily ファイル更新` の説明を以下に差し替える:

```markdown
### 5a. daily ファイル更新

`aspects/diet/daily/YYYY-MM-DD.md` の該当食事セクションを追加・更新する。**PFC値も必ず記載する。**

フォーマット:
    ## 昼食 12:00-13:00
    メニュー名
    - 材料1 量
    - 材料2 量
    - ~XXX kcal | P: XXg | F: XXg | C: XXg

日次サマリーも再計算する:
    **合計: ~XXXX kcal | P: XXXg | F: XXg | C: XXXg**
    **目標比: P: XX% | F: XX% | C: XX%**

目標比は `nutrition-targets.md` の日次目標から算出する。外食（`P: —`）は合計・目標比の計算から除外する。
```

- [ ] **Step 4: Step 6 の報告フォーマットにPFCを追加する**

`## Step 6: 報告` を以下に差し替える:

```markdown
## Step 6: 報告（1-2行で簡潔に）

    記録した。昼食: パスタ残り + 食パン2切れ（約550kcal | P: 18g F: 12g C: 75g）。fridge: パスタ残り 2→1食分、食パン 2→0枚。
```

- [ ] **Step 5: 注意セクションのカロリー概算基準にPFCを追加する**

`## 注意` セクションの概算基準の行を以下に差し替える:

```markdown
- カロリー・PFC概算: `nutrition-targets.md` の「PFC概算の基準値」を参照。テーブルにない食材は一般的な栄養価で概算する
```

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/meal/SKILL.md
git commit -m "feat: /meal にPFC概算・記録を追加"
```

---

### Task 4: `aspects/diet/CLAUDE.md` の daily フォーマット定義を更新する

**Files:**
- Modify: `aspects/diet/CLAUDE.md`

- [ ] **Step 1: daily ファイルのフォーマット定義にPFCを追加する**

`aspects/diet/CLAUDE.md` 内の daily ファイルフォーマット定義（`### daily ファイルと Notion の完全同期` セクション内、および `### Notion 食事ページの構成` 付近）で、kcal のみの記法をPFC付きに更新する。

具体的には `- daily ファイルを作成・変更したら` の周辺にある daily フォーマット例を確認し、`~XXX kcal` を `~XXX kcal | P: XXg | F: XXg | C: XXg` に変更する。

- [ ] **Step 2: 「予定していた食事を食べなかった場合」のカロリー警告にPFCを追加する**

`## 予定していた食事を食べなかった場合` の `**Step 5: カロリー警告（スキップ時のみ）**` で、kcal 1,200 未満の警告に加えて PFC の偏りも軽く警告する:

```markdown
**Step 5: カロリー・PFC警告（スキップ時のみ）**
- スキップした結果、その日の合計 kcal が **1,200kcal を下回る場合**、軽く警告する
- たんぱく質が日次目標の50%未満の場合も警告する（「たんぱく質が不足気味です」）
- 強制はしない。会話を止めない
```

- [ ] **Step 3: Commit**

```bash
git add aspects/diet/CLAUDE.md
git commit -m "docs: daily フォーマットにPFC記載ルールを追加"
```

---

### Task 5: 既存の daily ファイルをPFCフォーマットに更新する

**Files:**
- Modify: `aspects/diet/daily/2026-04-20.md`
- Modify: `aspects/diet/daily/2026-04-21.md`

- [ ] **Step 1: 2026-04-20.md にPFCを追加する**

```markdown
# 2026-04-20（月）

## 昼食 12:00-13:00
牛タンパック + 玄米パック
- 牛タンパック 1個
- 玄米パック 1食
- ~450 kcal | P: 19g | F: 22g | C: 56g

**合計: ~450 kcal | P: 19g | F: 22g | C: 56g**
**目標比: P: 15% | F: 45% | C: 28%**
```

PFC概算: 牛タン100g（P:15g F:22g C:0g） + 玄米パック1食160g（P:4g F:1g C:56g）。牛タンパックは1個あたり約100g想定。

- [ ] **Step 2: 2026-04-21.md にPFCを追加する**

```markdown
# 2026-04-21（火）

## 昼食 12:00-13:00
牛タンパック + 玄米パック
- 牛タンパック 1個
- 玄米パック 1食
- ~450 kcal | P: 19g | F: 22g | C: 56g

**合計: ~450 kcal | P: 19g | F: 22g | C: 56g**
**目標比: P: 15% | F: 45% | C: 28%**
```

- [ ] **Step 3: Commit**

```bash
git add aspects/diet/daily/2026-04-20.md aspects/diet/daily/2026-04-21.md
git commit -m "docs: 既存 daily ファイルにPFC値を追加"
```
