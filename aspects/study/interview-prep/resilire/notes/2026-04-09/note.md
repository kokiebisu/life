---
notion_id: e091be65-e090-4956-acb1-274fab6defc9
date: 2026-04-09
category: interview-prep
---

# Day 1: Go Tour Basics・interface

## Interface

- structに対して行えるbehaviorを定義したもの（正確には「型」が持つべきメソッドの集合）
- `implements` を明示しなくていい → duck typing
- interfaceで定義されたメソッドをすべて実装していれば、自動的にそのinterfaceを満たす

```go
type Sounder interface {
    Sound() string
}

type Dog struct {
    Name string
}

func (d *Dog) Sound() string {
    return "woof"
}

// Dog は Sounder を implements している（宣言不要）
func makeNoise(s Sounder) {
    fmt.Println(s.Sound())
}
```

## 値レシーバ vs ポインタレシーバ

- 値レシーバ `(d Dog)`: コピーを渡す → 元のインスタンスに変更が反映されない（immutable）
- ポインタレシーバ `(d *Dog)`: 本物を渡す → 元のインスタンスに変更が反映される（mutable）
- 基本はポインタレシーバで統一する（メモリ効率 + struct状態を変更できる）
- 同じstructのメソッドは統一する（値とポインタ混在はinterfaceの実装に影響する）

```go
// ポインタレシーバで実装 → &Dog でしかinterfaceを満たさない
func (d *Dog) Sound() string { return "woof" }

var s Sounder = Dog{"Rex"}   // ❌ コンパイルエラー
var s Sounder = &Dog{"Rex"}  // ✅
```

## Typed nil 問題

- typed nil = 型はある、値が nil の状態
- Goのinterfaceは内部で `(型情報, 値)` のペアを持つ
- `nil` interface は `(nil, nil)` のときだけ
- `*MyError` 型の nil を `error` interface で返すと → `(*MyError, nil)` になり non-nil

```go
func getError() error {
    var e *MyError = nil  // typed nil: (型: *MyError, 値: nil)
    return e              // interfaceに包まれる → (*MyError, nil)
}

err := getError()
fmt.Println(err == nil) // false ← 型情報が入っているから

// 正しい書き方
func getError() error {
    return nil  // (nil, nil) → 本当の nil
}
```

---

## DB: 正規化

### 3段階まとめ

| 段階 | 問題のパターン | 解決 |
|------|-------------|------|
| 1NF | 1カラムに複数値 `tags = "Go,Python"` | 別テーブルに分ける |
| 2NF | **複合PKの一部にしか従属しないカラム** | 独立したテーブルに分ける |
| 3NF | **非キー列が別の非キー列に従属** | 従属先を独立したテーブルに分ける |

### 間違えやすいポイント：2NF vs 3NF

**2NF違反は「複合主キー」のときだけ発生する。**

```sql
-- 2NF違反（PK = order_id + product_id の複合）
order_items: order_id, product_id, product_name, quantity
--                                 ↑ product_id だけに従属 → 2NF違反

-- 3NF違反（PK = order_id の単一）
orders: order_id, product_id, product_name, quantity
--                非キー列    → 非キー列に従属 → 3NF違反
-- product_id（非キー）→ product_name（非キー）
```

**単一PKの場合、product_name の問題は 3NF違反（2NF違反ではない）。**

### 3NF違反の見つけ方

「非キー列 A → 非キー列 B」の矢印が存在するか？

```
employees: id, department_id, department_name, salary

department_id（非キー）→ department_name（非キー）← 3NF違反
id → department_id, salary は OK（PKから直接従属）
```

解決:
```sql
departments: id, name
employees:   id, department_id, salary  -- FKだけ持つ
```

### N+1 問題

**定義:** リストを取得 → 各要素に対して別テーブルを追加クエリ → 1+N クエリ

```sql
-- ❌ N+1
SELECT * FROM orders;                          -- 1クエリ
SELECT * FROM users WHERE id = 1;              -- N回繰り返す
SELECT * FROM users WHERE id = 2;
...

-- ✅ JOIN（1〜2テーブルの結合）
SELECT orders.*, users.name
FROM orders
JOIN users ON orders.user_id = users.id;

-- ✅ Eager Loading / IN句（ネストが深い・行爆発が心配な場合）
SELECT * FROM orders;
SELECT * FROM users WHERE id IN (1, 2, 3...);  -- まとめて取得
-- アプリ側でマージ
```

**JOIN vs Eager Loading の使い分け:**
- テーブル2〜3個・条件シンプル → JOIN
- ネストが深い / JOINで行が爆発する → Eager Loading（IN句）

**検出方法:**
- 開発: ORMのクエリログ（同じSELECTがN回出ていないか）
- 本番: Datadog APM / PostgreSQLのスロークエリログ

**ORM と sqlc:**
- Active Record / GORM → 便利だがN+1が起きやすい（includes/Eager Loadで解決）
- sqlc（Resilireが使用）→ SQLを先に書いてGoコードを生成 → 意図しないN+1が起きにくい

---

## コーディング課題

```go
package main

import "fmt"

type Animal interface {
    Sound() string
}

type Dog struct {
    Name string
}

type Cat struct {
    Name string
}

// ポインタレシーバ → &Dog でしか Animal を満たさない
func (d *Dog) Sound() string {
    return "woof"
}

// 値レシーバ → Cat でも &Cat でも Animal を満たす
func (c Cat) Sound() string {
    return "meow"
}

func makeNoise(a Animal) {
    fmt.Println(a.Sound())
}

func main() {
    dog := &Dog{"Rex"}
    cat := Cat{"Mimi"}
    makeNoise(dog)
    makeNoise(cat)
}
// 出力:
// woof
// meow
```

## ❓ 自分への質問（コーネル式キュー）

1. Goのinterfaceにおける値レシーバとポインタレシーバの違いは？interface実装にどう影響するか？
2. typed nil 問題とは何か？なぜ `return nil` と明示すべきか？
3. 第2正規形違反と第3正規形違反の見分け方は？具体例で説明せよ
4. N+1問題の定義と、JOINとEager Loading（IN句）の使い分け基準は？

## 🔁 復習で詰まったところ

### 2026-04-23
- **Q: ⭕ 完璧の Day 1 でも、面接で口頭説明するときの補足ポイントは？（値レシーバ vs ポインタレシーバの interface 実装影響）**
  - 詰まった内容: ⭕ 完璧として答えられたが、値レシーバ/ポインタレシーバの interface 実装影響を答えに書き忘れていた
  - 正解ポイント: ポインタレシーバ実装 → `&インスタンス` のみ interface を満たす。値レシーバ実装 → `インスタンス` も `&インスタンス` も両方満たす。混在を避けて統一する

### 2026-04-10
- **Q: 99.9%（スリーナイン）と 99.99%（フォーナイン）のダウンタイムを年間・月間で言える？Resilire 文脈ではどちらを目指す？**
  - 詰まった内容: 数字を即答できなかった
  - 正解ポイント: 99.9% は年間約8.7時間・月43分（一般的なSaaS）、99.99% は年間約52分・月4.3分（決済・医療・インフラ系）。Resilire は災害対応システムなので「99.99% を目指す設計」と言うと刺さる
- **Q: QPS 計算で平均 QPS に何倍を掛けてピーク時を見積もる？**
  - 詰まった内容: ピーク係数を即答できなかった
  - 正解ポイント: 平均 QPS に 2〜3倍を掛けてピーク時を見積もる。例: 平均100 QPS → 「ピーク時300 QPSで設計します」と言う
- **Q: システム設計5ステップのうち 4番目と 5番目は？それぞれ何に注意する？**
  - 詰まった内容: 4・5番目を即答できなかった（1〜3 は要件確認 → スケール感 → 全体設計まで言えた）
  - 正解ポイント: 4. 深掘り（自分が一番語れる部分から入る）、5. ボトルネック（弱点と改善案をセットで言う）
- **Q: sqlc と GORM で N+1 問題が起きにくいのはどっち？理由は？**
  - 詰まった内容: 違いを明確に説明できなかった
  - 正解ポイント: sqlc。SQL を先に書いて Go コードを自動生成するため、型安全で N+1 に気づきやすい。GORM は ORM 経由で Go コードからクエリを書くため N+1 が起きやすい。Resilire は sqlc を使用
- **Q: Go で map のキー存在確認の正しい書き方は？`m["key"]` だけではダメな理由を説明できる？**
  - 詰まった内容: 2値形式の知識があやふや。「存在しないキーはコンパイルエラーになる」と誤解
  - 正解ポイント: 2値形式 `v, ok := m["key"]` を使う。`ok` が `true` なら存在、`false` なら存在しない。存在しないキーへのアクセスはコンパイルエラーにも例外にもならず、ランタイムでゼロ値を返す（Python/JS とは異なる）
