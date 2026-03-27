# Prayer Request Bible Verses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 各祈り課題に聖書のみことば2箇所を添え、プロフィール更新時に自動でみことばを見直すスキルも用意する。

**Architecture:** `aspects/people/<name>.md` の各祈り記録セクションに `**みことば:**` ブロックを追加する。テンプレートも更新して今後の祈り追加にも反映する。さらに `prayer-verse-review` スキルを作成し、人物ファイルのプロフィール・状況が更新された際に自動呼び出しでみことばを再評価・更新する。Notion 同期は不要（people/ は同期対象外）。

**Tech Stack:** Markdown ファイル編集のみ

---

## File Structure

| ファイル | 変更内容 |
|---------|---------|
| `aspects/people/CLAUDE.md` | テンプレートに `**みことば:**` セクション + スキル呼び出しルールを追加 |
| `.claude/skills/prayer-verse-review.md` | 新規スキル：プロフィール更新時にみことばを再評価・更新する |
| `aspects/people/shinya.md` | みことば追加 |
| `aspects/people/midori.md` | みことば追加 |
| `aspects/people/jayce.md` | みことば追加 |
| `aspects/people/nathan.md` | みことば追加 |
| `aspects/people/michael.md` | みことば追加 |
| `aspects/people/kazuya.md` | みことば追加 |
| `aspects/people/ivan.md` | みことば追加 |
| `aspects/people/tantan.md` | みことば追加 |
| `aspects/people/p.md` | みことば追加 |
| `aspects/people/emiri.md` | みことば追加 |
| `aspects/people/yuiho.md` | みことば追加 |
| `aspects/people/taiki.md` | みことば追加 |
| `aspects/people/mariya.md` | みことば追加 |
| `aspects/people/family.md` | みことば追加 |
| `aspects/people/wes-shiori.md` | みことば追加 |
| `aspects/people/kazuki.md` | みことば追加 |
| `aspects/people/me.md` | みことば追加 |

---

## Task 1: テンプレート更新（CLAUDE.md）

**Files:**
- Modify: `aspects/people/CLAUDE.md`

- [ ] **Step 1: テンプレートに `**みことば:**` セクションを追加**

`relation: church または family` テンプレートの祈り記録セクションを以下に変更:

```markdown
### [タイトル]（開始: YYYY-MM-DD）
**ステータス:** Active / Answered

[祈りの内容]

**みことば:**
- [書名 章:節] — [みことばの文章]
- [書名 章:節] — [みことばの文章]

**更新:**
- YYYY-MM-DD: [変化・近況]
```

- [ ] **Step 2: 編集ルールにみことばの方針を追記**

`## 編集ルール` セクションに以下を追加:

```markdown
**みことば（relation: church または family を含む場合）:**
- 各祈り課題に関連する聖書箇所を2箇所添える
- 形式: `- [書名 章:節] — [みことばの文章]`
- 祈りのテーマに直接応じた箇所を選ぶ（例: 進路 → 箴言3:5-6、平安 → フィリピ4:6-7）
```

- [ ] **Step 3: コミット**

```bash
git add aspects/people/CLAUDE.md
git commit -m "docs: add みことば section to people template"
```

---

## Task 2: みことば追加（Shinya / Midori / Jayce）

**Files:**
- Modify: `aspects/people/shinya.md`, `aspects/people/midori.md`, `aspects/people/jayce.md`

- [ ] **Step 1: Shinya（休みと課題）に追加**

`**更新:**` の直前に挿入:

```markdown
**みことば:**
- コロサイ3:23 — 何をするにも、人に対してではなく、主に対してするように、心を込めて行いなさい。
- フィリピ4:6-7 — 何も思い煩わず、ただ、事ごとに、感謝をもってささげる祈りと願いによって、あなたがたの求めることを神に打ち明けなさい。そうすれば、人のすべての考えにまさる神の平和が、あなたがたの心と思いをキリスト・イエスにあって守ってくれます。
```

- [ ] **Step 2: Midori（卒業式と新シーズン）に追加**

```markdown
**みことば:**
- エレミヤ29:11 — わたしはあなたがたのために立てている計画をよく知っているからだ。——主の御告げ——それはわざわいではなく平安を与える計画であり、あなたがたに将来と希望を与えるためのものだ。
- イザヤ43:19 — 見よ。わたしは新しいことをする。もうすぐそれが起こる。あなたがたはそれに気づかないのか。確かに、わたしは荒野に道を、荒れ地に川を設ける。
```

- [ ] **Step 3: Jayce（家族の健康）に追加**

```markdown
**みことば:**
- 詩篇91:1-2 — いと高き方の隠れ場に住む者は、全能者の陰に宿る。私は主に申し上げよう。「わが避け所、わが砦、私が信頼するわが神」と。
- エレミヤ30:17 — わたしがあなたの傷に包帯を当て、あなたを打ち傷から癒すからだ。——主の御告げ——
```

- [ ] **Step 4: コミット**

```bash
git add aspects/people/shinya.md aspects/people/midori.md aspects/people/jayce.md
git commit -m "docs: add みことば to Shinya, Midori, Jayce prayer requests"
```

---

## Task 3: みことば追加（Nathan / Michael / Kazuya）

**Files:**
- Modify: `aspects/people/nathan.md`, `aspects/people/michael.md`, `aspects/people/kazuya.md`

- [ ] **Step 1: Nathan（ミニストリーと神様との対話）に追加**

```markdown
**みことば:**
- ヨハネ10:27 — わたしの羊はわたしの声を聞き分けます。わたしは彼らを知っており、彼らはわたしについて来ます。
- エレミヤ33:3 — わたしを呼べ。そうすれば、わたしはあなたに答え、あなたが知らない、理解を越えた大いなることを、あなたに告げよう。
```

- [ ] **Step 2: Michael（結婚相手と明確さ）に追加**

```markdown
**みことば:**
- 箴言18:22 — 妻を得る者は幸いを得、主から恵みを受ける。
- 詩篇37:4 — 主をご自分の喜びとせよ。主はあなたの心の願いをかなえてくださる。
```

- [ ] **Step 3: Kazuya（多忙なシーズンの健康）に追加**

```markdown
**みことば:**
- マタイ11:28-29 — すべて疲れた人、重荷を負っている人は、わたしのところに来なさい。わたしがあなたがたを休ませてあげます。わたしは心が柔和でへりくだっているから、あなたがたもわたしのくびきを負って、わたしから学びなさい。そうすればたましいに安らぎが来ます。
- イザヤ40:31 — しかし、主を待ち望む者は新しく力を得る。鷲のように翼を張って上ることができる。走ってもたゆまず、歩いても疲れない。
```

- [ ] **Step 4: コミット**

```bash
git add aspects/people/nathan.md aspects/people/michael.md aspects/people/kazuya.md
git commit -m "docs: add みことば to Nathan, Michael, Kazuya prayer requests"
```

---

## Task 4: みことば追加（Ivan / Tantan / P）

**Files:**
- Modify: `aspects/people/ivan.md`, `aspects/people/tantan.md`, `aspects/people/p.md`

- [ ] **Step 1: Ivan（キャリアと献身の方向性）に追加**

```markdown
**みことば:**
- 箴言16:3 — あなたのしわざを主にゆだねよ。そうすれば、あなたの計画はゆるぎないものとなる。
- エレミヤ29:11 — わたしはあなたがたのために立てている計画をよく知っているからだ。——主の御告げ——それはわざわいではなく平安を与える計画であり、あなたがたに将来と希望を与えるためのものだ。
```

- [ ] **Step 2: Tantan（家族と子供たちの守り）に追加**

```markdown
**みことば:**
- 詩篇127:3 — 見よ、子どもたちは主の賜物、胎の実は報酬である。
- 申命記6:6-7 — 私が今日あなたに命じるこれらのことばを、あなたの心に刻みなさい。これをあなたの子どもたちに繰り返し教え、あなたが家に座っているときも、道を歩くときも、寝るときも、起きるときも、これについて語りなさい。
```

- [ ] **Step 3: P（新生活の準備と守り）に追加**

```markdown
**みことば:**
- エレミヤ29:11 — わたしはあなたがたのために立てている計画をよく知っているからだ。——主の御告げ——それはわざわいではなく平安を与える計画であり、あなたがたに将来と希望を与えるためのものだ。
- ヘブル13:5 — 主ご自身が「わたしはあなたを離れず、あなたを捨てない」と言われた。
```

- [ ] **Step 4: コミット**

```bash
git add aspects/people/ivan.md aspects/people/tantan.md aspects/people/p.md
git commit -m "docs: add みことば to Ivan, Tantan, P prayer requests"
```

---

## Task 5: みことば追加（Emiri / Yuiho / Taiki）

**Files:**
- Modify: `aspects/people/emiri.md`, `aspects/people/yuiho.md`, `aspects/people/taiki.md`

- [ ] **Step 1: Emiri（試練の中の平安と家族の和解）に追加**

```markdown
**みことば:**
- ロマ8:28 — 神を愛する人々、すなわち、神のご計画にしたがって召された人々のためには、神がすべてのことを働かせて益としてくださることを、私たちは知っています。
- コリント第二5:18 — これらはすべて神から出ています。神はキリストによって私たちをご自分と和解させ、また、和解の務めを私たちに与えてくださいました。
```

- [ ] **Step 2: Yuiho（家族の救いと関係回復）に追加**

```markdown
**みことば:**
- ペテロ第二3:9 — 主は約束の実現を遅らせているのではありません。かえって、あなたがたに対して忍耐しておられるのです。だれも滅びることなく、すべての人が悔い改めに進むことを望んでおられるのです。
- エゼキエル18:23 — わたしは悪者が死ぬことに喜びを見いだすだろうか——神である主の御告げ——彼がその道から立ち返って生きることを喜びとするのではないか。
```

- [ ] **Step 3: Taiki（健康の回復と伝道の機会）に追加**

```markdown
**みことば:**
- エレミヤ30:17 — わたしがあなたの傷に包帯を当て、あなたを打ち傷から癒すからだ。——主の御告げ——
- 詩篇41:3 — 主は彼を病の床に養われる。あなたは彼の病床のすべてをつくり変えられる。
```

- [ ] **Step 4: コミット**

```bash
git add aspects/people/emiri.md aspects/people/yuiho.md aspects/people/taiki.md
git commit -m "docs: add みことば to Emiri, Yuiho, Taiki prayer requests"
```

---

## Task 6: みことば追加（マリヤ / 家族 / Wes-Shiori）

**Files:**
- Modify: `aspects/people/mariya.md`, `aspects/people/family.md`, `aspects/people/wes-shiori.md`

- [ ] **Step 1: マリヤ（これからの進路）に追加**

```markdown
**みことば:**
- 箴言3:5-6 — 心を尽くして主に信頼せよ。自分の悟りにたよるな。あなたの行く道すべてにおいて主を認めよ。そうすれば、主はあなたの通り道をまっすぐにされる。
- エレミヤ29:11 — わたしはあなたがたのために立てている計画をよく知っているからだ。——主の御告げ——それはわざわいではなく平安を与える計画であり、あなたがたに将来と希望を与えるためのものだ。
```

- [ ] **Step 2: 家族（家族それぞれの守り）に追加**

```markdown
**みことば:**
- 詩篇91:11 — まことに、主はあなたのために御使いに命じて、あなたの行く道のどこでもあなたを守らせてくださる。
- 申命記31:8 — 主ご自身があなたの先を行かれる。主はあなたとともにおられる。主はあなたを見放さず、あなたを見捨てない。恐れてはならない。おののいてはならない。
```

- [ ] **Step 3: Wes & Shiori（長野への引っ越し）に追加**

```markdown
**みことば:**
- エレミヤ29:7 — わたしがあなたがたを捕囚として送った町の平和を求め、そのために主に祈れ。その町に平和があれば、あなたがたにも平和があるのだから。
- 詩篇121:7-8 — 主はすべてのわざわいからあなたを守り、あなたのたましいを守られる。主はあなたの外出と帰宅を、今よりとこしえまでも守られる。
```

- [ ] **Step 4: コミット**

```bash
git add aspects/people/mariya.md aspects/people/family.md aspects/people/wes-shiori.md
git commit -m "docs: add みことば to マリヤ, 家族, Wes-Shiori prayer requests"
```

---

## Task 7: みことば追加（かづき / Ken）

**Files:**
- Modify: `aspects/people/kazuki.md`, `aspects/people/me.md`

- [ ] **Step 1: かづき（恐れの中での正しい選択）に追加**

```markdown
**みことば:**
- ヨシュア1:9 — わたしはあなたに命じたではないか。強くあれ、雄々しくあれ。恐れてはならない。おののいてはならない。あなたが行く所どこにでも、あなたの神、主はともにおられるのだから。
- 箴言3:5-6 — 心を尽くして主に信頼せよ。自分の悟りにたよるな。あなたの行く道すべてにおいて主を認めよ。そうすれば、主はあなたの通り道をまっすぐにされる。
```

- [ ] **Step 2: Ken（思慮深い妻と仕事）に追加**

```markdown
**みことば:**
- 箴言18:22 — 妻を得る者は幸いを得、主から恵みを受ける。
- エレミヤ29:11 — わたしはあなたがたのために立てている計画をよく知っているからだ。——主の御告げ——それはわざわいではなく平安を与える計画であり、あなたがたに将来と希望を与えるためのものだ。
```

- [ ] **Step 3: コミット**

```bash
git add aspects/people/kazuki.md aspects/people/me.md
git commit -m "docs: add みことば to かづき, Ken prayer requests"
```

---

---

## Task 8: prayer-verse-review スキルの作成

**Files:**
- Create: `.claude/skills/prayer-verse-review.md`
- Modify: `aspects/people/CLAUDE.md`

**目的:** `aspects/people/<name>.md` のプロフィール・状況・祈り課題に変更があったとき、現在の `**みことば:**` が依然として最適かを自動評価し、必要なら更新する。

- [ ] **Step 1: スキルファイルを作成する**

`.claude/skills/prayer-verse-review.md` を以下の内容で作成:

```markdown
---
name: prayer-verse-review
description: aspects/people/<name>.md のプロフィール・状況・祈り課題が更新されたとき、みことばを再評価・更新する
triggers:
  - aspects/people/*.md を編集してプロフィール・現在のシーズン・祈り課題に変更があったとき
---

# Prayer Verse Review

## トリガー条件

以下のいずれかが `aspects/people/<name>.md` で変更されたとき、このスキルを実行する:

- `## プロフィール` セクションの内容（ライフステージ・現在のシーズン・特徴・背景）
- `## 祈り記録` の祈り課題の内容または新しいセクションの追加
- `**更新:**` に新しい近況が追加されたとき

プロフィールの変更がない単純な `**更新:**` の日付追記だけの場合は実行不要。

## 実行手順

1. **ファイルを読む**: `aspects/people/<name>.md` 全体を読む
2. **現状を把握する**:
   - プロフィール（ライフステージ・現在のシーズン・信仰背景・特徴）
   - 各祈り課題の内容と最新の **更新:**
   - 現在の **みことば:** の箇所
3. **再評価する**: 各祈り課題について以下を問う:
   - 現在のみことばはこの人の今の状況・心の状態・課題に最もよく応えているか？
   - プロフィールの変化（シーズンの変化・新しい出来事）を踏まえてより適切な箇所があるか？
4. **判断する**:
   - 現在のみことばが依然として最適 → 変更なし（「みことばは変更不要」と報告）
   - より適切な箇所がある → 新しい2箇所を提案し、確認なく更新する
5. **更新する場合**: `**みことば:**` ブロックを書き換える

## みことばの選び方

- その人の**今のシーズン**（試練・転換期・待つ時期・喜びの時期）に響く箇所を選ぶ
- **祈り課題のテーマ**（健康・進路・家族・恐れ・平安など）に直接応える箇所
- その人が**すでに知っていそうな有名な箇所**より、**その状況に刺さる具体的な箇所**を優先する
- 2箇所は**異なる角度**から課題に応えるものにする（例: 1つは約束・1つは励まし）

## 出力形式

```
[name] のみことばを見直しました。

- 変更なし: 「休みと課題」→ 現在のみことばは引き続き最適
- 更新: 「キャリアの方向性」→ 箴言16:3 → イザヤ30:21（理由: 具体的な「道」の確信を求めている状況により合っているため）
```
```

- [ ] **Step 2: `aspects/people/CLAUDE.md` に呼び出しルールを追加する**

`## 編集ルール` に以下を追記:

```markdown
**プロフィール・状況更新時のみことばレビュー（厳守）:**
`## プロフィール` または `## 祈り記録` の内容を変更したら、**確認不要で即座に `prayer-verse-review` スキルを実行する。**
単純な `**更新:**` への日付と近況の追記だけの場合は不要。
```

- [ ] **Step 3: コミット**

```bash
git add .claude/skills/prayer-verse-review.md aspects/people/CLAUDE.md
git commit -m "feat: add prayer-verse-review skill for auto verse update on profile change"
```

---

## 完了確認

- [ ] 全17ファイルに `**みことば:**` ブロックが追加されていること
- [ ] `aspects/people/CLAUDE.md` のテンプレートが更新されていること
- [ ] `git log --oneline -8` で全コミットを確認

```bash
grep -l "みことば" aspects/people/*.md | wc -l
# Expected: 17（またはファイル数）
```
