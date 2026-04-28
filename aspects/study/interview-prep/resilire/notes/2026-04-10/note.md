---
notion_id: 9c8f7282-754a-4ff5-9552-3f61387fd926
date: 2026-04-10
category: interview-prep
---

# Day 2: interface設計パターン・struct・システム設計URLショートナー

## Interface 設計パターン

### ① テスト可能な設計（依存注入）

```go
// ❌ 具体的な型に依存 → テストで本物のAPIを叩く
type Recommender struct {
    client *http.Client
}

// ✅ interfaceに依存 → モックを差し込める
type MLClient interface {
    Fetch(ctx context.Context, userID string) ([]Segment, error)
}

type Recommender struct {
    ml MLClient  // 本物でもモックでもOK
}
```

**ポイント:** structのフィールドにinterfaceを持たせる = 依存注入。本番とテストで実装を差し替えられる。

### ② 小さいinterfaceを組み合わせる

```go
type Reader interface { Read(p []byte) (n int, err error) }
type Writer interface { Write(p []byte) (n int, err error) }
type ReadWriter interface {
    Reader  // 埋め込みで合成
    Writer
}
```

**ポイント:** Goのイディオムは「1〜2メソッドの小さいinterface」。モックが作りやすい。

### ③ interface vs struct

- `interface` = 「何ができるか」の約束（メソッドの集合）
- `struct` = 「何を持つか」のデータ構造と実装

```go
type Storer interface {
    Save(key, value string) error  // 約束
}

type MockStorer struct{}  // 実体
func (m *MockStorer) Save(key, value string) error {
    return nil  // 実装
}
```

**PKにはインデックスが自動で貼られる**（PRIMARY KEY = ユニーク制約 + インデックス自動作成）

## Struct 埋め込み（Embedding）

```go
type Animal struct {
    Name string
}

func (a *Animal) Breathe() {
    fmt.Println(a.Name, "が呼吸する")
}

type Dog struct {
    Animal  // 埋め込み
    Breed string
}

dog := Dog{Animal: Animal{Name: "Rex"}, Breed: "柴犬"}
dog.Breathe()  // Animalのメソッドをそのまま使える
dog.Name       // フィールドも直接アクセスできる
```

**継承との違い:**
- 継承: `Dog is-a Animal`（DogはAnimalでもある）
- 埋め込み: `Dog has-a Animal`（**機能の委譲**。DogはAnimalではない）
- Goでは `Dog` を `Animal` 型として扱えない

---

## システム設計: URLショートナー

### 要件（STEP 1）
- DAU 100万・1ユーザー1日10回短縮
- リダイレクトはリアルタイム
- 可用性: 99.9%
- 一貫性: 結果整合性OK（数秒の遅延許容）

### スケール計算（STEP 2）
- 書き込み: 100万 × 10 / 86400 ≈ **100 QPS**（ピーク300）
- 読み取り: 100万 × 100 / 86400 ≈ **1000 QPS**（ピーク3000）
- 読み取り:書き込み = **10:1** → 読み取りに最適化が必要

### 全体設計（STEP 3）

```
クライアント → [Redis キャッシュ] → APIサーバー → DB
```

**短縮URL生成アルゴリズム:**
- base62（a-z, A-Z, 0-9）で6文字ランダム生成
- 62^6 ≈ 568億通り → 十分
- 衝突時は再生成

**キャッシュ戦略:**
- Read-through（キャッシュミス時にキャッシュがDBから取得）
- TTL: 24時間〜7日（URLは一度作ったら変わらないため長めでOK）
- Eviction Policy: LRU（アクセス頻度の高いURLを残す）

### DBスキーマ（STEP 4）

```sql
CREATE TABLE urls (
    short_url VARCHAR(6) PRIMARY KEY,  -- PKなのでインデックス自動作成
    original_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
)
```

- `original_url` にインデックス不要（ランダム生成で重複チェックしない方針 → `original_url` で検索しない）
- 重複チェックも `short_url`（PK）で引くので自動インデックスで解決

### ボトルネックと改善（STEP 5）
- **ボトルネック:** DB（読み取り3000 QPS が集中）
- **改善:** Read Replica（Master-Slave構成）で読み取りを分散 + Redisキャッシュでそもそものリクエストを減らす

## ❓ 自分への質問（コーネル式キュー）

1. Goでinterfaceを使った依存注入（DI）のパターンを説明せよ。テスタビリティにどう寄与するか？
2. structの埋め込み（Embedding）と継承の違いは？Goではなぜ「has-a」なのか？
3. URLショートナーの読み取り:書き込み比が10:1のとき、どう最適化するか？

## 🔁 復習で詰まったところ

### 2026-04-28 - ❌ 忘れた
- **Q: Go で「外部 ML API を呼ぶ Recommender 型」をノート見ずに書いて。MLClient を interface としてモック差し込み可能に + テスタビリティのメリット4つを挙げよ。**
  - 詰まった内容: 1回目のコードは Recommender まで interface 化し MockRecommender を作る誤設計（DI の意図とズレ）+ コンパイルエラー2件（Fetch の引数型抜け / Recommender interface の戻り値不一致）。2回目で struct Recommender { ml MLClient } の正しい DI 形に修正できたが、Fetch に ctx を渡し忘れ + 戻り値ミスマッチが残った。テスタビリティのメリット4つは「忘れた」と即答
  - 正解ポイント: DI の典型は「呼び出される側だけ interface 化」。`type Recommender struct { ml MLClient }` で interface フィールド経由で依存注入、本番は RealMLClient・テストは MockMLClient を差し替え。MLClient.Fetch には ctx を渡してキャンセル/タイムアウト伝播。メリット4つ = (1) 本物 API を叩かない（課金/レート制限回避）、(2) エッジケース再現（エラー・タイムアウト・空配列を意図的に返せる）、(3) 決定的（外部 API 変動で flaky にならない）、(4) 速い（ネットワーク往復ゼロ → CI 高速化）

### 2026-04-23
- **Q: interface を使った DI パターンで、struct フィールドに interface を持たせる実装と、テスタビリティのメリット4つを挙げられる？**
  - 詰まった内容: 「struct フィールドに interface を持たせる」という実装パターンを言えなかった。テスタビリティのメリット4つも言えなかった
  - 正解ポイント: パターンは `type Recommender struct { ml MLClient }` のように interface 型のフィールドを持たせる。メリットは (1) 本物の API を叩かない、(2) エッジケース（エラー・タイムアウト）を再現できる、(3) 決定的（外部 API の変動に左右されない）、(4) 速い（ネットワーク往復なし → CI 高速化）
- **Q: 埋め込み（embedding）と継承の違いを、型互換性の観点から正しく説明できる？**
  - 詰まった内容: 「埋め込みは interface を実装しているにとどまる、継承はプロパティの継承も含む」と回答（誤り）。埋め込みも**メソッド・フィールド両方アクセスできる**（委譲）
  - 正解ポイント: 違いは**型の互換性**。継承は `Dog is-a Animal` で Dog を Animal 型として**扱える**。埋め込みは `Dog has-a Animal` で Dog を Animal 型として**扱えない**。Go が has-a を選んだ理由は fragile base class 問題回避と「合成 \> 継承」の思想

### 2026-04-10
- **Q: PK に追加でインデックスを貼る必要がある？理由は？**
  - 詰まった内容: PK が自動でインデックスを持つことを忘れていた
  - 正解ポイント: 不要。PRIMARY KEY = ユニーク制約 + インデックス自動作成のため、追加でインデックスを貼る必要なし
- **Q: base62 で6文字ランダム生成すると何通り作れる？**
  - 詰まった内容: 計算式と桁感を即答できなかった
  - 正解ポイント: base62（a-z, A-Z, 0-9）で6文字 → 62^6 ≈ 568億通り。衝突時は再生成
- **Q: 短縮URL生成で「ハッシュ生成」と「ランダム生成」の使い分け基準は？（bit.ly はどっち？）**
  - 詰まった内容: 使い分け基準を即答できなかった
  - 正解ポイント: 「同じURLを同じ短縮にしたい」場合 → ハッシュ。一般的（bit.ly 含む）→ ランダム
- **Q: キャッシュTTLの判断基準は？URLショートナーの推奨TTLは？**
  - 詰まった内容: 判断プロセスがあやふや
  - 正解ポイント: データが変わらない → TTLを長くできる（24時間〜7日）。データが頻繁に変わる → TTL短く（数分〜1時間）。URLショートナーは「一度作ったら変わらない」→ 長めでOK
- **Q: キャッシュスタンピードとは？MUST で覚える対策は？**
  - 詰まった内容: 用語と対策を知らなかった
  - 正解ポイント: キャッシュが落ちると全リクエストが DB に流れて DB も落ちる連鎖障害。対策はキャッシュクラスターで冗長化
