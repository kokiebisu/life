# fukushuu 改修 — pending_questions による「詰まりだけ集中再出題」 — Design Spec

## 背景

`/fukushuu` スキルで忘却曲線ベースのスペーシドリピティション復習を運用しているが、**fuzzy ループ**という構造的問題が起きている。

### 現状データ（review-log.json, 2026-04-28 時点）

- 全 20 ノート中、**15 件が `review_count == 0`**（一度も「完璧」を取れていない）
- confidence の分布: ⭕ perfect 5 / 🔺 fuzzy 10 / ❌ forgot 5
- **半数（10件）が 🔺 fuzzy で滞留**

### 根本原因

現状の判定後アクション仕様:

| 判定 | review_count | interval_days |
|---|---|---|
| ⭕ perfect | +1 | テーブル進行 (1→3→7→14→30→60) |
| 🔺 fuzzy | **±0** | `max(interval_days, 1)` = **据え置き** |
| ❌ forgot | 0 にリセット | 1 |

🔺 を取ると review_count も interval も進まない → 翌日また同じ全質問が来る → また 🔺 → ... という**永遠の1日間隔ループ**。

加えて、**復習対象は毎回ノート全体の 3〜5 問**を再出題している。前回 ⭕ だった質問も再度問う構造になっており、「できたところを毎回聞かれる」という非効率がある。

## ゴール

1. **fuzzy ループから抜ける構造を作る** — 詰まった質問だけが残り、全部 ⭕ になればノート全体として ⭕ 進行する
2. **既にできている質問は再度問わない** — 認知科学的にも「retrieval practice の対象は弱い箇所に集中させる」のが定石
3. **既存 review-log.json との互換性を保つ** — 段階的マイグレーション

## ノンゴール

- スケジュールアルゴリズム（1→3→7→14→30→60）の数式自体は**変えない**
- `mastery` のような float ベースの新スコアは導入しない（pending 仕組みで十分なため）
- 出題の角度切り替え・面接シミュレーションモードなど別方向の改善は本 spec の対象外（別 spec へ切り出す）

## 設計

### スキーマ変更: `aspects/study/review-log.json`

各エントリに `pending_questions: string[]` を追加する。既存エントリは初期値 `[]`。

```json
{
  "aspects/study/software-engineering/達人に学ぶDB設計徹底指南書/ch02.md": {
    "last_reviewed": "2026-04-24",
    "interval_days": 1,
    "review_count": 0,
    "confidence": "fuzzy",
    "pending_questions": [
      "B-Tree のノード分割が起こる条件を3つ挙げて",
      "カーディナリティが高くてもインデックスが効かない例を1つ"
    ]
  }
}
```

### 出題ロジック（`skills/fukushuu/SKILL.md` Step 4 改訂）

各ノートを処理する際:

1. ノートを Read する
2. review-log.json から該当ノートの `pending_questions` を取得
3. **分岐**:
   - **`pending_questions` が空でない** → そのリストの質問だけを 1 問ずつ出題する。ノートの `❓ 自分への質問` セクションは参照しない
   - **`pending_questions` が空** → 通常通り `❓ 自分への質問` を出題（既存ロジックそのまま、カテゴリに応じた角度切り替えも従来通り適用）
4. ユーザーが 1 問ずつ回答 → Claude が ✅ / ⚠ / ❌ で内部判定（既存ロジック）
5. 全問終了後、ノート全体の総合判定（既存ロジック: 全 ✅ → ⭕、⚠ あり → 🔺、❌ あり → ❌）

### 判定後の `pending_questions` 更新ルール

| 総合判定 | pending_questions 更新 | review_count | interval_days | confidence |
|---|---|---|---|---|
| ⭕ perfect（全問 ✅） | **`[]` にクリア** | +1 | テーブル進行 | "perfect" |
| 🔺 fuzzy（⚠ あり、❌ なし） | **⚠ と判定された質問だけ**を保存 | 据え置き | `max(interval_days, 1)` | "fuzzy" |
| ❌ forgot（❌ あり） | **⚠ + ❌ と判定された質問**を保存 | 0 | 1 | "forgot" |

### 「pending を消化した」ときの意味論

- pending_questions に 2 問が残っているノートを次回復習 → その 2 問だけ出題
- 両方 ✅ なら → ⭕ perfect として `pending_questions = []`、review_count +1、間隔伸びる
- 1 問だけ ✅、もう 1 問が ⚠ なら → 🔺 fuzzy で `pending_questions = [⚠ の 1 問]`、review_count 据え置き
- どんどん絞り込まれて、最後の 1 問が ✅ になればノート全体として進行する

これにより、**「全部解決すれば前進、残ったものだけ次回」**という挙動が自然に得られる。

### Step 5 review-log.json 更新ロジック

既存仕様に **`pending_questions` 更新の 1 行を追加**する:

```
- last_reviewed: 今日の日付（JST）
- review_count: 上記テーブル通り
- interval_days: 上記テーブル通り
- confidence: 上記テーブル通り
- pending_questions: 上記テーブル通り  ← 新規
```

### マイグレーション

初回 fukushuu 起動時、Step 2（review-log.json 読み込み）の直後に**自動マイグレーション**を実行:

```typescript
for (const [path, entry] of Object.entries(log)) {
  if (!('pending_questions' in entry)) {
    entry.pending_questions = [];
  }
}
```

- 一度書き戻せば以降は不要（次回以降 `pending_questions` は必ず存在する）
- 既存の 20 エントリは `pending_questions: []` で初期化される
- マイグレーション後の最初の復習では、すべて pending 空 → 通常通り全問出題 → 詰まりがあれば pending に保存される

### Step 6（セッションサマリー Notion 書き出し）への影響

セッションサマリー本文（`📝 ノート` セクション内のノート別判定）に、**pending_questions の件数を補足表示する**（任意の追加情報、必須ではない）。

例:

```markdown
### 1件目 ch02 — 🔺 あいまい

**詰まり1: B-Tree のノード分割条件**
- ユーザー回答: ...
- 正解: ...

**詰まり2: カーディナリティとインデックスの関係**
- ...

**正解した質問:**
- 主キーの定義 ✅

→ 次回 pending: 2 問
```

`📝 ノート` テーブルの「判定」列の隣に「次回 pending」列を追加するのも可（必須ではない）。

## エッジケース

### 1. ノートに `❓ 自分への質問` セクションがない場合

既存の Step 4「コーネル式キューがないノートの場合」ロジックがそのまま動く。Claude が動的にキューを生成し、それで出題する。詰まった質問は pending_questions に保存される。

**注意:** 動的生成キューも保存対象。次回復習で pending が残っていれば、その動的生成された質問テキストを再出題する。

### 2. 質問テキストの文言ブレ

pending_questions は質問テキストをそのまま文字列で保存する。ノート側の `❓ 自分への質問` セクションがユーザーによって後日編集されても、pending 側は独立して残り続ける（出題は pending 側を優先）。

これは仕様。ノート側のキューと pending が乖離しても、pending を完了させればクリアされて再度ノート側のキューが使われる。

### 3. pending を消化したあとの「本当の理解」確認

pending を全部 ✅ で消化 → ⭕ perfect として進行する。**ただし、これは「pending として保存された質問群に対する熟達」を意味する**。ノート全体の理解が完璧かは、次回（mastery 進行後）の通常出題で別角度の質問にぶつけたときにわかる。

これは本 spec ではスコープ外。将来 🥈「質問の角度変更」改修（別 spec）で対応する。

### 4. 既存エントリの review_count が高いノートで pending が出た場合

例: review_count == 5（30日間隔）のノートで久々に復習したら 🔺 になり、pending が 1 問残った場合。

- review_count 据え置き = 5、interval_days = max(30, 1) = 30
- 次回は 30 日後、pending の 1 問だけが出題される

これは仕様。「30日の自信があるノートでも、たまたま忘れた 1 問だけ次回再確認する」という動きになる。期日は据え置きで OK。

### 5. 同日二重復習禁止との関係

既存ルール「`last_reviewed == today` のエントリは対象外」はそのまま維持。pending が残っていても、その日のうちに再出題はしない。翌日以降の通常スケジュールで対象になる。

## 影響範囲

### 変更ファイル

- `skills/fukushuu/SKILL.md` — Step 2 / Step 4 / Step 5 / Step 6 を改訂（マイグレーション・出題分岐・pending 更新ルールの追記）
- `aspects/study/review-log.json` — 初回マイグレーションで `pending_questions: []` を全エントリに追加

### 変更しないファイル

- `skills/study/SKILL.md` — study 側は本 spec の対象外
- `aspects/study/**/*.md` — ノート側の `❓ 自分への質問` セクションには手を加えない
- スケジュールテーブル `interval_map` — 数値は変更しない

## テスト観点

実装後、以下のシナリオで動作確認する:

1. **初回マイグレーション** — 既存 20 エントリすべてに `pending_questions: []` が追加されること
2. **pending 空での復習** — 通常通り `❓ 自分への質問` から出題されること
3. **pending あり での復習** — pending リストの質問だけが出題され、ノート側のキューは使われないこと
4. **⭕ 判定で pending クリア** — `pending_questions: []` になり、review_count が +1 されること
5. **🔺 判定で pending 更新** — ⚠ と判定された質問だけが pending に残ること
6. **❌ 判定で pending 更新** — ⚠ + ❌ の質問が pending に残り、review_count が 0 にリセットされること
7. **絞り込みフロー** — 5問中3問詰まり → 次回3問出題 → 1問正解 → 次回2問出題 → ... と段階的に減ること
8. **同日二重復習禁止** — pending が残っていても、`last_reviewed == today` なら対象外になること

## マイルストーン

1. `skills/fukushuu/SKILL.md` の Step 2 / 4 / 5 / 6 を改訂
2. 改訂後の skill で fukushuu を一度走らせ、20 エントリにマイグレーションが適用されることを確認
3. 1 件のノートで通常出題 → 詰まり保存 → 翌日 pending 出題 → 消化のフローを実機検証
4. README/CLAUDE.md 等への波及確認（基本的に不要）
