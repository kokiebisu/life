# FOLIO 1次面接対策 — tracker

> 作成: 2026-06-07 / 面接: 今週中（6/8〜6/13）

## スプリント計画

### Phase 1: セットアップ（6/7）
- [x] ディレクトリ作成
- [x] 問題バンク設計
- [x] 初回セッション開始

### Phase 2: アルゴリズム練習（6/7〜6/9）

**目標: ソート系・配列操作をノーミスで書ける**

- [x] Bubble Sort（TypeScript実装）
- [x] Selection Sort（TypeScript実装）
- [ ] Merge Sort（TypeScript実装）※面接範囲外につきスキップ
- [ ] 二分探索
- [ ] 配列操作系（重複除去・グルーピング等）

### Phase 3: サービス実装練習（6/9〜6/11）

**目標: 「こういうもの作って」に即座に設計+実装できる**

- [x] TODO APIの実装（型定義→CRUD）
- [x] ページネーション付きリスト
- [x] ツリー構造操作（再帰）

### Phase 4: 本番想定（6/11〜面接前）

- [ ] タイムアタック（制限時間内に書ききる練習）
- [ ] AIなし・メモなしで解く
- [ ] 声に出しながら解く（面接では思考を口に出す）

---

## 面接情報

- **日時:** 今週中（6/8〜6/13）
- **形式:** 1次面接（技術コーディング）
- **言語:** TypeScript
- **難易度:** bubble sort 程度（競プロレベルではない）
- **制約:** AIなし
- **追加質問:** AI活用方法・使用技術スタック

---

## 日次ログ

### 2026-06-07
今日やったこと:
- FOLIO 対策ディレクトリのセットアップ
- 初回セッション開始
詰まったところ:
- (空欄)
明日やること:
- Bubble Sort → Selection Sort → Merge Sort の順で実装練習

### 2026-06-09
今日やったこと:
- Selection Sort 実装・レビュー（`j = i+1`、後置`++`の確認）
- TODO CRUD 実装（バグ3つ発見・修正）
- ページネーション付き getTodos 実装（slice に任せるシンプルな書き方）
- ツリー構造フラット化（再帰 + クロージャパターン、一発正解）
詰まったところ:
- `deleteTodo` の返り値ロジック（`===` と `!==` の逆転）
- ページネーションで `Math.min` を使う必要がないことに気づくまで
明日やること:
- タイムアタック（AIなし・メモなしで制限時間内に書ききる）
- 声に出しながら解く練習
チェックできた項目数: 5 / 8

#### 続き（午前）
追加でやったこと:
- sumTree（再帰 + reduce 別解）一発正解
- Stock getTotalValue / filterByValue（`>=` の修正のみ）
- getTopHoldings（`[...arr].sort()` + `slice(0, n)` の修正）
- groupByProduct（`?? 0` パターン）一発正解
詰まったところ:
- `getTopHoldings` で `slice(0, 2)` とハードコード（n を使い忘れ）
- `sort()` が元配列を破壊することへの意識
チェックできた項目数: 9 / 12

#### 続き（午後）
追加でやったこと:
- findDuplicates（hashmap カウントパターン、Set 2つ別解も確認）
- executeOrder 仕様書形式（shallow copy・存在しない銘柄・`>=` vs `>` の3バグ修正）
- processTransaction 仕様書形式（日付比較・取引件数境界値・出金上限累計チェック）
- VIP仕様変更対応（`isWithinWithdrawalLimit` 関数抽出・`Account.isVip` 追加）
- コードレビュー形式の説明練習（early return・DDD設計・throw vs return・金融境界値リスク）
詰まったところ:
- `getDay()` vs `getDate()` の混同（曜日 vs 日）
- shallow copy（`holdings` / `transactions` の参照が残る問題）
- 出金上限チェックに当日 amount を含め忘れ
チェックできた項目数: 13 / 16

#### 続き（夕方）
追加でやったこと:
- applyCoupon 仕様書形式（副作用禁止 vs カウント増加の矛盾検出 ✅・`usedCount + 1` vs `usedCount++` の違い・`throw` vs `createError` の使い分け・`Math.max(0, ...)` で負値防止）
- シニアエンジニアバーの再確認（コードを書いた後に自分でリスク・トレードオフを口に出す練習）
詰まったところ:
- `prev += curr.price * curr.quantity` の `+=` を `+` に直す（reduce の戻り値）
- `throw new Error` のままにして `createError` を使い忘れ（ユーザーエラーなのに throw）
- `finalAmount = cartTotalAmount - discountAmount` で負値対策なし（`Math.max(0,...)` 忘れ）
チェックできた項目数: 17 / 20

#### 続き（夜）
追加でやったこと:
- 定期積立サービス 仕様書形式（new Date UTC問題・年またぎ・翌月末日 +2 オフセット・getMonth() 0始まり・throw の位置・toLocaleString vs テンプレートリテラル）
- JavaScript落とし穴まとめ（浮動小数点・Date破壊的変更・Number.isNaN vs isNaN・`??` vs `||`）
- ミドルウェアと throw vs createError の設計説明練習
詰まったところ:
- `Math.min` の lastDay 計算で `+1` と `+2` を逆の行に当ててしまった
- `throw` の位置が複数回指摘が必要だった（一番上に書く習慣が必要）
- `toLocaleString('YYYY-MM-DD')` はロケールコードではないことを見落とした
明日やること:
- 面接本番（2026-06-10）
- 書き終えたら「気になっているのは〇〇」を口に出す
チェックできた項目数: 20 / 25
