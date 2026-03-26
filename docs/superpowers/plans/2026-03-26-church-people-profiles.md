# Church People Profiles 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `prayer-requests.md` を人名別MDファイルに進化させ、祈りの遷移・その人の出来事を時系列で記録できるようにする

**Architecture:** `aspects/church/people/` ディレクトリに人名別ファイルを作成。`prayer-requests.md` はアクティブな祈りの索引として残す。各人物ファイルはプロフィール・祈り記録（遷移付き）・出来事記録の3セクション構成。

**Tech Stack:** Markdown のみ（コードなし）

---

## ファイル構造

```
aspects/church/
  prayer-requests.md          # 変更: アクティブ祈りの索引（人名リンク付き）
  people/                     # 新規ディレクトリ
    shinya.md
    midori.md
    jayce.md
    nathan.md
    michael.md
    kazuya.md
    ivan.md
    tantan.md
    p.md
    emiri.md
    yuiho.md
    taiki.md
    mariya.md
    family.md
    wes-shiori.md
    kazuki.md
  CLAUDE.md                   # 変更: 人物ファイルの編集ルール追加
```

## 人物ファイルのフォーマット仕様

各 `people/<name>.md` は以下の構造に従う:

```markdown
# [人名]

<!-- 関係性・簡単なプロフィール -->
[教会での関係、知り合った背景など1〜2行]

---

## 祈り記録

### [祈りのタイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered / 継続中

[祈りの内容]

**更新:**
- YYYY-MM-DD: [変化・近況・答えられたこと]

---

## 出来事・記録

- YYYY-MM-DD: [出来事]
- YYYY-MM-DD: [出来事]
```

**ルール:**
- 祈りのタイトルは内容を10文字以内で要約（例: `新しい仕事`、`健康の回復`）
- ステータスが `Answered` になったら `**更新:**` に「答えられた: [内容]」を追記
- 出来事は祈り記録とリンクする文脈（例: 就職→就職祈り答えられた）がわかるように書く

---

## Task 1: `people/` ディレクトリと人物ファイルの作成（Shinya〜Ivan）

**Files:**
- Create: `aspects/church/people/shinya.md`
- Create: `aspects/church/people/midori.md`
- Create: `aspects/church/people/jayce.md`
- Create: `aspects/church/people/nathan.md`
- Create: `aspects/church/people/michael.md`
- Create: `aspects/church/people/kazuya.md`
- Create: `aspects/church/people/ivan.md`

- [ ] **Step 1: `aspects/church/people/shinya.md` を作成**

```markdown
# Shinya

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

- [ ] **Step 2: `aspects/church/people/midori.md` を作成**

```markdown
# Midori

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

- [ ] **Step 3: `aspects/church/people/jayce.md` を作成**

```markdown
# Jayce

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

- [ ] **Step 4: `aspects/church/people/nathan.md` を作成**

```markdown
# Nathan

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

- [ ] **Step 5: `aspects/church/people/michael.md` を作成**

```markdown
# Michael

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

- [ ] **Step 6: `aspects/church/people/kazuya.md` を作成**

```markdown
# Kazuya

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

- [ ] **Step 7: `aspects/church/people/ivan.md` を作成**

```markdown
# Ivan

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

- [ ] **Step 8: コミット**

```bash
git add aspects/church/people/
git commit -m "chore: church people プロフィール作成（Shinya〜Ivan）"
```

---

## Task 2: 人物ファイルの作成（Tantan〜かづき）

**Files:**
- Create: `aspects/church/people/tantan.md`
- Create: `aspects/church/people/p.md`
- Create: `aspects/church/people/emiri.md`
- Create: `aspects/church/people/yuiho.md`
- Create: `aspects/church/people/taiki.md`
- Create: `aspects/church/people/mariya.md`
- Create: `aspects/church/people/family.md`
- Create: `aspects/church/people/wes-shiori.md`
- Create: `aspects/church/people/kazuki.md`

- [ ] **Step 1: `aspects/church/people/tantan.md` を作成**

```markdown
# Tantan

教会のメンバー。ニューシーズン（New Season？）のコミュニティに関わる。娘: アイナ（2026年5月結婚予定）。

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

- [ ] **Step 2: `aspects/church/people/p.md` を作成**

```markdown
# P

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

- [ ] **Step 3: `aspects/church/people/emiri.md` を作成**

```markdown
# Emiri

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

- 2026-09-01頃: 整理と手放す時期（9〜11月）
- 2025-12-01頃: しんどい時期（12〜2026年2月）
- 2026-03-22: 元旦那の姉との交流を通じた家族和解の可能性。母のネズミ講問題が発覚。
```

- [ ] **Step 4: `aspects/church/people/yuiho.md` を作成**

```markdown
# Yuiho

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

- [ ] **Step 5: `aspects/church/people/taiki.md` を作成**

```markdown
# Taiki

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

- [ ] **Step 6: `aspects/church/people/mariya.md` を作成**

```markdown
# マリヤ

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

- [ ] **Step 7: `aspects/church/people/family.md` を作成**

```markdown
# 家族

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

- [ ] **Step 8: `aspects/church/people/wes-shiori.md` を作成**

```markdown
# Wes & Shiori

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

- [ ] **Step 9: `aspects/church/people/kazuki.md` を作成**

```markdown
# かづき

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

- [ ] **Step 10: コミット**

```bash
git add aspects/church/people/
git commit -m "chore: church people プロフィール作成（Tantan〜かづき）"
```

---

## Task 3: `prayer-requests.md` を索引形式に更新

**Files:**
- Modify: `aspects/church/prayer-requests.md`

現在の全員リスト形式から、各人物ファイルへのリンク付き索引に変更する。アクティブな祈りの一覧は残しつつ、詳細は人物ファイルを参照する形にする。

- [ ] **Step 1: `prayer-requests.md` を以下の内容に更新**

```markdown
# Prayer Requests

デボーション終わりの Closing Prayer で祈る人たちのリスト。
詳細・遷移・出来事は `aspects/church/people/<name>.md` を参照。

答えられた祈りは各人物ファイルの `**ステータス:** Answered` に記録する。

---

## Active（祈り中）

| 人名 | 祈りのテーマ | 開始日 | ファイル |
|------|------------|--------|---------|
| Shinya | 休みと課題 | 2026-03-18 | [people/shinya.md](people/shinya.md) |
| Midori | 卒業式と新シーズン | 2026-03-18 | [people/midori.md](people/midori.md) |
| Jayce | 家族の健康 | 2026-03-18 | [people/jayce.md](people/jayce.md) |
| Nathan | 新しい仕事と信仰生活 | 2026-03-19 | [people/nathan.md](people/nathan.md) |
| Michael | 結婚相手と明確さ | 2026-03-19 | [people/michael.md](people/michael.md) |
| Kazuya | 多忙なシーズンの健康 | 2026-03-19 | [people/kazuya.md](people/kazuya.md) |
| Ivan | キャリアと献身の方向性 | 2026-03-19 | [people/ivan.md](people/ivan.md) |
| Tantan | 家族と子供たちの守り | 2026-03-22 | [people/tantan.md](people/tantan.md) |
| P | 新生活の準備と守り | 2026-03-22 | [people/p.md](people/p.md) |
| Emiri | 試練の中の平安と家族の和解 | 2026-03-22 | [people/emiri.md](people/emiri.md) |
| Yuiho | 家族の救いと関係回復 | 2026-03-22 | [people/yuiho.md](people/yuiho.md) |
| Taiki | 健康の回復と伝道の機会 | 2026-03-19 | [people/taiki.md](people/taiki.md) |
| マリヤ | これからの進路 | 2026-03-20 | [people/mariya.md](people/mariya.md) |
| 家族 | 家族それぞれの守り | 2026-03-20 | [people/family.md](people/family.md) |
| Wes & Shiori | 長野への引っ越し | 2026-03-20 | [people/wes-shiori.md](people/wes-shiori.md) |
| かづき | 恐れの中での正しい選択 | 2026-03-24 | [people/kazuki.md](people/kazuki.md) |

---

## Answered（答えられた祈り）

<!-- 各人物ファイルで Answered になったら、こちらにも名前・テーマ・日付を記録する -->

| 人名 | 祈りのテーマ | 開始日 | 答えられた日 |
|------|------------|--------|------------|
```

- [ ] **Step 2: コミット**

```bash
git add aspects/church/prayer-requests.md
git commit -m "refactor: prayer-requests.md を人物ファイルへの索引形式に変換"
```

---

## Task 4: `CLAUDE.md` に人物ファイルの編集ルールを追加

**Files:**
- Modify: `aspects/church/CLAUDE.md`

- [ ] **Step 1: `CLAUDE.md` の `prayer-requests.md` に関するセクションを更新**

現在の記述:
```markdown
`aspects/church/verses.md` または `aspects/church/prayer-requests.md` を編集したら、**確認不要で即座に `/to-notion` を実行する。**
```

追加する内容（既存の行の後ろに追加）:
```markdown
## people/ ファイルの編集ルール

`aspects/church/people/<name>.md` を編集するとき:

- 祈りが答えられたら: ステータスを `Answered` に変更し、`**更新:**` に「答えられた: [内容]」を追記。`prayer-requests.md` の Answered テーブルにも追記する。
- 新しい祈りが始まったら: 新しい `### [タイトル]` セクションを追加。`prayer-requests.md` の Active テーブルも更新する。
- その人の出来事を知ったら: `## 出来事・記録` に日付付きで追記する。
- **`people/` ファイルを編集した後は `/to-notion` を実行しない**（Notion 同期対象外）。
```

- [ ] **Step 2: コミット**

```bash
git add aspects/church/CLAUDE.md
git commit -m "docs: church CLAUDE.md に people/ ファイル編集ルール追加"
```

---

## セルフレビュー

**スペックカバレッジ:**
- [x] 人名別 MD ファイルの作成 → Task 1, 2
- [x] Prayer Request の遷移記録（Active/Answered + 更新履歴） → 各人物ファイルの `**更新:**` フィールド
- [x] その人の出来事記録 → 各人物ファイルの `## 出来事・記録` セクション
- [x] `prayer-requests.md` の索引化 → Task 3
- [x] 運用ルール → Task 4 の CLAUDE.md 更新

**プレースホルダーチェック:** なし（全ファイルに実コンテンツ記載）

**整合性チェック:** `prayer-requests.md` のテーブルと `people/` ファイル名が一致している
