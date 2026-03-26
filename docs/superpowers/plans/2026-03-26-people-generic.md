# People System 汎用化 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `aspects/church/people/` を `aspects/people/` に移動し、`relation:` フィールドで関係性を表現する汎用的な人物プロファイルシステムにする。`relation: church` の場合のみ「祈り記録」セクションを含む。

**Architecture:** `aspects/people/` に統合。各ファイルの先頭に `relation:` フィールドを追加（church / family / friend / job / other）。`aspects/people/CLAUDE.md` でフォーマット仕様と relation ごとのテンプレートを定義。`prayer-requests.md` のリンクを新パスに更新。

**Tech Stack:** Markdown のみ（コードなし）

---

## ファイル構造

```
aspects/people/                # 新規ディレクトリ（aspects/church/people/ から移動）
  CLAUDE.md                    # 新規: フォーマット仕様・relation ごとのテンプレート
  shinya.md                    # 移動
  midori.md                    # 移動
  jayce.md                     # 移動
  nathan.md                    # 移動
  michael.md                   # 移動
  kazuya.md                    # 移動
  ivan.md                      # 移動
  tantan.md                    # 移動
  p.md                         # 移動
  emiri.md                     # 移動
  yuiho.md                     # 移動
  taiki.md                     # 移動
  mariya.md                    # 移動
  family.md                    # 移動
  wes-shiori.md                # 移動
  kazuki.md                    # 移動
aspects/church/
  prayer-requests.md           # 変更: リンクを ../people/<name>.md に更新
  CLAUDE.md                    # 変更: people/ の参照パスを更新
  people/                      # 削除（移動後）
```

## フォーマット仕様

### relation: church（祈り記録あり）

```markdown
# [Name]

relation: church
[関係性・背景 1〜2行]

---

## 祈り記録

### [タイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered

[祈りの内容]

**更新:**
- YYYY-MM-DD: [変化・近況]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

### relation: その他（祈り記録なし）

```markdown
# [Name]

relation: family / friend / job / other
[関係性・背景 1〜2行]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
```

**ルール:**
- `relation:` は必須。`church / family / friend / job / other` のいずれか（複数可: `church, friend`）
- `relation: church` または `relation: family` を含む場合に `祈り記録` セクションを追加する
- 祈りが答えられたら: ステータスを `Answered` に変更し `**更新:**` に「答えられた: [内容]」を追記
- `aspects/people/` ファイルを編集した後は `/to-notion` を実行しない（Notion 同期対象外）

---

## Task 1: `aspects/people/CLAUDE.md` を作成

**Files:**
- Create: `aspects/people/CLAUDE.md`

- [ ] **Step 1: `aspects/people/CLAUDE.md` を作成**

内容:

```markdown
# People

人物プロファイルシステム。教会・家族・友人・仕事仲間など全ての人を管理する。

ファイル名: `aspects/people/<英語名またはローマ字>.md`

## relation ごとのテンプレート

### relation: church または family（祈り記録あり）

\`\`\`markdown
# [Name]

relation: church
[関係性・背景 1〜2行]

---

## 祈り記録

### [タイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered

[祈りの内容]

**更新:**
- YYYY-MM-DD: [変化・近況]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
\`\`\`

### relation: friend / job / other（祈り記録なし）

\`\`\`markdown
# [Name]

relation: friend / job / other
[関係性・背景 1〜2行]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
\`\`\`

## 編集ルール

**出来事・記録:**
- その人に関する新しい情報を知ったら日付付きで追記する

**祈り記録（relation: church または family を含む場合）:**
- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記
- 新しい祈りが始まったら: 新しい `### [タイトル]（開始: YYYY-MM-DD）` セクションを追加
- church の場合は `aspects/church/prayer-requests.md` の Active/Answered テーブルも同時に更新する

**`aspects/people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）
```

- [ ] **Step 2: コミット**

```bash
git add aspects/people/CLAUDE.md
git commit -m "feat: aspects/people/ ディレクトリと CLAUDE.md を作成"
```

---

## Task 2: church people ファイルを移動（Shinya〜Ivan）

**Files:**
- Create: `aspects/people/shinya.md`（旧: `aspects/church/people/shinya.md`）
- Create: `aspects/people/midori.md`
- Create: `aspects/people/jayce.md`
- Create: `aspects/people/nathan.md`
- Create: `aspects/people/michael.md`
- Create: `aspects/people/kazuya.md`
- Create: `aspects/people/ivan.md`

各ファイル: タイトル行の直後に `relation: church` を追加。旧ファイルを削除。

- [ ] **Step 1: `aspects/people/shinya.md` を作成**

```markdown
# Shinya

relation: church
教会のメンバー。

---

## 祈り記録

### 休みと課題（開始: 2026-03-18）
**ステータス:** Active

1週間の休みを有意義に使えるように。アサインメントも残っているのでこなせるように。

**更新:**
- 2026-03-18: 祈り開始

---

## 出来事・記録

- 2026-03-18: 1週間の休み期間
```

- [ ] **Step 2: `aspects/people/midori.md` を作成**

```markdown
# Midori

relation: church
教会のメンバー。神学部・教育課程に在籍。

---

## 祈り記録

### 卒業式と新シーズン（開始: 2026-03-18）
**ステータス:** Active

火曜に卒業式があるので起きられるように。4月の予定（神学部と教育課程の忙しさ）が見えず不安があるので守られるように。キャンプ等のアドミン招待でどれにyes/noするか知恵と見極めが与えられるように。喜びをもって行えるように。

**更新:**
- 2026-03-18: 祈り開始

---

## 出来事・記録

- 2026-03-18: 卒業式（火曜）
```

- [ ] **Step 3: `aspects/people/jayce.md` を作成**

```markdown
# Jayce

relation: church
教会のメンバー。

---

## 祈り記録

### 家族の健康（開始: 2026-03-18）
**ステータス:** Active

家族の健康のために。

**更新:**
- 2026-03-18: 祈り開始

---

## 出来事・記録

- 2026-03-18: 祈り開始
```

- [ ] **Step 4: `aspects/people/nathan.md` を作成**

```markdown
# Nathan

relation: church
教会のメンバー。

---

## 祈り記録

### 新しい仕事と信仰生活（開始: 2026-03-19）
**ステータス:** Active

新しい仕事のために。神様ともっと意図的に時間を過ごせるように。

**更新:**
- 2026-03-19: 祈り開始

---

## 出来事・記録

- 2026-03-19: 新しい仕事が始まる（または始まる予定）
```

- [ ] **Step 5: `aspects/people/michael.md` を作成**

```markdown
# Michael

relation: church
教会のメンバー。

---

## 祈り記録

### 結婚相手と明確さ（開始: 2026-03-19）
**ステータス:** Active

結婚相手のために3年間祈り続けている。最近交流し始めた人を追いかけるべきか迷っており、明確さが与えられるように。

**更新:**
- 2026-03-19: 祈り開始。3年間の祈りの継続。

---

## 出来事・記録

- 2026-03-19: 最近交流し始めた人がいる（関係の進展を祈っている）
```

- [ ] **Step 6: `aspects/people/kazuya.md` を作成**

```markdown
# Kazuya

relation: church
教会のメンバー。写真撮影の仕事あり。

---

## 祈り記録

### 多忙なシーズンの健康（開始: 2026-03-19）
**ステータス:** Active

4〜5月はイースター、日曜メッセージ、Mission Trip、Ohanaカンファレンス、2つの結婚式、1週間の写真撮影と予定が詰まっている。健康が守られ、一つ一つ神様の力と助けによって進めていけるように。

**更新:**
- 2026-03-19: 祈り開始

---

## 出来事・記録

- 2026-03-19: 4〜5月の予定: イースター、日曜メッセージ、Mission Trip、Ohanaカンファレンス、2つの結婚式、写真撮影1週間
```

- [ ] **Step 7: `aspects/people/ivan.md` を作成**

```markdown
# Ivan

relation: church
教会のメンバー。就職・キャリアを模索中。

---

## 祈り記録

### キャリアと献身の方向性（開始: 2026-03-19）
**ステータス:** Active

①神様から委ねられたものを正しく管理する知恵。②仕事探しとキャリアの明確さ——進むべきでない道のドアを閉じてくださるように。③Pacific Rim Bible Study Courseを受けるべきか。

**更新:**
- 2026-03-19: 祈り開始

---

## 出来事・記録

- 2026-03-19: 就職・キャリアを模索中。Pacific Rim Bible Study Course の受講を検討中。
```

- [ ] **Step 8: 旧ファイルを削除**

```bash
rm aspects/church/people/shinya.md
rm aspects/church/people/midori.md
rm aspects/church/people/jayce.md
rm aspects/church/people/nathan.md
rm aspects/church/people/michael.md
rm aspects/church/people/kazuya.md
rm aspects/church/people/ivan.md
```

- [ ] **Step 9: コミット**

```bash
git add aspects/people/
git add aspects/church/people/
git commit -m "refactor: church people を aspects/people/ に移動（Shinya〜Ivan）"
```

---

## Task 3: church people ファイルを移動（Tantan〜かづき）

**Files:**
- Create: `aspects/people/tantan.md`
- Create: `aspects/people/p.md`
- Create: `aspects/people/emiri.md`
- Create: `aspects/people/yuiho.md`
- Create: `aspects/people/taiki.md`
- Create: `aspects/people/mariya.md`
- Create: `aspects/people/family.md`
- Create: `aspects/people/wes-shiori.md`
- Create: `aspects/people/kazuki.md`

- [ ] **Step 1: `aspects/people/tantan.md` を作成**

```markdown
# Tantan

relation: church
教会のメンバー。ニューシーズンのコミュニティに関わる。娘: アイナ（2026年5月結婚予定）。

---

## 祈り記録

### 家族と子供たちの守り（開始: 2026-03-22）
**ステータス:** Active

ニューシーズンの家族が守られるように。子供達の心が守られるように（先生たちも大変な時期なので）。アイナの結婚式（5月予定）のために。

**更新:**
- 2026-03-22: 祈り開始

---

## 出来事・記録

- 2026-03-22: 娘アイナの結婚式が5月に予定されている
```

- [ ] **Step 2: `aspects/people/p.md` を作成**

```markdown
# P

relation: church
教会のメンバー。新生活・就職を控えている。

---

## 祈り記録

### 新生活の準備と守り（開始: 2026-03-22）
**ステータス:** Active

働き始めるにあたって実感が湧いてきて焦りを感じ始めている。新生活の準備がちゃんとできるように。ニューシーズン守られるように。

**更新:**
- 2026-03-22: 祈り開始

---

## 出来事・記録

- 2026-03-22: これから働き始める（就職/新生活の直前期）
```

- [ ] **Step 3: `aspects/people/emiri.md` を作成**

```markdown
# Emiri

relation: church
教会のメンバー。離婚経験あり（元旦那）。複雑な家族関係を抱えている。

---

## 祈り記録

### 試練の中の平安と家族の和解（開始: 2026-03-22）
**ステータス:** Active

9〜11月は整理と手放す時期、12〜2月はしんどい時期をうまく乗り切ったが、まだ試練が続いていてどこに心を割くべきかわからず平安が欲しい。元旦那の姉を入り口に元旦那の家族との和解が進むように。母がネズミ講に入ってしまい祖母の資産を使っている——母が気づいて辞められるように。

**更新:**
- 2026-03-22: 祈り開始。9〜11月・12〜2月の試練を経ての現状。

---

## 出来事・記録

- 2025-09-01頃: 整理と手放す時期（9〜11月）
- 2025-12-01頃: しんどい時期（12〜2026年2月）
- 2026-03-22: 元旦那の姉との交流を通じた家族和解の可能性。母のネズミ講問題が発覚。
```

- [ ] **Step 4: `aspects/people/yuiho.md` を作成**

```markdown
# Yuiho

relation: church
教会のメンバー。既婚。家族はまだクリスチャンでない。

---

## 祈り記録

### 家族の救いと関係回復（開始: 2026-03-22）
**ステータス:** Active

家族がまだクリスチャンでない。結婚してから親との距離感が変わってきている。母がアメリカに行くので良い教会につながれるように。父との関係もまた近づけるように。

**更新:**
- 2026-03-22: 祈り開始

---

## 出来事・記録

- 2026-03-22: お母さんがアメリカへ行く予定
```

- [ ] **Step 5: `aspects/people/taiki.md` を作成**

```markdown
# Taiki

relation: church
教会のメンバー。シェアハウス在住（イタリア人の20代の住人がいる）。

---

## 祈り記録

### 健康の回復と伝道の機会（開始: 2026-03-19）
**ステータス:** Active

健康のために。数週間、微熱とめまいが続いている。めまいは2日ほど消えて楽になったが、また熱が戻ってくることも。癒しの知恵が与えられるように。シェアハウスの住人（イタリア人・20代）を教会に連れていくので、良い機会になるように。

**更新:**
- 2026-03-19: 祈り開始。数週間の体調不良が続いている。

---

## 出来事・記録

- 2026-03-19: 微熱とめまいが数週間続いている
- 2026-03-19: シェアハウスのイタリア人住人（20代）を教会に連れていく予定
```

- [ ] **Step 6: `aspects/people/mariya.md` を作成**

```markdown
# マリヤ

relation: church
教会のメンバー。進路を模索中。

---

## 祈り記録

### これからの進路（開始: 2026-03-20）
**ステータス:** Active

これからの進路について確信が与えられるように。

**更新:**
- 2026-03-20: 祈り開始

---

## 出来事・記録

- 2026-03-20: 進路について模索中
```

- [ ] **Step 7: `aspects/people/family.md` を作成**

```markdown
# 家族

relation: family
自分の家族への祈り。

---

## 祈り記録

### 家族それぞれの守り（開始: 2026-03-20）
**ステータス:** Active

- 家の犬が残りの時間を安らかに過ごし、天寿を全うできるように。17歳で、カナダにいて日本に戻ることは難しい状況。
- 父が牧師で、日本のNPO理事職を推薦されたが無給のため、経済的に守られるように。
- おばあちゃんの認知症がひどく、父が日本に帰って介護することになった。家族が疲れから守られるように。

**更新:**
- 2026-03-20: 祈り開始

---

## 出来事・記録

- 2026-03-20: 犬（17歳）がカナダにいる。余命わずか。
- 2026-03-20: 父が日本のNPO理事職を推薦された（無給）
- 2026-03-20: おばあちゃんの認知症悪化。父が日本に帰って介護することになった。
```

- [ ] **Step 8: `aspects/people/wes-shiori.md` を作成**

```markdown
# Wes & Shiori

relation: church
教会のカップル/夫婦。長野への引っ越しを予定している。

---

## 祈り記録

### 長野への引っ越し（開始: 2026-03-20）
**ステータス:** Active

長野への引っ越しがスムーズに進むように。

**更新:**
- 2026-03-20: 祈り開始

---

## 出来事・記録

- 2026-03-20: 長野への引っ越しを予定している
```

- [ ] **Step 9: `aspects/people/kazuki.md` を作成**

```markdown
# かづき

relation: church
教会のメンバー。変わらない状況の中で信仰の選択を模索している。

---

## 祈り記録

### 恐れの中での正しい選択（開始: 2026-03-24）
**ステータス:** Active

変わらない状況や愛・周りの声に恐れを感じてしまうが、神様の声をちゃんと聞いて、正しく知恵のある選択を焦らず一つ一つできるように。

**更新:**
- 2026-03-24: 祈り開始

---

## 出来事・記録

- 2026-03-24: 変わらない状況に対する恐れを感じている時期
```

- [ ] **Step 10: 旧ファイルを削除してディレクトリも削除**

```bash
rm aspects/church/people/tantan.md
rm aspects/church/people/p.md
rm aspects/church/people/emiri.md
rm aspects/church/people/yuiho.md
rm aspects/church/people/taiki.md
rm aspects/church/people/mariya.md
rm aspects/church/people/family.md
rm aspects/church/people/wes-shiori.md
rm aspects/church/people/kazuki.md
rmdir aspects/church/people/
```

- [ ] **Step 11: コミット**

```bash
git add aspects/people/
git add aspects/church/people/
git commit -m "refactor: church people を aspects/people/ に移動（Tantan〜かづき）"
```

---

## Task 4: `prayer-requests.md` のリンクを更新

**Files:**
- Modify: `aspects/church/prayer-requests.md`

リンクを `people/<name>.md` から `../people/<name>.md` に更新する（`aspects/church/` → `aspects/people/` は同階層なので `../people/`）。

- [ ] **Step 1: `prayer-requests.md` を以下の内容に更新**

```markdown
# Prayer Requests

デボーション終わりの Closing Prayer で祈る人たちのリスト。
詳細・遷移・出来事は `aspects/people/<name>.md` を参照。

答えられた祈りは各人物ファイルの `**ステータス:** Answered` に記録する。

---

## Active（祈り中）

| 人名 | 祈りのテーマ | 開始日 | ファイル |
|------|------------|--------|---------|
| Shinya | 休みと課題 | 2026-03-18 | [people/shinya.md](../people/shinya.md) |
| Midori | 卒業式と新シーズン | 2026-03-18 | [people/midori.md](../people/midori.md) |
| Jayce | 家族の健康 | 2026-03-18 | [people/jayce.md](../people/jayce.md) |
| Nathan | 新しい仕事と信仰生活 | 2026-03-19 | [people/nathan.md](../people/nathan.md) |
| Michael | 結婚相手と明確さ | 2026-03-19 | [people/michael.md](../people/michael.md) |
| Kazuya | 多忙なシーズンの健康 | 2026-03-19 | [people/kazuya.md](../people/kazuya.md) |
| Ivan | キャリアと献身の方向性 | 2026-03-19 | [people/ivan.md](../people/ivan.md) |
| Tantan | 家族と子供たちの守り | 2026-03-22 | [people/tantan.md](../people/tantan.md) |
| P | 新生活の準備と守り | 2026-03-22 | [people/p.md](../people/p.md) |
| Emiri | 試練の中の平安と家族の和解 | 2026-03-22 | [people/emiri.md](../people/emiri.md) |
| Yuiho | 家族の救いと関係回復 | 2026-03-22 | [people/yuiho.md](../people/yuiho.md) |
| Taiki | 健康の回復と伝道の機会 | 2026-03-19 | [people/taiki.md](../people/taiki.md) |
| マリヤ | これからの進路 | 2026-03-20 | [people/mariya.md](../people/mariya.md) |
| 家族 | 家族それぞれの守り | 2026-03-20 | [people/family.md](../people/family.md) |
| Wes & Shiori | 長野への引っ越し | 2026-03-20 | [people/wes-shiori.md](../people/wes-shiori.md) |
| かづき | 恐れの中での正しい選択 | 2026-03-24 | [people/kazuki.md](../people/kazuki.md) |

---

## Answered（答えられた祈り）

<!-- 各人物ファイルで Answered になったら、こちらにも名前・テーマ・日付を記録する -->

| 人名 | 祈りのテーマ | 開始日 | 答えられた日 |
|------|------------|--------|------------|
```

- [ ] **Step 2: コミット**

```bash
git add aspects/church/prayer-requests.md
git commit -m "refactor: prayer-requests.md のリンクを aspects/people/ パスに更新"
```

---

## Task 5: `aspects/church/CLAUDE.md` を更新

**Files:**
- Modify: `aspects/church/CLAUDE.md`

`people/` の参照パスを `aspects/church/people/` から `aspects/people/` に更新する。

- [ ] **Step 1: CLAUDE.md の `## people/ ファイルの編集ルール` セクション全体を置換**

現在の内容:
```markdown
## people/ ファイルの編集ルール

`aspects/church/people/<name>.md` を編集するとき:

- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記。`prayer-requests.md` の Answered テーブルにも追記する。
- 新しい祈りが始まったら: 新しい `### [タイトル]` セクションを追加。`prayer-requests.md` の Active テーブルも更新する。
- その人の出来事を知ったら: `## 出来事・記録` に日付付きで追記する。
- **`people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）。
```

置換後の内容:
```markdown
## people/ ファイルの編集ルール

church メンバーの人物ファイルは `aspects/people/<name>.md`（`relation: church`）で管理する。

`aspects/people/<name>.md` を編集するとき:

- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記。`prayer-requests.md` の Answered テーブルにも追記する。
- 新しい祈りが始まったら: 新しい `### [タイトル]（開始: YYYY-MM-DD）` セクションを追加。`prayer-requests.md` の Active テーブルも更新する。
- その人の出来事を知ったら: `## 出来事・記録` に日付付きで追記する。
- **`aspects/people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）。
```

- [ ] **Step 2: コミット**

```bash
git add aspects/church/CLAUDE.md
git commit -m "docs: church CLAUDE.md の people/ パス参照を aspects/people/ に更新"
```

---

## セルフレビュー

**スペックカバレッジ:**
- [x] `aspects/people/` ディレクトリ作成（`aspects/church/people/` から移動） → Task 2, 3
- [x] `relation:` フィールド追加（church / family / friend / job / other） → Task 2, 3 全ファイル
- [x] `relation: church` の場合のみ「祈り記録」セクションを含む → Task 2, 3 全ファイルで適用
- [x] `family.md` は `relation: family`（family 単体で祈り記録を持つ） → Task 3 Step 7
- [x] `prayer-requests.md` のリンク更新（`../people/<name>.md`） → Task 4
- [x] `aspects/church/CLAUDE.md` の参照パス更新 → Task 5
- [x] `aspects/people/CLAUDE.md` で relation ごとのテンプレートを文書化 → Task 1
- [x] 旧 `aspects/church/people/` ディレクトリの完全削除 → Task 2 Step 8, Task 3 Step 10

**プレースホルダーチェック:** なし

**整合性チェック:**
- 全 16 ファイルの新パスと `prayer-requests.md` テーブルリンクが一致
- `relation: church` を含む全ファイルに「祈り記録」セクションがある
- `family.md` のみ `relation: family, church`（church 含むため祈り記録あり）
