# ワーシップバッキングおしゃれ化カリキュラム（L22-L26）実装プラン

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Phase 6 に L22〜L26 の5レッスンを追加し、コード譜を見て自分でリハーモナイズできる力を育てる

**Architecture:** 各レッスンは `aspects/guitar/phase6-worship/lesson-XX.md` に L21 と同じ構造（① TABで弾く → ② 事後理論 → ③ 応用ドリル → ④ 自分で組み合わせる）で作成。作成後に CLAUDE.md のカリキュラム表を更新し、Notion ギター DB に登録・内容同期する

**Tech Stack:** Markdown, Notion MCP, `/sync:lessons` スキル

---

## Task 1: L22 レッスンファイル作成

**Files:**
- Create: `aspects/guitar/phase6-worship/lesson-22.md`

**Step 1: L22 レッスン内容を作成**

`lesson-22.md` を作成。タイトル: **「コードの『色替え』— 同じ機能、違う響き」**

素材: As the Deer（Key of D, カポ2 = Key of C shapes）

構成:
- ① TABで弾く
  - STEP 1: As the Deer を基本コードで弾く（D, G, A, Bm → カポ2: C, F, G, Am）
  - STEP 2: 同じコード（例: D）を5種類のヴォイシングで弾き比べ
    - オープン D（カポ2: C）
    - Cadd9（カポ2）
    - C/E（カポ2 → D/F#）
    - ハイポジション C（5フレット付近、カポ2）
    - Csus2（カポ2）
  - STEP 3: セクション別にヴォイシングを割り当てて As the Deer を弾く
    - ヴァース = 小さいヴォイシング（Cadd9 系）
    - コーラス = 大きいヴォイシング（フルストローク G worship 系）
    - ブリッジ = ハイポジション（変化をつける）
  - STEP 4: 3パターンの「色替え」で As the Deer を通し演奏
- ② 事後理論
  - ヴォイシング = 同じコードの「着せ替え」。構成音は同じ、配置が違う
  - レジスター（音域）の概念: 低い音域 = 重厚、高い音域 = 軽やか
  - 判断ルール①: セクションが変わったら → ヴォイシングを変える
- ③ 応用ドリル
  - As the Deer の各コード（C, F, G, Am）で3種類ずつヴォイシング練習
  - 同じ進行を「静か版」「普通版」「力強い版」で弾き分け
- ④ 自分で組み合わせる
  - 「慕い求めます」を L21 のコードで、今回学んだ色替えを適用して弾く

講師: 瀬戸メイン、黒田が理論解説

**Step 2: コミット**

```bash
git add aspects/guitar/phase6-worship/lesson-22.md
git commit -m "feat: add L22 worship voicing variety lesson"
```

---

## Task 2: L23 レッスンファイル作成

**Files:**
- Create: `aspects/guitar/phase6-worship/lesson-23.md`

**Step 1: L23 レッスン内容を作成**

`lesson-23.md` を作成。タイトル: **「テンション追加の判断 — いつadd9？いつsus4？」**

素材: 慕い求めます リハーモナイズ

構成:
- ① TABで弾く
  - STEP 1: 慕い求めますのメロディーの動きを確認（単音で弾く）
  - STEP 2: メロディーがロングトーンの箇所を特定 → そこでテンション追加
    - Cadd9（メロディーがルート D にいるとき → 9th が映える）
    - Csus4→C 解決（メロディーが5th A にいるとき → sus4 が映える）
  - STEP 3: メロディーが3rd にいる箇所を特定 → sus4 は避ける（ぶつかる）
    - 実際に弾いて「ぶつかる」音を体感
  - STEP 4: before/after 比較
    - 全部普通コード版 vs テンション判断版 で弾き比べ
- ② 事後理論
  - テンション判断フレームワーク（4ルール）:
    1. メロディーがルート/5th → add9/sus4 が映える
    2. メロディーが3rd → sus4 は危険、add9 は OK
    3. メロディーが動いてる → シンプルに弾く
    4. メロディーがロングトーン → テンション入れるチャンス
  - Phase 2 との接続: DM7(9) = add9 の7th版、同じ原理
- ③ 応用ドリル
  - As the Deer のメロディーを見て、テンション追加判断を練習
  - 各コードで「add9 OK / sus4 OK / シンプルが正解」を判定
- ④ 自分で組み合わせる
  - 慕い求めます を「テンション判断フレームワーク」適用版で通し演奏

講師: 瀬戸メイン、黒田がフレームワーク理論

**Step 2: コミット**

```bash
git add aspects/guitar/phase6-worship/lesson-23.md
git commit -m "feat: add L23 tension judgement framework lesson"
```

---

## Task 3: L24 レッスンファイル作成

**Files:**
- Create: `aspects/guitar/phase6-worship/lesson-24.md`

**Step 1: L24 レッスン内容を作成**

`lesson-24.md` を作成。タイトル: **「モードで理解する『コードの性格』」**

素材: As the Deer リハーモナイズ（モード的解釈）

構成:
- ① TABで弾く
  - STEP 1: Key=D のダイアトニック5コードを1つずつ弾き、各コードの上でスケールを弾く
    - I (D/Ionian): D-E-F#-G-A-B-C# → 明るい・安定
    - ii (Em/Dorian): E-F#-G-A-B-C#-D → 切ないけど希望
    - IV (G/Lydian): G-A-B-C#-D-E-F# → 浮遊・神秘
    - V (A/Mixolydian): A-B-C#-D-E-F#-G → 開放感
    - vi (Bm/Aeolian): B-C#-D-E-F#-G-A → 悲しい・内省
  - STEP 2: 感情→コード変換の実践
    - 「神秘的にしたい」→ IV(G) を強調する進行に変更
    - 「切なさを出したい」→ ii(Em) を増やす
    - 「安定感・安心」→ I(D) に早く解決する
  - STEP 3: As the Deer のコード進行をモード的に分析
    - 各セクションの「感情の流れ」をモードで解釈
    - コード差し替え実践: V→I を IV→I に変えるとどう変わるか
  - STEP 4: リハーモナイズ版 As the Deer を通し演奏
- ② 事後理論
  - モード = スケールの「スタート地点」を変えたもの
  - 5つのモードの特徴音（Lydian=#4, Mixolydian=b7, Dorian=b3+6, Aeolian=b3+b6）
  - ワーシップでの活用マップ: 感情 → モード → コード機能
- ③ 応用ドリル
  - 「慕い求めます」の各セクションにモード的な感情ラベルをつける
  - 同じ進行を「明るく」「切なく」「神秘的に」弾き分け（コード差し替えで）
- ④ 自分で組み合わせる
  - 新しいワーシップ曲のコード進行を渡し、モード的に解釈してリハーモナイズ

講師: 黒田メイン（モード理論）、瀬戸がTAB・実践面

**Step 2: コミット**

```bash
git add aspects/guitar/phase6-worship/lesson-24.md
git commit -m "feat: add L24 modes and chord character lesson"
```

---

## Task 4: L25 レッスンファイル作成

**Files:**
- Create: `aspects/guitar/phase6-worship/lesson-25.md`

**Step 1: L25 レッスン内容を作成**

`lesson-25.md` を作成。タイトル: **「slash chord & 経過コード — 進行を滑らかにする」**

素材: 礼拝曲（慕い求めます + As the Deer 両方使用）

構成:
- ① TABで弾く
  - STEP 1: Phase 2 復習 — slash chord の仕組み（L7 の知識を呼び戻す）
    - C/E（カポ2 → D/F#）の TAB と響き
  - STEP 2: ワーシップ3大パターンを弾く
    - パターン1: ベースライン下降（クリシェ）
      - C → C/B → Am → Am/G → F（カポ2: D → D/C# → Bm → Bm/A → G）
    - パターン2: ベース上昇（経過コード）
      - C → C/E → F（カポ2: D → D/F# → G）
    - パターン3: ペダルポイント
      - F/C → G/C → C（カポ2: G/D → A/D → D）
  - STEP 3: 慕い求めますに3大パターンを適用
    - ヴァースのC→G間にC/E を挿入
    - コーラスで下降クリシェを使用
  - STEP 4: As the Deer にも適用して通し演奏
- ② 事後理論
  - 判断ルール: ベース音が3度以上飛ぶ → 経過コード検討
  - なぜ滑らかに聞こえるか: 半音/全音のベース移動 = ヴォイスリーディング
  - Phase 2 L7-L8 との接続: 「満ちていく」のBm7/E も同じ原理
- ③ 応用ドリル
  - Key=G（カポなし）で同じ3大パターンを弾く（移調練習）
  - ベースラインだけを歌いながらコードを弾く練習
- ④ 自分で組み合わせる
  - コード進行を渡し、ベースラインを分析して経過コードを自分で入れる

講師: 瀬戸メイン、黒田が理論（ヴォイスリーディング）

**Step 2: コミット**

```bash
git add aspects/guitar/phase6-worship/lesson-25.md
git commit -m "feat: add L25 slash chords and passing chords lesson"
```

---

## Task 5: L26 レッスンファイル作成

**Files:**
- Create: `aspects/guitar/phase6-worship/lesson-26.md`

**Step 1: L26 レッスン内容を作成**

`lesson-26.md` を作成。タイトル: **「総合実践 — コード譜を見てリハーモナイズする」**

素材: 新しいワーシップ曲2-3曲（候補: 「主の愛が今」「God is Good」等、シンプルな4コード系）

構成:
- ① TABで弾く
  - STEP 1: 5ステップ・リハーモナイズ手順を紹介
    1. キー確認 → ダイアトニックコード把握
    2. セクション分け → ヴォイシング割り当て（L22）
    3. メロディーチェック → テンション追加判断（L23）
    4. 感情の流れ → モード的コード機能確認（L24）
    5. ベースライン確認 → 経過コード/slash chord 検討（L25）
  - STEP 2: 1曲目を先生がデモ — 手順を実演
    - 各ステップで「なぜそう判断したか」を解説
  - STEP 3: 2曲目をユーザーが自力でリハーモナイズ
    - コード譜だけ渡す → 自分で5ステップ適用
  - STEP 4: 先生のリハーモナイズと比較 → 違いを議論
- ② 事後理論
  - リハーモナイズに「正解」はない — 曲の文脈と自分の感性で判断
  - 「やりすぎ」の判断基準: テンション2つ以上連続 = やりすぎの可能性
  - ワーシップの原則: 会衆が歌いやすいことが最優先
- ③ 応用ドリル
  - 3曲目のコード譜で完全自力リハーモナイズ
  - 同じ曲を「シンプル版」と「おしゃれ版」の2バージョン用意する練習
- ④ 自分で組み合わせる
  - 次の礼拝で弾く曲を1曲選び、5ステップでリハーモナイズして持っていく

講師: 瀬戸メイン（実演）、黒田（比較分析）

**Step 2: コミット**

```bash
git add aspects/guitar/phase6-worship/lesson-26.md
git commit -m "feat: add L26 comprehensive reharmonization practice lesson"
```

---

## Task 6: CLAUDE.md カリキュラム表を更新

**Files:**
- Modify: `aspects/guitar/CLAUDE.md`

**Step 1: Phase 6 テーブルに L22-L26 を追加**

カリキュラムの Phase 6 テーブル（現在 L21 のみ）を以下に更新:

```markdown
### Phase 6: ワーシップバッキング（phase6-worship/）
教会のワーシップチームでアコギバッキングを担当するための実践フェーズ。

| # | ファイル | テーマ | 素材 |
|---|---------|--------|------|
| L21 | lesson-21.md | ワーシップバッキング入門 — カポ・おしゃれコード・ダイナミクス | 長沢崇史「慕い求めます」 |
| L22 | lesson-22.md | コードの「色替え」— 同じ機能、違う響き | As the Deer |
| L23 | lesson-23.md | テンション追加の判断 — いつadd9？いつsus4？ | 慕い求めます リハーモナイズ |
| L24 | lesson-24.md | モードで理解する「コードの性格」 | As the Deer リハーモナイズ |
| L25 | lesson-25.md | slash chord & 経過コード — 進行を滑らかにする | 慕い求めます + As the Deer |
| L26 | lesson-26.md | 総合実践 — コード譜を見てリハーモナイズする | 新曲2-3曲 |
```

Also update the カリキュラム header to say 全26レッスン・6フェーズ (was 全20レッスン・5フェーズ).

Also update ユーザーのレベル section:
- 次の課題 → update to reflect L22-L26 が追加されたこと

**Step 2: コミット**

```bash
git add aspects/guitar/CLAUDE.md
git commit -m "docs: update guitar CLAUDE.md with L22-L26 curriculum"
```

---

## Task 7: Notion ギター DB にレッスン登録 & 内容同期

**Files:** None (Notion operations only)

**Step 1: Notion ギター DB の既存レッスン一覧を確認**

```bash
bun run scripts/notion-list.ts --db guitar
```

L22-L26 のページが既に存在するか確認。

**Step 2: 存在しなければ新規作成**

各レッスンを `notion-add.ts --db guitar` で作成:
- L22: `Lesson 22: コードの「色替え」— 同じ機能、違う響き`
- L23: `Lesson 23: テンション追加の判断 — いつadd9？いつsus4？`
- L24: `Lesson 24: モードで理解する「コードの性格」`
- L25: `Lesson 25: slash chord & 経過コード — 進行を滑らかにする`
- L26: `Lesson 26: 総合実践 — コード譜を見てリハーモナイズする`

**Step 3: `/sync:lessons` でレッスン内容を Notion に同期**

レッスンファイルの全内容を Notion ページに反映する。
